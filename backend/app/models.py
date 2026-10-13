from datetime import datetime

from sqlmodel import Field, SQLModel


class Resident(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    short_name: str
    street: str
    initials: str
    x: float = 0
    y: float = 0


class CatalogItem(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    aliases: str
    category: str
    demo_price_cents: int
    default_loan_hours: int


class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    resident_id: str
    raw_text: str
    window_start: datetime | None = None
    window_end: datetime | None = None
    created_at: datetime


class ProjectTool(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str
    catalog_item_id: str
    name: str | None = None
    position: int = 0
    optional: bool = False
    have_already: bool = False


class Request(SQLModel, table=True):
    id: str = Field(primary_key=True)
    resident_id: str
    kind: str
    raw_text: str
    catalog_item_id: str
    quantity: int
    area: str | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    status: str
    created_at: datetime


class Loan(SQLModel, table=True):
    id: str = Field(primary_key=True)
    lender_id: str
    borrower_id: str
    inventory_id: str | None = None
    catalog_item_id: str
    request_id: str | None = None
    window_start: datetime
    window_end: datetime
    status: str
    quantity: int = 1
    created_at: datetime


class Handoff(SQLModel, table=True):
    id: str = Field(primary_key=True)
    need_request_id: str
    recipient_id: str
    status: str
    recipient_confirmed: bool = False
    created_at: datetime


class HandoffAllocation(SQLModel, table=True):
    id: str = Field(primary_key=True)
    handoff_id: str
    offer_request_id: str
    resident_id: str
    quantity: int
    donor_confirmed: bool = False


class GardenEvent(SQLModel, table=True):
    id: str = Field(primary_key=True)
    kind: str
    loan_id: str | None = None
    handoff_id: str | None = None
    created_at: datetime


class GroupBuy(SQLModel, table=True):
    id: str = Field(primary_key=True)
    catalog_item_id: str
    created_at: datetime


class ShelfItem(SQLModel, table=True):
    id: str = Field(primary_key=True)
    resident_id: str
    name: str
    category: str = "Household"
    quantity: int = 1
    condition: str = ""
    notes: str = ""
    available_to_lend: bool = True
