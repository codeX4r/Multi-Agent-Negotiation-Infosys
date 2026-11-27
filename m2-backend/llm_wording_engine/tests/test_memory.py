"""Phrase memory: learning from online turns and reusing them offline."""
import json

import pytest

from llm_wording_engine import PhraseMemory, WordingEngine, WordingRequest, Turn
from llm_wording_engine.llm_client import ScriptedClient
from llm_wording_engine.memory import fill, render, templatize
from llm_wording_engine.sample_scenarios import agents_for

OPEN = {"price": 1250000, "delivery": 40, "warranty": 6}


def buyer(p="collaborative"):
    return agents_for("vendor", {"buyer": p})[1]


def req(agent, table=OPEN, rnd=1, mx=8, hist=None):
    hist = hist if hist is not None else [Turn(speaker="Vendor", round=1, message="12.5 lakh, 40 days.", offer=table)]
    return WordingRequest(agent=agent, scenario="Vendor pricing", history=hist, offer_on_table=table,
                          offer_by="vendor", round=rnd, max_rounds=mx)


def model_reply(message, offer, decision="counter", tone="warm"):
    return json.dumps({"reasoning": "r", "decision": decision, "message": message, "offer": offer, "tone": tone})


@pytest.fixture
def mem(tmp_path):
    return PhraseMemory(path=str(tmp_path / "mem.json"))


# ---------------------------------------------------------------- number handling
def test_render_formats():
    assert render(1050000, "lakh") == "10.5" and render(1000000, "lakh") == "10"
    assert render(1050000, "indian") == "10,50,000" and render(1050000, "western") == "1,050,000"
    assert render(20, "plain") == "20"


def test_templatize_maps_own_and_table_numbers():
    own = {"price": 1050000, "delivery": 22, "warranty": 18}
    msg = "Your 12.5 lakh and 40 days are too high. We can do Rs 10.5 lakh with 22-day delivery and an 18-month warranty."
    t = templatize(msg, buyer(), own, OPEN)
    assert "{table.price:lakh} lakh" in t and "{table.delivery:plain} days" in t
    assert "{own.price:lakh} lakh" in t and "{own.delivery:plain}-day" in t and "{own.warranty:plain}-month" in t
    # refilled with new numbers it reads correctly
    new = fill(t, {"price": 1100000, "delivery": 25, "warranty": 12}, {"price": 1200000, "delivery": 35, "warranty": 6})
    assert "Rs 11 lakh with 25-day delivery and an 12-month warranty" in new and "Your 12 lakh and 35 days" in new


def test_templatize_rejects_unexplained_numbers():
    own = {"price": 1050000, "delivery": 22, "warranty": 18}
    assert templatize("We have 3 other suppliers lined up, so 10.5 lakh it is.", buyer(), own, OPEN) is None


def test_indian_comma_format_round_trips():
    own = {"price": 1080000, "delivery": 25, "warranty": 12}
    t = templatize("Final offer: Rs 10,80,000 for 25 days.", buyer(), own, OPEN)
    assert fill(t, {"price": 1120000, "delivery": 30, "warranty": 12}, OPEN) == "Final offer: Rs 11,20,000 for 30 days."


# ---------------------------------------------------------------- learning rules
def test_learns_clean_model_turn_and_persists(mem, tmp_path):
    offer = {"price": 1050000, "delivery": 22, "warranty": 18}
    eng = WordingEngine(client=ScriptedClient([model_reply("Could we meet at 10.5 lakh with 22-day delivery?", offer)]), memory=mem)
    res = eng.reason(req(buyer()))
    assert res.phrasing == "model" and res.memory_id and len(mem) == 1
    again = PhraseMemory(path=str(tmp_path / "mem.json"))          # reloaded from disk
    assert len(again) == 1 and again.entries[0]["personality"] == "collaborative"


