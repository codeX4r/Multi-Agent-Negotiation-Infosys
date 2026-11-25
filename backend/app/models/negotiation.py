"""Negotiation configuration and context models."""

from math import isclose
from pydantic import BaseModel, Field, FiniteFloat, model_validator
from typing import Any, Literal, Optional


VendorIssueId = Literal["price", "delivery", "warranty", "payment"]
IssueId = Literal[
    "price", "delivery", "warranty", "payment",
    "salary", "bonus", "start", "remote",
    "eng", "mkt", "ops", "timeline",
]
IssueTermField = {
    "price": "price",
    "delivery": "delivery_days",
    "warranty": "warranty_months",
    "payment": "payment_days",
    "salary": "salary",
    "bonus": "bonus",
    "start": "start",
    "remote": "remote",
    "eng": "eng",
    "mkt": "mkt",
    "ops": "ops",
    "timeline": "timeline",
}
SCENARIO_ISSUES = {
    "vendor": {"price", "delivery", "warranty", "payment"},
    "job": {"salary", "bonus", "start", "remote"},
    "budget": {"eng", "mkt", "ops", "timeline"},
}


class SumConstraint(BaseModel):
    type: Literal["sum"] = "sum"
    total: FiniteFloat
    derived: str = Field(min_length=1)
    of: list[str] = Field(min_length=1)


class NegotiationIssue(BaseModel):
    id: IssueId
    min: FiniteFloat
    max: FiniteFloat
    step: FiniteFloat = Field(gt=0)
    derived: bool = False

    @model_validator(mode="after")
    def validate_range(self):
        if self.min >= self.max:
            raise ValueError("issue min must be less than max")
        return self


class NegotiationParty(BaseModel):
    id: str = Field(min_length=1)
    role: str = Field(min_length=1)
    personality: Literal["aggressive", "collaborative", "risk_averse"]
    skill: Literal["novice", "skilled", "expert"]
    target: dict[str, FiniteFloat]
    walk_away: dict[str, FiniteFloat]
    weights: dict[str, FiniteFloat] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_personality_format(self):
        if self.personality == "risk-averse":
            raise ValueError("Use 'risk_averse' (underscore), not 'risk-averse'")
        return self


class NegotiationConfig(BaseModel):
    parties: list[NegotiationParty] = Field(min_length=2, max_length=5)
    issues: list[NegotiationIssue] = Field(min_length=1)
    opener_id: str = Field(min_length=1)
    rounds_limit: int = Field(ge=1, le=100)
    deadlock_after_stalled_rounds: int = Field(ge=1, le=100)
    constraint: SumConstraint | None = None
    climate: Literal["stable", "volatile", "crisis"] = "volatile"
    event_frequency: int = Field(default=2, ge=0, le=10)
    orchestrator_autonomy: int = Field(default=2, ge=0, le=3)

    @model_validator(mode="after")
    def validate_configuration(self):
        issue_ids = [issue.id for issue in self.issues]
        if len(set(issue_ids)) != len(issue_ids):
            raise ValueError("issue ids must be unique")
        if set(issue_ids) not in SCENARIO_ISSUES.values():
            raise ValueError("config must define the complete issue set for one built-in scenario")

        if set(issue_ids) == SCENARIO_ISSUES["budget"]:
            if self.constraint is None:
                raise ValueError("Budget config requires its shared-total constraint")
            if (
                self.constraint.total != 50
                or self.constraint.derived != "ops"
                or len(self.constraint.of) != 2
                or set(self.constraint.of) != {"eng", "mkt"}
            ):
                raise ValueError("Budget config must derive Operations from a 50-lakh total")
        elif self.constraint is not None:
            raise ValueError("sum constraints are only supported by the Budget scenario")

        issues_by_id = {issue.id: issue for issue in self.issues}
        if self.constraint is not None:
            if self.constraint.derived not in issues_by_id:
                raise ValueError("constraint derived issue must exist in the issue list")
            if any(issue_id not in issues_by_id for issue_id in self.constraint.of):
                raise ValueError("constraint inputs must exist in the issue list")
            derived_ids = {issue.id for issue in self.issues if issue.derived}
            if derived_ids != {self.constraint.derived}:
                raise ValueError("only the constraint output may be marked derived")
        elif any(issue.derived for issue in self.issues):
            raise ValueError("derived issues require a sum constraint")

        party_ids = [party.id for party in self.parties]
        if len(set(party_ids)) != len(party_ids):
            raise ValueError("party ids must be unique")
        if self.opener_id not in party_ids:
            raise ValueError("opener_id must match a configured party")

        required_ids = set(issues_by_id)
        for party in self.parties:
            if set(party.target) != required_ids or set(party.walk_away) != required_ids:
                raise ValueError("each party target and walk_away must define every issue")
            if not set(party.weights).issubset(required_ids):
                raise ValueError("party weights may only reference configured issues")
            if any(weight < 0 for weight in party.weights.values()):
                raise ValueError("party weights cannot be negative")
            if party.weights and sum(party.weights.values()) <= 0:
                raise ValueError("party weights must have a positive total")

            for issue_id, issue in issues_by_id.items():
                for values in (party.target, party.walk_away):
                    value = values[issue_id]
                    units = (value - issue.min) / issue.step
                    if not issue.min <= value <= issue.max:
                        raise ValueError(f"{issue_id} value must stay inside its range")
                    if not isclose(units, round(units), abs_tol=1e-8):
                        raise ValueError(f"{issue_id} value must align with its step")
                if self.constraint is not None:
                    total = values[self.constraint.derived] + sum(
                        values[issue_id] for issue_id in self.constraint.of
                    )
                    if not isclose(total, self.constraint.total, abs_tol=1e-8):
                        raise ValueError("party targets and walk_away must satisfy the sum constraint")
        return self