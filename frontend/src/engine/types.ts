/**
 * Engine Types - Pure TypeScript interfaces for the negotiation engine
 * No React dependencies, no browser APIs
 */

// ============================================================================
// Core Primitives
// ============================================================================

export type PersonalityType = 'aggressive' | 'collaborative' | 'risk-averse';
export type SkillLevel = 'novice' | 'skilled' | 'expert';
export type ClimateType = 'stable' | 'volatile' | 'crisis';
export type OrchestratorRole = 'timekeeper' | 'mediator' | 'enforcer' | 'injector' | 'auditor';
export type AutonomyLevel = 0 | 1 | 2 | 3;
export type IssueKind = 'inr' | 'days' | 'net' | 'months' | 'lpa' | 'lakh' | 'weeks' | 'dpw' | 'share' | 'num';
export type NegotiationMode = 'simulation' | 'practice';
export type SessionStatus = 'running' | 'deal' | 'breakdown';

export interface Personality {
  label: string;
  icon: string;
  beta: number;
  open: number;
  acceptBar: number;
  desc: string;
}

export const PERSONALITIES: Record<PersonalityType, Personality> = {
  aggressive: {
    label: 'Aggressive',
    icon: '⚔',
    beta: 3.2,
    open: 0.99,
    acceptBar: 0.90,
    desc: 'Opens very high, concedes slowly, then jumps late.'
  },
  collaborative: {
    label: 'Collaborative',
    icon: '🤝',
    beta: 1.0,
    open: 0.92,
    acceptBar: 0.75,
    desc: 'Moderate opening, steady concessions, looks for trades.'
  },
  'risk-averse': {
    label: 'Risk-averse',
    icon: '🛡',
    beta: 0.45,
    open: 0.90,
    acceptBar: 0.65,
    desc: 'Concedes early to secure a deal, then holds.'
  }
};

export const SKILLS: Record<SkillLevel, string> = {
  novice: 'Novice',
  skilled: 'Skilled',
  expert: 'Expert'
};

export interface Climate {
  label: string;
  period: number;
  pressure: number;
  rounds: number;
  desc: string;
}

export const CLIMATES: Record<ClimateType, Climate> = {
  stable: {
    label: 'Stable',
    period: 6,
    pressure: 0.12,
    rounds: 14,
    desc: '1 event / 6 rounds, low pressure, generous limit'
  },
  volatile: {
    label: 'Volatile',
    period: 3,
    pressure: 0.32,
    rounds: 12,
    desc: '1 event / 3 rounds, medium pressure, normal limit'
  },
  crisis: {
    label: 'Crisis',
    period: 1,
    pressure: 0.55,
    rounds: 9,
    desc: '1 event / round, high pressure, tight limit'
  }
};

export const ORCH_ROLES: OrchestratorRole[] = [
  'timekeeper', 'mediator', 'enforcer', 'injector', 'auditor'
];

export const ORCH_ROLE_LABELS: Record<OrchestratorRole, string> = {
  timekeeper: 'Timekeeper',
  mediator: 'Mediator',
  enforcer: 'Rule-enforcer',
  injector: 'Event-injector',
  auditor: 'Auditor'
};

export const ORCH_ROLE_DESCS: Record<OrchestratorRole, string> = {
  timekeeper: 'Counts rounds, enforces the limit',
  mediator: 'Suggests a compromise when stuck',
  enforcer: 'Blocks out-of-range offers',
  injector: 'Draws event cards',
  auditor: 'Logs fairness and concessions'
};

export const AUTONOMY = [
  { n: 0, label: 'Silent clock', desc: 'Only counts rounds.' },
  { n: 1, label: 'Referee', desc: 'Keeps order and rules; asks you at a deadlock.' },
  { n: 2, label: 'Facilitator', desc: 'Nudges, draws events, asks you at a deadlock.' },
  { n: 3, label: 'Director', desc: 'Mediates, injects and decides deadlocks itself.' }
];

export const SEAT_COLORS = ['#7aa7ff', '#f08b91', '#f4c66a', '#67d6a3', '#b69cff'];

export interface Backdrop {
  name: string;
  c1: string;
  c2: string;
  accent: string;
  table: [string, string];
  fx: 'grid' | 'bokeh' | 'radar' | 'stars' | 'leaves' | 'rain';
}

