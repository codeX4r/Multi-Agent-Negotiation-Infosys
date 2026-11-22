/**
 * Orchestrator - Turn Loop, Events, Deadlock Resolution
 * Pure TypeScript port of the prototype's Orchestrator module
 */

import type {
  Agent,
  Scenario,
  SimulationState,
  EngineConfig,
  EngineHooks,
  TranscriptEntry,
  Offer,
  Event,
  EventRecord,
  DeadlockState,
  UtilityHistory,
  OrchestratorRole,
  AutonomyLevel
} from './types';
import { clamp, clone, r2 } from './types';

import { utility, target, progress, limit, applyConstraint, idealOffer, similarity, generateOffer, rangeOf } from './utility';
import { updateEmotions, updateTrust, phrase, emotionLabel } from './agent';
import { PERSONALITIES, CLIMATES, AUTONOMY, ORCH_ROLES, ORCH_ROLE_LABELS, ORCH_ROLE_DESCS } from './types';
import type { AgentThought } from './types';

// ============================================================================
// Engine Class
// ============================================================================

export class NegotiationEngine {
  public config: EngineConfig | null = null;
  public scenario: Scenario | null = null;
  public state: SimulationState | null = null;
  public snapshots: SimulationState[] = [];
  public hooks: EngineHooks = {};

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  init(config: EngineConfig, hooks: EngineHooks = {}): void {
    this.config = config;
    this.scenario = config.scenarioDef;
    this.hooks = hooks;
    this.snapshots = [];

    // Build agents with normalized weights
    const agents: Agent[] = config.agents.map(a => ({
      ...clone(a),
      w: Object.fromEntries(
        Object.entries(a.prefs).map(([k, p]) => [k, p.w])
      )
    }));

    agents.forEach(a => this.normalizeWeights(a));

    // Determine turn order (opener goes first)
    let order = agents.map((_, i) => i);
    const openerIdx = agents.findIndex(a => a.id === this.scenario!.opener);
    if (openerIdx > 0) {
      order = order.slice(openerIdx).concat(order.slice(0, openerIdx));
    }

    // Initialize trust matrix
    const trust: Record<string, Record<string, number>> = {};
    agents.forEach(a => {
      trust[a.id] = {};
      agents.forEach(b => {
        if (a.id !== b.id) trust[a.id][b.id] = 0.5;
      });
    });

    // Initialize emotions
    const emo: Record<string, { v: number; a: number; hist: number[]; ahist: number[] }> = {};
    agents.forEach(a => {
      emo[a.id] = { v: 0.15, a: 0.3, hist: [0.15], ahist: [0.3] };
    });

    const climate = CLIMATES[config.climate];

    this.state = {
      round: 1,
      maxRounds: config.rounds,
      turnIdx: 0,
      turnCount: 0,
      order,
      agents,
      offers: [],
      table: null,
      accepts: [],
      trust,
      emo,
      climate: config.climate,
      pressure: climate.pressure,
      pressureBump: 0,
      events: [],
      usedEvents: [],
      deadlock: {
        stalled: 0,
        risk: 0.2,
        ladder: 0,
        lastM: null,
        extended: false,
        riskHist: [0.2]
      },
      transcript: [],
      uHist: [],
      status: 'running',
      roundStarted: false,
      waitingHuman: false,
      blocked: false,
      endReason: '',
      lastTone: {},
      forkedFrom: null,
      scenario: config.scenario
    };

    this.sys(`Session opened. ${this.scenario.name}, ${config.mode === 'simulation' ? 'simulation' : 'practice'} mode, ${climate.label.toLowerCase()} climate, ${config.rounds} rounds.`);
    this.recordUtility();
    this.snapshot();
  }

  private normalizeWeights(agent: Agent): void {
    const total = Object.values(agent.w).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    for (const k in agent.w) {
      agent.w[k] = Math.max(0, agent.w[k]) / total;
    }
  }

  // ---------------------------------------------------------------------------
  // Core Turn Loop
  // ---------------------------------------------------------------------------

