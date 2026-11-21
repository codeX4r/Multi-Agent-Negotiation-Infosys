from typing import Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from pydantic import BaseModel
from .orchestrator import run_negotiation

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

@app.get("/", include_in_schema=False)
async def root():
    return RedirectResponse(url="/docs")


@app.get("/demo", include_in_schema=False)
async def demo():
    demo_path = Path(__file__).resolve().parent.parent / "demo_ui.html"
    return FileResponse(demo_path, media_type="text/html")


class RunRequest(BaseModel):
    scenario: Literal["vendor", "job", "budget"] = "vendor"
    opener_personality: Personality = "aggressive"
    responder_personality: Personality = "collaborative"
    max_rounds: int = 12


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "negotiation-arena-api"}


@app.post("/negotiate/run")
async def negotiate(req: RunRequest):
    return run_negotiation(req.scenario, req.opener_personality,
                           req.responder_personality, req.max_rounds)
