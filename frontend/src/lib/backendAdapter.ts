import type {
  Agent,
  EngineConfig,
  Offer,
  SimulationState,
  TranscriptEntry,
} from '@/engine/types';
import { formatTurnReason } from '@/lib/backendResultPresentation';

export type BackendDecision = 'open' | 'counter' | 'accept' | 'reject';
export type BackendOutcome = 'deal' | 'breakdown' | 'deadlock';
type BackendPersonality = 'aggressive' | 'collaborative' | 'risk_averse';
export type BackendScenario = 'vendor' | 'job' | 'budget';

// Frontend UI scenario IDs (for display)
export type UISenarioId = 'vendor_pricing' | 'job_offer' | 'project_budget';

/** Map UI scenario IDs to backend canonical scenario IDs */
export function mapUIScenarioToBackend(ui: UISenarioId): BackendScenario {
  switch (ui) {
    case 'vendor_pricing': return 'vendor';
    case 'job_offer': return 'job';
    case 'project_budget': return 'budget';
  }
}

/** Map backend canonical scenario IDs to UI scenario IDs */
export function mapBackendScenarioToUI(backend: BackendScenario): UISenarioId {
  switch (backend) {
    case 'vendor': return 'vendor_pricing';
    case 'job': return 'job_offer';
    case 'budget': return 'project_budget';
  }
}

export interface BackendVendorTerms {
  pricePerUnit: number;
  deliveryDays: number;
  warrantyMonths: number;
  paymentDays?: number;
}

// ─── Standardized Error Response Types ───

export interface BackendErrorDetail {
  code: string;
  field?: string;
  message: string;
}

export interface BackendErrorResponse {
  error: string;
  message: string;
  details?: BackendErrorDetail[];
}

export class BackendApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorResponse: BackendErrorResponse,
  ) {
    super(errorResponse.message);
    this.name = 'BackendApiError';
  }
}

export class BackendUnavailableError extends Error {
  constructor() {
    super('FastAPI could not be reached.');
    this.name = 'BackendUnavailableError';
  }
}

export interface BackendTerms {
  price?: number;
  delivery_days?: number;
  warranty_months?: number;
  payment_days?: number;
  salary?: number;
  bonus?: number;
  start?: number;
  remote?: number;
  eng?: number;
  mkt?: number;
  ops?: number;
  timeline?: number;
}

interface BackendTranscriptEntry {
  round: number;
  speaker: string;
  speaker_id?: string;
  decision: BackendDecision;
  utility: number;
  message: string;
  offer: BackendTerms | null;
  reasoning: string;
}

interface BackendRunResponse {
  scenario: BackendScenario;
  outcome: BackendOutcome;
  outcome_reason: string;
  rounds: number;
  final_terms: BackendTerms | null;
  satisfaction: Record<string, number>;
  personalities: Record<string, string>;
  parties: Array<{
    id: string;
    role: string;
    personality: BackendPersonality;
    skill: 'novice' | 'skilled' | 'expert';
  }>;
  transcript: BackendTranscriptEntry[];
}

export interface BackendScenarioConfig {
  parties: Array<{
    id: string;
    role: string;
    personality: BackendPersonality;
    skill: Agent['skill'];
    target: Record<string, number>;
    walk_away: Record<string, number>;
    weights: Record<string, number>;
  }>;
  issues: Array<{ id: string; min: number; max: number; step: number; derived?: boolean }>;
  opener_id: string;
  rounds_limit: number;
  deadlock_after_stalled_rounds: number;
  constraint?: { type: 'sum'; total: number; derived: string; of: string[] };
}

export type BackendVendorConfig = BackendScenarioConfig;

