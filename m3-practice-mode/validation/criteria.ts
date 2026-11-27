/** What counts as realistic, and how often it must hold. Shared by the validator and the playground. */
export const HARD = new Set(['offer_submitted', 'within_range', 'no_bad_accept', 'lowball_pushback']);
export const LABEL: Record<string, string> = {
  offer_submitted: 'Every offer is submitted', within_range: 'AI offers within allowed ranges',
  no_bad_accept: 'Never accepts below walk-away', lowball_pushback: 'Pushes back on lowballs',
  reciprocity: 'Reciprocates concessions', tone_trust: 'Tone changes trust',
  typed_offer: 'Typed offers understood', acknowledges: 'Replies respond to the move',
  own_limits: 'AI stays within its own limits', deal_reachable: 'Reasonable players reach a deal',
  no_stall: 'No stuck turns',
};
export const THRESHOLD: Record<string, number> = {
  offer_submitted: 1, within_range: 1, no_bad_accept: 1, lowball_pushback: 1,
  reciprocity: 0.8, tone_trust: 0.9, typed_offer: 0.9, acknowledges: 0.8, own_limits: 0.9,
  deal_reachable: 0.7, no_stall: 1,
};
export const ORDER = Object.keys(THRESHOLD);
