/**
 * Engine Main Export
 * Pure TypeScript negotiation engine - no React dependencies
 */

export * from './types';
export * from './tone-classifier';
export * from './utility';
export * from './scenarios';
export * from './simulation';

// Re-export specific from agent
export { phrase, decideAgentTurn, updateEmotions, emotionLabel, emotionFace, updateTrust, type PhraseResult, type AgentDecision, type RephraseInfo } from './agent';

// Re-export specific from orchestrator
export { NegotiationEngine } from './orchestrator';

// Re-export specific from simulation
export { Simulation, createSimulation, buildEngineConfig, type SessionDraft } from './simulation';
export { toneModel, ToneModel } from './tone-classifier';