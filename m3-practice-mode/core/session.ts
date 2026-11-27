import { buildEngineConfig, createSimulation, getScenario, type SimulationState } from './engine';
import { ALL_ON, CHECKS_ONLY, attachPracticeKit, type KitOptions, type PracticeKit } from './kit';

export interface SessionOptions {
  scenario: 'vendor' | 'job' | 'budget';
  /** role the human plays (default: the scenario's first role) */
  seat?: string;
  /** true = full kit, false = current engine with checks only, or a custom option set */
  kit?: boolean | KitOptions;
  rounds?: number;
  climate?: 'stable' | 'volatile' | 'crisis';
}

/** A headless practice-mode session on the team's real engine (used by the demos and validator). */
export async function createPracticeSession(o: SessionOptions) {
  const sc = getScenario(o.scenario);
  const seat = o.seat ?? sc.roles[0].id;
  const draft = {
    scenarioId: o.scenario, mode: 'practice' as const, seats: sc.roles.map(r => r.id),
    human: sc.roles.findIndex(r => r.id === seat), climate: o.climate ?? 'volatile', eventFreq: 2,
    rounds: o.rounds ?? 12, deadlockN: 3, backdrop: sc.backdrop,
    roles: ['timekeeper', 'mediator', 'enforcer', 'injector', 'auditor'], autonomy: 2 as const,
  };
  if (draft.human < 0) throw new Error(`Unknown seat "${seat}" for ${o.scenario}`);
  const sim = createSimulation();
  await sim.init(buildEngineConfig(draft));
  const engine = (sim as any).engine;
  engine.delay = async () => {};            // skip the UI's thinking animation delay
  const options = o.kit === true || o.kit === undefined ? ALL_ON : o.kit === false ? CHECKS_ONLY : { ...ALL_ON, ...o.kit };
  const kit: PracticeKit = attachPracticeKit(sim, options);
  const state = (): SimulationState => sim.getState()!;
  return {
    sim, engine, kit, scenario: sc, seat,
    state,
    human: () => sim.getHumanAgent()!,
    /** let the AI agents play until it is the human's turn or the session ends */
    async runAI(maxSteps = 60) {
      for (let i = 0; i < maxSteps && state().status === 'running' && !sim.isHumanTurn(); i++) await sim.step();
    },
    act: (a: { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> }) =>
      sim.humanAct(a) as ReturnType<typeof sim.humanAct> & { kit?: { notes: string[] } },
  };
}
export type PracticeSession = Awaited<ReturnType<typeof createPracticeSession>>;
