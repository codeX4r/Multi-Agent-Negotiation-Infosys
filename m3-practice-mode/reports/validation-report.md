# Practice mode validation report (Milestone 3.4)

Generated 2026-11-27 06:54 UTC. 20 games per player style, 7 styles, 2 human seats per scenario, fixed seeds.
"Before" is the current practice engine with read-only checks. "After" is the same engine, same seeds, with the practice kit attached.

| Check | Threshold | vendor before | vendor after | job before | job after | budget before | budget after |
|---|---|---|---|---|---|---|---|
| Every offer is submitted (hard) | 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ❌ 0.0% | ✅ 100% |
| AI offers within allowed ranges (hard) | 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| Never accepts below walk-away (hard) | 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% |
| Pushes back on lowballs (hard) | 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | n/a | ✅ 100% |
| Reciprocates concessions | 80% | ✅ 94.8% | ✅ 98.6% | ✅ 95.4% | ✅ 99.1% | n/a | ✅ 92.3% |
| Tone changes trust | 90% | n/a | n/a | n/a | n/a | n/a | n/a |
| Typed offers understood | 90% | ❌ 0.0% | ✅ 100% | ❌ 0.0% | ✅ 100% | ❌ 0.0% | ✅ 100% |
| Replies respond to the move | 80% | ❌ 17.6% | ✅ 96.0% | ❌ 18.9% | ✅ 100% | n/a | ✅ 94.3% |
| AI stays within its own limits | 90% | ❌ 84.5% | ❌ 78.5% | ✅ 90.9% | ❌ 88.0% | ✅ 100% | ✅ 100% |
| Reasonable players reach a deal | 70% | ❌ 37.5% | ✅ 94.2% | ✅ 79.2% | ✅ 100% | ❌ 0.0% | ✅ 100% |
| No stuck turns | 100% | ✅ 100% | ✅ 100% | ✅ 100% | ✅ 100% | ❌ 14.3% | ✅ 100% |

| Scenario | Deals before | Deals after | Sessions with ignored moves (before -> after) | Avg rounds (before -> after) |
|---|---|---|---|---|
| vendor | 56/280 | 169/280 | 0 -> 0 | 13.6 -> 10.9 |
| job | 163/280 | 197/280 | 0 -> 0 | 12.2 -> 9.7 |
| budget | 0/280 | 241/280 | 240 -> 0 | 17.4 -> 8.5 |

## Example failures

- **before / vendor / Typed offers understood**: buyer/typer: text mentions Payment, Price, Delivery, Warranty but no offer was recorded
- **before / vendor / Replies respond to the move**: buyer/fair: lowball -> "We can't accept that; price at ₹9,50,000 is out of range. We need pric…"
- **before / vendor / AI stays within its own limits**: buyer/fair: offered past its own limit on Payment
- **before / vendor / Reasonable players reach a deal**: buyer/fair: breakdown (Round limit reached without agreement)
- **before / job / Typed offers understood**: candidate/typer: text mentions Base salary, Joining bonus, Joining date, Remote days but no offer was recorded
- **before / job / Replies respond to the move**: candidate/fair: lowball -> "That doesn't work for us, base salary at ₹21.0 LPA is out of range. St…"
- **before / budget / Every offer is submitted**: eng/fair: offer silently dropped (engine returned ok but recorded nothing)
- **before / budget / Typed offers understood**: eng/typer: text mentions Engineering, Timeline but no offer was recorded
- **before / budget / Reasonable players reach a deal**: eng/fair: breakdown (Round limit reached without agreement)
- **before / budget / No stuck turns**: eng/fair: 28 turn(s) where the move was ignored
- **after / vendor / AI stays within its own limits**: buyer/fair: offered past its own limit on Payment
- **after / job / AI stays within its own limits**: candidate/fair: offered past its own limit on Joining bonus
