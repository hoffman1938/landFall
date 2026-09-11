# RTP and PAR Sheet — LANDFALL

**Closes:** G24 (documented half; the live half is `paytableRecord()` in
`packages/server/src/reporting.ts`).
**Obligations:** Order 240 Art. 2.2(a.e) — RTP is a **reported figure** in the state electronic
control system. GLI-19 §A.6.1 — documented theoretical RTP per game, records of changes affecting
it, and a **periodic comparison of theoretical and actual**. GLI-19 §4.7.2 — where RTP is
displayed, explain how it was determined and disclose the jackpot contribution. GLI-19 §2.8.3 —
a theme/paytable record carrying theoretical RTP and lifetime aggregates.
**Depends on:** [03-game-classification.md](03-game-classification.md),
[mathematical-model.md](../03-math/mathematical-model.md)
**Rules version:** 2 (in force 2026-09-11)

> Not legal advice. Figures are derived from the shipped constants and re-derivable by running
> `pnpm --filter @landfall/core sim`.

---

## 1. The difficulty, stated plainly

A slot's PAR sheet sums a paytable. **Landfall has no paytable to sum.** Every payout is computed
from the round's own bets, so "theoretical return" cannot be a weighted sum of symbol
combinations — it has to be expressed as a **function of handle**.

That is the whole of the work G24 describes. The number was never hard to reach; *defining* it
was, and defining it wrongly is how the previously published figure came to be wrong (§3).

---

## 2. Definition

Return to player is the fraction of everything staked that returns to players over the long run.
It is built from three flows, each exactly computable from the economy configuration, and each
invariant to how the crowd distributes itself — because the draw is uniform and independent of
the pools, so `E[P_struck] = T/K` exactly, whatever shape the round takes.

| # | Flow | Formula | At production constants |
|---|---|---|---|
| 1 | **Base pari-mutuel.** Every credit staked returns to players except the rake, and the rake is taken only from the struck pool. | `1 − r/K` | **98.00%** |
| 2 | **Storm Surge.** The surge share of the rake feeds a progressive pot paid to players in full — rollover defers a payout, it never cancels one (Order 222 Art. 17.3). | `split.surge · r/K` | **0.50%** |
| 3 | **Storm Power.** Survivors' salvage is multiplied by `M ≥ 1`; the overpayment is paid from the Storm Reserve on top of the base. | `E[M−1] · (1−r)/K` | **0.50%** |
| | **Theoretical RTP** | sum of the three | **99.00%** |
| | **Operator hold** | `1 − RTP` = the house share of the rake | **1.00%** |

`E[M−1] = 35,685.5 / 2²⁰ ≈ 0.034032` — the exact integer expectation of the ladder
(`mathematical-model.md` §10), asserted in exact BigInt arithmetic by
`core/test/storm-power.test.ts`.

Reference implementation: `theoreticalRtp()` in `packages/core/src/rtp.ts`. Player-facing copy
calls `economyDisclosure()` rather than quoting a literal, so the artwork, the rules sheet, the
`/api/rules` artefact and this document cannot drift apart — which is half of what §4.7.2 exists
to prevent.

---

## 3. Correction: the published figure was 98%, and 98% is the base term alone

The previously published player-facing figure was **≈ 98%**. That is flow 1 by itself — the
pari-mutuel split *before* the surge and reserve flows, which the very sentence quoting it went on
to list. Adding them back gives 99.00%, which is also the exact complement of the 1.0% operator
hold the same paragraph claimed, so the documentation disagreed with itself.

This matters beyond arithmetic. §4.7.2(a) requires a displayed return to be accompanied by an
explanation of how it was determined; a figure that its own stated derivation contradicts is the
specific failure the clause is written against. It is now 99.0%, with the derivation rendered next
to it in the game-information dialog. Recorded as decisions-log #67.

---

## 4. What RTP is measured ON — and why two handles are carried

| Figure | Denominator | Why |
|---|---|---|
| **Theoretical** (§2) | Total handle, house seeds included | The seed faces the identical `−r/K` edge, so including it keeps the algebra exact |
| **Reported** (Order 240, Res. 455) | Player handle, house seeds excluded | Res. 455 Art. 2(d) defines GGR as **bets received minus winnings paid**, and house-seed money is not a bet received |

