import json

from sqlmodel import Session, select

from app.config import AVERY_ID
from app.dataset import inventory_rows, resident_rows
from app.models import CatalogItem, Resident, StockRow

CATALOG = (
    {
        "id": "drill",
        "name": "Drill",
        "aliases": ["drill", "cordless drill", "power drill"],
        "category": "tool",
        "demo_price_cents": 6000,
        "default_loan_hours": 4,
    },
    {
        "id": "saw",
        "name": "Saw",
        "aliases": ["saw", "circular saw", "hand saw"],
        "category": "tool",
        "demo_price_cents": 4000,
        "default_loan_hours": 4,
    },
    {
        "id": "level",
        "name": "Level",
        "aliases": ["level", "spirit level"],
        "category": "tool",
        "demo_price_cents": 1500,
        "default_loan_hours": 4,
    },
    {
        "id": "sander",
        "name": "Sander",
        "aliases": ["sander", "orbital sander"],
        "category": "tool",
        "demo_price_cents": 4500,
        "default_loan_hours": 4,
    },
    {
        "id": "clamps",
        "name": "Clamps",
        "aliases": ["clamps", "clamp", "bar clamps"],
        "category": "tool",
        "demo_price_cents": 2000,
        "default_loan_hours": 4,
    },
    {
        "id": "tape-measure",
        "name": "Tape measure",
        "aliases": ["tape measure", "measuring tape"],
        "category": "tool",
        "demo_price_cents": 1000,
        "default_loan_hours": 4,
    },
    {
        "id": "notebooks",
        "name": "Notebooks",
        "aliases": ["notebook", "notebooks"],
        "category": "supply",
        "demo_price_cents": 200,
        "default_loan_hours": 4,
    },
    {
        "id": "ladder",
        "name": "Ladder",
        "aliases": ["ladder", "step ladder"],
        "category": "tool",
        "demo_price_cents": 8000,
        "default_loan_hours": 4,
    },
    {
        "id": "hose",
        "name": "Garden hose",
        "aliases": ["hose", "garden hose"],
        "category": "garden",
        "demo_price_cents": 2500,
        "default_loan_hours": 8,
    },
    {
        "id": "extension-cord",
        "name": "Extension cord",
        "aliases": ["extension cord", "power cord"],
        "category": "household",
        "demo_price_cents": 1800,
        "default_loan_hours": 8,
    },
    {
        "id": "folding-table",
        "name": "Folding table",
        "aliases": ["folding table", "banquet table"],
        "category": "household",
        "demo_price_cents": 5000,
        "default_loan_hours": 24,
    },
    {
        "id": "soccer-ball",
        "name": "Soccer ball",
        "aliases": ["soccer ball", "football"],
        "category": "sports",
        "demo_price_cents": 2000,
        "default_loan_hours": 4,
    },
    {
        "id": "mixing-bowl",
        "name": "Mixing bowl",
        "aliases": ["mixing bowl", "bowl"],
        "category": "kitchen",
        "demo_price_cents": 1500,
        "default_loan_hours": 8,
    },
    {
        "id": "hedge-trimmer",
        "name": "Hedge trimmer",
        "aliases": ["hedge trimmer", "trimmer"],
        "category": "garden",
        "demo_price_cents": 7000,
        "default_loan_hours": 4,
    },
)


# Same ids and grid points as snowflake/create_residents.sh and the INVENTORY seed.
NEIGHBORS = (
    {"id": "jordan", "name": "Jordan Lee", "short_name": "Jordan", "street": "16 Willow Court", "x": 2, "y": 1},
    {"id": "sam", "name": "Sam Ortiz", "short_name": "Sam", "street": "18 Willow Court", "x": 3, "y": 3},
    {"id": "riley", "name": "Riley Park", "short_name": "Riley", "street": "21 Willow Court", "x": 5, "y": 2},
    {"id": "noor", "name": "Noor Haddad", "short_name": "Noor", "street": "9 Far Road", "x": 40, "y": 0},
    {"id": "maya", "name": "Maya Chen", "short_name": "Maya", "street": "12 Willow Court", "x": 1, "y": 4},
    {"id": "chris", "name": "Chris Nguyen", "short_name": "Chris", "street": "22 Willow Court", "x": 4, "y": 1},
    {"id": "priya", "name": "Priya Shah", "short_name": "Priya", "street": "9 Willow Court", "x": 6, "y": 4},
    {"id": "elena", "name": "Elena Brooks", "short_name": "Elena", "street": "25 Willow Court", "x": 8, "y": 2},
    {"id": "luis", "name": "Luis Alvarez", "short_name": "Luis", "street": "11 Willow Court", "x": 7, "y": 3},
    {"id": "nia", "name": "Nia Patel", "short_name": "Nia", "street": "4 Oak Lane", "x": 2, "y": 5},
    {"id": "owen", "name": "Owen Blake", "short_name": "Owen", "street": "7 Willow Court", "x": 1, "y": 2},
)

