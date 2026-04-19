"""Identifier model — pure PublicSchema Identifier (no lifecycle)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mock_server.db import Base

if TYPE_CHECKING:
    from mock_server.models.group import Group
    from mock_server.models.identity_document import IdentityDocument
    from mock_server.models.person import Person

SYSTEM_ID_TYPE = "system_id"


class Identifier(Base):
    """A typed identifier attached to a Person or Group.

    An identifier belongs to *either* a Person or a Group — not both. This is
    not enforced at the DB level to keep the schema simple; the service layer
    ensures the invariant.
    """

    __tablename__ = "identifier"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    person_uuid: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("person.uuid", ondelete="CASCADE"), nullable=True
    )
    group_uuid: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("group.uuid", ondelete="CASCADE"), nullable=True
    )
    identifier_type: Mapped[str] = mapped_column(String(64), nullable=False)
    identifier_value: Mapped[str] = mapped_column(String(255), nullable=False)
    identifier_scheme_id: Mapped[str] = mapped_column(String(255), nullable=False)
    identifier_scheme_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    person: Mapped[Person | None] = relationship(back_populates="identifiers")
    group: Mapped[Group | None] = relationship(back_populates="identifiers")
    identity_documents: Mapped[list[IdentityDocument]] = relationship(
        back_populates="identifier",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint(
            "identifier_scheme_id",
            "identifier_value",
            name="uq_identifier_scheme_value",
        ),
    )
