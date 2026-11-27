"""Tests for the LLM Wording Engine. Run from the backend folder:  python -m pytest llm_wording_engine -q"""
import json

import pytest

from llm_wording_engine import WordingEngine, WordingRequest, Turn
from llm_wording_engine.engine import parse_json
from llm_wording_engine.llm_client import LLMError, ScriptedClient, make_client
from llm_wording_engine.prompts import system_prompt, user_prompt
from llm_wording_engine.safety import check_offer, fallback_offer, utility
from llm_wording_engine.sample_scenarios import SCENARIOS, agents_for

OPEN = {"price": 1250000, "delivery": 40, "warranty": 6}


def buyer_req(p="collaborative", **kw):
    _, buyer = agents_for("vendor", {"buyer": p})
    hist = [Turn(speaker="Vendor", round=1, message="Rs 12.5 lakh, 40 days, 6 months.", offer=OPEN)]
    base = dict(agent=buyer, scenario="vendor test", history=hist, offer_on_table=OPEN, offer_by="vendor", round=1, max_rounds=8)
    base.update(kw)
    return WordingRequest(**base)


def reply(**kw):
    d = {"reasoning": "test reasoning", "decision": "counter", "message": "Here is our counter.",
         "offer": {"price": 1000000, "delivery": 20, "warranty": 18}, "tone": "warm"}
    d.update(kw)
    return json.dumps(d)


# ---------------------------------------------------------------- parsing
@pytest.mark.parametrize("text", [
    reply(), "```json\n" + reply() + "\n```", "Sure! Here you go:\n" + reply() + "\nHope that helps.",
])
def test_parse_json_handles_fences_and_prose(text):
    assert parse_json(text)["decision"] == "counter"


def test_parse_json_rejects_garbage():
    with pytest.raises(ValueError):
        parse_json("no json here")


# ---------------------------------------------------------------- prompt content (persona, goals and full history reach the model)
def test_prompt_contains_persona_goals_limits_and_full_history():
    req = buyer_req()
    req.history.append(Turn(speaker="Buyer", round=1, message="Too high for us.", offer={"price": 950000, "delivery": 15, "warranty": 24}))
    s, u = system_prompt(req.agent, req.scenario), user_prompt(req)
    assert req.agent.persona in s and req.agent.goals[0] in s and "1180000" in s
    assert "Rs 12.5 lakh, 40 days, 6 months." in u and "Too high for us." in u
    assert "never reveal" in s.lower()


def test_decision_hint_is_passed_to_model_and_enforced():
    client = ScriptedClient([reply(decision="accept")])
    res = WordingEngine(client=client).reason(buyer_req(decision_hint="counter"))
    assert "already decided" in client.calls[0][1]
    assert res.decision == "counter"
    assert any("evaluator" in n for n in res.guardrail_notes)


# ---------------------------------------------------------------- engine with a model reply
def test_valid_model_counter_passes_through():
    res = WordingEngine(client=ScriptedClient([reply()])).reason(buyer_req())
    assert res.source == "llm" and res.decision == "counter"
    assert res.offer == {"price": 1000000, "delivery": 20, "warranty": 18}
    assert res.guardrail_notes == []


def test_offer_beyond_own_limit_is_pulled_back():
    bad = reply(offer={"price": 1290000, "delivery": 44, "warranty": 6})   # worse than buyer's limits
    res = WordingEngine(client=ScriptedClient([bad])).reason(buyer_req())
    assert res.offer["price"] == 1180000 and res.offer["delivery"] == 40
    assert len(res.guardrail_notes) >= 2


def test_values_snap_to_valid_steps_and_strings_are_parsed():
    res = WordingEngine(client=ScriptedClient([reply(offer={"price": "10,03,333", "delivery": 20.4, "warranty": 13})]))\
        .reason(buyer_req())
    assert res.offer["price"] % 10000 == 0 and res.offer["delivery"] == 20 and res.offer["warranty"] in (12, 18)


def test_accept_below_walk_away_becomes_counter():
    res = WordingEngine(client=ScriptedClient([reply(decision="accept", offer=None)])).reason(buyer_req())
    assert res.decision == "counter" and res.offer is not None
    assert any("walk-away" in n for n in res.guardrail_notes)


def test_counter_without_terms_gets_schedule_terms():
    res = WordingEngine(client=ScriptedClient([reply(offer=None)])).reason(buyer_req())
    assert res.offer and set(res.offer) == {"price", "delivery", "warranty"}


def test_model_failure_falls_back_without_crashing():
    res = WordingEngine(client=ScriptedClient([LLMError("HTTP 503")])).reason(buyer_req())
    assert res.source == "fallback" and res.decision in ("accept", "counter", "reject")
    assert res.message


def test_unparseable_reply_falls_back():
    res = WordingEngine(client=ScriptedClient(["I think we should counter."])).reason(buyer_req())
    assert res.source == "fallback"


# ---------------------------------------------------------------- offline writer across all scenarios
@pytest.mark.parametrize("scenario", list(SCENARIOS))
@pytest.mark.parametrize("p", ["aggressive", "collaborative", "risk_averse"])
def test_offline_exchange_stays_within_limits(scenario, p):
    a, b = agents_for(scenario)
    a.personality = b.personality = p
    eng = WordingEngine(provider="offline")
    hist, table, by = [], None, None
    for k in range(16):
        ag = (a, b)[k % 2]
        res = eng.reason(WordingRequest(agent=ag, scenario=scenario, history=list(hist), offer_on_table=table,
                                          offer_by=by, round=k // 2 + 1, max_rounds=8))
        if res.offer:
            for i in ag.issues:   # every proposed value respects the agent's own limit
                v = res.offer[i.id]
                assert (v <= i.limit if i.ideal < i.limit else v >= i.limit)
        if res.decision == "accept":
            assert utility(ag, table) >= ag.batna_utility
            break
        if res.decision == "reject":
            break
        hist.append(Turn(speaker=ag.name, message=res.message, offer=res.offer, decision=res.decision, round=k // 2 + 1))
        table, by = res.offer, ag.id


def test_personality_changes_concession_speed():
    _, buyer = agents_for("vendor")
    mid = {}
    for p in ("aggressive", "collaborative", "risk_averse"):
        buyer.personality = p
        mid[p] = fallback_offer(buyer, 3, 8)["price"]
    assert mid["aggressive"] < mid["collaborative"] < mid["risk_averse"]   # buyer concedes upward on price


def test_dict_interface_round_trip():
    req = {"agent": {"id": "x", "name": "X", "role": "seller", "personality": "risk-averse",
                     "issues": [{"id": "price", "label": "Price", "ideal": 100, "limit": 80}]},
           "scenario": "demo", "history": [{"speaker": "Y", "message": "70?", "offer": {"price": 70}}],
           "offer_on_table": {"price": 70}, "offer_by": "y"}
    out = WordingEngine(provider="offline").reason_dict(req)
    assert out["decision"] == "counter" and out["offer"]["price"] >= 80


def test_check_offer_drops_unknown_keys():
    _, buyer = agents_for("vendor")
    clean, notes = check_offer(buyer, {**OPEN, "free_lunch": 1})
    assert "free_lunch" not in clean and any("unknown" in n for n in notes)


def test_offline_when_no_key(monkeypatch):
    for k in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    import llm_wording_engine.llm_client as lc
    monkeypatch.setattr(lc, "load_dotenv", lambda *a, **k: None)   # ignore a real .env on this machine
    assert make_client("auto") is None
    assert WordingEngine().provider == "offline"
