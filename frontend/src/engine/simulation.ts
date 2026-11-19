/**
 * Simulation Engine - Main entry point
 * Wraps the NegotiationEngine with a clean API
 */

import type {
  EngineConfig,
  EngineHooks,
  SimulationState,
  TranscriptEntry,
  Agent,
  Scenario,
  Report
} from './types';

import { NegotiationEngine } from './orchestrator';
import { getScenario } from './scenarios';
import { ToneModel, toneModel } from './tone-classifier';

// ============================================================================
// Simulation Class - High-level API
// ============================================================================

export class Simulation {
  private engine: NegotiationEngine;
  private config: EngineConfig | null = null;

  constructor() {
    this.engine = new NegotiationEngine();
  }

  /**
   * Initialize a new simulation
   */
  async init(config: EngineConfig): Promise<void> {
    // Ensure tone model is trained
    if (!toneModel.model) {
      await toneModel.train();
    }

    this.config = config;
    this.engine.init(config, this.hooks);
  }

  /**
   * Run one step of the simulation
   * Returns true if simulation continues, false if paused/ended
   */
  async step(): Promise<boolean> {
    return this.engine.step();
  }

  /**
   * Submit a human action (for practice mode)
   */
  humanAct(act: { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> }): { err?: string; ok?: boolean; adjusted?: boolean; tone?: { label: string; p: Record<string, number> } } {
    // Classify tone if text provided
    let toneResult: { label: string; p: Record<string, number> } = { label: 'neutral', p: {} };
    if (act.text) {
      toneResult = toneModel.classify(act.text);
    }

    const result = this.engine.humanAct(act);
    return { ...result, tone: toneResult };
  }

  /**
   * Get current simulation state
   */
  getState(): SimulationState | null {
    return (this.engine as any).state;
  }

  /**
   * Get the scenario definition
   */
  getScenario(): Scenario | null {
    return (this.engine as any).scenario;
  }

  /**
   * Get the engine config
   */
  getConfig(): EngineConfig | null {
    return this.config;
  }

  /**
   * Generate final report
   */
  report(): Report {
    return this.engine.report() as Report;
  }

  /**
   * Get snapshots for replay
   */
  getSnapshots(): SimulationState[] {
    return (this.engine as any).snapshots;
  }

  /**
   * Get transcript
   */
  getTranscript(): TranscriptEntry[] {
    return (this.engine as any).state?.transcript || [];
  }

  /**
   * Check if it's human's turn
   */
  isHumanTurn(): boolean {
    const state = this.getState();
    if (!state || state.status !== 'running') return false;
    return state.waitingHuman;
  }

  /**
   * Get current human agent
   */
  getHumanAgent(): Agent | undefined {
    return (this.engine as any).human();
  }

  /**
   * Suggest a concession for the human
   */
  suggestConcession(): Record<string, number> | null {
    return (this.engine as any).suggestConcession();
  }

  /**
   * Get coach hints for the human
   */
  coach(): string[] {
    return (this.engine as any).coach();
  }

  /**
   * Pause/resume simulation
   */
  setPaused(paused: boolean): void {
    // The engine doesn't have a direct pause, but the UI can control stepping
  }

  // ============================================================================
  // Hooks - Can be overridden by UI
  // ============================================================================

  private hooks: EngineHooks = {
    onThinking: async () => {},
    onTurn: () => {},
    onUpdate: () => {},
    onHumanTurn: () => {},
    onModal: async () => 'extend',
    onEnd: () => {},
    rephrase: undefined
  };

  setHooks(hooks: Partial<EngineHooks>): void {
    this.hooks = { ...this.hooks, ...hooks };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export interface SessionDraft {
  scenarioId: string;
  mode: 'simulation' | 'practice';
  seats: string[];
  human: number; // seat index, -1 for simulation
  climate: 'stable' | 'volatile' | 'crisis';
  eventFreq: number;
  rounds: number;
  deadlockN: number;
  backdrop: string;
  roles: string[];
  autonomy: 0 | 1 | 2 | 3;
  tab?: string;
}

export function buildEngineConfig(draft: SessionDraft): EngineConfig {
  const scenario = getScenario(draft.scenarioId);
  const agents = draft.seats.map((rid, i) => {
    const role = scenario.roles.find(r => r.id === rid);
    if (!role) throw new Error(`Role not found: ${rid}`);
    const w = Object.fromEntries(
      Object.entries(role.prefs).map(([k, p]) => [k, p.w])
    );
    return {
      ...role,
      seat: i + 1,
      human: draft.mode === 'practice' && draft.human === i,
      color: ['#7aa7ff', '#f08b91', '#f4c66a', '#67d6a3', '#b69cff'][i],
      w,
      mindReveal: role.mindReveal ?? true,
      revealBatna: role.revealBatna ?? false
    };
  });

  return {
    scenario: draft.scenarioId,
    mode: draft.mode,
    rounds: draft.rounds,
    climate: draft.climate,
    eventFreq: draft.eventFreq,
    deadlockN: draft.deadlockN,
    backdrop: draft.backdrop,
    orchestrator: {
      roles: draft.roles as any,
      autonomy: draft.autonomy
    },
    scenarioDef: scenario,
    agents
  };
}

export function createSimulation(): Simulation {
  return new Simulation();
}

// Export singleton tone model for UI
export { toneModel, ToneModel } from './tone-classifier';
export { NegotiationEngine } from './orchestrator';