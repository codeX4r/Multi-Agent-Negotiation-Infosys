"""API request/response schemas for negotiation endpoints."""

from typing import Literal, Optional
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


# Re-export NegotiationResponse from models for API use
from app.models import NegotiationResponse

__all__ = ["RunRequest", "NegotiationResponse", "Personality"]