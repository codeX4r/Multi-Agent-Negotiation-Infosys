# Milestone 2 – LLM-Driven Multi-Agent Negotiation System

**Project:** AI-Driven Multi-Agent Negotiation Training & Simulation Platform
**Milestone:** 2 – LLM-Driven Negotiation Engine
**Status:** In Progress – Core implementation developed; fixes and verification pending
**Prepared for:** Project Team

---

## 1. Milestone Overview

During Milestone 2, I developed the core LLM-driven negotiation stack, moving the platform beyond a basic scripted negotiation flow.

The implementation introduces an orchestrator responsible for managing negotiation lifecycles, LLM-powered agents capable of making persona-aware decisions, a provider abstraction supporting multiple LLM backends, structured decision validation, and automated tests for the negotiation engine.

The primary objective was to establish a functional foundation in which multiple AI agents can negotiate autonomously using their assigned personas, objectives, constraints, and negotiation history.

The core architecture has been implemented. However, testing and code audits identified several issues that must be resolved before Milestone 2 can be considered fully complete.

---

## 2. Work Completed

### 2.1 Negotiation Orchestrator – Lifecycle Management

**File:** `backend/app/engine/orchestrator.py`

Implemented the central orchestration component responsible for managing the negotiation lifecycle.

Key responsibilities:

- Manages negotiation turn order between participating agents.
- Maintains negotiation state and conversation history.
- Tracks the current round and negotiation progress.
- Invokes the appropriate agent when its turn begins.
- Processes agent decisions, including offers, counteroffers, acceptance, and rejection.
- Handles negotiation termination conditions.
- Manages outcomes such as successful deals, breakdowns, and deadlocks.

**Result:** The central negotiation lifecycle is implemented, with a rejection-handling issue identified during testing that still needs correction.

### 2.2 LLM-Powered Negotiation Agents

**File:** `backend/app/engine/llm_agent.py`

Implemented an LLM-driven agent capable of making negotiation decisions based on its assigned persona and negotiation context.

Key capabilities:

- Persona-aware prompting.
- Incorporates agent goals, preferences, and negotiation constraints into decision-making.
- Uses conversation history as part of the agent's reasoning context.
- Generates structured negotiation decisions.
- Supports offers, counteroffers, acceptance, and rejection.
- Retries invalid LLM responses through validation and correction attempts.
- Handles errors during LLM response generation.

**Result:** Agents can generate negotiation decisions through LLM calls rather than relying exclusively on predefined scripted responses.

**Known limitation:** The current history formatter sends only the latest eight history entries to the LLM. The orchestrator retains the broader history, but older entries are not directly included in the agent's prompt.

### 2.3 LLM Provider Abstraction

**Files:**

- `backend/app/engine/llm_provider.py`
- `backend/app/engine/llm_client.py`

Implemented a provider abstraction to support different LLM backends without tightly coupling negotiation logic to a particular provider.

Supported providers:

1. Gemini
2. Claude
3. OpenAI
4. Ollama

Configuration is managed through environment variables:

| Variable       | Purpose                                         |
| -------------- | ----------------------------------------------- |
| `LLM_PROVIDER` | Selects the LLM provider                        |
| `LLM_MODEL`    | Specifies the model                             |
| `LLM_API_KEY`  | Supplies provider authentication where required |
| `LLM_BASE_URL` | Configures a custom or local API endpoint       |

Additional implementation:

- Centralized provider creation.
- Shared client interface.
- HTTP request handling.
- Retry handling for rate limits and server-side errors.
- Backoff between retry attempts.

**Result:** The architecture supports switching between multiple LLM backends through configuration instead of modifying the negotiation engine.

**Verification status:** Provider implementations and configuration logic have been tested. Successful end-to-end operation against all four real provider APIs has not yet been established.

### 2.4 Structured Decision Schemas and Validation

**File:** `backend/app/engine/validation.py`

Implemented structured validation to ensure that LLM-generated decisions follow the expected negotiation rules.

Validation currently covers:

- Issue value ranges.
- Permitted step alignment.
- Budget sum constraints.
- Acceptance terms matching the current offer.
- Action and terms consistency.

The LLM agent also performs validation retries when generated decisions fail validation.

**Result:** Important negotiation constraints are checked programmatically rather than relying entirely on LLM instructions.

