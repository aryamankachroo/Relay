import json

from sqlmodel import Session, select

from app.config import AVERY_ID
from app.models import CatalogItem, Resident

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
    if session.exec(select(CatalogItem)).first() is None:
        for row in CATALOG:
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
