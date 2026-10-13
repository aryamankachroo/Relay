"""Deterministic inventory large enough for load tests."""

TARGET_ROWS = 5000

ITEM_NAMES = (
    "Chair",
    "Bike",
    "Tent",
    "Cooler",
    "Blender",
    "Fan",
    "Vacuum",
    "Stroller",
    "Wagon",
    "Air mattress",
    "Folding table",
    "Extension cord",
    "Garden hose",
    "Ladder",
    "Saw",
    "Soccer ball",
)
CITIES = ("Charlotte", "Raleigh", "Durham", "Atlanta")


def inventory_rows(count: int = TARGET_ROWS) -> list[dict]:
    rows: list[dict] = []
    seen: set[tuple[str, str]] = set()
    resident_index = 0
    while len(rows) < count:
        x = (resident_index % 30) - 10
        y = resident_index // 30
        names = ITEM_NAMES
        resident_id = f"block-{resident_index:04d}"
        resident_name = f"Neighbor {resident_index:04d}"
        city = CITIES[(resident_index // 90) % len(CITIES)]
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
                    "city": city,
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
                "city": row.get("city") or "",
            },
        )
    return list(found.values())
