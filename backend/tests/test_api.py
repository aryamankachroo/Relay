from sqlmodel import select

from app.catalog import BOOKSHELF_TOOLS
from app.clock import now as utcnow
from app.db import session_scope
from app.extract import Extraction, _extraction_from_payload
from app.models import CatalogItem


def _say(client, resident_id, message):
    response = client.post("/api/chat", json={"resident_id": resident_id, "message": message})
    assert response.status_code == 200, response.text
    return response.json()


def test_health_reports_snowflake_unconfigured(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["snowflake"] == "not_configured"


def test_bookshelf_tool_list(client):
    card = _say(client, "avery", "I'm building a bookshelf this weekend.")
    assert card["type"] == "tool_list"
    assert card["snowflake"] == "not_configured"
    assert [tool["catalog_item_id"] for tool in card["tools"]] == list(BOOKSHELF_TOOLS)
    assert all(tool["have_already"] is False and tool["neighbors"] == [] for tool in card["tools"])
    assert card["window"]["start"]


def _catalog():
    with session_scope() as session:
        return list(session.exec(select(CatalogItem)))


def test_project_payload_keeps_tools_outside_the_catalog(client):
    payload = {
        "intent": "project",
        "items": [{"name": "Socket set"}, {"name": "Drill"}, {"name": "socket  set"}, {"name": "Car jack"}],
    }
    extraction = _extraction_from_payload(payload, "building a car", _catalog(), utcnow())
    assert extraction.intent == "project"
    assert extraction.item_ids == ["drill"]
    assert extraction.extra_names == ["Socket set", "Car jack"]


def test_need_payload_ignores_tools_outside_the_catalog(client):
    payload = {"intent": "need", "items": [{"name": "Socket set"}]}
    assert _extraction_from_payload(payload, "I need a socket set", _catalog(), utcnow()) is None


def test_fallback_reads_fixing_as_a_project(client):
    card = _say(client, "avery", "im fixing a flat tyre")
    assert card["type"] == "no_match"
    assert card["message"] == "Name the project or the tools, and the list can be edited."


def test_project_with_only_new_tools_makes_a_tool_list(client, monkeypatch):
    def fake_extract(_message, _catalog_rows):
        return Extraction("project", [], 1, None, None, None, ["Socket set", "Car jack"])

    monkeypatch.setattr("app.logic.extract_message", fake_extract)
    card = _say(client, "avery", "i am building a car this weekend")
    assert card["type"] == "tool_list"
    assert [(tool["catalog_item_id"], tool["name"]) for tool in card["tools"]] == [
        (None, "Socket set"),
        (None, "Car jack"),
    ]
    assert all(tool["neighbors"] == [] for tool in card["tools"])


def test_seed_adds_the_snowflake_cast(client):
    residents = {row["id"]: row for row in client.get("/api/residents").json()}
    assert {"avery", "jordan", "sam", "riley", "noor"} <= residents.keys()
    assert residents["jordan"]["name"] == "Jordan Lee"
    assert residents["jordan"]["initials"] == "JL"
    assert (residents["sam"]["x"], residents["sam"]["y"]) == (3, 3)
    assert (residents["noor"]["x"], residents["noor"]["y"]) == (40, 0)
    duplicate = client.post(
        "/api/residents",
        json={"id": "riley", "name": "Riley Park", "street": "21 Willow Court"},
    )
    assert duplicate.status_code == 409


def test_notebook_partial_match_and_garden(client):
    assert _say(client, "jordan", "I have 12 notebooks to give away")["type"] == "confirmation"
    assert _say(client, "jordan", "yes")["type"] == "no_match"
    assert _say(client, "sam", "I have 8 notebooks")["type"] == "confirmation"
    assert _say(client, "sam", "yes")["type"] == "no_match"
    assert _say(client, "avery", "I need 20 notebooks for a school supply drive")["type"] == "confirmation"
    match = _say(client, "avery", "yes")
    assert match["type"] == "match"
    assert match["recipient_id"] == "avery"
    assert match["complete"] is True
    assert match["filled_quantity"] == 20
    assert sorted(row["quantity"] for row in match["allocations"]) == [8, 12]

    for resident_id in ("avery", "jordan", "sam"):
        confirmed = client.post(
            f"/api/handoffs/{match['handoff_id']}/confirm",
            json={"resident_id": resident_id},
        )
        assert confirmed.status_code == 200

    received = client.post(f"/api/handoffs/{match['handoff_id']}/received")
    assert received.status_code == 200
    assert received.json()["status"] == "received"
    assert client.get("/api/garden").json()["count"] == 1


def test_confirm_publishes_the_named_request_not_the_latest(client):
    notebooks = _say(client, "avery", "I need 20 notebooks Saturday")
    ladder = _say(client, "avery", "I have a ladder to lend")
    assert notebooks["type"] == ladder["type"] == "confirmation"

    published = client.post(
        f"/api/requests/{notebooks['request_id']}/confirm",
        json={"resident_id": "avery"},
    )
    assert published.status_code == 200
    assert published.json()["request_id"] == notebooks["request_id"]
    statuses = {row["id"]: row["status"] for row in client.get("/api/activity").json()["requests"]}
    assert statuses[notebooks["request_id"]] == "open"
    assert statuses[ladder["request_id"]] == "pending_confirm"

    again = client.post(
        f"/api/requests/{notebooks['request_id']}/confirm",
        json={"resident_id": "avery"},
    )
    assert again.status_code == 409
    stranger = client.post(
        f"/api/requests/{ladder['request_id']}/confirm",
        json={"resident_id": "jordan"},
    )
    assert stranger.status_code == 404


def test_loan_conflict_pickup_and_return(client):
    offered = client.post(
        "/api/inventory",
        json={
            "resident_id": "jordan",
            "name": "Drill",
            "category": "Tools",
            "quantity": 2,
            "condition": "Good",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert offered.status_code == 201, offered.text
    body = {
        "borrower_id": "avery",
        "lender_id": "jordan",
        "catalog_item_id": "drill",
        "inventory_id": offered.json()["inventory_id"],
        "window_start": "2026-10-17T09:00:00",
        "window_end": "2026-10-17T11:00:00",
    }
    missing = client.post("/api/loans", json={**body, "lender_id": "nobody"})
    assert missing.status_code == 404
    self_borrow = client.post("/api/loans", json={**body, "borrower_id": "jordan"})
    assert self_borrow.status_code == 400
    too_many = client.post("/api/loans", json={**body, "quantity": 999})
    assert too_many.status_code == 400
    first = client.post("/api/loans", json=body)
    assert first.status_code == 201
    assert first.json()["status"] == "requested"
    second = client.post("/api/loans", json=body)
    assert second.status_code == 409
    assert second.json()["detail"]["next_free_slot"]["start"] == "2026-10-17T11:30:00+00:00"

    loan_id = first.json()["loan_id"]
    accepted = client.post(f"/api/loans/{loan_id}/respond", json={"action": "accept"})
    assert accepted.json()["status"] == "confirmed"
    assert client.post(f"/api/loans/{loan_id}/pickup").json()["status"] == "picked_up"
    assert client.post(f"/api/loans/{loan_id}/return").json()["status"] == "returned"
    assert client.get("/api/garden").json()["count"] == 1


def test_shared_drill_demand_waits_for_inventory(client):
    for resident_id, day in (
        ("avery", "Saturday"),
        ("jordan", "Sunday"),
        ("sam", "Friday"),
    ):
        assert _say(client, resident_id, f"I need a drill {day}")["type"] == "confirmation"
        _say(client, resident_id, "yes")
    demand = client.get("/api/shared-demand").json()
    assert demand["snowflake"] == "not_configured"
    group = demand["groups"][0]
    assert group["catalog_item_id"] == "drill"
    assert group["request_count"] == 3
    assert group["shared"] is False
    assert group["reason"] == "inventory_unavailable"
    assert group["cost"] is None
    assert len(group["schedule"]) == 3

    started = client.post("/api/shared-demand/drill/group-buy")
    assert started.json() == {"catalog_item_id": "drill", "started": True, "mock": True}


def test_shelf_writes_stay_with_the_owner(client):
    created = client.post(
        "/api/inventory",
        json={
            "resident_id": "avery",
            "name": "Wheelbarrow",
            "category": "Garden",
            "quantity": 0,
            "condition": "Fair",
            "notes": "One wheel",
            "available_to_lend": True,
        },
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["inventory_id"]
    listed = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    saved = next(row for row in listed["items"] if row["inventory_id"] == item_id)
    assert saved["catalog_item"] == "Wheelbarrow"
    assert saved["quantity"] == 0
    assert saved["category"] == "Garden"

    duplicate = client.post(
        "/api/inventory",
        json={"resident_id": "avery", "name": "wheelbarrow", "category": "Garden", "quantity": 1},
    )
    assert duplicate.status_code == 409

    stolen = client.patch(
        f"/api/inventory/{item_id}",
        json={"resident_id": "jordan", "name": "Wheelbarrow", "category": "Garden", "quantity": 1},
    )
    assert stolen.status_code == 403

    removed = client.delete("/api/inventory/" + item_id, params={"resident_id": "avery"})
    assert removed.status_code == 200
    after = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    assert all(row["inventory_id"] != item_id for row in after["items"])


def test_backboard_then_regex_fallback(client, monkeypatch):
    from app.extract import extract_message

    catalog = _catalog()
    monkeypatch.setattr("app.extract._from_gemini", lambda *_args, **_kwargs: None)

    def backboard(_text, _catalog, _now):
        return Extraction("need", ["notebooks"], 20, None, None, None)

    monkeypatch.setattr("app.extract._from_backboard", backboard)
    parsed = extract_message("I need 20 notebooks Saturday morning", catalog)
    assert parsed.intent == "need"
    assert parsed.item_ids == ["notebooks"]
    assert parsed.quantity == 20

    monkeypatch.setattr("app.extract._from_backboard", lambda *_args, **_kwargs: None)
    fallback = extract_message("I need 20 notebooks Saturday morning", catalog)
    assert fallback.intent == "need"
    assert fallback.item_ids == ["notebooks"]

    card = _say(client, "avery", "I'm building a bookshelf this weekend.")
    assert card["type"] == "tool_list"


def test_local_dataset_covers_heavy_inventory(client):
    stuff = client.get("/api/my-stuff").json()
    assert stuff["resident"]["name"] == "Avery Moss"
    assert stuff["inventory"]["snowflake"] == "not_configured"
    assert stuff["inventory"]["items"] == []
    block = client.get("/api/neighborhood").json()
    assert block["snowflake"] == "not_configured"
    assert block["items"]
    assert all(row["distance"] <= 400 for row in block["items"])
    assert all(row["catalog_item"] != "Drill" for row in block["items"])
    everyone = client.get("/api/inventory").json()
    assert everyone["snowflake"] == "not_configured"
    assert len(everyone["items"]) >= 5000
