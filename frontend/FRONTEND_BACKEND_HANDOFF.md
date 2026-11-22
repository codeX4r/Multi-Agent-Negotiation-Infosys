# Frontend-Backend Handoff Document

**Project:** Negotiation Arena — Multi-Agent Negotiation Training & Simulation Platform
**Frontend Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Zustand 5 · Vitest
**Engine Location:** `src/engine/` — pure TypeScript, zero React/browser dependencies
**Environment Config:** `NEXT_PUBLIC_API_BASE_URL` (defaults to `http://localhost:8000/api/v1`)

---

## 1. Frontend Overview & Architecture

### 1.1 Technology Stack
| Layer | Technology |
|-------|------------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS 4 (custom design tokens in `globals.css`) |
| State | Zustand 5 (3 stores: `ui-store`, `session-store`, `config-store`) |
| Forms | React Hook Form 7 + Zod 3 |
| Testing | Vitest 5 (unit) + Playwright 1.65 (e2e) |
| Engine | Local simulation (`src/engine/`) — runs in browser |

### 1.2 Folder Layout
```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout + providers
│   ├── page.tsx           # Main entry (renders active screen)
│   └── globals.css        # Design tokens + all component styles
├── components/
│   ├── ui/                # Reusable primitives (Button, Card, Input, Modal, etc.)
│   └── providers.tsx      # React context providers
├── engine/                # NEGOTIATION ENGINE (pure TS, backend-portable)
│   ├── types.ts           # All domain interfaces (see §3)
│   ├── orchestrator.ts    # Turn loop, deadlock, events, mediator
│   ├── simulation.ts      # High-level API (Simulation class, buildEngineConfig)
│   ├── scenarios.ts       # Scenario templates (vendor, job, budget, custom)
│   ├── agent.ts           # Agent reasoning, phrasing, concession curves
│   ├── utility.ts         # Utility calculations (U = Σ w_i · v_i)
│   ├── tone-classifier.ts # Naive Bayes tone classifier (trained in-browser)
│   └── index.ts           # Public exports
├── features/              # Screen components (one per route)
│   ├── arena/             # ArenaScreen.tsx (main simulation view)
│   ├── home/              # HomeScreen.tsx
│   ├── mode/              # ModeScreen.tsx
│   ├── scenario/          # ScenarioScreen.tsx
│   ├── setup/             # SetupScreen.tsx
│   ├── briefing/          # BriefingScreen.tsx
│   ├── outcome/           # OutcomeScreen.tsx
│   └── replay/            # ReplayScreen.tsx
├── hooks/
│   └── useSimulation.ts   # Bridge: engine ↔ Zustand stores
├── stores/
│   ├── ui-store.ts        # Navigation, modals, ambient, arena controls
│   ├── session-store.ts   # Live simulation state, transcript, metrics
│   └── config-store.ts    # Draft config (persisted to localStorage)
├── lib/
│   └── api-client.ts      # Generic fetch wrapper + ApiError
└── types/
    └── negotiation.ts     # Simplified public API types (subset of engine/types)
```

### 1.3 Engine vs. Backend Boundary
| Responsibility | Current (Frontend) | Backend Target |
|----------------|-------------------|----------------|
| Scenario/role definitions | `src/engine/scenarios.ts` | DB-seeded or config API |
| Agent reasoning (private mind) | `src/engine/agent.ts` | Stateless worker / LLM call |
| Turn orchestration | `src/engine/orchestrator.ts` | Session service |
| Tone classification | `src/engine/tone-classifier.ts` | ML service or LLM |
| Utility / scoring | `src/engine/utility.ts` | Shared library |
| Replay snapshots | In-memory (`engine.snapshots`) | DB + API |
| Persistence | localStorage (`na.sessions`) | DB |

> **Rule:** Engine is pure TS. UI components **never** import engine internals directly — they read from Zustand stores populated by `useSimulation.ts`.

