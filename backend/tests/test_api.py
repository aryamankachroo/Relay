from app.catalog import BOOKSHELF_TOOLS


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
    body = {
        "borrower_id": "avery",
        "lender_id": "jordan",
        "catalog_item_id": "drill",
        "window_start": "2026-10-17T09:00:00",
        "window_end": "2026-10-17T11:00:00",
    }
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


def test_my_stuff_and_neighborhood_are_empty_without_snowflake(client):
    stuff = client.get("/api/my-stuff").json()
    assert stuff["resident"]["name"] == "Avery Moss"
    assert stuff["inventory"]["snowflake"] == "not_configured"
    assert stuff["inventory"]["items"] == []
    block = client.get("/api/neighborhood").json()
    assert block["snowflake"] == "not_configured"
    assert block["items"] == []


def test_inventory_question_answers_from_snowflake_rows(client, monkeypatch):
    from app import snowflake_store

    monkeypatch.setattr(
        snowflake_store,
        "fetch_inventory",
        lambda: {
            "snowflake": "ok",
            "items": [
                {
                    "resident_id": "avery",
                    "resident_name": "Avery Moss",
                    "catalog_item": "Step ladder",
                    "quantity": 1,
                    "willing_to_lend": True,
                },
                {
                    "resident_id": "jordan",
                    "resident_name": "Jordan Lee",
                    "catalog_item": "Step ladder",
                    "quantity": 2,
                    "willing_to_lend": True,
                },
            ],
        },
    )

    response = _say(client, "avery", "Who has a ladder?")

    assert response["type"] == "inventory_answer"
    assert response["snowflake"] == "ok"
    assert "Jordan Lee: 2 Step ladder" in response["message"]
    assert "Avery Moss" not in response["message"]


def test_inventory_question_fails_closed_when_snowflake_is_unavailable(client, monkeypatch):
    from app import snowflake_store

    monkeypatch.setattr(
        snowflake_store,
        "fetch_inventory",
        lambda: {"snowflake": "not_configured", "items": []},
    )

    response = client.post(
        "/api/agent/answer",
        json={"message": "Who has a ladder?"},
    )

    assert response.status_code == 200
    assert response.json()["type"] == "inventory_answer"
    assert response.json()["snowflake"] == "not_configured"
    assert "Snowflake is unavailable" in response.json()["message"]


def test_agent_answer_route_ignores_non_inventory_questions(client):
    response = client.post(
        "/api/agent/answer",
        json={"message": "What tools do I need for a bookshelf?"},
    )

    assert response.status_code == 200
    assert response.json() == {"type": "not_inventory_question"}
