"""Database engine, session factory, and declarative base.

SQLite via SQLAlchemy 2.0 async. advanced-alchemy's Litestar plugin handles
per-request session lifecycle; this module just exposes the raw engine and a
session factory for CLI helpers (seed, migrate).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime

from sqlalchemy import DateTime, MetaData
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from mock_server.config import get_settings


def utc_now() -> datetime:
    """Return a timezone-aware UTC datetime (SQLAlchemy default factory)."""
    return datetime.now(UTC)


# Shared naming convention keeps migrations predictable even without Alembic.
NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

    # SQLite stores naive datetimes; ``timezone=True`` keeps Python-side
    # handling consistent so incoming tz-aware values round-trip as UTC.
    type_annotation_map = {
        datetime: DateTime(timezone=True),
    }


_engine = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    """Return the lazily initialised async engine."""
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(settings.db_url, future=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    """Return the lazily initialised async session factory."""
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(bind=get_engine(), expire_on_commit=False, class_=AsyncSession)
    return _sessionmaker


async def create_all() -> None:
    """Create all tables (SQLite only; no migrations for a reference example)."""
    # Import models so they register with Base.metadata before create_all.
    from mock_server import models  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def drop_all() -> None:
    """Drop all tables."""
    from mock_server import models  # noqa: F401

    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


async def session_scope() -> AsyncIterator[AsyncSession]:
    """Async generator yielding a session with automatic commit/rollback."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


def reset_engine() -> None:
    """Reset cached engine/sessionmaker (used by tests when switching DBs)."""
    global _engine, _sessionmaker
    _engine = None
    _sessionmaker = None
