"""Litestar application factory.

Wires up the controllers, OAuth2 + session auth, SQLAlchemy (advanced-alchemy)
plugin, Jinja template engine, OpenAPI schema, and centralised exception
handlers.
"""

from __future__ import annotations

import logging
from pathlib import Path

from advanced_alchemy.extensions.litestar import (
    SQLAlchemyAsyncConfig,
    SQLAlchemyPlugin,
)
from litestar import Litestar, MediaType, Request, Response
from litestar.config.cors import CORSConfig
from litestar.contrib.jinja import JinjaTemplateEngine
from litestar.exceptions import HTTPException, NotFoundException, ValidationException
from litestar.middleware.session.server_side import ServerSideSessionConfig
from litestar.openapi import OpenAPIConfig
from litestar.openapi.plugins import ScalarRenderPlugin, SwaggerRenderPlugin
from litestar.openapi.spec import Components, OAuthFlow, OAuthFlows, SecurityScheme
from litestar.response import Redirect, Template
from litestar.stores.memory import MemoryStore
from litestar.template.config import TemplateConfig

from mock_server.auth.guards import SessionAuthRedirectError
from mock_server.config import Settings, get_settings
from mock_server.controllers.api_clients import ApiClientController
from mock_server.controllers.auth import AuthController
from mock_server.controllers.groups import GroupController
from mock_server.controllers.health import DocsRedirectController, HealthController
from mock_server.controllers.persons import PersonController
from mock_server.controllers.ui import (
    ApiClientsUIController,
    GroupsUIController,
    LandingController,
    LoginController,
    PersonsUIController,
)
from mock_server.errors import AppError
from mock_server.logging_conf import configure_logging

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent / "templates"


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def _app_error_handler(request: Request, exc: AppError) -> Response:
    """Render any :class:`AppError` as ``{"error": {...}}`` JSON."""
    logger.info("AppError %s: %s", exc.code, exc.message)
    return Response(
        content={"error": {"code": exc.code, "message": exc.message}},
        status_code=exc.status_code,
        media_type=MediaType.JSON,
    )


def _http_exception_handler(request: Request, exc: HTTPException) -> Response:
    """Map Litestar HTTPExceptions into the same envelope as AppError."""
    code_map: dict[int, str] = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        409: "CONFLICT",
        412: "PRECONDITION_FAILED",
        415: "UNSUPPORTED_MEDIA_TYPE",
        422: "VALIDATION_ERROR",
        500: "INTERNAL_ERROR",
    }
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    # Render HTML for UI routes so users see a friendly page.
    if request.url.path.startswith("/ui") or request.url.path == "/":
        return Template(
            template_name="error.html",
            context={"status_code": exc.status_code, "code": code, "message": exc.detail},
            status_code=exc.status_code,
        )
    return Response(
        content={"error": {"code": code, "message": exc.detail}},
        status_code=exc.status_code,
        media_type=MediaType.JSON,
    )


def _not_found_handler(request: Request, exc: NotFoundException) -> Response:
    """Route 404s through the shared HTTP exception handler."""
    return _http_exception_handler(request, exc)


def _validation_handler(request: Request, exc: ValidationException) -> Response:
    """Produce a structured VALIDATION_ERROR for request-body validation failures."""
    logger.info("ValidationException: %s", exc.detail)
    extra = getattr(exc, "extra", None)
    payload: dict[str, object] = {"error": {"code": "VALIDATION_ERROR", "message": str(exc.detail)}}
    if extra is not None:
        payload["error"] = {**payload["error"], "details": extra}  # type: ignore[dict-item]
    return Response(content=payload, status_code=422, media_type=MediaType.JSON)


def _session_redirect_handler(request: Request, exc: SessionAuthRedirectError) -> Redirect:
    """Guard → redirect to /ui/login for unauthenticated UI requests."""
    return Redirect(path="/ui/login", status_code=303)


