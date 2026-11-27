import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { applyConstraint, getScenario } from '../core/engine';
import { normalizeOffer } from '../core/normalize';

const scenarios = ['vendor', 'job', 'budget'].map(getScenario);

describe('normalizeOffer', () => {
  it('snaps slider values and reports the change', () => {
    const sc = getScenario('vendor');
    const r = normalizeOffer({ price: 1048000, delivery: 22.6, warranty: 13, payment: 31 }, sc);
    expect(r.x).toEqual({ price: 1050000, delivery: 23, warranty: 12, payment: 30 });
    expect(r.notes.join(' ')).toMatch(/Price/);
  });

  it('fills the budget remainder instead of leaving a stale value', () => {
    const sc = getScenario('budget');
    const r = normalizeOffer({ eng: 25, mkt: 12, ops: 16.5, timeline: 7 }, sc);
    expect(r.x.ops).toBe(13);
    expect(r.notes.join(' ')).toMatch(/remainder/);
  });

  it('rebalances a split whose remainder would fall below its minimum', () => {
    const sc = getScenario('budget');
    const r = normalizeOffer({ eng: 26, mkt: 20, timeline: 8 }, sc);
    expect(r.x.eng + r.x.mkt + r.x.ops).toBe(50);
    expect(r.x.ops).toBeGreaterThanOrEqual(5);
  });

  // property: whatever a slider or text produces, the engine's own constraint check finds nothing to change
  it('always yields an offer the engine accepts unchanged (property test)', () => {
    for (const sc of scenarios) {
      const arb = fc.record(Object.fromEntries(sc.issues.map(is => [is.id, fc.double({ min: is.min - 5, max: is.max + 5, noNaN: true })])));
      fc.assert(fc.property(arb, raw => {
        const { x } = normalizeOffer(raw as Record<string, number>, sc);
        const copy = { ...x };
        const ok = applyConstraint(copy, sc);
        return ok && JSON.stringify(copy) === JSON.stringify(x);
      }), { numRuns: 400 });
    }
  });
});
