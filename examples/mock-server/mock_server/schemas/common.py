"""Shared schema types: pagination envelope and error body."""

from pydantic import BaseModel, ConfigDict, Field


class PaginatedResponse[T](BaseModel):
    """Generic page envelope used by all list endpoints."""

    model_config = ConfigDict(from_attributes=True)

    items: list[T]
    total: int = Field(description="Total number of matching records, ignoring pagination.")
    limit: int
    offset: int
    next_offset: int | None = Field(
        default=None,
        description="Offset for the next page, or null if this was the final page.",
    )


class ErrorBody(BaseModel):
    """Machine-readable error body."""

    code: str
    message: str


class ErrorResponse(BaseModel):
    """Standard error envelope: ``{ "error": { "code": ..., "message": ... } }``."""

    error: ErrorBody
