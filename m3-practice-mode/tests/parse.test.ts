import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { getScenario, snap } from '../core/engine';
import { parseOfferText } from '../core/parse';
import { getPack } from '../packs';

describe('parseOfferText', () => {
  const vendor = getScenario('vendor'), job = getScenario('job'), budget = getScenario('budget');

  it('reads vendor terms in everyday wording', () => {
    const r = parseOfferText('I can do 10.5 lakh with 20 days delivery, 18 months warranty and net 45', vendor, getPack('vendor'))!;
    expect(r.x).toMatchObject({ price: 1050000, delivery: 20, warranty: 18, payment: 45 });
  });

  it('reads rupee amounts with Indian commas', () => {
    const r = parseOfferText('Final: ₹10,80,000 and delivery in 25 days', vendor, getPack('vendor'))!;
    expect(r.x).toMatchObject({ price: 1080000, delivery: 25 });
  });

  it('reads job terms', () => {
    const r = parseOfferText('I could accept 19 LPA if I can join in 6 weeks with 3 remote days a week', job, getPack('job'))!;
    expect(r.x).toMatchObject({ salary: 19, start: 6, remote: 3 });
  });

  it('reads a budget split and works out the missing share from operations', () => {
    const r = parseOfferText('Give engineering 22 lakh and operations 13, over 7 months', budget, getPack('budget'))!;
    expect(r.x).toMatchObject({ eng: 22, mkt: 15, timeline: 7 });
  });

  it('keeps terms that were not mentioned from the base offer', () => {
    const r = parseOfferText('price 11 lakh', vendor, getPack('vendor'), { price: 1200000, delivery: 30, warranty: 12, payment: 15 })!;
    expect(r.x).toEqual({ price: 1100000, delivery: 30, warranty: 12, payment: 15 });
  });

  it('returns null for messages without terms', () => {
    expect(parseOfferText('Thanks, let me think about it.', vendor, getPack('vendor'))).toBeNull();
  });

  // property: whatever the pack writes for a value, the parser reads it back
  it('round-trips every term the way the packs write it (property test)', () => {
    for (const id of ['vendor', 'job', 'budget'] as const) {
      const sc = getScenario(id), pack = getPack(id)!;
      for (const is of sc.issues.filter(i => !i.derived)) {
        fc.assert(fc.property(fc.integer({ min: 0, max: Math.round((is.max - is.min) / is.step) }), k => {
          const v = snap(is, is.min + k * is.step);
          const r = parseOfferText(`We propose ${pack.textFor(is.id, v)}.`, sc, pack);
          return !!r && Math.abs(r.x[is.id] - v) < 1e-6;
        }), { numRuns: 60 });
      }
    }
  });
});