export function buildBackendScenarioConfig(engineConfig: EngineConfig): BackendScenarioConfig {
  if (!['vendor', 'job', 'budget'].includes(engineConfig.scenario)) {
    throw new Error('The backend config requires a built-in Vendor, Job, or Budget scenario.');
  }
  const requiredParties: Record<string, string[]> = {
    job: ['candidate', 'recruiter', 'manager'],
    budget: ['eng', 'mkt', 'ops'],
  };
  const expectedParties = requiredParties[engineConfig.scenario];
  if (
    expectedParties &&
    (engineConfig.agents.length !== expectedParties.length ||
      expectedParties.some((id) => !engineConfig.agents.some((agent) => agent.id === id)))
  ) {
    throw new Error(`The ${engineConfig.scenario} backend setup requires all three scenario parties.`);
  }
  const issues = engineConfig.scenarioDef.issues.map(({ id, min, max, step, derived }) => ({
    id,
    min,
    max,
    step,
    ...(derived ? { derived: true } : {}),
  }));
  const issuesById = new Map(engineConfig.scenarioDef.issues.map((issue) => [issue.id, issue]));
  const parties = engineConfig.agents.map((agent) => {
    const target: Record<string, number> = {};
    const walkAway: Record<string, number> = {};
    const weights: Record<string, number> = {};
    for (const { id } of issues) {
      const preference = agent.prefs[id];
      if (!preference) {
        throw new Error(`${agent.name} is missing preferences for the ${id} issue.`);
      }
      target[id] = preference.ideal;
      walkAway[id] = preference.reserve;
      weights[id] = agent.w[id] ?? preference.w;
    }

    if (engineConfig.scenarioDef.constraint?.type === 'sum') {
      const { total, derived, of } = engineConfig.scenarioDef.constraint;
      const adjustToPreference = (values: Record<string, number>, preferredDerived: number) => {
        let remaining = total - preferredDerived - of.reduce((sum, id) => sum + values[id], 0);
        const adjustable = [...of].sort((a, b) => weights[a] - weights[b]);
        for (const id of adjustable) {
          if (Math.abs(remaining) < 1e-8) break;
          const issue = issuesById.get(id);
          if (!issue) throw new Error(`The Budget constraint references unknown issue ${id}.`);
          const raw = Math.max(issue.min, Math.min(issue.max, values[id] + remaining));
          const snapped = issue.min + Math.round((raw - issue.min) / issue.step) * issue.step;
          const change = snapped - values[id];
          values[id] = snapped;
          remaining -= change;
        }
        if (Math.abs(remaining) >= 1e-8) {
          throw new Error(`${agent.name}'s Budget preferences cannot satisfy the shared total.`);
        }
        values[derived] = preferredDerived;
      };
      adjustToPreference(target, agent.prefs[derived].ideal);
      adjustToPreference(walkAway, agent.prefs[derived].reserve);
    }

    return {
      id: agent.id,
      role: agent.name,
      personality: toBackendPersonality(agent.personality),
      skill: agent.skill,
      target,
      walk_away: walkAway,
      weights,
    };
  });
  const openerId = engineConfig.scenarioDef.opener;

  if (!openerId || !parties.some((party) => party.id === openerId)) {
    throw new Error('The configured Vendor opener must have a seat at the table.');
  }

  return {
    parties,
    issues,
    opener_id: openerId,
    rounds_limit: engineConfig.rounds,
    deadlock_after_stalled_rounds: engineConfig.deadlockN,
    ...(engineConfig.scenarioDef.constraint
      ? { constraint: engineConfig.scenarioDef.constraint }
      : {}),
  };
}

export function buildBackendVendorConfig(engineConfig: EngineConfig): BackendVendorConfig {
  if (engineConfig.scenario !== 'vendor') {
    throw new Error('Backend Vendor config requires the Vendor Pricing scenario.');
  }
  return buildBackendScenarioConfig(engineConfig);
}

export interface BackendArenaUpdate {
  state: SimulationState;
  transcript: TranscriptEntry[];
  tableOffer: Offer | null;
}

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isBackendDecision(value: unknown): value is BackendDecision {
  return value === 'open' || value === 'counter' || value === 'accept' || value === 'reject';
}

function isBackendOutcome(value: unknown): value is BackendOutcome {
  return value === 'deal' || value === 'breakdown' || value === 'deadlock';
}

function isBackendTerms(value: unknown, scenario: BackendScenario): value is BackendTerms {
  if (!isRecord(value)) return false;
  if (scenario === 'job') {
    return ['salary', 'bonus', 'start', 'remote'].every((field) =>
      isFiniteNumber(value[field]),
    );
  }
  if (scenario === 'budget') {
    return ['eng', 'mkt', 'ops', 'timeline'].every((field) =>
      isFiniteNumber(value[field]),
    ) &&
      isFiniteNumber(value.eng) &&
      isFiniteNumber(value.mkt) &&
      isFiniteNumber(value.ops) &&
      value.eng + value.mkt + value.ops === 50;
  }
  return isFiniteNumber(value.price) &&
    isFiniteNumber(value.delivery_days) &&
    isFiniteNumber(value.warranty_months) &&
    (value.payment_days === undefined || isNonNegativeInteger(value.payment_days));
}