**Known limitation:** Walk-away/BATNA constraints are not yet programmatically enforced in the active LLM decision flow. The legacy `evaluation.py` contains related logic, but it is not integrated into the current LLM flow.

### 2.5 Automated Test Infrastructure

Implemented and executed automated tests covering:

- LLM agent decision generation.
- Provider configuration and selection.
- Validation and retry behavior.
- Orchestrator negotiation flow.
- Frontend contract compatibility.

The current tests primarily use `ScriptedClient` mocks to simulate LLM responses.

**Result:** Automated test coverage exists for the core negotiation components, but real-provider integration and some scenario-specific orchestration tests remain pending.

---

## 3. Test Execution Results

The following results were obtained during the audit. These are separate test executions and should not be combined into a single pass percentage.

### 3.1 LLM-Focused Test Suite

**Command:**

```bash
python -m pytest tests/test_llm_agent.py tests/test_llm_provider.py tests/test_orchestrator_llm.py -v --tb=short
```

| Test file                  |                            Result |
| -------------------------- | --------------------------------: |
| `test_llm_agent.py`        |                      11/11 passed |
| `test_llm_provider.py`     |                      11/11 passed |
| `test_orchestrator_llm.py` |                2 passed, 2 failed |
| **Total**                  | **24 passed, 2 failed out of 26** |

#### Failure 1 – Invalid Test Configuration

**File:** `backend/tests/test_orchestrator_llm.py`
**Location:** Around line 109

The budget scenario test defines an `ops` walk-away value of 32, while the configured maximum for that issue is 28.

The configuration is rejected by Pydantic before the LLM negotiation flow executes.

**Classification:** Test configuration issue.

**Required action:** Correct the test fixture so that its walk-away values fall within the configured issue ranges.

#### Failure 2 – Rejection Outcome Overwritten

**File:** `backend/app/engine/orchestrator.py`
**Location:** Around lines 279–280

The rejection path sets the negotiation outcome to breakdown and marks the negotiation as ended. However, the outer negotiation loop continues instead of terminating immediately.

A subsequent agent action can overwrite the breakdown outcome. In the observed test, the final result became a deal instead of a breakdown.

**Classification:** Actual orchestrator logic bug.

**Required action:** Ensure that a terminal rejection/breakdown outcome exits the relevant negotiation loop and cannot be overwritten by subsequent agent actions.

### 3.2 Frontend Contract Test Suite

**Command:**

```bash
python -m pytest tests/test_frontend_contract.py -v --tb=short
```

| Result | Count |
| ------ | ----: |
| Passed |     3 |
| Failed |     2 |
| Total  |     5 |

The two failures were related to budget scenario sum constraints.

In the failing cases, generated budget values did not satisfy the required total, even after validation retries.

Examples observed during testing included totals of 57, 58, and 56 where the required total was 50.

**Classification:** Budget constraint reliability issue.

**Required action:** Introduce deterministic constraint handling so that mathematically dependent values are corrected or rejected programmatically rather than relying exclusively on LLM-generated calculations.

---

## 4. Gaps Identified During the Audit

The following items are still pending or require improvement.

| Area                            | Current status                                       | Required work                                                                   |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Orchestrator rejection handling | Bug identified                                       | Fix terminal outcome handling                                                   |
| Budget sum constraint           | Unreliable in failing tests                          | Add deterministic correction or constraint enforcement                          |
| Walk-away/BATNA enforcement     | Not integrated into active LLM flow                  | Add programmatic BATNA validation                                               |
| LLM error handling              | Implemented, but terminal behavior needs improvement | Avoid treating every exhausted LLM failure as an ordinary negotiation rejection |
| Job scenario orchestration test | Missing dedicated test                               | Add an end-to-end mocked-provider test                                          |
| Real LLM integration tests      | Not implemented/verified                             | Test against actual configured providers                                        |
| Conversation history            | Limited to latest eight entries in LLM prompt        | Review and document the context-window strategy                                 |
| Climate pressure and mediator   | Not implemented as part of the current core          | Consider as subsequent enhancements                                             |

### 4.1 Walk-Away / BATNA Enforcement

The current implementation includes walk-away values in agent prompts, but the active LLM flow does not consistently enforce them through deterministic validation.

This means an LLM could generate a decision that violates an agent's walk-away threshold while still passing the existing validation checks.

The legacy `evaluation.py` contains related logic, but it is not currently integrated into the active LLM decision pipeline.

