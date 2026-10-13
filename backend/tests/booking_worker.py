"""Run one loan booking in a fresh process. Imported by the concurrency test."""

import os


def book(payload: dict) -> int:
    os.environ["DATABASE_URL"] = payload["url"]
    os.environ["RELAY_AUTH_DISABLED"] = "1"
    os.environ["RELAY_BOOKING_GATE"] = payload["gate"]
    os.environ["RELAY_BOOKING_NAME"] = payload["name"]
    os.environ["RELAY_BOOKING_PEERS"] = "2"
    os.environ["GEMINI_API_KEY"] = ""
    os.environ["BACKBOARD_API_KEY"] = ""
    for key in (
        "SNOWFLAKE_ACCOUNT",
        "SNOWFLAKE_USER",
        "SNOWFLAKE_PASSWORD",
        "SNOWFLAKE_WAREHOUSE",
        "SNOWFLAKE_DATABASE",
        "SNOWFLAKE_SCHEMA",
        "SNOWFLAKE_ROLE",
    ):
        os.environ[key] = ""

    import app.db as database

    database._engine = None
    from datetime import datetime

    from fastapi import HTTPException

    from app.db import session_scope
    from app.logic import create_loan

    with session_scope() as session:
        try:
            create_loan(
                session,
                payload["borrower_id"],
                "jordan",
                "drill",
                datetime.fromisoformat("2026-10-21T09:00:00"),
                datetime.fromisoformat("2026-10-21T11:00:00"),
                1,
                payload["inventory_id"],
            )
        except HTTPException as exc:
            return exc.status_code
        return 201