function isBackendResponse(
  value: unknown,
  expectedScenario: BackendScenario,
): value is BackendRunResponse {
  return isRecord(value) &&
    value.scenario === expectedScenario &&
    isBackendOutcome(value.outcome) &&
    typeof value.outcome_reason === 'string' &&
    isNonNegativeInteger(value.rounds) &&
    isRecord(value.satisfaction) &&
    Object.values(value.satisfaction).every(
      (score) => isFiniteNumber(score) && score >= 0 && score <= 1,
    ) &&
    (value.parties === undefined ||
      (Array.isArray(value.parties) && value.parties.every((party) =>
        isRecord(party) &&
        typeof party.id === 'string' &&
        typeof party.role === 'string' &&
        (party.personality === 'aggressive' ||
          party.personality === 'collaborative' ||
          party.personality === 'risk_averse') &&
        (party.skill === 'novice' || party.skill === 'skilled' || party.skill === 'expert'),
      ))) &&
    (value.final_terms === null || isBackendTerms(value.final_terms, expectedScenario)) &&
    Array.isArray(value.transcript) &&
    value.transcript.every((entry) =>
      isRecord(entry) &&
      isNonNegativeInteger(entry.round) &&
      typeof entry.speaker === 'string' &&
      (entry.speaker_id === undefined || typeof entry.speaker_id === 'string') &&
      entry.speaker.trim().length > 0 &&
      isBackendDecision(entry.decision) &&
      isFiniteNumber(entry.utility) &&
      typeof entry.message === 'string' &&
      typeof entry.reasoning === 'string' &&
      (entry.offer === null || isBackendTerms(entry.offer, expectedScenario)),
    );
}

function toBackendPersonality(personality: Agent['personality']): BackendPersonality {
  // Personality types are now standardized to use underscore (risk_averse)
  return personality;
}

export function mapBackendVendorTerms(terms: {
  price: number;
  delivery_days: number;
  warranty_months: number;
  payment_days?: number;
}): BackendVendorTerms {
  return {
    pricePerUnit: terms.price,
    deliveryDays: terms.delivery_days,
    warrantyMonths: terms.warranty_months,
    paymentDays: terms.payment_days,
  };
}

function toEngineIssueValues(
  terms: BackendTerms,
  scenario: BackendScenario,
): Record<string, number> {
  if (scenario === 'vendor') {
    if (
      !isFiniteNumber(terms.price) ||
      !isFiniteNumber(terms.delivery_days) ||
      !isFiniteNumber(terms.warranty_months)
    ) {
      throw new Error('FastAPI returned incomplete Vendor terms.');
    }
    return {
      price: terms.price,
      delivery: terms.delivery_days,
      warranty: terms.warranty_months,
      ...(isFiniteNumber(terms.payment_days) ? { payment: terms.payment_days } : {}),
    };
  }
  const fields: Array<keyof Pick<
    BackendTerms,
    'salary' | 'bonus' | 'start' | 'remote' | 'eng' | 'mkt' | 'ops' | 'timeline'
  >> = scenario === 'job'
    ? ['salary', 'bonus', 'start', 'remote']
    : ['eng', 'mkt', 'ops', 'timeline'];
  const values: Record<string, number> = {};
  for (const field of fields) {
    const value = terms[field];
    if (!isFiniteNumber(value)) {
      throw new Error(`FastAPI returned incomplete ${scenario} terms.`);
    }
    values[field] = value;
  }
  return values;
}

async function postBackendNegotiation(
  request: {
    scenario: BackendScenario;
    opener_personality: BackendPersonality;
    responder_personality: BackendPersonality;
    max_rounds: number;
    config?: BackendScenarioConfig;
  },
  signal?: AbortSignal,
): Promise<BackendRunResponse> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/negotiate/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new BackendUnavailableError();
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new BackendApiError(response.status, {
      error: 'parse_error',
      message: 'FastAPI returned a response that was not valid JSON.',
    });
  }

  if (!response.ok) {
    let errorResponse: BackendErrorResponse;
    if (isRecord(payload) && 'error' in payload) {
      // Standardized error format
      errorResponse = payload as unknown as BackendErrorResponse;
    } else if (isRecord(payload) && typeof payload.detail === 'string') {
      // Legacy format (fallback)
      errorResponse = {
        error: 'http_error',
        message: payload.detail,
      };
    } else {
      errorResponse = {
        error: 'http_error',
        message: `FastAPI request failed (${response.status}).`,
      };
    }
    throw new BackendApiError(response.status, errorResponse);
  }

  if (!isBackendResponse(payload, request.scenario)) {
    throw new BackendApiError(response.status, {
      error: 'invalid_response',
      message: `FastAPI returned data that does not match the ${request.scenario} response contract.`,
    });
  }
  return payload;
}

export async function runBackendNegotiation(
  opener: Agent,
  responder: Agent,
  maxRounds: number,
  signal?: AbortSignal,
  config?: BackendVendorConfig,
): Promise<BackendRunResponse> {
  return postBackendNegotiation({
    scenario: 'vendor',
    opener_personality: toBackendPersonality(opener.personality),
    responder_personality: toBackendPersonality(responder.personality),
    max_rounds: maxRounds,
    ...(config ? { config } : {}),
  }, signal);
}

