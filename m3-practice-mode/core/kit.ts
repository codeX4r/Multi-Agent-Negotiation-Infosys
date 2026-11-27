import { idealOffer, toneModel, type Agent, type NegotiationEngine, type Scenario, type SimulationState, type ToneResult } from './engine';
import { aiTurnChecks, humanTurnChecks, snapState } from './checks';
import { classifyMove, isCounterpart } from './moves';
import { normalizeOffer } from './normalize';
import { parseOfferText } from './parse';
import { reactionLine } from './reactions';
import { correctedPressure, reciprocityBoost } from './reciprocity';
import { applyHumanTone } from './tone';
import type { HumanMove, ScenarioPack, TurnReport } from './types';
import { getPack } from '../packs';

export interface KitOptions {
  /** fix: never drop a human offer (snap values, fill the budget remainder) */
  normalize?: boolean;
  /** understand offers typed in the message box */
  parse?: boolean;
  /** pass the human's tone to the AI's trust and mood */
  tone?: boolean;
  /** AI concedes faster after the human concedes, holds firmer after lowballs */
  reciprocity?: boolean;
  /** run the AI's concession curve on the real round limit */
  limitFix?: boolean;
  /** AI replies acknowledge the human's move */
  reactions?: boolean;
  /** run the realism checks every turn (read-only) */
  checks?: boolean;
  /** override the scenario pack (normally picked from the scenario id) */
  pack?: ScenarioPack | null;
}

export const ALL_ON: Required<Omit<KitOptions, 'pack'>> =
  { normalize: true, parse: true, tone: true, reciprocity: true, limitFix: true, reactions: true, checks: true };
export const CHECKS_ONLY: Required<Omit<KitOptions, 'pack'>> =
  { normalize: false, parse: false, tone: false, reciprocity: false, limitFix: false, reactions: false, checks: true };

export interface PracticeKit {
  options: Required<Omit<KitOptions, 'pack'>>;
  pack: ScenarioPack | null;
  reports: TurnReport[];
  /** last human move as seen by each AI agent */
  lastMove: Record<string, HumanMove>;
  onReport(fn: (r: TurnReport) => void): void;
  detach(): void;
}

type HumanAct = { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> };

/**
 * Attach the practice-mode kit to a running session.
 *
 *   const sim = createSimulation();
 *   await sim.init(config);
 *   attachPracticeKit(sim);            // <- the only line the frontend needs
 *
 * Works with a Simulation or a NegotiationEngine. It wraps three methods on that one
 * instance (humanAct, aiAct, hooks.rephrase); the team's source files are not changed.
 */
type EngineInternals = Pick<NegotiationEngine, 'humanAct' | 'human'> & {
  state: SimulationState | null; scenario: Scenario | null; hooks?: any;
  aiAct: (agent: Agent) => Promise<any>; effectiveLimit?: () => number; [k: string]: any;
};

