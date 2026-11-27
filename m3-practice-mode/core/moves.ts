import { utility, type Agent, type Scenario, type SimulationState, type ToneResult } from './engine';
import type { HumanMove } from './types';

const THREAT = /walk(ing)? away|other offer|another (offer|supplier|vendor|candidate|bid)|competitor|elsewhere|alternative|we('| wi)ll leave|go with someone/i;

/** Classify what the human just did, from one AI agent's point of view. */
export function classifyMove(S: SimulationState, scenario: Scenario, ai: Agent, humanId: string,
                             text: string, tone: ToneResult): HumanMove {
  const base = { text, tone: (tone.label || 'neutral') as HumanMove['tone'], toneConfidence: tone.p?.[tone.label] ?? 0 };
  const last = [...S.transcript].reverse().find(e => e.by === humanId);
  if (last?.kind === 'walk') return { ...base, type: 'walk', size: 0 };
  if (last?.decision === 'accept') return { ...base, type: 'accept', size: 0 };

  const mine = S.offers.filter(o => o.by === humanId);
  const cur = mine[mine.length - 1];
  const fresh = cur && last && last.x && cur.turn === last.turn;
  if (fresh) {
    const u = utility(ai, cur.x, scenario);
    const prev = mine[mine.length - 2];
    // the term the human moved most (relative to its range)
    let issueId: string | undefined;
    if (prev) {
      let biggest = 0;
      for (const is of scenario.issues) {
        if (is.derived) continue;
        const d = Math.abs(cur.x[is.id] - prev.x[is.id]) / ((is.max - is.min) || 1);
        if (d > biggest) { biggest = d; issueId = is.id; }
      }
    }
    if (u < ai.batnaU - 0.02) {
      // name the term that hurts this agent most, not the one the human moved most
      let worst: string | undefined, worstLoss = -1;
      for (const is of scenario.issues) {
        const p = ai.prefs[is.id], w = ai.w[is.id] || 0;
        if (!p || !w || is.derived) continue;
        const d = p.ideal - p.reserve;
        const v = d === 0 ? 1 : Math.min(1, Math.max(0, (cur.x[is.id] - p.reserve) / d));
        if (w * (1 - v) > worstLoss) { worstLoss = w * (1 - v); worst = is.id; }
      }
      return { ...base, type: 'lowball', size: ai.batnaU - u, issueId: worst ?? issueId };
    }
    if (!prev) return { ...base, type: 'opening', size: 0, issueId };
    const d = u - utility(ai, prev.x, scenario);
    if (d > 0.12) return { ...base, type: 'big_concession', size: d, issueId };
    if (d > 0.025) return { ...base, type: 'concession', size: d, issueId };
    if (d < -0.025) return { ...base, type: 'retreat', size: d, issueId };
    return { ...base, type: 'hardline', size: d, issueId };
  }
  if (THREAT.test(text)) return { ...base, type: 'threat', size: 0 };
  if (/\?\s*$|\?\s/.test(text)) return { ...base, type: 'question', size: 0 };
  return { ...base, type: 'message', size: 0 };
}

/**
 * Does this AI agent negotiate against the human (a counterpart) or mostly on the same side (an ally)?
 * Compares which direction each side wants every term to move, weighted by how much both care.
 * Example: in vendor pricing, Finance wants a low price like the Buyer, so it is the Buyer's ally.
 */
export function isCounterpart(ai: Agent, human: Agent, scenario: Scenario): boolean {
  let score = 0;
  for (const is of scenario.issues) {
    const a = ai.prefs[is.id], h = human.prefs[is.id];
    if (!a || !h) continue;
    const wa = ai.w[is.id] || 0, wh = human.w[is.id] || 0;
    score += wa * wh * Math.sign(a.ideal - a.reserve) * Math.sign(h.ideal - h.reserve);
  }
  // fixed-total splits (project budget): wanting different shares of the same total is a conflict
  const c = scenario.constraint;
  if (c && c.type === 'sum') {
    const shares = [...c.of, c.derived];
    for (const sa of shares) for (const sh of shares) {
      if (sa === sh) continue;
      const a = ai.prefs[sa], h = human.prefs[sh];
      if (a && h && a.ideal > a.reserve && h.ideal > h.reserve) score -= (ai.w[sa] || 0) * (human.w[sh] || 0);
    }
  }
  return score < 0;
}
