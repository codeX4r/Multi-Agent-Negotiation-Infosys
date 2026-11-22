import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Agent, SimulationState } from '@/engine/types';
import { buildEngineConfig } from '@/engine/simulation';
import { SCENARIOS } from '@/engine/scenarios';
import {
  adaptBackendResult,
  BackendUnavailableError,
  buildBackendScenarioConfig,
  buildBackendVendorConfig,
  mapBackendVendorTerms,
  runBackendNegotiation,
  runBackendScenarioNegotiation,
} from '@/lib/backendAdapter';

const vendor: Agent = {
  id: 'vendor',
  name: 'Vendor',
  title: 'Senior sales rep',
  persona: '',
  goal: '',
  constraints: [],
  batnaText: '',
  batnaU: 0.3,
  hidden: '',
  personality: 'risk_averse',
  skill: 'skilled',
  prefs: {},
  w: {},
  color: '#fff',
  seat: 1,
  human: false,
  mindReveal: true,
  revealBatna: false,
};

const buyer: Agent = { ...vendor, id: 'buyer', name: 'Buyer', seat: 2 };

const baseState = {
  round: 0,
  maxRounds: 8,
  turnIdx: 0,
  turnCount: 0,
  order: [0, 1, 2],
  agents: [buyer, vendor, { ...buyer, id: 'finance', name: 'Finance', seat: 3 }],
  offers: [],
  table: null,
  accepts: [],
  trust: {},
  emo: {},
  climate: 'volatile',
  pressure: 0.32,
  pressureBump: 0,
  events: [],
  usedEvents: [],
  deadlock: { stalled: 0, risk: 0, ladder: 0, lastM: null, extended: false, riskHist: [] },
  transcript: [],
  uHist: [],
  status: 'running',
  roundStarted: false,
  waitingHuman: false,
  blocked: false,
  endReason: '',
  lastTone: {},
  forkedFrom: null,
  scenario: 'vendor',
} as SimulationState;

const response = {
  scenario: 'vendor',
  outcome: 'deal',
  outcome_reason: 'Vendor accepted at round 2.',
  rounds: 2,
  final_terms: { price: 1100000, delivery_days: 25, warranty_months: 18, payment_days: 30 },
  satisfaction: { Vendor: 0.8, Buyer: 0.7 },
  personalities: { Supplier: 'aggressive', Buyer: 'collaborative', Finance: 'risk_averse' },
  parties: [
    { id: 'vendor', role: 'Supplier', personality: 'aggressive', skill: 'skilled' },
    { id: 'buyer', role: 'Buyer', personality: 'collaborative', skill: 'skilled' },
    { id: 'finance', role: 'Finance', personality: 'risk_averse', skill: 'skilled' },
  ],
  transcript: [
    {
      round: 0,
      speaker: 'Supplier',
      decision: 'open',
      utility: 1,
      message: 'Opening proposal.',
      offer: { price: 1200000, delivery_days: 35, warranty_months: 12, payment_days: 45 },
      reasoning: 'Starting position.',
    },
    {
      round: 2,
      speaker: 'Buyer',
      decision: 'accept',
      utility: 0.7,
      message: 'Accepted.',
      offer: null,
      reasoning: 'Within limits.',
    },
    {
      round: 2,
      speaker: 'Finance',
      speaker_id: 'finance',
      decision: 'accept',
      utility: 0.7,
      message: 'Accepted.',
      offer: null,
      reasoning: 'Within limits.',
    },
  ],
} satisfies Parameters<typeof adaptBackendResult>[0];