export const BACKDROPS: Record<string, Backdrop> = {
  tradefloor: { name: 'Trade Floor', c1: '#0e2a3a', c2: '#07131c', accent: '#6ee7e0', table: ['#1d4a5a', '#0f2a36'], fx: 'grid' },
  glassoffice: { name: 'Glass Office', c1: '#2a1f4a', c2: '#0d0b1f', accent: '#b69cff', table: ['#3b2f66', '#1d173a'], fx: 'bokeh' },
  warroom: { name: 'War Room', c1: '#3a1d14', c2: '#120a08', accent: '#f4c66a', table: ['#4a2a1a', '#24130c'], fx: 'radar' },
  space: { name: 'Deep Space', c1: '#1b2b4a', c2: '#050812', accent: '#7aa7ff', table: ['#22345a', '#111b33'], fx: 'stars' },
  zen: { name: 'Zen Garden', c1: '#123a2c', c2: '#06140f', accent: '#67d6a3', table: ['#1f4d3b', '#0e2a20'], fx: 'leaves' },
  neon: { name: 'Neon City', c1: '#3a0f3e', c2: '#0b0514', accent: '#ff7ad9', table: ['#4a1d55', '#1f0b26'], fx: 'rain' }
};

// ============================================================================
// Scenario & Issue Definitions
// ============================================================================

export interface Issue {
  id: string;
  label: string;
  kind: IssueKind;
  min: number;
  max: number;
  step: number;
  unit?: string;
  aliases?: string[];
  derived?: boolean;
}

export interface Constraint {
  type: 'sum';
  total: number;
  derived: string;
  of: string[];
}

export interface RolePreferences {
  [issueId: string]: {
    ideal: number;
    reserve: number;
    w: number;
  };
}

export interface Role {
  id: string;
  name: string;
  title: string;
  persona: string;
  goal: string;
  constraints: string[];
  batnaText: string;
  batnaU: number;
  hidden: string;
  personality: PersonalityType;
  skill: SkillLevel;
  prefs: RolePreferences;
  mindReveal?: boolean;
  revealBatna?: boolean;
}

export interface EventEffect {
  batna?: Record<string, number>;
  weight?: Record<string, Record<string, number>>;
  trust?: number;
  rounds?: number;
  pressure?: number;
}

export interface Event {
  id: string;
  title: string;
  icon: string;
  text: string;
  fx: EventEffect;
}

export interface Scenario {
  id: string;
  name: string;
  icon: string;
  diff: string;
  backdrop: string;
  opener: string | null;
  blurb: string;
  issues: Issue[];
  roles: Role[];
  events: Event[];
  constraint?: Constraint;
  custom?: boolean;
  climate: ClimateType;
}

export const KIND_FORMATTERS: Record<IssueKind, (v: number) => string> = {
  inr: (v) => '₹' + Math.round(v).toLocaleString('en-IN'),
  days: (v) => Math.round(v) + ' days',
  net: (v) => 'Net-' + Math.round(v),
  months: (v) => Math.round(v) + ' mo',
  lpa: (v) => '₹' + (+v).toFixed(1) + ' LPA',
  lakh: (v) => '₹' + (+v).toFixed(2).replace(/\.00$/, '') + ' L',
  weeks: (v) => Math.round(v) + ' wks',
  dpw: (v) => Math.round(v) + ' d/wk',
  share: (v) => '₹' + Math.round(v) + ' L',
  num: (v) => (Math.round(v * 100) / 100) + ''
};

export function fmtVal(issue: Issue, v: number): string {
  const f = KIND_FORMATTERS[issue.kind] || KIND_FORMATTERS.num;
  return f(v) + (issue.kind === 'num' && issue.unit ? ' ' + issue.unit : '');
}

// ============================================================================
// Agent & Simulation State
// ============================================================================

export interface Agent {
  id: string;
  name: string;
  title: string;
  persona: string;
  goal: string;
  constraints: string[];
  batnaText: string;
  batnaU: number;
  hidden: string;
  personality: PersonalityType;
  skill: SkillLevel;
  prefs: RolePreferences;
  w: Record<string, number>; // normalized weights
  color: string;
  seat: number;
  human: boolean;
  mindReveal: boolean;
  revealBatna: boolean;
}

export interface EmotionState {
  v: number; // valence -1 to 1
  a: number; // arousal 0 to 1
  hist: number[];
  ahist: number[];
}

export interface TrustMatrix {
  [fromAgentId: string]: {
    [toAgentId: string]: number;
  };
}

export interface Offer {
  by: string;
  x: Record<string, number>;
  round: number;
  turn: number;
}

export interface TranscriptEntry {
  turn: number;
  round: number;
  by: string;
  name: string;
  kind: 'offer' | 'accept' | 'message' | 'system' | 'event' | 'deal' | 'breakdown' | 'mediator' | 'walk' | 'round';
  decision?: 'open' | 'counter' | 'accept' | 'reject' | 'message' | 'walk';
  text: string;
  tone?: 'warm' | 'firm' | 'wary' | 'pushy' | 'neutral';
  toneP?: Record<string, number>;
  x?: Record<string, number>;
  rationale?: string;
  thought?: AgentThought;
  uSelf?: number;
  trustDelta?: number;
  human?: boolean;
}

