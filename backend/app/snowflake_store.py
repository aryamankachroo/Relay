"""Snowflake reads and writes.

INVENTORY is the teammate's uploaded dataset. REQUESTS is where confirmed
needs, offers, and borrow asks go once credentials exist. Both statements
are isolated so the column names can be pointed at the real table later.
"""

from datetime import datetime

from app.clock import aware, now
from app.config import snowflake_settings

# Expected INVENTORY columns. Change this query when the upload is visible.
INVENTORY_SQL = """
SELECT
    RESIDENT_ID,
    RESIDENT_NAME,
    X,
    Y,
    CATALOG_ITEM,
    QUANTITY,
    WILLING_TO_LEND,
    CONDITION_NOTE,
    AVAILABLE_WINDOWS
FROM INVENTORY
"""

REQUEST_INSERT_SQL = """
INSERT INTO REQUESTS (
    ID, RESIDENT_ID, KIND, RAW_TEXT, CATALOG_ITEM, QUANTITY,
    AREA, WINDOW_START, WINDOW_END, STATUS, CREATED_AT
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
"""

REQUESTS_SQL = """
SELECT
    ID, RESIDENT_ID, KIND, RAW_TEXT, CATALOG_ITEM, QUANTITY,
    AREA, WINDOW_START, WINDOW_END, STATUS, CREATED_AT
FROM REQUESTS
"""

REQUEST_UPDATE_SQL = """
UPDATE REQUESTS
SET STATUS = %s, QUANTITY = %s
WHERE ID = %s
"""


class SnowflakeError(RuntimeError):
    pass


def configured() -> bool:
    return snowflake_settings() is not None


def status() -> dict:
    if not configured():
        return {"snowflake": "not_configured"}
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"snowflake": "ok"}
    except Exception as exc:
        return {"snowflake": "error", "snowflake_message": str(exc)}


def fetch_inventory() -> dict:
    if not configured():
        return {"snowflake": "not_configured", "items": []}
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(INVENTORY_SQL)
            columns = [col[0].lower() for col in cursor.description]
            items = [dict(zip(columns, row)) for row in cursor.fetchall()]
        return {"snowflake": "ok", "items": items}
    except Exception as exc:
        return {"snowflake": "error", "snowflake_message": str(exc), "items": []}


def insert_request(row: dict) -> None:
    if not configured():
        return
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(
                REQUEST_INSERT_SQL,
                (
                    row["id"],
                    row["resident_id"],
                    row["kind"],
                    row["raw_text"],
                    row["catalog_item_id"],
                    row["quantity"],
                    row.get("area"),
                    _iso(row.get("window_start")),
                    _iso(row.get("window_end")),
                    "open",
                    _iso(row.get("created_at")) or now().isoformat(timespec="seconds"),
                ),
            )
            conn.commit()
    except Exception as exc:
        raise SnowflakeError(str(exc)) from exc


def fetch_requests() -> list[dict]:
    if not configured():
        return []
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(REQUESTS_SQL)
            columns = [col[0].lower() for col in cursor.description]
            rows = []
            for raw in cursor.fetchall():
                item = dict(zip(columns, raw))
                rows.append(_normalize_request(item))
        return rows
    except Exception as exc:
        raise SnowflakeError(str(exc)) from exc


RESIDENTS_DDL = """
CREATE TABLE IF NOT EXISTS RESIDENTS (
    CLERK_USER_ID VARCHAR NOT NULL,
    NAME          VARCHAR NOT NULL,
    EMAIL         VARCHAR,
    INITIALS      VARCHAR,
    STREET        VARCHAR,
    UPDATED_AT    TIMESTAMP_TZ
)
"""

MERGE_RESIDENT_SQL = """
MERGE INTO RESIDENTS AS t
USING (
    SELECT %s AS CLERK_USER_ID, %s AS NAME, %s AS EMAIL, %s AS INITIALS, %s AS STREET
) AS s
ON t.CLERK_USER_ID = s.CLERK_USER_ID
WHEN MATCHED THEN UPDATE SET
    NAME = s.NAME,
    EMAIL = s.EMAIL,
    INITIALS = s.INITIALS,
    STREET = s.STREET,
    UPDATED_AT = CURRENT_TIMESTAMP()
WHEN NOT MATCHED THEN INSERT (CLERK_USER_ID, NAME, EMAIL, INITIALS, STREET, UPDATED_AT)
VALUES (s.CLERK_USER_ID, s.NAME, s.EMAIL, s.INITIALS, s.STREET, CURRENT_TIMESTAMP())
"""


def upsert_profile(clerk_user_id: str, name: str, email: str, initials: str, street: str) -> None:
    if not configured():
        raise SnowflakeError("Snowflake is not configured")
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(RESIDENTS_DDL)
            except Exception as exc:
                message = str(exc)
                if "Insufficient privileges" not in message and "already exists" not in message.lower():
                    raise
            cursor.execute(MERGE_RESIDENT_SQL, (clerk_user_id, name, email, initials, street))
            conn.commit()
    except Exception as exc:
        raise SnowflakeError(str(exc)) from exc


def update_request(request_id: str, status: str, quantity: int) -> None:
    if not configured():
        return
    try:
        with _connect() as conn:
            cursor = conn.cursor()
            cursor.execute(REQUEST_UPDATE_SQL, (status, quantity, request_id))
            conn.commit()
    except Exception as exc:
        raise SnowflakeError(str(exc)) from exc


def _connect():
    settings = snowflake_settings()
    if settings is None:
        raise SnowflakeError("Snowflake is not configured")
    try:
        import snowflake.connector
    except ImportError as exc:
        raise SnowflakeError("snowflake-connector-python is not installed") from exc
    return snowflake.connector.connect(
        account=settings["SNOWFLAKE_ACCOUNT"],
        user=settings["SNOWFLAKE_USER"],
        password=settings["SNOWFLAKE_PASSWORD"],
        warehouse=settings["SNOWFLAKE_WAREHOUSE"],
        database=settings["SNOWFLAKE_DATABASE"],
        schema=settings["SNOWFLAKE_SCHEMA"],
        role=settings["SNOWFLAKE_ROLE"],
        login_timeout=10,
        network_timeout=10,
    )


def _iso(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(timespec="seconds")
    return str(value)


def _normalize_request(item: dict) -> dict:
    return {
        "id": item.get("id"),
        "resident_id": item.get("resident_id"),
        "kind": item.get("kind"),
        "raw_text": item.get("raw_text") or "",
        "catalog_item_id": item.get("catalog_item"),
        "quantity": int(item.get("quantity") or 0),
        "area": item.get("area"),
        "window_start": _parse_dt(item.get("window_start")),
        "window_end": _parse_dt(item.get("window_end")),
        "status": item.get("status"),
        "created_at": _parse_dt(item.get("created_at")),
    }


def _parse_dt(value):
    if value is None or isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return aware(datetime.fromisoformat(value))
    return None
