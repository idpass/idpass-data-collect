"""ApiClient model — OAuth2 client credentials record.

Each row is a named OAuth2 client. The ``client_secret_hash`` column stores a
bcrypt hash; plaintext secrets are only returned to the caller at creation /
rotation time and are never persisted.
"""

from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import JSON, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from mock_server.db import Base, utc_now


def _uuid_str() -> str:
    """Generate a new stringified UUID4 (used as a column default)."""
    return str(uuid4())


class ApiClient(Base):
    """A registered OAuth2 client.

    The ``client_id`` is public (sent on the wire). The ``client_secret_hash``
    is a bcrypt hash of the secret the operator was shown on create/rotate —
    the plaintext is never stored. ``revoked_at`` acts as a soft-delete:
    authentication checks this column and refuses tokens for revoked clients.
    """

    __tablename__ = "api_client"

    uuid: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    client_id: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    client_secret_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Stored as a JSON array of strings. SQLite has native JSON1.
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    created_at: Mapped[datetime] = mapped_column(default=utc_now, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(nullable=True)

    __table_args__ = (Index("ix_api_client_created_at", "created_at"),)

    @property
    def is_active(self) -> bool:
        """True if the client has not been revoked."""
        return self.revoked_at is None
