import type { ScenarioPack } from '../core/types';
import { budgetPack } from './budget';
import { jobPack } from './job';
import { vendorPack } from './vendor';

export const PACKS: Record<string, ScenarioPack> = { vendor: vendorPack, job: jobPack, budget: budgetPack };

/** Scenario pack for a scenario id (vendor, job, budget); null for custom scenarios. */
export function getPack(id: string): ScenarioPack | null {
  return PACKS[id] ?? null;
}
export { vendorPack, jobPack, budgetPack };
