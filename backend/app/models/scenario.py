"""Scenario response models."""

from pydantic import BaseModel
from typing import Literal, Optional


class TranscriptEntry(BaseModel):
    round: int
    speaker: str
    speaker_id: str
    decision: Literal["open", "counter", "accept", "reject"]
    utility: float
    message: str
    offer: Optional[dict] = None
    reasoning: str


class PartyInfo(BaseModel):
    id: str
    role: str
    personality: str
    skill: str


class NegotiationResponse(BaseModel):
    scenario: Literal["vendor", "job", "budget"]
    personalities: dict[str, str]
    parties: list[PartyInfo]
    outcome: Literal["deal", "breakdown", "deadlock"]
    outcome_reason: str
    rounds: int
    final_terms: Optional[dict] = None
    satisfaction: dict[str, float]
    transcript: list[TranscriptEntry]