export interface AgentThought {
  u: number;
  T: number;
  batna: number;
  hidden: string;
  feel: string;
  trustIn: number | null;
  lastSpk: string | null;
  plan: string;
}

export interface UtilityHistory {
  turn: number;
  round: number;
  u: Record<string, number>;
  risk: number;
  x: Record<string, number> | null;
  by: string | null;
}

export interface DeadlockState {
  stalled: number;
  risk: number;
  ladder: number;
  lastM: number | null;
  extended: boolean;
  riskHist: number[];
}

export interface EventRecord {
  id: string;
  round: number;
}

export interface SimulationState {
  round: number;
  maxRounds: number;
  turnIdx: number;
  turnCount: number;
  order: number[];
  agents: Agent[];
  offers: Offer[];
  table: Offer | null;
  accepts: string[];
  trust: TrustMatrix;
  emo: Record<string, EmotionState>;
  climate: ClimateType;
  pressure: number;
  pressureBump: number;
  events: EventRecord[];
  usedEvents: string[];
  deadlock: DeadlockState;
  transcript: TranscriptEntry[];
  uHist: UtilityHistory[];
  status: SessionStatus;
  roundStarted: boolean;
  waitingHuman: boolean;
  blocked: boolean;
  endReason: string;
  backendOutcome?: 'deal' | 'breakdown' | 'deadlock';
  lastTone: Record<string, 'warm' | 'firm' | 'wary' | 'pushy' | 'neutral'>;
  forkedFrom: number | null;
  scenario: string;
}

export interface EngineConfig {
  scenario: string;
  mode: NegotiationMode;
  rounds: number;
  climate: ClimateType;
  eventFreq: number;
  deadlockN: number;
  backdrop: string;
  orchestrator: {
    roles: OrchestratorRole[];
    autonomy: AutonomyLevel;
  };
  scenarioDef: Scenario;
  agents: Agent[];
}

export interface EngineHooks {
  onThinking?: (agent: Agent) => Promise<void>;
  onTurn?: (entry: TranscriptEntry) => void;
  onUpdate?: () => void;
  onHumanTurn?: (agent: Agent) => void;
  onModal?: (type: 'event' | 'deadlock', data: any) => Promise<string>;
  onEnd?: (status: SessionStatus) => void;
  rephrase?: (agent: Agent, info: RephraseInfo) => Promise<string | null>;
}

export interface RephraseInfo {
  decision: 'open' | 'counter' | 'accept' | 'reject' | 'message';
  terms: string;
  draft: string;
  tone: 'warm' | 'firm' | 'wary' | 'pushy' | 'neutral';
}

// ============================================================================
// Reporting Types
// ============================================================================

export interface AgentReport {
  id: string;
  name: string;
  human: boolean;
  color: string;
  personality: PersonalityType;
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
}

export interface TurningPoint {
  turn: number;
  round: number;
  d: number;
  who: string;
  text: string;
  event?: boolean;
}

export interface Habit {
  good: boolean;
  t: string;
}

export interface Report {
  deal: boolean;
  reason: string;
  rounds: number;
  turns: number;
  terms: Record<string, number> | null;
  per: AgentReport[];
  firstGiver: AgentReport | null;
  most: AgentReport | null;
  turning: TurningPoint[];
  habits: Habit[];
  joint: number;
  nash: number;
  events: number;
  risk: number[];
}

// ============================================================================
// Tone Classifier Types
// ============================================================================

export type ToneLabel = 'warm' | 'firm' | 'wary' | 'pushy' | 'neutral';

export interface ToneResult {
  label: ToneLabel;
  p: Record<ToneLabel, number>;
}

export interface ToneStats {
  n: number;
  vocab: number;
  cv: number;
  classes: ToneLabel[];
  conf: Record<string, number>;
}

// ============================================================================
// Utility Functions (used by engine)
// ============================================================================
export function getEmotionLabel(e?: EmotionState): string {
  if (!e) return 'neutral';
  const { v, a } = e;
  if (v > 0.35) return a > 0.55 ? 'excited' : 'content';
  if (v > 0.05) return a > 0.6 ? 'eager' : 'calm';
  if (v > -0.2) return a > 0.6 ? 'tense' : 'neutral';
  if (v > -0.5) return a > 0.55 ? 'irritated' : 'anxious';
  return a > 0.55 ? 'angry' : 'discouraged';
}

const EMOJI_MAP: Record<string, string> = {
  excited: '😄',
  content: '😊',
  eager: '🙂',
  calm: '😌',
  tense: '😬',
  neutral: '😐',
  irritated: '😤',
  anxious: '😟',
  angry: '😠',
  discouraged: '😞',
};

export function getEmotionFace(e?: EmotionState): string {
  return EMOJI_MAP[getEmotionLabel(e)] ?? '😐';
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}

export function r2(v: number): number {
  return Math.round(v * 100) / 100;
}