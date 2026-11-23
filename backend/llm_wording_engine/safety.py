"""Guardrails: keep whatever the model proposes inside the agent's own limits.

The LLM does the reasoning and the talking. These checks make sure the numbers
it proposes are valid, so a model mistake can never produce an offer the agent
should not make or an acceptance below its walk-away point.
"""
from __future__ import annotations

from typing import Dict, List, Optional, Tuple

from .schema import AgentProfile, Issue


def _n(v) -> str:
    v = float(v)
    return str(int(v)) if v.is_integer() else f"{v:.2f}".rstrip("0").rstrip(".")


def _norm_weights(agent: AgentProfile) -> Dict[str, float]:
    total = sum(max(0.0, i.weight) for i in agent.issues) or 1.0
    return {i.id: max(0.0, i.weight) / total for i in agent.issues}


def issue_value(issue: Issue, x: float) -> float:
    """0 at the agent's limit, 1 at its ideal, clamped."""
    span = issue.ideal - issue.limit
    if span == 0:
        return 1.0
    return max(0.0, min(1.0, (x - issue.limit) / span))


def utility(agent: AgentProfile, offer: Optional[Dict[str, float]]) -> Optional[float]:
    """Weighted value of an offer for this agent, 0..1. Missing issues count as 0."""
    if not offer:
        return None
    w = _norm_weights(agent)
    u = 0.0
    for i in agent.issues:
        if i.id in offer and offer[i.id] is not None:
            u += w[i.id] * issue_value(i, float(offer[i.id]))
    return round(u, 3)


def _snap(issue: Issue, x: float) -> float:
    lo, hi = issue.lo(), issue.hi()
    x = max(lo, min(hi, x))
    if issue.step:
        x = lo + round((x - lo) / issue.step) * issue.step
        x = max(lo, min(hi, x))
    return round(x, 4) if not float(x).is_integer() else float(int(x))


def check_offer(agent: AgentProfile, offer: Optional[Dict[str, float]],
                reference: Optional[Dict[str, float]] = None) -> Tuple[Optional[Dict[str, float]], List[str]]:
    """Return a cleaned offer plus notes on anything that had to be corrected.

    - unknown keys are dropped, missing issues are filled from the reference offer
      (or the agent's ideal), non-numbers are rejected
    - values are clamped into the issue range and snapped to its step
    - values beyond the agent's own limit are pulled back to the limit
    """
    notes: List[str] = []
    if offer is None:
        return None, notes
    clean: Dict[str, float] = {}
    for i in agent.issues:
        raw = offer.get(i.id)
        if raw is None:
            fill = (reference or {}).get(i.id, i.ideal)
            clean[i.id] = float(fill)
            notes.append(f"{i.label}: missing in model output, kept {fill}")
            continue
        try:
            v = float(str(raw).replace(",", ""))
        except ValueError:
            clean[i.id] = float((reference or {}).get(i.id, i.ideal))
            notes.append(f"{i.label}: '{raw}' is not a number, kept previous value")
            continue
        # never offer something worse for yourself than your own limit
        worse_than_limit = (v < i.limit) if i.ideal > i.limit else (v > i.limit)
        if worse_than_limit:
            notes.append(f"{i.label}: {_n(v)} is beyond own limit {_n(i.limit)}, pulled back to the limit")
            v = i.limit
        s = _snap(i, v)
        if s != v:
            notes.append(f"{i.label}: {_n(v)} adjusted to valid value {_n(s)}")
        clean[i.id] = s
    extra = [k for k in offer if k not in clean]
    if extra:
        notes.append(f"ignored unknown terms: {', '.join(extra)}")
    return clean, notes


def check_decision(agent: AgentProfile, decision: str, table: Optional[Dict[str, float]],
                   table_by: Optional[str]) -> Tuple[str, List[str]]:
    """Make the decision consistent with the situation and the agent's walk-away."""
    notes: List[str] = []
    d = (decision or "").strip().lower()
    if d not in ("accept", "counter", "reject"):
        notes.append(f"unknown decision '{decision}', treated as counter")
        d = "counter"
    if d == "accept" and (not table or table_by == agent.id):
        notes.append("nothing from another party to accept, treated as counter")
        d = "counter"
    if d == "accept":
        u = utility(agent, table) or 0.0
        if u < agent.batna_utility:
            notes.append(f"accepting would be below walk-away ({u:.2f} < {agent.batna_utility:.2f}), changed to counter")
            d = "counter"
    return d, notes


CONCESSION_SPEED = {"aggressive": 0.35, "collaborative": 1.0, "risk_averse": 1.8}
OPENING_GIVE = {"aggressive": 0.0, "collaborative": 0.08, "risk_averse": 0.15}


def fallback_offer(agent: AgentProfile, round_no: int, max_rounds: int,
                   own_last: Optional[Dict[str, float]] = None) -> Dict[str, float]:
    """Simple time-based offer used only when the model output is unusable.

    Moves from the ideal toward the limit as the rounds pass; aggressive agents
    hold out longer, risk-averse ones give ground earlier.
    """
    t = max(0.0, min(1.0, (round_no - 1) / max(1, max_rounds - 1)))
    k = CONCESSION_SPEED[agent.personality]
    base = OPENING_GIVE[agent.personality]
    give = base + (0.75 - base) * (t ** (1.0 / k))
    floor = agent.batna_utility + 0.05

    def build(g):
        offer = {}
        for i in agent.issues:
            target = i.ideal + (i.limit - i.ideal) * g
            if own_last and i.id in own_last:
                # never move backwards from what was already offered
                target = max(target, own_last[i.id]) if i.ideal < i.limit else min(target, own_last[i.id])
            offer[i.id] = _snap(i, target)
        return offer

    offer = build(give)
    # never propose something worth less to yourself than walking away
    while give > 0 and (utility(agent, offer) or 0) < floor:
        give = max(0.0, give - 0.05)
        offer = build(give)
    return offer
