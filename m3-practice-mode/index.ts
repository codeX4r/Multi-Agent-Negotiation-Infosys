/**
 * Practice Mode Realism Kit (Milestone 3.4)
 *
 *   import { attachPracticeKit } from '<path>/m3-practice-mode';
 *   attachPracticeKit(sim);   // right after sim.init(engineConfig)
 */
export { attachPracticeKit, ALL_ON, CHECKS_ONLY, type KitOptions, type PracticeKit } from './core/kit';
export { normalizeOffer } from './core/normalize';
export { parseOfferText } from './core/parse';
export { classifyMove, isCounterpart } from './core/moves';
export { reciprocityBoost, correctedPressure } from './core/reciprocity';
export { applyHumanTone } from './core/tone';
export { humanTurnChecks, aiTurnChecks } from './core/checks';
export { createPracticeSession } from './core/session';
export { getPack, PACKS, vendorPack, jobPack, budgetPack } from './packs';
export type { ScenarioPack, HumanMove, Check, TurnReport } from './core/types';
