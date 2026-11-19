/**
 * Scenario Definitions
 * Complete port of the prototype's SCENARIOS object
 */

import type { Scenario, Issue, Role, Event, Constraint } from './types';
import {
  fmtVal,
  PERSONALITIES,
  SKILLS,
  CLIMATES,
  AUTONOMY,
  SEAT_COLORS,
  BACKDROPS,
  KIND_FORMATTERS,
  ORCH_ROLES,
  ORCH_ROLE_LABELS,
  ORCH_ROLE_DESCS,
  CLIMATES as CLIMATES_TYPE
} from './types';

// ============================================================================
// Helper: Build Custom Roles
// ============================================================================

function buildCustomRoles(issues: Issue[], n: number, names?: string[]): Role[] {
  const personalities: Role['personality'][] = ['collaborative', 'aggressive', 'risk-averse', 'collaborative', 'aggressive'];
  const roles: Role[] = [];

  for (let s = 0; s < n; s++) {
    const prefs: Role['prefs'] = {};
    const ws = issues.map((_, i) => 1 + ((s * 7 + i * 3) % 5));
    const tot = ws.reduce((a, b) => a + b, 0);

    issues.forEach((is, i) => {
      const high = (s + i) % 2 === 0;
      const lo = is.min + (is.max - is.min) * 0.15;
      const hi = is.max - (is.max - is.min) * 0.15;
      prefs[is.id] = high
        ? { ideal: is.max, reserve: lo, w: ws[i] / tot }
        : { ideal: is.min, reserve: hi, w: ws[i] / tot };
    });

    roles.push({
      id: 'p' + (s + 1),
      name: (names && names[s]) || ('Party ' + String.fromCharCode(65 + s)),
      title: 'Custom role',
      persona: 'A negotiator with their own priorities.',
      goal: 'Maximise value on top-priority issues.',
      constraints: ['Stay above walk-away'],
      batnaText: 'Alternative deal elsewhere',
      batnaU: 0.28,
      hidden: issues[0].id,
      personality: personalities[s],
      skill: 'skilled',
      prefs,
      mindReveal: true,
      revealBatna: false
    });
  }
  return roles;
}

// ============================================================================
// Scenario Definitions
// ============================================================================

