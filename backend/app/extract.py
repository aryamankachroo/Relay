import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from time import monotonic

from app.clock import aware, now as utcnow

from app.catalog import BOOKSHELF_TOOLS, is_bookshelf, match_catalog, mentioned_items
from app.config import backboard_api_key, backboard_model, gemini_api_key, gemini_model
from app.models import CatalogItem

log = logging.getLogger(__name__)

GEMINI_ATTEMPTS = 2
EXTRACTION_DEADLINE_SECONDS = 8.0
_deadline: ContextVar[float | None] = ContextVar("extraction_deadline", default=None)

EXTRACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["intent", "items", "window_start", "window_end", "area"],
    "properties": {
        "intent": {"type": "string", "enum": ["project", "need", "offer"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "quantity"],
                "properties": {
                    "name": {"type": "string"},
                    "quantity": {"type": "integer"},
                    "optional": {"type": "boolean"},
                },
            },
        },
        "window_start": {"type": ["string", "null"]},
        "window_end": {"type": ["string", "null"]},
        "area": {"type": ["string", "null"]},
    },
}
MAX_PROJECT_TOOLS = 8
MAX_TOOL_NAME = 40
CONFIRM_YES = {"yes", "y", "confirm", "ok", "okay", "accept", "yep", "yeah"}
CONFIRM_NO = {"no", "n", "nope", "decline", "cancel"}
WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


@dataclass
class Extraction:
    intent: str
    item_ids: list[str]
    quantity: int
    window_start: datetime | None
    window_end: datetime | None
    area: str | None
    extra_names: list[str] = field(default_factory=list)


def extract_message(
    text: str,
    catalog: list[CatalogItem],
    now: datetime | None = None,
    deadline_seconds: float = EXTRACTION_DEADLINE_SECONDS,
) -> Extraction:
    moment = now or utcnow()
    answer = _yes_no(text)
    if answer is not None:
        return answer
    token = _deadline.set(monotonic() + deadline_seconds)
    try:
        gemini = _from_gemini(text, catalog, moment) if _remaining() > 0 else None
        if gemini is not None:
            return gemini
        backboard = _from_backboard(text, catalog, moment) if _remaining() > 0 else None
        if backboard is not None:
            return backboard
        return _fallback(text, catalog, moment)
    finally:
        _deadline.reset(token)


def _remaining() -> float:
    deadline = _deadline.get()
    if deadline is None:
        return EXTRACTION_DEADLINE_SECONDS
    return deadline - monotonic()


def _yes_no(text: str) -> Extraction | None:
    normalized = re.sub(r"[^a-z\s]", "", text.lower()).strip()
    if normalized in CONFIRM_YES:
        return Extraction("confirm_yes", [], 1, None, None, None)
    if normalized in CONFIRM_NO:
        return Extraction("confirm_no", [], 1, None, None, None)
    return None


def _fallback(text: str, catalog: list[CatalogItem], now: datetime) -> Extraction:
    window = _window(text, now)
    area = _area(text)
    quantity = _quantity(text)

    bookshelf = is_bookshelf(text)
    mentioned = [item.id for item in mentioned_items(text, catalog)]
    if re.search(r"\bi have\b|\bto give\b|\bgive away\b|\boffering\b", text.lower()):
        item_ids = mentioned[:1]
        return Extraction("offer", item_ids, quantity, window[0], window[1], area)
    if re.search(r"\bi need\b|\bi want\b", text.lower()) and not bookshelf:
        if len(mentioned) > 1:
            return Extraction("project", mentioned, 1, window[0], window[1], area)
        return Extraction("need", mentioned[:1], quantity, window[0], window[1], area)
    project_words = r"\b(building|build|making|project|fixing|fix|repairing|repair|replacing|replace|installing|install)\b"
    if bookshelf or re.search(project_words, text.lower()):
        item_ids = list(BOOKSHELF_TOOLS) if bookshelf else mentioned
        return Extraction("project", item_ids, 1, window[0], window[1], area)
    if mentioned:
        return Extraction("need", mentioned[:1], quantity, window[0], window[1], area)
    return Extraction("unknown", [], 1, None, None, None)


