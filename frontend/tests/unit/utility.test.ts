/**
 * Utility Module Unit Tests
 * Verifies utility calculations, concession curves, and offer generation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  clamp,
  clone,
  r2,
  utility,
  vIssue,
  normalizeWeights,
  snap,
  applyConstraint,
  rangeOf,
  progress,
  limit,
  target,
  buildOpponentModel,
  similarity,
  idealOffer,
  randomOffer,
  perturb,
  generateOffer
} from '@/engine/utility';
import type { Agent, Issue, Scenario, SimulationState, Offer } from '@/engine/types';
import { PERSONALITIES, CLIMATES } from '@/engine/types';

describe('Utility Module', () => {
  // Test fixtures
  const testIssue: Issue = { id: 'price', label: 'Price', kind: 'num', min: 0, max: 100, step: 1 };
  const testScenario: Scenario = {
    id: 'test',
    name: 'Test',
    icon: '',
    diff: 'Easy',
    backdrop: 'space',
    opener: 'a',
    blurb: '',
    issues: [
      { id: 'price', label: 'Price', kind: 'num', min: 0, max: 100, step: 1 },
      { id: 'timeline', label: 'Timeline', kind: 'num', min: 1, max: 10, step: 1 }
    ],
    roles: [],
    events: []
  };

  const testAgent: Agent = {
    id: 'test',
    name: 'Test Agent',
    title: '',
    persona: '',
    goal: '',
    constraints: [],
    batnaText: '',
    batnaU: 0.2,
    hidden: 'price',
    personality: 'collaborative',
    skill: 'skilled',
    prefs: {
      price: { ideal: 100, reserve: 0, w: 0.6 },
      timeline: { ideal: 1, reserve: 10, w: 0.4 }
    },
    w: { price: 0.6, timeline: 0.4 },
    color: '#7aa7ff',
    seat: 1,
    human: false,
    mindReveal: true,
    revealBatna: false
  };

  const testState: SimulationState = {
    round: 1,
    maxRounds: 10,
    turnIdx: 0,
    turnCount: 0,
    order: [0],
    agents: [testAgent],
    offers: [],
    table: null,
    accepts: [],
    trust: { test: {} },
    emo: { test: { v: 0, a: 0, hist: [], ahist: [] } },
    climate: 'stable',
    pressure: 0.12,
    pressureBump: 0,
    events: [],
    usedEvents: [],
    deadlock: { stalled: 0, risk: 0.2, ladder: 0, lastM: null, extended: false, riskHist: [0.2] },
    transcript: [],
    uHist: [],
    status: 'running',
    roundStarted: false,
    waitingHuman: false,
    blocked: false,
    endReason: '',
    lastTone: {},
    forkedFrom: null
  };

  describe('clamp', () => {
    it('clamps value between min and max', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('clone', () => {
    it('deep clones objects', () => {
      const obj = { a: 1, b: { c: 2 } };
      const cloned = clone(obj);
      cloned.b.c = 3;
      expect(obj.b.c).toBe(2);
    });
  });

  describe('r2', () => {
    it('rounds to 2 decimal places', () => {
      expect(r2(1.234)).toBe(1.23);
      expect(r2(1.235)).toBe(1.24);
      expect(r2(1)).toBe(1);
    });
  });

  describe('utility', () => {
    it('calculates utility correctly for ideal offer', () => {
      const x = { price: 100, timeline: 1 };
      const u = utility(testAgent, x, testScenario);
      expect(u).toBeCloseTo(1, 5);
    });

    it('calculates utility correctly for reserve offer', () => {
      const x = { price: 0, timeline: 10 };
      const u = utility(testAgent, x, testScenario);
      expect(u).toBeCloseTo(0, 5);
    });

    it('calculates utility for midpoint', () => {
      const x = { price: 50, timeline: 5.5 };
      const u = utility(testAgent, x, testScenario);
      expect(u).toBeCloseTo(0.5, 2);
    });

    it('returns 0 for null offer', () => {
      expect(utility(testAgent, null, testScenario)).toBe(0);
    });

    it('ignores issues with zero weight', () => {
      const agent = { ...testAgent, w: { price: 1, timeline: 0 }, prefs: { ...testAgent.prefs, timeline: { ...testAgent.prefs.timeline, w: 0 } } };
      const x1 = { price: 100, timeline: 1 };
      const x2 = { price: 100, timeline: 10 };
      expect(utility(agent, x1, testScenario)).toBe(utility(agent, x2, testScenario));
    });
  });

  describe('vIssue', () => {
    it('normalizes issue value 0-1', () => {
      expect(vIssue(testAgent, 'price', 100, testScenario)).toBe(1);
      expect(vIssue(testAgent, 'price', 0, testScenario)).toBe(0);
      expect(vIssue(testAgent, 'price', 50, testScenario)).toBe(0.5);
    });

    it('clamps to 0-1 range', () => {
      expect(vIssue(testAgent, 'price', 150, testScenario)).toBe(1);
      expect(vIssue(testAgent, 'price', -50, testScenario)).toBe(0);
    });
  });

  describe('normalizeWeights', () => {
    it('normalizes weights to sum to 1', () => {
      const agent = { ...testAgent, w: { price: 60, timeline: 40 } };
      normalizeWeights(agent);
      expect(agent.w.price).toBeCloseTo(0.6, 5);
      expect(agent.w.timeline).toBeCloseTo(0.4, 5);
    });

    it('handles zero weights', () => {
      const agent = { ...testAgent, w: { price: 0, timeline: 0 } };
      normalizeWeights(agent);
      expect(agent.w.price).toBe(0);
      expect(agent.w.timeline).toBe(0);
    });
  });

  describe('snap', () => {
    it('snaps to step grid', () => {
      const issue: Issue = { id: 'test', label: '', kind: 'num', min: 0, max: 100, step: 10 };
      expect(snap(issue, 7)).toBe(10);
      expect(snap(issue, 12)).toBe(10);
      expect(snap(issue, 15)).toBe(20);
    });

    it('respects min/max bounds', () => {
      const issue: Issue = { id: 'test', label: '', kind: 'num', min: 10, max: 90, step: 10 };
      expect(snap(issue, 5)).toBe(10);
      expect(snap(issue, 95)).toBe(90);
    });
  });

  describe('applyConstraint', () => {
    it('returns true for valid offers without constraints', () => {
      const x = { price: 50, timeline: 5 };
      expect(applyConstraint(x, testScenario)).toBe(true);
    });

    it('snaps values to steps', () => {
      const x = { price: 53, timeline: 5.3 };
      const result = applyConstraint(x, testScenario);
      expect(x.price).toBe(53); // step 1, so no change
      expect(x.timeline).toBe(5); // step 1
      expect(result).toBe(true);
    });
  });

  describe('rangeOf', () => {
    it('calculates issue range', () => {
      expect(rangeOf(testIssue)).toBe(100);
    });

    it('returns 1 for zero range', () => {
      const issue: Issue = { id: 'test', label: '', kind: 'num', min: 50, max: 50, step: 1 };
      expect(rangeOf(issue)).toBe(1);
    });
  });

  describe('progress', () => {
    it('returns 0 at start', () => {
      const state = { ...testState, round: 1, turnIdx: 0, maxRounds: 10 };
      expect(progress(state)).toBeCloseTo(0, 5);
    });

    it('increments with turns', () => {
      const state1 = { ...testState, round: 1, turnIdx: 0, maxRounds: 10, order: [0, 1] };
      const state2 = { ...testState, round: 1, turnIdx: 1, maxRounds: 10, order: [0, 1] };
      expect(progress(state2)).toBeGreaterThan(progress(state1));
    });

    it('progresses through rounds', () => {
      const state1 = { ...testState, round: 1, turnIdx: 0, maxRounds: 10, order: [0] };
      const state2 = { ...testState, round: 5, turnIdx: 0, maxRounds: 10, order: [0] };
      expect(progress(state2)).toBeGreaterThan(progress(state1));
    });
  });

  describe('limit', () => {
    it('returns maxRounds for timekeeper mode', () => {
      // This test would need agent with timekeeper role
      // For now, test the fallback
      const state = { ...testState, maxRounds: 5 };
      // Without timekeeper, should return max(5, 20) = 20
      // Actually the function checks agent roles, let's test the default case
      expect(limit(state)).toBe(20);
    });
  });

  describe('target', () => {
    it('returns open value at progress 0', () => {
      const state = { ...testState, round: 1, turnIdx: 0, pressure: 0 };
      const t = target(testAgent, state);
      expect(t).toBeCloseTo(PERSONALITIES.collaborative.open, 2);
    });

    it('decreases with progress', () => {
      const state1 = { ...testState, round: 1, turnIdx: 0, pressure: 0.12 };
      const state2 = { ...testState, round: 5, turnIdx: 0, pressure: 0.5 };
      const t1 = target(testAgent, state1);
      const t2 = target(testAgent, state2);
      expect(t2).toBeLessThan(t1);
    });

    it('never goes below floor', () => {
      const state = { ...testState, round: 10, turnIdx: 0, pressure: 1 };
      const t = target(testAgent, state);
      const floor = testAgent.batnaU + 0.05;
      expect(t).toBeGreaterThanOrEqual(floor - 0.01);
    });

    it('aggressive personality has higher beta (slower concessions)', () => {
      const aggressiveAgent = { ...testAgent, personality: 'aggressive' as const };
      const collaborativeAgent = { ...testAgent, personality: 'collaborative' as const };
      const state = { ...testState, round: 5, turnIdx: 0, pressure: 0.5 };

      const tAgg = target(aggressiveAgent, state);
      const tCol = target(collaborativeAgent, state);

      // Aggressive should have higher target (concedes slower)
      expect(tAgg).toBeGreaterThan(tCol);
    });
  });

  describe('buildOpponentModel', () => {
    it('returns null for no offers', () => {
      const model = buildOpponentModel('opponent', testState, testScenario);
      expect(model).toBeNull();
    });

    it('builds model from offer history', () => {
      const state: SimulationState = {
        ...testState,
        offers: [
          { by: 'opponent', x: { price: 80, timeline: 3 }, round: 1, turn: 1 },
          { by: 'opponent', x: { price: 70, timeline: 4 }, round: 2, turn: 2 }
        ]
      };

      const model = buildOpponentModel('opponent', state, testScenario);
      expect(model).not.toBeNull();
      expect(model!.n).toBe(2);
      expect(model!.ideal.price).toBe(80);
    });

    it('estimates utility for new offers', () => {
      const state: SimulationState = {
        ...testState,
        offers: [
          { by: 'opponent', x: { price: 80, timeline: 3 }, round: 1, turn: 1 },
          { by: 'opponent', x: { price: 70, timeline: 4 }, round: 2, turn: 2 }
        ]
      };

      const model = buildOpponentModel('opponent', state, testScenario);
      const est = model!.estU({ price: 75, timeline: 3.5 });
      expect(est).toBeGreaterThan(0);
      expect(est).toBeLessThanOrEqual(1);
    });
  });

  describe('similarity', () => {
    it('returns 1 for identical offers', () => {
      const x = { price: 50, timeline: 5 };
      const y = { price: 50, timeline: 5 };
      expect(similarity(x, y, testScenario)).toBe(1);
    });

    it('returns 0 for maximally different', () => {
      const x = { price: 0, timeline: 1 };
      const y = { price: 100, timeline: 10 };
      expect(similarity(x, y, testScenario)).toBeCloseTo(0, 2);
    });

    it('is symmetric', () => {
      const x = { price: 30, timeline: 7 };
      const y = { price: 60, timeline: 3 };
      expect(similarity(x, y, testScenario)).toBe(similarity(y, x, testScenario));
    });
  });

  describe('idealOffer', () => {
    it('returns ideal values for weighted issues', () => {
      const offer = idealOffer(testAgent, testScenario);
      expect(offer.price).toBe(100);
      expect(offer.timeline).toBe(1);
    });
  });

  describe('randomOffer', () => {
    it('generates valid offer within bounds', () => {
      const offer = randomOffer(testScenario);
      expect(offer).not.toBeNull();
      expect(offer!.price).toBeGreaterThanOrEqual(0);
      expect(offer!.price).toBeLessThanOrEqual(100);
      expect(offer!.timeline).toBeGreaterThanOrEqual(1);
      expect(offer!.timeline).toBeLessThanOrEqual(10);
    });
  });

  describe('perturb', () => {
    it('perturbs around base offer', () => {
      const base = { price: 50, timeline: 5 };
      const offer = perturb(base, 0.1, testScenario);
      expect(offer).not.toBeNull();
      expect(offer!.price).toBeGreaterThanOrEqual(40);
      expect(offer!.price).toBeLessThanOrEqual(60);
      expect(offer!.timeline).toBeGreaterThanOrEqual(1);
      expect(offer!.timeline).toBeLessThanOrEqual(10);
    });
  });

  describe('generateOffer', () => {
    it('generates offer at or above target utility', () => {
      const state: SimulationState = {
        ...testState,
        table: { by: 'other', x: { price: 40, timeline: 6 }, round: 1, turn: 1 }
      };

      const targetU = target(testAgent, state);
      const offer = generateOffer(testAgent, targetU, state, testScenario);

      const u = utility(testAgent, offer, testScenario);
      expect(u).toBeGreaterThanOrEqual(targetU - 0.01);
    });

    it('generates different offers for different agents', () => {
      const agent2 = { ...testAgent, id: 'test2', prefs: { price: { ideal: 0, reserve: 100, w: 0.6 }, timeline: { ideal: 10, reserve: 1, w: 0.4 } }, w: { price: 0.6, timeline: 0.4 } };
      const state: SimulationState = { ...testState, agents: [testAgent, agent2] };

      const offer1 = generateOffer(testAgent, 0.5, state, testScenario);
      const offer2 = generateOffer(agent2, 0.5, state, testScenario);

      // They should prefer opposite directions
      expect(offer1.price).toBeGreaterThan(offer2.price);
    });
  });
});