### 1.4 Environment Variables
```bash
# .env.local (create from .env.example)
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

---

## 2. Screens & User Flows

### 2.1 Screen Map (8 Screens)

| Screen | Route | Purpose | Key Actions |
|--------|-------|---------|-------------|
| **Home** | `/` (default) | Landing, quick demo, saved sessions | `Start new negotiation` → Mode, `Quick demo` → Arena (simulation), `Saved sessions` → Modal |
| **Mode** | `/mode` | Choose simulation vs practice | Click card → sets `draft.mode`, auto-navigates to Scenario |
| **Scenario** | `/scenario` | Pick template (vendor, job, budget, custom) | Filter by difficulty, click card → sets `draft.scenarioId`, auto-navigates to Setup |
| **Setup** | `/setup` | Configure seats, roles, climate, orchestrator | Drag/drop roles, tune personality/skill, set climate/rounds/autonomy, `Next: Briefing` |
| **Briefing** | `/briefing` | Show private briefing (practice) or observer summary | `Enter Arena` → validates config, navigates to Arena |
| **Arena** | `/arena` | **Core simulation view** (see §2.2) | See below |
| **Outcome** | `/outcome` | Deal/breakdown report, KPIs, gauges, turning points | `Open Replay Lab`, `Export`, `New session` |
| **Replay** | `/replay` | Scrub timeline, fork, perspective swap, empathy summary | `Play/Prev/Next`, `View as` segmented, `Fork here`, `Export` |

### 2.2 Arena Screen — Detailed Flow

**Modes:**
- **Simulation (`draft.mode === 'simulation'`)**: AI vs AI. UI shows playback controls (`Play/Pause`, `Next turn`, `Speed 0.5×/1×/2×/4×`), `Mind Reveal` toggle, `Finish` button. No composer.
- **Practice (`draft.mode === 'practice'`)**: Human vs AI. UI shows `INNER VOICE` + `Hint` strip, composer (text input + tone preview + `Make offer`/`Counter`/`Concede`/`Accept`/`Walk away`), no playback controls.

**Arena Layout (CSS Grid):**
```
.arenatop (header: scenario, round, climate, mode pills | Mind Reveal, Pause, Settings, Help, Finish)
.arena (3-col grid: 300px | 1fr | 300px)
  ├─ #leftside  (Transcript — sticky, dark scrollbar)
  ├─ #center    (.stage: .tablewrap 560px oval + seats, .innervoice, .simctl/.composer)
  └─ #rightside (Metrics — sticky, dark scrollbar, overflow-x: hidden)
```

**Key UI States:**
- `engineState.status === 'running'` → Live pill, seats animate
- `engineState.status === 'deal'` → Deal pill, confetti, auto-navigate to Outcome after 2.2s
- `engineState.status === 'breakdown'` → No deal pill, auto-navigate to Outcome
- `engineState.waitingHuman === true` (practice) → Human seat gets `.waiting` ring, composer focused
- `mindReveal === true` (simulation only) → Agent thought bubbles visible (`.thought`)

---

## 3. State & Data Contracts

### 3.1 Engine Types (Source of Truth: `src/engine/types.ts`)

#### Core Enums
```ts
type PersonalityType = 'aggressive' | 'collaborative' | 'risk-averse';
type SkillLevel = 'novice' | 'skilled' | 'expert';
type ClimateType = 'stable' | 'volatile' | 'crisis';
type OrchestratorRole = 'timekeeper' | 'mediator' | 'enforcer' | 'injector' | 'auditor';
type AutonomyLevel = 0 | 1 | 2 | 3;
type IssueKind = 'inr' | 'days' | 'net' | 'months' | 'lpa' | 'lakh' | 'weeks' | 'dpw' | 'share' | 'num';
type NegotiationMode = 'simulation' | 'practice';
type SessionStatus = 'running' | 'deal' | 'breakdown';
```

#### Scenario & Roles
```ts
interface Issue {
  id: string; label: string; kind: IssueKind;
  min: number; max: number; step: number;
  unit?: string; aliases?: string[]; derived?: boolean;
}

interface Role {
  id: string; name: string; title: string; persona: string; goal: string;
  constraints: string[]; batnaText: string; batnaU: number; hidden: string;
  personality: PersonalityType; skill: SkillLevel;
  prefs: Record<string, { ideal: number; reserve: number; w: number }>;
  mindReveal?: boolean; revealBatna?: boolean;
}

interface Scenario {
  id: string; name: string; icon: string; diff: string; backdrop: string;
  opener: string | null; blurb: string; issues: Issue[]; roles: Role[]; events: Event[];
  constraint?: { type: 'sum'; total: number; derived: string; of: string[] };
  custom?: boolean; climate: ClimateType;
}
```

#### Simulation State (The Single Source for Arena)
```ts
interface Agent {
  id: string; name: string; title: string; persona: string; goal: string;
  constraints: string[]; batnaText: string; batnaU: number; hidden: string;
  personality: PersonalityType; skill: SkillLevel;
  prefs: RolePreferences; w: Record<string, number>; // normalized
  color: string; seat: number; human: boolean;
  mindReveal: boolean; revealBatna: boolean;
}

