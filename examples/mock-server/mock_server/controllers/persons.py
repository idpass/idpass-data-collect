"""REST controller for Person resources."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from litestar import Controller, Request, delete, get, patch, post
from litestar.params import Parameter
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.auth.guards import jwt_auth_guard
from mock_server.schemas import (
    CreateIdentifier,
    CreateIdentityDocument,
    CreatePerson,
    IdentifierOut,
    IdentityDocumentOut,
    PaginatedResponse,
    PersonOut,
    UpdatePerson,
)
from mock_server.services import PersonService


def _to_out(person) -> PersonOut:  # type: ignore[no-untyped-def]
    """Hydrate a PersonOut from an ORM Person (including nested relationships)."""
    return PersonOut.model_validate(person)


class PersonController(Controller):
    """All ``/v1/persons*`` routes. Protected by :func:`jwt_auth_guard`."""

    path = "/v1/persons"
    tags = ["persons"]
    guards = [jwt_auth_guard]

    @get("/")
    async def list_persons(
        self,
        db_session: AsyncSession,
        updated_since: Annotated[
            datetime | None,
            Parameter(description="ISO 8601 timestamp; only records changed after are returned."),
        ] = None,
        limit: Annotated[int, Parameter(ge=1, le=500)] = 50,
        offset: Annotated[int, Parameter(ge=0)] = 0,
        search: str | None = None,
    ) -> PaginatedResponse[PersonOut]:
        """Paged list of persons (sorted by ``updated_at`` ascending)."""
        svc = PersonService(db_session)
        rows, total = await svc.list(updated_since=updated_since, limit=limit, offset=offset, search=search)
        next_offset = offset + limit if offset + limit < total else None
        return PaginatedResponse[PersonOut](
            items=[_to_out(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
            next_offset=next_offset,
        )

    @get("/{uuid:str}")
    async def get_person(self, uuid: str, db_session: AsyncSession) -> PersonOut:
        """Fetch a single Person by UUID."""
        svc = PersonService(db_session)
        person = await svc.get(uuid)
        return _to_out(person)

    @post("/", status_code=HTTP_201_CREATED)
    async def create_person(self, data: CreatePerson, db_session: AsyncSession) -> PersonOut:
        """Create a Person and auto-assign its ``system_id`` identifier."""
        svc = PersonService(db_session)
        person = await svc.create(data)
        return _to_out(person)

    @patch("/{uuid:str}")
    async def update_person(
        self, uuid: str, data: UpdatePerson, request: Request, db_session: AsyncSession
    ) -> PersonOut:
        """Patch a Person. Honours the optional ``If-Match`` header."""
        if_match = request.headers.get("if-match")
        svc = PersonService(db_session)
        person = await svc.update(uuid, data, if_match=if_match)
        return _to_out(person)

    @delete("/{uuid:str}", status_code=HTTP_204_NO_CONTENT)
    async def delete_person(self, uuid: str, db_session: AsyncSession) -> None:
        """Delete a Person. Cascades to identifiers, documents, memberships."""
        svc = PersonService(db_session)
        await svc.delete(uuid)

    # ----- sub-resources -----------------------------------------------------

    @post("/{uuid:str}/identifiers", status_code=HTTP_201_CREATED)
    async def add_identifier(self, uuid: str, data: CreateIdentifier, db_session: AsyncSession) -> IdentifierOut:
        """Attach a non-``system_id`` identifier to a Person."""
        svc = PersonService(db_session)
        # Ensure person exists (raises NotFoundError if not).
        await svc.get(uuid)
        ident = await svc.identifiers.add_person_identifier(
            uuid,
            identifier_type=data.identifier_type,
            identifier_value=data.identifier_value,
            identifier_scheme_id=data.identifier_scheme_id,
            identifier_scheme_name=data.identifier_scheme_name,
        )
        return IdentifierOut.model_validate(ident)

    @post("/{uuid:str}/identity-documents", status_code=HTTP_201_CREATED)
    async def add_identity_document(
        self, uuid: str, data: CreateIdentityDocument, db_session: AsyncSession
    ) -> IdentityDocumentOut:
        """Attach an IdentityDocument (auto-creates the backing Identifier)."""
        svc = PersonService(db_session)
        doc = await svc.add_identity_document(uuid, data)
        return IdentityDocumentOut.model_validate(doc)
