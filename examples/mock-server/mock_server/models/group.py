"""Group and GroupMembership models — households, families, etc."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mock_server.db import Base, utc_now

if TYPE_CHECKING:
    from mock_server.models.identifier import Identifier
    from mock_server.models.person import Person


def _uuid_str() -> str:
    return str(uuid4())


class Group(Base):
    """A group of persons. Default type is ``household``."""

    __tablename__ = "group"

    uuid: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_type: Mapped[str] = mapped_column(String(64), default="household", nullable=False)
    attributes: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        default=dict,
        doc="PublicSchema fields beyond the typed core. Stored verbatim.",
    )

    created_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now, nullable=False)

    identifiers: Mapped[list[Identifier]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    memberships: Mapped[list[GroupMembership]] = relationship(
        back_populates="group",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (Index("ix_group_updated_at", "updated_at"),)


class GroupMembership(Base):
    """Membership of a Person in a Group.

    A Person may belong to many groups. The ``ended_at`` column allows soft
    termination — historic memberships remain queryable.
    """

    __tablename__ = "group_membership"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    group_uuid: Mapped[str] = mapped_column(String(36), ForeignKey("group.uuid", ondelete="CASCADE"), nullable=False)
    person_uuid: Mapped[str] = mapped_column(String(36), ForeignKey("person.uuid", ondelete="CASCADE"), nullable=False)
    role: Mapped[str | None] = mapped_column(String(64), nullable=True, doc="e.g. 'head', 'member'.")
    joined_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)

    group: Mapped[Group] = relationship(back_populates="memberships", lazy="joined")
    person: Mapped[Person] = relationship(back_populates="memberships", lazy="joined")

    __table_args__ = (UniqueConstraint("group_uuid", "person_uuid", name="uq_group_membership_group_person"),)
