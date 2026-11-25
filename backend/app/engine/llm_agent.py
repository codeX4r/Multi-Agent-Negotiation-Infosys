"""LLM Agent - Core LLM Decision Making for Negotiation.

Each agent maintains private context and makes decisions via LLM calls.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Optional, List, Dict, Any

from app.engine.llm_provider import LLMProvider
from app.schemas.llm_negotiation import LLMAgentConfig, LLMAgentDecision, Concession
from app.models import NegotiationContext, Terms, SCENARIO_ISSUES, IssueTermField, NegotiationIssue

logger = logging.getLogger(__name__)


SYSTEM_PROMPT_TEMPLATE = """You are a {personality} negotiator acting as {role}.
Your skill level: {skill_level}.

YOUR PRIVATE NEGOTIATION PROFILE (NEVER SHARE THIS):
- Ideal target for each issue: {target_summary}
- Walk-away limits (BATNA): {walk_away_summary}
- Issue importance weights: {weights_summary}
- Private objectives: {private_objectives}
- Negotiation priorities: {priorities}
- Risk tolerance: {risk_tolerance}/1.0
- Communication style: {communication_style}

SCENARIO: {scenario}
ISSUES: {issues_description}

CURRENT NEGOTIATION STATE:
- Round: {round_number} of {max_rounds}
- Current offer on table: {current_offer}
- Your previous offer: {previous_offer}
- Conversation history: {history_summary}

DECISION REQUIRED: Choose ONE action:
- "open": Make the opening offer (only if no current offer)
- "counter": Propose a counteroffer with new terms
- "accept": Accept the current offer exactly as-is
- "reject": Reject the current offer and walk away

RESPOND WITH VALID JSON ONLY matching this schema:
{{
  "action": "open|counter|accept|reject",
  "reasoning_summary": "Brief strategic explanation (max 500 chars)",
  "message": "Natural language message to other parties (max 1000 chars)",
  "proposed_terms": {{"price": 1200000, "delivery_days": 30, ...}} or null,
  "concessions": [{{"issue": "...", "previous_value": ..., "new_value": ..., "reason": "..."}}],
  "confidence": 0.0-1.0
}}

