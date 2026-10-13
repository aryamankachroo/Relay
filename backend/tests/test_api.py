from datetime import datetime

import pytest
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
    assert all(tool["have_already"] is False and isinstance(tool["neighbors"], list) for tool in card["tools"])
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
            "quantity": 1,
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


def test_requests_without_a_clerk_token_are_rejected(client, monkeypatch):
    monkeypatch.setenv("RELAY_AUTH_DISABLED", "")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_example")
    response = client.get("/api/my-stuff")
    assert response.status_code == 401


def test_shelf_keeps_its_id_and_metadata_when_snowflake_has_none(client, monkeypatch):
    created = client.post(
        "/api/inventory",
        json={
            "resident_id": "avery",
            "name": "Ladder",
            "category": "Garden",
            "quantity": 1,
            "condition": "Fair",
            "notes": "Porch",
            "available_to_lend": True,
        },
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["inventory_id"]
    monkeypatch.setattr(
        "app.logic.snowflake_store.fetch_inventory",
        lambda: {
            "snowflake": "ok",
            "items": [
                {
                    "resident_id": "avery",
                    "resident_name": "Avery Moss",
                    "catalog_item": "Ladder",
                    "quantity": 1,
                    "willing_to_lend": True,
                    "condition_note": "",
                }
            ],
        },
    )
    listed = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    row = next(item for item in listed["items"] if item["inventory_id"] == item_id)
    assert row["category"] == "Garden"
    assert row["condition"] == "Fair"
    assert row["inventory_id"] == item_id


def test_failed_snowflake_mirror_does_not_keep_the_shelf_row(client, monkeypatch):
    from app.snowflake_store import SnowflakeError

    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)

    def fail(_row):
        raise SnowflakeError("warehouse down")

    monkeypatch.setattr("app.logic.snowflake_store.upsert_inventory", fail)
    response = client.post(
        "/api/inventory",
        json={
            "resident_id": "avery",
            "name": "Wagon",
            "category": "Garden",
            "quantity": 1,
            "condition": "Good",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert response.status_code == 502
    listed = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    assert all(row["catalog_item"] != "Wagon" for row in listed["items"])


def test_backboard_http_errors_fall_through_to_regex(client, monkeypatch):
    import httpx

    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("BACKBOARD_API_KEY", "test-key")
    calls = []

    def post(url, headers=None, json=None, timeout=None):
        calls.append({"url": url, "timeout": timeout, "key": (headers or {}).get("X-API-Key")})

        class Response:
            def raise_for_status(self):
                request = httpx.Request("POST", url)
                response = httpx.Response(401, request=request)
                raise httpx.HTTPStatusError("unauthorized", request=request, response=response)

            def json(self):
                return {"content": "{"}

        return Response()

    monkeypatch.setattr(httpx, "post", post)
    yes = client.post("/api/chat", json={"resident_id": "avery", "message": "yes"})
    assert yes.status_code == 200
    assert calls == []

    card = _say(client, "avery", "I need 20 notebooks Saturday morning")
    assert card["type"] == "confirmation"
    assert calls[0]["url"] == "https://app.backboard.io/api/threads/messages"
    assert calls[0]["timeout"] == 20
    assert calls[0]["key"] == "test-key"

    def malformed(url, headers=None, json=None, timeout=None):
        class Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {"content": "not json", "items": 12}

        return Response()

    monkeypatch.setattr(httpx, "post", malformed)
    again = _say(client, "jordan", "I need 20 notebooks Saturday morning")
    assert again["type"] == "confirmation"


def test_sqlite_failure_removes_the_snowflake_row(client, monkeypatch):
    remote = {}

    def upsert(row):
        remote[row["inventory_id"]] = dict(row)

    def delete_id(inventory_id):
        remote.pop(inventory_id, None)

    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)
    monkeypatch.setattr("app.logic.snowflake_store.upsert_inventory", upsert)
    monkeypatch.setattr("app.logic.snowflake_store.delete_inventory_by_id", delete_id)
    monkeypatch.setattr("app.logic._commit_session", lambda _session: (_ for _ in ()).throw(RuntimeError("sqlite failed")))
    with pytest.raises(RuntimeError, match="sqlite failed"):
        client.post(
            "/api/inventory",
            json={
                "resident_id": "avery",
                "name": "Cooler",
                "category": "Household",
                "quantity": 1,
                "condition": "Good",
                "notes": "",
                "available_to_lend": True,
            },
        )
    assert remote == {}
    listed = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    assert all(row["catalog_item"] != "Cooler" for row in listed["items"])


def test_inventory_id_survives_rename(client, monkeypatch):
    remote = {}

    def upsert(row):
        remote[row["inventory_id"]] = dict(row)

    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)
    monkeypatch.setattr("app.logic.snowflake_store.upsert_inventory", upsert)
    monkeypatch.setattr("app.logic.snowflake_store.delete_inventory_by_id", lambda _item_id: None)
    monkeypatch.setattr(
        "app.logic.snowflake_store.fetch_inventory",
        lambda: {"snowflake": "ok", "items": list(remote.values())},
    )
    created = client.post(
        "/api/inventory",
        json={
            "resident_id": "avery",
            "name": "Ladder",
            "category": "Garden",
            "quantity": 1,
            "condition": "Fair",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["inventory_id"]
    renamed = client.patch(
        f"/api/inventory/{item_id}",
        json={
            "resident_id": "avery",
            "name": "Step ladder",
            "category": "Garden",
            "quantity": 1,
            "condition": "Fair",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert renamed.status_code == 200, renamed.text
    assert list(remote) == [item_id]
    assert remote[item_id]["catalog_item"] == "Step ladder"
    assert remote[item_id]["category"] == "Garden"
    listed = client.get("/api/inventory", params={"resident_id": "avery"}).json()
    row = next(item for item in listed["items"] if item["inventory_id"] == item_id)
    assert row["catalog_item"] == "Step ladder"
    assert row["category"] == "Garden"
    assert row["condition"] == "Fair"


def test_two_bookings_cannot_exceed_the_shelf(client):
    from concurrent.futures import ThreadPoolExecutor

    from app.db import session_scope
    from app.logic import create_loan
    from fastapi import HTTPException

    offered = client.post(
        "/api/inventory",
        json={
            "resident_id": "jordan",
            "name": "Drill",
            "category": "Tools",
            "quantity": 1,
            "condition": "Good",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert offered.status_code == 201, offered.text
    inventory_id = offered.json()["inventory_id"]

    def book(borrower_id):
        with session_scope() as session:
            try:
                create_loan(
                    session,
                    borrower_id,
                    "jordan",
                    "drill",
                    datetime.fromisoformat("2026-10-18T09:00:00"),
                    datetime.fromisoformat("2026-10-18T11:00:00"),
                    1,
                    inventory_id,
                )
            except HTTPException as exc:
                return exc.status_code
            return 201

    with ThreadPoolExecutor(max_workers=2) as pool:
        codes = list(pool.map(book, ("avery", "sam")))
    assert sorted(codes) == [201, 409]


def test_two_accounts_keep_a_partial_handoff(client):
    offer = _say(client, "jordan", "I have 5 wagons to give away Saturday")
    assert offer["type"] == "confirmation"
    published = client.post(f"/api/requests/{offer['request_id']}/confirm", json={"resident_id": "jordan"})
    assert published.status_code == 200, published.text
    need = _say(client, "avery", "I need 20 wagons Saturday")
    assert need["type"] == "confirmation"
    match = _say(client, "avery", "yes")
    assert match["type"] == "match"
    assert match["filled_quantity"] == 5
    handoff_id = match["handoff_id"]

    only_recipient = client.post(f"/api/handoffs/{handoff_id}/confirm", json={"resident_id": "avery"})
    assert only_recipient.status_code == 200
    assert only_recipient.json()["status"] == "proposed"
    outsider = client.post(f"/api/handoffs/{handoff_id}/confirm", json={"resident_id": "sam"})
    assert outsider.status_code == 403
    donor = client.post(f"/api/handoffs/{handoff_id}/confirm", json={"resident_id": "jordan"})
    assert donor.status_code == 200
    assert donor.json()["status"] == "confirmed"
    received = client.post(f"/api/handoffs/{handoff_id}/received")
    assert received.status_code == 200
    statuses = {row["id"]: row for row in client.get("/api/activity").json()["requests"]}
    assert statuses[need["request_id"]]["status"] == "open"
    assert statuses[need["request_id"]]["quantity"] == 15

    second = _say(client, "sam", "I have 10 wagons to give away Saturday")
    assert second["type"] == "confirmation"
    again = client.post(f"/api/requests/{second['request_id']}/confirm", json={"resident_id": "sam"})
    assert again.status_code == 200, again.text
    body = again.json()
    assert body["type"] == "match"
    assert body["filled_quantity"] == 10
    assert body["complete"] is False
    second_id = body["handoff_id"]
    assert client.post(f"/api/handoffs/{second_id}/confirm", json={"resident_id": "avery"}).status_code == 200
    finished = client.post(f"/api/handoffs/{second_id}/confirm", json={"resident_id": "sam"})
    assert finished.status_code == 200
    assert finished.json()["status"] == "confirmed"
    assert client.post(f"/api/handoffs/{second_id}/received").status_code == 200
    after = {row["id"]: row for row in client.get("/api/activity").json()["requests"]}
    assert after[need["request_id"]]["status"] == "open"
    assert after[need["request_id"]]["quantity"] == 5


def test_remote_inventory_cannot_be_taken_over(client, monkeypatch):
    remote = {
        "jordan-ladder": {
            "inventory_id": "jordan-ladder",
            "resident_id": "jordan",
            "resident_name": "Jordan Lee",
            "catalog_item": "Ladder",
            "quantity": 1,
            "willing_to_lend": True,
            "condition_note": "",
            "x": 2,
            "y": 1,
            "category": "Garden",
            "condition": "Good",
        }
    }
    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)
    monkeypatch.setattr("app.logic.snowflake_store.fetch_inventory_row", lambda item_id: remote.get(item_id))
    stolen = client.patch(
        "/api/inventory/jordan-ladder",
        json={"resident_id": "avery", "name": "Ladder", "category": "Garden", "quantity": 1, "condition": "Good", "notes": "", "available_to_lend": True},
    )
    assert stolen.status_code == 403
    missing = client.patch(
        "/api/inventory/missing-item",
        json={"resident_id": "avery", "name": "Ladder", "category": "Garden", "quantity": 1, "condition": "Good", "notes": "", "available_to_lend": True},
    )
    assert missing.status_code == 404


def test_failed_update_restores_the_remote_row(client, monkeypatch):
    store = {}

    def upsert(row):
        store[row["inventory_id"]] = dict(row)

    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)
    monkeypatch.setattr("app.logic.snowflake_store.upsert_inventory", upsert)
    monkeypatch.setattr("app.logic.snowflake_store.fetch_inventory_row", lambda item_id: store.get(item_id))
    monkeypatch.setattr("app.logic.snowflake_store.delete_inventory_by_id", lambda item_id: store.pop(item_id, None))
    created = client.post(
        "/api/inventory",
        json={"resident_id": "avery", "name": "Ladder", "category": "Garden", "quantity": 1, "condition": "Fair", "notes": "", "available_to_lend": True},
    )
    assert created.status_code == 201, created.text
    item_id = created.json()["inventory_id"]
    monkeypatch.setattr("app.logic._commit_session", lambda _session: (_ for _ in ()).throw(RuntimeError("sqlite failed")))
    with pytest.raises(RuntimeError, match="sqlite failed"):
        client.patch(
            f"/api/inventory/{item_id}",
            json={"resident_id": "avery", "name": "Step ladder", "category": "Garden", "quantity": 0, "condition": "Fair", "notes": "", "available_to_lend": True},
        )
    assert store[item_id]["catalog_item"] == "Ladder"
    assert store[item_id]["quantity"] == 1


def test_zero_quantity_is_sent_to_snowflake():
    from app.snowflake_store import _inventory_params, _inventory_update_params

    row = {
        "inventory_id": "item-1",
        "resident_id": "avery",
        "resident_name": "Avery Moss",
        "x": 0,
        "y": 0,
        "catalog_item": "Fan",
        "quantity": 0,
        "willing_to_lend": False,
        "condition_note": "",
        "category": "Household",
        "condition": "Good",
    }
    assert _inventory_params(row)[6] == 0
    assert _inventory_update_params(row)[5] == 0


def test_loans_stay_in_one_city_and_free_dates_do_not_block(client):
    from app.db import session_scope
    from app.models import Resident

    with session_scope() as session:
        jordan = session.get(Resident, "jordan")
        jordan.city = "Seattle"
        session.add(jordan)
        session.commit()
    denied = client.post(
        "/api/loans",
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "window_start": "2026-10-20T09:00:00",
            "window_end": "2026-10-20T11:00:00",
        },
    )
    assert denied.status_code == 400
    with session_scope() as session:
        jordan = session.get(Resident, "jordan")
        jordan.city = "Charlotte"
        jordan.x = 500
        session.add(jordan)
        session.commit()
    far = client.post(
        "/api/loans",
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "window_start": "2026-10-20T09:00:00",
            "window_end": "2026-10-20T11:00:00",
        },
    )
    assert far.status_code == 400
    with session_scope() as session:
        jordan = session.get(Resident, "jordan")
        jordan.x = 2
        session.add(jordan)
        session.commit()
    offered = client.post(
        "/api/inventory",
        json={"resident_id": "jordan", "name": "Drill", "category": "Tools", "quantity": 1, "condition": "Good", "notes": "", "available_to_lend": True},
    )
    assert offered.status_code == 201, offered.text
    first = client.post(
        "/api/loans",
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "inventory_id": offered.json()["inventory_id"],
            "window_start": "2026-10-20T09:00:00",
            "window_end": "2026-10-20T11:00:00",
        },
    )
    assert first.status_code == 201, first.text
    later = client.post(
        "/api/loans",
        json={
            "borrower_id": "sam",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "inventory_id": offered.json()["inventory_id"],
            "window_start": "2026-10-25T09:00:00",
            "window_end": "2026-10-25T11:00:00",
        },
    )
    assert later.status_code == 201, later.text


def test_a_new_shelf_item_can_fill_a_project(client):
    offered = client.post(
        "/api/inventory",
        json={"resident_id": "jordan", "name": "Step ladder", "category": "Tools", "quantity": 1, "condition": "Good", "notes": "", "available_to_lend": True},
    )
    assert offered.status_code == 201, offered.text
    assert offered.json()["catalog_item_id"] == "ladder"
    card = _say(client, "avery", "I'm building a bookshelf this weekend.")
    drill = next(tool for tool in card["tools"] if tool["catalog_item_id"] == "drill")
    client.post(
        "/api/inventory",
        json={"resident_id": "jordan", "name": "Drill", "category": "Tools", "quantity": 1, "condition": "Good", "notes": "", "available_to_lend": True},
    )
    card = _say(client, "avery", "I'm building a bookshelf this weekend.")
    drill = next(tool for tool in card["tools"] if tool["catalog_item_id"] == "drill")
    assert any(row["resident_id"] == "jordan" for row in drill["neighbors"])


def test_a_second_offer_keeps_the_pending_handoff(client):
    first = _say(client, "jordan", "I have 12 wagons to give away Saturday")
    assert client.post(f"/api/requests/{first['request_id']}/confirm", json={"resident_id": "jordan"}).status_code == 200
    need = _say(client, "avery", "I need 20 wagons Saturday")
    opened = _say(client, "avery", "yes")
    assert opened["type"] == "match"
    assert opened["filled_quantity"] == 12
    assert opened["complete"] is False
    second = _say(client, "sam", "I have 8 wagons to give away Saturday")
    updated = client.post(f"/api/requests/{second['request_id']}/confirm", json={"resident_id": "sam"})
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["complete"] is True
    assert sorted(row["quantity"] for row in body["allocations"]) == [8, 12]


def test_failed_remote_only_update_restores_the_row(client, monkeypatch):
    store = {
        "remote-ladder": {
            "inventory_id": "remote-ladder",
            "resident_id": "avery",
            "resident_name": "Avery Moss",
            "catalog_item": "Ladder",
            "quantity": 1,
            "willing_to_lend": True,
            "condition_note": "",
            "x": 0,
            "y": 0,
            "category": "Garden",
            "condition": "Fair",
        }
    }

    def upsert(row):
        store[row["inventory_id"]] = dict(row)

    monkeypatch.setattr("app.logic.snowflake_store.configured", lambda: True)
    monkeypatch.setattr("app.logic.snowflake_store.upsert_inventory", upsert)
    monkeypatch.setattr("app.logic.snowflake_store.fetch_inventory_row", lambda item_id: dict(store[item_id]) if item_id in store else None)
    monkeypatch.setattr("app.logic.snowflake_store.delete_inventory_by_id", lambda item_id: store.pop(item_id, None))
    monkeypatch.setattr("app.logic._commit_session", lambda _session: (_ for _ in ()).throw(RuntimeError("sqlite failed")))
    with pytest.raises(RuntimeError, match="sqlite failed"):
        client.patch(
            "/api/inventory/remote-ladder",
            json={
                "resident_id": "avery",
                "name": "Step ladder",
                "category": "Garden",
                "quantity": 1,
                "condition": "Fair",
                "notes": "",
                "available_to_lend": True,
            },
        )
    assert store["remote-ladder"]["catalog_item"] == "Ladder"


def test_alias_can_be_booked_and_reversed_windows_are_rejected(client):
    offered = client.post(
        "/api/inventory",
        json={
            "resident_id": "jordan",
            "name": "Step ladder",
            "category": "Tools",
            "quantity": 1,
            "condition": "Good",
            "notes": "",
            "available_to_lend": True,
        },
    )
    assert offered.status_code == 201, offered.text
    booked = client.post(
        "/api/loans",
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "ladder",
            "inventory_id": offered.json()["inventory_id"],
            "window_start": "2026-10-22T09:00:00",
            "window_end": "2026-10-22T11:00:00",
        },
    )
    assert booked.status_code == 201, booked.text
    reversed_window = client.post(
        "/api/loans",
        json={
            "borrower_id": "sam",
            "lender_id": "jordan",
            "catalog_item_id": "ladder",
            "inventory_id": offered.json()["inventory_id"],
            "window_start": "2026-10-23T12:00:00",
            "window_end": "2026-10-23T11:00:00",
        },
    )
    assert reversed_window.status_code == 400
    moved = client.post(
        f"/api/loans/{booked.json()['loan_id']}/respond",
        json={"action": "propose_time", "window_start": "2026-10-24T15:00:00", "window_end": "2026-10-24T14:00:00"},
    )
    assert moved.status_code == 400


