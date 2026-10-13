from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session, init_db, session_scope
from app.logic import (
    activity,
    add_tool,
    confirm_handoff,
    confirm_request,
    create_loan,
    decline_handoff,
    garden_count,
    handle_chat,
    create_shelf_item,
    delete_shelf_item,
    inventory_view,
    my_stuff,
    neighborhood,
    pickup_loan,
    projects_for,
    receive_handoff,
    remove_tool,
    respond_loan,
    return_loan,
    shared_demand,
    start_group_buy,
    update_shelf_item,
    update_tool,
)
from app.models import CatalogItem, Resident
from app.seed import ensure_extra_inventory, initials_for, seed
from app.snowflake_store import SnowflakeError, status as snowflake_status, upsert_profile


class ProfileIn(BaseModel):
    clerk_user_id: str
    name: str
    email: str = ""
    initials: str
    street: str = "14 Willow Court"


class ResidentIn(BaseModel):
    id: str
    name: str
    street: str
    short_name: str | None = None
    x: float = 0
    y: float = 0


class ChatIn(BaseModel):
    resident_id: str
    message: str


class ToolPatch(BaseModel):
    optional: bool | None = None
    have_already: bool | None = None


class ToolIn(BaseModel):
    catalog_item_id: str
    optional: bool = False


class LoanIn(BaseModel):
    borrower_id: str
    lender_id: str
    catalog_item_id: str
    window_start: datetime
    window_end: datetime
    quantity: int = Field(default=1, ge=1)
    inventory_id: str | None = None


class LoanRespond(BaseModel):
    action: str
    window_start: datetime | None = None
    window_end: datetime | None = None


class ResidentAction(BaseModel):
    resident_id: str


