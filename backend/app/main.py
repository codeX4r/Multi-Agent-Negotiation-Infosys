from typing import Literal
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pathlib import Path
from pydantic import BaseModel, Field, model_validator
from .orchestrator import run_negotiation
from .models import NegotiationConfig, SCENARIO_ISSUES

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


@app.post("/negotiate/run")
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