# Extra shared inventory. Nobody new owns a drill, so the shared-purchase demo stays intact.
EXTRA_INVENTORY = (
    {"resident_id": "luis", "resident_name": "Luis Alvarez", "x": 7, "y": 3, "catalog_item": "Garden hose", "quantity": 1, "willing_to_lend": True, "condition_note": "50 ft, brass fittings"},
    {"resident_id": "luis", "resident_name": "Luis Alvarez", "x": 7, "y": 3, "catalog_item": "Soccer ball", "quantity": 2, "willing_to_lend": True, "condition_note": "Size 5, one scuffed"},
    {"resident_id": "nia", "resident_name": "Nia Patel", "x": 2, "y": 5, "catalog_item": "Folding table", "quantity": 1, "willing_to_lend": True, "condition_note": "6 ft, seats eight"},
    {"resident_id": "nia", "resident_name": "Nia Patel", "x": 2, "y": 5, "catalog_item": "Mixing bowl", "quantity": 3, "willing_to_lend": True, "condition_note": "Stainless, nested set"},
    {"resident_id": "owen", "resident_name": "Owen Blake", "x": 1, "y": 2, "catalog_item": "Extension cord", "quantity": 1, "willing_to_lend": True, "condition_note": "25 ft, outdoor rated"},
    {"resident_id": "owen", "resident_name": "Owen Blake", "x": 1, "y": 2, "catalog_item": "Hedge trimmer", "quantity": 1, "willing_to_lend": True, "condition_note": "Corded, sharp"},
    {"resident_id": "maya", "resident_name": "Maya Chen", "x": 1, "y": 4, "catalog_item": "Garden hose", "quantity": 1, "willing_to_lend": True, "condition_note": "25 ft, nozzle included"},
)


def initials_for(name: str) -> str:
    parts = [part for part in name.split() if part]
    if len(parts) >= 2:
        return (parts[0][0] + parts[-1][0]).upper()
    return name[:2].upper()


def seed(session: Session) -> None:
    if session.get(Resident, AVERY_ID) is None:
        session.add(
            Resident(
                id=AVERY_ID,
                name="Avery Moss",
                short_name="Avery",
                street="14 Willow Court",
                initials="AM",
                x=0,
                y=0,
            )
        )
    for row in NEIGHBORS:
        if session.get(Resident, row["id"]) is None:
            session.add(Resident(**row, initials=initials_for(row["name"])))
    for row in CATALOG:
        if session.get(CatalogItem, row["id"]) is None:
            session.add(
                CatalogItem(
                    id=row["id"],
                    name=row["name"],
                    aliases=json.dumps(row["aliases"]),
                    category=row["category"],
                    demo_price_cents=row["demo_price_cents"],
                    default_loan_hours=row["default_loan_hours"],
                )
            )
    session.commit()
    _seed_stock(session)


def _seed_stock(session: Session) -> None:
    if session.exec(select(StockRow)).first() is not None:
        return
    rows = inventory_rows()
    known = {row.id for row in session.exec(select(Resident)).all()}
    for person in resident_rows(rows):
        if person["id"] in known:
            continue
        session.add(
            Resident(
                id=person["id"],
                name=person["name"],
                short_name=person["name"].split()[0],
                street=f"{person['id']} Willow Court",
                initials=initials_for(person["name"]),
                x=person["x"],
                y=person["y"],
            )
        )
    session.add_all(
        [
            StockRow(
                id=f"{row['resident_id']}:{row['catalog_item']}",
                resident_id=row["resident_id"],
                resident_name=row["resident_name"],
                x=row["x"],
                y=row["y"],
                catalog_item=row["catalog_item"],
                quantity=row["quantity"],
                willing_to_lend=row["willing_to_lend"],
                condition_note=row["condition_note"],
            )
            for row in rows
        ]
    )
    session.commit()


def ensure_extra_inventory() -> None:
    """Upload the load-test inventory once Snowflake is configured and still small."""
    from app.snowflake_store import SnowflakeError, count_inventory, insert_inventory_many

    try:
        current = count_inventory()
        if current is None or current >= len(inventory_rows()):
            return
        insert_inventory_many(inventory_rows())
    except SnowflakeError:
        return
