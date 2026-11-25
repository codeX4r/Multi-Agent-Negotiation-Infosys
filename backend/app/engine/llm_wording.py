
"""Adapter between the existing negotiation backend and Annika's wording engine."""

import json

from llm_wording_engine import WordingEngine
from llm_wording_engine.schema import Issue

from app.models import AgentProfile, IssueTermField


_ENGINE = None

LABELS = {
    "price": ("Price", "INR"),
    "delivery": ("Delivery time", "days"),
    "warranty": ("Warranty", "months"),
    "payment": ("Payment period", "days"),
    "salary": ("Salary", "LPA"),
    "bonus": ("Bonus", "LPA"),
    "start": ("Joining time", "months"),
    "remote": ("Remote work", "days"),
    "eng": ("Engineering budget", "lakhs"),
    "mkt": ("Marketing budget", "lakhs"),
    "ops": ("Operations budget", "lakhs"),
    "timeline": ("Project timeline", "months"),
}

# Legacy job and budget profiles use vendor-style weight keys.
WEIGHT_ALIASES = {
    "salary": "price",
    "bonus": "warranty",
    "start": "delivery",
    "remote": "payment",
    "eng": "price",
    "mkt": "payment",
    "ops": "warranty",
    "timeline": "delivery",
}


def _get_engine():
    global _ENGINE
    if _ENGINE is None:
        _ENGINE = WordingEngine(provider="auto")
    return _ENGINE


def generate_wording(
    agent: AgentProfile,
    scenario: str,
    decision: str,
    current_offer,
    transcript: list,
    round_number: int,
    max_rounds: int,
    approved_terms=None,
    deal_reached: bool = False,
):
    """Return an LLM-generated public message, or None if integration fails."""

    try:
        issue_ids = {
            "vendor": ["price", "delivery", "warranty", "payment"],
            "job": ["salary", "bonus", "start", "remote"],
            "budget": ["eng", "mkt", "ops", "timeline"],
        }[scenario]

        issues = []
        for issue_id in issue_ids:
            field = IssueTermField[issue_id]
            ideal = getattr(agent.target, field)
            limit = getattr(agent.batna, field)

            if ideal is None or limit is None:
                continue

            label, unit = LABELS[issue_id]
            weight_key = WEIGHT_ALIASES.get(issue_id, issue_id)
            weight = agent.weights.get(
                issue_id, agent.weights.get(weight_key, 1.0)
            )

            issues.append(Issue(
                id=issue_id,
                label=label,
                ideal=float(ideal),
                limit=float(limit),
                weight=float(weight),
                unit=unit,
            ))

        if not issues:
            return None

        total_weight = sum(max(0, issue.weight) for issue in issues)
        if total_weight <= 0:
            for issue in issues:
                issue.weight = 1.0 / len(issues)
        else:
            for issue in issues:
                issue.weight = max(0, issue.weight) / total_weight

        history = []
        for item in transcript:
            history.append({
                "speaker": item.get("speaker", "Unknown"),
                "message": item.get("message", ""),
                "offer": item.get("offer"),
                "decision": item.get("decision"),
                "round": item.get("round"),
                "deal_reached": item.get("deal_reached", False),
            })

        # Include the opening offer in history for the first turn.
        if decision == "open":
            history.append({
                "speaker": agent.role,
                "message": "Opening offer.",
                "offer": current_offer.model_dump(exclude_none=True),
                "decision": "open",
                "round": 0,
                "deal_reached": False,
            })

        offer_by = None
        for item in reversed(transcript):
            if item.get("offer"):
                offer_by = item.get("speaker_id")
                break

        constraints = [
            f"Walk-away limit for {issue.label}: {issue.limit} {issue.unit}."
            for issue in issues
        ]

        if approved_terms is not None and decision == "counter":
            constraints.append(
                "The evaluator has already approved this exact counter-offer. "
                "Do not suggest different terms: "
                + json.dumps(approved_terms.model_dump(exclude_none=True))
            )

        request = {
            "agent": {
                "id": agent.id,
                "name": agent.role,
                "role": agent.role,
                "personality": agent.personality,
                "persona": (
                    f"You are a {agent.skill} negotiator acting as {agent.role}."
                ),
                "goals": [
                    f"Your ideal {issue.label} is {issue.ideal} {issue.unit}."
                    for issue in issues
                ],
                "constraints": constraints,
                "issues": [
                    {
                        "id": issue.id,
                        "label": issue.label,
                        "ideal": issue.ideal,
                        "limit": issue.limit,
                        "weight": issue.weight,
                        "unit": issue.unit,
                    }
                    for issue in issues
                ],
                "batna": "Your walk-away alternative is defined by your limits.",
                "batna_utility": 0.3,
            },
            "scenario": scenario,
            "history": history,
            "offer_on_table": (
                None if decision == "open"
                else current_offer.model_dump(exclude_none=True)
            ),
            "offer_by": agent.id if decision == "open" else offer_by,
            "round": round_number,
            "max_rounds": max_rounds,
            "decision_hint": None if decision == "open" else decision,
            "deal_reached": deal_reached,
        }

        result = _get_engine().reason_dict(request)

        # Only use the public message. Never replace evaluator decisions or offers.
        message = result.get("message")
        return message.strip() if isinstance(message, str) and message.strip() else None

    except Exception as error:
        print(f"LLM wording integration failed: {error}")
        return None