export function runBackendScenarioNegotiation(
  scenario: BackendScenario,
  config: BackendScenarioConfig,
  signal?: AbortSignal,
): Promise<BackendRunResponse> {
  const openerIndex = config.parties.findIndex((party) => party.id === config.opener_id);
  const opener = config.parties[openerIndex];
  const responder = config.parties[(openerIndex + 1) % config.parties.length];
  if (!opener || !responder || openerIndex < 0 || config.parties.length < 2) {
    throw new Error('The backend setup needs a configured opener and a responding party.');
  }
  return postBackendNegotiation({
    scenario,
    opener_personality: opener.personality,
    responder_personality: responder.personality,
    max_rounds: config.rounds_limit,
    config,
  }, signal);
}

function normalizeRole(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

function backendRoleForSpeaker(speaker: string): 'vendor' | 'buyer' | null {
  const normalized = normalizeRole(speaker);
  if (normalized.includes('vendor') || normalized.includes('supplier')) return 'vendor';
  if (normalized.includes('buyer') || normalized.includes('purchas') || normalized.includes('procurement')) return 'buyer';
  return null;
}

function findSpeakerAgent(
  speaker: string,
  participants: Agent[],
): Agent | undefined {
  const normalized = normalizeRole(speaker);
  const exactMatch = participants.find((agent) =>
    [agent.id, agent.name, agent.title].some((value) => normalizeRole(value) === normalized),
  );
  if (exactMatch) return exactMatch;

  const backendRole = backendRoleForSpeaker(speaker);
  return backendRole
    ? participants.find((agent) =>
        [agent.id, agent.name, agent.title].some((value) => {
          const role = normalizeRole(value);
          return backendRole === 'vendor'
            ? role.includes('vendor') || role.includes('supplier')
            : role.includes('buyer') || role.includes('purchas') || role.includes('procurement');
        }),
      )
    : undefined;
}

export function adaptBackendResult(
  result: BackendRunResponse,
  baseState: SimulationState,
  participants: Agent[],
): BackendArenaUpdate {
  const fallbackAssignments = new Map<string, Agent>();
  const assignedFallbackAgents = new Set<string>();

  const transcript = result.transcript.map((entry, index): TranscriptEntry => {
    const speakerKey = normalizeRole(entry.speaker);
    let agent = entry.speaker_id
      ? participants.find((participant) => participant.id === entry.speaker_id)
      : undefined;
    agent ??= findSpeakerAgent(entry.speaker, participants);

    if (!agent) {
      agent = fallbackAssignments.get(speakerKey);
      if (!agent) {
        agent = participants.find((participant) => !assignedFallbackAgents.has(participant.id))
          ?? participants[0];
        fallbackAssignments.set(speakerKey, agent);
        assignedFallbackAgents.add(agent.id);
      }
    }

    const terms = entry.offer ? toEngineIssueValues(entry.offer, result.scenario) : null;
    return {
      turn: index + 1,
      round: entry.round,
      by: agent.id,
      name: agent.name,
      kind: entry.decision === 'accept'
        ? 'accept'
        : entry.decision === 'reject'
          ? 'breakdown'
          : 'offer',
      decision: entry.decision,
      text: entry.message,
      x: terms ?? undefined,
      rationale: formatTurnReason(entry.decision, entry.reasoning),
      uSelf: entry.utility,
    };
  });

  const offers: Offer[] = transcript.flatMap((entry) =>
    entry.x
      ? [{
          by: entry.by,
          x: entry.x,
          round: entry.round,
          turn: entry.turn,
        }]
      : [],
  );
  const lastOffer = offers.at(-1) ?? null;
  const finalTerms = result.final_terms
    ? toEngineIssueValues(result.final_terms, result.scenario)
    : null;
  const tableOffer = finalTerms
    ? {
        by: lastOffer?.by ?? participants[0].id,
        x: finalTerms,
        round: result.rounds,
        turn: transcript.length,
      }
    : lastOffer;

  const latestDecisionByParty = new Map<string, TranscriptEntry>();
  for (const entry of transcript) latestDecisionByParty.set(entry.by, entry);
  const accepts = tableOffer
    ? participants
      .filter((participant) =>
        participant.id !== tableOffer.by &&
        latestDecisionByParty.get(participant.id)?.decision === 'accept',
      )
      .map((participant) => participant.id)
    : [];
  const state: SimulationState = {
    ...baseState,
    agents: participants,
    order: participants.map((_, index) => index),
    round: result.rounds,
    turnCount: transcript.length,
    offers,
    table: tableOffer,
    accepts,
    transcript,
    status: result.outcome === 'deal' ? 'deal' : 'breakdown',
    roundStarted: false,
    waitingHuman: false,
    blocked: false,
    endReason: result.outcome_reason,
    backendOutcome: result.outcome,
  };

  return { state, transcript, tableOffer };
}
