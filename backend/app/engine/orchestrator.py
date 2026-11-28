"""LLM-Driven Negotiation Orchestrator.

Replaces the deterministic rule-based engine with LLM-powered agents.
"""

from __future__ import annotations
from app.engine.analytics import analyze_zopa, pareto_efficiency
import logging
from typing import Optional

from app.engine.llm_agent import LLMAgent
from app.engine.llm_provider import create_provider
from app.engine.validation import validate_decision
from app.models import (
    NegotiationConfig,
    NegotiationContext,
    Terms,
    SCENARIO_ISSUES,
    IssueTermField,
    NegotiationIssue,
    AgentProfile,
)
from app.schemas.llm_negotiation import LLMAgentConfig
from app.engine.evaluation import utility

logger = logging.getLogger(__name__)


def _create_empty_offer(scenario: str) -> Terms:
    """Create a minimal Terms object for opening round (NegotiationContext requires it)."""
    if scenario == "vendor":
        return Terms(price=0, delivery_days=0, warranty_months=0, payment_days=0)
    elif scenario == "job":
        return Terms(salary=0, bonus=0, start=0, remote=0)
    elif scenario == "budget":
        # Budget requires eng+mkt+ops=50
        return Terms(eng=20, mkt=15, ops=15, timeline=0)
    else:
        return Terms()


def _party_to_llm_config(party, issues: list[NegotiationIssue]) -> LLMAgentConfig:
    """Convert a NegotiationParty to LLMAgentConfig."""
    # Map party target/walk_away from issue IDs to Term fields
    target_dict = {}
    walk_away_dict = {}
    for issue in issues:
        field = IssueTermField[issue.id]
        target_dict[field] = party.target[issue.id]
        walk_away_dict[field] = party.walk_away[issue.id]

    return LLMAgentConfig(
        agent_id=party.id,
        role=party.role,
        personality=party.personality,
        skill_level=party.skill,
        target=Terms(**target_dict),
        walk_away=Terms(**walk_away_dict),
        weights=party.weights,
    )