def _prompt(text: str, catalog: list[CatalogItem]) -> str:
    names = ", ".join(item.name for item in catalog)
    return (
        "Turn this neighborhood-sharing message into JSON matching this schema exactly. "
        f"{json.dumps(EXTRACTION_SCHEMA)} "
        f"The catalog is: {names}. "
        "For a need or offer, name only items from the catalog. "
        f"For a project, list the tools the job needs, at most {MAX_PROJECT_TOOLS}: "
        "use the exact catalog name when the tool is in the catalog, "
        "otherwise a short plain tool name. "
        "Use null for unknown window or area. quantity is a positive integer.\n"
        f"Message: {text}"
    )


def _from_gemini(text: str, catalog: list[CatalogItem], now: datetime) -> Extraction | None:
    key = gemini_api_key()
    if not key or _remaining() <= 0:
        return None
    prompt = _prompt(text, catalog)
    try:
        from google import genai
    except Exception as exc:
        log.warning("Gemini client failed: %s: %s", type(exc).__name__, exc)
        return None
    for attempt in range(1, GEMINI_ATTEMPTS + 1):
        remaining = _remaining()
        if remaining <= 0:
            log.warning("Gemini skipped because the extraction deadline was exhausted")
            return None
        try:
            client = genai.Client(
                api_key=key,
                http_options={"timeout": max(1, int(remaining * 1000))},
            )
            response = _call_within_budget(
                lambda: client.models.generate_content(
                    model=gemini_model(),
                    contents=prompt,
                    config={
                        "response_mime_type": "application/json",
                        "response_schema": EXTRACTION_SCHEMA,
                    },
                ),
                remaining,
            )
        except Exception as exc:
            log.warning("Gemini attempt %d failed: %s: %s", attempt, type(exc).__name__, exc)
            continue
        if response is None or _remaining() <= 0:
            log.warning("Gemini reply arrived after the extraction deadline")
            return None
        payload = _parse_json(response.text or "")
        if isinstance(payload, dict):
            parsed = _extraction_from_payload(payload, text, catalog, now)
            if parsed is not None:
                return parsed
        log.warning("Gemini attempt %d gave an unparseable reply: %.200r", attempt, getattr(response, "text", ""))
    return None


def _from_backboard(text: str, catalog: list[CatalogItem], now: datetime) -> Extraction | None:
    key = backboard_api_key()
    if not key or _remaining() <= 0:
        return None
    prompt = _prompt(text, catalog)
    try:
        import httpx

        response = httpx.post(
            "https://app.backboard.io/api/threads/messages",
            headers={"X-API-Key": key, "Content-Type": "application/json"},
            json={
                "content": prompt,
                "llm_provider": "google",
                "model_name": backboard_model(),
                "stream": False,
                "memory": "off",
            },
            timeout=max(_remaining(), 0.001),
        )
        response.raise_for_status()
        body = response.json()
    except Exception as exc:
        log.warning("Backboard failed: %s: %s", type(exc).__name__, exc)
        return None
    if _remaining() <= 0:
        log.warning("Backboard reply arrived after the extraction deadline")
        return None
    raw = body.get("content") if isinstance(body, dict) else None
    if not isinstance(raw, str):
        raw = body.get("message") if isinstance(body, dict) else None
    payload = _parse_json(raw or "")
    if isinstance(payload, dict):
        return _extraction_from_payload(payload, text, catalog, now)
    log.warning("Backboard gave an unparseable reply: %.200r", raw)
    return None


def _call_within_budget(call, seconds: float):
    """Run a provider call, and ignore it when it outlives the deadline."""
    pool = ThreadPoolExecutor(max_workers=1)
    future = pool.submit(call)
    try:
        return future.result(timeout=max(seconds, 0.001))
    except TimeoutError:
        return None
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _matches_schema(value, schema: dict) -> bool:
    expected = schema.get("type")
    if isinstance(expected, list):
        if value is None and "null" in expected:
            return True
        expected = next((kind for kind in expected if kind != "null"), None)
    if expected == "object":
        if not isinstance(value, dict):
            return False
        properties = schema.get("properties") or {}
        required = schema.get("required") or []
        if any(key not in value for key in required):
            return False
        if schema.get("additionalProperties") is False and any(key not in properties for key in value):
            return False
        return all(key not in properties or _matches_schema(item, properties[key]) for key, item in value.items())
    if expected == "array":
        if not isinstance(value, list):
            return False
        item_schema = schema.get("items")
        return item_schema is None or all(_matches_schema(item, item_schema) for item in value)
    if expected == "string":
        matches = isinstance(value, str)
    elif expected == "integer":
        matches = isinstance(value, int) and not isinstance(value, bool)
    elif expected == "boolean":
        matches = isinstance(value, bool)
    elif expected == "null":
        matches = value is None
    else:
        matches = False
    if not matches:
        return False
    allowed = schema.get("enum")
    return allowed is None or value in allowed


