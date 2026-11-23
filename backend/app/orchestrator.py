from .evaluation import evaluate_offer, first_issue_beyond_batna, utility
from .scenarios import build_configured_agents, build_frontend_config, build_scenario
from .messages import issue_for_terms, write_message
from .models import NegotiationConfig, NegotiationContext, SCENARIO_ISSUES


def _run_configured_negotiation(config: NegotiationConfig, scenario: str) -> dict:
    agents = build_configured_agents(config)
    issues = config.issues
    opener_index = next(
        index for index, agent in enumerate(agents)
        if agent.id == config.opener_id
    )
    opener = agents[opener_index]
    on_table = opener.target
    last = {agent.id: None for agent in agents}
    approvals = {opener.id}
    transcript = [{
        "round": 0,
        "speaker": opener.role,
        "speaker_id": opener.id,
        "decision": "open",
        "utility": utility(opener, on_table, issues),
        "message": write_message(opener, "open", on_table),
        "offer": on_table.model_dump(exclude_none=True),
        "reasoning": "Opening with my ideal terms.",
    }]

    outcome = "deadlock"
    outcome_reason = f"No agreement was reached within {config.rounds_limit} rounds."
    current_index = (opener_index + 1) % len(agents)
    stalled_rounds = 0
    seen_offers = {tuple(sorted(on_table.model_dump(exclude_none=True).items()))}
    counter_index = 0
    for round_no in range(1, config.rounds_limit + 1):
        round_had_new_offer = False
        ended = False
        for _ in agents:
            speaker = agents[current_index]
            current_index = (current_index + 1) % len(agents)
            if speaker.id in approvals:
                continue

            context = NegotiationContext(
                scenario=scenario,
                round_number=round_no,
                max_rounds=config.rounds_limit,
                current_offer=on_table,
                previous_offer=last[speaker.id],
                conversation_history=transcript.copy(),
            )
            decision = evaluate_offer(
                speaker,
                on_table,
                last[speaker.id],
                round_no,
                config.rounds_limit,
                context=context,
                issues=issues,
                constraint=config.constraint,
            )
            rejected_issue_index = (
                first_issue_beyond_batna(speaker, on_table, issues)
                if decision.decision == "reject"
                else None
            )
            deal_reached = (
                decision.decision == "accept"
                and len(approvals | {speaker.id}) == len(agents)
            )
            entry = {
                "round": round_no,
                "speaker": speaker.role,
                "speaker_id": speaker.id,
                "decision": decision.decision,
                "utility": decision.utility,
                "message": write_message(
                    speaker,
                    decision.decision,
                    on_table if decision.decision == "reject" else decision.counter_offer,
                    counter_index,
                    rejected_issue_index,
                    deal_reached=deal_reached,
                ),
                "offer": decision.counter_offer.model_dump(exclude_none=True)
                if decision.counter_offer else None,
                "reasoning": decision.reasoning,
            }
            transcript.append(entry)

            if decision.decision == "accept":
                approvals.add(speaker.id)
                if len(approvals) == len(agents):
                    outcome = "deal"
                    outcome_reason = f"All parties accepted the offer at round {round_no}."
                    ended = True
                    break
                continue
            if decision.decision == "reject":
                outcome = "breakdown"
                issue = issue_for_terms(
                    on_table,
                    counter_index if rejected_issue_index is None else rejected_issue_index,
                )
                outcome_reason = (
                    f"{speaker.role} rejected at round {round_no}: {issue} terms were beyond "
                    "their walk-away limit."
                )
                ended = True
                break

            next_offer = decision.counter_offer
            if next_offer is None:
                raise RuntimeError("A counter decision must include a counter offer.")
            offer_key = tuple(sorted(next_offer.model_dump(exclude_none=True).items()))
            if offer_key not in seen_offers:
                round_had_new_offer = True
            seen_offers.add(offer_key)
            last[speaker.id] = next_offer
            on_table = next_offer
            approvals = {speaker.id}
            counter_index += 1

        if ended:
            break
        stalled_rounds = 0 if round_had_new_offer else stalled_rounds + 1
        if stalled_rounds >= config.deadlock_after_stalled_rounds:
            outcome_reason = (
                f"No new offer appeared for {stalled_rounds} consecutive rounds; "
                "the configured deadlock limit was reached."
            )
            break

    return {
        "scenario": scenario,
        "personalities": {agent.role: agent.personality for agent in agents},
        "parties": [
            {
                "id": agent.id,
                "role": agent.role,
                "personality": agent.personality,
                "skill": agent.skill,
            }
            for agent in agents
        ],
        "outcome": outcome,
        "outcome_reason": outcome_reason,
        "rounds": transcript[-1]["round"],
        "final_terms": on_table.model_dump(exclude_none=True) if outcome == "deal" else None,
        "satisfaction": {
            agent.role: utility(agent, on_table, issues)
            for agent in agents
        },
        "transcript": transcript,
    }


def run_negotiation(scenario: str, opener_personality: str,
                    responder_personality: str, max_rounds: int = 12,
                    config: NegotiationConfig | None = None) -> dict:
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