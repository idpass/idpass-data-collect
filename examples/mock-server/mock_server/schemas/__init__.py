"""Pydantic DTOs (PublicSchema-aligned) for request and response bodies."""

from mock_server.schemas.common import ErrorBody, ErrorResponse, PaginatedResponse
from mock_server.schemas.group import (
    CreateGroup,
    GroupMembershipOut,
    GroupOut,
    MemberAdd,
    UpdateGroup,
)
from mock_server.schemas.identifier import CreateIdentifier, IdentifierOut
from mock_server.schemas.identity_document import (
    CreateIdentityDocument,
    IdentityDocumentOut,
)
from mock_server.schemas.person import CreatePerson, PersonOut, UpdatePerson

__all__ = [
    "CreateGroup",
    "CreateIdentifier",
    "CreateIdentityDocument",
    "CreatePerson",
    "ErrorBody",
    "ErrorResponse",
    "GroupMembershipOut",
    "GroupOut",
    "IdentifierOut",
    "IdentityDocumentOut",
    "MemberAdd",
    "PaginatedResponse",
    "PersonOut",
    "UpdateGroup",
    "UpdatePerson",
]
