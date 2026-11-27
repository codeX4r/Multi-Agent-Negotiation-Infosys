import type { ScenarioPack } from '../core/types';

/** Job offer: Candidate, Recruiter, Hiring manager settle salary and perks. */
export const jobPack: ScenarioPack = {
  id: 'job',
  title: 'Job offer',
  seats: ['candidate', 'recruiter'],
  aliases: {
    salary: ['compensation', 'fixed', 'annual', 'per annum', 'base pay', 'offer of'],
    bonus: ['sign on', 'joining amount', 'one-time'],
    start: ['notice', 'notice period', 'join in', 'joining in', 'start in', 'can start'],
    remote: ['work from home', 'wfh days', 'remote', 'from home'],
  },
  textFor(id, v) {
    if (id === 'salary') return `${v} LPA`;
    if (id === 'bonus') return `${v} lakh joining bonus`;
    if (id === 'start') return `join in ${v} weeks`;
    if (id === 'remote') return `${v} remote days a week`;
    return String(v);
  },
  reactions: {
    big_concession: {
      aggressive: ['That is a significant move on {issue}.'],
      collaborative: ['Thank you, {value} on {issue} brings us much closer.'],
      risk_averse: ['Thank you, that movement on {issue} makes this much easier to approve.'],
    },
    concession: {
      aggressive: ['Noted, you moved on {issue}.'],
      collaborative: ['I appreciate the flexibility on {issue}.', 'Thanks for moving on {issue}, let me see what I can do.'],
      risk_averse: ['Thank you for moving on {issue}, that helps with internal approval.'],
    },
    lowball: {
      aggressive: ['{value} on {issue} is not realistic for this role.', 'That is way off our band.'],
      collaborative: ['That is too far from what the role and band allow.', '{value} for {issue} is well below what we can work with.'],
      risk_averse: ['I am afraid {value} on {issue} would not get approved here.'],
    },
    retreat: {
      aggressive: ['You stepped back on {issue}. That makes this harder.'],
      collaborative: ['That is a step back on {issue} from what we discussed earlier.'],
      risk_averse: ['You moved {issue} back from your earlier position, which concerns me.'],
    },
    threat: {
      aggressive: ['If the other offer is truly better, you should consider it. Here is ours:'],
      collaborative: ['I understand you have another offer. Let us find a package that works.'],
      risk_averse: ['I hear you have other options. We would like to close this with you.'],
    },
    question: {
      aggressive: ['To answer directly:'],
      collaborative: ['Good question. The reason is internal parity across the team:'],
      risk_averse: ['Happy to explain, because the band is set for the whole team:'],
    },
  },
  reciprocity: { aggressive: 0.7, collaborative: 1.05, risk_averse: 1.3 },
};
