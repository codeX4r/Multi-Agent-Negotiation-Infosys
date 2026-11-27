# Practice Mode Realism Kit (Milestone 3.4)

**Task 3.4: validate Practice Mode across all three scenarios, making sure the AI agents respond realistically.**

This folder does two things:

1. **Validates** the team's practice mode. It plays thousands of sessions on the real engine
   (`frontend/src/engine`) with simulated players, checks every turn against written rules, and writes a report.
2. **Fixes** what the validation found, as a separate module that attaches to a running practice session with
   one line. It changes none of the team's files. There is one pack per scenario (vendor, job, budget), so
   each practice mode can be tuned on its own.

It runs on its own: in a terminal, in a single offline HTML playground, and as a test suite.
It needs no backend and no API key.

Built on the team's practice-mode engine and the Milestone 1 architecture. Author: Annika.

## What "realistic" means here

Every turn is checked against these rules. Hard rules must hold every time; the rest must reach a threshold.

| Check | What it means | Needs |
|---|---|---|
| Every offer is submitted (hard) | An offer the player makes is actually recorded | 100% |
| AI offers within allowed ranges (hard) | Every AI term is inside the scenario's ranges, and budget splits add up | 100% |
| Never accepts below walk-away (hard) | An AI never accepts a deal worth less than its BATNA | 100% |
| Pushes back on lowballs (hard) | An offer below the AI's walk-away is never accepted | 100% |
| Reciprocates concessions | After the player concedes, a counterpart gives something back | 80% |
| Tone changes trust | Pushy messages lower the AI's trust, warm ones raise it | 90% |
| Typed offers understood | Terms written in a message become a real offer | 90% |
| Replies respond to the move | The reply acknowledges a lowball, concession, retreat or threat | 80% |
| AI stays within its own limits | No single AI term goes past that agent's own reserve | 90% |
| Reasonable players reach a deal | Fair, polite and typing players can close a deal | 70% |
| No stuck turns | The session never gets stuck on one turn | 100% |

Seven player styles play every seat of every scenario: fair, polite, rude, lowballer, stubborn, bluffer and
typer (who writes offers in words). Seeds are fixed, so every run is repeatable.

## Results (20 games per style, seat and scenario: 1,680 sessions)

| Check | Vendor before / after | Job before / after | Budget before / after |
|---|---|---|---|
| Every offer is submitted | 100 / 100 | 100 / 100 | **0 / 100** |
| Reciprocates concessions | 94.8 / 98.5 | 95.4 / 99.4 | n/a / 92.2 |
| Tone changes trust | **0 / 95.2** | **0 / 99.2** | **0 / 99.2** |
| Typed offers understood | **0 / 100** | **0 / 100** | **0 / 100** |
| Replies respond to the move | **17.6 / 95.9** | **18.9 / 100** | n/a / 94.4 |
| Reasonable players reach a deal | **37.5 / 95.8** | 79.2 / 100 | **0 / 100** |
| No stuck turns | 100 / 100 | 100 / 100 | **14.3 / 100** |
| AI stays within its own limits | 84.5 / 78.2 | 90.9 / 87.6 | 100 / 100 |
| Deals | 56 to 169 of 280 | 163 to 197 of 280 | 0 to 239 of 280 |

The full report, with an example for every failure, is in `reports/validation-report.md`.

Main findings in the current engine:

- **Budget practice mode cannot be played.** Every offer from the player is silently dropped, because the
  stale operations share fails the 50-lakh total and `humanAct` returns early. 240 of 280 sessions get stuck.
- **Tone does nothing.** It is classified, then passed to the engine as `neutral`.
- **Offers written in words are ignored.**
- **The AI does not react to what the player did.** Replies are generic, and the concession curve is
  planned for 20 rounds in a 12-round session.
- **An open engine finding:** the offer generator can put one term past the agent's own limit. This needs a
  small engine fix (in INTEGRATION.md); the kit reports it but cannot patch it from outside.

## How it works

| File | What it does |
|---|---|
| `core/kit.ts` | `attachPracticeKit(sim)`: wraps `humanAct`, `aiAct` and the rephrase hook on one session |
| `core/normalize.ts` | Snaps offers onto the slider grid and fills the budget remainder, so the engine never drops them |
| `core/parse.ts` | Reads terms out of plain text: lakh, crore, LPA, k, days, weeks, months, percent, "net 30" |
| `core/moves.ts` | Classifies the player's move (concession, lowball, retreat, threat...) and who is a counterpart or an ally |
| `core/reciprocity.ts` | Turns the move into AI goodwill or resistance, by personality, and fixes the round limit |
| `core/tone.ts` | Passes the player's tone through to AI trust and mood |
| `core/reactions.ts` | Picks a reply opener that answers the move |
| `core/checks.ts` | The realism checks, run after every human and AI turn |
| `packs/*.ts` | One pack per scenario: vocabulary, wording, reactions, how each personality reciprocates |
| `validation/` | Player styles, the criteria, and the validator that writes the report |
| `tests/` | Unit tests plus property tests (fast-check) on the real engine |
| `play.ts` | Terminal practice mode |
| `playground/` | Source for the offline HTML playground |

## Commands

Run everything from inside this folder. You need Node 18 or newer.

```bash
cd m3-practice-mode
npm install

npm run validate                         # full validation, about a minute; writes reports/
npm run validate -- --games 5            # quicker run

npm run play -- --scenario budget        # play in the terminal, with the kit
npm run play -- --scenario budget --no-kit   # same thing on the current engine, to compare
npm run play -- --scenario vendor --seat vendor --seed 7

npm test                                 # unit and property tests
npm run typecheck

npm run build:playground                 # writes demo/practice-playground.html, open it in a browser
```

In the terminal game you can type normally ("I can do 10.5 lakh with 20 days delivery") or use
`/offer price=1050000 delivery=20`, `/accept`, `/walk`, `/table`, `/help`, `/quit`.

Seats: vendor `buyer` or `vendor`, job `candidate` or `recruiter`, budget `eng` or `mkt`.

## Integrating

See [INTEGRATION.md](INTEGRATION.md). In short, one line after `sim.init(engineConfig)` in `useSimulation.ts`:

```ts
if (engineConfig.mode === 'practice') attachPracticeKit(sim);
```