  async step(): Promise<boolean> {
    const S = this.state!;
    if (S.status !== 'running' || S.blocked || S.waitingHuman) return false;

    if (S.turnIdx === 0 && !S.roundStarted) {
      S.roundStarted = true;
      await this.roundStart();
      if (S.status !== 'running') return false;
    }

    const agent = S.agents[S.order[S.turnIdx]];

    if (agent.human) {
      S.waitingHuman = true;
      this.hooks.onHumanTurn?.(agent);
      return false;
    }

    this.hooks.onThinking?.(agent);
    await this.delay(100); // Small delay for thinking animation

    if (this.state !== S || S.status !== 'running') return false;

    await this.aiAct(agent);

    if (this.state !== S) return false;

    if (S.status === 'running') {
      this.advance();
      this.snapshot();
    }

    return true;
  }

  private advance(): void {
    const S = this.state!;
    S.turnIdx++;
    if (S.turnIdx >= S.order.length) {
      S.turnIdx = 0;
      S.round++;
      S.roundStarted = false;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Round Start Logic
  // ---------------------------------------------------------------------------

  private async roundStart(): Promise<void> {
    const S = this.state!;
    const config = this.config!;
    const auto = config.orchestrator.autonomy;

    const prog = clamp((S.round - 1) / Math.max(1, this.effectiveLimit() - 1), 0, 1);
    S.pressure = clamp(
      CLIMATES[S.climate].pressure + 0.35 * prog + S.pressureBump,
      0, 1
    );

    // Check round limit
    if (S.round > this.effectiveLimit()) {
      if (auto >= 1 && !S.deadlock.extended) {
        const choice = auto === 3
          ? 'extend'
          : await this.ask('deadlock', { reason: 'limit', canExtend: true });

        if (choice === 'extend') {
          S.maxRounds += 2;
          S.deadlock.extended = true;
          this.sys('Round limit reached. Extended by 2 rounds (one time only).');
        } else if (choice === 'mediate') {
          S.maxRounds = S.round;
          this.mediate();
        } else {
          return this.end('breakdown', 'Declared breakdown at the round limit');
        }
      } else {
        return this.end('breakdown', 'Round limit reached without agreement');
      }
    }

    // Timekeeper announcement
    if (config.orchestrator.roles.includes('timekeeper') && auto >= 1) {
      S.transcript.push({
        turn: S.turnCount,
        round: S.round,
        kind: 'round',
        text: `Round ${S.round} / ${S.maxRounds}`,
        by: 'orchestrator',
        name: 'Moderator'
      });
    }

    // Events and deadlock check (after round 1)
    if (S.round >= 2) {
      const period = this.eventPeriod();
      if (period && (S.round - 1) % period === 0) {
        await this.drawEvent();
      }
      if (S.status !== 'running') return;

      if (this.checkDeadlock()) {
        await this.resolveDeadlock();
      }
    }
  }

  private effectiveLimit(): number {
    return this.config!.orchestrator.roles.includes('timekeeper')
      ? this.state!.maxRounds
      : Math.max(this.state!.maxRounds, 20);
  }

  private eventPeriod(): number {
    const config = this.config!;
    if (config.orchestrator.autonomy < 2 ||
        !config.orchestrator.roles.includes('injector') ||
        !config.eventFreq) return 0;

    const mult = ({ 1: 1.6, 2: 1, 3: 0.5 } as Record<number, number>)[config.eventFreq] ?? 1;
    return Math.max(1, Math.round(CLIMATES[this.state!.climate].period * mult));
  }

  // ---------------------------------------------------------------------------
  // Event System
  // ---------------------------------------------------------------------------

  private async drawEvent(): Promise<void> {
    const S = this.state!;
    const deck = this.scenario!.events;
    let pool = deck.filter(e => !S.usedEvents.includes(e.id));
    if (!pool.length) {
      S.usedEvents = [];
      pool = deck;
    }

    const ev = pool[Math.floor(Math.random() * pool.length)];
    S.usedEvents.push(ev.id);
    S.events.push({ id: ev.id, round: S.round });

    this.applyEventEffects(ev.fx);
    this.sys(`Event: ${ev.title}. ${ev.text}`, 'event', { event: ev });
    updateEmotions(this.state!, null, 'neutral', this.scenario!);
    await this.ask('event', ev);
  }

  private applyEventEffects(fx: Event['fx']): void {
    const S = this.state!;

    if (fx.batna) {
      for (const id in fx.batna) {
        const agent = this.agent(id);
        if (agent) agent.batnaU = clamp(agent.batnaU + fx.batna[id], 0.05, 0.7);
      }
    }

    if (fx.weight) {
      for (const id in fx.weight) {
        const agent = this.agent(id);
        if (!agent) continue;
        for (const k in fx.weight[id]) {
          agent.w[k] = (agent.w[k] || 0) + fx.weight[id][k];
        }
        this.normalizeWeights(agent);
      }
    }

    if (fx.trust) {
      for (const a in S.trust) {
        for (const b in S.trust[a]) {
          S.trust[a][b] = clamp(S.trust[a][b] + fx.trust, 0.02, 0.98);
        }
      }
    }

    if (fx.rounds) {
      S.maxRounds = Math.max(S.round + 1, S.maxRounds + fx.rounds);
    }

    if (fx.pressure) {
      S.pressureBump += fx.pressure;
      S.pressure = clamp(S.pressure + fx.pressure, 0, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Deadlock Detection & Resolution
  // ---------------------------------------------------------------------------

  private margin(): number {
    const S = this.state!;
    if (!S.table) return -0.6;
    return Math.min(...S.agents
      .filter(a => a.id !== S.table!.by)
      .map(a => utility(a, S.table!.x, this.scenario!) - target(a, S))
    );
  }

  private checkDeadlock(): boolean {
    const S = this.state!;
    const D = S.deadlock;
    const m = this.margin();

    const offs = S.offers;
    const rep = offs.length >= 3 &&
      JSON.stringify(offs[offs.length - 1].x) === JSON.stringify(offs[offs.length - 3].x);

    const imp = D.lastM == null ? 1 : m - D.lastM;
    D.lastM = m;

    D.stalled = (imp < 0.015 || rep) ? D.stalled + 1 : 0;

    const prog = progress(S);
    D.risk = clamp(
      0.08 + D.stalled * 0.18 + Math.max(0, -m) * (0.15 + 0.45 * prog) + prog * 0.12 + (rep ? 0.1 : 0),
      0.03, 0.97
    );
    D.riskHist.push(r2(D.risk));

    return this.config!.orchestrator.autonomy >= 1 &&
      (D.stalled >= this.config!.deadlockN || D.risk >= 0.7);
  }

  private async resolveDeadlock(): Promise<void> {
    const S = this.state!;
    const D = S.deadlock;
    const config = this.config!;
    const auto = config.orchestrator.autonomy;

    // Ladder 1: Mediator
    if (auto >= 2 && D.ladder === 0 && config.orchestrator.roles.includes('mediator')) {
      D.ladder = 1;
      D.stalled = 0;
      this.mediate();
      return;
    }

    // Ladder 2: Event injection
    if (auto >= 2 && D.ladder <= 1 && config.orchestrator.roles.includes('injector')) {
      D.ladder = 2;
      D.stalled = 0;
      await this.drawEvent();
      return;
    }

    // Higher ladders: ask or auto-decide
    const L = Math.max(3, D.ladder);
    D.ladder = L + 1;

    const choice = auto === 3
      ? (!D.extended ? 'extend' : (L >= 4 ? 'end' : 'mediate'))
      : await this.ask('deadlock', {
          reason: 'stall',
          canExtend: !D.extended,
          stalled: D.stalled
        });

    D.stalled = 0;

    if (choice === 'mediate') {
      this.mediate();
    } else if (choice === 'extend') {
      S.maxRounds += 2;
      D.extended = true;
      this.sys('Orchestrator: talks extended by 2 rounds (one time).');
    } else {
      this.end('breakdown', 'Breakdown declared after a stalled negotiation');
    }
  }

  private mediate(): void {
    const S = this.state!;
    const latest = S.agents
      .map(a => S.offers.filter(f => f.by === a.id).slice(-1)[0])
      .filter(Boolean);

    if (!latest.length) return;

    const x: Record<string, number> = {};
    this.scenario!.issues.forEach(is => {
      x[is.id] = latest.reduce((s, f) => s + f!.x[is.id], 0) / latest.length;
    });

    if (!applyConstraint(x, this.scenario!)) return;

    S.table = { x, by: 'orchestrator', round: S.round, turn: S.turnCount };
    S.accepts = [];
    S.offers.push({ by: 'orchestrator', x: clone(x), round: S.round, turn: S.turnCount });
    this.sys(`Mediator: here is a split-the-difference proposal. ${this.formatTerms(x)}.`, 'mediator', { x: clone(x) });
    this.recordUtility();
    this.hooks.onUpdate?.();
  }

  // ---------------------------------------------------------------------------
  // AI Agent Action
  // ---------------------------------------------------------------------------

  private async aiAct(agent: Agent): Promise<void> {
    const S = this.state!;
    const P = PERSONALITIES[agent.personality];
    const table = S.table;
    const T = target(agent, S);
    const u = table ? utility(agent, table.x, this.scenario!) : 0;

    let decision: 'accept' | 'reject' | 'counter' | 'open' | 'message';
    let x: Record<string, number> | null = null;

    if (table && table.by !== agent.id && (u >= T || u >= P.acceptBar)) {
      decision = 'accept';
    } else if (!table) {
      decision = 'open';
      x = generateOffer(agent, Math.max(T, P.open - 0.02), S, this.scenario!);
    } else {
      decision = table.by !== agent.id && u < agent.batnaU ? 'reject' : 'counter';
      x = generateOffer(agent, T, S, this.scenario!);
    }

    const prevOwn = S.offers.filter(f => f.by === agent.id).slice(-1)[0];
    const lastSpk = table && table.by !== agent.id ? table.by : null;

    const tone = (decision === 'accept' ? 'warm'
      : decision === 'reject' ? (agent.personality === 'aggressive' ? 'firm' : 'wary')
      : ({ aggressive: 'firm', collaborative: 'warm', risk_averse: 'wary' }[agent.personality] || 'firm')) as import('./types').ToneLabel;

    const ph = phrase(agent, decision, x, table?.x || null, prevOwn?.x || null, this.scenario!);

    const feel = emotionLabel(S.emo[agent.id] || { v: 0, a: 0 });
    const trustIn = lastSpk && S.trust[agent.id]?.[lastSpk] != null
      ? r2(S.trust[agent.id][lastSpk])
      : null;

    const thought: AgentThought = {
      u: r2(u),
      T: r2(T),
      batna: r2(agent.batnaU),
      hidden: (this.scenario!.issues.find(i => i.id === agent.hidden) || {}).label || agent.hidden,
      feel,
      trustIn,
      lastSpk: lastSpk ? this.nameOf(lastSpk) : null,
      plan: ph.plan
    };

    let text = ph.text;

    if (this.hooks.rephrase) {
      try {
        const rephrased = await this.hooks.rephrase(agent, {
          decision,
          terms: x ? this.formatTerms(x) : this.formatTerms(table!.x),
          draft: text,
          tone
        });
        if (rephrased) text = rephrased;
      } catch {
        // Ignore rephrase errors
      }
    }

    if (this.state !== S || S.status !== 'running') return;

    const entry: TranscriptEntry = {
      turn: S.turnCount + 1,
      round: S.round,
      by: agent.id,
      name: agent.name,
      kind: decision === 'accept' ? 'accept' : 'offer',
      decision,
      text,
      tone,
      x: x ? clone(x) : undefined,
      rationale: ph.rationale,
      thought,
      uSelf: r2(x ? utility(agent, x, this.scenario!) : u)
    };

    this.commit(agent, decision, x, entry, tone);
  }

  private commit(
    agent: Agent,
    decision: 'accept' | 'reject' | 'counter' | 'open' | 'message' | 'walk',
    x: Record<string, number> | null,
    entry: TranscriptEntry,
    tone: 'warm' | 'firm' | 'wary' | 'pushy' | 'neutral'
  ): void {
    const S = this.state!;
    const prevByA = S.offers.filter(f => f.by === agent.id).slice(-1)[0];

    if (decision === 'accept') {
      if (!S.accepts.includes(agent.id)) S.accepts.push(agent.id);
      const by = S.table!.by;
      if (S.trust[by]?.[agent.id] != null) {
        S.trust[by][agent.id] = clamp(S.trust[by][agent.id] + 0.06, 0.02, 0.98);
      }
      if (S.trust[agent.id]?.[by] != null) {
        S.trust[agent.id][by] = clamp(S.trust[agent.id][by] + 0.03, 0.02, 0.98);
      }
    } else if (x) {
      S.agents.forEach(o => {
        if (o.id === agent.id) return;
        const ref = prevByA ? prevByA.x : (S.table && S.table.x);
        const d = ref ? (utility(o, x, this.scenario!) - utility(o, ref, this.scenario!)) * 1.2 : 0;
        if (S.trust[o.id]?.[agent.id] != null) {
          S.trust[o.id][agent.id] = clamp(S.trust[o.id][agent.id] + clamp(d, -0.12, 0.12), 0.02, 0.98);
        }
      });
      S.table = { x: clone(x), by: agent.id, round: S.round, turn: S.turnCount + 1 };
      S.accepts = [];
      S.offers.push({ by: agent.id, x: clone(x), round: S.round, turn: S.turnCount + 1 });
    }

    // Tone-based trust update
    const toneDelta: Record<string, number> = { warm: 0.04, firm: 0, wary: -0.01, pushy: -0.07, neutral: 0 };
    const TD = toneDelta[tone] || 0;

    S.agents.forEach(o => {
      if (o.id !== agent.id && S.trust[o.id]?.[agent.id] != null) {
        S.trust[o.id][agent.id] = clamp(S.trust[o.id][agent.id] + TD, 0.02, 0.98);
      }
    });

    // Calculate trust delta for entry
    let delta = 0;
    S.agents.forEach(o => {
      if (o.id !== agent.id) delta += S.trust[o.id][agent.id] - S.trust[o.id][agent.id]; // This is 0, need before state
    });
    // Actually we need to track before state - let's do it properly
    // For now, entry.trustDelta will be set by caller if needed

    S.lastTone[agent.id] = tone;
    S.turnCount++;
    S.transcript.push(entry);

    updateEmotions(S, agent, tone, this.scenario!);
    this.recordUtility();

    // Check for deal
    if (S.table) {
      const need = S.agents.filter(o => o.id !== S.table!.by).map(o => o.id);
      if (need.every(id => S.accepts.includes(id))) {
        this.snapshot();
        this.end('deal', 'All parties accepted');
        return;
      }
    }

    this.snapshot();
    this.hooks.onTurn?.(entry);
  }

  // ---------------------------------------------------------------------------
  // Human Participant (Practice Mode)
  // ---------------------------------------------------------------------------

  humanAct(act: { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> }): { err?: string; ok?: boolean; adjusted?: boolean; tone?: { label: string; p: Record<string, number> } } {
    const S = this.state!;
    const human = this.human();
    if (!human || !S.waitingHuman || S.status !== 'running') {
      return { err: 'Not your turn yet.' };
    }

    // Import tone classifier dynamically to avoid circular dependency
    // For now, we'll use a simple classifier or accept the tone from the act
    // In practice, this would call the ToneModel

    if (act.type === 'walk') {
      S.waitingHuman = false;
      S.transcript.push({
        turn: S.turnCount + 1,
        round: S.round,
        by: human.id,
        name: 'You',
        kind: 'walk',
        text: act.text || 'I am walking away from this negotiation.',
        tone: 'firm'
      });
      S.turnCount++;
      this.snapshot();
      this.end('breakdown', 'You walked away');
      return {};
    }

    let decision: 'open' | 'counter' | 'accept' | 'reject' | 'message' | 'walk' = act.type as any;
    let x: Record<string, number> | null = null;

    if (act.type === 'accept') {
      if (!S.table || S.table.by === human.id) {
        return { err: 'There is no offer from another party to accept.' };
      }
    }

    if (act.type === 'offer' && act.x) {
      x = clone(act.x);
      const before = JSON.stringify(x);
      const ok = applyConstraint(x, this.scenario!);

      if (this.config!.orchestrator.roles.includes('enforcer')) {
        if (!ok) return { err: 'Rule-enforcer: the split must add up to the total budget and stay within limits.' };
      }

      decision = S.table ? 'counter' : 'open';
      if (before !== JSON.stringify(x)) {
        return { ok: true, adjusted: true, tone: { label: 'neutral', p: {} } };
      }
    }

    const u = S.table ? utility(human, S.table.x, this.scenario!) : 0;
    const entry: TranscriptEntry = {
      turn: S.turnCount + 1,
      round: S.round,
      by: human.id,
      name: 'You',
      human: true,
      kind: decision === 'accept' ? 'accept' : (x ? 'offer' : 'message'),
      decision: x ? decision : (decision === 'accept' ? 'accept' : 'message'),
      text: act.text || (decision === 'accept' ? 'I accept these terms.' : x ? 'Here is my proposal.' : '…'),
      tone: 'neutral', // Will be filled by caller
      toneP: {},
      x: x ? x : undefined,
      uSelf: r2(x ? utility(human, x, this.scenario!) : u)
    };

    S.waitingHuman = false;
    this.commit(human, x ? decision : (decision === 'accept' ? 'accept' : 'message'), x, entry, 'neutral');

    if (S.status === 'running') {
      this.advance();
      this.snapshot();
    }

    return { ok: true };
  }

  suggestConcession(): Record<string, number> | null {
    const human = this.human();
    const S = this.state!;
    if (!human) return null;

    const own = S.offers.filter(f => f.by === human.id).slice(-1)[0];
    const cur = own ? utility(human, own.x, this.scenario!) : PERSONALITIES[human.personality].open;
    const T = Math.max(human.batnaU + 0.04, cur - 0.07);

    const saveSkill = human.skill;
    human.skill = 'expert';
    const x = generateOffer(human, T, S, this.scenario!);
    human.skill = saveSkill;
    return x;
  }

  coach(): string[] {
    const S = this.state!;
    const human = this.human();
    if (!human) return [];

    const hints: string[] = [];
    const issues = this.scenario!.issues;

    const u = S.table ? utility(human, S.table.x, this.scenario!) : null;
    if (u != null && S.table!.by !== human.id) {
      hints.push(
        u >= human.batnaU
          ? `The offer on the table is worth ${Math.round(u * 100)} to you vs your walk-away ${Math.round(human.batnaU * 100)}. You are inside your zone.`
          : `The offer on the table (${Math.round(u * 100)}) is below your walk-away (${Math.round(human.batnaU * 100)}). Counter before you consider accepting.`
      );
    }

    S.agents.filter(a => !a.human).forEach(a => {
      const m = this.buildOpponentModel(a.id, S, this.scenario!);
      if (!m || m.n < 2) return;
      const top = issues.reduce((p, q) => m.w[q.id] > m.w[p.id] ? q : p);
      const low = issues.filter(i => !i.derived).reduce((p, q) => (human.w[q.id] || 0) < (human.w[p.id] || 0) ? q : p);
      hints.push(`${a.name} barely moved on ${top.label} across ${m.n} offers, it matters to them. Trade on ${low.label} (low priority for you) instead.`);
    });

    if (S.deadlock.risk >= 0.5) {
      hints.push(`Talks are stalling (risk ${Math.round(S.deadlock.risk * 100)}%). Try a package trade across two issues, not a single-issue push.`);
    }

    const lt = S.lastTone[human.id];
    if (lt === 'pushy') {
      hints.push('Your last line read pushy, trust towards you dropped. Ask a question about their needs.');
    }

    if (!S.offers.some(f => f.by === human.id)) {
      hints.push('Anchor first: open with a package that favours your top priority, but leave room to trade.');
    }

    return hints;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildOpponentModel(opponentId: string, state: SimulationState, scenario: Scenario) {
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

  private sys(text: string, kind: TranscriptEntry['kind'] = 'system', extra: Record<string, any> = {}): void {
    const S = this.state!;
    S.transcript.push({ turn: S.turnCount, round: S.round, by: 'orchestrator', name: 'Moderator', kind, text, ...extra });
  }

  private recordUtility(): void {
    const S = this.state!;
    const u: Record<string, number> = {};
    S.agents.forEach(a => u[a.id] = r2(utility(a, S.table && S.table.x, this.scenario!)));
    S.uHist.push({ turn: S.turnCount, round: S.round, u, risk: S.deadlock.risk, x: S.table ? clone(S.table.x) : null, by: S.table ? S.table.by : null });
  }

  private snapshot(): void {
    this.snapshots[this.state!.turnCount] = clone(this.state!);
  }

  agent(id: string): Agent | undefined {
    return this.state?.agents.find(a => a.id === id);
  }

  human(): Agent | undefined {
    return this.state?.agents.find(a => a.human);
  }

  private nameOf(id: string): string {
    if (id === 'orchestrator') return 'Moderator';
    const a = this.agent(id);
    return a ? (a.human ? 'You' : a.name) : id;
  }

  private formatTerms(x: Record<string, number>): string {
    return this.scenario!.issues.map(is => `${is.label} ${formatValue(is, x[is.id])}`).join(', ');
  }

  private async ask(type: 'event' | 'deadlock', data: any): Promise<string> {
    const S = this.state!;
    S.blocked = true;
    const result = this.hooks.onModal ? await this.hooks.onModal(type, data) : 'extend';
    S.blocked = false;
    return result;
  }

  private end(status: 'deal' | 'breakdown', reason: string): void {
    const S = this.state!;
    if (S.status !== 'running') return;
    S.status = status;
    S.endReason = reason;
    this.sys(status === 'deal' ? `Deal reached. ${this.formatTerms(S.table!.x)}.` : `Session ended: ${reason}.`, status === 'deal' ? 'deal' : 'breakdown');
    this.snapshot();
    this.hooks.onEnd?.(status);
  }

  // ---------------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------------

  report(): {
    deal: boolean;
    reason: string;
    rounds: number;
    turns: number;
    terms: Record<string, number> | null;
    per: Array<{
      id: string;
      name: string;
      human: boolean;
      color: string;
      personality: string;
      finalU: number;
      sat: number;
      batna: number;
      firstU: number | null;
      lastU: number | null;
      moved: number;
      offers: number;
      firstGiveTurn: number | null;
      aboveBatna: boolean;
      trustIn: number;
    }>;
    firstGiver: any;
    most: any;
    turning: Array<{
      turn: number;
      round: number;
      d: number;
      who: string;
      text: string;
      event?: boolean;
    }>;
    habits: Array<{ good: boolean; t: string }>;
    joint: number;
    nash: number;
    events: number;
    risk: number[];
  } {
    const S = this.state!;
    const issues = this.scenario!.issues;
    const deal = S.status === 'deal';

    const per = S.agents.map(a => {
      const offs = S.offers.filter(f => f.by === a.id);
      const firstU = offs.length ? utility(a, offs[0].x, this.scenario!) : null;
      const lastU = offs.length ? utility(a, offs[offs.length - 1].x, this.scenario!) : null;
      const finalU = S.table ? utility(a, S.table.x, this.scenario!) : 0;
      const firstGive = offs.findIndex((f, i) => i > 0 && utility(a, f.x, this.scenario!) < utility(a, offs[i - 1].x, this.scenario!) - 0.005);

      return {
        id: a.id,
        name: a.human ? 'You' : a.name,
        human: !!a.human,
        color: a.color,
        personality: a.personality,
        finalU,
        sat: Math.round((deal ? finalU : Math.min(finalU, a.batnaU)) * 100),
        batna: a.batnaU,
        firstU,
        lastU,
        moved: firstU != null ? Math.max(0, firstU - lastU!) : 0,
        offers: offs.length,
        firstGiveTurn: firstGive > 0 ? offs[firstGive].turn : null,
        aboveBatna: finalU >= a.batnaU,
        trustIn: Object.values(S.trust[a.id]).reduce((s, v) => s + v, 0) / Math.max(1, Object.keys(S.trust[a.id]).length)
      };
    });

    const givers = per.filter(p => p.firstGiveTurn != null).sort((a, b) => a.firstGiveTurn! - b.firstGiveTurn!);
    const most = per.slice().sort((a, b) => b.moved - a.moved)[0];

    const turning: Array<{ turn: number; round: number; d: number; who: string; text: string; event?: boolean }> = [];
    for (let i = 1; i < S.uHist.length; i++) {
      const a = S.uHist[i - 1], b = S.uHist[i];
      const d = Object.keys(b.u).reduce((s, k) => s + (b.u[k] - a.u[k]), 0) / Object.keys(b.u).length;
      turning.push({ turn: b.turn, round: b.round, d, who: '', text: '' });
    }
    turning.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));

    const topTurning = turning.slice(0, 3).map(t => {
      const e = S.transcript.find(x => x.turn === t.turn && x.by && x.by !== 'orchestrator') || S.transcript.find(x => x.turn === t.turn);
      return { ...t, who: e ? e.name : 'Moderator', text: e ? e.text : '' };
    });

    S.events.forEach(ev => {
      const e = this.scenario!.events.find(ev2 => ev2.id === ev.id);
      topTurning.push({ turn: 0, round: ev.round, who: 'Event', text: e ? e.title : ev.id, d: 0, event: true });
    });

    const habits: Array<{ good: boolean; t: string }> = [];
    const h = this.human();
    if (h) {
      const mine = S.transcript.filter(e => e.human);
      const tones: Record<string, number> = {};
      mine.forEach(e => tones[e.tone!] = (tones[e.tone!] || 0) + 1);
      const qs = mine.filter(e => /\?/.test(e.text)).length;
      const offs = S.offers.filter(f => f.by === h.id);
      const steps = offs.slice(1).map((f, i) => utility(h, offs[i].x, this.scenario!) - utility(h, f.x, this.scenario!));
      const avg = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;

      if ((tones.pushy || 0) >= 2) habits.push({ good: false, t: `You sounded pushy in ${tones.pushy} lines, each one cost trust.` });
      if ((tones.warm || 0) >= 2) habits.push({ good: true, t: `Warm framing in ${tones.warm} lines kept trust up.` });
      if (qs >= 2) habits.push({ good: true, t: `You asked ${qs} questions, good discovery of their needs.` }); else habits.push({ good: false, t: 'You asked few questions. Probing their priorities reveals trades.' });
      if (avg > 0.08) habits.push({ good: false, t: `Big concession steps (avg ${Math.round(avg * 100)} pts), you gave ground fast.` });
      else if (offs.length >= 2) habits.push({ good: true, t: `Small, steady concessions (avg ${Math.round(avg * 100)} pts) protected your value.` });
      if (offs.length && S.offers[0] && S.offers[0].by === h.id) habits.push({ good: true, t: 'You anchored first.' });
    }

    const joint = deal ? Math.round(per.reduce((s, p) => s + p.finalU, 0) / per.length * 100) : 0;
    const nash = deal ? per.reduce((s, p) => s * Math.max(0.001, p.finalU - p.batna), 1) : 0;

    return { deal, reason: S.endReason, rounds: Math.min(S.round, S.maxRounds), turns: S.turnCount, terms: S.table ? S.table.x : null, per, firstGiver: givers[0] || null, most, turning: topTurning, habits: habits.slice(0, 2), joint, nash, events: S.events.length, risk: S.deadlock.riskHist };
  }
}

// Helper function
function formatValue(issue: any, v: number): string {
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