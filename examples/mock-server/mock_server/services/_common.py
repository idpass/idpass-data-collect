"""Helpers shared between service modules."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from mock_server.errors import PreconditionFailedError


def new_uuid() -> str:
    """Return a new string UUID4."""
    return str(uuid4())


def _as_utc(value: datetime) -> datetime:
    """Normalise a datetime to a UTC-aware instance.

    SQLite returns naive datetimes from ``DateTime(timezone=True)`` columns;
    we treat them as UTC so comparisons against client-supplied ISO strings
    (which may carry ``Z`` / ``+00:00``) round-trip cleanly.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def check_if_match(header_value: str | None, current_updated_at: datetime) -> None:
    """Validate an optional ``If-Match`` header carrying an ISO updated_at.

    Behaviour:
    * header missing — skip (updates without guard allowed, documented)
    * header present & matches — pass (tolerance: < 1 ms)
    * header present & mismatches — raise :class:`PreconditionFailedError`
    """
    if not header_value:
        return
    try:
        provided = datetime.fromisoformat(header_value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise PreconditionFailedError(
            f"If-Match header is not a valid ISO 8601 datetime: {header_value!r}"
        ) from exc
    provided_utc = _as_utc(provided)
    current_utc = _as_utc(current_updated_at)
    # ~1ms tolerance to survive trivial DB round-trip formatting differences.
    if abs((provided_utc - current_utc).total_seconds()) > 0.001:
        raise PreconditionFailedError(
            "If-Match precondition failed: resource has been modified since it was read."
        )
