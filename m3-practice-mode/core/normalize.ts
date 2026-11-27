import { snap, fmtVal, type Scenario } from './engine';

export interface NormalizedOffer {
  x: Record<string, number>;
  notes: string[];
  changed: boolean;
}

/**
 * Make any human offer valid before it reaches the engine, and say what changed.
 *
 * Fixes the dropped-offer bug: the engine's humanAct() silently ignores an offer if
 * applyConstraint() has to change it (values off the step grid, or the budget's
 * derived share being recalculated). After this, applyConstraint() changes nothing,
 * so every offer is recorded.
 */
export function normalizeOffer(input: Record<string, number>, scenario: Scenario,
                               base?: Record<string, number> | null): NormalizedOffer {
  const x: Record<string, number> = {};
  const notes: string[] = [];
  const issues = scenario.issues;

  for (const is of issues) {
    if (is.derived) continue;
    let v = Number(input[is.id]);
    if (!Number.isFinite(v)) {
      v = base && Number.isFinite(base[is.id]) ? base[is.id] : (is.min + is.max) / 2;
      v = snap(is, v);
      notes.push(`${is.label} was missing, kept ${fmtVal(is, v)}`);
    }
    const s = snap(is, v);
    if (Math.abs(s - v) > 1e-9 && fmtVal(is, v) !== fmtVal(is, s)) notes.push(`${is.label} ${fmtVal(is, v)} adjusted to ${fmtVal(is, s)}`);
    x[is.id] = s;
  }

  const c = scenario.constraint;
  if (c && c.type === 'sum') {
    const d = issues.find(i => i.id === c.derived)!;
    const shares = c.of.map(id => issues.find(i => i.id === id)!);
    let derived = c.total - c.of.reduce((s, k) => s + x[k], 0);
    // keep the remainder inside its allowed range by moving the share with the most room
    let guard = 0;
    while ((derived < d.min || derived > d.max) && guard++ < 200) {
      const tooLow = derived < d.min;            // remainder too small -> reduce the other shares
      const pick = shares
        .filter(is => tooLow ? x[is.id] - is.step >= is.min : x[is.id] + is.step <= is.max)
        .sort((a, b) => tooLow ? (x[b.id] - b.min) - (x[a.id] - a.min) : (b.max - x[b.id]) - (a.max - x[a.id]))[0];
      if (!pick) break;
      x[pick.id] = snap(pick, x[pick.id] + (tooLow ? -pick.step : pick.step));
      derived = c.total - c.of.reduce((s, k) => s + x[k], 0);
    }
    const changedShares = shares.filter(is => Math.abs(x[is.id] - snap(is, Number(input[is.id]) || x[is.id])) > 1e-9);
    if (changedShares.length) {
      notes.push(`Adjusted ${changedShares.map(is => `${is.label} to ${fmtVal(is, x[is.id])}`).join(', ')} so the split totals ${c.total}`);
    }
    x[c.derived] = +derived.toFixed(4);
    const entered = Number(input[c.derived]);
    if (Number.isFinite(entered) && Math.abs(entered - derived) > 1e-9) {
      notes.push(`${d.label} is the remainder of the ${c.total} total: ${fmtVal(d, derived)}`);
    }
  }

  const changed = notes.length > 0 || Object.keys(input).some(k => input[k] !== x[k]);
  return { x, notes, changed };
}