def _run_configured_negotiation(config: NegotiationConfig, scenario: str) -> dict:
    """Run a negotiation using LLM-driven agents."""
    issues = config.issues
    provider = create_provider()

    if provider is None:
        raise RuntimeError("No LLM provider configured. Set LLM_PROVIDER and API key.")

    # Convert NegotiationParty to AgentProfile for utility calculations
    agent_profiles = {}
    for party in config.parties:
        target_terms = Terms(**{IssueTermField[i.id]: party.target[i.id] for i in issues})
        batna_terms = Terms(**{IssueTermField[i.id]: party.walk_away[i.id] for i in issues})
        agent_profiles[party.id] = AgentProfile(
            id=party.id,
            role=party.role,
            personality=party.personality,
            skill=party.skill,
            wants_higher_price=party.role.lower() in ("vendor", "supplier", "seller"),
            target=target_terms,
            batna=batna_terms,
            weights=party.weights,
        )

    # Build LLM agents for each party
    llm_agents = {}
    for party in config.parties:
        agent_config = _party_to_llm_config(party, issues)
        llm_agents[party.id] = LLMAgent(agent_config, provider)

    # Determine turn order (opener goes first)
    party_order = [p.id for p in config.parties]
    opener_idx = party_order.index(config.opener_id)
    party_order = party_order[opener_idx:] + party_order[:opener_idx]

    # Initialize state
    on_table: Optional[Terms] = None
    last_offer_by_party = {p.id: None for p in config.parties}
    approvals = set()  # Parties who accepted the CURRENT offer
    transcript = []
    seen_offers = set()
    stalled_rounds = 0
    counter_index = 0
    outcome = "deadlock"
    outcome_reason = f"No agreement was reached within {config.rounds_limit} rounds."

    # Opening round (round 0) - opener makes opening offer
    opener_id = config.opener_id
    opener_agent = llm_agents[opener_id]

    opening_context = NegotiationContext(
        scenario=scenario,
        round_number=0,
        max_rounds=config.rounds_limit,
        current_offer=_create_empty_offer(scenario),
        previous_offer=None,
        conversation_history=[],
    )

    opening_decision = opener_agent.decide(opening_context)

    if opening_decision.action != "open":
        logger.warning(f"Opener {opener_id} did not open (action: {opening_decision.action}), treating as open")

    if opening_decision.proposed_terms is None:
        raise RuntimeError("Opening offer must have proposed_terms")

    on_table = opening_decision.proposed_terms
    last_offer_by_party[opener_id] = on_table
    approvals = {opener_id}  # Opener implicitly accepts their own offer
    counter_index += 1

    offer_key = tuple(sorted(on_table.model_dump(exclude_none=True).items()))
    seen_offers.add(offer_key)

    transcript.append({
        "round": 0,
        "speaker": next(p.role for p in config.parties if p.id == opener_id),
        "speaker_id": opener_id,
        "decision": "open",
        "utility": utility(agent_profiles[opener_id], on_table, issues),
        "message": opening_decision.message,
        "offer": on_table.model_dump(exclude_none=True),
        "reasoning": opening_decision.reasoning_summary,
        "deal_reached": False,
    })

    # Main negotiation loop
    current_turn_idx = 1  # Start with second party

    for round_no in range(1, config.rounds_limit + 1):
        round_had_new_offer = False
        ended = False

        # Each party gets one turn per round (skipping those who accepted current offer)
        for _ in config.parties:
            speaker_id = party_order[current_turn_idx % len(party_order)]
            current_turn_idx += 1

            # Skip if this party already accepted the current offer
            if speaker_id in approvals:
                continue

            speaker_agent = llm_agents[speaker_id]

            # Build context for this agent
            context = NegotiationContext(
                scenario=scenario,
                round_number=round_no,
                max_rounds=config.rounds_limit,
                current_offer=on_table,
                previous_offer=last_offer_by_party[speaker_id],
                conversation_history=transcript.copy(),
            )

            # Get LLM decision
            decision = speaker_agent.decide(context)

            # Validate decision against business rules
            validation = validate_decision(decision, context, issues, config.constraint)
            if not validation.is_valid:
                # This shouldn't happen if LLMAgent retries worked, but handle gracefully
                logger.error(f"Agent {speaker_id} produced invalid decision after retries: {validation.errors}")
                # Force a reject as fallback
                from app.schemas.llm_negotiation import LLMAgentDecision
                decision = LLMAgentDecision(
                    action="reject",
                    reasoning_summary="Validation failed after retries",
                    message="I cannot accept these terms due to validation errors.",
                    proposed_terms=None,
                    concessions=[],
                    confidence=0.1,
                )

            # Handle decision
            if decision.action == "accept":
                # Accept must match current offer exactly (enforced by validation)
                approvals.add(speaker_id)

                transcript.append({
                    "round": round_no,
                    "speaker": next(p.role for p in config.parties if p.id == speaker_id),
                    "speaker_id": speaker_id,
                    "decision": "accept",
                    "utility": utility(agent_profiles[speaker_id], on_table, issues),
                    "message": decision.message,
                    "offer": None,
                    "reasoning": decision.reasoning_summary,
                    "deal_reached": False,
                })

                # Check if all parties have accepted
                if len(approvals) == len(config.parties):
                    outcome = "deal"
                    outcome_reason = f"All parties accepted the offer at round {round_no}."
                    transcript[-1]["deal_reached"] = True
                    ended = True
                    break

                continue

            elif decision.action == "reject":
                outcome = "breakdown"
                speaker = next(p for p in config.parties if p.id == speaker_id)
                outcome_reason = f"{speaker.role} rejected at round {round_no}: offer was unacceptable."

                transcript.append({
                    "round": round_no,
                    "speaker": speaker.role,
                    "speaker_id": speaker_id,
                    "decision": "reject",
                    "utility": utility(agent_profiles[speaker_id], on_table, issues),
                    "message": decision.message,
                    "offer": None,
                    "reasoning": decision.reasoning_summary,
                    "deal_reached": False,
                })
                ended = True
                break

            elif decision.action == "counter":
                if decision.proposed_terms is None:
                    raise RuntimeError(f"Counter decision from {speaker_id} missing proposed_terms")

                next_offer = decision.proposed_terms
                last_offer_by_party[speaker_id] = next_offer

                # New counteroffer: reset approvals (only countering party "accepts" their own offer)
                approvals = {speaker_id}
                on_table = next_offer
                counter_index += 1

                offer_key = tuple(sorted(next_offer.model_dump(exclude_none=True).items()))
                if offer_key not in seen_offers:
                    round_had_new_offer = True
                seen_offers.add(offer_key)

                transcript.append({
                    "round": round_no,
                    "speaker": next(p.role for p in config.parties if p.id == speaker_id),
                    "speaker_id": speaker_id,
                    "decision": "counter",
                    "utility": utility(agent_profiles[speaker_id], next_offer, issues),
                    "message": decision.message,
                    "offer": next_offer.model_dump(exclude_none=True),
                    "reasoning": decision.reasoning_summary,
                    "deal_reached": False,
                })

                continue

            else:
                # Should not happen - validation would catch invalid action
                logger.error(f"Unknown action {decision.action} from {speaker_id}")
                continue

        if ended:
            break

        # Track stalled rounds for deadlock detection
        stalled_rounds = 0 if round_had_new_offer else stalled_rounds + 1
        if stalled_rounds >= config.deadlock_after_stalled_rounds:
            outcome_reason = (
                f"No new offer appeared for {stalled_rounds} consecutive rounds; "
                "the configured deadlock limit was reached."
            )
            break

    # Build final response
    final_terms = on_table.model_dump(exclude_none=True) if outcome == "deal" else None
    # Compute ZOPA & Pareto analytics
    agent_list = [agent_profiles[party.id] for party in config.parties]
    zopa_report = analyze_zopa(agent_list, issues)
    pareto_report = (
        pareto_efficiency(agent_list, on_table, issues)
        if outcome == "deal" and on_table is not None
        else None
    )
    return {
        "scenario": scenario,
        "personalities": {party.role: party.personality for party in config.parties},
        "parties": [
            {
                "id": party.id,
                "role": party.role,
                "personality": party.personality,
                "skill": party.skill,
            }
            for party in config.parties
        ],
        "outcome": outcome,
        "outcome_reason": outcome_reason,
        "rounds": transcript[-1]["round"] if transcript else 0,
        "final_terms": final_terms,
        "satisfaction": {
            party.role: utility(agent_profiles[party.id], on_table, issues) if on_table else 0.0
            for party in config.parties
        },
        "transcript": transcript,
        "analytics": {
            "zopa": zopa_report,
            "pareto": pareto_report,
        },
    }


def run_negotiation(scenario: str, opener_personality: str,
                    responder_personality: str, max_rounds: int = 12,
                    config: NegotiationConfig | None = None) -> dict:
    """Run a negotiation simulation.

    If config is provided, uses it directly. Otherwise builds a standard
    2-party config for the given scenario.
    """
    from app.engine.scenarios import build_frontend_config

    if config is not None:
        if scenario not in SCENARIO_ISSUES:
            raise ValueError("scenario must be vendor, job, or budget")
        if {issue.id for issue in config.issues} != SCENARIO_ISSUES[scenario]:
            raise ValueError(f"config issues do not match the {scenario} scenario")
        return _run_configured_negotiation(config, scenario)

    if scenario in ("vendor", "job", "budget"):
        config = build_frontend_config(
            scenario, opener_personality, responder_personality, max_rounds
        )
        return _run_configured_negotiation(config, scenario)

    raise ValueError(f"Unknown scenario: {scenario}")