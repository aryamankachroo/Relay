import os
from collections.abc import Iterator
from contextlib import contextmanager

from sqlmodel import Session, SQLModel, create_engine
from sqlalchemy.pool import StaticPool

from app.config import ROOT, load_env

load_env()

_engine = None


def database_url() -> str:
    return os.environ.get("DATABASE_URL") or f"sqlite:///{ROOT / 'relay.db'}"


def get_engine():
    global _engine
    if _engine is None:
        url = database_url()
        kwargs: dict = {"connect_args": {"check_same_thread": False}}
        if url in {"sqlite://", "sqlite:///:memory:"}:
            kwargs["poolclass"] = StaticPool
        _engine = create_engine(url, **kwargs)
    return _engine


def init_db() -> None:
    import app.models  # noqa: F401

    SQLModel.metadata.create_all(get_engine())


def reset_db() -> None:
    import app.models  # noqa: F401

    engine = get_engine()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)


@contextmanager
def session_scope() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
