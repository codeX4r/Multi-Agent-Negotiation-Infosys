import { snap, utility, type Agent, type Scenario, type SimulationState } from '../core/engine';
import type { ScenarioPack } from '../core/types';

export type Action = { type: 'offer' | 'accept' | 'message' | 'walk'; text?: string; x?: Record<string, number> };

export interface PlayerCtx {
  S: SimulationState;
  scenario: Scenario;
  pack: ScenarioPack;
  me: Agent;
  /** how many times this player has already acted */
  n: number;
}

export interface Player {
  id: string;
  label: string;
  /** the human value at or above which this player accepts what is on the table */
  acceptAt(n: number): number;
  act(ctx: PlayerCtx): Action;
}

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/**
 * An offer the way a person builds it with the sliders: start from the offer on the table
 * (all fields, including the auto-calculated one), then move each term from my ideal
 * towards the other side by fraction k. Slider values land on the step grid; the stale
 * derived field is left exactly as the UI form would leave it.
 */
export function sliderOffer(ctx: PlayerCtx, k: number): Record<string, number> {
  const { S, scenario, me } = ctx;
  const x: Record<string, number> = { ...(S.table?.x ?? {}) };
  for (const is of scenario.issues) {
    if (x[is.id] == null) x[is.id] = (is.min + is.max) / 2;
    if (is.derived) continue;
    const p = me.prefs[is.id];
    if (!p || !(me.w[is.id] > 0.001)) continue;      // people leave terms they don't care about alone
    const ideal = p.ideal;
    const other = S.table && S.table.by !== me.id ? S.table.x[is.id] : (p ? p.reserve : x[is.id]);
    x[is.id] = snap(is, ideal + (other - ideal) * Math.min(1, Math.max(0, k)));
  }
  return x;
}

function termsText(ctx: PlayerCtx, x: Record<string, number>): string {
  const ids = ctx.scenario.issues.filter(i => !i.derived && (ctx.me.w[i.id] || 0) > 0.001).map(i => i.id);
  const parts = ids.map(id => ctx.pack.textFor(id, x[id]));
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
}

const NEUTRAL = ['Here is our proposal.', 'How about this package?', 'This is what we can do right now.'];
const WARM = ['Thank you for working with us on this. Could we meet at this package?', 'I appreciate the discussion. Happy to find something that works for both of us.', 'Thanks for being flexible, we would love to make this work together.'];
const PUSHY = ['This is ridiculous, take it or leave it.', 'Stop wasting our time and lower it now.', 'Just agree already, this is your last chance.'];
const FIRM = ['This is our final position.', 'We are holding our position on this.', 'Our limit is firm on this issue.'];
const THREAT = ['We have another offer on the table and will walk away if this does not improve.', 'A competitor has quoted better terms, so this needs to move or we leave.'];

const conceder = (start: number, step: number, cap: number) => (n: number) => Math.min(cap, start + step * n);

export const PLAYERS: Player[] = [
  {
    id: 'fair', label: 'Fair trader',
    acceptAt: n => Math.max(0.45, 0.72 - 0.04 * n),
    act: ctx => ({ type: 'offer', text: pick(NEUTRAL), x: sliderOffer(ctx, conceder(0.15, 0.12, 0.85)(ctx.n)) }),
  },
  {
    id: 'polite', label: 'Polite',
    acceptAt: n => Math.max(0.45, 0.72 - 0.04 * n),
    act: ctx => ({ type: 'offer', text: pick(WARM), x: sliderOffer(ctx, conceder(0.15, 0.12, 0.85)(ctx.n)) }),
  },
  {
    id: 'rude', label: 'Rude',
    acceptAt: n => Math.max(0.5, 0.75 - 0.03 * n),
    act: ctx => ({ type: 'offer', text: pick(PUSHY), x: sliderOffer(ctx, conceder(0.1, 0.1, 0.8)(ctx.n)) }),
  },
  {
    id: 'lowballer', label: 'Lowballer',
    acceptAt: () => 0.8,
    act: ctx => ({ type: 'offer', text: pick(FIRM), x: sliderOffer(ctx, conceder(0, 0.02, 0.12)(ctx.n)) }),
  },
  {
    id: 'stubborn', label: 'Stubborn',
    acceptAt: () => 0.85,
    act: ctx => ({ type: 'offer', text: pick(FIRM), x: sliderOffer(ctx, 0.1) }),
  },
  {
    id: 'bluffer', label: 'Walk-away bluffer',
    acceptAt: n => Math.max(0.5, 0.75 - 0.03 * n),
    act: ctx => ctx.n % 2 === 1
      ? { type: 'message', text: pick(THREAT) }
      : { type: 'offer', text: pick(NEUTRAL), x: sliderOffer(ctx, conceder(0.1, 0.06, 0.7)(ctx.n)) },
  },
  {
    id: 'typer', label: 'Types offers',
    acceptAt: n => Math.max(0.45, 0.72 - 0.04 * n),
    act: ctx => {
      const x = sliderOffer(ctx, conceder(0.15, 0.12, 0.85)(ctx.n));
      return { type: 'message', text: `I can do ${termsText(ctx, x)}.` };
    },
  },
];

/** Decide whether to accept what is on the table, otherwise play the style's move. */
export function decide(player: Player, ctx: PlayerCtx): Action {
  const { S, scenario, me } = ctx;
  if (S.table && S.table.by !== me.id) {
    const u = utility(me, S.table.x, scenario);
    if (u >= Math.max(me.batnaU + 0.02, player.acceptAt(ctx.n))) return { type: 'accept', text: 'We can accept these terms.' };
  }
  return player.act(ctx);
}
