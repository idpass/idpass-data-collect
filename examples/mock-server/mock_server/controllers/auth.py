"""OAuth2 client-credentials token endpoint."""

from __future__ import annotations

import logging
import secrets
from typing import Annotated

from litestar import Controller, Request, post
from litestar.enums import RequestEncodingType
from litestar.params import Body
from pydantic import BaseModel, Field

from mock_server.auth.tokens import create_access_token
from mock_server.config import get_settings
from mock_server.errors import UnauthorizedError, ValidationError

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
        data: Annotated[TokenForm, Body(media_type=RequestEncodingType.URL_ENCODED)],
    ) -> TokenResponse:
        """Exchange client credentials for a JWT.

        Accepts credentials either in the form body or an
        ``Authorization: Basic`` header (RFC 6749 §2.3.1 both forms).
        """
        settings = get_settings()
        if data.grant_type != "client_credentials":
            raise ValidationError(
                f"Unsupported grant_type '{data.grant_type}'. Expected 'client_credentials'."
            )

        client_id = data.client_id
        client_secret = data.client_secret
        basic = _extract_basic_auth(request)
        if basic is not None:
            client_id = client_id or basic[0]
            client_secret = client_secret or basic[1]

        if not client_id or not client_secret:
            raise UnauthorizedError("client_id and client_secret are required")

        # Constant-time compare to avoid timing side-channels.
        ok_id = secrets.compare_digest(client_id, settings.oauth_client_id)
        ok_secret = secrets.compare_digest(client_secret, settings.oauth_client_secret)
        if not (ok_id and ok_secret):
            logger.warning("oauth token request rejected: bad credentials")
            raise UnauthorizedError("Invalid client credentials")

        token, ttl = create_access_token(client_id, settings)
        return TokenResponse(access_token=token, token_type="Bearer", expires_in=ttl)
