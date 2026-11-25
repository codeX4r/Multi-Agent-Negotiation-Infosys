"""The wording engine: one call per agent turn.

    engine = WordingEngine(provider="gemini")
    result = engine.reason(request)        # WordingRequest -> WordingResult

The model receives the agent's persona, goals, private limits and the full
conversation history (prompts.py), returns JSON, and the result is checked by
the guardrails (safety.py). If the model is unavailable or replies with
something unusable, an offline writer takes over so a session never stalls.
"""
from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, List, Optional

from . import prompts
from .llm_client import LLMClient, LLMError, make_client
from .safety import check_decision, check_offer, fallback_offer, utility
from .schema import AgentProfile, WordingRequest, WordingResult

# Counter line variants for offline mode (same as app/engine/messages.py)
COUNTER_LINES = {
    "aggressive": (
        "I'm holding firm on {issue}; move closer to my terms.",
        "I won't give much on {issue}.",
        "Your {issue} terms still need to move my way.",
        "I can shift slightly, but not on {issue}.",
    ),
    "collaborative": (
        "Could we meet nearer my position on {issue}?",
        "I can trade on other terms, but need {issue} to move.",
        "Let's find a middle ground on {issue}.",
        "A small adjustment on {issue} would help us close.",
    ),
    "risk_averse": (
        "I need safer {issue} terms before I can agree.",
        "I'm not comfortable with the current {issue} terms.",
        "Please bring {issue} within a range I can accept.",
        "I can continue if we reduce the risk around {issue}.",
    ),
}


