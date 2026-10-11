#!/usr/bin/env python3
"""Checks the Snowflake demo data through the running API. Standard library only.

Before each run:
  1. Stop the server and delete backend/relay.db
  2. Run seed_requests.sql in Snowsight
  3. Start the server again

Then, from the backend folder:
  python snowflake/smoke_test.py
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
failed = 0


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(
        BASE + path, data=data, method=method, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except ValueError:
            return error.code, raw.decode(errors="replace")
    except urllib.error.URLError as error:
        print(f"Cannot reach {BASE}: {error.reason}. Is uvicorn running?")
        sys.exit(2)


def check(name, ok, detail=""):
    global failed
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"\n      {detail}"))
    if not ok:
        failed += 1


def say(resident_id, message):
    return call("POST", "/api/chat", {"resident_id": resident_id, "message": message})[1]


status, health = call("GET", "/health")
check("health reports snowflake ok", status == 200 and health.get("snowflake") == "ok", health)
if not (status == 200 and health.get("snowflake") == "ok"):
    print("Fix the connection first. Check backend/.env and restart the server.")
    sys.exit(1)

residents = [
    ("jordan", "Jordan Lee", "Jordan", "16 Willow Court", 2, 1),
    ("sam", "Sam Ortiz", "Sam", "18 Willow Court", 3, 3),
    ("riley", "Riley Park", "Riley", "21 Willow Court", 5, 2),
    ("noor", "Noor Haddad", "Noor", "9 Far Road", 40, 0),
]
codes = [
    call("POST", "/api/residents", {"id": r[0], "name": r[1], "short_name": r[2], "street": r[3], "x": r[4], "y": r[5]})[0]
    for r in residents
]
check("neighbors exist in the local database", all(c in (201, 409) for c in codes), codes)

_, hood = call("GET", "/api/neighborhood?resident_id=avery")
seen = {(row["resident_id"], row["catalog_item"]) for row in hood.get("items", [])}
check("neighborhood lists 17 items", len(seen) == 17, sorted(seen))
check("neighborhood hides Noor's drill and Sam's ladder", ("noor", "Cordless drill") not in seen and ("sam", "Step ladder") not in seen, sorted(seen))

card = say("avery", "I'm building a bookshelf this weekend.")
neighbors = {t["catalog_item_id"]: [n["resident_id"] for n in t["neighbors"]] for t in card.get("tools", [])}
expected = {
    "drill": [],
    "saw": ["jordan", "maya", "sam", "elena"],
    "level": ["jordan", "priya"],
    "sander": ["chris", "sam"],
    "clamps": ["jordan", "maya", "riley", "priya"],
    "tape-measure": ["chris", "riley"],
}
check("bookshelf tool list finds the right neighbors", neighbors == expected, neighbors)

check("drill request asks for confirmation", say("avery", "I need a drill Saturday").get("type") == "confirmation")
say("avery", "yes")
_, demand = call("GET", "/api/shared-demand")
group = next((g for g in demand.get("groups", []) if g["catalog_item_id"] == "drill"), None)
ok = bool(group) and group["request_count"] >= 3 and group["shared"] is True
check("drill becomes a shared need with 3 households", ok, group)
if ok:
    cost = group["cost"]
    check(
        "cost compares buying alone with sharing one",
        cost["buy_each_cents"] == 6000 * group["request_count"] and cost["share_one_cents"] == 6000,
        cost,
    )
    print(f"      {group['request_count']} households: ${cost['buy_each_cents'] / 100:.0f} alone, ${cost['share_one_cents'] / 100:.0f} shared")

check("notebook request asks for confirmation", say("avery", "I need 20 notebooks for a school supply drive").get("type") == "confirmation")
match = say("avery", "yes")
parts = sorted((a["resident_id"], a["quantity"]) for a in match.get("allocations", []))
check(
    "notebooks fill 20 from two neighbors",
    match.get("type") == "match" and match.get("complete") is True and parts == [("jordan", 12), ("sam", 8)],
    match,
)

print()
print("All checks passed." if failed == 0 else f"{failed} check(s) failed.")
sys.exit(1 if failed else 0)
