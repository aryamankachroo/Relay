"""Deterministic inventory large enough for load tests.

Drills stay outside the neighborhood distance limit so a nearby drill request
still becomes a shared purchase.
"""

from app.config import DISTANCE_LIMIT

TARGET_ROWS = 5000

ITEM_NAMES = (
    "Saw",
    "Level",
    "Sander",
    "Clamps",
    "Tape measure",
    "Notebooks",
    "Ladder",
    "Garden hose",
    "Extension cord",
    "Folding table",
    "Soccer ball",
    "Mixing bowl",
    "Hedge trimmer",
)
FAR_ONLY = ("Drill",)


def inventory_rows(count: int = TARGET_ROWS) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    resident_index = 0
    while len(rows) < count:
        x = (resident_index % 30) - 10
        y = resident_index // 30
        distance = abs(x) + abs(y)
        names = ITEM_NAMES + (FAR_ONLY if distance > DISTANCE_LIMIT else ())
        resident_id = f"block-{resident_index:04d}"
        resident_name = f"Neighbor {resident_index:04d}"
        for name in names:
            key = (resident_id, name)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                {
                    "resident_id": resident_id,
                    "resident_name": resident_name,
                    "x": x,
                    "y": y,
                    "catalog_item": name,
                    "quantity": 1 + (resident_index % 4),
                    "willing_to_lend": True,
                    "condition_note": f"Load-test {name.lower()}",
                }
            )
            if len(rows) >= count:
                break
        resident_index += 1
    return rows


def resident_rows(rows: list[dict] | None = None) -> list[dict]:
    found: dict[str, dict] = {}
    for row in rows if rows is not None else inventory_rows():
        found.setdefault(
            row["resident_id"],
            {
                "id": row["resident_id"],
                "name": row["resident_name"],
                "x": row["x"],
                "y": row["y"],
            },
        )
    return list(found.values())