interface EmotionState { v: number; a: number; hist: number[]; ahist: number[]; }

interface Offer {
  by: string; x: Record<string, number>; round: number; turn: number;
}

interface TranscriptEntry {
  turn: number; round: number; by: string; name: string;
  kind: 'offer' | 'accept' | 'message' | 'system' | 'event' | 'deal' | 'breakdown' | 'mediator' | 'walk' | 'round';
  decision?: 'open' | 'counter' | 'accept' | 'reject' | 'message' | 'walk';
  text: string; tone?: ToneLabel; toneP?: Record<ToneLabel, number>;
  x?: Record<string, number>; rationale?: string; thought?: AgentThought;
  uSelf?: number; trustDelta?: number; human?: boolean;
}

interface AgentThought {
  u: number; T: number; batna: number; hidden: string; feel: string;
  trustIn: number | null; lastSpk: string | null; plan: string;
}

interface SimulationState {
  round: number; maxRounds: number; turnIdx: number; turnCount: number;
  order: number[]; agents: Agent[]; offers: Offer[]; table: Offer | null;
  accepts: string[]; trust: TrustMatrix; emo: Record<string, EmotionState>;
  climate: ClimateType; pressure: number; pressureBump: number;
  events: EventRecord[]; usedEvents: string[];
  deadlock: DeadlockState;
  transcript: TranscriptEntry[]; uHist: UtilityHistory[];
  status: SessionStatus; roundStarted: boolean; waitingHuman: boolean;
  blocked: boolean; endReason: string;
  lastTone: Record<string, ToneLabel>; forkedFrom: number | null; scenario: string;
}
```

#### Report Types (Outcome/Replay)
```ts
interface AgentReport {
  id: string; name: string; human: boolean; color: string; personality: PersonalityType;
  finalU: number; sat: number; batna: number; firstU: number | null; lastU: number | null;
  moved: number; offers: number; firstGiveTurn: number | null; aboveBatna: boolean; trustIn: number;
}

interface TurningPoint { turn: number; round: number; d: number; who: string; text: string; event?: boolean; }

interface Habit { good: boolean; t: string; }

interface Report {
  deal: boolean; reason: string; rounds: number; turns: number; terms: Record<string, number> | null;
  per: AgentReport[]; firstGiver: AgentReport | null; most: AgentReport | null;
  turning: TurningPoint[]; habits: Habit[]; joint: number; nash: number;
  events: number; risk: number[];
}
```

### 3.2 Zustand Stores

#### `useUIStore` (`src/stores/ui-store.ts`)
```ts
interface UIState {
  currentScreen: 'home' | 'mode' | 'scenario' | 'setup' | 'briefing' | 'arena' | 'outcome' | 'replay';
  setScreen, go, back, confirmHome, pushHistory, popHistory, renderStepper;

  modal: { isOpen: boolean; content: ReactNode; closable: boolean } | null;
  openModal, closeModal;

  drawer: { isOpen: boolean; id: string } | null; openDrawer, closeDrawer;

  toasts: { id: string; message: string; duration?: number }[]; showToast, dismissToast;

  // Ambient (persisted)
  ambientEnabled, soundEnabled, reducedMotion, tooltipsEnabled, confettiEnabled;
  setAmbientEnabled, setSoundEnabled, setReducedMotion, setTooltipsEnabled, setConfettiEnabled;

  // Arena
  mindReveal: boolean; setMindReveal;
  arenaPaused: boolean; setArenaPaused;
  arenaPlaying: boolean; setArenaPlaying;
  simulationSpeed: number; setSimulationSpeed;

  // Replay
  replayPerspective: string; setReplayPerspective;

  // Help
  helpOpen: boolean; setHelpOpen;
}
```
**Persistence:** Only ambient settings persisted to `localStorage` (`na.ui`).

#### `useSessionStore` (`src/stores/session-store.ts`)
```ts
interface SessionState {
  engineState: SimulationState | null; setEngineState;
  transcript: TranscriptEntry[]; setTranscript, appendTranscript;
  tableOffer: Offer | null; setTableOffer;

