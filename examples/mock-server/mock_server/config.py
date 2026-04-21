"""Application settings loaded from environment variables.

Uses pydantic-settings; all values fall back to dev-friendly defaults so the
server can be started with zero configuration.
"""

from __future__ import annotations

import json
import logging
import secrets
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

# Sentinel used so we can detect whether the operator set their own JWT secret.
_DEFAULT_JWT_SECRET_SENTINEL = "__mock_default_jwt_secret__"
_DEFAULT_SESSION_SECRET_SENTINEL = "__mock_default_session_secret__"


class Settings(BaseSettings):
    """Runtime configuration for the mock registry server."""

    model_config = SettingsConfigDict(
        env_prefix="MOCK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    port: int = Field(default=9999, description="TCP port the server binds to.")
    host: str = Field(default="0.0.0.0", description="Bind address.")
    db_path: str = Field(
        default="./mock_registry.db",
        description="Path to the SQLite database file.",
    )

    oauth_client_id: str = Field(default="mock-client")
    oauth_client_secret: str = Field(default="mock-secret")
    jwt_secret: str = Field(default=_DEFAULT_JWT_SECRET_SENTINEL)
    jwt_ttl_seconds: int = Field(default=3600)
    jwt_audience: str = Field(default="mock-registry")
    jwt_issuer: str = Field(default="mock-registry")

    session_secret: str = Field(default=_DEFAULT_SESSION_SECRET_SENTINEL)
    session_cookie_secure: bool = Field(
        default=False,
        description=(
            "Set to true when serving over HTTPS. Keeps the session cookie from "
            "leaking over plain HTTP; defaults to false so local dev works."
        ),
    )
    ui_username: str = Field(default="admin")
    ui_password: str = Field(default="admin")

    identifier_scheme: str = Field(default="urn:mock:vocab:id-type")
    identifier_scheme_name: str = Field(default="Mock ID Type")

    log_level: str = Field(default="INFO")

    cors_allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:9999",
            "http://127.0.0.1:9999",
        ],
        description=(
            "Origins allowed to make browser requests. Accepts comma-separated list "
            "(e.g. 'https://a.example,https://b.example'), single origin, '*' to allow "
            "all, or a JSON array. Set via MOCK_CORS_ALLOWED_ORIGINS."
        ),
    )

    @field_validator("cors_allowed_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> object:
        # Accept comma-separated string, JSON array, or already-parsed list. The
        # NoDecode annotation above disables pydantic-settings' default JSON
        # decode, so we handle both shapes here ourselves.
        if not isinstance(v, str):
            return v
        s = v.strip()
        if not s:
            return []
        if s.startswith("[") and s.endswith("]"):
            return json.loads(s)
        return [origin.strip() for origin in s.split(",") if origin.strip()]

    @property
    def db_url(self) -> str:
        """SQLAlchemy async URL for the configured SQLite path."""
        if self.db_path == ":memory:":
            return "sqlite+aiosqlite:///:memory:"
        return f"sqlite+aiosqlite:///{self.db_path}"

    @property
    def db_url_sync(self) -> str:
        """SQLAlchemy sync URL (used by CLI helpers like seed/migrate)."""
        if self.db_path == ":memory:":
            return "sqlite:///:memory:"
        return f"sqlite:///{self.db_path}"

    def effective_jwt_secret(self) -> str:
        """Return the JWT secret, generating a random value if none configured."""
        if self.jwt_secret == _DEFAULT_JWT_SECRET_SENTINEL:
            logger.warning(
                "MOCK_JWT_SECRET not set — generating an ephemeral secret. "
                "Tokens will not survive a restart. Set MOCK_JWT_SECRET for stable auth."
            )
            # Mutate so subsequent calls in the same process return the same value.
            self.jwt_secret = secrets.token_urlsafe(48)
        return self.jwt_secret

    def effective_session_secret(self) -> str:
        """Return the session cookie signing secret, generating if none configured."""
        if self.session_secret == _DEFAULT_SESSION_SECRET_SENTINEL:
            logger.warning("MOCK_SESSION_SECRET not set — generating an ephemeral session secret.")
            self.session_secret = secrets.token_urlsafe(48)
        return self.session_secret


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a memoised Settings instance."""
    return Settings()
