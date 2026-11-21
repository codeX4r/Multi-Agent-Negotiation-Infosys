from pydantic import BaseModel
from typing import Any, Literal, Optional


class Terms(BaseModel):
    price: float            # e.g. price per unit, salary, or budget share
    delivery_days: int      # delivery / joining time / timeline
    warranty_months: int    # warranty / benefits / resources


class AgentProfile(BaseModel):
    id: str
    role: str                                   # "Supplier", "Buyer", ...
    personality: Literal["aggressive", "collaborative", "risk_averse"]
    wants_higher_price: bool                    # True for seller, False for buyer
    target: Terms                               # ideal deal
    batna: Terms                                # walk-away limits (worst acceptable)
    weights: dict = {"price": 0.5, "delivery": 0.3, "warranty": 0.2}


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