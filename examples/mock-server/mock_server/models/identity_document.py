"""IdentityDocument model — PublicSchema IdentityDocument with lifecycle data."""

from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from mock_server.db import Base

if TYPE_CHECKING:
    from mock_server.models.identifier import Identifier
    from mock_server.models.person import Person


class IdentityDocument(Base):
    """An identity document (passport, national ID card, etc.).

    Each document carries a single identifier (the number printed on it) and
    has lifecycle data (issuing authority, issue/expiry dates).
    """

    __tablename__ = "identity_document"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    person_uuid: Mapped[str] = mapped_column(String(36), ForeignKey("person.uuid", ondelete="CASCADE"), nullable=False)
    document_type: Mapped[str] = mapped_column(String(64), nullable=False)
    issuing_authority: Mapped[str | None] = mapped_column(String(255), nullable=True)
    issuing_jurisdiction: Mapped[str | None] = mapped_column(String(8), nullable=True, doc="ISO 3166 country code.")
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    identifier_id: Mapped[int] = mapped_column(ForeignKey("identifier.id", ondelete="CASCADE"), nullable=False)

    person: Mapped[Person] = relationship(back_populates="identity_documents")
    identifier: Mapped[Identifier] = relationship(back_populates="identity_documents", lazy="joined")