describe('backend adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps backend term fields to frontend aliases', () => {
    expect(mapBackendVendorTerms({
      price: 100,
      delivery_days: 20,
      warranty_months: 12,
      payment_days: 30,
    })).toEqual({
      pricePerUnit: 100,
      deliveryDays: 20,
      warrantyMonths: 12,
      paymentDays: 30,
    });
  });

  it('builds the backend config from the selected Vendor seats and issue definitions', () => {
    const engineConfig = buildEngineConfig({
      scenarioId: 'vendor',
      mode: 'simulation',
      seats: ['vendor', 'buyer', 'finance'],
      human: -1,
      climate: 'volatile',
      eventFreq: 2,
      rounds: 10,
      deadlockN: 2,
      backdrop: 'tradefloor',
      roles: [],
      autonomy: 2,
    });
    engineConfig.agents[0].personality = 'collaborative';

    expect(buildBackendVendorConfig(engineConfig)).toMatchObject({
      opener_id: 'vendor',
      rounds_limit: 10,
      deadlock_after_stalled_rounds: 2,
      issues: [
        { id: 'price', min: 900000, max: 1300000, step: 10000 },
        { id: 'delivery', min: 10, max: 45, step: 1 },
        { id: 'warranty', min: 6, max: 36, step: 6 },
        { id: 'payment', min: 0, max: 60, step: 15 },
      ],
      parties: [
        { id: 'vendor', personality: 'collaborative', skill: 'skilled' },
        { id: 'buyer', personality: 'collaborative', skill: 'skilled' },
        { id: 'finance', personality: 'risk_averse', skill: 'skilled' },
      ],
    });
  });

  it('builds a three-party Job config with the frontend limits and opener', () => {
    const scenario = SCENARIOS.job;
    const config = buildBackendScenarioConfig(buildEngineConfig({
      scenarioId: 'job',
      mode: 'simulation',
      seats: scenario.roles.map((role) => role.id),
      human: -1,
      climate: 'stable',
      eventFreq: 6,
      rounds: 12,
      deadlockN: 3,
      backdrop: 'glassoffice',
      roles: [],
      autonomy: 2,
    }));

    expect(config.opener_id).toBe('recruiter');
    expect(config.parties.map(({ id, role }) => [id, role])).toEqual([
      ['candidate', 'Candidate'],
      ['recruiter', 'Recruiter'],
      ['manager', 'Hiring Mgr'],
    ]);
    expect(config.issues).toEqual([
      { id: 'salary', min: 12, max: 24, step: 0.5 },
      { id: 'bonus', min: 0, max: 3, step: 0.25 },
      { id: 'start', min: 2, max: 12, step: 1 },
      { id: 'remote', min: 0, max: 5, step: 1 },
    ]);
    expect(config.parties.map(({ id, target, walk_away }) => [id, target, walk_away])).toEqual([
      ['candidate',
        { salary: 22, bonus: 3, start: 8, remote: 4 },
        { salary: 15, bonus: 0, start: 3, remote: 1 }],
      ['recruiter',
        { salary: 14, bonus: 0, start: 3, remote: 2 },
        { salary: 21, bonus: 2.5, start: 10, remote: 4 }],
      ['manager',
        { salary: 15, bonus: 0, start: 2, remote: 1 },
        { salary: 22, bonus: 3, start: 8, remote: 4 }],
    ]);
  });

  it('builds Budget preferences that preserve all three shares and mark Operations as derived', () => {
    const scenario = SCENARIOS.budget;
    const config = buildBackendScenarioConfig(buildEngineConfig({
      scenarioId: 'budget',
      mode: 'simulation',
      seats: scenario.roles.map((role) => role.id),
      human: -1,
      climate: 'crisis',
      eventFreq: 1,
      rounds: 9,
      deadlockN: 2,
      backdrop: 'warroom',
      roles: [],
      autonomy: 2,
    }));

    expect(config.constraint).toEqual({
      type: 'sum',
      total: 50,
      derived: 'ops',
      of: ['eng', 'mkt'],
    });
    expect(config.issues.find(({ id }) => id === 'ops')).toMatchObject({
      min: 5,
      max: 28,
      step: 1,
      derived: true,
    });
    for (const party of config.parties) {
      expect(party.target.eng + party.target.mkt + party.target.ops).toBe(50);
      expect(party.walk_away.eng + party.walk_away.mkt + party.walk_away.ops).toBe(50);
    }
    expect(config.parties.map(({ id, target, walk_away }) => [
      id,
      target.eng,
      target.mkt,
      target.ops,
      target.timeline,
      walk_away.eng,
      walk_away.mkt,
      walk_away.ops,
      walk_away.timeline,
    ])).toEqual([
      ['eng', 28, 14, 8, 9, 14, 8, 28, 4],
      ['mkt', 20, 22, 8, 4, 12, 10, 28, 9],
      ['ops', 24, 8, 18, 7, 12, 30, 8, 3],
    ]);
  });

  it('maps backend turns to the Arena transcript and uses only backend participants', () => {
    const finance = { ...buyer, id: 'finance', name: 'Finance', seat: 3 };
    const update = adaptBackendResult(response, baseState, [vendor, buyer, finance]);

    expect(update.transcript.map(({ by, name, kind, decision, text }) => ({
      by, name, kind, decision, text,
    }))).toEqual([
      { by: 'vendor', name: 'Vendor', kind: 'offer', decision: 'open', text: 'Opening proposal.' },
      { by: 'buyer', name: 'Buyer', kind: 'accept', decision: 'accept', text: 'Accepted.' },
      { by: 'finance', name: 'Finance', kind: 'accept', decision: 'accept', text: 'Accepted.' },
    ]);
    expect(update.transcript[0].x).toEqual({
      price: 1200000,
      delivery: 35,
      warranty: 12,
      payment: 45,
    });
    expect(update.transcript[0].x).toHaveProperty('payment', 45);
    expect(update.state.agents.map((agent) => agent.id)).toEqual(['vendor', 'buyer', 'finance']);
    expect(update.tableOffer?.x).toEqual({
      price: 1100000,
      delivery: 25,
      warranty: 18,
      payment: 30,
    });
    expect(update.state.status).toBe('deal');
    expect(update.state.backendOutcome).toBe('deal');
    expect(update.state.endReason).toBe('Vendor accepted at round 2.');
    expect(update.state.accepts).toEqual(['buyer', 'finance']);
  });

  it('maps accepted parties on a non-deal result from their latest decisions', () => {
    const breakdownResult = {
      ...response,
      outcome: 'breakdown',
      outcome_reason: 'Finance rejected at round 3: payment terms were beyond their walk-away limit.',
      final_terms: null,
      personalities: { Supplier: 'aggressive', Buyer: 'collaborative', Finance: 'risk_averse' },
      parties: [
        { id: 'vendor', role: 'Supplier', personality: 'aggressive', skill: 'skilled' },
        { id: 'buyer', role: 'Buyer', personality: 'collaborative', skill: 'skilled' },
        { id: 'finance', role: 'Finance', personality: 'risk_averse', skill: 'skilled' },
      ],
      transcript: [
        response.transcript[0],
        response.transcript[1],
        {
          round: 3,
          speaker: 'Finance',
          speaker_id: 'finance',
          decision: 'reject',
          utility: 0.1,
          message: 'I cannot accept this.',
          offer: null,
          reasoning: 'Outside my limits.',
        },
      ],
    } satisfies Parameters<typeof adaptBackendResult>[0];

    const participants = [
      vendor,
      buyer,
      { ...buyer, id: 'finance', name: 'Finance', seat: 3 },
    ];
    const update = adaptBackendResult(breakdownResult, baseState, participants);

    expect(update.state.accepts).toEqual(['buyer']);
    expect(update.transcript.at(-1)?.decision).toBe('reject');
  });

  it('preserves deadlock as a distinct backend outcome', () => {
    const deadlockResult = {
      ...response,
      outcome: 'deadlock',
      outcome_reason: 'No agreement was reached within 12 rounds.',
      final_terms: null,
      personalities: { Supplier: 'aggressive', Buyer: 'collaborative', Finance: 'risk_averse' },
      parties: [
        { id: 'vendor', role: 'Supplier', personality: 'aggressive', skill: 'skilled' },
        { id: 'buyer', role: 'Buyer', personality: 'collaborative', skill: 'skilled' },
        { id: 'finance', role: 'Finance', personality: 'risk_averse', skill: 'skilled' },
      ],
    } satisfies Parameters<typeof adaptBackendResult>[0];

    const update = adaptBackendResult(deadlockResult, baseState, [vendor, buyer]);

    expect(update.state.status).toBe('breakdown');
    expect(update.state.backendOutcome).toBe('deadlock');
    expect(update.state.endReason).toBe('No agreement was reached within 12 rounds.');
  });

  it('maps Job terms and unanimous acceptance to all three Arena parties', () => {
    const participants = [
      { ...vendor, id: 'candidate', name: 'Candidate' },
      { ...buyer, id: 'recruiter', name: 'Recruiter' },
      { ...buyer, id: 'manager', name: 'Hiring Mgr', seat: 3 },
    ];
    const jobResult = {
      scenario: 'job',
      outcome: 'deal',
      outcome_reason: 'All parties accepted the offer at round 2.',
      rounds: 2,
      final_terms: { salary: 18, bonus: 1, start: 5, remote: 3 },
      satisfaction: { Candidate: 0.7, Recruiter: 0.6, 'Hiring Mgr': 0.7 },
      personalities: { Candidate: 'collaborative', Recruiter: 'collaborative', 'Hiring Mgr': 'risk_averse' },
      parties: [
        { id: 'candidate', role: 'Candidate', personality: 'collaborative', skill: 'skilled' },
        { id: 'recruiter', role: 'Recruiter', personality: 'collaborative', skill: 'skilled' },
        { id: 'manager', role: 'Hiring Mgr', personality: 'risk_averse', skill: 'skilled' },
      ],
      transcript: [
        {
          round: 0,
          speaker: 'Recruiter',
          speaker_id: 'recruiter',
          decision: 'open',
          utility: 0.9,
          message: 'Opening proposal.',
          offer: { salary: 18, bonus: 1, start: 5, remote: 3 },
          reasoning: 'Starting position.',
        },
        {
          round: 2,
          speaker: 'Candidate',
          speaker_id: 'candidate',
          decision: 'accept',
          utility: 0.7,
          message: 'Accepted.',
          offer: null,
          reasoning: 'Within limits.',
        },
        {
          round: 2,
          speaker: 'Hiring Mgr',
          speaker_id: 'manager',
          decision: 'accept',
          utility: 0.7,
          message: 'Accepted.',
          offer: null,
          reasoning: 'Within limits.',
        },
      ],
    } satisfies Parameters<typeof adaptBackendResult>[0];

    const update = adaptBackendResult(jobResult, { ...baseState, scenario: 'job' }, participants);

    expect(update.transcript[0].x).toEqual({ salary: 18, bonus: 1, start: 5, remote: 3 });
    expect(update.state.agents.map((agent) => agent.id)).toEqual([
      'candidate', 'recruiter', 'manager',
    ]);
    expect(update.state.accepts).toEqual(['candidate', 'manager']);
  });

  it('accepts older Vendor terms without payment_days', () => {
    const legacyResult = {
      ...response,
      final_terms: {
        price: response.final_terms.price,
        delivery_days: response.final_terms.delivery_days,
        warranty_months: response.final_terms.warranty_months,
      },
      personalities: { Supplier: 'aggressive', Buyer: 'collaborative', Finance: 'risk_averse' },
      parties: [
        { id: 'vendor', role: 'Supplier', personality: 'aggressive', skill: 'skilled' },
        { id: 'buyer', role: 'Buyer', personality: 'collaborative', skill: 'skilled' },
        { id: 'finance', role: 'Finance', personality: 'risk_averse', skill: 'skilled' },
      ],
      transcript: response.transcript.map((entry) => ({
        ...entry,
        offer: entry.offer && {
          price: entry.offer.price,
          delivery_days: entry.offer.delivery_days,
          warranty_months: entry.offer.warranty_months,
        },
      })),
    } as Parameters<typeof adaptBackendResult>[0];

    const update = adaptBackendResult(legacyResult, baseState, [vendor, buyer]);

    expect(update.transcript[0].x).not.toHaveProperty('payment');
    expect(update.tableOffer?.x).not.toHaveProperty('payment');
  });

  it('posts the expected request to the configured backend origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await runBackendNegotiation(vendor, buyer, 8);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/negotiate/run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          scenario: 'vendor',
          opener_personality: 'risk_averse',
          responder_personality: 'risk_averse',
          max_rounds: 8,
        }),
      }),
    );
  });

  it('includes the chosen Vendor config in the backend request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const config = buildBackendVendorConfig(buildEngineConfig({
      scenarioId: 'vendor',
      mode: 'simulation',
      seats: ['vendor', 'buyer', 'finance'],
      human: -1,
      climate: 'volatile',
      eventFreq: 2,
      rounds: 12,
      deadlockN: 3,
      backdrop: 'tradefloor',
      roles: [],
      autonomy: 2,
    }));

    await runBackendNegotiation(vendor, buyer, 12, undefined, config);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody.config).toEqual(config);
  });

  it('posts the selected Job config to the backend', async () => {
    const jobResponse = {
      scenario: 'job',
      outcome: 'deal',
      outcome_reason: 'All parties accepted the offer at round 3.',
      rounds: 3,
      final_terms: { salary: 18, bonus: 1, start: 5, remote: 3 },
      satisfaction: { Candidate: 0.7, Recruiter: 0.6, 'Hiring Mgr': 0.7 },
      transcript: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(jobResponse), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const scenario = SCENARIOS.job;
    const config = buildBackendScenarioConfig(buildEngineConfig({
      scenarioId: 'job',
      mode: 'simulation',
      seats: scenario.roles.map((role) => role.id),
      human: -1,
      climate: 'stable',
      eventFreq: 6,
      rounds: 12,
      deadlockN: 3,
      backdrop: 'glassoffice',
      roles: [],
      autonomy: 2,
    }));

    await runBackendScenarioNegotiation('job', config);

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(requestBody).toMatchObject({
      scenario: 'job',
      max_rounds: 12,
      config,
    });
  });

  it('identifies a network failure so the Arena can start its scripted fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(runBackendNegotiation(vendor, buyer, 8))
      .rejects.toBeInstanceOf(BackendUnavailableError);
  });
});
