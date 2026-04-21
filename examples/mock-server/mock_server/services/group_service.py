"""GroupService: CRUD + membership management for Group."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.config import Settings, get_settings
from mock_server.db import utc_now
from mock_server.errors import ConflictError, NotFoundError
from mock_server.models import Group, GroupMembership, Person
from mock_server.schemas.group import CreateGroup, UpdateGroup
from mock_server.services._common import check_if_match
from mock_server.services.identifier_service import IdentifierService


class GroupService:
    """All Group CRUD, pagination, and membership operations."""

    def __init__(self, session: AsyncSession, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.identifiers = IdentifierService(session, self.settings)

    async def get(self, uuid: str) -> Group:
        """Fetch a Group by UUID or raise :class:`NotFoundError`."""
        group = await self.session.get(Group, uuid)
        if group is None:
            raise NotFoundError(f"Group {uuid} not found")
        return group

    async def list(
        self,
        *,
        updated_since: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
        search: str | None = None,
    ) -> tuple[list[Group], int]:
        """List groups with optional ``updated_since`` filter + pagination."""
        limit = max(1, min(limit, 500))
        offset = max(0, offset)

        stmt = select(Group)
        count_stmt = select(func.count(Group.uuid))

        if updated_since is not None:
            stmt = stmt.where(Group.updated_at > updated_since)
            count_stmt = count_stmt.where(Group.updated_at > updated_since)
        if search:
            needle = f"%{search.lower()}%"
            stmt = stmt.where(func.lower(Group.name).like(needle))
            count_stmt = count_stmt.where(func.lower(Group.name).like(needle))

        stmt = stmt.order_by(Group.updated_at.asc(), Group.uuid.asc()).limit(limit).offset(offset)
        rows = list((await self.session.execute(stmt)).scalars().all())
        total = int((await self.session.execute(count_stmt)).scalar_one())
        return rows, total

    async def create(self, payload: CreateGroup) -> Group:
        """Create a Group and auto-assign a system_id identifier."""
        group = Group(name=payload.name, group_type=payload.group_type, attributes=payload.attributes)
        self.session.add(group)
        await self.session.flush()
        await self.identifiers.auto_assign_system_id(group=group)
        await self.session.refresh(group)
        return group

    async def update(self, uuid: str, payload: UpdateGroup, *, if_match: str | None = None) -> Group:
        """Patch a Group. Honours the ``If-Match`` header."""
        group = await self.get(uuid)
        check_if_match(if_match, group.updated_at)
        data = payload.model_dump(exclude_unset=True)
        for k, v in data.items():
            setattr(group, k, v)
        await self.session.flush()
        await self.session.refresh(group)
        return group

    async def delete(self, uuid: str) -> None:
        """Delete a Group and cascade."""
        group = await self.get(uuid)
        await self.session.delete(group)
        await self.session.flush()

    # ----- membership --------------------------------------------------------

    async def add_member(self, group_uuid: str, person_uuid: str, role: str | None = "member") -> GroupMembership:
        """Add a Person to a Group. Idempotent on (group, person) pair."""
        group = await self.get(group_uuid)
        person = await self.session.get(Person, person_uuid)
        if person is None:
            raise NotFoundError(f"Person {person_uuid} not found")
        membership = GroupMembership(group_uuid=group.uuid, person_uuid=person.uuid, role=role)
        self.session.add(membership)
        try:
            await self.session.flush()
        except IntegrityError as exc:
            raise ConflictError(f"Person {person_uuid} is already a member of group {group_uuid}.") from exc
        # Bump group.updated_at so sync notices the membership change.
        group.updated_at = utc_now()
        await self.session.flush()
        return membership

    async def remove_member(self, group_uuid: str, person_uuid: str) -> None:
        """Remove a Person from a Group."""
        stmt = select(GroupMembership).where(
            GroupMembership.group_uuid == group_uuid,
            GroupMembership.person_uuid == person_uuid,
        )
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"Membership not found: group={group_uuid} person={person_uuid}")
        group = await self.get(group_uuid)
        await self.session.delete(row)
        await self.session.flush()
        group.updated_at = utc_now()
        await self.session.flush()
