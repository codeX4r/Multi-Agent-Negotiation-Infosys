"""Common API schemas for error handling and shared types."""

from typing import Optional
from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Individual error detail."""
    code: str
    field: Optional[str] = None
    message: str


class ErrorResponse(BaseModel):
    """Standardized API error response."""
    error: str
    message: str
    details: Optional[list[ErrorDetail]] = None