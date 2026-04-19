"""Liveness endpoint — no auth, used by Docker healthchecks and smoke tests."""

from __future__ import annotations

import logging

from litestar import Controller, get
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class HealthController(Controller):
    """Exposes ``GET /health``."""

    path = "/health"
    tags = ["meta"]

    @get("/", include_in_schema=True)
    async def health(self, db_session: AsyncSession) -> dict[str, str]:
        """Return ``{status, db}``. DB check runs a trivial ``SELECT 1``."""
        try:
            await db_session.execute(text("SELECT 1"))
            db_status = "ok"
        except Exception:  # pragma: no cover - defensive
            logger.exception("health check DB probe failed")
            db_status = "error"
        return {"status": "ok", "db": db_status}
