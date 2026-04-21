"""ApiClient DTOs.

``ApiClientResponse`` is safe to return on any read path — it never carries
the secret or its hash. ``ApiClientWithSecret`` is only returned from
``POST /v1/api-clients`` and ``POST /v1/api-clients/{uuid}/rotate``; the
plaintext secret appears exactly once.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


class CreateApiClient(BaseModel):
    """Payload for ``POST /v1/api-clients``.

    All fields are optional. A ``client_id`` is auto-generated if omitted;
    the secret is always auto-generated (never accepted from the caller).
    """

    name: str | None = Field(
        default=None,
        max_length=255,
        description="Human-readable label shown in the UI.",
    )
    client_id: str | None = Field(
        default=None,
        max_length=128,
        description="Public identifier. Auto-generated if omitted (e.g. ``mc_AbCd1234``).",
    )
    description: str | None = Field(default=None, description="Free-form notes.")
    scopes: list[str] = Field(
        default_factory=list,
        description="Optional OAuth2 scopes (advisory — currently not enforced).",
    )


class ApiClientResponse(BaseModel):
    """Client as returned to API/UI consumers. Never includes the secret."""

    model_config = ConfigDict(from_attributes=True)

    uuid: str
    client_id: str
    name: str | None = None
    description: str | None = None
    scopes: list[str] = Field(default_factory=list)
    created_at: datetime
    last_used_at: datetime | None = None
    revoked_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_active(self) -> bool:
        """True if the client has not been revoked."""
        return self.revoked_at is None


class ApiClientWithSecret(ApiClientResponse):
    """Returned from ``POST /v1/api-clients`` and rotate — plaintext once."""

    client_secret: str = Field(
        description=(
            "One-time plaintext secret. Store it immediately — the server does "
            "not retain it and it cannot be recovered."
        ),
    )
