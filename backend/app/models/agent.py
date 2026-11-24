"""Agent profiles and terms models."""

from math import isclose
from pydantic import BaseModel, Field, FiniteFloat, model_validator
from typing import Any, Literal, Optional


class Terms(BaseModel):
    price: Optional[float] = None
    delivery_days: Optional[int] = None
    warranty_months: Optional[int] = None
    payment_days: Optional[int] = 30
    eng: Optional[float] = None
    mkt: Optional[float] = None
    ops: Optional[float] = None
    timeline: Optional[int] = None
    salary: Optional[float] = None
    bonus: Optional[float] = None
    start: Optional[int] = None
    remote: Optional[int] = None

    @model_validator(mode="after")
    def validate_budget_shares(self):
        shares = (self.eng, self.mkt, self.ops)
        if any(value is not None for value in shares):
            if any(value is None for value in shares):
                raise ValueError("Budget offers must include Engineering, Marketing, and Operations")
            if not isclose(sum(shares), 50, abs_tol=1e-8):
                raise ValueError("Budget allocations must total 50 lakhs")
        return self

    def model_dump(self, *args, **kwargs):
        data = super().model_dump(*args, **kwargs)
        if all(data.get(field) is not None for field in ("eng", "mkt", "ops", "timeline")):
            return {
                "eng": data["eng"],
                "mkt": data["mkt"],
                "ops": data["ops"],
                "timeline": data["timeline"],
            }
        if all(data.get(field) is not None for field in ("salary", "bonus", "start", "remote")):
            return {
                "salary": data["salary"],
                "bonus": data["bonus"],
                "start": data["start"],
                "remote": data["remote"],
            }
        return data


class AgentProfile(BaseModel):
    id: str
    role: str                                   # "Supplier", "Buyer", ...
    personality: Literal["aggressive", "collaborative", "risk_averse"]
    skill: Literal["novice", "skilled", "expert"] = "skilled"
    wants_higher_price: bool                    # True for seller, False for buyer
    target: Terms                               # ideal deal
    batna: Terms                                # walk-away limits (worst acceptable)
    weights: dict = {"price": 0.4, "delivery": 0.25, "warranty": 0.2, "payment": 0.15}


class NegotiationContext(BaseModel):
    scenario: Literal["vendor", "job", "budget"]
    round_number: int
    max_rounds: int
    current_offer: Terms
    previous_offer: Optional[Terms] = None
    conversation_history: list[dict[str, Any]]


class Decision(BaseModel):
    decision: Literal["accept", "counter", "reject"]
    utility: float                              # 0 to 1
    counter_offer: Optional[Terms] = None
    reasoning: str