def test_separate_processes_cannot_double_book(tmp_path):
    import multiprocessing
    import os

    from sqlalchemy.pool import NullPool
    from sqlmodel import Session, SQLModel, create_engine

    from app.models import CatalogItem, Resident, ShelfItem
    from tests.booking_worker import book

    url = f"sqlite:///{tmp_path / 'book.db'}"
    engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 5}, poolclass=NullPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Resident(id="avery", name="Avery Moss", short_name="Avery", street="14 Willow Court", initials="AM", x=0, y=0, city="Charlotte"))
        session.add(Resident(id="jordan", name="Jordan Lee", short_name="Jordan", street="16 Willow Court", initials="JL", x=2, y=1, city="Charlotte"))
        session.add(Resident(id="sam", name="Sam Ortiz", short_name="Sam", street="18 Willow Court", initials="SO", x=3, y=3, city="Charlotte"))
        session.add(CatalogItem(id="drill", name="Drill", aliases='["drill"]', category="tool", demo_price_cents=1, default_loan_hours=4))
        session.add(ShelfItem(id="jordan-drill", resident_id="jordan", name="Drill", category="Tools", quantity=1, condition="Good", available_to_lend=True, catalog_item_id="drill"))
        session.commit()
    engine.dispose()
    gate = str(tmp_path / "gate")
    os.makedirs(gate, exist_ok=True)
    payload = {"url": url, "gate": gate, "inventory_id": "jordan-drill"}
    context = multiprocessing.get_context("spawn")
    with context.Pool(2) as pool:
        codes = pool.map(book, [{**payload, "name": "avery", "borrower_id": "avery"}, {**payload, "name": "sam", "borrower_id": "sam"}])
    assert sorted(codes) == [201, 409]


