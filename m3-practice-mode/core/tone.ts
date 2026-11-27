import { clamp, type SimulationState, type ToneResult, type TranscriptEntry } from './engine';

/** Same trust effects the engine applies to AI tones in commit() */
export const TONE_TRUST: Record<string, number> = { warm: 0.04, firm: 0, wary: -0.01, pushy: -0.07, neutral: 0 };

/**
 * Apply the human's tone to the AI agents' trust and mood.
 * The engine classifies the human's message but passes 'neutral' to commit(),
 * so rude or warm messages had no effect. Returns the trust change (x100, summed over agents).
 */
export function applyHumanTone(S: SimulationState, humanId: string, tone: ToneResult,
                               entry?: TranscriptEntry | null): number {
  const label = tone.label || 'neutral';
  const td = TONE_TRUST[label] || 0;
  let total = 0;
  for (const o of S.agents) {
    if (o.id === humanId || S.trust[o.id]?.[humanId] == null) continue;
    const before = S.trust[o.id][humanId];
    S.trust[o.id][humanId] = clamp(before + td, 0.02, 0.98);
    total += S.trust[o.id][humanId] - before;
    if (label === 'pushy' && S.emo[o.id]) S.emo[o.id].a = clamp(S.emo[o.id].a + 0.11, 0, 1);
    if (label === 'warm' && S.emo[o.id]) S.emo[o.id].v = clamp(S.emo[o.id].v + 0.03, -1, 1);
  }
  S.lastTone[humanId] = label;
  if (entry) {
    entry.tone = label as TranscriptEntry['tone'];
    entry.toneP = tone.p;
    entry.trustDelta = Math.round((entry.trustDelta || 0) + total * 100);
  }
  return Math.round(total * 100);
}
