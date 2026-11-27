import { clamp, utility, type Agent, type Scenario, type SimulationState, type TranscriptEntry, type ToneResult } from './engine';
import { parseOfferText } from './parse';
import { isCounterpart } from './moves';
import { TONE_TRUST } from './tone';
import type { Check, HumanMove, ScenarioPack } from './types';

/** The part of the state the checks compare before and after a turn. */
export interface Snap {
  offers: number;
  turnCount: number;
  status: string;
  table: Record<string, number> | null;
  tableBy: string | null;
  trust: Record<string, Record<string, number>>;
  lastOfferBy: Record<string, Record<string, number> | null>;
}

export function snapState(S: SimulationState): Snap {
  const lastOfferBy: Snap['lastOfferBy'] = {};
  for (const a of S.agents) {
    const o = S.offers.filter(f => f.by === a.id).slice(-1)[0];
    lastOfferBy[a.id] = o ? { ...o.x } : null;
  }
  return {
    offers: S.offers.length, turnCount: S.turnCount, status: S.status,
    table: S.table ? { ...S.table.x } : null, tableBy: S.table?.by ?? null,
    trust: JSON.parse(JSON.stringify(S.trust)), lastOfferBy,
  };
}

const ACK: Partial<Record<HumanMove['type'], RegExp>> = {
  concession: /appreciat|thank|movement|moving|moved|step|progress|closer|good faith|fair|meet you/i,
  big_concession: /appreciat|thank|movement|moving|moved|step|progress|closer|good faith|fair|meet you|generous|real|serious move|significant|shift/i,
  lowball: /too low|too far|not (a )?(workable|realistic|serious)|far apart|well below|below anything|can'?t work|cannot work|unrealistic|way off|nowhere near|non-starter|not workable|at risk|unable to deliver|would not get approved/i,
  retreat: /\bback\b|backtrack|backward|moved away|earlier (offer|position|split)|reopen|took back/i,
  threat: /alternative|other (offer|option)s?|elsewhere|walk|options|competitor|pressure/i,
  question: /\?|to answer|good question|because|the reason|happy to explain/i,
};

const check = (id: string, label: string, pass: boolean, detail: string, hard: boolean): Check =>
  ({ id, label, pass, detail, hard });

/** Checks after the human's turn. */
export function humanTurnChecks(opts: {
  before: Snap; S: SimulationState; scenario: Scenario; pack: ScenarioPack; humanId: string;
  /** what the person did in the UI */
  intent: { type: string; text?: string; x?: Record<string, number> };
  /** what reached the engine (after the kit, if attached) */
  sent: { type: string; text?: string; x?: Record<string, number> };
  tone: ToneResult; err?: string;
}): Check[] {
  const { before, S, scenario, pack, humanId, intent, sent, tone } = opts;
  const act = intent;
  const out: Check[] = [];
  if (opts.err) {
    if (intent.type === 'offer' || sent.type === 'offer') {
      out.push(check('offer_submitted', 'Offer submitted', false, `rejected by the engine: ${opts.err}`, true));
    }
    return out;
  }
  const last = S.offers[S.offers.length - 1];
  const recorded = S.offers.length > before.offers && last?.by === humanId;

  if (act.type === 'offer' || sent.type === 'offer') {
    out.push(check('offer_submitted', 'Offer submitted', recorded,
      recorded ? 'offer recorded by the engine' : 'offer silently dropped (engine returned ok but recorded nothing)', true));
  }

  // a message that clearly contains terms should count as an offer
  if (act.type === 'message' && act.text) {
    const parsed = act.text ? parseOfferText(act.text, scenario, pack, before.table) : null;
    if (parsed && parsed.found.length >= 1) {
      out.push(check('typed_offer', 'Typed offer understood', recorded,
        recorded ? `read ${parsed.found.join(', ')} from the text` : `text mentions ${parsed.found.join(', ')} but no offer was recorded`, false));
    }
  }

  // tone should move trust: compare trust change with the part explained by the offer itself
  const conf = tone.p?.[tone.label] ?? 0;
  if ((tone.label === 'pushy' || tone.label === 'warm') && conf >= 0.45 && act.text) {
    let residual = 0, n = 0;
    for (const o of S.agents) {
      if (o.id === humanId || before.trust[o.id]?.[humanId] == null) continue;
      let offerPart = 0;
      if (recorded) {
        const ref = before.lastOfferBy[humanId] || before.table;
        if (ref) offerPart = clamp((utility(o, last.x, scenario) - utility(o, ref, scenario)) * 1.2, -0.12, 0.12);
      }
      const expectedNoTone = clamp(before.trust[o.id][humanId] + offerPart, 0.02, 0.98);
      residual += S.trust[o.id][humanId] - expectedNoTone;
      n++;
    }
    residual = n ? residual / n : 0;
    const want = TONE_TRUST[tone.label];
    const pass = want < 0 ? residual < -0.01 : residual > 0.01;
    out.push(check('tone_trust', `Trust ${want < 0 ? 'fell after a pushy' : 'rose after a warm'} message`, pass,
      `${tone.label} ${(conf * 100).toFixed(0)}%, trust change from tone ${(residual * 100).toFixed(1)}`, false));
  }
  return out;
}

