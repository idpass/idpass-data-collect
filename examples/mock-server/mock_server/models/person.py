"""Person model — a PublicSchema-aligned natural person."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Date, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mock_server.db import Base, utc_now

if TYPE_CHECKING:
    from mock_server.models.group import GroupMembership
    from mock_server.models.identifier import Identifier
    from mock_server.models.identity_document import IdentityDocument


def _uuid_str() -> str:
    """Generate a new stringified UUID4 (used as a column default)."""
    return str(uuid4())


class Person(Base):
    """A natural person.

    Fields follow the PublicSchema Person vocabulary. The database stores a
    single row per person; identifiers (including the auto-assigned
    ``system_id``) live in the ``identifier`` table.
    """

    __tablename__ = "person"

    uuid: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    given_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    family_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(8), nullable=True, doc="ISO 5218 numeric code.")

    created_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now, nullable=False)

    identifiers: Mapped[list[Identifier]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    identity_documents: Mapped[list[IdentityDocument]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    memberships: Mapped[list[GroupMembership]] = relationship(
        back_populates="person",
        cascade="all, delete-orphan",
        lazy="selectin",
    )

    __table_args__ = (Index("ix_person_updated_at", "updated_at"),)
