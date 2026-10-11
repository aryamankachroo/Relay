import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.clock import aware, now as utcnow

from app.catalog import BOOKSHELF_TOOLS, is_bookshelf, match_catalog, mentioned_items
from app.config import gemini_api_key, gemini_model
from app.models import CatalogItem

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


def extract_message(text: str, catalog: list[CatalogItem], now: datetime | None = None) -> Extraction:
    moment = now or utcnow()
    gemini = _from_gemini(text, catalog, moment)
    if gemini is not None:
        return gemini
    return _fallback(text, catalog, moment)


def _fallback(text: str, catalog: list[CatalogItem], now: datetime) -> Extraction:
    normalized = re.sub(r"[^a-z\s]", "", text.lower()).strip()
    window = _window(text, now)
    area = _area(text)
    quantity = _quantity(text)
    if normalized in CONFIRM_YES:
        return Extraction("confirm_yes", [], 1, None, None, None)
    if normalized in CONFIRM_NO:
        return Extraction("confirm_no", [], 1, None, None, None)

    bookshelf = is_bookshelf(text)
    mentioned = [item.id for item in mentioned_items(text, catalog)]
    if re.search(r"\bi have\b|\bto give\b|\bgive away\b|\boffering\b", text.lower()):
        item_ids = mentioned[:1]
        return Extraction("offer", item_ids, quantity, window[0], window[1], area)
    if re.search(r"\bi need\b|\bi want\b", text.lower()) and not bookshelf:
        if len(mentioned) > 1:
            return Extraction("project", mentioned, 1, window[0], window[1], area)
        return Extraction("need", mentioned[:1], quantity, window[0], window[1], area)
    if bookshelf or re.search(r"\b(building|build|making|project)\b", text.lower()):
        item_ids = list(BOOKSHELF_TOOLS) if bookshelf else mentioned
        return Extraction("project", item_ids, 1, window[0], window[1], area)
    if mentioned:
        return Extraction("need", mentioned[:1], quantity, window[0], window[1], area)
    return Extraction("unknown", [], 1, None, None, None)


def _from_gemini(text: str, catalog: list[CatalogItem], now: datetime) -> Extraction | None:
    key = gemini_api_key()
    if not key:
        return None
    names = ", ".join(item.name for item in catalog)
    prompt = (
        "Turn this neighborhood-sharing message into JSON only. "
        "intent is project, need, or offer. "
        f"Map item names only from this catalog: {names}. "
        "Use null for unknown window or area. quantity is a positive integer.\n"
        '{"intent":"need","items":[{"name":"Notebooks","quantity":20,"optional":false}],'
        '"window_start":null,"window_end":null,"area":null}\n'
        f"Message: {text}"
    )
    try:
        from google import genai

        client = genai.Client(api_key=key)
        response = client.models.generate_content(model=gemini_model(), contents=prompt)
        payload = _parse_json(response.text or "")
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    intent = payload.get("intent")
    if intent not in {"project", "need", "offer"}:
        return None
    item_ids: list[str] = []
    quantity = 1
    for entry in payload.get("items") or []:
        if not isinstance(entry, dict):
            continue
        match = match_catalog(str(entry.get("name") or ""), catalog)
        if match is None or match.id in item_ids:
            continue
        item_ids.append(match.id)
        try:
            quantity = max(1, int(entry.get("quantity") or 1))
        except (TypeError, ValueError):
            quantity = 1
    if not item_ids:
        return None
    start = aware(_parse_optional_dt(payload.get("window_start")))
    end = aware(_parse_optional_dt(payload.get("window_end")))
    if start is None or end is None:
        start, end = _window(text, now)
    area = payload.get("area")
    if not isinstance(area, str) or not area.strip():
        area = _area(text)
    if intent != "project":
        item_ids = item_ids[:1]
    return Extraction(intent, item_ids, quantity if intent != "project" else 1, start, end, area)


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


def _parse_optional_dt(value) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
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