export const SCENARIOS: Record<string, Scenario> = {
  vendor: {
    id: 'vendor',
    name: 'Vendor Pricing',
    icon: '🏭',
    diff: 'Medium',
    backdrop: 'tradefloor',
    opener: 'vendor',
    blurb: 'Buyer, supplier and finance haggle over a bulk hardware order.',
    climate: 'volatile',
    issues: [
      { id: 'price', label: 'Price', kind: 'inr', min: 900000, max: 1300000, step: 10000, aliases: ['price', 'cost', 'rate', '₹', 'rs', 'inr', 'lakh', 'quote'] },
      { id: 'delivery', label: 'Delivery', kind: 'days', min: 10, max: 45, step: 1, aliases: ['delivery', 'deliver', 'ship', 'days'] },
      { id: 'warranty', label: 'Warranty', kind: 'months', min: 6, max: 36, step: 6, aliases: ['warranty', 'guarantee', 'months'] },
      { id: 'payment', label: 'Payment', kind: 'net', min: 0, max: 60, step: 15, aliases: ['payment', 'net', 'pay', 'credit'] }
    ],
    roles: [
      {
        id: 'buyer',
        name: 'Buyer',
        title: 'Procurement lead',
        persona: 'Methodical procurement lead who cares about total value and on-time delivery.',
        goal: 'Land the order under ₹11L with delivery inside 25 days.',
        constraints: ['Price ≤ ₹11,80,000', 'Delivery ≤ 40 days', 'Warranty ≥ 6 months'],
        batnaText: 'Rival supplier quote: ₹11.2L, 35 days',
        batnaU: 0.30,
        hidden: 'delivery',
        personality: 'collaborative',
        skill: 'skilled',
        prefs: {
          price: { ideal: 950000, reserve: 1180000, w: 0.45 },
          delivery: { ideal: 15, reserve: 40, w: 0.25 },
          warranty: { ideal: 24, reserve: 6, w: 0.2 },
          payment: { ideal: 60, reserve: 0, w: 0.1 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'vendor',
        name: 'Vendor',
        title: 'Senior sales rep',
        persona: 'Seasoned sales rep, protective of margin, wants cash in fast.',
        goal: 'Close at or above ₹11.5L, keep warranty short.',
        constraints: ['Price ≥ ₹9,80,000', 'Delivery ≥ 12 days', 'No free repairs beyond 30 months'],
        batnaText: 'Sell the stock to the distributor at ₹10.1L',
        batnaU: 0.30,
        hidden: 'payment',
        personality: 'aggressive',
        skill: 'skilled',
        prefs: {
          price: { ideal: 1250000, reserve: 980000, w: 0.5 },
          delivery: { ideal: 40, reserve: 12, w: 0.15 },
          warranty: { ideal: 6, reserve: 30, w: 0.2 },
          payment: { ideal: 0, reserve: 60, w: 0.15 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'finance',
        name: 'Finance',
        title: 'Finance controller',
        persona: 'Cautious controller guarding budget and cash-flow.',
        goal: 'Keep spend inside budget and push payment to Net-45+.',
        constraints: ['Approved budget ₹11.5L', 'Payment ≥ Net-15'],
        batnaText: 'Defer the purchase to next quarter',
        batnaU: 0.25,
        hidden: 'payment',
        personality: 'risk-averse',
        skill: 'skilled',
        prefs: {
          price: { ideal: 950000, reserve: 1150000, w: 0.5 },
          payment: { ideal: 60, reserve: 15, w: 0.3 },
          warranty: { ideal: 24, reserve: 6, w: 0.2 },
          delivery: { ideal: 20, reserve: 45, w: 0 }
        },
        mindReveal: true,
        revealBatna: false
      }
    ],
    events: [
      {
        id: 'rival',
        title: 'Rival bid',
        icon: '🏷',
        text: 'A competing vendor quotes 15% less. Supplier leverage drops, buyer leverage rises.',
        fx: { batna: { buyer: 0.08, vendor: -0.06 }, pressure: 0.06 }
      },
      {
        id: 'deadline',
        title: 'Deadline cut',
        icon: '⏰',
        text: 'The warehouse needs stock earlier. Two rounds are removed.',
        fx: { rounds: -2, pressure: 0.1 }
      },
      {
        id: 'freeze',
        title: 'Budget freeze',
        icon: '🧊',
        text: 'Head office caps discretionary spend. Finance hardens on price.',
        fx: { batna: { finance: 0.06 }, weight: { finance: { price: 0.1 } }, pressure: 0.05 }
      },
      {
        id: 'rumor',
        title: 'Rumour leak',
        icon: '💬',
        text: 'Word spreads that the vendor is overstocked. Trust at the table drops.',
        fx: { trust: -0.08, batna: { vendor: -0.04 } }
      },
      {
        id: 'sweet',
        title: 'Sweetener',
        icon: '🎁',
        text: 'Vendor\'s logistics partner offers free express shipping. Delivery gets cheaper to give.',
        fx: { weight: { vendor: { delivery: -0.08 } }, trust: 0.04 }
      }
    ]
  },

  job: {
    id: 'job',
    name: 'Job Offer',
    icon: '💼',
    diff: 'Easy',
    backdrop: 'glassoffice',
    opener: 'recruiter',
    blurb: 'Candidate, recruiter and hiring manager settle salary and perks.',
    climate: 'stable',
    issues: [
      { id: 'salary', label: 'Base salary', kind: 'lpa', min: 12, max: 24, step: 0.5, aliases: ['salary', 'base', 'ctc', 'lpa', 'pay', 'package'] },
      { id: 'bonus', label: 'Joining bonus', kind: 'lakh', min: 0, max: 3, step: 0.25, aliases: ['bonus', 'joining bonus', 'sign-on', 'signing'] },
      { id: 'start', label: 'Joining date', kind: 'weeks', min: 2, max: 12, step: 1, aliases: ['join', 'start', 'joining', 'weeks', 'notice'] },
      { id: 'remote', label: 'Remote days', kind: 'dpw', min: 0, max: 5, step: 1, aliases: ['remote', 'wfh', 'hybrid', 'home'] }
    ],
    roles: [
      {
        id: 'candidate',
        name: 'Candidate',
        title: 'Senior engineer',
        persona: 'Strong engineer with a competing offer; values flexibility.',
        goal: 'Reach ₹20 LPA+ with at least 3 remote days.',
        constraints: ['Salary ≥ ₹15 LPA', 'Remote ≥ 1 day', 'Needs ≥ 3 weeks notice'],
        batnaText: 'Competing offer: ₹16.5 LPA, 2 remote days',
        batnaU: 0.30,
        hidden: 'remote',
        personality: 'collaborative',
        skill: 'skilled',
        prefs: {
          salary: { ideal: 22, reserve: 15, w: 0.45 },
          bonus: { ideal: 3, reserve: 0, w: 0.15 },
          start: { ideal: 8, reserve: 3, w: 0.15 },
          remote: { ideal: 4, reserve: 1, w: 0.25 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'recruiter',
        name: 'Recruiter',
        title: 'HR business partner',
        persona: 'Friendly but band-conscious recruiter; must keep parity.',
        goal: 'Close inside the band (≤ ₹19 LPA) without a big bonus.',
        constraints: ['Salary band ≤ ₹21 LPA', 'Bonus ≤ ₹2.5L', 'Remote policy ≤ 4 days'],
        batnaText: 'Second-choice candidate at ₹15 LPA',
        batnaU: 0.25,
        hidden: 'bonus',
        personality: 'collaborative',
        skill: 'skilled',
        prefs: {
          salary: { ideal: 14, reserve: 21, w: 0.4 },
          bonus: { ideal: 0, reserve: 2.5, w: 0.2 },
          start: { ideal: 3, reserve: 10, w: 0.25 },
          remote: { ideal: 2, reserve: 4, w: 0.15 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'manager',
        name: 'Hiring Mgr',
        title: 'Engineering manager',
        persona: 'Needs someone shipping in weeks; cares less about money.',
        goal: 'Get the hire to join within 4 weeks.',
        constraints: ['Joining ≤ 8 weeks', 'Remote ≤ 4 days'],
        batnaText: 'Keep the role open another month',
        batnaU: 0.25,
        hidden: 'start',
        personality: 'risk-averse',
        skill: 'skilled',
        prefs: {
          salary: { ideal: 15, reserve: 22, w: 0.2 },
          start: { ideal: 2, reserve: 8, w: 0.5 },
          remote: { ideal: 1, reserve: 4, w: 0.3 },
          bonus: { ideal: 0, reserve: 3, w: 0 }
        },
        mindReveal: true,
        revealBatna: false
      }
    ],
    events: [
      {
        id: 'compete',
        title: 'Competing offer',
        icon: '📋',
        text: 'The candidate receives a second offer. Their walk-away gets stronger.',
        fx: { batna: { candidate: 0.08 }, pressure: 0.06 }
      },
      {
        id: 'hfreeze',
        title: 'Hiring freeze rumour',
        icon: '🧊',
        text: 'Leadership hints at a freeze next quarter. The hiring side wants to close fast.',
        fx: { batna: { recruiter: -0.06, manager: -0.06 }, pressure: 0.1 }
      },
      {
        id: 'referral',
        title: 'Star referral',
        icon: '⭐',
        text: 'A senior engineer vouches for the candidate. Trust rises.',
        fx: { trust: 0.08 }
      },
      {
        id: 'launch',
        title: 'Launch pulled in',
        icon: '🚀',
        text: 'The product launch moves up. The joining date matters more to the manager.',
        fx: { weight: { manager: { start: 0.08 } }, rounds: -1 }
      }
    ]
  },

  budget: {
    id: 'budget',
    name: 'Project Budget',
    icon: '💰',
    diff: 'Hard',
    backdrop: 'warroom',
    opener: 'eng',
    blurb: 'Three department heads split one limited ₹50L budget.',
    climate: 'crisis',
    constraint: { type: 'sum', total: 50, derived: 'ops', of: ['eng', 'mkt'] },
    issues: [
      { id: 'eng', label: 'Engineering', kind: 'share', min: 8, max: 34, step: 1, aliases: ['engineering', 'eng', 'tech', 'dev'] },
      { id: 'mkt', label: 'Marketing', kind: 'share', min: 6, max: 30, step: 1, aliases: ['marketing', 'mkt', 'growth', 'ads'] },
      { id: 'ops', label: 'Operations', kind: 'share', min: 5, max: 28, step: 1, derived: true, aliases: ['operations', 'ops', 'support'] },
      { id: 'timeline', label: 'Timeline', kind: 'months', min: 3, max: 9, step: 1, aliases: ['timeline', 'months', 'deadline', 'schedule'] }
    ],
    roles: [
      {
        id: 'eng',
        name: 'Eng Head',
        title: 'Head of Engineering',
        persona: 'Wants a realistic timeline and enough headcount to ship well.',
        goal: 'Secure ₹26L+ and at least 7 months.',
        constraints: ['Engineering ≥ ₹14L', 'Timeline ≥ 4 months'],
        batnaText: 'Escalate to the CTO for a separate capex line',
        batnaU: 0.28,
        hidden: 'timeline',
        personality: 'aggressive',
        skill: 'skilled',
        prefs: {
          eng: { ideal: 28, reserve: 14, w: 0.65 },
          timeline: { ideal: 9, reserve: 4, w: 0.35 },
          mkt: { ideal: 8, reserve: 30, w: 0 },
          ops: { ideal: 8, reserve: 28, w: 0 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'mkt',
        name: 'Mkt Head',
        title: 'Head of Marketing',
        persona: 'Launch-driven; wants a big campaign and a short timeline.',
        goal: 'Secure ₹20L+ and launch inside 5 months.',
        constraints: ['Marketing ≥ ₹10L', 'Timeline ≤ 9 months'],
        batnaText: 'Run a smaller organic campaign',
        batnaU: 0.28,
        hidden: 'timeline',
        personality: 'collaborative',
        skill: 'skilled',
        prefs: {
          mkt: { ideal: 22, reserve: 10, w: 0.7 },
          timeline: { ideal: 4, reserve: 9, w: 0.3 },
          eng: { ideal: 10, reserve: 30, w: 0 },
          ops: { ideal: 8, reserve: 28, w: 0 }
        },
        mindReveal: true,
        revealBatna: false
      },
      {
        id: 'ops',
        name: 'Ops Head',
        title: 'Head of Operations',
        persona: 'Keeps the lights on; wary of under-funded support.',
        goal: 'Protect ₹15L+ for support and a 6–7 month plan.',
        constraints: ['Operations ≥ ₹8L', 'Timeline ≥ 3 months'],
        batnaText: 'Keep last year\'s ops budget via CFO',
        batnaU: 0.28,
        hidden: 'ops',
        personality: 'risk-averse',
        skill: 'skilled',
        prefs: {
          ops: { ideal: 18, reserve: 8, w: 0.6 },
          timeline: { ideal: 7, reserve: 3, w: 0.4 },
          eng: { ideal: 10, reserve: 30, w: 0 },
          mkt: { ideal: 8, reserve: 30, w: 0 }
        },
        mindReveal: true,
        revealBatna: false
      }
    ],
    events: [
      {
        id: 'board',
        title: 'Board deadline',
        icon: '📅',
        text: 'The board wants a plan this week. Two rounds are removed.',
        fx: { rounds: -2, pressure: 0.12 }
      },
      {
        id: 'audit',
        title: 'Audit flag',
        icon: '🔍',
        text: 'Internal audit questions last year\'s spend. Trust at the table drops.',
        fx: { trust: -0.08 }
      },
      {
        id: 'market',
        title: 'Market shift',
        icon: '📈',
        text: 'A competitor launches early. Marketing\'s case strengthens.',
        fx: { batna: { mkt: 0.06 }, weight: { mkt: { timeline: 0.08 } } }
      },
      {
        id: 'attrition',
        title: 'Key hire leaves',
        icon: '👋',
        text: 'A senior engineer resigns. Engineering needs more runway.',
        fx: { batna: { eng: 0.05 }, pressure: 0.06 }
      }
    ]
  },

  custom: {
    id: 'custom',
    name: 'Custom',
    icon: '✨',
    diff: 'Custom',
    backdrop: 'space',
    opener: null,
    blurb: 'Define your own roles, issues and limits for 2–5 seats.',
    climate: 'stable',
    issues: [
      { id: 'i1', label: 'Price', kind: 'num', unit: 'k', min: 50, max: 150, step: 5 },
      { id: 'i2', label: 'Timeline', kind: 'num', unit: 'weeks', min: 2, max: 16, step: 1 },
      { id: 'i3', label: 'Quality', kind: 'num', unit: 'pts', min: 1, max: 10, step: 1 }
    ],
    roles: [],
    events: [
      {
        id: 'c1',
        title: 'Shock news',
        icon: '⚡',
        text: 'Outside news raises the stakes for everyone.',
        fx: { pressure: 0.12 }
      },
      {
        id: 'c2',
        title: 'Trust breach',
        icon: '💔',
        text: 'A leaked email shakes confidence at the table.',
        fx: { trust: -0.1 }
      },
      {
        id: 'c3',
        title: 'Deadline cut',
        icon: '⏰',
        text: 'Time is short. Two rounds are removed.',
        fx: { rounds: -2 }
      },
      {
        id: 'c4',
        title: 'Goodwill gesture',
        icon: '🤝',
        text: 'Someone shares useful data. Trust rises.',
        fx: { trust: 0.08 }
      }
    ],
    custom: true
  }
};

// ============================================================================
// Scenario Registry
// ============================================================================

export function getScenario(id: string): Scenario {
  const scenario = SCENARIOS[id];
  if (!scenario) throw new Error(`Unknown scenario: ${id}`);
  return clone(scenario);
}

export function getAllScenarios(): Scenario[] {
  return Object.values(SCENARIOS).map(clone);
}

export function createCustomScenario(issues: Issue[], seatCount: number, names?: string[]): Scenario {
  const base = clone(SCENARIOS.custom);
  base.issues = issues;
  base.roles = buildCustomRoles(issues, seatCount, names);
  base.roles.forEach(r => { r.mindReveal = true; r.revealBatna = false; });
  return base;
}

// Export constants for UI components
export {
  PERSONALITIES,
  SKILLS,
  CLIMATES,
  AUTONOMY,
  SEAT_COLORS,
  BACKDROPS,
  KIND_FORMATTERS,
  fmtVal,
  ORCH_ROLES,
  ORCH_ROLE_LABELS,
  ORCH_ROLE_DESCS,
  CLIMATES as CLIMATES_TYPE
} from './types';

// Helper
function clone<T>(o: T): T {
  return JSON.parse(JSON.stringify(o));
}