  concessionLines: { agentId: string; values: (number | null)[] }[]; setConcessionLines;
  stanceBars: { agentId: string; target: number }[]; setStanceBars;
  zopaOverlap: number; setZopaOverlap;
  deadlockRisk: number; setDeadlockRisk;
  deadlockStalled: number; setDeadlockStalled;
  agreementLikelihood: number; setAgreementLikelihood;

  agentStates: Map<string, { emotion: EmotionState; currentTone: string; lastDecision: string | null; accepted: boolean }>;
  updateAgentState;

  innerVoiceText: string; setInnerVoiceText;
  currentSpeaker: string | null; setCurrentSpeaker;

  // Replay
  replayTurn: number; setReplayTurn;
  replayPlaying: boolean; setReplayPlaying;
  replayPerspective: string | null; setReplayPerspective;

  // Fork
  forkedFrom: number | null; setForkedFrom;

  // Climate override
  setEngineClimate;

  reset: () => void;
}
```
**Not persisted** — recreated each session from engine.

#### `useConfigStore` (`src/stores/config-store.ts`)
```ts
interface ConfigDraft {
  scenarioId: string | null;
  mode: 'simulation' | 'practice' | null;
  seats: string[]; // ordered role IDs
  human: number; // seat index, -1 for simulation
  climate: 'stable' | 'volatile' | 'crisis';
  eventFreq: 0 | 1 | 2 | 3;
  rounds: number; deadlockN: number; backdrop: string;
  roles: string[]; // orchestrator roles
  autonomy: 0 | 1 | 2 | 3;
  tab: 'builder' | 'seats' | 'env' | 'orch';
  customIssues: Issue[]; customRoles: Role[]; customEvents: Event[];
  roleOverrides: Record<string, Partial<Role>>;
}
```
**Persistence:** Full draft persisted to `localStorage` (`na.config`).

### 3.3 UI Consumption Pattern
```tsx
// Typical component
const { engineState, transcript, tableOffer } = useSessionStore(
  useShallow(s => ({ engineState: s.engineState, transcript: s.transcript, tableOffer: s.tableOffer }))
);
const { arenaPaused, setArenaPaused } = useUIStore(
  useShallow(s => ({ arenaPaused: s.arenaPaused, setArenaPaused: s.setArenaPaused }))
);
```

---

## 4. Expected API Endpoints & Real-Time Events

> **Notation:**
> ✅ = Frontend code already calls this (via `api-client.ts`)
> 🔄 = Frontend uses local engine, backend must replace
> [Proposed] = Not yet implemented in frontend, needs contract

### 4.1 Configuration & Session Management

| Operation | Method + Path | Request | Response | Status |
|-----------|---------------|---------|----------|--------|
| List scenarios | `GET /scenarios` | — | `ScenarioSummary[]` | [Proposed] |
| Get scenario detail | `GET /scenarios/{id}` | — | `Scenario` (with roles, issues, events) | [Proposed] |
| Create session | `POST /sessions` | `SessionConfiguration` | `{ sessionId: string, state: PublicSessionState }` | [Proposed] |
| Get session | `GET /sessions/{id}` | — | `PublicSessionState` | [Proposed] |
| Resume session | `POST /sessions/{id}/resume` | — | `{ state: PublicSessionState }` | [Proposed] |
| Save session | `POST /sessions/{id}/save` | — | `{ savedAt: string }` | [Proposed] |
| List saved | `GET /sessions` | `?status&limit` | `{ sessions: SavedSession[] }` | [Proposed] |

**Frontend Note:** `HomeScreen.quickDemo()` and `BriefingScreen.handleEnterArena()` currently call `useConfigStore.buildEngineConfig()` → `useSimulation.initialize()` locally. Backend must expose `POST /sessions` accepting the same `EngineConfig` shape.

### 4.2 Simulation Control (Simulation Mode)

| Operation | Method + Path | Request | Response | Status |
|-----------|---------------|---------|----------|--------|
| Start/Resume | `POST /sessions/{id}/play` | — | `{ state: PublicSessionState }` | 🔄 |
| Pause | `POST /sessions/{id}/pause` | — | `{ state: PublicSessionState }` | 🔄 |
| Step once | `POST /sessions/{id}/step` | — | `{ state: PublicSessionState, turn: TranscriptEntry }` | 🔄 |
| Set speed | `PATCH /sessions/{id}` | `{ speed: 0.5 \| 1 \| 2 \| 4 }` | `{ speed: number }` | [Proposed] |
| Mind Reveal | `GET /sessions/{id}/mind/{agentId}` | — | `AgentThought` (private rationale) | 🔄 |

**Current:** `useSimulation.togglePlay()`, `stepOnce()`, `togglePause()` drive local engine. Backend must expose equivalent endpoints returning updated `SimulationState` (or deltas).

### 4.3 Human Actions (Practice Mode)

| Operation | Method + Path | Request | Response | Status |
|-----------|---------------|---------|----------|--------|
| Send message | `POST /sessions/{id}/act` | `{ type: 'message', text: string }` | `{ ok: boolean, tone: ToneResult, adjusted?: boolean }` | 🔄 |
| Send offer | `POST /sessions/{id}/act` | `{ type: 'offer', text: string, x: Record<string, number> }` | `{ ok: boolean, tone: ToneResult, adjusted?: boolean }` | 🔄 |
| Accept offer | `POST /sessions/{id}/act` | `{ type: 'accept', text?: string }` | `{ ok: boolean }` | 🔄 |
| Walk away | `POST /sessions/{id}/act` | `{ type: 'walk', text?: string }` | `{ ok: boolean }` | 🔄 |
| Request concession hint | `GET /sessions/{id}/coach/concession` | — | `Record<string, number>` (offer terms) | 🔄 |
| Request coach hints | `GET /sessions/{id}/coach/hints` | — | `string[]` | 🔄 |

**Current:** `useSimulation.sendMessage()`, `acceptOffer()`, `walkAway()`, `suggestConcession()`, `getCoachHints()` call local `engine.humanAct()` / `engine.coach()`.

### 4.4 Real-Time / Streaming Events

Frontend expects **Server-Sent Events (SSE)** or **WebSocket** on:
```
GET /sessions/{id}/stream
```
**Event Types:**
```ts
type ServerEvent =
  | { type: 'turn'; payload: TranscriptEntry }
  | { type: 'offer'; payload: Offer }
  | { type: 'metrics'; payload: { concessionLines, stanceBars, zopaOverlap, deadlockRisk, agreementLikelihood } }
  | { type: 'agentState'; payload: { agentId: string; emotion: EmotionState; tone: ToneLabel; decision: string } }
  | { type: 'innerVoice'; payload: string }
  | { type: 'status'; payload: { status: SessionStatus; round: number; endReason?: string } }
  | { type: 'event'; payload: EventRecord }
  | { type: 'deadlock'; payload: { reason: 'stall' | 'limit'; stalled: number; canExtend: boolean } }
  | { type: 'error'; payload: { message: string; code: string } };
