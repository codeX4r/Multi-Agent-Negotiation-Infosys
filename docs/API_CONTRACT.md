# Negotiation Arena API Contract

**Version:** 1.0  
**Last Updated:** 2026-11-22  
**Backend:** FastAPI 0.109+ (Python)  
**Frontend:** Next.js 15 (TypeScript)  
**Base URL:** `http://localhost:8000` (configurable via `NEXT_PUBLIC_API_URL`)

---

## Table of Contents

1. [API Overview](#1-api-overview)
2. [Endpoints](#2-endpoints)
3. [Request Contract](#3-request-contract)
4. [Response Contract](#4-response-contract)
5. [Standardized Identifiers](#5-standardized-identifiers)
6. [Error Contract](#6-error-contract)
7. [Frontend–Backend Integration](#7-frontend--backend-integration)
8. [Contract Limitations](#8-contract-limitations)

---

## 1. API Overview

### 1.1 Technology Stack

| Layer | Technology |
|-------|------------|
| API Framework | FastAPI (Starlette) |
| Validation | Pydantic v2 |
| Serialization | JSON |
| CORS | Enabled for all origins (`*`) |
| Documentation | Swagger UI at `/docs`, ReDoc at `/redoc` |

### 1.2 Base URL Configuration

- **Development:** `http://localhost:8000`
- **Frontend Configuration:** `NEXT_PUBLIC_API_URL` environment variable
- **Default Frontend Fallback:** `http://localhost:8000`

### 1.3 Authentication & Authorization

> **Not implemented.** The current API has no authentication, authorization, or rate limiting. All endpoints are public.

---

## 2. Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Redirects to `/docs` (Swagger UI) |
| `GET` | `/demo` | Serves legacy HTML demo file |
| `GET` | `/health` | Health check endpoint |
| `POST` | `/negotiate/run` | Execute a negotiation simulation |

---

## 3. Request Contract

### 3.1 POST `/negotiate/run`

Execute a multi-agent negotiation simulation.

#### 3.1.1 Request Schema

```json
{
  "scenario": "vendor",
  "opener_personality": "aggressive",
  "responder_personality": "collaborative",
  "max_rounds": 12,
  "config": {
    "parties": [...],
    "issues": [...],
    "opener_id": "vendor",
    "rounds_limit": 12,
    "deadlock_after_stalled_rounds": 3,
    "constraint": null
  }
}
```

#### 3.1.2 Field Definitions

##### Root Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `scenario` | `"vendor" \| "job" \| "budget"` | No | `"vendor"` | Scenario identifier |
| `opener_personality` | `"aggressive" \| "collaborative" \| "risk_averse"` | No | Scenario default | Opener's personality |
| `responder_personality` | `"aggressive" \| "collaborative" \| "risk_averse"` | No | Scenario default | Responder's personality |
| `max_rounds` | `integer` | No | `12` | Maximum negotiation rounds (1–100) |
| `config` | `NegotiationConfig` | No | `null` | Full multi-party configuration |

##### Config Object (`NegotiationConfig`)

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `parties` | `PartyConfig[]` | **Yes** (2–5) | — | Negotiation parties |
| `issues` | `IssueConfig[]` | **Yes** | — | Issue definitions |
| `opener_id` | `string` | **Yes** | — | Must match a party `id` |
| `rounds_limit` | `integer` | **Yes** | — | Max rounds (1–100) |
| `deadlock_after_stalled_rounds` | `integer` | **Yes** | — | Stalled rounds before deadlock (1–100) |
| `constraint` | `ConstraintConfig \| null` | No | `null` | Sum constraint (Budget only) |

##### PartyConfig

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | **Yes** | — | Unique machine ID (alphanumeric + `_` `-`) |
| `role` | `string` | **Yes** | — | Human-readable role name |
| `personality` | `"aggressive" \| "collaborative" \| "risk_averse"` | **Yes** | — | Personality identifier |
| `skill` | `"novice" \| "skilled" \| "expert"` | No | `"skilled"` | Skill level |
| `target` | `Record<string, number>` | **Yes** | — | Ideal values for all issues |
| `walk_away` | `Record<string, number>` | **Yes** | — | Reservation values for all issues |
| `weights` | `Record<string, number>` | No | `{}` | Relative importance per issue |

##### IssueConfig

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `id` | `string` | **Yes** | — | Canonical issue identifier |
| `min` | `number` | **Yes** | — | Minimum value |
| `max` | `number` | **Yes** | — | Maximum value |
| `step` | `number` | **Yes** | — | Quantization step ( > 0 ) |
| `derived` | `boolean` | No | `false` | True for computed issues (Budget `ops`) |

##### ConstraintConfig

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | `"sum"` | **Yes** | — | Constraint type |
| `total` | `number` | **Yes** | — | Sum total (Budget: 50) |
| `derived` | `string` | **Yes** | — | Derived issue ID (Budget: `ops`) |
| `of` | `string[]` | **Yes** | — | Source issue IDs (Budget: `["eng", "mkt"]`) |

#### 3.1.3 Validation Rules

| Rule | Error Category | HTTP Status |
|------|----------------|-------------|
| `scenario` must be `vendor`, `job`, or `budget` | `validation_error` | 422 |
| `personality` must be `aggressive`, `collaborative`, or `risk_averse` | `validation_error` | 422 |
| `max_rounds` must be 1–100 | `validation_error` | 422 |
| `parties` count must be 2–5 | `validation_error` | 422 |
| Party `id`s must be unique | `validation_error` | 422 |
| `opener_id` must match a party `id` | `validation_error` | 422 |
| Issue `id`s must be unique | `validation_error` | 422 |
| Issues must match scenario's canonical set | `validation_error` | 422 |
| Party `target`/`walk_away` keys must match all issues | `validation_error` | 422 |
| Values must be within issue `min`/`max` | `validation_error` | 422 |
| Values must align with issue `step` | `validation_error` | 422 |
| Budget requires `constraint` with `total=50`, `derived=ops`, `of=["eng","mkt"]` | `validation_error` | 422 |
| Non-Budget scenarios must not have `constraint` | `validation_error` | 422 |
| Config issues must match `scenario` | `validation_error` | 422 |

#### 3.1.4 Scenario-Specific Requirements

| Scenario | Required Issues | Constraint | Default Opener | Default Personalities |
|----------|-----------------|------------|----------------|----------------------|
| `vendor` | `price`, `delivery`, `warranty`, `payment` | None | `vendor` | `aggressive`, `collaborative` |
| `job` | `salary`, `bonus`, `start`, `remote` | None | `recruiter` | `collaborative`, `collaborative` |
| `budget` | `eng`, `mkt`, `ops`, `timeline` | **Required**: sum=50, derived=ops, of=[eng,mkt] | `eng` | `aggressive`, `collaborative` |

**Canonical Issue IDs (used in `target`, `walk_away`, `weights`):**
- Vendor: `price`, `delivery`, `warranty`, `payment`
- Job: `salary`, `bonus`, `start`, `remote`
- Budget: `eng`, `mkt`, `ops`, `timeline`

#### 3.1.5 Complete Request Examples

**Minimal Request (uses scenario defaults):**
```json
{
  "scenario": "vendor",
  "max_rounds": 12
}
```

**Full Multi-Party Config (Vendor):**
```json
{
  "scenario": "vendor",
  "mode": "simulation",
  "config": {
    "parties": [
      {
        "id": "vendor",
        "role": "Supplier",
        "personality": "aggressive",
        "skill": "skilled",
        "target": { "price": 1250000, "delivery": 40, "warranty": 6, "payment": 0 },
        "walk_away": { "price": 980000, "delivery": 12, "warranty": 30, "payment": 60 },
        "weights": { "price": 0.5, "delivery": 0.15, "warranty": 0.2, "payment": 0.15 }
      },
      {
        "id": "buyer",
        "role": "Buyer",
        "personality": "collaborative",
        "skill": "skilled",
        "target": { "price": 950000, "delivery": 15, "warranty": 24, "payment": 60 },
        "walk_away": { "price": 1180000, "delivery": 40, "warranty": 6, "payment": 0 },
        "weights": { "price": 0.45, "delivery": 0.25, "warranty": 0.2, "payment": 0.1 }
      },
      {
        "id": "finance",
        "role": "Finance",
        "personality": "risk_averse",
        "skill": "expert",
        "target": { "price": 950000, "delivery": 20, "warranty": 24, "payment": 60 },
        "walk_away": { "price": 1150000, "delivery": 45, "warranty": 6, "payment": 15 },
        "weights": { "price": 0.5, "delivery": 0, "warranty": 0.2, "payment": 0.3 }
      }
    ],
    "issues": [
      { "id": "price", "min": 900000, "max": 1300000, "step": 10000 },
      { "id": "delivery", "min": 10, "max": 45, "step": 1 },
      { "id": "warranty", "min": 6, "max": 36, "step": 6 },
      { "id": "payment", "min": 0, "max": 60, "step": 15 }
    ],
    "opener_id": "vendor",
    "max_rounds": 12,
    "deadlock_after_stalled_rounds": 3,
    "constraint": null
  }
}
```

**Full Multi-Party Config (Job):**
```json
{
  "scenario": "job",
  "config": {
    "parties": [
      {
        "id": "candidate",
        "role": "Candidate",
        "personality": "collaborative",
        "skill": "skilled",
        "target": { "salary": 22, "bonus": 3, "start": 8, "remote": 4 },
        "walk_away": { "salary": 15, "bonus": 0, "start": 3, "remote": 1 },
        "weights": { "salary": 0.45, "bonus": 0.15, "start": 0.15, "remote": 0.25 }
      },
      {
        "id": "recruiter",
        "role": "Recruiter",
        "personality": "collaborative",
        "skill": "skilled",
        "target": { "salary": 14, "bonus": 0, "start": 3, "remote": 2 },
        "walk_away": { "salary": 21, "bonus": 2.5, "start": 10, "remote": 4 },
        "weights": { "salary": 0.4, "bonus": 0.2, "start": 0.25, "remote": 0.15 }
      },
      {
        "id": "manager",
        "role": "Hiring Mgr",
        "personality": "risk_averse",
        "skill": "skilled",
        "target": { "salary": 15, "bonus": 0, "start": 2, "remote": 1 },
        "walk_away": { "salary": 22, "bonus": 3, "start": 8, "remote": 4 },
        "weights": { "salary": 0.2, "bonus": 0, "start": 0.5, "remote": 0.3 }
      }
    ],
    "issues": [
      { "id": "salary", "min": 12, "max": 24, "step": 0.5 },
      { "id": "bonus", "min": 0, "max": 3, "step": 0.25 },
      { "id": "start", "min": 2, "max": 12, "step": 1 },
      { "id": "remote", "min": 0, "max": 5, "step": 1 }
    ],
    "opener_id": "recruiter",
    "max_rounds": 12,
    "deadlock_after_stalled_rounds": 3,
    "constraint": null
  }
}
```

**Full Multi-Party Config (Budget):**
```json
{
  "scenario": "budget",
  "config": {
    "parties": [
      {
        "id": "eng",
        "role": "Eng Head",
        "personality": "aggressive",
        "skill": "skilled",
        "target": { "eng": 28, "mkt": 14, "ops": 8, "timeline": 9 },
        "walk_away": { "eng": 14, "mkt": 30, "ops": 6, "timeline": 4 },
        "weights": { "eng": 0.65, "mkt": 0, "ops": 0, "timeline": 0.35 }
      },
      {
        "id": "mkt",
        "role": "Mkt Head",
        "personality": "collaborative",
        "skill": "skilled",
        "target": { "eng": 10, "mkt": 22, "ops": 18, "timeline": 4 },
        "walk_away": { "eng": 30, "mkt": 10, "ops": 10, "timeline": 9 },
        "weights": { "eng": 0, "mkt": 0.7, "ops": 0, "timeline": 0.3 }
      },
      {
        "id": "ops",
        "role": "Ops Head",
        "personality": "risk_averse",
        "skill": "skilled",
        "target": { "eng": 10, "mkt": 22, "ops": 18, "timeline": 7 },
        "walk_away": { "eng": 30, "mkt": 12, "ops": 8, "timeline": 3 },
        "weights": { "eng": 0, "mkt": 0, "ops": 0.6, "timeline": 0.4 }
      }
    ],
    "issues": [
      { "id": "eng", "min": 8, "max": 34, "step": 1 },
      { "id": "mkt", "min": 6, "max": 30, "step": 1 },
      { "id": "ops", "min": 5, "max": 28, "step": 1, "derived": true },
      { "id": "timeline", "min": 3, "max": 9, "step": 1 }
    ],
    "opener_id": "eng",
    "max_rounds": 12,
    "deadlock_after_stalled_rounds": 3,
    "constraint": { "type": "sum", "total": 50, "derived": "ops", "of": ["eng", "mkt"] }
  }
}
```

---

## 4. Response Contract

### 4.1 Successful Response (200)

```json
{
  "scenario": "vendor",
  "personalities": {
    "Supplier": "aggressive",
    "Buyer": "collaborative",
    "Finance": "risk_averse"
  },
  "parties": [
    { "id": "vendor", "role": "Supplier", "personality": "aggressive", "skill": "skilled" },
    { "id": "buyer", "role": "Buyer", "personality": "collaborative", "skill": "skilled" },
    { "id": "finance", "role": "Finance", "personality": "risk_averse", "skill": "expert" }
  ],
  "outcome": "deal",
  "outcome_reason": "All parties accepted the offer at round 8.",
  "rounds": 8,
  "final_terms": {
    "price": 1100000,
    "delivery": 25,
    "warranty": 12,
    "payment": 30
  },
  "satisfaction": {
    "Supplier": 0.72,
    "Buyer": 0.68,
    "Finance": 0.65
  },
  "transcript": [
    {
      "round": 0,
      "speaker": "Supplier",
      "speaker_id": "vendor",
      "decision": "open",
      "utility": 0.95,
      "message": "Our position is clear: we need price at ₹12,50,000 and delivery at 40 days.",
      "offer": { "price": 1250000, "delivery": 40, "warranty": 6, "payment": 0 },
      "reasoning": "Opening with my ideal terms."
    },
    {
      "round": 1,
      "speaker": "Buyer",
      "speaker_id": "buyer",
      "decision": "counter",
      "utility": 0.32,
      "message": "Could we meet nearer my position on price? I can trade on other terms, but need price to move to ₹9,80,000.",
      "offer": { "price": 980000, "delivery": 15, "warranty": 24, "payment": 60 },
      "reasoning": "Offer below this party's target. Conceded on delivery (lower priority); pushed on price."
    }
    // ... more entries
  ]
}
```

### 4.2 Response Field Definitions

| Field | Type | Description |
|-------|------|-------------|
| `scenario` | `"vendor" \| "job" \| "budget"` | Scenario identifier |
| `personalities` | `Record<string, string>` | Role → personality mapping |
| `parties` | `PartyInfo[]` | All parties with id, role, personality, skill |
| `outcome` | `"deal" \| "breakdown" \| "deadlock"` | Negotiation result |
| `outcome_reason` | `string` | Human-readable explanation |
| `rounds` | `integer` | Final round number reached |
| `final_terms` | `Record<string, number> \| null` | Agreed terms (canonical issue IDs) |
| `satisfaction` | `Record<string, number>` | Role → utility score [0,1] |
| `transcript` | `TranscriptEntry[]` | Chronological log of all actions |

#### PartyInfo

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Machine ID |
| `role` | `string` | Human-readable role |
| `personality` | `string` | Personality identifier |
| `skill` | `string` | Skill level |

#### TranscriptEntry

| Field | Type | Description |
|-------|------|-------------|
| `round` | `integer` | Round number (0 = opening) |
| `speaker` | `string` | Human-readable role name |
| `speaker_id` | `string` | Party machine ID |
| `decision` | `"open" \| "counter" \| "accept" \| "reject"` | Decision type |
| `utility` | `number` | Acting party's utility [0,1] |
| `message` | `string` | User-facing message |
| `offer` | `Record<string, number> \| null` | Offer terms (canonical IDs) |
| `reasoning` | `string` | Concise decision explanation |

### 4.3 Outcome Values

| Backend Value | Meaning | Frontend Mapping |
|---------------|---------|------------------|
| `"deal"` | All parties accepted | `agreement` |
| `"breakdown"` | A party rejected (walk-away) | `no_agreement` |
| `"deadlock"` | Stalled rounds limit reached | `deadlock` |

### 4.4 Response Examples by Outcome

#### Agreement (Deal)
```json
{
  "scenario": "vendor",
  "outcome": "deal",
  "outcome_reason": "All parties accepted the offer at round 8.",
  "rounds": 8,
  "final_terms": { "price": 1100000, "delivery": 25, "warranty": 12, "payment": 30 },
  "satisfaction": { "Supplier": 0.72, "Buyer": 0.68, "Finance": 0.65 }
}
```

#### No Agreement (Breakdown)
```json
{
  "scenario": "job",
  "outcome": "breakdown",
  "outcome_reason": "Candidate rejected at round 6: salary terms were beyond their walk-away limit.",
  "rounds": 6,
  "final_terms": null,
  "satisfaction": { "Candidate": 0.28, "Recruiter": 0.63, "Hiring Mgr": 0.55 }
}
```

#### Deadlock
```json
{
  "scenario": "budget",
  "outcome": "deadlock",
  "outcome_reason": "No new offer appeared for 3 consecutive rounds; the configured deadlock limit was reached.",
  "rounds": 10,
  "final_terms": null,
  "satisfaction": { "Eng Head": 0.60, "Mkt Head": 0.50, "Ops Head": 0.46 }
}
```

---

## 5. Standardized Identifiers

### 5.1 Scenario IDs

| Canonical ID | Display Name | Description |
|--------------|--------------|-------------|
| `vendor` | Vendor Pricing | Commercial terms between buyer, vendor, finance |
| `job` | Job Offer | Compensation, joining date, work flexibility |
| `budget` | Project Budget | Allocate constrained budget across departments |

> **Must use canonical IDs** in all API requests and responses. Frontend display names (`vendor_pricing`, `job_offer`, `project_budget`) are UI-only.

### 5.2 Personality IDs

| Canonical ID | Display Label | Description |
|--------------|---------------|-------------|
| `aggressive` | Aggressive | Opens high, concedes slowly, jumps late |
| `collaborative` | Collaborative | Moderate opening, steady concessions, seeks trades |
| `risk_averse` | Risk-averse | Concedes early to secure deal, then holds |

> **Must use `risk_averse` (underscore)** in all API requests, backend models, and frontend engine types. The hyphenated form `risk-averse` is legacy and no longer used.

### 5.3 Skill Levels

| ID | Label |
|----|-------|
| `novice` | Novice |
| `skilled` | Skilled |
| `expert` | Expert |

### 5.4 Decision Types

| Value | Description |
|-------|-------------|
| `open` | First offer in negotiation |
| `counter` | Counter-offer |
| `accept` | Accept current offer |
| `reject` | Reject current offer (walk-away) |

---

## 6. Error Contract

### 6.1 Standardized Error Response Format

```json
{
  "error": "validation_error",
  "message": "Request validation failed",
  "details": [
    {
      "code": "literal_error",
      "field": "body -> scenario",
      "message": "Input should be 'vendor', 'job' or 'budget'"
    }
  ]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `error` | `string` | **Yes** | Machine-readable error category |
| `message` | `string` | **Yes** | Human-readable summary |
| `details` | `ErrorDetail[]` | No | Per-field validation details |

#### ErrorDetail

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | `string` | **Yes** | Pydantic error type (e.g., `literal_error`, `value_error`, `greater_than_equal`) |
| `field` | `string` | No | Field path (e.g., `body -> config -> parties -> 0 -> personality`) |
| `message` | `string` | **Yes** | Human-readable description |

### 6.2 HTTP Status Codes

| Status | Category | Error Value | Usage |
|--------|----------|-------------|-------|
| **422** | `validation_error` | Request validation failure | Invalid JSON, invalid enum values, range violations, model validator failures |
| **400** | `invalid_request` | Application-level error | Orchestrator `ValueError` (config mismatch, invalid opener) |
| **404** | `http_error` | Not found | Non-existent endpoint |
| **500** | `internal_server_error` | Unexpected error | Unhandled exceptions (no stack trace exposed) |

### 6.3 Error Examples

#### 422 — Validation Error
```json
{
  "error": "validation_error",
  "message": "Request validation failed",
  "details": [
    { "code": "literal_error", "field": "body -> scenario", "message": "Input should be 'vendor', 'job' or 'budget'" },
    { "code": "greater_than_equal", "field": "body -> max_rounds", "message": "Input should be greater than or equal to 1" }
  ]
}
```

#### 400 — Application Error
```json
{
  "error": "invalid_request",
  "message": "config issues do not match the vendor scenario"
}
```

#### 404 — Not Found
```json
{
  "error": "http_error",
  "message": "Not Found"
}
```

#### 500 — Internal Server Error
```json
{
  "error": "internal_server_error",
  "message": "An unexpected error occurred"
}
```

### 6.4 Frontend Error Handling

The frontend parses errors via `BackendApiError`:

```typescript
interface BackendErrorDetail {
  code: string;
  field?: string;
  message: string;
}

interface BackendErrorResponse {
  error: string;
  message: string;
  details?: BackendErrorDetail[];
}

class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorResponse: BackendErrorResponse,
  ) { ... }
}
```

**Legacy Fallback:** If the backend returns the old `{"detail": "string"}` format, the adapter wraps it as:
```json
{ "error": "http_error", "message": "FastAPI request failed (422)." }
```

---

## 7. Frontend–Backend Integration

### 7.1 Request Construction

**File:** `frontend/src/lib/backendAdapter.ts` → `buildBackendScenarioConfig()`

1. Frontend engine config (`EngineConfig`) contains scenario, agents, issues, constraints
2. `buildBackendScenarioConfig()` maps to backend `BackendScenarioConfig`:
   - Agent `prefs.ideal` → `target`
   - Agent `prefs.reserve` → `walk_away`
   - Agent `w` (normalized weights) → `weights`
   - Engine issues → backend issues (with `derived` flag)
   - Engine constraint → backend constraint
3. Personality passed through unchanged (`risk_averse` standardized)

### 7.2 Request Sending

**File:** `frontend/src/features/arena/backend-simulation-api.ts` → `runBackendNegotiation()`

```typescript
const request: BackendNegotiationRequest = {
  scenario: "vendor",
  opener_personality: "aggressive",
  responder_personality: "collaborative",
  max_rounds: 12,
  config: backendConfig  // optional
};

await apiRequest("/negotiate/run", {
  method: "POST",
  body: request
});
```

### 7.3 Response Parsing

**File:** `frontend/src/features/arena/backend-simulation-api.ts` → `isBackendNegotiationResult()`

Validates:
- `scenario` matches request
- `outcome` in `["deal", "breakdown", "deadlock"]`
- `final_terms` structure matches scenario
- `transcript` entries have required fields

Normalizes party names via `mapPartyName()` (e.g., `"Supplier"` → `"Vendor"`).

### 7.4 Error Handling Flow

```typescript
try {
  const result = await runBackendNegotiation(request);
  // Success: process result
} catch (err) {
  if (err instanceof BackendApiError) {
    // Standardized error: err.status, err.errorResponse
    handleApiError(err.errorResponse);
  } else if (err instanceof BackendUnavailableError) {
    // Network failure
    startFallbackSimulation();
  } else {
    // Unexpected
    throw err;
  }
}
```

### 7.5 Personality Identifier Passing

| Layer | Identifier |
|-------|------------|
| Frontend UI (`types/negotiation.ts`) | `risk_averse` |
| Frontend Engine (`engine/types.ts`) | `risk_averse` |
| Backend Adapter (`toBackendPersonality`) | Identity (no conversion) |
| Backend API (`RunRequest`) | `risk_averse` |
| Backend Models (`NegotiationParty`, `AgentProfile`) | `risk_averse` |

---

## 8. Contract Limitations

### 8.1 Unimplemented Endpoints

| Endpoint | Status |
|----------|--------|
| `GET /negotiate/history` | Not implemented |
| `GET /negotiate/:id` | Not implemented |
| `POST /negotiate/stream` | Not implemented |
| WebSocket support | Not implemented |

### 8.2 Missing Features (Frontend Handoff vs Backend)

| Feature | Frontend Document | Backend Support |
|---------|-------------------|-----------------|
| Climate configuration (`stable`/`volatile`/`crisis`) | `SessionConfiguration.climate` | Not in API request |
| Orchestrator roles (`timekeeper`, `mediator`, etc.) | `SessionConfiguration.orchestratorRole` | Not in API request |
| Orchestrator autonomy levels | `SessionConfiguration.orchestratorAutonomy` | Not in API request |
| Practice mode (human participation) | `NegotiationMode = "practice"` | Not in API request |
| Custom scenarios | `ScenarioId = "custom"` | Not in API request |
| Event injection system | Frontend engine events | Not in backend |
| Emotion/trust tracking | `AgentReport`, `TrustMatrix` | Not in response |

### 8.3 Authentication & Authorization

| Feature | Status |
|---------|--------|
| User authentication | Not implemented |
| Role-based access control | Not implemented |
| Rate limiting | Not implemented |
| Request signing | Not implemented |

### 8.4 Known Contract Gaps

| Gap | Impact | Mitigation |
|-----|--------|------------|
| Frontend sends `mode` (`simulation`/`practice`) | Ignored by backend | Backend defaults to simulation |
| Frontend sends `climate` | Ignored by backend | Backend uses scenario defaults |
| Frontend sends `orchestrator` config | Ignored by backend | Backend uses scenario defaults |
| Budget `ops` issue marked `derived: true` | Backend expects it | Correctly handled |
| `final_terms` uses canonical IDs (`delivery`) vs `Terms` fields (`delivery_days`) | Frontend handles mapping | `mapBackendTerms` in adapter |

### 8.5 Response Fields Not Documented in Task 3

The actual backend response includes fields not in the Task 3 proposed schema:
- `personalities` (role → personality map)
- `parties` (full party info with skill)
- `satisfaction` keyed by role (not party_id)

These are documented in Section 4.2 above.

---

## Appendix: Quick Reference

### Canonical IDs Summary

| Category | Values |
|----------|--------|
| Scenarios | `vendor`, `job`, `budget` |
| Personalities | `aggressive`, `collaborative`, `risk_averse` |
| Skills | `novice`, `skilled`, `expert` |
| Decisions | `open`, `counter`, `accept`, `reject` |
| Outcomes | `deal`, `breakdown`, `deadlock` |

### Issue IDs by Scenario

| Vendor | Job | Budget |
|--------|-----|--------|
| `price` | `salary` | `eng` |
| `delivery` | `bonus` | `mkt` |
| `warranty` | `start` | `ops` |
| `payment` | `remote` | `timeline` |

### HTTP Status Quick Reference

| Status | Error Category | When |
|--------|----------------|------|
| 200 | — | Success |
| 400 | `invalid_request` | Orchestrator ValueError |
| 422 | `validation_error` | Pydantic validation failure |
| 404 | `http_error` | Unknown endpoint |
| 500 | `internal_server_error` | Unhandled exception |

---

*This document reflects the actual implemented system as of 2026-11-22. For historical task audit, see `docs/MILESTONE_2_TASK_1_MODEL_AUDIT.md`.*