def _extraction_from_payload(
    payload: dict, text: str, catalog: list[CatalogItem], now: datetime
) -> Extraction | None:
    if not _matches_schema(payload, EXTRACTION_SCHEMA):
        return None
    intent = payload["intent"]
    item_ids: list[str] = []
    extra_names: list[str] = []
    quantity = 1
    raw_items = payload.get("items")
    if not isinstance(raw_items, list):
        return None
    for entry in raw_items:
        if not isinstance(entry, dict):
            continue
        name = " ".join(str(entry.get("name") or "").split())[:MAX_TOOL_NAME]
        match = match_catalog(name, catalog)
        if match is None:
            seen = {extra.lower() for extra in extra_names}
            if intent == "project" and name and name.lower() not in seen:
                extra_names.append(name)
            continue
        if match.id in item_ids:
            continue
        item_ids.append(match.id)
        try:
            quantity = max(1, min(99, int(entry.get("quantity") or 1)))
        except (TypeError, ValueError, OverflowError):
            quantity = 1
    if intent == "project":
        room = max(0, MAX_PROJECT_TOOLS - len(item_ids))
        extra_names = extra_names[:room]
    if not item_ids and not extra_names:
        return None
    start, start_ok = _strict_moment(payload.get("window_start"))
    end, end_ok = _strict_moment(payload.get("window_end"))
    if not start_ok or not end_ok:
        return None
    if start is not None and end is not None and end <= start:
        return None
    if start is None or end is None:
        start, end = _window(text, now)
    area = payload.get("area")
    if not isinstance(area, str) or not area.strip():
        area = _area(text)
    if intent != "project":
        item_ids = item_ids[:1]
    return Extraction(
        intent,
        item_ids,
        quantity if intent != "project" else 1,
        start,
        end,
        area,
        extra_names,
    )


def _parse_json(text: str) -> dict | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
        cleaned = re.sub(r"```$", "", cleaned).strip()
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _strict_moment(value) -> tuple[datetime | None, bool]:
    if value is None or value == "":
        return None, True
    parsed = aware(_parse_optional_dt(value))
    if parsed is None:
        return None, False
    return parsed, True


def _parse_optional_dt(value) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, OverflowError):
        return None


def _quantity(text: str) -> int:
    match = re.search(r"\b(\d+)\b", text)
    if not match:
        return 1
    return max(1, int(match.group(1)))


def _area(text: str) -> str | None:
    match = re.search(r"\b(?:at|near|in)\s+([A-Za-z0-9][A-Za-z0-9' ]{0,40})", text)
    if not match:
        return None
    return " ".join(match.group(1).split()[:4])


def _window(text: str, now: datetime) -> tuple[datetime | None, datetime | None]:
    lowered = text.lower()
    if "weekend" in lowered:
        return _weekend(now)
    if "tomorrow" in lowered:
        day = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)
        return day, day.replace(hour=18)
    for name, index in WEEKDAYS.items():
        if re.search(rf"\b{name}\b", lowered):
            return _named_day(now, index)
    return None, None


def _weekend(now: datetime) -> tuple[datetime, datetime]:
    weekday = now.weekday()
    if weekday == 6:
        saturday = now - timedelta(days=1)
    elif weekday == 5:
        saturday = now
    else:
        saturday = now + timedelta(days=(5 - weekday))
    start = saturday.replace(hour=9, minute=0, second=0, microsecond=0)
    end = (start + timedelta(days=1)).replace(hour=18)
    return start, end


def _named_day(now: datetime, index: int) -> tuple[datetime, datetime]:
    delta = (index - now.weekday()) % 7
    if delta == 0 and now.hour >= 18:
        delta = 7
    day = (now + timedelta(days=delta)).replace(hour=9, minute=0, second=0, microsecond=0)
    return day, day.replace(hour=18)
