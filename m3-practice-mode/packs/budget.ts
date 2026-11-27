import type { ScenarioPack } from '../core/types';

/** Project budget: three department heads split a fixed ₹50L budget. */
export const budgetPack: ScenarioPack = {
  id: 'budget',
  title: 'Project budget',
  seats: ['eng', 'mkt'],
  aliases: {
    eng: ['engineering budget', 'tech budget', 'development', 'product'],
    mkt: ['marketing budget', 'campaign', 'launch spend', 'promotion'],
    ops: ['operations budget', 'support budget', 'ops team'],
    timeline: ['months timeline', 'duration', 'delivery plan', 'launch in'],
  },
  textFor(id, v) {
    if (id === 'eng') return `${v} lakh for engineering`;
    if (id === 'mkt') return `${v} lakh for marketing`;
    if (id === 'ops') return `${v} lakh for operations`;
    if (id === 'timeline') return `a ${v} month timeline`;
    return String(v);
  },
  reactions: {
    big_concession: {
      aggressive: ['That is a real shift in the split.'],
      collaborative: ['Thank you, freeing up {issue} like that helps every team.'],
      risk_averse: ['Thank you, that movement on {issue} makes the plan far safer.'],
    },
    concession: {
      aggressive: ['Some movement on {issue}, noted.'],
      collaborative: ['I appreciate you moving on {issue}.', 'Thanks for giving ground on {issue}, let us rebalance.'],
      risk_averse: ['Thank you for moving on {issue}, that reduces the risk for operations.'],
    },
    lowball: {
      aggressive: ['{value} on {issue} leaves us unable to deliver. Not workable.', 'That split is way off.'],
      collaborative: ['That split is too far from what each team needs.', '{value} for {issue} is well below what keeps the plan alive.'],
      risk_averse: ['I am afraid {value} on {issue} would put the whole plan at risk.'],
    },
    retreat: {
      aggressive: ['You took back what you gave on {issue}.'],
      collaborative: ['That is a step back on {issue} from your earlier split.'],
      risk_averse: ['You moved {issue} back from your earlier split, which worries us.'],
    },
    threat: {
      aggressive: ['Escalating to the CFO is an option for all of us. For now:'],
      collaborative: ['I understand you could escalate. Let us agree a split ourselves.'],
      risk_averse: ['We hear you have other options, but a split we agree on is safer:'],
    },
    question: {
      aggressive: ['To answer directly:'],
      collaborative: ['Good question. The reason is what each team must deliver this year:'],
      risk_averse: ['Happy to explain, because support capacity is the risk:'],
    },
  },
  reciprocity: { aggressive: 0.75, collaborative: 1.0, risk_averse: 1.25 },
};
