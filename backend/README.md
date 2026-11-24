# Multi-Agent Negotiation Arena — Backend

FastAPI backend for the Multi-Agent Negotiation Simulator. Provides REST API for running AI-driven multi-agent negotiations across vendor, job, and budget scenarios.

## Architecture

```
backend/
├── app/
│   ├── main.py                    # FastAPI app initialization
│   ├── api/                       # HTTP layer
│   │   ├── errors.py              # Standardized exception handlers
│   │   └── routes/
│   │       ├── health.py          # GET /health
│   │       └── negotiation.py     # POST /negotiate/run
│   ├── schemas/                   # API request/response contracts (Pydantic)
│   │   ├── common.py              # ErrorDetail, ErrorResponse
│   │   └── negotiation.py         # RunRequest, NegotiationResponse
│   ├── models/                    # Internal domain models (Pydantic)
│   │   ├── negotiation.py         # NegotiationConfig, Party, Issue, Constraints
│   │   ├── agent.py               # AgentProfile, Terms, Decision, Context
│   │   └── scenario.py            # TranscriptEntry, PartyInfo, Response
│   ├── services/                  # Business logic coordination
│   │   └── negotiation_service.py
│   └── engine/                    # Core negotiation logic
│       ├── orchestrator.py        # Run negotiation loops
│       ├── evaluation.py          # Utility, concessions, acceptance thresholds
│       ├── messages.py            # Natural language message generation
│       ├── scenarios.py           # Scenario/agent builders
│       └── llm_wording.py         # LLM wording engine adapter
├── llm_wording_engine/            # Standalone LLM wording module (preserved)
├── tests/                         # 23 backend tests
├── scripts/                       # Demo & debug scripts
└── demo_ui.html                   # Browser demo
```

## Quick Start

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/negotiate/run` | Run negotiation simulation |
| GET | `/demo` | Serves demo UI |

### Negotiation Request

```json
POST /negotiate/run
{
  "scenario": "vendor",           // "vendor" | "job" | "budget"
  "opener_personality": "aggressive",      // optional
  "responder_personality": "collaborative", // optional
  "max_rounds": 12,               // optional, 1-100
  "config": { ... }               // optional custom NegotiationConfig
}
```

### Negotiation Response

```json
{
  "scenario": "vendor",
  "personalities": { "Supplier": "aggressive", "Buyer": "collaborative" },
  "parties": [
    { "id": "vendor", "role": "Supplier", "personality": "aggressive", "skill": "skilled" }
  ],
  "outcome": "deal",              // "deal" | "breakdown" | "deadlock"
  "outcome_reason": "All parties accepted...",
  "rounds": 9,
  "final_terms": { "price": 1150000, "delivery_days": 23, ... },
  "satisfaction": { "Supplier": 0.93, "Buyer": 0.67, "Finance": 0.71 },
  "transcript": [
    { "round": 1, "speaker": "Supplier", "decision": "open", "message": "...", "offer": {...} }
  ]
}
```

## Scenarios

| Scenario | Issues | Default Personalities |
|----------|--------|----------------------|
| **vendor** | price, delivery, warranty, payment | aggressive vs collaborative |
| **job** | salary, bonus, start, remote | collaborative vs collaborative |
| **budget** | eng, mkt, ops, timeline | aggressive vs collaborative |

## Personalities

- **aggressive** — Demands more, concedes slowly
- **collaborative** — Seeks middle ground, accepts sooner
- **risk_averse** — Prioritizes safety, moderate concessions

## Running Tests

```bash
# All backend tests
python -m pytest tests/ -v

# LLM wording engine tests
cd llm_wording_engine && python -m pytest tests/ -v
```

## Demo Scripts

```bash
# Run personality comparison demo
python -m scripts.negotiate_demo

# Quick evaluation test
python -m scripts.test_brain
```

## Key Design Decisions

1. **Thin API layer** — Routes delegate to services, no business logic in endpoints
2. **Schema/Model separation** — `schemas/` = HTTP contracts, `models/` = internal domain
3. **Engine isolation** — Core logic in `engine/` has no FastAPI dependencies
4. **No circular imports** — Dependency direction: Routes → Services → Engine → Models
5. **Backward compatibility** — All existing API contracts preserved exactly

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | http://localhost:11434 | Ollama LLM endpoint |
| `GEMINI_API_KEY` | — | Google Gemini API key |

The LLM wording engine (`llm_wording_engine/`) is optional and used for generating natural-language messages. If no LLM is configured, it falls back to template-based messages.

## Extending

- **New scenario**: Add to `SCENARIO_ISSUES` in `models/negotiation.py`, add builder in `engine/scenarios.py`
- **New endpoint**: Add route module in `api/routes/`, register in `main.py`
- **New personality**: Add to `CONCESSION_RATE` and thresholds in `engine/evaluation.py`