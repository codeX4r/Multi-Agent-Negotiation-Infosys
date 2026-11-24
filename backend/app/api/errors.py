"""API exception handlers and error response definitions."""

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.schemas.common import ErrorDetail, ErrorResponse


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers with the FastAPI application."""

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        """Handle Pydantic validation errors with standardized format."""
        details = []
        for err in exc.errors():
            field_path = " -> ".join(str(loc) for loc in err["loc"])
            details.append(ErrorDetail(
                code=err["type"],
                field=field_path,
                message=err["msg"],
            ))
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorResponse(
                error="validation_error",
                message="Request validation failed",
                details=details,
            ).model_dump(),
        )

    @app.exception_handler(ValidationError)
    async def pydantic_validation_exception_handler(request: Request, exc: ValidationError):
        """Handle Pydantic validation errors from model validators."""
        details = []
        for err in exc.errors():
            field_path = " -> ".join(str(loc) for loc in err["loc"])
            details.append(ErrorDetail(
                code=err["type"],
                field=field_path,
                message=err["msg"],
            ))
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorResponse(
                error="validation_error",
                message="Request validation failed",
                details=details,
            ).model_dump(),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError):
        """Handle application-level ValueError exceptions."""
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorResponse(
                error="invalid_request",
                message=str(exc),
            ).model_dump(),
        )

    from fastapi.exceptions import HTTPException

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        """Handle HTTP exceptions (including 404) with standardized format."""
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error="http_error",
                message=exc.detail if isinstance(exc.detail, str) else "HTTP error",
            ).model_dump(),
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception):
        """Handle unexpected server errors safely."""
        # In production, log the exception here
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                error="internal_server_error",
                message="An unexpected error occurred",
            ).model_dump(),
        )