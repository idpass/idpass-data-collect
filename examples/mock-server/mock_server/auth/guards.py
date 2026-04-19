"""Litestar Guards — functions called before a handler runs.

Two guards:

* :func:`jwt_auth_guard` — required on every ``/v1/**`` route. Verifies a
  Bearer token issued by ``/oauth/token``.
* :func:`ui_session_guard` — required on every ``/ui/**`` route except
  ``/ui/login``. Checks that the session has ``authenticated=True``.
"""

from __future__ import annotations

from litestar.connection import ASGIConnection
from litestar.handlers.base import BaseRouteHandler
from litestar.response import Redirect

from mock_server.auth.tokens import decode_access_token
from mock_server.errors import UnauthorizedError


async def jwt_auth_guard(connection: ASGIConnection, _handler: BaseRouteHandler) -> None:
    """Reject requests lacking a valid Bearer JWT.

    The token issuer (``client_id``) is stored on ``connection.scope`` under
    key ``"client_id"`` so handlers can log it if useful.
    """
    header = connection.headers.get("authorization")
    if not header or not header.lower().startswith("bearer "):
        raise UnauthorizedError("Missing or malformed Authorization header")
    token = header.split(" ", 1)[1].strip()
    claims = decode_access_token(token)
    connection.scope["client_id"] = claims.sub  # type: ignore[typeddict-unknown-key]


class SessionAuthRedirect(Exception):
    """Raised when a UI request has no session; app redirects to /ui/login."""


async def ui_session_guard(connection: ASGIConnection, _handler: BaseRouteHandler) -> None:
    """Redirect unauthenticated UI requests to ``/ui/login``.

    Implemented by raising a typed exception handled in app.py: Litestar
    Guards can't return responses directly, but we register an exception
    handler that maps :class:`SessionAuthRedirect` to a 303 redirect.
    """
    session = getattr(connection, "session", None) or {}
    if not session.get("authenticated"):
        raise SessionAuthRedirect()


def build_login_redirect() -> Redirect:
    """Helper used by the exception handler to build the redirect response."""
    return Redirect(path="/ui/login", status_code=303)
