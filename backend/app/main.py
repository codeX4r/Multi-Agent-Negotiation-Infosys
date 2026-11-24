"""FastAPI application entry point."""

from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

from app.api.errors import register_exception_handlers
from app.api.routes import health, negotiation

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

# Register exception handlers
register_exception_handlers(app)

# Include routers
app.include_router(health.router)
app.include_router(negotiation.router)


@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/demo", include_in_schema=False)
async def demo():
    demo_path = Path(__file__).resolve().parent.parent / "demo_ui.html"
    return FileResponse(demo_path, media_type="text/html")


# Catch-all route for 404 handling (must be last)
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def catch_all(path: str):
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="Not Found")