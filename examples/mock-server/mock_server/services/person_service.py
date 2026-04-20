"""PersonService: CRUD + sync query helpers for Person."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.config import Settings, get_settings
from mock_server.db import utc_now
from mock_server.errors import ConflictError, NotFoundError
from mock_server.models import IdentityDocument, Person
from mock_server.schemas.identity_document import CreateIdentityDocument
from mock_server.schemas.person import CreatePerson, UpdatePerson
from mock_server.services._common import check_if_match
from mock_server.services.identifier_service import IdentifierService


class PersonService:
    """All Person CRUD, pagination, and sub-resource operations."""

    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.identifiers = IdentifierService(session, self.settings)

    # ----- reads -------------------------------------------------------------

    async def get(self, uuid: str) -> Person:
        """Fetch a Person by UUID or raise :class:`NotFoundError`."""
        person = await self.session.get(Person, uuid)
        if person is None:
            raise NotFoundError(f"Person {uuid} not found")
        return person

    async def list(
        self,
        *,
        updated_since: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[Person], int]:
        """List persons with optional ``updated_since`` filter + pagination.

        Returns ``(rows, total)`` where ``total`` ignores limit/offset.
        """
        limit = max(1, min(limit, 500))
        offset = max(0, offset)

        stmt = select(Person)
        count_stmt = select(func.count(Person.uuid))

        if updated_since is not None:
            stmt = stmt.where(Person.updated_at > updated_since)
            count_stmt = count_stmt.where(Person.updated_at > updated_since)
        if search:
            needle = f"%{search.lower()}%"
            stmt = stmt.where(
                (func.lower(Person.given_name).like(needle)) | (func.lower(Person.family_name).like(needle))
            )
            count_stmt = count_stmt.where(
                (func.lower(Person.given_name).like(needle)) | (func.lower(Person.family_name).like(needle))
            )

        stmt = stmt.order_by(Person.updated_at.asc(), Person.uuid.asc()).limit(limit).offset(offset)
        rows = list((await self.session.execute(stmt)).scalars().all())
        total = int((await self.session.execute(count_stmt)).scalar_one())
        return rows, total

    # ----- writes ------------------------------------------------------------

    async def create(self, payload: CreatePerson) -> Person:
        """Create a Person and auto-assign a system_id identifier."""
        person = Person(
            given_name=payload.given_name,
            family_name=payload.family_name,
            date_of_birth=payload.date_of_birth,
            gender=payload.gender,
        )
        self.session.add(person)
        await self.session.flush()  # ensures person.uuid is set
        await self.identifiers.auto_assign_system_id(person=person)
        await self.session.refresh(person)
        return person

    async def update(self, uuid: str, payload: UpdatePerson, *, if_match: str | None = None) -> Person:
        """Patch a Person. Honours the ``If-Match`` header."""
        person = await self.get(uuid)
        check_if_match(if_match, person.updated_at)
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(person, k, v)
        await self.session.flush()
        await self.session.refresh(person)
        return person

    async def delete(self, uuid: str) -> None:
        """Delete a Person and cascade to identifiers, documents, memberships."""
        person = await self.get(uuid)
        await self.session.delete(person)
        await self.session.flush()

    # ----- identity-document sub-resource -----------------------------------

    async def add_identity_document(self, person_uuid: str, payload: CreateIdentityDocument) -> IdentityDocument:
        """Attach an IdentityDocument, auto-creating the embedded Identifier if needed."""
        await self.get(person_uuid)  # existence check
        ident = await self.identifiers.find_or_create_identifier_for_person(
            person_uuid,
            identifier_type=payload.identifier_type,
            identifier_value=payload.identifier_value,
            identifier_scheme_id=payload.identifier_scheme_id,
            identifier_scheme_name=payload.identifier_scheme_name,
        )
        doc = IdentityDocument(
            person_uuid=person_uuid,
            document_type=payload.document_type,
            issuing_authority=payload.issuing_authority,
            issuing_jurisdiction=payload.issuing_jurisdiction,
            issue_date=payload.issue_date,
            expiry_date=payload.expiry_date,
            identifier_id=ident.id,
        )
        self.session.add(doc)
        try:
            await self.session.flush()
        except Exception as exc:  # pragma: no cover
            raise ConflictError("Failed to add identity document.") from exc
        # Bump person.updated_at so sync notices the new document.
        person = await self.get(person_uuid)
        person.updated_at = utc_now()
        await self.session.flush()
        return doc
