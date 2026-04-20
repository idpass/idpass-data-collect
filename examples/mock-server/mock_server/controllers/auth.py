"""OAuth2 client-credentials token endpoint."""

from __future__ import annotations

import logging
from typing import Annotated

from litestar import Controller, Request, post
from litestar.enums import RequestEncodingType
from litestar.params import Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.auth.tokens import create_access_token
from mock_server.config import get_settings
from mock_server.errors import UnauthorizedError, ValidationError
from mock_server.services import ApiClientService

logger = logging.getLogger(__name__)


class TokenForm(BaseModel):
    """OAuth2 client-credentials request body (URL-encoded form)."""

    grant_type: str = Field(description="Must equal ``client_credentials``.")
    client_id: str | None = None
    client_secret: str | None = None
    scope: str | None = None


class TokenResponse(BaseModel):
    """RFC 6749 token response."""

    access_token: str
    token_type: str = "Bearer"
    expires_in: int


def _extract_basic_auth(request: Request) -> tuple[str, str] | None:
    """Decode an ``Authorization: Basic ...`` header, returning ``(id, secret)``."""
    import base64

    header = request.headers.get("authorization")
    if not header or not header.lower().startswith("basic "):
        return None
    try:
        raw = base64.b64decode(header.split(" ", 1)[1]).decode("utf-8")
    except Exception:
        return None
    if ":" not in raw:
        return None
    cid, cs = raw.split(":", 1)
    return cid, cs


class AuthController(Controller):
    """OAuth2 endpoints."""

    path = "/oauth"
    tags = ["auth"]

    @post("/token", status_code=200)
    async def token(
        self,
        request: Request,
        db_session: AsyncSession,
        data: Annotated[TokenForm, Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> TokenResponse:
        """Exchange client credentials for a JWT.

        Accepts credentials either in the form body or an
        ``Authorization: Basic`` header (RFC 6749 §2.3.1 both forms).

        Credentials are verified against the ``api_client`` table; the
        legacy ``MOCK_OAUTH_CLIENT_ID`` / ``MOCK_OAUTH_CLIENT_SECRET`` env
        vars are only used to **seed** a default row on first startup — they
        are not an auth source of truth.
        """
        settings = get_settings()
        if data.grant_type != "client_credentials":
            raise ValidationError(f"Unsupported grant_type '{data.grant_type}'. Expected 'client_credentials'.")

        client_id = data.client_id
        client_secret = data.client_secret
        basic = _extract_basic_auth(request)
        if basic is not None:
            client_id = client_id or basic[0]
            client_secret = client_secret or basic[1]

        if not client_id or not client_secret:
            raise UnauthorizedError("client_id and client_secret are required")

        svc = ApiClientService(db_session)
        client = await svc.authenticate(client_id, client_secret)
        if client is None:
            logger.warning("oauth token request rejected: bad credentials")
            raise UnauthorizedError("Invalid client credentials")

        token, ttl = create_access_token(client.client_id, settings)
        return TokenResponse(access_token=token, token_type="Bearer", expires_in=ttl)
