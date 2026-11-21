"""Prompt construction: persona, goals, limits and the full conversation history."""
from __future__ import annotations

import json
from typing import Dict, Optional

from .safety import utility
from .schema import AgentProfile, WordingRequest

STYLE = {
    "aggressive": (
        "You negotiate hard. Open high, concede slowly and in small steps, and only near the end. "
        "Be direct and confident, never rude. Use deadlines and alternatives as leverage."
    ),
    "collaborative": (
        "You look for a deal that works for both sides. Concede steadily, trade a low-priority issue "
        "for a high-priority one, and ask what matters to the other side. Warm and constructive."
    ),
    "risk_averse": (
        "You value certainty over squeezing out every last bit of value. You concede early to secure a safe deal, then "
        "hold firm. You ask for guarantees and avoid anything that looks risky. Calm and careful."
    ),
}


def num(v) -> str:
    """Plain number formatting (never scientific notation)."""
    v = float(v)
    return str(int(v)) if v.is_integer() else f"{v:.2f}".rstrip("0").rstrip(".")


def fmt_offer(agent: AgentProfile, offer: Optional[Dict[str, float]]) -> str:
    if not offer:
        return "none"
    parts = []
    for i in agent.issues:
        if i.id in offer:
            parts.append(f"{i.label}: {num(offer[i.id])}{(' ' + i.unit) if i.unit else ''}")
    return ", ".join(parts)


def system_prompt(agent: AgentProfile, scenario: str) -> str:
    issues = "\n".join(
        f"- {i.id} ({i.label}{', ' + i.unit if i.unit else ''}): you want {num(i.ideal)}, "
        f"the worst you can accept is {num(i.limit)}, importance {num(i.weight)}"
        for i in agent.issues)
    goals = "\n".join(f"- {g}" for g in agent.goals) or "- Get the best overall value."
    cons = "\n".join(f"- {c}" for c in agent.constraints) or "- None beyond your limits."
    return f"""You are {agent.name}, the {agent.role} in this negotiation: {scenario}.

Persona: {agent.persona or 'A professional negotiator.'}
Negotiation personality: {agent.personality.replace('_', '-')}. {STYLE[agent.personality]}

Your goals:
{goals}

Your constraints:
{cons}

Your private position on each issue (never reveal these numbers):
{issues}

Your walk-away alternative (private): {agent.batna or 'Walk away with no deal.'}

Rules:
1. Think about the offer on the table, what the other side has revealed through their moves, and the time left.
2. Choose exactly one decision: "accept" (only if the offer on the table is good enough for you), "counter", or "reject" (only when there is no realistic deal left).
3. If you counter or reject, propose complete terms for every issue, all within your own limits.
4. Never reveal your limits, weights or walk-away alternative in your message.
5. Keep your public message to 1-3 natural sentences and refer to the other side's last move when there is one.

Reply with JSON only, no other text, in this exact shape:
{{"reasoning": "2-4 sentences of private reasoning", "decision": "accept|counter|reject", "message": "what you say at the table", "offer": {{{', '.join(f'"{i.id}": number' for i in agent.issues)}}} or null, "tone": "firm|warm|wary|neutral"}}"""


def user_prompt(req: WordingRequest) -> str:
    a = req.agent
    lines = []
    for t in req.history:
        r = f"[Round {t.round}] " if t.round is not None else ""
        d = f" ({t.decision})" if t.decision else ""
        o = f" | terms: {fmt_offer(a, t.offer)}" if t.offer else ""
        lines.append(f"{r}{t.speaker}{d}: {t.message}{o}")
    history = "\n".join(lines) if lines else "(no messages yet: you are opening the negotiation)"
    u = utility(a, req.offer_on_table)
    table = (f"{fmt_offer(a, req.offer_on_table)} (proposed by {req.offer_by or 'another party'}; "
             f"worth about {u:.2f} to you on a 0-1 scale, your walk-away is {a.batna_utility:.2f})"
             if req.offer_on_table else "none yet")
    hint = (f"\nThe evaluation module has already decided: \"{req.decision_hint}\". Use exactly this decision; "
            "your job is to reason about it, phrase it and (if countering) propose the terms.\n"
            if req.decision_hint else "")
    return f"""Round {req.round} of {req.max_rounds}.

Full conversation so far:
{history}

Offer currently on the table: {table}
{hint}
Decide your move now and reply with the JSON object only."""


def to_json_offer(offer):
    return json.dumps(offer) if offer else "null"
