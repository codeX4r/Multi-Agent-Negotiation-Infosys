# LLM Wording Engine (Milestone 2: LLM wording)

**Author:** Annika Dubey  
**Project:** Multi-Agent Negotiation Simulator  
**Scope:** the LLM wording layer for Milestone 2. It gives every agent natural, persona-driven language, written by a real model from the agent's persona, goals and the full conversation history.

It is designed to sit on top of the team's existing orchestrator and evaluation engine: their engine decides accept, counter or reject, and this module turns that decision into what the agent actually says, its explained rationale, and well-formed terms. It does not replace or change any existing module. It is self-contained and uses only the Python standard library.

## What it does

One call per agent turn. Pass the existing engine's decision as `decision_hint` and the model will phrase it; without a hint it can also suggest a move on its own (useful for testing it standalone):

```
WordingRequest  ──►  WordingEngine.reason()  ──►  WordingResult
 (persona, goals,          builds the prompt,            decision: accept | counter | reject
  private limits,          calls the LLM,                reasoning: private, why it decided this
  full history,            parses JSON,                  message: what it says at the table
  offer on table)          applies guardrails            offer: proposed terms, within its own limits
```

| File | Purpose |
|---|---|
| `engine.py` | The wording engine: prompt → model → JSON → guardrails → result. Falls back to an offline writer if the model is unavailable, so a session never stalls. |
| `prompts.py` | Persona prompts for aggressive, collaborative and risk-averse agents, with goals, constraints, private limits and the full conversation history. |
| `llm_client.py` | One interface for Gemini, Claude, OpenAI and Ollama (local). Retries on rate limits and timeouts with live progress. Picks a fast current Gemini model automatically (`gemini-flash-lite-latest`). |
| `safety.py` | Guardrails: the model can never propose terms beyond the agent's own limits or accept below its walk-away point. Invalid values are clamped and snapped, and every correction is logged. |
| `memory.py` | Phrase memory: the offline writer learns from every good online run (see below). |
| `schema.py` | The input and output contract (plain dataclasses, dict in and out). |
| `sample_scenarios.py` | Sample agents for vendor pricing, job offer and project budget, from the Milestone 1.3 templates. |
| `demo.py` | Recordable demo: one offer worded by three personalities, then a live exchange per scenario. Saves every run to `llm_wording_engine/runs/`. |
| `tests/` | 44 pytest tests: JSON parsing, prompt content, guardrails, fallbacks, phrase memory, all 3 scenarios × 3 personalities, and provider wiring against a fake server. |

## Run it (Windows PowerShell, from the `backend` folder)

```powershell
cd backend
py -3.13 -m pip install -r llm_wording_engine/requirements-dev.txt   # only needed for the tests

# 1. Tests (no key needed)
py -3.13 -m pytest llm_wording_engine -q

# 2. Demo without a key (offline rule-based reasoner)
py -3.13 -m llm_wording_engine.demo --provider offline

# 3. Demo with a real model (Gemini free tier)
Copy-Item llm_wording_engine/.env.example llm_wording_engine/.env   # then paste your key into that .env (it is git-ignored)
py -3.13 -m llm_wording_engine.demo --provider gemini
py -3.13 -m llm_wording_engine.demo --provider gemini --scenario all
```

**Choosing a model.** By default the engine uses Gemini's `gemini-flash-lite-latest` alias, which always points at a current fast model. Google retires numbered models over time, so if a run shows `source: fallback` with a "not found" or "no longer available" message, pick another name from your account's list and set it in `.env` as `GEMINI_MODEL=...` or pass `--model NAME`. To list the names your key can use:

```powershell
py -3.13 -c "from llm_wording_engine.llm_client import load_dotenv,_get; import os; load_dotenv(); d=_get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key='+os.environ['GEMINI_API_KEY']); print('\n'.join(m['name'] for m in d['models'] if 'generateContent' in m.get('supportedGenerationMethods',[])))"
```

Heavy "thinking" models are slow on the free tier; prefer names with `lite` in them.

Options: `--provider gemini|claude|openai|ollama|auto|offline`, `--model NAME`, `--scenario vendor|job|budget|all`, `--turns N`, `--part 1|2|both`, `--pause SECONDS` (spacing between calls for free-tier limits).

Use `python` instead of `py -3.13` if Python is on your PATH. Each turn shows the private reasoning, the decision, the public message, the offer, any guardrail corrections, and whether it came from the model (`source: llm`) or the offline writer.

## Phrase memory: an offline mode that learns

The offline writer does not stay limited to its fixed templates. Every time the online mode runs, clean model-written lines are saved to `llm_wording_engine/memory/phrase_memory.json`, and the offline mode reuses them. The more the online mode is used, the larger and better the offline phrase bank gets.

