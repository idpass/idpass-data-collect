"""JWT issuance and verification for the OAuth2 client-credentials flow."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from mock_server.config import Settings, get_settings
from mock_server.errors import UnauthorizedError

ALGORITHM = "HS256"


@dataclass(frozen=True)
class TokenClaims:
    """Decoded JWT claims. ``sub`` holds the OAuth2 client_id."""

    sub: str
    iat: int
    exp: int
    aud: str


def create_access_token(client_id: str, settings: Settings | None = None) -> tuple[str, int]:
    """Issue a signed JWT for the given client.

    Returns ``(token, expires_in_seconds)``.
    """
    settings = settings or get_settings()
    now = datetime.now(UTC)
    exp = now + timedelta(seconds=settings.jwt_ttl_seconds)
    payload = {
        "sub": client_id,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "aud": settings.jwt_audience,
        "iss": settings.jwt_issuer,
    }
    token = jwt.encode(payload, settings.effective_jwt_secret(), algorithm=ALGORITHM)
    return token, settings.jwt_ttl_seconds


def decode_access_token(token: str, settings: Settings | None = None) -> TokenClaims:
    """Decode + verify a JWT. Raises :class:`UnauthorizedError` on any failure."""
    settings = settings or get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.effective_jwt_secret(),
            algorithms=[ALGORITHM],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
        )
    except JWTError as exc:
        raise UnauthorizedError("Invalid or expired access token") from exc
    # jose already validates exp + aud, but we enforce our own shape.
    required = {"sub", "iat", "exp", "aud"}
    if not required.issubset(payload.keys()):
        raise UnauthorizedError("Token is missing required claims")
    return TokenClaims(
        sub=str(payload["sub"]),
        iat=int(payload["iat"]),
        exp=int(payload["exp"]),
        aud=str(payload["aud"]),
    )
