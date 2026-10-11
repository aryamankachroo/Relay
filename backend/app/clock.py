from datetime import datetime, timezone


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value