```

**Fallback:** If SSE/WS unavailable, frontend can poll `GET /sessions/{id}/state` every 500ms during active simulation.

### 4.5 Replay & Export

| Operation | Method + Path | Request | Response | Status |
|-----------|---------------|---------|----------|--------|
| Get replay snapshots | `GET /sessions/{id}/replay` | `?turn=0` | `{ snapshots: SimulationState[]; transcript: TranscriptEntry[] }` | [Proposed] |
| Fork session | `POST /sessions/{id}/fork` | `{ fromTurn: number }` | `{ sessionId: string }` | [Proposed] |
| Export report | `GET /sessions/{id}/export` | `?format=json\|pdf` | `Report` (JSON) or binary (PDF) | [Proposed] |

---

## 5. Domain & Scoring Semantics

### 5.1 Rounds & Turns
- **Round** = one full cycle through all agents (order = `engineState.order`)
- **Turn** = single agent action; `turnCount` increments monotonically
- `engineState.round` = current round (1-indexed); `maxRounds` from climate + events
- UI shows: `Round {min(round, maxRounds)} / {maxRounds}`

### 5.2 Offers & Concessions
- **Offer** = `Record<string, number>` mapping `issueId → value`
- **Utility** `U(a, x) = Σ w_i · v_i(x_i)` where `v_i = clamp((x_i - reserve_i) / (ideal_i - reserve_i), 0, 1)`
- **Concession Curve** (per personality):
  `T(t) = T_max - (T_max - floor) · t^β`
  `β`: aggressive=3.2, collaborative=1.0, risk-averse=0.45
  `floor = batnaU + 0.05 ± skill_adj`
- **Concession Lines Chart**: Y = utility (0–100), X = turns; dashed line at BATNA
- **Stance Bar**: Target utility `T` normalized 0–1 (flexible → firm)

### 5.3 Tone & Emotion
- **Tone Classifier**: Naive Bayes (unigram+bigram, Laplace α=0.6), trained in-browser on `TONE_CORPUS` (4 classes × ~180 samples)
- **Tone Labels**: `warm` 😊, `firm` 😐, `wary` 😟, `pushy` 😠, `neutral` 😐
- **Emotion** (valence `v ∈ [-1,1]`, arousal `a ∈ [0,1]`):
  - Updated per turn from: utility vs target, avg trust, pressure, counterpart tone
  - Labels: excited 😄, content 😊, eager 🙂, calm 😌, tense 😬, neutral 😐, irritated 😤, anxious 😟, angry 😠, discouraged 😞

### 5.4 Trust Matrix
- `trust[from][to] ∈ [0.02, 0.98]`, init 0.5
- **Deltas**: accept +0.06/+0.03; offer utility change to opponent ±0.12; tone: warm +0.04, pushy -0.07
- **Trust Threads** (center SVG): line width = `1 + trust*7`, color: >0.6 green, >0.4 blue, else red; dashed if <0.38

### 5.5 ZOPA Overlap (Semicircle Gauge)
- **Value**: `zopaOverlap ∈ [0,1]` — estimated overlap of acceptable ranges
- **Gauge**: 180° arc (π rad), color: >0.66 green, >0.4 blue, else amber
- Practice mode: `estimated, opponents hidden`

### 5.6 Deadlock Risk
- **Stalled rounds**: no margin improvement >0.015 or repeated offer pattern
- **Risk Formula**: `clamp(0.08 + stalled*0.18 + max(0,-margin)*(0.15+0.45*progress) + progress*0.12 + repeat_penalty, 0.03, 0.97)`
- **Ladder** (autonomy ≥1): mediate → inject event → extend (once) → breakdown

### 5.7 Agreement Likelihood
- Engine estimate `∈ [0,1]` based on margin, risk, progress, trust

### 5.8 Inner Voice / Coach
- **Simulation**: Static hint (`Press Play…`)
- **Practice**: Dynamic hints from `engine.coach()`:
  - Offer vs BATNA comparison
  - Opponent model: "X barely moved on Y — trade on Z instead"
  - Deadlock risk >0.5 → package trade suggestion
  - Tone feedback: pushy → trust drop
  - Anchor-first reminder

### 5.9 Mind Reveal
- **Simulation only**: Toggle shows `AgentThought` (private `u`, `T`, `batna`, `hidden`, `feel`, `trustIn`, `plan`)
- **Practice**: Locked, unlocks in Replay Lab

---

## 6. Integration Checklist & Edge Cases

### 6.1 Auth & Headers
```ts
// Frontend api-client.ts sends:
headers: { 'Content-Type': 'application/json' }
// Backend should accept:
Authorization: Bearer <jwt>  // if auth added later
X-Request-ID: <uuid>        // for tracing
```

### 6.2 CORS
```ts
// Frontend runs on http://localhost:3000 (dev) or production domain
// Backend must allow:
Access-Control-Allow-Origin: https://your-frontend.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

