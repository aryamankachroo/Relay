import json
from datetime import datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException
from sqlmodel import Session, col, select

from app.clock import aware, now
from app.config import DISTANCE_LIMIT, LOAN_BUFFER_MINUTES
from app.matcher import LenderItem, NeedPoint, Supply, fill_partial, rank_lenders
from app.models import (
    CatalogItem,
    GardenEvent,
    GroupBuy,
    Handoff,
    HandoffAllocation,
    Loan,
    Project,
    ProjectTool,
    Request,
    Resident,
)
from app.scheduler import first_free_slot, overlaps, schedule_shared
from app.extract import extract_message
from app import snowflake_store

BUFFER = timedelta(minutes=LOAN_BUFFER_MINUTES)
ACTIVE_LOAN = ("requested", "confirmed", "picked_up")
ACTIVE_HANDOFF = ("proposed", "confirmed", "received")
DEMAND_KINDS = ("need", "borrow")


class SlotRequest:
    def __init__(self, id: str, win_start, win_end):
        self.id = id
        self.win_start = win_start
        self.win_end = win_end


def handle_chat(session: Session, resident_id: str, message: str) -> dict:
    resident = _resident(session, resident_id)
    catalog = _catalog(session)
    extraction = extract_message(message, catalog)
    if extraction.intent == "confirm_yes":
        return apply_yes(session, resident_id)
    if extraction.intent == "confirm_no":
        return apply_no(session, resident_id)
    if extraction.intent == "project":
        if not extraction.item_ids:
            return {
                "type": "no_match",
                "message": "Name the project or the tools, and the list can be edited.",
            }
        return _create_project(session, resident, message, extraction, catalog)
    if extraction.intent in {"need", "offer"}:
        if not extraction.item_ids:
            return {
                "type": "no_match",
                "message": "That item is not in the catalog. Try a tool or supply the app already knows.",
            }
        return _draft_request(session, resident, message, extraction, catalog)
    return {
        "type": "no_match",
        "message": "Say what you are building, what you need, or what you can give.",
    }


def apply_yes(session: Session, resident_id: str) -> dict:
    _resident(session, resident_id)
    pending = _latest_pending(session, resident_id)
    if pending is not None:
        return publish_and_match(session, pending)
    loan = _latest_loan_for_lender(session, resident_id)
    if loan is not None:
        return respond_loan(session, loan.id, "accept")
    handoff = _latest_handoff_for(session, resident_id)
    if handoff is not None:
        return confirm_handoff(session, handoff.id, resident_id)
    return {"type": "no_match", "message": "Nothing is waiting for a yes or no."}


def apply_no(session: Session, resident_id: str) -> dict:
    _resident(session, resident_id)
    pending = _latest_pending(session, resident_id)
    if pending is not None:
        pending.status = "declined"
        session.add(pending)
        session.commit()
        return {"type": "loan_status", "record": "request", "request_id": pending.id, "status": "declined"}
    loan = _latest_loan_for_lender(session, resident_id)
    if loan is not None:
        return respond_loan(session, loan.id, "decline")
    handoff = _latest_handoff_for(session, resident_id)
    if handoff is not None:
        return decline_handoff(session, handoff.id)
    return {"type": "no_match", "message": "Nothing is waiting for a yes or no."}


def confirm_request(session: Session, request_id: str, resident_id: str) -> dict:
    request = session.get(Request, request_id)
    if request is None or request.resident_id != resident_id:
        raise HTTPException(status_code=404, detail="Request not found")
    if request.status != "pending_confirm":
        raise HTTPException(status_code=409, detail="This request was already answered")
    return publish_and_match(session, request)


def publish_and_match(session: Session, pending: Request) -> dict:
    _publish(session, pending)
    card = _match_open_request(session, pending.id)
    return card


def create_loan(
    session: Session,
    borrower_id: str,
    lender_id: str,
    catalog_item_id: str,
    window_start: datetime,
    window_end: datetime,
    quantity: int = 1,
    inventory_id: str | None = None,
) -> dict:
    _resident(session, borrower_id)
    item = _catalog_item(session, catalog_item_id)
    window_start = aware(window_start)
    window_end = aware(window_end)
    slot = _assert_free(session, lender_id, catalog_item_id, window_start, window_end, None)
    if slot is not True:
        _conflict(slot)
    created = now()
    borrow = Request(
        id=uuid4().hex,
        resident_id=borrower_id,
        kind="borrow",
        raw_text=f"Borrow {item.name}",
        catalog_item_id=item.id,
        quantity=quantity,
        window_start=window_start,
        window_end=window_end,
        status="pending_confirm",
        created_at=created,
    )
    session.add(borrow)
    session.flush()
    _publish(session, borrow)
    loan = Loan(
        id=uuid4().hex,
        lender_id=lender_id,
        borrower_id=borrower_id,
        inventory_id=inventory_id,
        catalog_item_id=item.id,
        request_id=borrow.id,
        window_start=window_start,
        window_end=window_end,
        status="requested",
        quantity=quantity,
        created_at=created,
    )
    session.add(loan)
    session.commit()
    session.refresh(loan)
    return {"type": "loan_status", "record": "loan", **_loan_dict(loan)}


