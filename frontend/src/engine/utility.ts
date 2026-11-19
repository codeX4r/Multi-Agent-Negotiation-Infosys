/**
 * Utility Calculations & Concession Curves
 * Pure TypeScript port of the prototype's negotiation engine math
 */

import type {
  Agent,
  Issue,
  Scenario,
  Offer,
  SimulationState,
  Personality,
  CLIMATES
} from './types';
import { clamp, clone, r2, PERSONALITIES } from './types';

export { clamp, clone, r2 };

// ============================================================================
// Utility Model: U = Σ w_i · v_i(x_i)
// ============================================================================

/**
 * Calculate utility of an offer for an agent
 * U(a, x) = Σ w_i * v_i(x_i) where v_i is normalized value 0-1
 */
export function utility(agent: Agent, x: Record<string, number> | null, scenario: Scenario): number {
  if (!x) return 0;
  let u = 0;
  for (const issue of scenario.issues) {
    const p = agent.prefs[issue.id];
    const w = agent.w[issue.id] || 0;
    if (!p || !w) continue;
    const den = p.ideal - p.reserve;
    const v = den === 0 ? 1 : clamp((x[issue.id] - p.reserve) / den, 0, 1);
    u += w * v;
  }
  return u;
}

/**
 * Value of a single issue for an agent (normalized 0-1)
 */
export function vIssue(agent: Agent, issueId: string, val: number, scenario: Scenario): number {
  const p = agent.prefs[issueId];
  if (!p) return 0;
  const d = p.ideal - p.reserve;
  return d === 0 ? 1 : clamp((val - p.reserve) / d, 0, 1);
}

/**
 * Normalize agent weights to sum to 1
 */
export function normalizeWeights(agent: Agent): void {
  const total = Object.values(agent.w).reduce((s, v) => s + Math.max(0, v), 0) || 1;
  for (const k in agent.w) {
    agent.w[k] = Math.max(0, agent.w[k]) / total;
  }
}

/**
 * Snap value to issue step grid
 */
export function snap(issue: Issue, v: number): number {
  const s = Math.round((v - issue.min) / issue.step) * issue.step + issue.min;
  return clamp(+s.toFixed(4), issue.min, issue.max);
}

/**
 * Apply scenario constraint (e.g., sum constraint for budget scenario)
 * Returns true if valid
 */
export function applyConstraint(x: Record<string, number>, scenario: Scenario): boolean {
  const c = scenario.constraint;
  for (const issue of scenario.issues) {
    if (!issue.derived) {
      x[issue.id] = snap(issue, x[issue.id]);
    }
  }
  if (c && c.type === 'sum') {
    const derivedIssue = scenario.issues.find(i => i.id === c.derived);
    if (!derivedIssue) return false;
    x[c.derived] = c.total - c.of.reduce((s, k) => s + (x[k] || 0), 0);
    return x[c.derived] >= derivedIssue.min && x[c.derived] <= derivedIssue.max;
  }
  return true;
}

/**
 * Range of an issue (for normalization)
 */
export function rangeOf(issue: Issue): number {
  return (issue.max - issue.min) || 1;
}

/**
 * Progress through negotiation (0 to 1)
 */
export function progress(state: SimulationState): number {
  const n = state.order.length;
  const lim = limit(state);
  return clamp((state.round - 1 + state.turnIdx / n) / Math.max(1, lim - 1), 0, 1);
}

/**
 * Effective round limit
 */
export function limit(state: SimulationState): number {
  const hasTimekeeper = state.agents.some(a =>
    ['timekeeper'].includes(a.id) // This is a placeholder - actual check is in engine
  );
  return hasTimekeeper ? state.maxRounds : Math.max(state.maxRounds, 20);
}

// ============================================================================
// Concession Curve: T(t) = Tmax - (Tmax - floor) * t^β
// ============================================================================

/**
 * Target utility for an agent at current progress
 * Personality beta controls curve shape
 */
export function target(agent: Agent, state: SimulationState): number {
  const P = PERSONALITIES[agent.personality];
  const t = clamp(progress(state) * (0.85 + state.pressure * 0.6), 0, 1);
  let floor = agent.batnaU + 0.05 + (agent.skill === 'novice' ? -0.03 : agent.skill === 'expert' ? 0.02 : 0);
  floor = clamp(floor, 0, 1);
  const Tmax = P.open;
  return clamp(Tmax - (Tmax - floor) * Math.pow(t, P.beta), floor, 1);
}

// ============================================================================
// Opponent Modeling
// ============================================================================

export interface OpponentModel {
  ideal: Record<string, number>;
  w: Record<string, number>;
  n: number;
  estU: (x: Record<string, number>) => number;
}

/**
 * Build opponent model from their offer history
 */
export function buildOpponentModel(
  opponentId: string,
  state: SimulationState,
  scenario: Scenario
): OpponentModel | null {
  const offs = state.offers.filter(f => f.by === opponentId);
  if (!offs.length) return null;

  const ideal: Record<string, number> = {};
  const w: Record<string, number> = {};

  scenario.issues.forEach(issue => {
    ideal[issue.id] = offs[0].x[issue.id];
    let mov = 0;
    for (let i = 1; i < offs.length; i++) {
      mov += Math.abs(offs[i].x[issue.id] - offs[i - 1].x[issue.id]) / rangeOf(issue);
    }
    mov = offs.length > 1 ? mov / (offs.length - 1) : 0.1;
    w[issue.id] = 1 / (0.04 + mov);
  });

  const totalW = Object.values(w).reduce((a, b) => a + b, 0);
  for (const k in w) w[k] /= totalW;

  const estU = (x: Record<string, number>): number => {
    return scenario.issues.reduce((s, issue) => {
      return s + w[issue.id] * (1 - Math.abs(x[issue.id] - ideal[issue.id]) / rangeOf(issue));
    }, 0);
  };

  return { ideal, w, n: offs.length, estU };
}