### 6.3 Timeouts & Retries
| Operation | Timeout | Retry Policy |
|-----------|---------|--------------|
| Session create | 10s | 2× with exponential backoff |
| Turn step (simulation) | 5s | None (idempotent via session state) |
| Human action | 8s | 1× with user toast on failure |
| SSE/WS connect | 5s | Reconnect 3×, then fallback to polling |
| Export | 30s | None |

### 6.4 Fallback Behavior
| Scenario | Frontend Behavior |
|----------|-------------------|
| Backend unreachable on `initialize()` | Toast error, stay on Briefing |
| SSE disconnect during simulation | Auto-reconnect 3×; if failed → poll `GET /state` every 500ms; show `⚠️ Connection degraded` toast |
| Turn step timeout | Show `⏳ Waiting for agent…` spinner; if >10s → toast `Agent timed out, step again?` |
| Invalid session ID (resume) | Toast `Session not found`, navigate to Home |
| Fork from invalid turn | Toast `Cannot fork from that turn` |

### 6.5 Verification Without Breaking Tests

```bash
# 1. Type-check + build
npx next build --no-lint

# 2. Unit tests (engine logic, utilities, tone classifier)
npx vitest run

# 3. Component tests (React Testing Library)
npx vitest run --reporter=verbose src/**/*.test.tsx

# 4. E2E flows (Playwright)
npx playwright test --project=chromium

# 5. Manual smoke test checklist:
#    - Home → Quick Demo → Arena (simulation) → Play → Pause → Next turn → Speed 2× → Mind Reveal → Finish → Outcome → Replay
#    - Home → Mode (Practice) → Scenario (Vendor) → Setup (defaults) → Briefing → Arena (practice) → Make offer → Counter → Accept → Outcome
#    - Home → Saved Sessions → Delete → Quick Demo
#    - Resize viewport 1440×900 → verify no vertical scroll, no clipped Buyer seat, no horizontal overflow on Metrics
```

