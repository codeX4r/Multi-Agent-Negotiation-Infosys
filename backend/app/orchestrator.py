from .evaluation import evaluate_offer, utility
from .scenarios import build_scenario
from .messages import write_message
from .models import NegotiationContext


def run_negotiation(scenario: str, opener_personality: str,
                    responder_personality: str, max_rounds: int = 12) -> dict:
    opener, responder = build_scenario(scenario, opener_personality, responder_personality)

    on_table = opener.target
    last = {opener.id: opener.target, responder.id: None}
    transcript = [{
        "round": 0, "speaker": opener.role, "decision": "open",
        "utility": utility(opener, on_table),
        "message": write_message(opener, "open", on_table),
        "offer": on_table.model_dump(),
        "reasoning": "Opening with my ideal terms.",
    }]

    outcome = "deadlock"
    speaker, other = responder, opener
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
        entry = {
            "round": rnd, "speaker": speaker.role, "decision": d.decision,
            "utility": d.utility,
            "message": write_message(speaker, d.decision, d.counter_offer),
            "offer": d.counter_offer.model_dump() if d.counter_offer else None,
            "reasoning": d.reasoning,
        }
        transcript.append(entry)

        if d.decision == "accept":
            outcome = "deal"
            break
        if d.decision == "reject":
            outcome = "breakdown"
            break
        on_table = d.counter_offer
        last[speaker.id] = on_table
        speaker, other = other, speaker

    return {
        "scenario": scenario,
        "personalities": {opener.role: opener_personality, responder.role: responder_personality},
        "outcome": outcome,
        "rounds": len(transcript) - 1,
        "final_terms": on_table.model_dump() if outcome == "deal" else None,
        "satisfaction": {
            opener.role: utility(opener, on_table),
            responder.role: utility(responder, on_table),
        },
        "transcript": transcript,
    }