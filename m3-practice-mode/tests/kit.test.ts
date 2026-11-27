import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { installSeed } from '../core/rng';
import { createPracticeSession } from '../core/session';

describe('practice kit on the real engine', () => {
  it('reproduces the dropped-offer bug without the kit', async () => {
    const s = await createPracticeSession({ scenario: 'vendor', seat: 'buyer', kit: false });
    await s.runAI();
    const before = s.state().offers.length;
    s.act({ type: 'offer', text: 'Here is our offer.', x: { price: 1048000, delivery: 22.6, warranty: 13, payment: 31 } });
    expect(s.state().offers.length).toBe(before);              // silently dropped
    expect(s.kit.reports.at(-1)!.checks.find(c => c.id === 'offer_submitted')!.pass).toBe(false);
  });

  it('submits the same offer with the kit, and says what it adjusted', async () => {
    const s = await createPracticeSession({ scenario: 'vendor', seat: 'buyer', kit: true });
    await s.runAI();
    const before = s.state().offers.length;
    const r = s.act({ type: 'offer', text: 'Here is our offer.', x: { price: 1048000, delivery: 22.6, warranty: 13, payment: 31 } });
    expect(s.state().offers.length).toBe(before + 1);
    expect(r.kit!.notes.join(' ')).toMatch(/adjusted/);
  });

  it('turns a typed offer into a real offer', async () => {
    const s = await createPracticeSession({ scenario: 'job', seat: 'candidate', kit: true });
    await s.runAI();
    s.act({ type: 'message', text: 'I could do 19 LPA if I join in 6 weeks with 3 remote days a week' });
    const mine = s.state().offers.filter(o => o.by === 'candidate').at(-1)!;
    expect(mine.x).toMatchObject({ salary: 19, start: 6, remote: 3 });
  });

  it('lowers trust after a pushy message and raises it after a warm one', async () => {
    for (const [text, sign] of [['This is ridiculous, take it or leave it.', -1], ['Thank you, I really appreciate your flexibility.', 1]] as const) {
      const s = await createPracticeSession({ scenario: 'job', seat: 'candidate', kit: true });
      await s.runAI();
      const t0 = s.state().trust.recruiter.candidate;
      s.act({ type: 'message', text });
      expect(Math.sign(s.state().trust.recruiter.candidate - t0)).toBe(sign);
    }
  });

  // property: with the kit, any offer a person can make is recorded, in every scenario
  it('never drops a human offer (property test on the real engine)', async () => {
    for (const sc of ['vendor', 'job', 'budget'] as const) {
      const s = await createPracticeSession({ scenario: sc, kit: true });
      const issues = s.scenario.issues;
      const arb = fc.record(Object.fromEntries(issues.map(is => [is.id, fc.double({ min: is.min, max: is.max, noNaN: true })])));
      await fc.assert(fc.asyncProperty(arb, async raw => {
        const fresh = await createPracticeSession({ scenario: sc, kit: true });
        await fresh.runAI();
        if (!fresh.sim.isHumanTurn()) return true;
        const n = fresh.state().offers.length;
        const r = fresh.act({ type: 'offer', text: 'Offer', x: raw as Record<string, number> });
        return !r.err && fresh.state().offers.length === n + 1;
      }), { numRuns: 25 });
    }
  });

  it('is repeatable with a fixed seed', async () => {
    const run = async () => {
      const restore = installSeed(42);
      try {
        const s = await createPracticeSession({ scenario: 'vendor', seat: 'buyer', kit: true });
        await s.runAI();
        return JSON.stringify(s.state().offers);
      } finally { restore(); }
    };
    expect(await run()).toBe(await run());
  });
});
