"""Person DTOs."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from mock_server.schemas.identifier import IdentifierOut
from mock_server.schemas.identity_document import IdentityDocumentOut


class PersonMembershipOut(BaseModel):
    """Embedded membership view inside a Person response."""

    model_config = ConfigDict(from_attributes=True)

    group_uuid: str
    role: str | None = None
    joined_at: datetime
    ended_at: datetime | None = None


class PersonOut(BaseModel):
    """Person as returned to API consumers (flat PublicSchema-ish JSON)."""

    model_config = ConfigDict(from_attributes=True)

    uuid: str
    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, description="ISO 5218 numeric code.")
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    identifiers: list[IdentifierOut] = Field(default_factory=list)
    identity_documents: list[IdentityDocumentOut] = Field(default_factory=list)
    memberships: list[PersonMembershipOut] = Field(default_factory=list)


class CreatePerson(BaseModel):
    """Payload for ``POST /v1/persons``."""

    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)


class UpdatePerson(BaseModel):
    """Payload for ``PATCH /v1/persons/{uuid}``.

    All fields optional; only provided fields are updated. The ``updated_at``
    column is refreshed by SQLAlchemy's ``onupdate`` hook.
    """

    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    attributes: dict[str, Any] | None = None
