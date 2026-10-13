"""Clerk session tokens. These tests sign their own keys and never call Clerk."""

import base64
import json
import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

ISSUER = "https://relay-test.clerk.accounts.dev"

READS = (
    "/api/residents",
    "/api/catalog",
    "/api/inventory?resident_id=avery",
    "/api/my-stuff?resident_id=avery",
    "/api/neighborhood?resident_id=avery",
    "/api/activity",
    "/api/projects?resident_id=avery",
    "/api/shared-demand",
    "/api/garden",
    "/api/me?clerk_user_id=avery",
)


def test_issuer_comes_from_the_publishable_key_when_unset(monkeypatch):
    from app.config import clerk_issuer

    host = "relay-test.clerk.accounts.dev$"
    key = "pk_test_" + base64.b64encode(host.encode()).decode().rstrip("=")
    monkeypatch.setenv("CLERK_ISSUER", "")
    monkeypatch.setenv("VITE_CLERK_PUBLISHABLE_KEY", "")
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", key)
    assert clerk_issuer() == "https://relay-test.clerk.accounts.dev"


def _pair(kid="relay-test"):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    jwk = json.loads(RSAAlgorithm.to_jwk(private.public_key()))
    jwk.update({"kid": kid, "use": "sig", "alg": "RS256"})
    return private, jwk


def _token(private, sub, iss=ISSUER, exp=None, kid="relay-test"):
    payload = {"sub": sub, "iss": iss, "iat": int(time.time()), "exp": int(exp if exp is not None else time.time() + 120)}
    return jwt.encode(payload, private, algorithm="RS256", headers={"kid": kid})


def _enable(monkeypatch, jwks):
    monkeypatch.setenv("RELAY_AUTH_DISABLED", "")
    monkeypatch.setenv("CLERK_SECRET_KEY", "sk_test_example")
    monkeypatch.setenv("CLERK_ISSUER", ISSUER)
    monkeypatch.setattr("app.auth._clerk_jwks", lambda: {"keys": jwks})


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def test_missing_expired_tampered_and_wrong_instance_tokens_are_rejected(client, monkeypatch):
    private, jwk = _pair()
    _enable(monkeypatch, [jwk])
    for path in READS:
        assert client.get(path).status_code == 401, path
    assert client.delete("/api/inventory/missing", params={"resident_id": "avery"}).status_code == 401
    assert client.post("/api/loans/missing/pickup").status_code == 401
    assert client.post("/api/loans/missing/return").status_code == 401
    assert client.post("/api/loans/missing/respond", json={"action": "accept"}).status_code == 401
    assert client.post("/api/handoffs/missing/confirm", json={"resident_id": "avery"}).status_code == 401
    assert client.post("/api/handoffs/missing/received").status_code == 401

    expired = _token(private, "avery", exp=time.time() - 30)
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(expired)).status_code == 401

    tampered = _token(private, "avery")
    flipped = tampered[:-4] + ("aaaa" if not tampered.endswith("aaaa") else "bbbb")
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(flipped)).status_code == 401

    other = _token(private, "avery", iss="https://other.clerk.accounts.dev")
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(other)).status_code == 401

    stranger_key, _other_jwk = _pair("other-instance")
    foreign = _token(stranger_key, "avery", kid="other-instance")
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(foreign)).status_code == 401

    timeless = jwt.encode(
        {"sub": "avery", "iss": ISSUER},
        private,
        algorithm="RS256",
        headers={"kid": "relay-test"},
    )
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(timeless)).status_code == 401

    monkeypatch.setenv("CLERK_ISSUER", "")
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", "")
    monkeypatch.setenv("VITE_CLERK_PUBLISHABLE_KEY", "")
    assert client.get("/api/my-stuff", params={"resident_id": "avery"}, headers=_auth(_token(private, "avery"))).status_code == 503


def test_two_signed_in_accounts_loan_and_partial_handoff(client, monkeypatch):
    private, jwk = _pair()
    _enable(monkeypatch, [jwk])
    avery = _auth(_token(private, "avery"))
    jordan = _auth(_token(private, "jordan"))

    offered = client.post(
        "/api/inventory",
        headers=jordan,
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
    stolen = client.post(
        "/api/inventory",
        headers=avery,
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
    assert stolen.status_code == 403

    loan = client.post(
        "/api/loans",
        headers=avery,
        json={
            "borrower_id": "avery",
            "lender_id": "jordan",
            "catalog_item_id": "drill",
            "inventory_id": offered.json()["inventory_id"],
            "window_start": "2026-10-19T09:00:00",
            "window_end": "2026-10-19T11:00:00",
        },
    )
    assert loan.status_code == 201, loan.text
    loan_id = loan.json()["loan_id"]
    borrower_accepts = client.post(f"/api/loans/{loan_id}/respond", headers=avery, json={"action": "accept"})
    assert borrower_accepts.status_code == 403
    accepted = client.post(f"/api/loans/{loan_id}/respond", headers=jordan, json={"action": "accept"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "confirmed"

    offer = client.post("/api/chat", headers=jordan, json={"resident_id": "jordan", "message": "I have 5 wagons to give away Saturday"})
    assert offer.status_code == 200, offer.text
    offer_body = offer.json()
    assert offer_body["type"] == "confirmation"
    published = client.post(
        f"/api/requests/{offer_body['request_id']}/confirm",
        headers=jordan,
        json={"resident_id": "jordan"},
    )
    assert published.status_code == 200, published.text
    need = client.post("/api/chat", headers=avery, json={"resident_id": "avery", "message": "I need 20 wagons Saturday"})
    assert need.status_code == 200, need.text
    matched = client.post("/api/chat", headers=avery, json={"resident_id": "avery", "message": "yes"})
    assert matched.status_code == 200, matched.text
    match = matched.json()
    assert match["type"] == "match"
    assert match["filled_quantity"] == 5
    handoff_id = match["handoff_id"]

    for_both = client.post(f"/api/handoffs/{handoff_id}/confirm", headers=avery, json={"resident_id": "jordan"})
    assert for_both.status_code == 403
    recipient = client.post(f"/api/handoffs/{handoff_id}/confirm", headers=avery, json={"resident_id": "avery"})
    assert recipient.status_code == 200
    assert recipient.json()["status"] == "proposed"
    donor = client.post(f"/api/handoffs/{handoff_id}/confirm", headers=jordan, json={"resident_id": "jordan"})
    assert donor.status_code == 200
    assert donor.json()["status"] == "confirmed"
    donor_receives = client.post(f"/api/handoffs/{handoff_id}/received", headers=jordan)
    assert donor_receives.status_code == 403
    received = client.post(f"/api/handoffs/{handoff_id}/received", headers=avery)
    assert received.status_code == 200, received.text
    activity = client.get("/api/activity", headers=avery)
    assert activity.status_code == 200
    statuses = {row["id"]: row for row in activity.json()["requests"]}
    assert statuses[need.json()["request_id"]]["status"] == "open"
    assert statuses[need.json()["request_id"]]["quantity"] == 15