export function attachPracticeKit(target: unknown, options: KitOptions = {}): PracticeKit {
  // aiAct and effectiveLimit are private in the engine's TypeScript; the kit reaches them on this one instance
  const engine = ((target as { engine?: NegotiationEngine }).engine ?? target) as unknown as EngineInternals;
  if (!engine?.state || !engine.scenario) throw new Error('attachPracticeKit: call it after sim.init(config)');
  const scenario: Scenario = engine.scenario;
  const pack = options.pack === undefined ? getPack(scenario.id) : options.pack;
  const opts = { ...ALL_ON, ...options } as Required<Omit<KitOptions, 'pack'>>;
  delete (opts as KitOptions).pack;

  const listeners: Array<(r: TurnReport) => void> = [];
  const kit: PracticeKit = {
    options: opts, pack, reports: [], lastMove: {},
    onReport: fn => { listeners.push(fn); },
    detach: () => {
      engine.humanAct = origHuman; engine.aiAct = origAi;
      if (engine.hooks) engine.hooks.rephrase = origRephrase;
    },
  };
  const emit = (r: TurnReport) => { kit.reports.push(r); listeners.forEach(fn => fn(r)); };
  const goodwill: Record<string, number> = {};

  const origHuman = engine.humanAct;
  const origAi = engine.aiAct;
  const origRephrase = engine.hooks?.rephrase;
  const S = (): SimulationState => engine.state!;

  // ---------------------------------------------------------------- human turn
  engine.humanAct = (act: HumanAct) => {
    const state = S();
    const human: Agent | undefined = engine.human();
    const text = act.text || '';
    const tone: ToneResult = text && toneModel.model ? toneModel.classify(text) : { label: 'neutral', p: {} as ToneResult['p'] };
    const notes: string[] = [];
    let sent: HumanAct = { ...act, x: act.x ? { ...act.x } : undefined };
    const myLast = human ? state.offers.filter(o => o.by === human.id).slice(-1)[0]?.x : undefined;
    const base = state.table?.x ?? myLast ?? (human ? idealOffer(human, scenario) : null);

    if (opts.parse && sent.type === 'message' && text) {
      const parsed = parseOfferText(text, scenario, pack, base);
      if (parsed) {
        sent = { type: 'offer', text, x: parsed.x };
        notes.push(`Read your offer from the text: ${parsed.found.join(', ')}`);
      }
    }
    if (opts.normalize && sent.type === 'offer' && sent.x) {
      const n = normalizeOffer(sent.x, scenario, base);
      sent.x = n.x;
      notes.push(...n.notes);
    }

    const before = snapState(state);
    const res = origHuman.call(engine, sent);
    const entry = [...state.transcript].reverse().find(e => e.by === human?.id);

    if (!res.err && human) {
      if (opts.tone && text && entry && state.transcript.length && entry.turn === state.turnCount) {
        applyHumanTone(state, human.id, tone, entry);
      }
      for (const ai of state.agents) {
        if (ai.id !== human.id) kit.lastMove[ai.id] = classifyMove(state, scenario, ai, human.id, text, tone);
      }
    }
    if (opts.checks && human && pack) {
      emit({ turn: state.turnCount, round: state.round, actorId: human.id, actorName: 'You', human: true, notes,
        checks: humanTurnChecks({ before, S: state, scenario, pack, humanId: human.id, intent: act, sent, tone, err: res.err }) });
    }
    return { ...res, tone, kit: { notes, sent } };
  };

  // ---------------------------------------------------------------- AI turn
  engine.aiAct = async (agent: Agent) => {
    const state = S();
    const human: Agent | undefined = engine.human();
    const move = kit.lastMove[agent.id];
    const before = snapState(state);
    const basePressure = state.pressure;
    let p = basePressure;
    if (opts.limitFix && typeof engine.effectiveLimit === 'function') p = correctedPressure(state, engine.effectiveLimit());
    if (opts.reciprocity && pack && human && isCounterpart(agent, human, scenario)) {
      goodwill[agent.id] = 0.6 * (goodwill[agent.id] || 0) + reciprocityBoost(move, agent, pack.reciprocity);
      p += goodwill[agent.id];
    }
    state.pressure = Math.max(0, p);
    // aiAct computes the agent's target synchronously before its first await,
    // so the adjusted pressure is used for this decision only and restored straight after.
    const run = origAi.call(engine, agent);
    state.pressure = basePressure;
    await run;

    if (opts.checks && human) {
      const entry = [...state.transcript].reverse().find(e => e.by === agent.id);
      emit({ turn: state.turnCount, round: state.round, actorId: agent.id, actorName: agent.name, human: false, notes: [],
        checks: aiTurnChecks({ before, S: state, scenario, agent, humanId: human.id, entry: entry?.turn === state.turnCount ? entry : undefined, move }) });
    }
    delete kit.lastMove[agent.id];   // each human move is answered once
  };

  // ---------------------------------------------------------------- AI wording
  engine.hooks = engine.hooks || {};
  engine.hooks.rephrase = async (agent: Agent, info: { draft: string; decision: string; terms: string; tone: string }) => {
    let text = info.draft;
    if (origRephrase) {
      try { text = (await origRephrase(agent, info as never)) || info.draft; } catch { /* keep draft */ }
    }
    if (opts.reactions) {
      const human = engine.human();
      const lastHuman = human ? S().offers.filter(o => o.by === human.id).slice(-1)[0]?.x ?? null : null;
      const line = reactionLine(pack, kit.lastMove[agent.id], agent, scenario, lastHuman);
      if (line) text = `${line} ${text}`;
    }
    return text;
  };

  return kit;
}
