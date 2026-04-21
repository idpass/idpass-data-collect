"""Group DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from mock_server.schemas.identifier import IdentifierOut


class GroupMembershipOut(BaseModel):
    """Membership view inside a Group response (focuses on the Person side)."""

    model_config = ConfigDict(from_attributes=True)

    person_uuid: str
    role: str | None = None
    joined_at: datetime
    ended_at: datetime | None = None


class GroupOut(BaseModel):
    """Group as returned to API consumers."""

    model_config = ConfigDict(from_attributes=True)

    uuid: str
    name: str
    group_type: str
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    identifiers: list[IdentifierOut] = Field(default_factory=list)
    memberships: list[GroupMembershipOut] = Field(default_factory=list)


class CreateGroup(BaseModel):
    """Payload for ``POST /v1/groups``."""

    name: str = Field(min_length=1, max_length=255)
    group_type: str = Field(default="household", min_length=1, max_length=64)
    attributes: dict[str, Any] = Field(default_factory=dict)


class UpdateGroup(BaseModel):
    """Payload for ``PATCH /v1/groups/{uuid}``."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    group_type: str | None = Field(default=None, min_length=1, max_length=64)
    attributes: dict[str, Any] | None = None


class MemberAdd(BaseModel):
    """Payload for ``POST /v1/groups/{uuid}/members``."""

    person_uuid: str
    role: str | None = Field(default="member", max_length=64)
