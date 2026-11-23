from .evaluation import evaluate_offer, first_issue_beyond_batna, utility
from .scenarios import build_configured_agents, build_frontend_config, build_scenario
from .messages import issue_for_terms, write_message
from .models import NegotiationConfig, NegotiationContext, SCENARIO_ISSUES
from .llm_wording import generate_wording
def _message(
    agent, decision, terms, scenario, transcript,
    round_number, max_rounds, counter_index=0,
    issue_index=None, deal_reached=False, current_offer=None
):
    wording = generate_wording(
        agent=agent,
        scenario=scenario,
        decision=decision,
        current_offer=current_offer or terms,
        transcript=transcript,
        round_number=round_number,
        max_rounds=max_rounds,
        approved_terms=terms if decision == "counter" else None,
    )

    if wording:
        return wording

    return write_message(
        agent, decision, terms, counter_index,
        issue_index, deal_reached=deal_reached
    )

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
                "message": _message(
                 agent=speaker,
                 decision=decision.decision,
                 terms=on_table if decision.decision == "reject" else decision.counter_offer,
                 scenario=scenario,
                 transcript=transcript,
                 round_number=round_no,
                 max_rounds=config.rounds_limit,
                 counter_index=counter_index,
                 issue_index=rejected_issue_index,
                 deal_reached=deal_reached,
                 current_offer=on_table,
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

    if scenario in ("job", "budget"):
        config = build_frontend_config(
            scenario, opener_personality, responder_personality, max_rounds
        )
        return _run_configured_negotiation(config, scenario)

    opener, responder = build_scenario(scenario, opener_personality, responder_personality)

    on_table = opener.target
    last = {opener.id: opener.target, responder.id: None}
    transcript = [{
        "round": 0, "speaker": opener.role, "speaker_id": opener.id, "decision": "open",
        "utility": utility(opener, on_table),
        "message": write_message(opener, "open", on_table),
        "offer": on_table.model_dump(exclude_none=True),
        "reasoning": "Opening with my ideal terms.",
    }]

    outcome = "deadlock"
    outcome_reason = f"No agreement was reached within {max_rounds} rounds."
    speaker, other = responder, opener
    counter_index = 0
    for rnd in range(1, max_rounds + 1):
        context = NegotiationContext(
            scenario=scenario,
            round_number=rnd,
            max_rounds=max_rounds,
            current_offer=on_table,
            previous_offer=last[speaker.id],
            conversation_history=transcript.copy(),
        )
        d = evaluate_offer(
            speaker,
            on_table,
            last[speaker.id],
            rnd,
            max_rounds,
            context=context,
        )
        if scenario == "vendor" and d.counter_offer is not None:
            price = d.counter_offer.price if d.counter_offer.price is not None else 1050000
            price = round(price / 10000) * 10000
            price = max(900000, min(1300000, price))
            warranty = d.counter_offer.warranty_months if d.counter_offer.warranty_months is not None else 12
            warranty = round(warranty / 6) * 6
            warranty = max(6, min(36, warranty))
            payment = d.counter_offer.payment_days if d.counter_offer.payment_days is not None else 30
            payment = round(payment / 15) * 15
            payment = max(0, min(60, payment))
            d.counter_offer = d.counter_offer.model_copy(update={
                "price": price,
                "warranty_months": warranty,
                "payment_days": payment,
            })
        if scenario == "budget" and d.counter_offer is not None:
            eng = round(d.counter_offer.price) if d.counter_offer.price is not None else 20
            mkt = round(d.counter_offer.payment_days) if d.counter_offer.payment_days is not None else 14
            eng = max(8, min(34, eng))
            mkt = max(6, min(30, mkt))
            if eng + mkt > 45:
                mkt = 45 - eng
            mkt = max(6, min(30, mkt))
            ops = 50 - eng - mkt
            if ops < 5:
                eng = max(8, eng - (5 - ops))
                ops = 50 - eng - mkt
            if ops > 28:
                eng = max(8, eng - (ops - 28))
                ops = 50 - eng - mkt
            timeline = round(d.counter_offer.delivery_days) if d.counter_offer.delivery_days is not None else 6
            timeline = max(3, min(9, timeline))
            d.counter_offer = d.counter_offer.model_copy(update={
                "eng": eng,
                "mkt": mkt,
                "ops": ops,
                "timeline": timeline,
            })
        if scenario == "job" and d.counter_offer is not None:
            salary = d.counter_offer.price if d.counter_offer.price is not None else 1800000
            salary = max(1200000, min(2400000, round(salary)))
            salary = round(salary / 50000) * 50000
            start = d.counter_offer.delivery_days if d.counter_offer.delivery_days is not None else 6
            bonus = d.counter_offer.warranty_months if d.counter_offer.warranty_months is not None else 1
            remote = d.counter_offer.payment_days if d.counter_offer.payment_days is not None else 3
            bonus_lakh = round(max(0, min(3, bonus)) / 0.25) * 0.25
            d.counter_offer = d.counter_offer.model_copy(update={
                "salary": round(salary / 100000, 1),
                "bonus": bonus_lakh,
                "start": max(2, min(12, start)),
                "remote": max(0, min(5, remote)),
            })
        entry = {
            "round": rnd, "speaker": speaker.role, "speaker_id": speaker.id, "decision": d.decision,
            "utility": d.utility,
            "message": _message(
                  agent=speaker,
                  decision=d.decision,
                  terms=on_table if d.decision == "reject" else d.counter_offer,
                  scenario=scenario,
                  transcript=transcript,
                  round_number=rnd,
                  max_rounds=max_rounds,
                  counter_index=counter_index,
                  current_offer=on_table,
            ),
            "offer": d.counter_offer.model_dump(exclude_none=True) if d.counter_offer else None,
            "reasoning": d.reasoning,
        }
        transcript.append(entry)

        if d.decision == "accept":
            outcome = "deal"
            outcome_reason = f"{speaker.role} accepted the offer at round {rnd}."
            break
        if d.decision == "reject":
            outcome = "breakdown"
            issue = issue_for_terms(on_table, counter_index)
            outcome_reason = (
                f"{speaker.role} rejected at round {rnd}: {issue} terms were beyond "
                "their walk-away limit."
            )
            break
        counter_index += 1
        on_table = d.counter_offer
        last[speaker.id] = on_table
        speaker, other = other, speaker

    return {
        "scenario": scenario,
        "personalities": {opener.role: opener_personality, responder.role: responder_personality},
        "parties": [
            {
                "id": opener.id,
                "role": opener.role,
                "personality": opener_personality,
                "skill": opener.skill,
            },
            {
                "id": responder.id,
                "role": responder.role,
                "personality": responder_personality,
                "skill": responder.skill,
            },
        ],
        "outcome": outcome,
        "outcome_reason": outcome_reason,
        "rounds": len(transcript) - 1,
        "final_terms": on_table.model_dump(exclude_none=True) if outcome == "deal" else None,
        "satisfaction": {
            opener.role: utility(opener, on_table),
            responder.role: utility(responder, on_table),
        },
        "transcript": transcript,
    }