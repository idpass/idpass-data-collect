"""ApiClientService: CRUD + authentication for OAuth2 API clients.

Secrets are bcrypt-hashed on create/rotate; the plaintext is returned to the
caller exactly once and never persisted. ``authenticate()`` keeps a
constant-time failure path (a dummy bcrypt verify runs even when the
``client_id`` is unknown) so that response time does not leak account
existence.
"""

from __future__ import annotations

import logging
import secrets
from typing import cast

from passlib.hash import bcrypt
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.db import utc_now
from mock_server.errors import ConflictError, NotFoundError
from mock_server.models.api_client import ApiClient

logger = logging.getLogger(__name__)

# Pre-computed dummy hash used to give missing-client requests a comparable
# computation cost to "client exists, wrong secret" requests.  Generated once
# at import time so the bcrypt round cost matches real hashes.
_DUMMY_HASH = bcrypt.hash("__mock_dummy_secret__")

# ``mc_`` (mock-client) prefix keeps auto-generated IDs recognisable in logs.
_CLIENT_ID_PREFIX = "mc_"


def _generate_client_id() -> str:
    """Generate a short, URL-safe client_id like ``mc_AbCdEf12``."""
    # 6 bytes of entropy → 8 chars base64url, plenty for a mock.
    return f"{_CLIENT_ID_PREFIX}{secrets.token_urlsafe(6)}"


def _generate_client_secret() -> str:
    """Generate a 32-byte URL-safe secret (≈43 chars)."""
    return secrets.token_urlsafe(32)


class ApiClientService:
    """All ApiClient CRUD, authentication, and rotation operations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ----- reads -------------------------------------------------------------

    async def list(
        self,
        *,
        active_only: bool = True,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[ApiClient], int]:
        """List clients, optionally filtering out revoked ones.

        Returns ``(rows, total)`` where ``total`` ignores pagination.
        """
        limit = max(1, min(limit, 500))
        offset = max(0, offset)

        stmt = select(ApiClient)
        count_stmt = select(func.count(ApiClient.uuid))

        if active_only:
            stmt = stmt.where(ApiClient.revoked_at.is_(None))
            count_stmt = count_stmt.where(ApiClient.revoked_at.is_(None))

        stmt = stmt.order_by(ApiClient.created_at.desc(), ApiClient.uuid.asc()).limit(limit).offset(offset)
        rows = list((await self.session.execute(stmt)).scalars().all())
        total = int((await self.session.execute(count_stmt)).scalar_one())
        return rows, total

    async def get(self, uuid: str) -> ApiClient:
        """Fetch a client by UUID or raise :class:`NotFoundError`."""
        client = await self.session.get(ApiClient, uuid)
        if client is None:
            raise NotFoundError(f"ApiClient {uuid} not found")
        return client

    async def get_by_client_id(self, client_id: str) -> ApiClient | None:
        """Look up a client by its public client_id. Returns ``None`` if missing."""
        stmt = select(ApiClient).where(ApiClient.client_id == client_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    # ----- writes ------------------------------------------------------------

    async def create(
        self,
        *,
        name: str | None = None,
        client_id: str | None = None,
        description: str | None = None,
        scopes: list[str] | None = None,
    ) -> tuple[ApiClient, str]:
        """Create a new client. Returns ``(client, plaintext_secret)``.

        The plaintext secret is never stored — only its bcrypt hash. The
        returned plaintext MUST be shown to the operator immediately; it cannot
        be recovered later.
        """
        effective_client_id = (client_id or "").strip() or _generate_client_id()
        plaintext = _generate_client_secret()
        hashed = bcrypt.hash(plaintext)

        client = ApiClient(
            client_id=effective_client_id,
            client_secret_hash=hashed,
            name=(name or None),
            description=(description or None),
            scopes=list(scopes or []),
        )
        self.session.add(client)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            await self.session.rollback()
            raise ConflictError(f"client_id '{effective_client_id}' is already in use.") from exc
        await self.session.refresh(client)
        logger.info("api_client created: uuid=%s client_id=%s", client.uuid, client.client_id)
        return client, plaintext

    async def rotate_secret(self, uuid: str) -> tuple[ApiClient, str]:
        """Issue a new secret, invalidating the old one. Returns plaintext once."""
        client = await self.get(uuid)
        plaintext = _generate_client_secret()
        client.client_secret_hash = bcrypt.hash(plaintext)
        await self.session.flush()
        await self.session.refresh(client)
        logger.info("api_client secret rotated: uuid=%s client_id=%s", client.uuid, client.client_id)
        return client, plaintext

    async def revoke(self, uuid: str) -> ApiClient:
        """Mark a client as revoked (soft-delete)."""
        client = await self.get(uuid)
        if client.revoked_at is None:
            client.revoked_at = utc_now()
            await self.session.flush()
            await self.session.refresh(client)
            logger.info("api_client revoked: uuid=%s client_id=%s", client.uuid, client.client_id)
        return client

    async def delete(self, uuid: str) -> None:
        """Hard-delete a client. Useful for tests; prefer :meth:`revoke` in prod."""
        client = await self.get(uuid)
        await self.session.delete(client)
        await self.session.flush()
        logger.info("api_client deleted: uuid=%s client_id=%s", client.uuid, client.client_id)

    # ----- auth --------------------------------------------------------------

    async def authenticate(self, client_id: str, client_secret: str) -> ApiClient | None:
        """Verify credentials. Returns the client on success, ``None`` otherwise.

        Runs a dummy bcrypt verify on the "client not found" path so timing
        does not leak account existence. Bumps ``last_used_at`` on success.
        Revoked clients always fail.
        """
        client = await self.get_by_client_id(client_id)

        if client is None:
            # Constant-time failure: still spend a bcrypt round.
            bcrypt.verify(client_secret, _DUMMY_HASH)
            return None

        # Always verify against the stored hash — even if revoked — so the
        # branch cost is comparable to the success path.
        valid = bcrypt.verify(client_secret, client.client_secret_hash)
        if not valid:
            return None
        if client.revoked_at is not None:
            return None

        client.last_used_at = utc_now()
        await self.session.flush()
        return cast(ApiClient, client)
