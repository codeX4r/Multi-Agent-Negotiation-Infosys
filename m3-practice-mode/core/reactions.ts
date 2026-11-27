import { fmtVal, type Agent, type Scenario } from './engine';
import type { HumanMove, Reactions, ScenarioPack } from './types';

/** Fallback lines used when a scenario pack has nothing for a move. */
export const GENERIC_REACTIONS: Reactions = {
  big_concession: { aggressive: ['That is a real step, noted.'], collaborative: ['Thank you, that is a generous move.'], risk_averse: ['Thank you, that movement helps a lot.'] },
  concession: { aggressive: ['Some movement, finally.'], collaborative: ['I appreciate you moving on {issue}.'], risk_averse: ['Thank you for moving, that helps.'] },
  lowball: { aggressive: ['That is way off, not a serious number.'], collaborative: ['That is too far from where we can be.'], risk_averse: ['I am afraid that is well below anything we can do.'] },
  retreat: { aggressive: ['You just stepped back from your own offer.'], collaborative: ['That is a step back from your earlier offer.'], risk_averse: ['You moved away from what you offered earlier, which worries me.'] },
  threat: { aggressive: ['If you have a better alternative, take it. Otherwise:'], collaborative: ['I understand you have other options. Let us try to make this work.'], risk_averse: ['I hear that you have other options. We would rather settle this with you.'] },
  question: { aggressive: ['To answer you directly:'], collaborative: ['Good question. Here is where we stand:'], risk_averse: ['Happy to explain:'] },
};

function pick<T>(arr: T[] | undefined): T | undefined {
  return arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

/** The sentence an AI agent says first to show it noticed the human's move. */
export function reactionLine(pack: ScenarioPack | null, move: HumanMove | undefined, agent: Agent,
                             scenario: Scenario, lastHumanOffer: Record<string, number> | null): string | null {
  if (!move) return null;
  const line = pick(pack?.reactions[move.type]?.[agent.personality]) ?? pick(GENERIC_REACTIONS[move.type]?.[agent.personality]);
  if (!line) return null;
  const is = scenario.issues.find(i => i.id === move.issueId) ?? scenario.issues.find(i => !i.derived)!;
  const value = lastHumanOffer && is ? fmtVal(is, lastHumanOffer[is.id]) : '';
  return line.replace(/\{issue\}/g, is.label.toLowerCase()).replace(/\{value\}/g, value);
}
