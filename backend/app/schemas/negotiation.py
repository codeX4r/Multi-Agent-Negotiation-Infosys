"""API request/response schemas for negotiation endpoints."""

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, model_validator

from app.models import NegotiationConfig, SCENARIO_ISSUES


Personality = Literal["aggressive", "collaborative", "risk_averse"]


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


class WordingRequest(BaseModel):
    """Request for LLM-generated wording for a negotiation turn.

    Note: The agent dict uses frontend field names (walk_away, target with
    frontend field names like 'delivery', 'warranty', 'payment' instead of
    internal names 'delivery_days', 'warranty_months', 'payment_days').
    The endpoint converts these to the internal model format.
    """
    agent: dict[str, Any]  # AgentProfile-like dict with frontend field names
    scenario: Literal["vendor", "job", "budget"]
    decision: Literal["open", "counter", "accept", "reject", "message", "walk"]
    current_offer: dict[str, Any] | None
    transcript: list[dict[str, Any]]
    round_number: int
    max_rounds: int
    deal_reached: bool = False

    model_config = {
        "extra": "allow",
    }


class WordingResponse(BaseModel):
    """Response with LLM-generated wording."""
    message: str | None
    source: Literal["llm", "fallback"] = "fallback"
    provider: str | None = None
    model: str | None = None


# Re-export NegotiationResponse from models for API use
from app.models import NegotiationResponse

__all__ = ["RunRequest", "NegotiationResponse", "Personality", "WordingRequest", "WordingResponse"]