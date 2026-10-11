import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env"

SNOWFLAKE_KEYS = (
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USER",
    "SNOWFLAKE_PASSWORD",
    "SNOWFLAKE_WAREHOUSE",
    "SNOWFLAKE_DATABASE",
    "SNOWFLAKE_SCHEMA",
    "SNOWFLAKE_ROLE",
)

AVERY_ID = "avery"
DISTANCE_LIMIT = 25
LOAN_BUFFER_MINUTES = 30


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def snowflake_settings() -> dict[str, str] | None:
    values = {key: os.environ.get(key, "").strip() for key in SNOWFLAKE_KEYS}
    if any(not value for value in values.values()):
        return None
    return values


def gemini_api_key() -> str:
    return os.environ.get("GEMINI_API_KEY", "").strip()


def gemini_model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
