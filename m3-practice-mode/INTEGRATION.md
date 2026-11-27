# Integrating the practice kit into the app

The kit is built to drop into the existing practice mode without changing any of the team's engine files.
It attaches to one running simulation and wraps three methods on that instance only:
`humanAct`, `aiAct` and `hooks.rephrase`. Everything else (the Simulation class, the orchestrator, the
LLM wording hook, the backend) keeps working as it does today.

## 1. Copy or reference the folder

Either keep `m3-practice-mode/` at the repo root (as it is on this branch), or move it to
`frontend/src/practice-kit/`. If you move it, change only the paths in `core/engine.ts`, for example:

```ts
export { utility, snap, applyConstraint, progress, idealOffer } from '@/engine/utility';
// ...same for the other lines
```

`core/engine.ts` is the only file that knows where the engine lives.

## 2. One line in `frontend/src/hooks/useSimulation.ts`

Right after the simulation is initialised (currently line 316):

```ts
import { attachPracticeKit } from '@/practice-kit';      // or the relative path to m3-practice-mode

        await sim.init(engineConfig);
        if (engineConfig.mode === 'practice') attachPracticeKit(sim);   // <- add this
        activeSim = sim;
```

That is all that is needed for all three scenarios. The kit picks the right scenario pack
(vendor, job or budget) from the running scenario on its own.

What changes for the player straight away:

| Before | After |
|---|---|
| Slider offers that are not on the step grid are silently dropped (`adjusted: true`, nothing recorded). On the budget scenario this happens to every offer, so the session never moves. | Every offer is snapped onto the grid, the budget remainder is filled in, and the offer is recorded. The returned `kit.notes` say what was adjusted. |
| "I can do 10.5 lakh with 20 days delivery" is treated as chat only. | Terms are read out of the message and submitted as a real offer. |
| Tone is classified, then `commit()` is called with `'neutral'`, so being rude or warm changes nothing. | The player's tone moves the AI's trust and mood. |
| The AI always plans for 20 rounds (see `limit()` below), so it concedes too slowly in a 12-round session. | The concession curve runs on the session's real round limit. |
| The AI ignores what the player just did. | Counterparts give back after a concession, harden after a lowball or a retreat, and react to threats by personality. Allies (Finance for the buyer, the Hiring Manager for the recruiter) are left alone. |
| Replies are generic. | Each reply opens with a line that answers the player's move, written per scenario and per personality. The LLM wording hook still runs after it. |

## 3. Optional: show the checks in the UI

```ts
const kit = attachPracticeKit(sim);
kit.onReport(report => {
  // report.actorName, report.checks: [{ id, label, pass, detail, hard }], report.notes
});
```

`humanAct` also returns `kit.notes` (for example "Operations is the remainder of the 50 total: ₹14 L"),
which fits in a small toast under the composer.

## 4. Turning parts on or off

```ts
attachPracticeKit(sim, { reactions: false });     // keep everything else, no reaction lines
attachPracticeKit(sim, CHECKS_ONLY);              // change nothing, only measure (this is "before" in the report)
kit.detach();                                     // restore the original methods
```

Options: `normalize`, `parse`, `tone`, `reciprocity`, `limitFix`, `reactions`, `checks`, `pack`.

## 5. Personalising a scenario

Each scenario has its own pack in `packs/`. A pack holds the words players use for each term
(`aliases`), how a value is written (`textFor`), reaction lines per move type and personality, and how
strongly each personality reciprocates. Editing a pack changes only that practice mode.
A fourth scenario needs a new pack file and one line in `packs/index.ts`; without a pack the kit still
works using generic reaction lines.

## Recommended engine patches (upstream)

The kit works around these at runtime, but they are real bugs in `frontend/src/engine` and are worth
fixing at the source. Once they are fixed, the matching kit option can be switched off.

1. **Dropped offers.** `orchestrator.ts` around line 644 returns `{ ok: true, adjusted: true }` when
   `applyConstraint` changes the offer, without recording it. Record the adjusted offer instead of returning.
   Kit option that covers it: `normalize`.
2. **Tone never reaches the AI.** `orchestrator.ts` line 665 calls `this.commit(human, ..., 'neutral')`.
   Pass the classified tone, and let it move trust. Kit option: `tone`.
3. **Round limit.** `utility.ts limit()` checks for an agent with id `timekeeper`, which never exists
   (the timekeeper is an orchestrator role), so it always returns at least 20. Use the timekeeper role
   flag from the engine config. Kit option: `limitFix`.
4. **Offers past the agent's own limit.** `utility.ts generateOffer()` filters candidates by total utility
   only, so one term can land past the agent's own reserve (for example a buyer offering longer payment
   terms than it would accept). Add one filter before the band selection:

   ```ts
   const inOwnLimits = (x) => scenario.issues.every(is => {
     const p = agent.prefs[is.id]; if (!p || agent.w[is.id] < 0.001) return true;
     return p.ideal >= p.reserve ? x[is.id] >= p.reserve : x[is.id] <= p.reserve;
   });
   const pool = candidates.filter(c => inOwnLimits(c.x));
   ```

   The kit cannot patch this from outside (the function is imported directly), so the report shows it
   as an open engine finding (78 to 91 percent on vendor and job).
