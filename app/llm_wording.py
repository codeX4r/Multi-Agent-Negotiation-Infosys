"""Connects the existing negotiation backend to Annika's LLM wording engine."""

import json

from llm_wording_engine.engine import WordingEngine
from llm_wording_engine.schema import Issue
from .models import IssueTermField


_ENGINE = None


ISSUE_DETAILS = {
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


SCENARIO_ISSUES = {
    "vendor": ["price", "delivery", "warranty", "payment"],
    "job": ["salary", "bonus", "start", "remote"],
    "budget": ["eng", "mkt", "ops", "timeline"],
}


def _get_engine():
    global _ENGINE

    if _ENGINE is None:
        _ENGINE = WordingEngine(provider="auto")

    return _ENGINE


def generate_wording(
    agent,
    scenario,
    decision,
    current_offer,
    transcript,
    round_number,
    max_rounds,
    approved_terms=None,
):
    """Generate a natural-language message without changing the evaluator's decision."""

    try:
        issue_ids = SCENARIO_ISSUES[scenario]
        issues = []

        for issue_id in issue_ids:
            field_name = IssueTermField[issue_id]

            ideal = getattr(agent.target, field_name)
            limit = getattr(agent.batna, field_name)

            if ideal is None or limit is None:
                continue

            label, unit = ISSUE_DETAILS[issue_id]
            weight_key = WEIGHT_ALIASES.get(issue_id, issue_id)
            weight = agent.weights.get(
                issue_id,
                agent.weights.get(weight_key, 1.0),
            )

            issues.append(
                Issue(
                    id=issue_id,
                    label=label,
                    ideal=ideal,
                    limit=limit,
                    weight=weight,
                    unit=unit,
                )
            )

        if not issues:
            return None

        history = []

        for item in transcript:
            history.append({
                "speaker": item.get("speaker", "Unknown"),
                "message": item.get("message", ""),
                "offer": item.get("offer"),
                "decision": item.get("decision"),
                "round": item.get("round", 0),
            })

        constraints = [
            "The existing negotiation evaluator has already made the decision.",
            f"You must preserve this decision: {decision}.",
            "Do not change the decision or invent different negotiation terms.",
        ]

        if approved_terms is not None:
            constraints.append(
                "The evaluator-approved counteroffer is: "
                + json.dumps(
                    approved_terms.model_dump(exclude_none=True),
                    ensure_ascii=False,
                )
                + ". Describe this exact counteroffer. Do not invent another offer."
            )

        if decision == "accept":
            constraints.append(
                "Communicate acceptance of the current offer."
            )
        elif decision == "reject":
            constraints.append(
                "Communicate rejection of the current offer politely and clearly."
            )
        elif decision == "counter":
            constraints.append(
                "Communicate the evaluator-approved counteroffer."
            )

        latest_offer_by = None
        for item in reversed(transcript):
            if item.get("offer") is not None:
                latest_offer_by = item.get("speaker_id")
                break

        request = {
            "agent": {
                "id": agent.id,
                "name": agent.role,
                "role": agent.role,
                "personality": agent.personality,
                "persona": (
                    f"You are the {agent.role}. "
                    f"Your negotiation personality is {agent.personality}."
                ),
                "goals": [
                    f"Try to achieve your ideal terms: "
                    f"{agent.target.model_dump(exclude_none=True)}"
                ],
                "constraints": constraints,
                "issues": issues,
                "batna": (
                    "Your walk-away limits are: "
                    f"{agent.batna.model_dump(exclude_none=True)}"
                ),
                "batna_utility": 0.3,
            },
            "scenario": scenario,
            "history": history,
            "offer_on_table": (
                current_offer.model_dump(exclude_none=True)
                if current_offer is not None
                else None
            ),
            "offer_by": latest_offer_by,
            "round": round_number,
            "max_rounds": max_rounds,
            "decision_hint": decision,
        }

        result = _get_engine().reason_dict(request)

        # Never use wording if the engine changed the evaluator's decision.
        if result.get("decision") != decision:
            return None

        message = result.get("message")

        if isinstance(message, str) and message.strip():
            return message.strip()

        return None

    except Exception as error:
        print(f"LLM wording integration failed: {error}")
        return None