"""Verify the Clerk session token and use that account as the resident."""

import os
import time

import httpx
import jwt
from fastapi import HTTPException, Request

from app.config import clerk_issuer, clerk_secret_key

_jwks: dict = {"at": 0.0, "body": None}


def auth_disabled() -> bool:
    return os.environ.get("RELAY_AUTH_DISABLED", "").strip() == "1"


def current_actor(request: Request) -> str | None:
    """The signed-in Clerk user, or None when tests turn verification off."""
    if auth_disabled():
        return None
    if not clerk_secret_key():
        raise HTTPException(status_code=503, detail="Clerk is not configured on the API.")
    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Sign in again so Relay can verify this request.")
    return _subject(token.strip())


def same_resident(actor: str | None, claimed: str) -> str:
    if actor is None:
        return claimed
    if claimed != actor:
        raise HTTPException(status_code=403, detail="This account cannot act for another resident.")
    return actor


def _subject(token: str) -> str:
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        keys = _clerk_jwks().get("keys") or []
        match = next((row for row in keys if row.get("kid") == kid), None)
        if match is None:
            raise HTTPException(status_code=401, detail="Sign in again so Relay can verify this request.")
        key = jwt.PyJWK.from_dict(match).key
        options = {"verify_aud": False, "verify_iss": bool(clerk_issuer())}
        decode_args = {"issuer": clerk_issuer()} if clerk_issuer() else {}
        payload = jwt.decode(token, key, algorithms=["RS256"], options=options, **decode_args)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Sign in again so Relay can verify this request.") from exc
    subject = payload.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=401, detail="Sign in again so Relay can verify this request.")
    return subject


def _clerk_jwks() -> dict:
    now = time.time()
    if _jwks["body"] is not None and now - _jwks["at"] < 600:
        return _jwks["body"]
    try:
        response = httpx.get(
            "https://api.clerk.com/v1/jwks",
            headers={"Authorization": f"Bearer {clerk_secret_key()}"},
            timeout=5,
        )
        response.raise_for_status()
        body = response.json()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Clerk could not be reached to verify this request.") from exc
    if not isinstance(body, dict):
        raise HTTPException(status_code=503, detail="Clerk could not be reached to verify this request.")
    _jwks["body"] = body
    _jwks["at"] = now
    return body
