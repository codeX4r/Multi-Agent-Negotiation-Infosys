# LLM Wording Engine (Milestone 2: LLM wording)

**Author:** Annika Dubey  
**Project:** Multi-Agent Negotiation Simulator  
**Scope:** the LLM wording layer for Milestone 2. It gives every agent natural, persona-driven language, written by a real model from the agent's persona, goals and the full conversation history.

It is designed to sit on top of the team's existing orchestrator and evaluation engine: their engine decides accept, counter or reject, and this module turns that decision into what the agent actually says, its explained rationale, and well-formed terms. It does not replace or change any existing module. It is self-contained and uses only the Python standard library.

## What it does

One call per agent turn. Pass the existing engine's decision as `decision_hint` and the model will phrase it; without a hint it can also suggest a move on its own (useful for testing it standalone):

```
WordingRequest  ──►  WordingEngine.reason()  ──►  WordingResult
 (persona, goals,         builds the prompt,          decision: accept | counter | reject
  private limits,         calls the LLM,              reasoning: private, why it decided this
  full history,           parses JSON,                message: what it says at the table
  offer on table)         applies guardrails          offer: proposed terms, within its own limits
```

| File | Purpose |
|---|---|
| `engine.py` | The wording engine: prompt → model → JSON → guardrails → result. Falls back to an offline writer if the model is unavailable, so a session never stalls. |
| `prompts.py` | Persona prompts for aggressive, collaborative and risk-averse agents, with goals, constraints, private limits and the full conversation history. |
| `llm_client.py` | One interface for Gemini, Claude, OpenAI and Ollama (local). Retries on rate limits and timeouts with live progress. Picks a fast current Gemini model automatically (`gemini-flash-lite-latest`). |
| `safety.py` | Guardrails: the model can never propose terms beyond the agent's own limits or accept below its walk-away point. Invalid values are clamped and snapped, and every correction is logged. |
| `schema.py` | The input and output contract (plain dataclasses, dict in and out). |
| `sample_scenarios.py` | Sample agents for vendor pricing, job offer and project budget, from the Milestone 1.3 templates. |
| `demo.py` | Recordable demo: one offer worded by three personalities, then a live exchange per scenario. Saves every run to `llm_wording_engine/runs/`. |
| `tests/` | 30 pytest tests: JSON parsing, prompt content, guardrails, fallbacks, all 3 scenarios × 3 personalities, and provider wiring against a fake server. |

## How to run it with AI (Gemini, free)

All commands below are for Windows PowerShell and use Python 3.13 through the `py` launcher. If Python is on your PATH you can type `python` instead of `py -3.13`.

### 1. Get a free Gemini API key
1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key** and copy it.

### 2. Open a terminal in the `backend` folder
Every command must be run from the `backend` folder (the one that contains `llm_wording_engine`):

```powershell
cd "path\to\Multi-Agent-Negotiation-Infosys\backend"
```

### 3. Create the `.env` file with your key
```powershell
Copy-Item llm_wording_engine\.env.example llm_wording_engine\.env
notepad llm_wording_engine\.env
```
In Notepad, put your key after the `=` (no quotes, no spaces) and save:
```
GEMINI_API_KEY=your-key-here
```
The `.env` file is git-ignored, so the key never goes to GitHub. Never put the key in `.env.example`, which is committed.

### 4. Run the demo with the real model
```powershell
py -3.13 -m llm_wording_engine.demo --provider gemini
```
All three scenarios (takes a few minutes because of free-tier pacing):
```powershell
py -3.13 -m llm_wording_engine.demo --provider gemini --scenario all
```

### 5. Check that the AI is really being used
- The header shows `Provider: gemini` and a model name.
- Every turn ends with **`source: llm | gemini/...`**.
- The summary at the end says how many turns were `produced by the model`.

If a turn shows `source: fallback`, the model could not answer that turn and the offline writer stepped in; the yellow **Guardrail** line under it says why.

### Run without a key
```powershell
py -3.13 -m llm_wording_engine.demo --provider offline
```
This uses the built-in rule-based writer (`source: offline`), useful for checking the setup.

### Run the tests (no key needed)
```powershell
py -3.13 -m pip install -r llm_wording_engine\requirements-dev.txt
py -3.13 -m pytest llm_wording_engine -q
```
Expected result: `30 passed`.

### Demo options
| Option | Values | Default |
|---|---|---|
| `--provider` | `gemini`, `claude`, `openai`, `ollama`, `auto`, `offline` | `auto` (first key found, else offline) |
| `--model` | any model name your key can use | automatic |
| `--scenario` | `vendor`, `job`, `budget`, `all` | `vendor` |
| `--turns` | max turns in the live exchange | `6` |
| `--part` | `1` (three personalities), `2` (live exchange), `both` | `both` |
| `--pause` | seconds between model calls | `4` for Gemini |

Other providers: put `ANTHROPIC_API_KEY=...` or `OPENAI_API_KEY=...` in `.env` and use `--provider claude` or `--provider openai`. For a local model, install Ollama, run `ollama pull llama3.2`, and use `--provider ollama`.

### Choosing a model
By default the engine uses Gemini's `gemini-flash-lite-latest` alias, which always points at a current fast model. Google retires numbered models over time, so if a run shows `source: fallback` with a "not found" or "no longer available" message, pick another name from your account's list and set it in `.env` as `GEMINI_MODEL=...` or pass `--model NAME`. To list the names your key can use:

```powershell
py -3.13 -c "from llm_wording_engine.llm_client import load_dotenv,_get; import os; load_dotenv(); d=_get('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key='+os.environ['GEMINI_API_KEY']); print('\n'.join(m['name'] for m in d['models'] if 'generateContent' in m.get('supportedGenerationMethods',[])))"
```

Heavy "thinking" models are slow on the free tier; prefer names with `lite` in them.

### Troubleshooting
| What you see | Fix |
|---|---|
| `No module named llm_wording_engine` | You are not in the `backend` folder. `cd` into it. |
| `No API key found: running the offline writer` | `.env` is missing, unsaved, or saved as `.env.txt`. It must be `backend\llm_wording_engine\.env`. |
| `no reply within 45s, retry` | The model is slow. Use a `lite` model (see above). |
| `HTTP 503 (server busy), retry` | Gemini is briefly busy; the engine retries automatically. |
| `HTTP 429 (rate limit)` | Free-tier limit reached. Wait a minute, or add `--pause 8`. |
| `HTTP 404 ... not found / no longer available` | The model name is retired. Pick another from the model list. |

Every run is saved to `llm_wording_engine/runs/` as JSON and Markdown (git-ignored).

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
    req = to_wording_request(agent, history, decision_hint=decision)   # map your models to the dict above
    return engine.reason_dict(req)["message"]
```

Each negotiable term maps to an `issue` with the agent's `ideal` value and its `limit` (worst acceptable value). Weights are normalised automatically.

## Design notes

- **The LLM writes, the guardrails keep numbers safe.** The model writes the reasoning, message and terms. `safety.py` checks every term against the agent's own limits and the issue range, and never lets the agent accept below its walk-away.
- **Private information stays private.** Limits, weights and the walk-away go in the system prompt with an instruction never to reveal them; only the public message goes to other agents.
- **Never stalls.** On a network error, rate limit or unparseable reply, the offline writer produces a valid turn, marked `source: fallback`.
- **No dependencies.** Standard library only, Python 3.9+.

Builds on the system architecture (HLD/LLD) and the Milestone 1.3 scenario templates by Annika Dubey, and is meant to plug into the team's Milestone 2 orchestrator and evaluation engine.