def test_shelf_changes_replace_the_stock_row(client):
    from app.models import StockRow

    with session_scope() as session:
        session.add(
            StockRow(
                id="jordan:drill",
                resident_id="jordan",
                resident_name="Jordan Lee",
                x=2,
                y=1,
                catalog_item="Drill",
                quantity=1,
                willing_to_lend=True,
            )
        )
        session.commit()
    disabled = client.patch(
        "/api/inventory/jordan:drill",
        json={
            "resident_id": "jordan",
            "name": "Drill",
            "category": "Tools",
            "quantity": 0,
            "condition": "Good",
            "notes": "",
            "available_to_lend": False,
        },
    )
    assert disabled.status_code == 200, disabled.text
    booked = client.post(
        "/api/loans",
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "inventory_id": "jordan:drill",
            "window_start": "2026-10-26T09:00:00",
            "window_end": "2026-10-26T11:00:00",
        },
    )
    assert booked.status_code == 404
    removed = client.delete("/api/inventory/jordan:drill", params={"resident_id": "jordan"})
    assert removed.status_code == 200, removed.text
    listed = client.get("/api/inventory", params={"resident_id": "jordan"}).json()
    assert all(row["inventory_id"] != "jordan:drill" for row in listed["items"])
    assert all(str(row["catalog_item"]).lower() != "drill" for row in listed["items"])


def test_project_suggestions_stay_in_the_city(client):
    from app.models import Resident, ShelfItem

    with session_scope() as session:
        session.add(Resident(id="near-seattle", name="Seattle Neighbor", short_name="Sea", street="1 Pine", initials="SN", x=1, y=1, city="Seattle"))
        session.add(Resident(id="near-charlotte", name="Close Neighbor", short_name="Close", street="2 Willow", initials="CN", x=2, y=1, city="Charlotte"))
        session.add(ShelfItem(id="sea-drill", resident_id="near-seattle", name="Drill", category="Tools", quantity=1, condition="Good", available_to_lend=True, catalog_item_id="drill"))
        session.add(ShelfItem(id="close-drill", resident_id="near-charlotte", name="Drill", category="Tools", quantity=1, condition="Good", available_to_lend=True, catalog_item_id="drill"))
        session.commit()
    card = _say(client, "avery", "I'm building a bookshelf this weekend.")
    drill = next(tool for tool in card["tools"] if tool["catalog_item_id"] == "drill")
    neighbors = {row["resident_id"] for row in drill["neighbors"]}
    assert "near-seattle" not in neighbors
    assert "near-charlotte" in neighbors


