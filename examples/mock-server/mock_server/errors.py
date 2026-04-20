"""Application-level exception types.

Mapped to HTTP responses by ``mock_server.app``'s exception handlers so that
every API error has the shape::

    {"error": {"code": "...", "message": "..."}}
"""

from __future__ import annotations


class AppError(Exception):
    """Base class for application errors. ``status_code`` + ``code`` are required."""

    status_code: int = 500
    code: str = "INTERNAL_ERROR"

    def __init__(self, message: str, *, status_code: int | None = None, code: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code


class NotFoundError(AppError):
    """Resource not found."""

    status_code = 404
    code = "NOT_FOUND"


class ValidationError(AppError):
    """Client-side validation failed (beyond Pydantic's own checks)."""

    status_code = 422
    code = "VALIDATION_ERROR"


class ConflictError(AppError):
    """Optimistic-concurrency or state conflict."""

    status_code = 409
    code = "CONFLICT"


class PreconditionFailedError(AppError):
    """``If-Match`` header did not match the current ``updated_at``."""

    status_code = 412
    code = "PRECONDITION_FAILED"


class ForbiddenError(AppError):
    """Operation is disallowed (e.g. modifying a system_id identifier)."""

    status_code = 403
    code = "FORBIDDEN"


class UnauthorizedError(AppError):
    """Missing or invalid credentials."""

    status_code = 401
    code = "UNAUTHORIZED"