### 6.6 Backend Contract Validation
| Frontend Expectation | Backend Must Provide |
|---------------------|----------------------|
| `EngineConfig` shape (see `src/engine/types.ts:365-379`) | `POST /sessions` accepts identical JSON |
| `SimulationState` shape (see `src/engine/types.ts:335-363`) | `GET /sessions/{id}/state` returns identical JSON |
| `TranscriptEntry` with `thought` (simulation) | `GET /sessions/{id}/mind/{agentId}` returns `AgentThought` |
| `Report` shape (see `src/engine/types.ts:434-449`) | `GET /sessions/{id}/export?format=json` returns identical JSON |
| Tone labels exactly `warm|firm|wary|pushy|neutral` | Classifier/service must use same enum |
| Issue kinds exactly `inr|days|net|months|lpa|lakh|weeks|dpw|share|num` | Formatter must match `KIND_FORMATTERS` |

---

## 7. File Reference Quick Links

| Area | Key Files |
|------|-----------|
| Engine Types | `src/engine/types.ts` |
| Orchestrator (turn loop, deadlock, events) | `src/engine/orchestrator.ts` |
| Agent Reasoning (private mind, phrasing) | `src/engine/agent.ts` |
| Utility / Scoring | `src/engine/utility.ts` |
| Tone Classifier | `src/engine/tone-classifier.ts` |
| Simulation API (init, step, hooks) | `src/engine/simulation.ts` |
| Scenario Templates | `src/engine/scenarios.ts` |
| Arena Screen (main view) | `src/features/arena/ArenaScreen.tsx` |
| Replay Screen | `src/features/replay/ReplayScreen.tsx` |
| Outcome Screen | `src/features/outcome/OutcomeScreen.tsx` |
| Config Draft & Validation | `src/stores/config-store.ts` |
| Live Session State | `src/stores/session-store.ts` |
| UI State (navigation, modals) | `src/stores/ui-store.ts` |
| Simulation Hook (engine ↔ stores) | `src/hooks/useSimulation.ts` |
| API Client | `src/lib/api-client.ts` |
| Design Tokens / Global Styles | `src/app/globals.css` |

---

## 8. Unimplemented / Proposed Contracts

The following are **not yet called by frontend** but will be needed for full backend integration. Marked `[Proposed / Needs Backend Contract]` in this doc.

1. `GET /scenarios` — list available templates for Scenario screen
2. `GET /scenarios/{id}` — full scenario detail (roles, issues, events)
3. `POST /sessions` — create session from `EngineConfig`
4. `GET /sessions/{id}` — fetch session state (for resume)
5. `POST /sessions/{id}/play|pause|step` — simulation control
6. `PATCH /sessions/{id}` — set speed, climate override
7. `POST /sessions/{id}/act` — human actions (message, offer, accept, walk)
7. `GET /sessions/{id}/coach/concession|hints` — practice helpers
8. `GET /sessions/{id}/mind/{agentId}` — Mind Reveal
9. `GET /sessions/{id}/stream` — SSE/WebSocket for real-time updates
10. `GET /sessions/{id}/replay` — snapshots for Replay Lab
11. `POST /sessions/{id}/fork` — fork from turn
12. `GET /sessions/{id}/export` — JSON/PDF report
13. `GET /sessions` — list saved sessions (with filters)

---

**Generated:** 2026-11-21
**Frontend Version:** `negotiation-arena-frontend@1.0.0`
**Branch:** `dev/parth`
**Last Build:** ✅ `npx next build --no-lint` PASS | ✅ `npx vitest run` 83/83 PASS