export type BackendResultOutcome = 'deal' | 'breakdown' | 'deadlock';
export type BackendDecision = 'open' | 'counter' | 'accept' | 'reject' | 'message' | 'walk';

export function getOutcomeTitle(outcome: BackendResultOutcome): string {
  switch (outcome) {
    case 'deal':
      return 'Deal reached';
    case 'breakdown':
      return 'No deal: talks broke down';
    case 'deadlock':
      return 'Deadlock: round limit reached';
  }
}

export function getSatisfactionTitle(outcome: BackendResultOutcome): string {
  return outcome === 'deal' ? 'Party satisfaction' : 'Closest positions';
}

export function formatOutcomeReason(
  outcome: BackendResultOutcome,
  reason: string,
): string {
  if (outcome === 'deal') {
    const round = reason.match(/at round (\d+)/i)?.[1];
    return round ? `All parties agreed in round ${round}.` : 'All parties reached an agreement.';
  }

  if (outcome === 'deadlock') {
    const stalledRounds = reason.match(/for (\d+) consecutive rounds/i)?.[1];
    if (stalledRounds) {
      return `Talks stalled for ${stalledRounds} rounds without a new offer.`;
    }
    const rounds = reason.match(/within (\d+) rounds/i)?.[1];
    return rounds
      ? `No agreement was reached in ${rounds} rounds.`
      : 'The round limit was reached before everyone agreed.';
  }

  const rejection = reason.match(
    /^(.+?) rejected at round (\d+): (.+?) terms were beyond (?:their|its) walk-away limit\.?$/i,
  );
  if (rejection) {
    return `${rejection[1]} rejected the offer over ${rejection[3]} in round ${rejection[2]}.`;
  }
  return 'The parties could not agree on the terms.';
}

export function formatTurnReason(
  decision: BackendDecision,
  reason: string,
): string {
  if (!reason.trim()) return '';
  if (/utility|threshold|walk-away|batna/i.test(reason)) {
    switch (decision) {
      case 'open':
        return 'I opened with the terms I wanted most.';
      case 'counter':
        return 'I suggested a change to better match my needs.';
      case 'accept':
        return 'I was comfortable with the offer.';
      case 'reject':
        return 'I could not accept the offer.';
    }
  }
  return reason;
}

export function shouldShowTurnReasoning(enabled: boolean, reason?: string): boolean {
  return enabled && Boolean(reason?.trim());
}