def respond_loan(
    session: Session,
    loan_id: str,
    action: str,
    window_start: datetime | None = None,
    window_end: datetime | None = None,
) -> dict:
    loan = session.get(Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Loan not found")
    if action == "decline":
        if loan.status != "requested":
            raise HTTPException(status_code=409, detail="Only a requested loan can be declined")
        loan.status = "declined"
    elif action == "accept":
        if loan.status != "requested":
            raise HTTPException(status_code=409, detail="Only a requested loan can be accepted")
        slot = _assert_free(
            session,
            loan.lender_id,
            loan.catalog_item_id,
            loan.window_start,
            loan.window_end,
            loan.id,
        )
        if slot is not True:
            _conflict(slot)
        loan.status = "confirmed"
    elif action == "propose_time":
        if loan.status != "requested":
            raise HTTPException(status_code=409, detail="Only a requested loan can move")
        if window_start is None or window_end is None:
            raise HTTPException(status_code=400, detail="propose_time needs a window")
        window_start = aware(window_start)
        window_end = aware(window_end)
        slot = _assert_free(
            session,
            loan.lender_id,
            loan.catalog_item_id,
            window_start,
            window_end,
            loan.id,
        )
        if slot is not True:
            _conflict(slot)
        loan.window_start = window_start
        loan.window_end = window_end
    else:
        raise HTTPException(status_code=400, detail="action must be accept, decline, or propose_time")
    session.add(loan)
    session.commit()
    session.refresh(loan)
    return {"type": "loan_status", "record": "loan", **_loan_dict(loan)}


def pickup_loan(session: Session, loan_id: str) -> dict:
    loan = _loan(session, loan_id)
    if loan.status != "confirmed":
        raise HTTPException(status_code=409, detail="Pick up a confirmed loan")
    loan.status = "picked_up"
    session.add(loan)
    session.commit()
    session.refresh(loan)
    return {"type": "loan_status", "record": "loan", **_loan_dict(loan)}


def return_loan(session: Session, loan_id: str) -> dict:
    loan = _loan(session, loan_id)
    if loan.status != "picked_up":
        raise HTTPException(status_code=409, detail="Return a loan that was picked up")
    loan.status = "returned"
    session.add(loan)
    _garden(session, "loan_returned", loan_id=loan.id)
    session.commit()
    session.refresh(loan)
    return {"type": "loan_status", "record": "loan", **_loan_dict(loan)}


def confirm_handoff(session: Session, handoff_id: str, resident_id: str) -> dict:
    handoff = _handoff(session, handoff_id)
    if handoff.status != "proposed":
        raise HTTPException(status_code=409, detail="This handoff is not waiting for confirmation")
    allocations = _allocations(session, handoff.id)
    touched = False
    if resident_id == handoff.recipient_id:
        handoff.recipient_confirmed = True
        touched = True
    for allocation in allocations:
        if allocation.resident_id == resident_id:
            allocation.donor_confirmed = True
            session.add(allocation)
            touched = True
    if not touched:
        raise HTTPException(status_code=403, detail="You are not part of this handoff")
    if handoff.recipient_confirmed and all(row.donor_confirmed for row in allocations):
        handoff.status = "confirmed"
        _set_request_status(session, handoff.need_request_id, "matched")
    session.add(handoff)
    session.commit()
    session.refresh(handoff)
    return {"type": "loan_status", "record": "handoff", **_handoff_dict(session, handoff)}


def decline_handoff(session: Session, handoff_id: str) -> dict:
    handoff = _handoff(session, handoff_id)
    if handoff.status not in {"proposed", "confirmed"}:
        raise HTTPException(status_code=409, detail="This handoff cannot be declined")
    handoff.status = "declined"
    _set_request_status(session, handoff.need_request_id, "open")
    session.add(handoff)
    session.commit()
    session.refresh(handoff)
    return {"type": "loan_status", "record": "handoff", **_handoff_dict(session, handoff)}


def receive_handoff(session: Session, handoff_id: str) -> dict:
    handoff = _handoff(session, handoff_id)
    if handoff.status != "confirmed":
        raise HTTPException(status_code=409, detail="Mark a confirmed handoff as received")
    handoff.status = "received"
    session.add(handoff)
    need = _find_request(session, handoff.need_request_id)
    if need is not None:
        _set_request_status(session, need["id"], "closed", quantity=need["quantity"])
    for allocation in _allocations(session, handoff.id):
        offer = _find_request(session, allocation.offer_request_id)
        if offer is None:
            continue
        left = max(0, int(offer["quantity"]) - allocation.quantity)
        status = "closed" if left == 0 else "open"
        _set_request_status(session, offer["id"], status, quantity=left)
    _garden(session, "handoff_received", handoff_id=handoff.id)
    session.commit()
    session.refresh(handoff)
    return {"type": "loan_status", "record": "handoff", **_handoff_dict(session, handoff)}


def shared_demand(session: Session) -> dict:
    inventory = inventory_view(session)
    catalog = {item.id: item for item in _catalog(session)}
    groups: dict[str, list[dict]] = {}
    for request in _open_requests(session):
        if request["kind"] not in DEMAND_KINDS:
            continue
        groups.setdefault(request["catalog_item_id"], []).append(request)
    snowflake = inventory["snowflake"]
    results = []
    for item_id, requests in groups.items():
        if len(requests) < 2:
            continue
        item = catalog.get(item_id)
        owned = _owned_nearby(session, requests, inventory, item_id)
        if owned is None:
            shared = False
            reason = "inventory_unavailable"
        elif owned:
            shared = False
            reason = "owned_nearby"
        else:
            shared = True
            reason = None
        schedule, blocked = _schedule_group(requests, item)
        entry = {
            "catalog_item_id": item_id,
            "name": item.name if item else item_id,
            "request_count": len(requests),
            "shared": shared,
            "reason": reason,
            "schedule": schedule,
            "unschedulable_request_id": blocked,
            "cost": _cost(item, len(requests)) if shared and item else None,
            "requests": [_public_request(row) for row in requests],
        }
        results.append(entry)
    return {"snowflake": snowflake, "groups": results}


def start_group_buy(session: Session, catalog_item_id: str) -> dict:
    _catalog_item(session, catalog_item_id)
    existing = session.exec(
        select(GroupBuy).where(GroupBuy.catalog_item_id == catalog_item_id)
    ).first()
    if existing is None:
        existing = GroupBuy(
            id=uuid4().hex,
            catalog_item_id=catalog_item_id,
            created_at=now(),
        )
        session.add(existing)
        session.commit()
    return {"catalog_item_id": catalog_item_id, "started": True, "mock": True}


def inventory_view(session: Session, resident_id: str | None = None) -> dict:
    raw = snowflake_store.fetch_inventory()
    if raw["snowflake"] != "ok":
        payload = {"snowflake": raw["snowflake"], "items": []}
        if raw.get("snowflake_message"):
            payload["snowflake_message"] = raw["snowflake_message"]
        return payload
    catalog = _catalog(session)
    items = []
    for row in raw["items"]:
        label = str(row.get("catalog_item") or "")
        match = _match_label(label, catalog)
        owner = str(row.get("resident_id") or "")
        if resident_id is not None and owner != resident_id:
            continue
        items.append(_inventory_item(row, match))
    return {"snowflake": "ok", "items": items}


def neighborhood(session: Session, resident_id: str) -> dict:
    resident = _resident(session, resident_id)
    view = inventory_view(session)
    if view["snowflake"] != "ok":
        return view
    items = []
    for row in view["items"]:
        if row["resident_id"] == resident.id or not row["willing_to_lend"]:
            continue
        distance = abs(float(row["x"]) - resident.x) + abs(float(row["y"]) - resident.y)
        if distance > DISTANCE_LIMIT:
            continue
        items.append({**row, "distance": distance})
    items.sort(key=lambda row: (row["distance"], row["resident_name"]))
    return {"snowflake": "ok", "resident_id": resident.id, "items": items}


def activity(session: Session, resident_id: str | None) -> dict:
    requests = [
        _public_request(row)
        for row in _requests_for_activity(session)
        if resident_id is None or row["resident_id"] == resident_id
    ]
    loans = session.exec(select(Loan).order_by(Loan.created_at)).all()
    if resident_id is not None:
        loans = [loan for loan in loans if resident_id in {loan.borrower_id, loan.lender_id}]
    handoffs = []
    for handoff in session.exec(select(Handoff).order_by(Handoff.created_at)).all():
        data = _handoff_dict(session, handoff)
        if resident_id is None:
            handoffs.append(data)
            continue
        people = {data["recipient_id"], *(row["resident_id"] for row in data["allocations"])}
        if resident_id in people:
            handoffs.append(data)
    return {
        "requests": requests,
        "loans": [_loan_dict(loan) for loan in loans],
        "handoffs": handoffs,
    }


def projects_for(session: Session, resident_id: str) -> list[dict]:
    resident = _resident(session, resident_id)
    rows = session.exec(select(Project).where(Project.resident_id == resident.id)).all()
    return [_project_dict(session, project) for project in rows]


def my_stuff(session: Session, resident_id: str) -> dict:
    resident = _resident(session, resident_id)
    projects = session.exec(select(Project).where(Project.resident_id == resident.id)).all()
    return {
        "resident": _resident_dict(resident),
        "projects": [_project_dict(session, project) for project in projects],
        "inventory": inventory_view(session, resident.id),
    }


def update_tool(session: Session, project_id: str, tool_id: str, optional: bool | None, have_already: bool | None) -> dict:
    tool = session.get(ProjectTool, tool_id)
    if tool is None or tool.project_id != project_id:
        raise HTTPException(status_code=404, detail="Tool not found")
    if optional is not None:
        tool.optional = optional
    if have_already is not None:
        tool.have_already = have_already
    session.add(tool)
    session.commit()
    project = session.get(Project, project_id)
    return _project_dict(session, project)


def add_tool(session: Session, project_id: str, catalog_item_id: str, optional: bool = False) -> dict:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    _catalog_item(session, catalog_item_id)
    existing = session.exec(select(ProjectTool).where(ProjectTool.project_id == project.id)).all()
    session.add(
        ProjectTool(
            id=uuid4().hex,
            project_id=project.id,
            catalog_item_id=catalog_item_id,
            position=len(existing),
            optional=optional,
            have_already=False,
        )
    )
    session.commit()
    session.refresh(project)
    return _project_dict(session, project)


def remove_tool(session: Session, project_id: str, tool_id: str) -> dict:
    tool = session.get(ProjectTool, tool_id)
    if tool is None or tool.project_id != project_id:
        raise HTTPException(status_code=404, detail="Tool not found")
    session.delete(tool)
    session.commit()
    project = session.get(Project, project_id)
    return _project_dict(session, project)


def garden_count(session: Session) -> dict:
    rows = session.exec(select(GardenEvent)).all()
    return {"count": len(rows)}


def _create_project(session, resident, message, extraction, catalog) -> dict:
    created = now()
    project = Project(
        id=uuid4().hex,
        resident_id=resident.id,
        raw_text=message,
        window_start=extraction.window_start,
        window_end=extraction.window_end,
        created_at=created,
    )
    session.add(project)
    owned = _owned_ids(session, resident.id)
    for position, item_id in enumerate(extraction.item_ids):
        if item_id not in {item.id for item in catalog}:
            continue
        session.add(
            ProjectTool(
                id=uuid4().hex,
                project_id=project.id,
                catalog_item_id=item_id,
                position=position,
                optional=False,
                have_already=item_id in owned,
            )
        )
    session.commit()
    session.refresh(project)
    snowflake = snowflake_store.configured()
    return {
        "type": "tool_list",
        "project_id": project.id,
        "raw_text": message,
        "window": {"start": _iso(project.window_start), "end": _iso(project.window_end)},
        "snowflake": "ok" if snowflake else "not_configured",
        "tools": _project_dict(session, project)["tools"],
    }


def _draft_request(session, resident, message, extraction, catalog) -> dict:
    item = next(row for row in catalog if row.id == extraction.item_ids[0])
    request = Request(
        id=uuid4().hex,
        resident_id=resident.id,
        kind=extraction.intent,
        raw_text=message,
        catalog_item_id=item.id,
        quantity=extraction.quantity,
        area=extraction.area,
        window_start=extraction.window_start,
        window_end=extraction.window_end,
        status="pending_confirm",
        created_at=now(),
    )
    session.add(request)
    session.commit()
    return {
        "type": "confirmation",
        "request_id": request.id,
        "kind": request.kind,
        "item": {"id": item.id, "name": item.name},
        "quantity": request.quantity,
        "area": request.area,
        "window": {"start": _iso(request.window_start), "end": _iso(request.window_end)},
        "status": "pending_confirm",
    }


def _publish(session: Session, request: Request) -> None:
    if snowflake_store.configured():
        snowflake_store.insert_request(_request_dict(request))
        request.status = "synced"
    else:
        request.status = "open"
    session.add(request)
    session.commit()
    session.refresh(request)


def _match_open_request(session: Session, request_id: str) -> dict:
    current = _find_request(session, request_id)
    if current is None:
        return {"type": "no_match", "message": "That request is not open.", "request_id": request_id}
    if current["kind"] == "offer":
        needs = [
            row
            for row in _open_requests(session)
            if row["kind"] in DEMAND_KINDS and row["catalog_item_id"] == current["catalog_item_id"]
        ]
        if not needs:
            return {
                "type": "no_match",
                "request_id": request_id,
                "message": "No match yet. The request stays open.",
                "snowflake": _snowflake_flag(),
            }
        return _sync_need(session, needs[0])
    if current["kind"] in DEMAND_KINDS:
        return _sync_need(session, current)
    return {
        "type": "no_match",
        "request_id": request_id,
        "message": "No match yet. The request stays open.",
        "snowflake": _snowflake_flag(),
    }


def _sync_need(session: Session, need: dict) -> dict:
    existing = session.exec(
        select(Handoff).where(
            Handoff.need_request_id == need["id"],
            col(Handoff.status).in_(["proposed", "confirmed", "received"]),
        )
    ).all()
    confirmed = [row for row in existing if row.status in {"confirmed", "received"}]
    covered = 0
    for handoff in confirmed:
        covered += sum(row.quantity for row in _allocations(session, handoff.id))
    if covered >= int(need["quantity"]) and confirmed:
        return _match_card(session, confirmed[0], need, complete=True)
    proposed = next((row for row in existing if row.status == "proposed"), None)
    exclude = proposed.id if proposed else None
    offers = []
    for row in _open_requests(session):
        if row["kind"] != "offer" or row["catalog_item_id"] != need["catalog_item_id"]:
            continue
        available = int(row["quantity"]) - _allocated_elsewhere(session, row["id"], exclude)
        if available > 0:
            offers.append(Supply(row["id"], row["resident_id"], available))
    remaining_qty = int(need["quantity"]) - covered
    filled, left = fill_partial(remaining_qty, offers)
    if not filled:
        return {
            "type": "no_match",
            "request_id": need["id"],
            "message": "No match yet. The request stays open.",
            "snowflake": _snowflake_flag(),
        }
    if proposed is None:
        proposed = Handoff(
            id=uuid4().hex,
            need_request_id=need["id"],
            recipient_id=need["resident_id"],
            status="proposed",
            recipient_confirmed=False,
            created_at=now(),
        )
        session.add(proposed)
        session.flush()
    else:
        for old in _allocations(session, proposed.id):
            session.delete(old)
        session.flush()
    for take in filled:
        session.add(
            HandoffAllocation(
                id=uuid4().hex,
                handoff_id=proposed.id,
                offer_request_id=take.offer_id,
                resident_id=take.resident_id,
                quantity=take.quantity,
                donor_confirmed=False,
            )
        )
    session.commit()
    session.refresh(proposed)
    return _match_card(session, proposed, need, complete=left == 0)


def _allocated_elsewhere(session: Session, offer_id: str, exclude_handoff: str | None) -> int:
    total = 0
    rows = session.exec(
        select(HandoffAllocation).where(HandoffAllocation.offer_request_id == offer_id)
    ).all()
    for row in rows:
        if exclude_handoff and row.handoff_id == exclude_handoff:
            continue
        handoff = session.get(Handoff, row.handoff_id)
        if handoff and handoff.status in ACTIVE_HANDOFF:
            total += row.quantity
    return total


def _assert_free(session, lender_id, catalog_item_id, start, end, exclude_id):
    if end <= start:
        raise HTTPException(status_code=400, detail="Window end must be after start")
    bookings = _bookings(session, lender_id, catalog_item_id, exclude_id)
    for b0, b1 in bookings:
        if overlaps(start, end, b0 - BUFFER, b1 + BUFFER):
            duration = end - start
            return first_free_slot(bookings, start, start + timedelta(days=7), duration, BUFFER)
    return True


def _conflict(slot) -> None:
    if slot is None:
        raise HTTPException(
            status_code=409,
            detail={"message": "That window is taken, and there is no free slot in the next week."},
        )
    raise HTTPException(
        status_code=409,
        detail={
            "message": "That window is taken.",
            "next_free_slot": {"start": _iso(slot[0]), "end": _iso(slot[1])},
        },
    )


def _bookings(session, lender_id, catalog_item_id, exclude_id):
    rows = session.exec(
        select(Loan).where(
            Loan.lender_id == lender_id,
            Loan.catalog_item_id == catalog_item_id,
            col(Loan.status).in_(ACTIVE_LOAN),
        )
    ).all()
    return [
        (row.window_start, row.window_end)
        for row in rows
        if row.id != exclude_id
    ]


def _schedule_group(requests: list[dict], item: CatalogItem | None):
    scheduled = [
        SlotRequest(row["id"], row["window_start"], row["window_end"])
        for row in requests
        if row.get("window_start") and row.get("window_end")
    ]
    if len(scheduled) != len(requests) or not scheduled or item is None:
        return None, None
    spans = [row.win_end - row.win_start for row in scheduled]
    duration = min([timedelta(hours=item.default_loan_hours), *spans])
    plan, blocked = schedule_shared(scheduled, duration, BUFFER)
    if plan is None:
        return None, blocked.id
    return {
        key: {"start": _iso(slot[0]), "end": _iso(slot[1])}
        for key, slot in plan.items()
    }, None


def _owned_nearby(session: Session, requests: list[dict], inventory: dict, item_id: str) -> bool | None:
    if inventory["snowflake"] != "ok":
        return None
    for row in inventory["items"]:
        if row.get("catalog_item_id") != item_id or int(row.get("quantity") or 0) <= 0:
            continue
        for request in requests:
            resident = session.get(Resident, request["resident_id"])
            origin_x = resident.x if resident else 0
            origin_y = resident.y if resident else 0
            distance = abs(float(row["x"]) - origin_x) + abs(float(row["y"]) - origin_y)
            if distance <= DISTANCE_LIMIT:
                return True
    return False


def _cost(item: CatalogItem, households: int) -> dict:
    price = item.demo_price_cents
    buy_each = price * households
    return {
        "demo_price_cents": price,
        "households": households,
        "buy_each_cents": buy_each,
        "share_one_cents": price,
        "savings_cents": buy_each - price,
        "per_household_buy_cents": price,
        "per_household_share_cents": price // households if households else price,
    }


def _owned_ids(session: Session, resident_id: str) -> set[str]:
    view = inventory_view(session, resident_id)
    return {
        row["catalog_item_id"]
        for row in view["items"]
        if row.get("catalog_item_id") and int(row.get("quantity") or 0) > 0
    }


def _open_requests(session: Session) -> list[dict]:
    if snowflake_store.configured():
        return [row for row in snowflake_store.fetch_requests() if row["status"] == "open"]
    rows = session.exec(select(Request).where(Request.status == "open")).all()
    return [_request_dict(row) for row in rows]


def _requests_for_activity(session: Session) -> list[dict]:
    local = session.exec(select(Request)).all()
    pending = [_request_dict(row) for row in local if row.status == "pending_confirm"]
    if snowflake_store.configured():
        try:
            remote = snowflake_store.fetch_requests()
        except snowflake_store.SnowflakeError:
            return pending + [_request_dict(row) for row in local if row.status != "pending_confirm"]
        return pending + remote
    return [_request_dict(row) for row in local]


def _find_request(session: Session, request_id: str) -> dict | None:
    for row in _open_requests(session):
        if row["id"] == request_id:
            return row
    local = session.get(Request, request_id)
    if local is not None and local.status in {"open", "synced", "matched"}:
        if snowflake_store.configured() and local.status == "synced":
            for row in snowflake_store.fetch_requests():
                if row["id"] == request_id:
                    return row
        return _request_dict(local)
    if snowflake_store.configured():
        for row in snowflake_store.fetch_requests():
            if row["id"] == request_id:
                return row
    return None


def _set_request_status(session: Session, request_id: str, status: str, quantity: int | None = None) -> None:
    local = session.get(Request, request_id)
    if local is not None:
        if quantity is not None:
            local.quantity = quantity
        local.status = status
        session.add(local)
    if snowflake_store.configured():
        current_qty = quantity
        if current_qty is None and local is not None:
            current_qty = local.quantity
        if current_qty is None:
            current_qty = 0
        snowflake_store.update_request(request_id, status, current_qty)


def _garden(session: Session, kind: str, loan_id: str | None = None, handoff_id: str | None = None) -> None:
    if loan_id:
        existing = session.exec(select(GardenEvent).where(GardenEvent.loan_id == loan_id)).first()
        if existing:
            return
    if handoff_id:
        existing = session.exec(select(GardenEvent).where(GardenEvent.handoff_id == handoff_id)).first()
        if existing:
            return
    session.add(
        GardenEvent(
            id=uuid4().hex,
            kind=kind,
            loan_id=loan_id,
            handoff_id=handoff_id,
            created_at=now(),
        )
    )


def _project_dict(session: Session, project: Project) -> dict:
    catalog = {item.id: item for item in _catalog(session)}
    tools = session.exec(
        select(ProjectTool).where(ProjectTool.project_id == project.id).order_by(ProjectTool.position)
    ).all()
    view = inventory_view(session)
    tool_rows = []
    for tool in tools:
        item = catalog.get(tool.catalog_item_id)
        neighbors = []
        if view["snowflake"] == "ok" and item is not None:
            resident = session.get(Resident, project.resident_id)
            lenders = rank_lenders(
                NeedPoint(
                    resident_id=project.resident_id,
                    catalog_item_id=item.id,
                    x=resident.x if resident else 0,
                    y=resident.y if resident else 0,
                    window_start=project.window_start,
                    window_end=project.window_end,
                ),
                [_lender_item(row) for row in view["items"]],
                DISTANCE_LIMIT,
            )
            neighbors = lenders
        tool_rows.append(
            {
                "id": tool.id,
                "catalog_item_id": tool.catalog_item_id,
                "name": item.name if item else tool.catalog_item_id,
                "optional": tool.optional,
                "have_already": tool.have_already,
                "neighbors": neighbors,
            }
        )
    return {
        "id": project.id,
        "resident_id": project.resident_id,
        "raw_text": project.raw_text,
        "window": {"start": _iso(project.window_start), "end": _iso(project.window_end)},
        "tools": tool_rows,
    }


def _lender_item(row: dict) -> LenderItem:
    return LenderItem(
        id=str(row.get("inventory_id") or row.get("id") or ""),
        resident_id=str(row.get("resident_id") or ""),
        resident_name=str(row.get("resident_name") or ""),
        x=float(row.get("x") or 0),
        y=float(row.get("y") or 0),
        catalog_item_id=row.get("catalog_item_id") or "",
        quantity=int(row.get("quantity") or 0),
        willing_to_lend=bool(row.get("willing_to_lend")),
        condition_note=str(row.get("condition_note") or ""),
        windows=row.get("windows") or [],
    )


def _inventory_item(row: dict, match: CatalogItem | None) -> dict:
    willing = row.get("willing_to_lend")
    if isinstance(willing, str):
        willing = willing.strip().lower() in {"1", "true", "yes", "y"}
    item_key = match.id if match else row.get("catalog_item")
    return {
        "inventory_id": str(row.get("inventory_id") or row.get("id") or f"{row.get('resident_id')}:{item_key}"),
        "resident_id": row.get("resident_id"),
        "resident_name": row.get("resident_name"),
        "x": row.get("x") or 0,
        "y": row.get("y") or 0,
        "catalog_item": row.get("catalog_item"),
        "catalog_item_id": match.id if match else None,
        "catalog_name": match.name if match else row.get("catalog_item"),
        "quantity": row.get("quantity") or 0,
        "willing_to_lend": bool(willing),
        "condition_note": row.get("condition_note") or "",
        "windows": _windows(row.get("available_windows")),
    }


def _windows(value) -> list:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _match_label(label: str, catalog: list[CatalogItem]) -> CatalogItem | None:
    from app.catalog import match_catalog

    return match_catalog(label, catalog)


def _match_card(session: Session, handoff: Handoff, need: dict, complete: bool) -> dict:
    catalog = {item.id: item for item in _catalog(session)}
    item = catalog.get(need["catalog_item_id"])
    allocations = _allocations(session, handoff.id)
    filled = sum(row.quantity for row in allocations)
    return {
        "type": "match",
        "handoff_id": handoff.id,
        "need_request_id": need["id"],
        "recipient_id": handoff.recipient_id,
        "item": {"id": need["catalog_item_id"], "name": item.name if item else need["catalog_item_id"]},
        "quantity": need["quantity"],
        "filled_quantity": filled,
        "complete": complete,
        "allocations": [
            {
                "offer_request_id": row.offer_request_id,
                "resident_id": row.resident_id,
                "quantity": row.quantity,
            }
            for row in allocations
        ],
        "snowflake": _snowflake_flag(),
        "status": handoff.status,
    }


def _handoff_dict(session: Session, handoff: Handoff) -> dict:
    allocations = _allocations(session, handoff.id)
    return {
        "id": handoff.id,
        "need_request_id": handoff.need_request_id,
        "recipient_id": handoff.recipient_id,
        "status": handoff.status,
        "recipient_confirmed": handoff.recipient_confirmed,
        "allocations": [
            {
                "offer_request_id": row.offer_request_id,
                "resident_id": row.resident_id,
                "quantity": row.quantity,
                "donor_confirmed": row.donor_confirmed,
            }
            for row in allocations
        ],
    }


def _loan_dict(loan: Loan) -> dict:
    return {
        "loan_id": loan.id,
        "lender_id": loan.lender_id,
        "borrower_id": loan.borrower_id,
        "inventory_id": loan.inventory_id,
        "catalog_item_id": loan.catalog_item_id,
        "request_id": loan.request_id,
        "window": {"start": _iso(loan.window_start), "end": _iso(loan.window_end)},
        "status": loan.status,
        "quantity": loan.quantity,
    }


def _request_dict(row: Request) -> dict:
    return {
        "id": row.id,
        "resident_id": row.resident_id,
        "kind": row.kind,
        "raw_text": row.raw_text,
        "catalog_item_id": row.catalog_item_id,
        "quantity": row.quantity,
        "area": row.area,
        "window_start": row.window_start,
        "window_end": row.window_end,
        "status": row.status,
        "created_at": row.created_at,
    }


def _public_request(row: dict) -> dict:
    return {
        "id": row["id"],
        "resident_id": row["resident_id"],
        "kind": row["kind"],
        "raw_text": row.get("raw_text"),
        "catalog_item_id": row["catalog_item_id"],
        "quantity": row["quantity"],
        "area": row.get("area"),
        "window": {"start": _iso(row.get("window_start")), "end": _iso(row.get("window_end"))},
        "status": row["status"],
    }


def _resident_dict(resident: Resident) -> dict:
    return {
        "id": resident.id,
        "name": resident.name,
        "short_name": resident.short_name,
        "street": resident.street,
        "initials": resident.initials,
        "x": resident.x,
        "y": resident.y,
    }


def _catalog(session: Session) -> list[CatalogItem]:
    return session.exec(select(CatalogItem)).all()


def _catalog_item(session: Session, item_id: str) -> CatalogItem:
    item = session.get(CatalogItem, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Unknown catalog item")
    return item


def _resident(session: Session, resident_id: str) -> Resident:
    resident = session.get(Resident, resident_id)
    if resident is None:
        raise HTTPException(status_code=404, detail="Unknown resident")
    return resident


def _loan(session: Session, loan_id: str) -> Loan:
    loan = session.get(Loan, loan_id)
    if loan is None:
        raise HTTPException(status_code=404, detail="Loan not found")
    return loan


def _handoff(session: Session, handoff_id: str) -> Handoff:
    handoff = session.get(Handoff, handoff_id)
    if handoff is None:
        raise HTTPException(status_code=404, detail="Handoff not found")
    return handoff


def _allocations(session: Session, handoff_id: str) -> list[HandoffAllocation]:
    return session.exec(
        select(HandoffAllocation).where(HandoffAllocation.handoff_id == handoff_id)
    ).all()


def _latest_pending(session: Session, resident_id: str) -> Request | None:
    rows = session.exec(
        select(Request)
        .where(Request.resident_id == resident_id, Request.status == "pending_confirm")
        .order_by(Request.created_at)
    ).all()
    return rows[-1] if rows else None


def _latest_loan_for_lender(session: Session, resident_id: str) -> Loan | None:
    rows = session.exec(
        select(Loan)
        .where(Loan.lender_id == resident_id, Loan.status == "requested")
        .order_by(Loan.created_at)
    ).all()
    return rows[-1] if rows else None


def _latest_handoff_for(session: Session, resident_id: str) -> Handoff | None:
    rows = session.exec(select(Handoff).where(Handoff.status == "proposed").order_by(Handoff.created_at)).all()
    for handoff in reversed(rows):
        if handoff.recipient_id == resident_id and not handoff.recipient_confirmed:
            return handoff
        for allocation in _allocations(session, handoff.id):
            if allocation.resident_id == resident_id and not allocation.donor_confirmed:
                return handoff
    return None


def _snowflake_flag() -> str:
    return "ok" if snowflake_store.configured() else "not_configured"


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    return str(value)

