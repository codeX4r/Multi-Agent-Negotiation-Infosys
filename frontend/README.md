# Negotiation Arena — Frontend

The frontend application for the **AI-Driven Multi-Agent Negotiation Training & Simulation Platform**.

Built with Next.js, React and TypeScript, the application provides an interactive environment for configuring negotiation scenarios, setting up AI agents, participating in negotiations and reviewing outcomes.

## Overview

Negotiation Arena supports two operating modes:

- **Simulation Mode:** Observe autonomous AI agents negotiate with one another.
- **Practice Mode:** Participate as a negotiating party against AI agents.

The frontend provides the user-facing workflow. Agent reasoning, orchestration, negotiation decisions and persistence belong to the backend.

## Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 15 | React application framework |
| React 19 | UI development |
| TypeScript | Static typing |
| Tailwind CSS 4 | Styling |
| Zustand | Client-side state management |
| React Hook Form | Form management |
| Zod | Data validation |
| Lucide React | Icons |
| Vitest | Unit testing |
| Playwright | Browser-based testing |

## Application Workflow

The current application is organized around these screens:

1. **Home:** Application entry point.
2. **Mode Selection:** Choose Simulation or Practice Mode.
3. **Scenario Selection:** Select a negotiation scenario.
4. **Agent Setup:** Configure agent personalities and skill levels.
5. **Briefing:** Review the negotiation context.
6. **Negotiation Arena:** Interact with the negotiation transcript and session.
7. **Outcome:** Review negotiation results.
8. **Replay:** Access the replay experience.

## Supported Scenario Templates

The platform specification defines three predefined scenarios:

- Vendor Pricing Negotiation
- Job Offer Negotiation
- Project Budget Allocation

## Project Structure

```text
frontend/
├── public/                  # Static assets
├── src/
│   ├── app/                 # Next.js App Router
│   ├── components/          # Shared UI components
│   ├── features/
│   │   ├── home/
│   │   ├── mode/
│   │   ├── scenario/
│   │   ├── setup/
│   │   ├── briefing/
│   │   ├── arena/
│   │   ├── outcome/
│   │   ├── replay/
│   │   └── sessions/
│   ├── lib/                 # Shared utilities and API client
│   ├── stores/              # Zustand stores
│   └── types/               # TypeScript interfaces
├── tests/                   # Automated tests
├── package.json
├── next.config.ts
├── playwright.config.ts
├── vitest.config.ts
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (compatible with Next.js 15)
- npm
- Git

### Installation

From the repository root:

```bash
cd frontend
npm install
```

### Environment Configuration

Create a `.env.local` file in the frontend directory.

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

Use the appropriate backend URL for your environment.

Never put private API keys, database credentials or LLM provider secrets in frontend environment variables.

### Run Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### Production Build

```bash
npm run build
npm run start
```

### Linting

```bash
npm run lint
```

### Testing

Run the available Vitest and Playwright test suites using their respective configurations.

```bash
npx vitest run
npx playwright test
```

## Backend Integration

The frontend uses a dedicated session API abstraction.

Expected integration endpoints:

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/v1/sessions` | Create a negotiation session |
| GET | `/api/v1/sessions/{session_id}` | Retrieve session state |
| POST | `/api/v1/sessions/{session_id}/turns` | Submit a participant message |
| POST | `/api/v1/sessions/{session_id}/turns/next` | Request the next AI turn |
| GET | `/api/v1/sessions/{session_id}/report` | Retrieve the outcome report |

These are expected API contracts, not a claim that all corresponding backend endpoints are currently available.

The TypeScript definitions in `src/types/negotiation.ts` and API functions in `src/features/sessions/session-api.ts` define the current frontend integration expectations.

## Security Considerations

- Never expose LLM provider API keys in the browser.
- Keep private agent goals, BATNAs, hidden preferences and internal reasoning on the backend.
- Return only session information the requesting participant is authorized to access.
- Validate all client-provided data on the backend.
- Do not treat frontend validation as a replacement for backend validation.
- Configure CORS on the backend for approved frontend origins.

## Current Implementation Status

The frontend README and application source describe the following scope.

**Implemented frontend foundation:**
- Application screens and navigation.
- Scenario selection workflow.
- Agent configuration interfaces.
- Negotiation arena interface.
- Session API client abstraction.
- TypeScript negotiation models.

**Remaining development areas:**
- Authentication and authorization.
- Complete backend-connected session lifecycle.
- Production-ready outcome reporting and replay.
- Advanced negotiation metrics.
- Streaming updates.
- Custom scenario creation.
- Comprehensive automated test coverage.
- Production error handling.

## Development Guidelines

- Use TypeScript for application code.
- Keep feature-specific components inside their respective feature directories.
- Keep shared components reusable.
- Keep API communication inside the API/service layer.
- Maintain consistent types between frontend and backend.
- Avoid committing environment secrets and generated build artifacts.
- Follow the team's branch and pull-request workflow.

---

**Project:** AI-Driven Multi-Agent Negotiation Training & Simulation Platform
**Frontend:** Next.js + TypeScript
**Backend:** FastAPI
**Database:** MongoDB
