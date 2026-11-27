/**
 * The one place that points at the team's practice-mode engine (frontend/src/engine).
 * Each name is imported from the file that defines it, so this works whether the engine
 * is loaded as ES modules (Next.js, Vite, esbuild) or CommonJS (plain Node + tsx).
 * If this folder moves inside the frontend, only these paths change.
 */
export { utility, snap, applyConstraint, progress, idealOffer } from '../../frontend/src/engine/utility';
export { fmtVal, clamp } from '../../frontend/src/engine/types';
export { toneModel } from '../../frontend/src/engine/tone-classifier';
export { createSimulation, buildEngineConfig } from '../../frontend/src/engine/simulation';
export { getScenario } from '../../frontend/src/engine/scenarios';
export { NegotiationEngine } from '../../frontend/src/engine/orchestrator';
export type {
  Agent, Issue, IssueKind, PersonalityType, Scenario, SimulationState, ToneLabel, ToneResult, TranscriptEntry,
} from '../../frontend/src/engine/types';