/**
 * Similarity between two offers (0-1)
 */
export function similarity(x: Record<string, number>, y: Record<string, number>, scenario: Scenario): number {
  return 1 - scenario.issues.reduce((s, issue) =>
    s + Math.abs(x[issue.id] - y[issue.id]) / rangeOf(issue), 0
  ) / scenario.issues.length;
}

// ============================================================================
// Offer Generation
// ============================================================================

/**
 * Generate ideal offer for agent (their perfect world)
 */
export function idealOffer(agent: Agent, scenario: Scenario): Record<string, number> {
  const x: Record<string, number> = {};
  scenario.issues.forEach(issue => {
    const p = agent.prefs[issue.id];
    x[issue.id] = p && agent.w[issue.id] > 0.001 ? p.ideal : (issue.min + issue.max) / 2;
  });
  if (!applyConstraint(x, scenario)) {
    // Fallback: adjust derived issue
    const c = scenario.constraint!;
    const derived = scenario.issues.find(i => i.id === c.derived)!;
    let need = c.total - derived.min - (derived.max - derived.min) * 0.3;
    const own = c.of.filter(k => agent.w[k] > 0.01);
    const others = c.of.filter(k => !own.includes(k));
    let rest = need - own.reduce((s, k) => s + x[k], 0);
    others.forEach(k => {
      const is = scenario.issues.find(i => i.id === k)!;
      x[k] = clamp(rest / Math.max(1, others.length), is.min, is.max);
    });
    applyConstraint(x, scenario);
  }
  return x;
}

/**
 * Random valid offer
 */
export function randomOffer(scenario: Scenario): Record<string, number> | null {
  const x: Record<string, number> = {};
  scenario.issues.forEach(issue => {
    x[issue.id] = issue.min + Math.random() * (issue.max - issue.min);
  });
  return applyConstraint(x, scenario) ? x : null;
}

/**
 * Perturb base offer by scale factor
 */
export function perturb(
  base: Record<string, number>,
  scale: number,
  scenario: Scenario
): Record<string, number> | null {
  const x: Record<string, number> = {};
  scenario.issues.forEach(issue => {
    x[issue.id] = base[issue.id] + (Math.random() - 0.5) * 2 * scale * rangeOf(issue);
  });
  return applyConstraint(x, scenario) ? x : null;
}

/**
 * Generate offer at target utility, maximizing estimated joint gain
 */
export function generateOffer(
  agent: Agent,
  targetU: number,
  state: SimulationState,
  scenario: Scenario
): Record<string, number> {
  const ownLastOffer = state.offers.filter(o => o.by === agent.id).slice(-1)[0];
  const tableOffer = state.table;

  const candidates: { x: Record<string, number>; u: number }[] = [];

  // 1. Ideal offer
  candidates.push({ x: idealOffer(agent, scenario), u: utility(agent, idealOffer(agent, scenario), scenario) });

  // 2. Random offers (520)
  for (let i = 0; i < 520; i++) {
    const x = randomOffer(scenario);
    if (x) candidates.push({ x, u: utility(agent, x, scenario) });
  }

  // 3. Perturb around table offer (260)
  if (tableOffer) {
    for (let i = 0; i < 260; i++) {
      const x = perturb(tableOffer.x, 0.2, scenario);
      if (x) candidates.push({ x, u: utility(agent, x, scenario) });
    }
  }

  // 4. Perturb around own last offer (160)
  if (ownLastOffer) {
    for (let i = 0; i < 160; i++) {
      const x = perturb(ownLastOffer.x, 0.12, scenario);
      if (x) candidates.push({ x, u: utility(agent, x, scenario) });
    }
  }

  // Filter to band around target
  let band = candidates.filter(c => c.u >= targetU && c.u <= targetU + 0.08);

  if (band.length < 6) {
    band = candidates
      .filter(c => c.u >= targetU)
      .sort((a, b) => a.u - b.u)
      .slice(0, 16);
  }

  if (!band.length) {
    band = [candidates.sort((a, b) => b.u - a.u)[0]];
  }

  // Score candidates by opponent models
  const opponentModels = state.agents
    .filter(a => a.id !== agent.id)
    .map(a => buildOpponentModel(a.id, state, scenario))
    .filter(Boolean) as OpponentModel[];

  band.forEach(c => {
    const ests = opponentModels.map(m => m.estU(c.x));
    const mean = ests.length ? ests.reduce((s, v) => s + v, 0) / ests.length : 0.5;
    const min = ests.length ? Math.min(...ests) : 0.5;
    const simv = tableOffer ? similarity(c.x, tableOffer.x, scenario) : 0;

    if (agent.skill === 'expert') {
      c.u = 0.65 * min + 0.35 * mean + 0.25 * simv;
    } else if (agent.skill === 'skilled') {
      c.u = mean + 0.2 * simv;
    } else {
      c.u = Math.random();
    }
    c.u += Math.random() * 0.03;
  });

  const best = band.reduce((a, b) => b.u > a.u ? b : a);
  let x = clone(best.x);

  // Novice: rounder concessions
  if (agent.skill === 'novice') {
    const y = clone(x);
    scenario.issues.forEach(issue => {
      if (!issue.derived) {
        y[issue.id] = issue.min + Math.round((y[issue.id] - issue.min) / (issue.step * 2)) * issue.step * 2;
      }
    });
    if (applyConstraint(y, scenario) && utility(agent, y, scenario) >= targetU - 0.05) {
      x = y;
    }
  }

  return x;
}