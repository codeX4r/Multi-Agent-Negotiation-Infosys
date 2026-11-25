"""LLM Agent negotiation schemas.

Defines the structured input/output contracts for LLM-driven negotiation agents.
"""

from typing import Literal, Optional, List
from pydantic import BaseModel, Field, model_validator
from app.models import Terms


class Concession(BaseModel):
    """A concession made by an agent on a specific issue."""
    issue: str = Field(..., min_length=1)
    previous_value: float
    new_value: float
    reason: str = Field(..., min_length=1)


class LLMAgentDecision(BaseModel):
    """Structured decision output from an LLM negotiation agent."""
    action: Literal["open", "counter", "accept", "reject"]
    reasoning_summary: str = Field(..., max_length=500)
    message: str = Field(..., max_length=1000)
    proposed_terms: Optional[Terms] = None
    concessions: List[Concession] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_action_terms(self) -> "LLMAgentDecision":
        if self.action == "accept" and self.proposed_terms is not None:
            raise ValueError("accept must not have proposed_terms")
        if self.action == "reject" and self.proposed_terms is not None:
            raise ValueError("reject must not have proposed_terms")
        if self.action == "counter" and self.proposed_terms is None:
            raise ValueError("counter must have proposed_terms")
        if self.action == "open" and self.proposed_terms is None:
            raise ValueError("open must have proposed_terms")
        return self


class LLMAgentConfig(BaseModel):
    """Complete configuration for an LLM negotiation agent."""
    agent_id: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    personality: Literal["aggressive", "collaborative", "risk_averse"]
    skill_level: Literal["novice", "skilled", "expert"]
    target: Terms
    walk_away: Terms
    weights: dict[str, float] = Field(default_factory=dict)
    private_objectives: Optional[str] = None
    negotiation_priorities: Optional[List[str]] = None
    risk_tolerance: float = Field(default=0.5, ge=0.0, le=1.0)
    communication_style: str = "professional"


__all__ = ["Concession", "LLMAgentDecision", "LLMAgentConfig"]