`actualRtp()` returns both. Reporting one while computing the other is exactly the kind of
mismatch that costs a week of a variance investigation, so the distinction is carried in the type
rather than left to a convention.

**GGR** for the supplier fee is `playerHandle − playerReturned`, measured monthly. Note the timing
question flagged as **G56**: IN−OUT runs at 2% of handle while the surge pot accumulates and drops
below it when the pot pays out, so a 5%-of-GGR accrual overcharges unless the jackpot liability is
recognised. That belongs in the Order 239 Art. 4.3 service contract, not here.

---

## 5. Theoretical versus actual — monitoring and escalation (§A.6.2)

A pari-mutuel game's realised return over a short window is dominated by whether a jackpot landed
in it, so a fixed band would alarm constantly. The band therefore widens as the sample shrinks,
using the single-round standard deviation from `mathematical-model.md` §5 (σ ≈ 0.443 × stake)
scaled by √n — a 3σ band on the mean.

```
band(n) = 3 × 0.443 / √n
```

| Deviation | Classification | Action |
|---|---|---|
| ≤ ½ band | `OK` | None |
| > ½ band | `WATCH` | Recorded; reviewed at the next monthly balancing |
| > band | `INVESTIGATE` | Raise an incident, reconcile the ledgers, notify per Order 222 Art. 16.1(b) |

Implemented as `classifyRtpVariance()`; surfaced on `/api/compliance/report`.

---

## 6. Measured — 10,000,000 rounds

`pnpm --filter @landfall/core sim -- --rounds=10000000 --seed=20260911`, 2026-09-11, rules v2.
Total handle 33.29bn credits, against the **production** `drawZone` / `settleRound` /
`stormPowerFromRoll` — never a reimplementation.

| Quantity | Measured | Theoretical |
|---|---|---|
| Gross take (rake) | 1.9970% | 2.0000% |
| Operator hold | 0.9987% | ≈ 1.0000% |
| Surge funding | 0.4991% | 0.5000% |
| Storm Reserve inflow | 0.4991% | 0.5000% |
| Storm Reserve outflow | 0.5026% | ≤ inflow (funding invariant) |
| Reserve drift (vs opening) | +0.0006% | ≈ 0, slightly positive |
| **Reserve minimum balance** | **0.00 — never negative** | ≥ 0 by construction |
| **House backstop drawn** | **0.0041% of handle** | the §A.4.1 obligation, quantified |
| Liability cap hits | 1 in 10,000,000 | ~1 in 10⁷ |
| Survivor pass-through at ×1 | exact, 0 violations | 88% |

---

## 7. Records of changes affecting RTP (§A.6.1)

§A.6.1 requires records of every change affecting RTP, and that each such change **treats the game
as new for reporting**. The register is `RULES_CHANGELOG` in `packages/core/src/rules.ts`, and the
version is stamped on every round at creation.

| Rules version | Effective | Change | Theoretical RTP | Material under Law Art. 24¹.2 |
|---|---|---|---|---|
| 1 | 2026-07-11 | Initial ruleset; ladder v2; cap 25× handle | 99.00% | Yes — (b), (c), (f) |
| 2 | 2026-09-11 | Cap re-derived to 150× so every advertised tier is payable; reserve capitalized and never negative; house-seed P&L ring-fenced; surge ceiling and diversion pool; published return corrected 98% → 99.0% | 99.00% | Yes — (c), (f) |

**The theoretical RTP is unchanged between v1 and v2**, and that is the point worth making to a
reviewer: raising the cap did not change what the game returns in expectation — `E[M−1]` is a
property of the ladder, not of the cap. What changed is **which of the advertised tiers can
actually be paid**. Under v1 the top tier was clamped in essentially every round it landed in, so
the realised return sat fractionally below the theoretical one and the headline award was not
winnable at its advertised value (GLI §4.4.1(f)). v2 closes that gap without moving the economics.

---

## 8. Open items

| # | Item | Owner |
|---|---|---|
| 1 | Agree the GGR accrual basis for the jackpot liability in the Art. 4.3 service contract (**G56**) | Finance + Counsel |
| 2 | Agree the formula-as-paytable presentation with the test laboratory in advance (**G41**) | Product + Math |
| 3 | Confirm whether the house seed is excluded from "bets received" for the supplier fee — §4 assumes it is | Counsel |
