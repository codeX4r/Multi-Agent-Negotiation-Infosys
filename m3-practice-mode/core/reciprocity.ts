import { clamp, progress, type Agent, type SimulationState } from './engine';
import type { HumanMove } from './types';

/**
 * How much an AI agent's concession speed changes after the human's move.
 * Positive = concede faster (the human gave ground or was warm), negative = hold firmer.
 * The value is added to the engine's "pressure", which is exactly the input its concession
 * curve T(t) = Tmax - (Tmax - floor) * t^beta uses to speed up or slow down.
 */
export function reciprocityBoost(move: HumanMove | undefined, agent: Agent,
                                 factors: Record<string, number>): number {
  if (!move) return 0;
  const f = factors[agent.personality] ?? 1;
  let b = 0;
  switch (move.type) {
    case 'big_concession': b = Math.min(0.45, 2.2 * move.size) * f; break;
    case 'concession': b = Math.min(0.3, 2.2 * move.size) * f; break;
    case 'lowball': b = agent.personality === 'risk_averse' ? -0.06 : -0.14; break;
    case 'retreat': b = -0.1; break;
    case 'hardline': b = -0.03; break;
    case 'threat': b = agent.personality === 'aggressive' ? -0.05 : agent.personality === 'risk_averse' ? 0.06 : 0.02; break;
  }
  if (move.toneConfidence >= 0.45) {
    if (move.tone === 'warm') b += 0.03 * f;
    if (move.tone === 'pushy') b += agent.personality === 'aggressive' ? -0.06 : agent.personality === 'risk_averse' ? 0.02 : -0.03;
  }
  return b;
}

/**
 * Correct for the engine's round-limit placeholder.
 * utility.ts limit() looks for an *agent* called "timekeeper", so the AI's concession curve
 * always assumes 20 rounds while the session really ends at maxRounds. This returns the
 * pressure that makes the curve run on the real schedule (same target formula, no edits).
 */
export function correctedPressure(S: SimulationState, realLimit: number): number {
  const p = S.pressure;
  const buggy = progress(S);
  if (buggy <= 0) return p;
  const n = S.order.length;
  const real = clamp((S.round - 1 + S.turnIdx / n) / Math.max(1, realLimit - 1), 0, 1);
  return ((real / buggy) * (0.85 + 0.6 * p) - 0.85) / 0.6;
}
