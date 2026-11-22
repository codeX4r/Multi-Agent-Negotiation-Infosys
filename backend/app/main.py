from typing import Literal, Optional
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel, Field, model_validator, ValidationError
from pathlib import Path
from .orchestrator import run_negotiation
from .models import NegotiationConfig, SCENARIO_ISSUES, NegotiationResponse

app = FastAPI(
    title="Negotiation Arena API",
    description="AI-driven multi-agent negotiation platform",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

Personality = Literal["aggressive", "collaborative", "risk_averse"]


# ─── Standardized Error Response Models ───

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


# ─── Exception Handlers ───

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

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/demo", include_in_schema=False)
async def demo():
    demo_path = Path(__file__).resolve().parent.parent / "demo_ui.html"
    return FileResponse(demo_path, media_type="text/html")


class RunRequest(BaseModel):
    scenario: Literal["vendor", "job", "budget"] = "vendor"
    opener_personality: Personality | None = None
    responder_personality: Personality | None = None
    max_rounds: int = Field(default=12, ge=1, le=100)
    config: NegotiationConfig | None = None

    @model_validator(mode="after")
    def validate_config_scenario(self):
        if self.config is not None:
            issue_ids = {issue.id for issue in self.config.issues}
            if issue_ids != SCENARIO_ISSUES[self.scenario]:
                raise ValueError(f"config issues do not match the {self.scenario} scenario")
        return self


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "negotiation-arena-api"}


@app.post("/negotiate/run", response_model=NegotiationResponse)
async def negotiate(req: RunRequest):
    defaults = {
        "vendor": ("aggressive", "collaborative"),
        "job": ("collaborative", "collaborative"),
        "budget": ("aggressive", "collaborative"),
    }
    default_opener, default_responder = defaults[req.scenario]
    return run_negotiation(
        req.scenario,
        req.opener_personality or default_opener,
        req.responder_personality or default_responder,
        req.max_rounds,
        req.config,
    )


# Catch-all route for 404 handling (must be last)
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def catch_all(path: str):
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Not Found")