**How it works**
1. **Learn (online).** A turn is stored only if it came from the model (`source: llm`) and the guardrails did not have to correct it. With each line it records the situation: personality, decision, opening or reply, round phase (early, mid, late) and how far apart the sides are (close, mid, far).
2. **Numbers become slots.** Every number in the line is matched to an offer term and replaced by a slot, so "10.5 lakh with 22-day delivery" is stored as `{own.price:lakh} lakh with {own.delivery:plain}-day delivery`. If a number cannot be matched (for example "3 other suppliers"), the line is not stored. Reused lines therefore always carry the numbers of the offer actually being made.
3. **Reuse (offline or fallback).** The engine still decides the move with its rules, then asks the memory for the best line for that situation. Lines from the same role, phase and gap score higher, lines from conversations that ended in a deal score higher, and lines used in the last few turns are avoided. If nothing fits, the fixed template is used.
4. **Feedback.** When a demo conversation ends in a deal, the lines used in it gain quality; when it fails, they lose a little.

Duplicates are merged, the file is capped at 600 lines (lowest quality dropped first), writes are atomic, and a damaged file is ignored rather than crashing.

In the demo, each turn shows where its message came from: `learned into memory #id` (online), `phrased from memory #id` or `fixed template` (offline).

```powershell
py -3.13 -m llm_wording_engine.demo --provider gemini      # grows the memory
py -3.13 -m llm_wording_engine.demo --provider offline     # reuses it
py -3.13 -m llm_wording_engine.stats                       # shows what has been learned
```

Use `--no-memory` to turn it off. In code, memory is opt-in: `WordingEngine(provider="gemini", memory=PhraseMemory())`. The file location can be changed with the `NEGOTIATION_MEMORY_PATH` environment variable. The memory file contains only negotiation lines (no keys), so it can be committed to share what has been learned.

## Integration contract

Dict in, dict out, so it can sit behind any API endpoint:

```python
from llm_wording_engine import WordingEngine

engine = WordingEngine(provider="gemini")          # or "auto" / "offline"
result = engine.reason_dict({
    "agent": {
        "id": "buyer", "name": "Buyer", "role": "procurement lead", "personality": "collaborative",
        "persona": "Cares about total value and on-time delivery.",
        "goals": ["Price under 11 lakh"], "constraints": ["Budget is 11.8 lakh"],
        "batna": "Rival quote at 11.2 lakh", "batna_utility": 0.30,
        "issues": [
            {"id": "price", "label": "Price", "ideal": 950000, "limit": 1180000, "weight": 0.45, "step": 10000},
            {"id": "delivery", "label": "Delivery", "ideal": 15, "limit": 40, "weight": 0.30, "unit": "days"}
        ]
    },
    "scenario": "Vendor pricing",
    "history": [{"speaker": "Vendor", "message": "12.5 lakh, 40 days.", "offer": {"price": 1250000, "delivery": 40}}],
    "offer_on_table": {"price": 1250000, "delivery": 40}, "offer_by": "vendor",
    "round": 2, "max_rounds": 10,
    "decision_hint": None      # optional: pass "accept"/"counter"/"reject" from an existing evaluation module
})
# result: {"decision", "reasoning", "message", "offer", "tone", "source", "guardrail_notes", ...}
```

**Plugging into the existing orchestrator.** The team's evaluation module already decides accept/counter/reject. Pass that decision as `decision_hint`: the model explains it, phrases it and fills in the terms, and never overrides the evaluator. The current fixed-sentence message function can be replaced by one call:

```python
def write_message(agent, decision, terms, history):
    req = to_reasoning_request(agent, history, decision_hint=decision)   # map your models to the dict above
    return engine.reason_dict(req)["message"]
```

Each negotiable term maps to an `issue` with the agent's `ideal` value and its `limit` (worst acceptable value). Weights are normalised automatically.

## Design notes

- **The LLM writes, the guardrails keep numbers safe.** The model writes the reasoning, message and terms. `safety.py` checks every term against the agent's own limits and the issue range, and never lets the agent accept below its walk-away.
- **Private information stays private.** Limits, weights and the walk-away go in the system prompt with an instruction never to reveal them; only the public message goes to other agents.
- **Never stalls.** On a network error, rate limit or unparseable reply, the offline writer produces a valid turn, marked `source: fallback`.
- **No dependencies.** Standard library only, Python 3.9+.

Builds on the system architecture (HLD/LLD) and the Milestone 1.3 scenario templates by Annika Dubey, and is meant to plug into the team's Milestone 2 orchestrator and evaluation engine.
