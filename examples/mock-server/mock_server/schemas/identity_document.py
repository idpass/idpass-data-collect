"""IdentityDocument DTOs."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from mock_server.schemas.identifier import IdentifierOut


class IdentityDocumentOut(BaseModel):
    """IdentityDocument as returned to API consumers."""

    model_config = ConfigDict(from_attributes=True)

    document_type: str
    issuing_authority: str | None = None
    issuing_jurisdiction: str | None = None
    issue_date: date | None = None
    expiry_date: date | None = None
    identifier: IdentifierOut


class CreateIdentityDocument(BaseModel):
    """Payload for ``POST /v1/persons/{uuid}/identity-documents``.

    The embedded ``identifier`` block describes the identifier printed on the
    document. If no matching Identifier exists for the person, one is created.
    """

    document_type: str = Field(min_length=1, max_length=64)
    issuing_authority: str | None = None
    issuing_jurisdiction: str | None = Field(default=None, max_length=8)
    issue_date: date | None = None
    expiry_date: date | None = None
    identifier_type: str = Field(min_length=1, max_length=64)
    identifier_value: str = Field(min_length=1, max_length=255)
    identifier_scheme_id: str | None = None
    identifier_scheme_name: str | None = None
