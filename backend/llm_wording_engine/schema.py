"""Input and output contract of the engine.

Everything is plain data so any orchestrator (Python, or a frontend over HTTP)
can build a request from a dict and read the result back as a dict.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

PERSONALITIES = ("aggressive", "collaborative", "risk_averse")
DECISIONS = ("accept", "counter", "reject")


@dataclass
class Issue:
    """One negotiable term, seen from one agent's side.

    ideal: the value this agent wants most.
    limit: the worst value this agent can still accept (its walk-away point).
    weight: how much this issue matters to the agent (weights are normalised).
    """
    id: str
    label: str
    ideal: float
    limit: float
    weight: float = 1.0
    unit: str = ""
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None

    def lo(self) -> float:
        return self.min if self.min is not None else min(self.ideal, self.limit)

    def hi(self) -> float:
        return self.max if self.max is not None else max(self.ideal, self.limit)


@dataclass
class AgentProfile:
    id: str
    name: str
    role: str
    personality: str
    persona: str = ""
    goals: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    issues: List[Issue] = field(default_factory=list)
    batna: str = ""                  # text description of the walk-away alternative
    batna_utility: float = 0.3       # value 0..1 below which a deal is worse than walking away

    def __post_init__(self) -> None:
        p = self.personality.lower().replace("-", "_").replace(" ", "_")
        if p not in PERSONALITIES:
            raise ValueError(f"personality must be one of {PERSONALITIES}, got {self.personality!r}")
        self.personality = p
        if not self.issues:
            raise ValueError("an agent needs at least one issue")

    def issue(self, issue_id: str) -> Issue:
        for i in self.issues:
            if i.id == issue_id:
                return i
        raise KeyError(issue_id)


@dataclass
class Turn:
    """One entry of the conversation history."""
    speaker: str
    message: str
    offer: Optional[Dict[str, float]] = None
    decision: Optional[str] = None
    round: Optional[int] = None


@dataclass
class WordingRequest:
    agent: AgentProfile
    scenario: str
    history: List[Turn] = field(default_factory=list)
    offer_on_table: Optional[Dict[str, float]] = None
    offer_by: Optional[str] = None
    round: int = 1
    max_rounds: int = 10
    # Optional: decision already made by an external evaluator. When given, the
    # LLM only explains and phrases it; it does not override it.
    decision_hint: Optional[str] = None

    @staticmethod
    def from_dict(d: Dict[str, Any]) -> "WordingRequest":
        a = dict(d["agent"])
        a["issues"] = [Issue(**i) for i in a.get("issues", [])]
        agent = AgentProfile(**a)
        hist = [Turn(**t) for t in d.get("history", [])]
        return WordingRequest(agent=agent, scenario=d.get("scenario", ""), history=hist,
                                offer_on_table=d.get("offer_on_table"), offer_by=d.get("offer_by"),
                                round=d.get("round", 1), max_rounds=d.get("max_rounds", 10),
                                decision_hint=d.get("decision_hint"))


@dataclass
class WordingResult:
    agent_id: str
    decision: str
    reasoning: str                    # private: why the agent decided this
    message: str                      # public: what the agent says at the table
    offer: Optional[Dict[str, float]] # proposed terms (None when accepting/rejecting)
    tone: str = "neutral"
    source: str = "llm"               # llm | offline | fallback
    provider: str = ""
    model: str = ""
    utility_of_table: Optional[float] = None
    utility_of_offer: Optional[float] = None
    guardrail_notes: List[str] = field(default_factory=list)
    latency_ms: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
