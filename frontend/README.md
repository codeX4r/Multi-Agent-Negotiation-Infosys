# Negotiation Arena — Frontend

A separate Next.js frontend intended to connect to your FastAPI backend later. It is intentionally isolated from backend implementation and database code.

## Stack
- Next.js App Router
- React + TypeScript
- Lucide icons
- REST API client abstraction

## Run locally
1. Extract this folder.
2. Open it in VS Code.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local`.
5. Set `NEXT_PUBLIC_API_BASE_URL` to your FastAPI base URL.
6. Run `npm run dev`.
7. Open http://localhost:3000.

The UI can be explored before the backend is ready. Session creation and turn actions require the API endpoints below.

## Expected FastAPI endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/sessions` | Create a negotiation session |
| GET | `/api/v1/sessions/{session_id}` | Get authorised public session state |
| POST | `/api/v1/sessions/{session_id}/turns` | Submit participant message |
| POST | `/api/v1/sessions/{session_id}/turns/next` | Ask orchestrator for next AI turn |
| GET | `/api/v1/sessions/{session_id}/report` | Get outcome report |

The request/response shapes are represented in `src/types/negotiation.ts` and `src/features/sessions/session-api.ts`. Align the backend schemas with these contracts or update the frontend types/client accordingly.

## Security boundary — mandatory

- Do not put LLM provider API keys in this frontend.
- Do not send every agent's private goals, BATNAs, hidden preferences or internal reasoning to the browser.
- The backend must own orchestration, private agent state, offer evaluation, deadlock handling and LLM calls.
- In Practice Mode, return only the human participant's authorised private briefing plus public session state.
- Treat all client input as untrusted and validate it again in FastAPI.

## Current scope

Implemented: home, mode selection, three scenario templates, table configuration, briefing, transcript-based arena, API client wiring.

Not yet implemented: authentication, session listing, full report/replay lab, advanced metrics, streaming updates, voice input, custom scenario builder, production error boundaries and automated tests.

This is a frontend foundation, not a completed production product.
