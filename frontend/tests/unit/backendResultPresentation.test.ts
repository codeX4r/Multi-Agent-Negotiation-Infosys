import { describe, expect, it } from 'vitest';
import {
  formatOutcomeReason,
  formatTurnReason,
  getOutcomeTitle,
  getSatisfactionTitle,
  shouldShowTurnReasoning,
} from '@/lib/backendResultPresentation';

describe('backend result presentation', () => {
  it('uses clear titles and satisfaction labels for each outcome', () => {
    expect(getOutcomeTitle('deal')).toBe('Deal reached');
    expect(getOutcomeTitle('breakdown')).toBe('No deal: talks broke down');
    expect(getOutcomeTitle('deadlock')).toBe('Deadlock: round limit reached');
    expect(getSatisfactionTitle('deal')).toBe('Party satisfaction');
    expect(getSatisfactionTitle('breakdown')).toBe('Closest positions');
    expect(getSatisfactionTitle('deadlock')).toBe('Closest positions');
  });

  it('formats outcome reasons without exposing backend terminology', () => {
    expect(formatOutcomeReason('deal', 'All parties accepted the offer at round 3.'))
      .toBe('All parties agreed in round 3.');
    expect(formatOutcomeReason('breakdown', 'Vendor rejected at round 12: payment terms were beyond its walk-away limit'))
      .toBe('Vendor rejected the offer over payment in round 12.');
    expect(formatOutcomeReason(
      'breakdown',
      'Finance rejected at round 12: payment timing terms were beyond their walk-away limit.',
    )).toBe('Finance rejected the offer over payment timing in round 12.');
    expect(formatOutcomeReason('deadlock', 'No agreement was reached within 12 rounds.'))
      .toBe('No agreement was reached in 12 rounds.');
    expect(formatOutcomeReason(
      'deadlock',
      'No new offer appeared for 3 consecutive rounds; the configured deadlock limit was reached.',
    )).toBe('Talks stalled for 3 rounds without a new offer.');
  });

  it('shows natural turn explanations only when enabled', () => {
    expect(formatTurnReason('counter', 'Offer is below my utility threshold.'))
      .toBe('I suggested a change to better match my needs.');
    expect(formatTurnReason('open', 'I want to begin with a fair proposal.'))
      .toBe('I want to begin with a fair proposal.');
    expect(shouldShowTurnReasoning(false, 'I suggested a change.')).toBe(false);
    expect(shouldShowTurnReasoning(true, '  ')).toBe(false);
    expect(shouldShowTurnReasoning(true, 'I suggested a change.')).toBe(true);
  });
});
