"""REST controller for Group resources."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from litestar import Controller, Request, delete, get, patch, post
from litestar.params import Parameter
from litestar.status_codes import HTTP_201_CREATED, HTTP_204_NO_CONTENT
from sqlalchemy.ext.asyncio import AsyncSession

from mock_server.auth.guards import jwt_auth_guard
from mock_server.schemas import (
    CreateGroup,
    GroupOut,
    MemberAdd,
    PaginatedResponse,
    UpdateGroup,
)
from mock_server.services import GroupService


def _to_out(group) -> GroupOut:  # type: ignore[no-untyped-def]
    """Hydrate a GroupOut from an ORM Group."""
    return GroupOut.model_validate(group)


class GroupController(Controller):
    """All ``/v1/groups*`` routes. Protected by :func:`jwt_auth_guard`."""

    path = "/v1/groups"
    tags = ["groups"]
    guards = [jwt_auth_guard]

    @get("/")
    async def list_groups(
        self,
        db_session: AsyncSession,
        updated_since: Annotated[datetime | None, Parameter()] = None,
        limit: Annotated[int, Parameter(ge=1, le=500)] = 50,
        offset: Annotated[int, Parameter(ge=0)] = 0,
        search: str | None = None,
    ) -> PaginatedResponse[GroupOut]:
        """Paged list of groups (sorted by ``updated_at`` ascending)."""
        svc = GroupService(db_session)
        rows, total = await svc.list(updated_since=updated_since, limit=limit, offset=offset, search=search)
        next_offset = offset + limit if offset + limit < total else None
        return PaginatedResponse[GroupOut](
            items=[_to_out(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
            next_offset=next_offset,
        )

    @get("/{uuid:str}")
    async def get_group(self, uuid: str, db_session: AsyncSession) -> GroupOut:
        """Fetch a single Group by UUID."""
        svc = GroupService(db_session)
        return _to_out(await svc.get(uuid))

    @post("/", status_code=HTTP_201_CREATED)
    async def create_group(self, data: CreateGroup, db_session: AsyncSession) -> GroupOut:
        """Create a Group and auto-assign its ``system_id`` identifier."""
        svc = GroupService(db_session)
        return _to_out(await svc.create(data))

    @patch("/{uuid:str}")
    async def update_group(self, uuid: str, data: UpdateGroup, request: Request, db_session: AsyncSession) -> GroupOut:
        """Patch a Group. Honours the optional ``If-Match`` header."""
        if_match = request.headers.get("if-match")
        svc = GroupService(db_session)
        return _to_out(await svc.update(uuid, data, if_match=if_match))

    @delete("/{uuid:str}", status_code=HTTP_204_NO_CONTENT)
    async def delete_group(self, uuid: str, db_session: AsyncSession) -> None:
        """Delete a Group. Cascades to memberships and identifiers."""
        svc = GroupService(db_session)
        await svc.delete(uuid)

    # ----- membership --------------------------------------------------------

    @post("/{uuid:str}/members", status_code=HTTP_201_CREATED)
    async def add_member(self, uuid: str, data: MemberAdd, db_session: AsyncSession) -> GroupOut:
        """Add a Person to the Group."""
        svc = GroupService(db_session)
        await svc.add_member(uuid, data.person_uuid, role=data.role)
        return _to_out(await svc.get(uuid))

    @delete("/{uuid:str}/members/{person_uuid:str}", status_code=HTTP_204_NO_CONTENT)
    async def remove_member(self, uuid: str, person_uuid: str, db_session: AsyncSession) -> None:
        """Remove a Person from the Group."""
        svc = GroupService(db_session)
        await svc.remove_member(uuid, person_uuid)