class ShelfIn(BaseModel):
    resident_id: str
    name: str
    category: str = "Household"
    quantity: int = Field(default=1, ge=0, le=99)
    condition: str = ""
    notes: str = ""
    available_to_lend: bool = True


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with session_scope() as session:
        seed(session)
    ensure_extra_inventory()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Relay", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "capacitor://localhost",
            "http://localhost",
        ],
        allow_origin_regex=r"https?://(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root():
        return {"name": "Relay", "docs": "/docs", "health": "/health"}

    @app.get("/health")
    def health():
        body = {"status": "ok"}
        body.update(snowflake_status())
        return body

    @app.get("/api/residents")
    def list_residents(session: Session = Depends(get_session)):
        rows = session.exec(select(Resident)).all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "short_name": row.short_name,
                "street": row.street,
                "initials": row.initials,
                "x": row.x,
                "y": row.y,
            }
            for row in rows
        ]

    @app.post("/api/me")
    def save_me(body: ProfileIn, session: Session = Depends(get_session)):
        try:
            assigned_id = upsert_profile(
                body.clerk_user_id, body.name, body.email, body.initials, body.street
            )
        except SnowflakeError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        short_name = body.name.split()[0] if body.name.split() else body.initials
        resident = session.get(Resident, body.clerk_user_id)
        if resident is None:
            resident = Resident(
                id=body.clerk_user_id,
                name=body.name,
                short_name=short_name,
                street=body.street,
                initials=body.initials,
                x=0,
                y=0,
            )
        else:
            resident.name = body.name
            resident.short_name = short_name
            resident.street = body.street
            resident.initials = body.initials
        session.add(resident)
        session.commit()
        return {"id": resident.id, "name": resident.name, "resident_id": assigned_id}

    @app.post("/api/residents", status_code=201)
    def create_resident(body: ResidentIn, session: Session = Depends(get_session)):
        if session.get(Resident, body.id) is not None:
            raise HTTPException(status_code=409, detail="Resident already exists")
        resident = Resident(
            id=body.id,
            name=body.name,
            short_name=body.short_name or body.name.split()[0],
            street=body.street,
            initials=initials_for(body.name),
            x=body.x,
            y=body.y,
        )
        session.add(resident)
        session.commit()
        return {"id": resident.id, "name": resident.name, "initials": resident.initials}

    @app.get("/api/catalog")
    def list_catalog(session: Session = Depends(get_session)):
        rows = session.exec(select(CatalogItem)).all()
        return [
            {
                "id": row.id,
                "name": row.name,
                "category": row.category,
                "demo_price_cents": row.demo_price_cents,
                "default_loan_hours": row.default_loan_hours,
            }
            for row in rows
        ]

    @app.post("/api/chat")
    def chat(body: ChatIn, session: Session = Depends(get_session)):
        return handle_chat(session, body.resident_id, body.message)

    @app.post("/api/requests/{request_id}/confirm")
    def post_confirm_request(
        request_id: str,
        body: ResidentAction,
        session: Session = Depends(get_session),
    ):
        return confirm_request(session, request_id, body.resident_id)

    @app.get("/api/projects")
    def list_projects(resident_id: str = "avery", session: Session = Depends(get_session)):
        return projects_for(session, resident_id)

    @app.patch("/api/projects/{project_id}/tools/{tool_id}")
    def patch_tool(
        project_id: str,
        tool_id: str,
        body: ToolPatch,
        session: Session = Depends(get_session),
    ):
        return update_tool(session, project_id, tool_id, body.optional, body.have_already)

    @app.post("/api/projects/{project_id}/tools", status_code=201)
    def post_tool(project_id: str, body: ToolIn, session: Session = Depends(get_session)):
        return add_tool(session, project_id, body.catalog_item_id, body.optional)

    @app.delete("/api/projects/{project_id}/tools/{tool_id}")
    def delete_tool(project_id: str, tool_id: str, session: Session = Depends(get_session)):
        return remove_tool(session, project_id, tool_id)

    @app.get("/api/inventory")
    def list_inventory(resident_id: str | None = None, session: Session = Depends(get_session)):
        return inventory_view(session, resident_id)

    @app.post("/api/inventory", status_code=201)
    def post_inventory(body: ShelfIn, session: Session = Depends(get_session)):
        return create_shelf_item(
            session,
            body.resident_id,
            body.name,
            body.category,
            body.quantity,
            body.condition,
            body.notes,
            body.available_to_lend,
        )

    @app.patch("/api/inventory/{item_id}")
    def patch_inventory(item_id: str, body: ShelfIn, session: Session = Depends(get_session)):
        return update_shelf_item(
            session,
            body.resident_id,
            item_id,
            body.name,
            body.category,
            body.quantity,
            body.condition,
            body.notes,
            body.available_to_lend,
        )

    @app.delete("/api/inventory/{item_id}")
    def remove_inventory(item_id: str, resident_id: str, session: Session = Depends(get_session)):
        return delete_shelf_item(session, resident_id, item_id)

    @app.get("/api/my-stuff")
    def get_my_stuff(resident_id: str = "avery", session: Session = Depends(get_session)):
        return my_stuff(session, resident_id)

    @app.get("/api/neighborhood")
    def get_neighborhood(resident_id: str = "avery", session: Session = Depends(get_session)):
        return neighborhood(session, resident_id)

    @app.get("/api/activity")
    def get_activity(resident_id: str | None = None, session: Session = Depends(get_session)):
        return activity(session, resident_id)

    @app.post("/api/loans", status_code=201)
    def post_loan(body: LoanIn, session: Session = Depends(get_session)):
        return create_loan(
            session,
            body.borrower_id,
            body.lender_id,
            body.catalog_item_id,
            body.window_start,
            body.window_end,
            body.quantity,
            body.inventory_id,
        )

    @app.post("/api/loans/{loan_id}/respond")
    def post_respond(loan_id: str, body: LoanRespond, session: Session = Depends(get_session)):
        return respond_loan(session, loan_id, body.action, body.window_start, body.window_end)

    @app.post("/api/loans/{loan_id}/pickup")
    def post_pickup(loan_id: str, session: Session = Depends(get_session)):
        return pickup_loan(session, loan_id)

    @app.post("/api/loans/{loan_id}/return")
    def post_return(loan_id: str, session: Session = Depends(get_session)):
        return return_loan(session, loan_id)

    @app.post("/api/handoffs/{handoff_id}/confirm")
    def post_confirm(handoff_id: str, body: ResidentAction, session: Session = Depends(get_session)):
        return confirm_handoff(session, handoff_id, body.resident_id)

    @app.post("/api/handoffs/{handoff_id}/decline")
    def post_decline(handoff_id: str, session: Session = Depends(get_session)):
        return decline_handoff(session, handoff_id)

    @app.post("/api/handoffs/{handoff_id}/received")
    def post_received(handoff_id: str, session: Session = Depends(get_session)):
        return receive_handoff(session, handoff_id)

    @app.get("/api/shared-demand")
    def get_shared_demand(session: Session = Depends(get_session)):
        return shared_demand(session)

    @app.post("/api/shared-demand/{catalog_item_id}/group-buy")
    def post_group_buy(catalog_item_id: str, session: Session = Depends(get_session)):
        return start_group_buy(session, catalog_item_id)

    @app.get("/api/garden")
    def get_garden(session: Session = Depends(get_session)):
        return garden_count(session)

    return app


app = create_app()
