"""IdentifierService: CRUD for identifiers + system_id invariants."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.config import Settings, get_settings
from mock_server.errors import ConflictError, ForbiddenError, NotFoundError
from mock_server.models import Group, Identifier, Person
from mock_server.models.identifier import SYSTEM_ID_TYPE
from mock_server.services._common import new_uuid

logger = logging.getLogger(__name__)


class IdentifierService:
    """Business logic for identifiers (including the system_id invariant)."""

    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()

    # ----- creation helpers used by PersonService/GroupService ---------------

    async def auto_assign_system_id(self, *, person: Person | None = None, group: Group | None = None) -> Identifier:
        """Auto-insert a ``system_id`` Identifier on Person/Group creation.

        The value is a fresh UUID; the scheme comes from settings. Callers
        should flush the owning entity first so the FK UUID is available.
        """
        if (person is None) == (group is None):
            raise ValueError("auto_assign_system_id: pass exactly one of person/group")
        ident = Identifier(
            person_uuid=person.uuid if person else None,
            group_uuid=group.uuid if group else None,
            identifier_type=SYSTEM_ID_TYPE,
            identifier_value=new_uuid(),
            identifier_scheme_id=self.settings.identifier_scheme,
            identifier_scheme_name="System ID",
        )
        self.session.add(ident)
        await self.session.flush()
        logger.info(
            "auto-assigned system_id identifier id=%s for %s=%s",
            ident.id,
            "person" if person else "group",
            person.uuid if person else (group.uuid if group else None),
        )
        return ident

    # ----- person-scoped operations -----------------------------------------

    async def add_person_identifier(
        self,
        person_uuid: str,
        *,
        identifier_type: str,
        identifier_value: str,
        identifier_scheme_id: str | None = None,
        identifier_scheme_name: str | None = None,
    ) -> Identifier:
        """Attach a new non-system_id identifier to a Person."""
        if identifier_type == SYSTEM_ID_TYPE:
            raise ForbiddenError(f"Identifier type '{SYSTEM_ID_TYPE}' is reserved and assigned by the server.")
        person = await self.session.get(Person, person_uuid)
        if person is None:
            raise NotFoundError(f"Person {person_uuid} not found")

        ident = Identifier(
            person_uuid=person_uuid,
            identifier_type=identifier_type,
            identifier_value=identifier_value,
            identifier_scheme_id=identifier_scheme_id or self.settings.identifier_scheme,
            identifier_scheme_name=identifier_scheme_name,
        )
        self.session.add(ident)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            raise ConflictError(
                f"An identifier with scheme/value already exists: {identifier_type}={identifier_value}"
            ) from exc
        return ident

    # ----- guards -----------------------------------------------------------

    async def assert_not_system_id(self, identifier_id: int) -> Identifier:
        """Fetch an Identifier and reject if it is a system_id."""
        ident = await self.session.get(Identifier, identifier_id)
        if ident is None:
            raise NotFoundError(f"Identifier {identifier_id} not found")
        if ident.identifier_type == SYSTEM_ID_TYPE:
            raise ForbiddenError("system_id identifiers cannot be modified or removed.")
        return ident

    async def find_or_create_identifier_for_person(
        self,
        person_uuid: str,
        *,
        identifier_type: str,
        identifier_value: str,
        identifier_scheme_id: str | None = None,
        identifier_scheme_name: str | None = None,
    ) -> Identifier:
        """Return a Person's matching identifier or create one."""
        if identifier_type == SYSTEM_ID_TYPE:
            raise ForbiddenError(f"Identifier type '{SYSTEM_ID_TYPE}' is reserved and assigned by the server.")
        scheme = identifier_scheme_id or self.settings.identifier_scheme
        stmt = select(Identifier).where(
            Identifier.person_uuid == person_uuid,
            Identifier.identifier_type == identifier_type,
            Identifier.identifier_value == identifier_value,
            Identifier.identifier_scheme_id == scheme,
        )
        existing = (await self.session.execute(stmt)).scalar_one_or_none()
        if existing is not None:
            return existing
        return await self.add_person_identifier(
            person_uuid,
            identifier_type=identifier_type,
            identifier_value=identifier_value,
            identifier_scheme_id=scheme,
            identifier_scheme_name=identifier_scheme_name,
        )