def parse_json(text: str) -> Dict[str, Any]:
    """Extract the first JSON object from a model reply (handles ``` fences and extra prose)."""
    if not text or not text.strip():
        raise ValueError("empty model reply")
    t = re.sub(r"```(?:json)?", "", text).strip()
    start = t.find("{")
    if start < 0:
        raise ValueError("no JSON object in model reply")
    depth, in_str, esc = 0, False, False
    for i in range(start, len(t)):
        c = t[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return json.loads(t[start:i + 1])
    raise ValueError("unterminated JSON object in model reply")


def _own_last_offer(req: WordingRequest) -> Optional[Dict[str, float]]:
    for t in reversed(req.history):
        if t.speaker == req.agent.name and t.offer:
            return t.offer
    return None


class WordingEngine:
    def __init__(self, provider: str = "auto", model: Optional[str] = None, temperature: float = 0.7,
                 client: Optional[LLMClient] = None):
        """provider: gemini | claude | openai | ollama | auto | offline. Pass client= to inject one (tests)."""
        self.client = client if client is not None else make_client(provider, model, temperature)
        self.provider = self.client.provider if self.client else "offline"
        self.model = self.client.model if self.client else "rule-based"

    # ------------------------------------------------------------------ main entry
    def reason(self, req: WordingRequest) -> WordingResult:
        t0 = time.time()
        a = req.agent
        notes: List[str] = []
        source = "llm" if self.client else "offline"
        data: Dict[str, Any]

        if self.client:
            try:
                raw = self.client.complete(prompts.system_prompt(a, req.scenario), prompts.user_prompt(req))
                data = parse_json(raw)
            except (LLMError, ValueError, json.JSONDecodeError) as e:
                notes.append(f"model output unusable ({str(e)[:120]}); offline writer used")
                data, source = self._offline(req), "fallback"
        else:
            data = self._offline(req)

        decision = str(data.get("decision", "counter"))
        if req.decision_hint and decision.lower() != req.decision_hint:
            notes.append(f"model chose '{decision}', kept the evaluator's decision '{req.decision_hint}'")
            decision = req.decision_hint
        decision, n = check_decision(a, decision, req.offer_on_table, req.offer_by)
        notes += n

        own_last = _own_last_offer(req)
        offer = data.get("offer") if isinstance(data.get("offer"), dict) else None
        if decision == "accept":
            offer = None
        elif decision == "counter" and not offer:
            offer = fallback_offer(a, req.round, req.max_rounds, own_last)
            notes.append("model gave no terms for its counter; generated terms from the concession schedule")
        if offer:
            offer, n = check_offer(a, offer, reference=req.offer_on_table or own_last)
            notes += n

        # Use the message from data, but regenerate it if the decision was changed by decision_hint
        # or if the message is empty
        message = str(data.get("message") or "").strip()
        if req.decision_hint and str(data.get("decision", "counter")).lower() != req.decision_hint:
            # Decision was overridden, regenerate message based on the final decision
            top = max(a.issues, key=lambda i: i.weight)
            if decision == "counter":
                counter_count = sum(1 for t in req.history if t.speaker == a.name and t.decision == "counter")
                line_index = counter_count % len(COUNTER_LINES[a.personality])
                message = COUNTER_LINES[a.personality][line_index].format(issue=top.label)
            elif decision == "accept":
                if req.deal_reached:
                    message = {"aggressive": "Fine, that works. Let's close it.",
                              "collaborative": "That works for us. Thank you for meeting us there.",
                              "risk_averse": "That is acceptable. Let's confirm it in writing."}[a.personality]
                else:
                    message = "I can accept this, if the others agree."
            else:
                message = self._default_message(a, "open" if not req.offer_on_table else decision, top.label)
        elif not message:
            message = self._default_message(a, decision)

        reasoning = str(data.get("reasoning") or "").strip() or "No reasoning returned by the model."
        tone = str(data.get("tone") or "neutral").lower()
        if tone not in ("firm", "warm", "wary", "neutral"):
            tone = "neutral"

        return WordingResult(
            agent_id=a.id, decision=decision, reasoning=reasoning, message=message, offer=offer, tone=tone,
            source=source, provider=self.provider, model=self.model,
            utility_of_table=utility(a, req.offer_on_table), utility_of_offer=utility(a, offer),
            guardrail_notes=notes, latency_ms=int((time.time() - t0) * 1000))

    def reason_dict(self, request: Dict[str, Any]) -> Dict[str, Any]:
        """Same as reason() but dict in, dict out: handy for an HTTP endpoint."""
        return self.reason(WordingRequest.from_dict(request)).to_dict()

    # ------------------------------------------------------------------ offline writer
    def _offline(self, req: WordingRequest) -> Dict[str, Any]:
        """History-aware rule-based reasoning, used without a key or when the model fails."""
        a = req.agent
        own_last = _own_last_offer(req)
        target_offer = fallback_offer(a, req.round, req.max_rounds, own_last)
        target_u = utility(a, target_offer) or 0.0
        u = utility(a, req.offer_on_table)
        last_round = req.round >= req.max_rounds

        # what did the other side reveal? compare their last two offers
        their = [t for t in req.history if t.speaker != a.name and t.offer]
        moved = []
        if len(their) >= 2:
            p, q = their[-2].offer, their[-1].offer
            for i in a.issues:
                if i.id in p and i.id in q and p[i.id] != q[i.id]:
                    better = (q[i.id] - p[i.id]) * (i.ideal - i.limit) > 0
                    moved.append((i.label, better))
        read = ("They have not moved yet." if not moved else
                "They moved on " + ", ".join(f"{l} ({'towards me' if b else 'away from me'})" for l, b in moved) + ".")

        # Respect the decision_hint from the evaluator
        if req.decision_hint:
            decision = req.decision_hint
            if decision == "accept":
                why = f"The offer is worth {u:.2f} to me, which meets my threshold."
            elif decision == "reject":
                why = f"The offer is beyond my walk-away point."
            elif decision == "open":
                why = "I am opening, so I anchor near my ideal terms."
            else:  # counter
                why = f"The offer is worth {(u or 0):.2f} to me against a target of {target_u:.2f}, so I counter."
        else:
            floor = a.batna_utility + 0.05
            # For opening turns (round 0 or no offer_on_table), we must open
            is_opening = req.round == 0 or not req.offer_on_table or req.offer_by == a.id
            if is_opening:
                decision = "open"
                why = "I am opening, so I anchor near my ideal terms."
            elif req.offer_on_table and req.offer_by != a.id and u is not None and u >= floor and u >= target_u:
                decision = "accept"
                why = f"The offer is worth {u:.2f} to me, which meets my current target of {target_u:.2f}."
            elif last_round and (u is None or u < a.batna_utility):
                decision = "reject"
                why = f"Final round and the offer ({(u or 0):.2f}) is still below my walk-away ({a.batna_utility:.2f})."
            else:
                decision = "counter"
                why = (f"The offer is worth {(u or 0):.2f} to me against a target of {target_u:.2f}, so I counter."
                       if u is not None else "I am opening, so I anchor near my ideal terms.")
        top = max(a.issues, key=lambda i: i.weight)

        # Use varied counter lines like the original write_message function
        if decision == "counter":
            # Count total previous counter messages in history (global counter like original)
            counter_count = sum(1 for t in req.history if t.decision == "counter")
            line_index = counter_count % len(COUNTER_LINES[a.personality])
            message = COUNTER_LINES[a.personality][line_index].format(issue=top.label)
        elif decision == "accept":
            if req.deal_reached:
                # Use the same messages as the original write_message function in app/engine/messages.py
                TONE = {
                    "aggressive": {"open": "This is my position, and it is firm.",
                                   "reject": "I'm walking away; these terms cross my limit.",
                                   "accept": "Fine. This works for me."},
                    "collaborative": {"open": "Let's find something that works for both of us.",
                                      "reject": "I can't find a workable agreement in these terms.",
                                      "accept": "Great, I'm happy with this. Deal."},
                    "risk_averse": {"open": "I'd like to propose safe, predictable terms.",
                                    "reject": "I can't accept terms that leave this level of risk.",
                                    "accept": "These terms are acceptable and low-risk. Agreed."},
                }
                message = TONE[a.personality]["accept"]
            else:
                message = "I can accept this, if the others agree."
        else:
            message = self._default_message(a, "open" if not req.offer_on_table else decision, top.label)

        return {
            "reasoning": f"{why} {read} My top priority is {top.label}, so I protect it and give ground elsewhere.",
            "decision": decision,
            "message": message,
            "offer": None if decision == "accept" else target_offer,
            "tone": {"aggressive": "firm", "collaborative": "warm", "risk_averse": "wary"}[a.personality],
        }

    @staticmethod
    def _default_message(a: AgentProfile, decision: str, focus: str = "the key terms") -> str:
        lines = {
            "open": {"aggressive": f"Let's be direct. Here are our terms, and {focus.lower()} is where we start.",
                     "collaborative": f"To get us started, here is a balanced package. {focus} matters most to us.",
                     "risk_averse": f"We would like to start with safe, clear terms, especially on {focus.lower()}."},
            "accept": {"aggressive": "Fine, that works. Let's close it.",
                       "collaborative": "That works for us. Thank you for meeting us there.",
                       "risk_averse": "That is acceptable. Let's confirm it in writing."},
            "counter": {"aggressive": f"That is not enough. Here is our position, and {focus.lower()} is not up for debate.",
                        "collaborative": f"We are getting closer. Here is a package that moves on our side; {focus.lower()} matters most to us.",
                        "risk_averse": f"We can adjust a little, but we need certainty on {focus.lower()}. Here is what we can do."},
            "reject": {"aggressive": "This is not going anywhere. We will take our alternative.",
                       "collaborative": "We tried, but we cannot make these numbers work.",
                       "risk_averse": "The risk is too high for us. We have to step back."},
        }
        return lines.get(decision, lines["counter"])[a.personality]
