/**
 * Agent Reasoning - Private Mind + Public Voice
 * Pure TypeScript port of the prototype's agent decision logic
 */

import type {
  Agent,
  Scenario,
  SimulationState,
  TranscriptEntry,
  Offer,
  AgentThought,
  ToneLabel,
  PersonalityType,
  SkillLevel
} from './types';
import { clamp, clone, r2 } from './types';

import { utility, target, generateOffer, buildOpponentModel, similarity, vIssue, idealOffer, applyConstraint, randomOffer, perturb } from './utility';
import { PERSONALITIES } from './types';

// ============================================================================
// Public Voice Phrasing
// ============================================================================

export interface PhraseResult {
  text: string;
  rationale: string;
  plan: string;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatTerms(x: Record<string, number>, scenario: Scenario): string {
  return scenario.issues.map(is => `${is.label} ${formatValue(is, x[is.id])}`).join(', ');
}

function formatValue(issue: import('./types').Issue, v: number): string {
  // Import KIND_FORMATTERS inline to avoid circular deps
  const kind = issue.kind;
  let formatted: string;
  switch (kind) {
    case 'inr': formatted = '₹' + Math.round(v).toLocaleString('en-IN'); break;
    case 'days': formatted = Math.round(v) + ' days'; break;
    case 'net': formatted = 'Net-' + Math.round(v); break;
    case 'months': formatted = Math.round(v) + ' mo'; break;
    case 'lpa': formatted = '₹' + (+v).toFixed(1) + ' LPA'; break;
    case 'lakh': formatted = '₹' + (+v).toFixed(2).replace(/\.00$/, '') + ' L'; break;
    case 'weeks': formatted = Math.round(v) + ' wks'; break;
    case 'dpw': formatted = Math.round(v) + ' d/wk'; break;
    case 'share': formatted = '₹' + Math.round(v) + ' L'; break;
    default: formatted = (Math.round(v * 100) / 100) + '';
  }
  return formatted + (kind === 'num' && issue.unit ? ' ' + issue.unit : '');
}

export function phrase(
  agent: Agent,
  decision: 'accept' | 'reject' | 'counter' | 'open' | 'message',
  x: Record<string, number> | null,
  tableX: Record<string, number> | null,
  ownX: Record<string, number> | null,
  scenario: Scenario
): PhraseResult {
  const issues = scenario.issues.filter(i => (agent.w[i.id] || 0) > 0.001 || i.derived);
  const P = agent.personality;

  if (decision === 'accept') {
    return {
      text: pick({
        aggressive: [
          'Fine. We can live with that, let\'s lock it in.',
          'Agreed. That works, let\'s sign before anything changes.'
        ],
        collaborative: [
          'That works for us, thank you for the movement. Agreed.',
          'Great, I think that is fair for both sides. We accept.'
        ],
        risk_averse: [
          'That is acceptable. Let\'s confirm it in writing.',
          'Okay, we can accept that. Please confirm the schedule.'
        ]
      }[P]),
      rationale: 'The package meets enough of this party\'s objectives to close.',
      plan: 'Accept and secure the deal.'
    };
  }

  if (decision === 'open') {
    const tops = issues
      .slice()
      .sort((a, b) => (agent.w[b.id] || 0) - (agent.w[a.id] || 0))
      .slice(0, 2);

    return {
      text: pick({
        aggressive: ['Our position is clear: ', 'Let\'s be direct. We need '],
        collaborative: ['To get us started, here is a package: ', 'Here is an opening proposal we think is balanced: '],
        risk_averse: ['We would like to start carefully with ', 'Our initial proposal, subject to review: ']
      }[P]) + tops.map(is => `${is.label.toLowerCase()} at ${formatValue(is, x![is.id])}`).join(' and ') + '.',
      rationale: 'Opening anchored on this party\'s top priorities.',
      plan: `Anchor high on ${tops.map(t => t.label).join(' + ')}.`
    };
  }

  // Counter or reject
  const gives: import('./types').Issue[] = [];
  const asks: import('./types').Issue[] = [];

  if (x) {
    issues.forEach(is => {
      if (is.derived) return;
      if (ownX && x[is.id] !== ownX[is.id] && vIssue(agent, is.id, x[is.id], scenario) < vIssue(agent, is.id, ownX[is.id], scenario)) {
        gives.push(is);
      }
      if (tableX && x[is.id] !== tableX[is.id] && vIssue(agent, is.id, x[is.id], scenario) > vIssue(agent, is.id, tableX[is.id], scenario)) {
        asks.push(is);
      }
    });
  }

  gives.sort((a, b) => (agent.w[a.id] || 0) - (agent.w[b.id] || 0));
  asks.sort((a, b) => (agent.w[b.id] || 0) - (agent.w[a.id] || 0));

  const dir = (is: import('./types').Issue, from: Record<string, number>) =>
    x && x[is.id] < from[is.id]
      ? 'bring ' + is.label.toLowerCase() + ' down to ' + formatValue(is, x[is.id])
      : 'take ' + is.label.toLowerCase() + ' up to ' + formatValue(is, x?.[is.id] ?? from[is.id]);

  let s = '';

  if (decision === 'reject' && tableX) {
    const worst = issues.filter(i => !i.derived).reduce((a, b) =>
      (agent.w[b.id] || 0) * (1 - vIssue(agent, b.id, tableX[b.id], scenario)) >
      (agent.w[a.id] || 0) * (1 - vIssue(agent, a.id, tableX[a.id], scenario)) ? b : a
    );
    s = pick(['That doesn\'t work for us, ', 'We can\'t accept that; ', 'No, that is too far, ']) +
      `${worst.label.toLowerCase()} at ${formatValue(worst, tableX[worst.id])} is out of range. `;
  }

  if (gives.length && ownX) s += `${s ? 'Still, ' : ''}I can ${dir(gives[0], ownX)}`;
  if (asks.length && x) s += (gives.length ? ', but ' : (s ? 'We need ' : 'We need ')) + `${asks[0].label.toLowerCase()} at ${formatValue(asks[0], x[asks[0].id])}`;
  if (!gives.length && !asks.length) s += 'We are holding our package as proposed';

  s += '. ' + pick({
    aggressive: ['That is where we stand.', 'Take that seriously, it is a strong offer.', 'We won\'t go much further.'],
    collaborative: ['What matters most on your side?', 'Does that help you get closer?', 'Can we build on that together?'],
    risk_averse: ['Can we confirm that so we stay on schedule?', 'We\'d want assurance before moving again.', 'Does that reduce the risk for everyone?']
  }[P]);

  const rationale = decision === 'reject'
    ? 'Offer fell below this party\'s walk-away; countered with a firmer package.'
    : `Offer below this party's target. ${gives.length ? 'Conceded on ' + gives.map(g => g.label).join(', ') + ' (lower priority)' : 'No concession'}; ${asks.length ? 'pushed on ' + asks.map(g => g.label).join(', ') : 'held position'}.`;

  const plan = gives.length
    ? `Trade ${gives[0].label} to protect ${asks[0] ? asks[0].label : 'my top issue'}.`
    : `Hold firm on ${asks[0] ? asks[0].label : 'everything'}.`;

  return { text: s, rationale, plan };
}

// ============================================================================
// Agent Turn Logic
// ============================================================================

export interface AgentDecision {
  decision: 'accept' | 'reject' | 'counter' | 'open' | 'message';
  x: Record<string, number> | null;
  u: number;
  tone: ToneLabel;
  thought: AgentThought;
  text: string;
  rationale: string;
}

export type { AgentThought } from './types';

export async function decideAgentTurn(
  agent: Agent,
  state: SimulationState,
  scenario: Scenario,
  hooks: {
    rephrase?: (agent: Agent, info: RephraseInfo) => Promise<string | null>;
  }
): Promise<AgentDecision> {
  const table = state.table;
  const T = target(agent, state);
  const u = table ? utility(agent, table.x, scenario) : 0;
  const P = PERSONALITIES[agent.personality];

  let decision: 'accept' | 'reject' | 'counter' | 'open' | 'message';
  let x: Record<string, number> | null = null;

  if (table && table.by !== agent.id && (u >= T || u >= P.acceptBar)) {
    decision = 'accept';
  } else if (!table) {
    decision = 'open';
    x = generateOffer(agent, Math.max(T, P.open - 0.02), state, scenario);
  } else {
    decision = table.by !== agent.id && u < agent.batnaU ? 'reject' : 'counter';
    x = generateOffer(agent, T, state, scenario);
  }

  const prevOwn = state.offers.filter(f => f.by === agent.id).slice(-1)[0];
  const lastSpk = table && table.by !== agent.id ? table.by : null;

  const tone: ToneLabel = decision === 'accept' ? 'warm'
    : decision === 'reject' ? (agent.personality === 'aggressive' ? 'firm' : 'wary')
    : ({ aggressive: 'firm', collaborative: 'warm', risk_averse: 'wary' }[agent.personality] || 'firm') as ToneLabel;

  const ph = phrase(agent, decision, x, table?.x || null, prevOwn?.x || null, scenario);

  const feel = emotionLabel(state.emo[agent.id] || { v: 0, a: 0 });
  const trustIn = lastSpk && state.trust[agent.id]?.[lastSpk] != null
    ? r2(state.trust[agent.id][lastSpk])
    : null;

  const thought: AgentThought = {
    u: r2(u),
    T: r2(T),
    batna: r2(agent.batnaU),
    hidden: (scenario.issues.find(i => i.id === agent.hidden) || {}).label || agent.hidden,
    feel,
    trustIn,
    lastSpk: lastSpk ? agent.name : null, // Will be resolved by nameOf
    plan: ph.plan
  };

  let text = ph.text;

  // LLM rephrase if available
  if (hooks.rephrase) {
    try {
      const rephrased = await hooks.rephrase(agent, {
        decision,
        terms: x ? formatTerms(x, scenario) : formatTerms(table!.x, scenario),
        draft: text,
        tone
      });
      if (rephrased) text = rephrased;
    } catch {
      // Ignore rephrase errors
    }
  }

  return {
    decision,
    x,
    u: x ? utility(agent, x, scenario) : u,
    tone,
    thought,
    text,
    rationale: ph.rationale
  };
}

// ============================================================================
// Emotion System
// ============================================================================

export function emotionLabel(e: { v: number; a: number }): string {
  const v = e.v, a = e.a;
  if (v > 0.35) return a > 0.55 ? 'excited' : 'content';
  if (v > 0.05) return a > 0.6 ? 'eager' : 'calm';
  if (v > -0.2) return a > 0.6 ? 'tense' : 'neutral';
  if (v > -0.5) return a > 0.55 ? 'irritated' : 'anxious';
  return a > 0.55 ? 'angry' : 'discouraged';
}

export function emotionFace(e: { v: number; a: number }): string {
  const faces: Record<string, string> = {
    excited: '😄', content: '😊', eager: '🙂', calm: '😌',
    tense: '😬', neutral: '😐', irritated: '😤', anxious: '😟',
    angry: '😠', discouraged: '😞'
  };
  return faces[emotionLabel(e)] || '😐';
}

export function updateEmotions(
  state: SimulationState,
  actor: Agent | null,
  tone: ToneLabel,
  scenario: Scenario
): void {
  state.agents.forEach(agent => {
    const e = state.emo[agent.id];
    const u = state.table ? utility(agent, state.table.x, scenario) : 0.45;
    const T = target(agent, state);

    const tr = Object.values(state.trust[agent.id] || {});
    const avgT = tr.length ? tr.reduce((s, v) => s + v, 0) / tr.length : 0.5;

    const vt = clamp(((u - agent.batnaU) / Math.max(0.15, T - agent.batnaU)) * 1.2 - 0.45, -1, 1) * 0.7 + (avgT - 0.5) * 0.9;

    const prevU = state.uHist.length ? state.uHist[state.uHist.length - 1].u[agent.id] : u;
    const at = 0.18 + state.pressure * 0.55 + Math.min(0.35, Math.abs(u - prevU) * 2.2)
      + (actor && actor.id !== agent.id && tone === 'pushy' ? 0.28 : 0)
      + (agent.personality === 'aggressive' ? 0.06 : 0);

    e.v = clamp(e.v * 0.55 + vt * 0.45, -1, 1);
    e.a = clamp(e.a * 0.6 + at * 0.4, 0, 1);

    e.hist.push(r2(e.v));
    e.ahist.push(r2(e.a));
    if (e.hist.length > 60) { e.hist.shift(); e.ahist.shift(); }
  });
}

// ============================================================================
// Trust Updates
// ============================================================================

export function updateTrust(
  state: SimulationState,
  actor: Agent,
  decision: 'accept' | 'reject' | 'counter' | 'open' | 'message',
  x: Record<string, number> | null,
  tone: ToneLabel,
  scenario: Scenario
): number {
  const trustBefore = clone(state.trust);

  if (decision === 'accept') {
    const by = state.table!.by;
    if (state.trust[by]?.[actor.id] != null) {
      state.trust[by][actor.id] = clamp(state.trust[by][actor.id] + 0.06, 0.02, 0.98);
    }
    if (state.trust[actor.id]?.[by] != null) {
      state.trust[actor.id][by] = clamp(state.trust[actor.id][by] + 0.03, 0.02, 0.98);
    }
  } else if (x) {
    const prevByA = state.offers.filter(f => f.by === actor.id).slice(-1)[0];
    state.agents.forEach(o => {
      if (o.id === actor.id) return;
      const ref = prevByA ? prevByA.x : (state.table && state.table.x);
      const d = ref ? (utility(o, x, scenario) - utility(o, ref, scenario)) * 1.2 : 0;
      if (state.trust[o.id]?.[actor.id] != null) {
        state.trust[o.id][actor.id] = clamp(state.trust[o.id][actor.id] + clamp(d, -0.12, 0.12), 0.02, 0.98);
      }
    });
  }

  // Tone-based trust delta
  const toneDelta: Record<ToneLabel, number> = {
    warm: 0.04, firm: 0, wary: -0.01, pushy: -0.07, neutral: 0
  };
  const TD = toneDelta[tone] || 0;

  state.agents.forEach(o => {
    if (o.id !== actor.id && state.trust[o.id]?.[actor.id] != null) {
      state.trust[o.id][actor.id] = clamp(state.trust[o.id][actor.id] + TD, 0.02, 0.98);
    }
  });

  // Calculate total trust delta for this actor
  let delta = 0;
  state.agents.forEach(o => {
    if (o.id !== actor.id) {
      delta += state.trust[o.id][actor.id] - trustBefore[o.id][actor.id];
    }
  });

  return r2(delta * 100);
}

// ============================================================================
// Rephrase Info Type
// ============================================================================

export interface RephraseInfo {
  decision: 'open' | 'counter' | 'accept' | 'reject' | 'message';
  terms: string;
  draft: string;
  tone: ToneLabel;
}