def test_does_not_learn_corrected_or_fallback_turns(mem):
    bad = model_reply("We want 12.9 lakh.", {"price": 1290000, "delivery": 44, "warranty": 6})   # beyond limits -> guardrail fixes
    WordingEngine(client=ScriptedClient([bad]), memory=mem).reason(req(buyer()))
    WordingEngine(client=ScriptedClient(["not json"]), memory=mem).reason(req(buyer()))
    assert len(mem) == 0


def test_duplicate_lines_are_merged(mem):
    offer = {"price": 1050000, "delivery": 22, "warranty": 18}
    line = model_reply("Could we meet at 10.5 lakh with 22-day delivery?", offer)
    WordingEngine(client=ScriptedClient([line, line]), memory=mem).reason(req(buyer()))
    WordingEngine(client=ScriptedClient([line]), memory=mem).reason(req(buyer()))
    assert len(mem) == 1 and mem.entries[0]["seen"] == 2


def test_size_is_capped(tmp_path):
    m = PhraseMemory(path=str(tmp_path / "m.json"), max_entries=3)
    for i in range(6):
        offer = {"price": 1000000 + i * 10000, "delivery": 20, "warranty": 18}
        WordingEngine(client=ScriptedClient([model_reply(f"Variant {chr(65 + i)}: {render(offer['price'], 'lakh')} lakh, 20 days.", offer)]),
                      memory=m).reason(req(buyer()))
    assert len(m) == 3


# ---------------------------------------------------------------- reuse offline
def test_offline_reuses_learned_line_with_its_own_numbers(mem):
    offer = {"price": 1050000, "delivery": 22, "warranty": 18}
    WordingEngine(client=ScriptedClient([model_reply("Thanks. Could we settle at 10.5 lakh with 22-day delivery?", offer)]),
                  memory=mem).reason(req(buyer()))
    off = WordingEngine(provider="offline", memory=mem).reason(req(buyer(), rnd=2))
    assert off.source == "offline" and off.phrasing == "memory"
    assert off.message.startswith("Thanks. Could we settle at ")
    price = off.offer["price"]
    assert f"{render(price, 'lakh')} lakh with {int(off.offer['delivery'])}-day delivery" in off.message   # numbers match the offer actually made


def test_offline_respects_personality_and_falls_back_to_template(mem):
    offer = {"price": 1050000, "delivery": 22, "warranty": 18}
    WordingEngine(client=ScriptedClient([model_reply("Could we meet at 10.5 lakh?", offer)]), memory=mem).reason(req(buyer()))
    off = WordingEngine(provider="offline", memory=mem).reason(req(buyer("aggressive")))
    assert off.phrasing == "template"          # nothing learned for aggressive yet


def test_reinforcement_prefers_lines_from_deals(mem):
    o1 = {"price": 1050000, "delivery": 22, "warranty": 18}
    a = WordingEngine(client=ScriptedClient([model_reply("Line A: 10.5 lakh, 22 days.", o1)]), memory=mem).reason(req(buyer()))
    b = WordingEngine(client=ScriptedClient([model_reply("Line B: 10.5 lakh, 22 days.", o1)]), memory=mem).reason(req(buyer()))
    mem.reinforce([b.memory_id], deal=True)
    mem.reinforce([b.memory_id], deal=True)
    off = WordingEngine(provider="offline", memory=mem).reason(req(buyer(), rnd=2))
    assert off.message.startswith("Line B")


def test_engine_without_memory_is_unchanged():
    res = WordingEngine(provider="offline").reason(req(buyer()))
    assert res.phrasing == "template" and res.memory_id is None


def test_corrupt_memory_file_does_not_crash(tmp_path):
    p = tmp_path / "m.json"
    p.write_text("{ broken", encoding="utf-8")
    m = PhraseMemory(path=str(p))
    assert len(m) == 0


def test_issue_already_measured_in_lakh():
    eng_head = agents_for("budget")[0]
    own = {"budget": 25, "timeline": 8, "contingency": 13}
    t = templatize("We need 25 lakh INR for engineering and 8 months, with 13 % contingency.", eng_head, own, None)
    assert t == "We need {own.budget:plain} lakh INR for engineering and {own.timeline:plain} months, with {own.contingency:plain} % contingency."
