from dataclasses import dataclass
from datetime import datetime

from app.clock import aware


@dataclass
class Supply:
    id: str
    resident_id: str
    available: int


@dataclass
class Take:
    offer_id: str
    resident_id: str
    quantity: int


def fill_partial(quantity: int, offers: list[Supply]) -> tuple[list[Take], int]:
    """Greedy fill. Twelve plus eight covers a need for twenty."""
    remaining = quantity
    filled: list[Take] = []
    ordered = sorted(offers, key=lambda offer: (-offer.available, offer.resident_id))
    for offer in ordered:
        if remaining <= 0:
            break
        if offer.available <= 0:
            continue
        take = min(remaining, offer.available)
        filled.append(Take(offer.id, offer.resident_id, take))
        remaining -= take
    return filled, remaining


def overlap_seconds(a0, a1, b0, b1) -> float | None:
    start = max(a0, b0)
    end = min(a1, b1)
    if start >= end:
        return None
    delta = end - start
    if hasattr(delta, "total_seconds"):
        return float(delta.total_seconds())
    return float(delta)


@dataclass
class LenderItem:
    id: str
    resident_id: str
    resident_name: str
    x: float
    y: float
    catalog_item_id: str
    quantity: int
    willing_to_lend: bool
    condition_note: str
    windows: list


@dataclass
class NeedPoint:
    resident_id: str
    catalog_item_id: str
    x: float
    y: float
    window_start: object | None = None
    window_end: object | None = None


def rank_lenders(need: NeedPoint, inventory: list[LenderItem], distance_limit: float) -> list[dict]:
    ranked = []
    for item in inventory:
        if item.catalog_item_id != need.catalog_item_id:
            continue
        if item.resident_id == need.resident_id:
            continue
        if not item.willing_to_lend or item.quantity <= 0:
            continue
        distance = abs(item.x - need.x) + abs(item.y - need.y)
        if distance > distance_limit:
            continue
        fit = _time_fit(need, item)
        if fit is None:
            continue
        ranked.append((distance, -fit, item))
    ranked.sort(key=lambda row: (row[0], row[1], row[2].resident_name))
    return [
        {
            "inventory_id": item.id,
            "resident_id": item.resident_id,
            "resident_name": item.resident_name,
            "distance": distance,
            "quantity": item.quantity,
            "condition_note": item.condition_note,
            "windows": item.windows,
        }
        for distance, _fit, item in ranked
    ]


def _moment(value):
    """Datetimes, ISO strings and plain numbers. Naive datetimes count as UTC."""
    if isinstance(value, datetime):
        return aware(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        if text.endswith("Z"):
            text = text[:-1] + "+00:00"
        try:
            return aware(datetime.fromisoformat(text))
        except ValueError:
            return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    return None


def _span(window):
    """A window is a [start, end] pair or a {"start", "end"} object."""
    if isinstance(window, dict):
        start, end = window.get("start"), window.get("end")
    elif isinstance(window, (list, tuple)) and len(window) == 2:
        start, end = window
    else:
        return None
    start, end = _moment(start), _moment(end)
    if start is None or end is None:
        return None
    return start, end


def _time_fit(need: NeedPoint, item: LenderItem) -> float | None:
    if not item.windows:
        return 1
    need_start, need_end = _moment(need.window_start), _moment(need.window_end)
    if need_start is None or need_end is None:
        return 1
    best = None
    for window in item.windows:
        span = _span(window)
        if span is None:
            continue
        try:
            amount = overlap_seconds(need_start, need_end, span[0], span[1])
        except TypeError:
            continue
        if amount is None:
            continue
        best = amount if best is None else max(best, amount)
    return best