CONSTRAINTS:
- proposed_terms MUST contain valid values within issue ranges
- accept MUST NOT include proposed_terms
- reject MUST NOT include proposed_terms
- counter MUST include valid proposed_terms
- open MUST include valid proposed_terms
- NEVER reveal your walk-away limits or private objectives in the message
"""


def _format_terms(terms: Terms, issues: List[NegotiationIssue]) -> str:
    """Format terms for display in prompt."""
    if terms is None:
        return "None"
    parts = []
    for issue in issues:
        field = IssueTermField[issue.id]
        value = getattr(terms, field)
        parts.append(f"{issue.id}={value}")
    return "{" + ", ".join(parts) + "}"


def _format_terms_summary(terms: Terms, issues: List[NegotiationIssue]) -> str:
    """Format terms as human-readable summary."""
    if terms is None:
        return "None"
    parts = []
    for issue in issues:
        field = IssueTermField[issue.id]
        value = getattr(terms, field)
        parts.append(f"{issue.id}: {value}")
    return "; ".join(parts)


def _format_history(history: List[Dict[str, Any]], max_entries: int = 8) -> str:
    """Format conversation history for prompt."""
    if not history:
        return "No previous messages."

    entries = history[-max_entries:]
    lines = []
    for entry in entries:
        speaker = entry.get("speaker", "Unknown")
        message = entry.get("message", "")
        decision = entry.get("decision", "")
        offer = entry.get("offer")
        round_num = entry.get("round", "?")

        if decision in ("open", "counter") and offer:
            lines.append(f"[Round {round_num}] {speaker} ({decision}): {message} | Offer: {offer}")
        else:
            lines.append(f"[Round {round_num}] {speaker} ({decision}): {message}")

    return "\n".join(lines)


def _get_issues_for_scenario(scenario: str) -> List[NegotiationIssue]:
    """Get issue definitions for a scenario."""
    issue_ids = SCENARIO_ISSUES.get(scenario, set())
    issues = []
    for issue_id in sorted(issue_ids):
        # Use default ranges - in practice these come from config
        defaults = {
            "price": (900000, 1300000, 10000),
            "delivery": (10, 45, 1),
            "warranty": (6, 36, 6),
            "payment": (0, 60, 15),
            "salary": (12, 24, 0.5),
            "bonus": (0, 3, 0.25),
            "start": (2, 12, 1),
            "remote": (0, 5, 1),
            "eng": (8, 34, 1),
            "mkt": (6, 30, 1),
            "ops": (5, 28, 1),
            "timeline": (3, 9, 1),
        }
        min_val, max_val, step = defaults.get(issue_id, (0, 100, 1))
        issues.append(NegotiationIssue(id=issue_id, min=min_val, max=max_val, step=step))
    return issues


def _parse_json_response(response: str) -> Dict[str, Any]:
    """Extract and parse JSON from LLM response, handling fences and prose."""
    if not response or not response.strip():
        raise ValueError("Empty response from LLM")

    # Remove markdown code fences
    text = re.sub(r"```(?:json)?", "", response).strip()

    # Find first JSON object
    start = text.find("{")
    if start < 0:
        raise ValueError("No JSON object found in response")

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        c = text[i]
        if in_string:
            if escape:
                escape = False
            elif c == "\\":
                escape = True
            elif c == '"':
                in_string = False
            continue
        if c == '"':
            in_string = True
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                json_str = text[start:i+1]
                return json.loads(json_str)

    raise ValueError("Unterminated JSON object in response")


class LLMAgent:
    """LLM-driven negotiation agent with private context and validation retries."""

    def __init__(self, config: LLMAgentConfig, provider: LLMProvider, max_retries: int = 3):
        self.config = config
        self.provider = provider
        self.max_retries = max_retries
        self._scenario_issues = _get_issues_for_scenario(config.target.__class__.__name__.lower() if hasattr(config.target, '__class__') else "vendor")
        # We'll get the actual issues from context when needed

    def _build_prompt(self, context: NegotiationContext) -> tuple[str, str]:
        """Build system and user prompts with all negotiation context."""
        issues = _get_issues_for_scenario(context.scenario)

        # Format target summary
        target_summary = _format_terms_summary(self.config.target, issues)
        walk_away_summary = _format_terms_summary(self.config.walk_away, issues)

        # Format weights
        weights_parts = []
        for issue in issues:
            w = self.config.weights.get(issue.id, 0.0)
            weights_parts.append(f"{issue.id}: {w:.2f}")
        weights_summary = "; ".join(weights_parts)

        # Format issues description
        issues_desc_parts = []
        for issue in issues:
            field = IssueTermField[issue.id]
            ideal = getattr(self.config.target, field)
            limit = getattr(self.config.walk_away, field)
            issues_desc_parts.append(
                f"{issue.id} ({field}): ideal={ideal}, limit={limit}, range=[{issue.min}, {issue.max}], step={issue.step}"
            )
        issues_description = "\n".join(issues_desc_parts)

        # Current offer
        current_offer_str = _format_terms(context.current_offer, issues) if context.current_offer else "None (opening)"

        # Previous offer
        previous_offer_str = _format_terms(context.previous_offer, issues) if context.previous_offer else "None"

        # History
        history_summary = _format_history(context.conversation_history)

        # Private objectives
        private_objectives = self.config.private_objectives or "Not specified"
        priorities = ", ".join(self.config.negotiation_priorities) if self.config.negotiation_priorities else "Not specified"

        system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
            personality=self.config.personality,
            role=self.config.role,
            skill_level=self.config.skill_level,
            target_summary=target_summary,
            walk_away_summary=walk_away_summary,
            weights_summary=weights_summary,
            private_objectives=private_objectives,
            priorities=priorities,
            risk_tolerance=self.config.risk_tolerance,
            communication_style=self.config.communication_style,
            scenario=context.scenario,
            issues_description=issues_description,
            round_number=context.round_number,
            max_rounds=context.max_rounds,
            current_offer=current_offer_str,
            previous_offer=previous_offer_str,
            history_summary=history_summary,
        )

        user_prompt = f"""Current situation:
- Round: {context.round_number} of {context.max_rounds}
- Offer on table: {current_offer_str}
- Your last offer: {previous_offer_str}

Recent history:
{history_summary}

Make your decision now. Return ONLY the JSON object."""

        return system_prompt, user_prompt

    def _parse_response(self, response: str) -> LLMAgentDecision:
        """Parse JSON response into LLMAgentDecision."""
        data = _parse_json_response(response)

        # Convert concessions to Concession objects
        concessions = []
        for c in data.get("concessions", []):
            concessions.append(Concession(**c))

        # Handle proposed_terms
        proposed_terms = None
        if data.get("proposed_terms") is not None:
            proposed_terms = Terms(**data["proposed_terms"])

        return LLMAgentDecision(
            action=data["action"],
            reasoning_summary=data.get("reasoning_summary", ""),
            message=data.get("message", ""),
            proposed_terms=proposed_terms,
            concessions=concessions,
            confidence=data.get("confidence", 0.5),
        )

    def _validate_terms(self, decision: LLMAgentDecision, context: NegotiationContext) -> List[str]:
        """Validate proposed terms against business rules."""
        errors = []

        if decision.proposed_terms is None:
            return errors

        terms = decision.proposed_terms
        issues = _get_issues_for_scenario(context.scenario)

        # Check each issue range and step
        for issue in issues:
            field = IssueTermField[issue.id]
            value = getattr(terms, field)

            if value < issue.min or value > issue.max:
                errors.append(
                    f"{issue.id} value {value} outside allowed range [{issue.min}, {issue.max}]"
                )

            # Check step alignment
            units = (value - issue.min) / issue.step
            if abs(units - round(units)) > 1e-8:
                errors.append(
                    f"{issue.id} value {value} does not align with step size {issue.step} "
                    f"(must be {issue.min} + n*{issue.step})"
                )

        # Check sum constraint for budget scenario
        if context.scenario == "budget":
            total = terms.eng + terms.mkt + terms.ops
            if abs(total - 50) > 1e-8:
                errors.append(
                    f"Budget sum constraint violated: eng + mkt + ops = {total}, must equal 50"
                )

        return errors

    def decide(self, context: NegotiationContext) -> LLMAgentDecision:
        """Make a negotiation decision via LLM with validation retries."""
        system_prompt, user_prompt = self._build_prompt(context)

        last_exception = None
        for attempt in range(self.max_retries):
            try:
                raw = self.provider.complete(system_prompt, user_prompt)
                decision = self._parse_response(raw)

                errors = self._validate_terms(decision, context)
                if not errors:
                    logger.info(f"Agent {self.config.agent_id} decided: {decision.action} (attempt {attempt+1})")
                    return decision

                # Add validation feedback to prompt for retry
                user_prompt += f"\n\nVALIDATION ERRORS (fix these):\n" + "\n".join(errors)
                logger.warning(f"Agent {self.config.agent_id} validation failed (attempt {attempt+1}): {errors}")

            except Exception as e:
                last_exception = e
                logger.warning(f"Agent {self.config.agent_id} LLM error (attempt {attempt+1}): {e}")

        # If we exhausted all retries
        raise RuntimeError(
            f"Agent {self.config.agent_id} failed to produce valid decision after {self.max_retries} attempts: {last_exception}"
        )


__all__ = ["LLMAgent"]