/** Checks after an AI agent's turn. */
export function aiTurnChecks(opts: {
  before: Snap; S: SimulationState; scenario: Scenario; agent: Agent; humanId: string;
  entry: TranscriptEntry | undefined; move?: HumanMove;
}): Check[] {
  const { before, S, scenario, agent, humanId, entry, move } = opts;
  const out: Check[] = [];
  if (!entry || entry.by !== agent.id) return out;
  const human = S.agents.find(a => a.id === humanId)!;

  if (entry.x) {
    const bad: string[] = [];
    for (const is of scenario.issues) {
      const v = entry.x[is.id];
      if (v == null || v < is.min - 1e-9 || v > is.max + 1e-9) bad.push(`${is.label} out of range`);
    }
    const c = scenario.constraint;
    if (c && c.type === 'sum') {
      const sum = [...c.of, c.derived].reduce((s, k) => s + entry.x![k], 0);
      if (Math.abs(sum - c.total) > 1e-6) bad.push(`split totals ${sum}, not ${c.total}`);
    }
    out.push(check('within_range', 'Offer within allowed ranges', !bad.length, bad.join('; ') || 'all terms valid', true));

    const past: string[] = [];
    for (const is of scenario.issues) {
      const p = agent.prefs[is.id];
      if (!p || !(agent.w[is.id] > 0.001) || is.derived) continue;
      if ((entry.x[is.id] - p.reserve) * (p.ideal - p.reserve) < -1e-9) past.push(is.label);
    }
    out.push(check('own_limits', 'Stays within its own limits', !past.length,
      past.length ? `offered past its own limit on ${past.join(', ')}` : 'no term past its own limit', false));
  }

  if (entry.decision === 'accept' && before.table) {
    const u = utility(agent, before.table, scenario);
    out.push(check('no_bad_accept', 'Never accepts below walk-away', u >= agent.batnaU - 1e-9,
      `accepted at value ${u.toFixed(2)} vs walk-away ${agent.batnaU.toFixed(2)}`, true));
  }

  if (move?.type === 'lowball' && before.tableBy === humanId) {
    out.push(check('lowball_pushback', 'Pushes back on a lowball', entry.decision !== 'accept',
      `lowball by ${(move.size * 100).toFixed(0)} pts below its walk-away -> ${entry.decision}`, true));
  }

  const prevOwn = before.lastOfferBy[agent.id];
  // an agent already offering at its walk-away cannot give more: holding there is realistic
  const atLimit = prevOwn ? utility(agent, prevOwn, scenario) <= agent.batnaU + 0.08 : false;
  if ((move?.type === 'concession' || move?.type === 'big_concession') && prevOwn && !atLimit
      && isCounterpart(agent, human, scenario)) {
    const prev = prevOwn;
    // a concession = the AI asks less for itself than before (standard definition), or moves towards the human
    const towards = entry.x ? utility(human, entry.x, scenario) - utility(human, prev, scenario) : 0;
    const gaveUp = entry.x ? utility(agent, prev, scenario) - utility(agent, entry.x, scenario) : 0;
    const pass = entry.decision === 'accept' || towards > 0.005 || gaveUp > 0.005;
    out.push(check('reciprocity', 'Reciprocates a concession', pass,
      entry.decision === 'accept' ? 'accepted after the concession'
        : `human conceded ${(move.size * 100).toFixed(0)} pts; AI gave up ${(gaveUp * 100).toFixed(1)} pts, moved ${(towards * 100).toFixed(1)} pts towards the human`, false));
  }

  const re = move ? ACK[move.type] : undefined;
  if (re) {
    out.push(check('acknowledges', 'Reply responds to the move', re.test(entry.text),
      `${move!.type.replace('_', ' ')} -> "${entry.text.slice(0, 70)}${entry.text.length > 70 ? '…' : ''}"`, false));
  }
  return out;
}
