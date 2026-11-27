import type { ScenarioPack } from '../core/types';

const lakh = (v: number) => `${+(v / 1e5).toFixed(2)} lakh`;

/** Vendor pricing: Buyer, Vendor, Finance haggle over a bulk hardware order. */
export const vendorPack: ScenarioPack = {
  id: 'vendor',
  title: 'Vendor pricing',
  seats: ['buyer', 'vendor'],
  aliases: {
    price: ['amount', 'total', 'deal value', 'per order', 'for the order'],
    delivery: ['lead time', 'dispatch', 'shipping', 'deliver in', 'delivered in'],
    warranty: ['guarantee', 'cover', 'coverage', 'amc'],
    payment: ['credit', 'payment terms', 'pay in', 'invoice'],
  },
  textFor(id, v) {
    if (id === 'price') return lakh(v);
    if (id === 'delivery') return `${v} days delivery`;
    if (id === 'warranty') return `${v} months warranty`;
    if (id === 'payment') return `net ${v}`;
    return String(v);
  },
  reactions: {
    big_concession: {
      aggressive: ['Now that is a serious move on {issue}.'],
      collaborative: ['That is a real step on {issue}, thank you. Let me meet you.', 'Thank you, moving {issue} to {value} changes things.'],
      risk_averse: ['Thank you, {value} on {issue} gives us much more comfort.'],
    },
    concession: {
      aggressive: ['Some movement on {issue}, noted.', 'You moved on {issue}. Here is our step.'],
      collaborative: ['I appreciate the movement on {issue}.', 'Thanks for moving on {issue}, we can step closer too.'],
      risk_averse: ['Thank you for moving on {issue}, that helps us plan the order.'],
    },
    lowball: {
      aggressive: ['At {value} on {issue} that is not a serious number for this volume.', 'That is way off, nowhere near our cost.'],
      collaborative: ['That is too far from what the order costs us to supply.', '{value} for {issue} is well below anything workable.'],
      risk_averse: ['I am afraid {value} on {issue} is too low for us to commit stock.'],
    },
    retreat: {
      aggressive: ['You just stepped back on {issue}. That does not build trust.'],
      collaborative: ['That is a step back on {issue} from your earlier offer.'],
      risk_averse: ['You moved {issue} back from what you offered earlier, which worries us.'],
    },
    threat: {
      aggressive: ['If another supplier can truly match our quality, take that option. Otherwise:'],
      collaborative: ['I understand you have other quotes. Let us make this one work.'],
      risk_averse: ['We hear you have other options. We would rather settle this with you now.'],
    },
    question: {
      aggressive: ['To answer you directly:'],
      collaborative: ['Good question. On our side, the reason is lead time and stock cost:'],
      risk_averse: ['Happy to explain, because delivery risk drives our numbers:'],
    },
  },
  reciprocity: { aggressive: 0.7, collaborative: 1.0, risk_averse: 1.25 },
};