def _unhandled_handler(request: Request, exc: Exception) -> Response:
    """Last-resort handler; hide internals from the client."""
    logger.exception("unhandled exception on %s %s", request.method, request.url.path)
    return Response(
        content={"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}},
        status_code=500,
        media_type=MediaType.JSON,
    )


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app(settings: Settings | None = None) -> Litestar:
    """Build and return a fresh Litestar app instance.

    ``settings`` can be overridden for tests (e.g. pointing at an in-memory DB).
    """
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    # advanced-alchemy plugin — provides a request-scoped ``db_session``.
    # ``create_all=True`` asks the plugin to run ``metadata.create_all`` on
    # startup; harmless for SQLite and avoids a separate migration step.
    sqlalchemy_config = SQLAlchemyAsyncConfig(
        connection_string=settings.db_url,
        session_dependency_key="db_session",
        create_all=True,
        # `autocommit_include_redirects` commits on 2xx AND 3xx responses. The
        # default `autocommit` rolls back 3xx — which breaks our UI form
        # handlers that create a record then return a 303 Redirect, leaving
        # the record uncommitted and the redirect target returning NOT_FOUND.
        before_send_handler="autocommit_include_redirects",
    )
    sqlalchemy_plugin = SQLAlchemyPlugin(config=sqlalchemy_config)

    async def _ensure_tables(_app: Litestar) -> None:
        """Belt-and-braces: create tables on first start so seed works out of the box."""
        from mock_server.db import create_all
        from mock_server.seed import seed_default_api_client

        await create_all()
        # Bootstrap the env-default OAuth2 client if no matching row exists.
        await seed_default_api_client()

    template_config = TemplateConfig(directory=_TEMPLATE_DIR, engine=JinjaTemplateEngine)

    # Session middleware — cookie-based, server-side store (in-memory is fine
    # for a single-process dev server; sessions reset on restart).
    # `samesite="strict"` + `httponly` mitigate session hijack and CSRF on
    # UI state-changing requests. Set `secure=True` outside of localhost.
    session_config = ServerSideSessionConfig(
        key="mock_session",
        max_age=60 * 60 * 8,  # 8h
        store="sessions",
        httponly=True,
        samesite="strict",
        secure=settings.session_cookie_secure,
    )

    openapi_config = OpenAPIConfig(
        title="Mock Registry",
        version="1.0.0",
        description=(
            "PublicSchema-aligned mock registry used as a reference for DataCollect "
            "external sync adapter development. All /v1/** endpoints require an OAuth2 "
            "Bearer token. Click **Authorize** below, enter client credentials "
            "(defaults: `mock-client` / `mock-secret`), then call any protected endpoint."
        ),
        render_plugins=[SwaggerRenderPlugin(path="/docs"), ScalarRenderPlugin(path="/scalar")],
        path="/schema",
        components=Components(
            security_schemes={
                "oauth2": SecurityScheme(
                    type="oauth2",
                    description="Client credentials grant against /oauth/token.",
                    flows=OAuthFlows(
                        client_credentials=OAuthFlow(
                            token_url="/oauth/token",
                            scopes={},
                        ),
                    ),
                ),
                "bearer": SecurityScheme(
                    type="http",
                    scheme="bearer",
                    bearer_format="JWT",
                    description="Paste a raw JWT from /oauth/token.",
                ),
            },
        ),
        security=[{"oauth2": []}, {"bearer": []}],
    )

    cors_config = CORSConfig(
        allow_origins=settings.cors_allowed_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "If-Match"],
        allow_credentials=False,
    )

    app = Litestar(
        route_handlers=[
            HealthController,
            DocsRedirectController,
            AuthController,
            PersonController,
            GroupController,
            ApiClientController,
            LandingController,
            LoginController,
            PersonsUIController,
            GroupsUIController,
            ApiClientsUIController,
        ],
        plugins=[sqlalchemy_plugin],
        template_config=template_config,
        middleware=[session_config.middleware],
        stores={"sessions": MemoryStore()},
        openapi_config=openapi_config,
        cors_config=cors_config,
        exception_handlers={
            AppError: _app_error_handler,
            NotFoundException: _not_found_handler,
            ValidationException: _validation_handler,
            HTTPException: _http_exception_handler,
            SessionAuthRedirectError: _session_redirect_handler,
            Exception: _unhandled_handler,
        },
        on_startup=[_ensure_tables],
        debug=False,
    )
    return app
