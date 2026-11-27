import type { Issue, IssueKind, Scenario } from './engine';
import type { ScenarioPack } from './types';

export interface ParsedOffer {
  x: Record<string, number>;
  found: string[];
}

// unit word after a number -> which kinds of term it can describe
const UNIT_KINDS: Array<[RegExp, IssueKind[]]> = [
  [/^\s*(?:days?\s*(?:a|per|\/)\s*week|d\/wk|remote\s+days?)/i, ['dpw']],
  [/^\s*(?:lpa\b|lakhs?\s+per\s+annum)/i, ['lpa']],
  [/^\s*(?:lakhs?|lacs?|l\b)/i, ['inr', 'lakh', 'share', 'lpa']],
  [/^\s*(?:crores?|cr\b)/i, ['inr']],
  [/^\s*k\b/i, ['inr', 'lakh']],
  [/^\s*(?:days?)\b/i, ['days', 'net']],
  [/^\s*(?:weeks?|wks?)\b/i, ['weeks']],
  [/^\s*(?:months?|mo)\b/i, ['months']],
  [/^\s*%/, ['num']],
];

function unitAfter(text: string, end: number): { kinds: IssueKind[] | null; unit: string } {
  const rest = text.slice(end, end + 24);
  for (const [re, kinds] of UNIT_KINDS) {
    const m = rest.match(re);
    if (m) return { kinds, unit: m[0].trim().toLowerCase() };
  }
  return { kinds: null, unit: '' };
}

function scale(issue: Issue, raw: number, unit: string): number {
  const u = unit.replace(/s$/, '');
  if (issue.kind === 'inr') {
    if (/^(lakh|lac|l)/.test(u)) return raw * 1e5;
    if (/^(crore|cr)/.test(u)) return raw * 1e7;
    if (u === 'k') return raw * 1e3;
    return raw < 1000 ? raw * 1e5 : raw;          // "10.5" for a price means 10.5 lakh
  }
  if (issue.kind === 'lakh' && u === 'k') return raw / 100;
  if ((issue.kind === 'share' || issue.kind === 'lakh' || issue.kind === 'lpa') && raw >= 1000) return raw / 1e5;
  return raw;
}

/**
 * Turn a typed message into offer terms, e.g.
 *   "I can do 10.5 lakh with 20 days delivery and net 30"  -> price 1050000, delivery 20, payment 30
 *   "20L for engineering, 15 for marketing"                -> eng 20, mkt 15 (operations is the remainder)
 * Terms that are not mentioned are kept from `base`. Returns null if no term is found.
 */
export function parseOfferText(text: string, scenario: Scenario, pack?: ScenarioPack | null,
                               base?: Record<string, number> | null): ParsedOffer | null {
  if (!text || !/\d/.test(text)) return null;
  const t = text.toLowerCase().replace(/(\d),(?=\d)/g, '$1').replace(/₹\s*/g, ' rs ');
  const issues = scenario.issues;
  const words = (is: Issue) => [is.label.toLowerCase(), ...(is.aliases || []), ...((pack?.aliases || {})[is.id] || [])]
    .map(w => w.toLowerCase()).filter(w => w.length > 1 && !/^\d/.test(w));

  const values: Record<string, number> = {};
  const found: string[] = [];
  const used = new Set<string>();

  // "net 30" / "net-45" style payment terms
  const net = issues.find(i => i.kind === 'net');
  if (net) {
    const m = t.match(/net[\s-]*(\d{1,3})/);
    if (m) { values[net.id] = +m[1]; used.add(net.id); found.push(net.label); }
  }

  const num = /(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = num.exec(t))) {
    if (net && /net[\s-]*$/.test(t.slice(Math.max(0, m.index - 5), m.index))) continue;
    const raw = parseFloat(m[1]);
    const { kinds, unit } = unitAfter(t, m.index + m[1].length);
    let best: Issue | null = null;
    let bestDist = Infinity;
    for (const is of issues) {
      if (used.has(is.id)) continue;
      if (kinds && !kinds.includes(is.kind)) continue;
      for (const w of words(is)) {
        let k = -1;
        while ((k = t.indexOf(w, k + 1)) >= 0) {
          const d = k < m.index ? m.index - (k + w.length) : (k - (m.index + m[1].length)) * 1.3;
          if (d < bestDist) { bestDist = d; best = is; }
        }
      }
    }
    if (!best && kinds) {                       // a unit alone can identify the term ("20 days")
      const byUnit = issues.filter(is => !used.has(is.id) && kinds.includes(is.kind));
      if (byUnit.length === 1) { best = byUnit[0]; bestDist = 0; }
    }
    if (!best && !kinds) {                      // so can the size of the number ("10,80,000" can only be a price)
      const bySize = issues.filter(is => !used.has(is.id) && raw >= is.min * 0.5 && raw <= is.max * 1.6);
      if (bySize.length === 1) { best = bySize[0]; bestDist = 0; }
    }
    if (!best || bestDist > 40) continue;
    const v = scale(best, raw, unit);
    if (v < best.min * 0.5 || v > best.max * 1.6) continue;
    values[best.id] = Math.min(best.max, Math.max(best.min, v));
    used.add(best.id);
    found.push(best.label);
  }

  if (!found.length) return null;

  // budget-style split: if the remainder share was given with one other share, work out the third
  const c = scenario.constraint;
  if (c && c.type === 'sum' && values[c.derived] != null) {
    const given = c.of.filter(k => values[k] != null);
    if (given.length === 1) {
      const other = c.of.find(k => k !== given[0])!;
      values[other] = c.total - values[c.derived] - values[given[0]];
    }
    delete values[c.derived];
  }

  const x: Record<string, number> = { ...(base || {}) };
  for (const [k, v] of Object.entries(values)) x[k] = v;
  return { x, found };
}