**Required improvement:** Integrate BATNA checks into the programmatic validation process so that an agent cannot commit to an unacceptable offer simply because the LLM generated it.

### 4.2 LLM Failure Handling

The current flow includes retries for network errors, invalid JSON, and invalid decisions.

When all retries are exhausted, an error can propagate to the orchestrator, which currently handles the failure by forcing a rejection.

This can turn a temporary provider or response-generation problem into a negotiation breakdown.

**Required improvement:** Separate technical agent failures from genuine negotiation decisions. A provider failure should not automatically be interpreted as an intentional rejection by the agent.

### 4.3 Conversation History Management

The orchestrator maintains negotiation history, but the LLM prompt formatter currently limits the history supplied to the model to the latest eight entries.

This is a context-window management decision, but it means older negotiation commitments and decisions may not be directly available to the agent.

**Required improvement:** Evaluate a better context strategy, such as retaining important agreements, commitments, and previous offers alongside recent conversation entries.

---

## 5. Remaining Work – Team Action Plan

The following tasks should be prioritized to stabilize Milestone 2.

### Priority 1 – Critical Correctness Fixes

- [ ] Fix the rejection-to-breakdown control-flow bug in `orchestrator.py`.
- [ ] Correct the invalid budget test configuration.
- [ ] Implement deterministic budget sum validation/correction.
- [ ] Integrate programmatic walk-away/BATNA enforcement.
- [ ] Improve handling of exhausted LLM retries so technical failures are not treated as intentional rejections.

### Priority 2 – Testing and Verification

- [ ] Add a dedicated job scenario orchestration test.
- [ ] Add tests for BATNA violations.
- [ ] Add tests for budget constraint correction.
- [ ] Add tests ensuring terminal outcomes cannot be overwritten.
- [ ] Add real-provider integration tests, with credentials and provider availability configured appropriately.
- [ ] Re-run all relevant backend tests after fixes.
- [ ] Verify frontend compatibility with the corrected negotiation outputs.

### Priority 3 – Reliability and Improvements

- [ ] Review the eight-entry conversation history limit.
- [ ] Test provider retry behavior under realistic failure conditions.
- [ ] Document environment configuration for all supported providers.
- [ ] Verify negotiation behavior across vendor, job, and budget scenarios.
- [ ] Consider climate pressure and mediator capabilities as subsequent enhancements.

---

## 6. Expected Deliverables Before Milestone 2 Closure

Milestone 2 should be considered ready for closure when the team can demonstrate:

1. A working orchestrator that correctly manages negotiation turns, state, history, and terminal outcomes.
2. Multiple LLM-powered agents making persona-aware negotiation decisions.
3. Configurable support for the four implemented LLM provider backends.
4. Programmatic enforcement of issue ranges, step alignment, budget constraints, and BATNA limits.
5. Successful negotiation tests covering vendor, job, and budget scenarios.
6. Correct handling of provider errors without silently converting technical failures into negotiation decisions.
7. A passing regression test suite.
8. Documented verification of real-provider execution.

---

## 7. Overall Assessment

Milestone 2 has established the core technical foundation for LLM-driven multi-agent negotiation.

The major architectural components have been developed:

- Negotiation lifecycle orchestration.
- Persona-aware LLM agents.
- Multi-provider LLM abstraction.
- Structured decision schemas.
- Programmatic validation for several negotiation constraints.
- Automated test infrastructure.

However, implementation alone does not establish production-level correctness. The audit identified an actual orchestrator bug, unreliable budget constraint handling, missing BATNA enforcement, and incomplete real-provider verification.

**Current assessment: Core implementation substantially developed; Milestone 2 remains in progress until critical fixes and verification tasks are completed.**

The immediate focus should be correctness, deterministic constraint enforcement, and reliable end-to-end testing. Additional features such as climate pressure and mediator behavior should be considered after the core negotiation engine is stable.

---

## 8. Team Summary

The core LLM-driven negotiation stack has been developed, including lifecycle orchestration, persona-aware agent reasoning, four-provider abstraction, structured decision validation, and automated tests.

The audit confirmed that the main architecture is in place, but identified several remaining tasks: fixing the orchestrator's rejection-handling bug, making budget constraints deterministic, integrating BATNA enforcement, improving LLM failure handling, adding job scenario coverage, and verifying execution against real LLM providers.

The next phase will focus on resolving these issues and running a complete regression test suite before declaring Milestone 2 complete.
