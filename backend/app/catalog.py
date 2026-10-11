import json
import re

from app.models import CatalogItem

BOOKSHELF_TOOLS = ("drill", "saw", "level", "sander", "clamps", "tape-measure")


def alias_list(item: CatalogItem) -> list[str]:
    try:
        parsed = json.loads(item.aliases)
    except json.JSONDecodeError:
        return [item.name]
    if isinstance(parsed, list):
        return [str(name) for name in parsed]
    return [item.name]


def mentions(name: str, text: str) -> bool:
    return re.search(rf"\b{re.escape(name.lower())}\b", text.lower()) is not None


def match_catalog(text: str, catalog: list[CatalogItem]) -> CatalogItem | None:
    best: CatalogItem | None = None
    best_len = 0
    for item in catalog:
        for name in [item.name, *alias_list(item)]:
            if mentions(name, text) and len(name) > best_len:
                best = item
                best_len = len(name)
    return best


def mentioned_items(text: str, catalog: list[CatalogItem]) -> list[CatalogItem]:
    found: list[tuple[int, CatalogItem]] = []
    seen: set[str] = set()
    for item in catalog:
        names = [item.name, *alias_list(item)]
        hit_at = None
        for name in names:
            match = re.search(rf"\b{re.escape(name.lower())}\b", text.lower())
            if match is None:
                continue
            if hit_at is None or match.start() < hit_at:
                hit_at = match.start()
        if hit_at is None or item.id in seen:
            continue
        seen.add(item.id)
        found.append((hit_at, item))
    found.sort(key=lambda pair: pair[0])
    return [item for _index, item in found]


def is_bookshelf(text: str) -> bool:
    compact = re.sub(r"\s+", "", text.lower())
    return "bookshelf" in compact or "bookshelves" in compact
