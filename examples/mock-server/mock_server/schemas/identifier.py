"""Identifier DTOs."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class IdentifierOut(BaseModel):
    """Identifier as returned to API consumers."""

    model_config = ConfigDict(from_attributes=True)

    identifier_type: str
    identifier_value: str
    identifier_scheme_id: str
    identifier_scheme_name: str | None = None


class CreateIdentifier(BaseModel):
    """Payload for ``POST /v1/persons/{uuid}/identifiers``.

    ``identifier_type`` == ``system_id`` is rejected by the service layer.
    """

    identifier_type: str = Field(min_length=1, max_length=64)
    identifier_value: str = Field(min_length=1, max_length=255)
    identifier_scheme_id: str | None = Field(
        default=None,
        description="Defaults to the server's configured scheme if omitted.",
    )
    identifier_scheme_name: str | None = None
