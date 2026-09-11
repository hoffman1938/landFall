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
**Rules version:** 4 (in force 2026-09-11)

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
It is built from **four** flows, each exactly computable from the economy configuration, and each
invariant to how the crowd distributes itself — because the draw is uniform and independent of
the pools, so `E[P_struck] = T/K` exactly, whatever shape the round takes.

| # | Flow | Formula | At production constants |
|---|---|---|---|
| 1 | **Base pari-mutuel.** Every credit staked returns to players except the rake, and the rake is taken only from the struck pool. | `1 − r/K` | **98.0000%** |
| 2 | **Storm Surge.** The surge share of the rake feeds a progressive pot paid to players in full — rollover defers a payout, it never cancels one (Order 222 Art. 17.3). | `split.surge · r/K` | **0.5000%** |
| 3 | **Storm Power.** Survivors' salvage is multiplied by `M ≥ 1`; the overpayment is paid from the Storm Reserve on top of the base. | `E[M−1] · (1−r)/K` | **0.4991%** |
| 4 | **Jackpot reset.** After every win the house restores the pot to its reset value out of its OWN share of the rake — operator capital that reaches a player the next time the pot pays. | `b · split.house · r/K` | **0.3500%** |
| | **Theoretical RTP** | sum of the four | **99.3491%** |
| | **Operator hold** | `1 − RTP` | **0.6509%** |

**Flow 4 is new in rules v4, and its absence made the v3 figure wrong** — see §3.1. It is
expressible as a constant only because `surgeResetFor` now sets the reset to a fixed fraction of
what the house rake share can fund, which makes the handle cancel:

```
reset          = b · [ split.house · (r/K) · H ] / p_j
cost per round = reset · p_j = b · split.house · (r/K) · H     →  b · split.house · r/K of H
```

The hold decomposes exactly into three named components, so no residue is unexplained:

```
  split.house · r/K                        house share of the rake       1.0000%
− b · split.house · r/K                    paid back into the jackpot   −0.3500%
+ (split.reserve · r/K − E[M−1]·(1−r)/K)   unspent reserve head-room    +0.0009%
=                                                                        0.6509%
```

`E[M−1] = 35,685.5 / 2²⁰ ≈ 0.034032` — the exact integer expectation of the ladder
(`mathematical-model.md` §10), asserted in exact BigInt arithmetic by
`core/test/storm-power.test.ts`.

Reference implementation: `theoreticalRtp()` in `packages/core/src/rtp.ts`. Player-facing copy
calls `economyDisclosure()` rather than quoting a literal, so the artwork, the rules sheet, the
`/api/rules` artefact and this document cannot drift apart — which is half of what §4.7.2 exists
to prevent.

---

## 3. Two corrections, both in the same direction

### 3.1 Rules v4: the house-funded jackpot reset was missing from the model

Rules v3 set the jackpot reset to `max(20 × minimum bet, budgetFraction × affordable)`. Measured
at every shipped tier the **floor won**, so the budget fraction was inert and the re-seed cost was
neither constant nor disclosed — the same class of defect, in the same function, that v3 had been
written to fix. The v3 test that claimed to pin the two-thirds margin called the function with
`minimum: 0`, which is why it did not catch it.

| | Published (v3) | Measured (v3) |
|---|---|---|
| Player return | 98.999% | 99.25% – 99.74% |
| Operator hold | 1.00% | 0.26% – 0.61% |

The error was **handle-dependent**: on a table thin enough for the floor to exceed the
affordability ceiling, the reset became the ceiling exactly and the table returned 100% of handle.

Fixed by making the reset exactly `budgetFraction × affordable` and publishing the resulting flow
as term 4. Measured after the fix, the operator hold spans **0.6379% – 0.6590%** across the five
tiers — a spread of 0.021 points — against a published 0.6509%. Full account:
`certification-tests/docs/08-findings-and-fixes.md` §2.

### 3.2 Rules v2: the published figure was 98%, and 98% is the base term alone

The previously published player-facing figure was **≈ 98%**. That is flow 1 by itself — the
pari-mutuel split *before* the surge and reserve flows, which the very sentence quoting it went on
to list. Adding them back gives 99.00%, which is also the exact complement of the 1.0% operator
hold the same paragraph claimed, so the documentation disagreed with itself.

This matters beyond arithmetic. §4.7.2(a) requires a displayed return to be accompanied by an
explanation of how it was determined; a figure that its own stated derivation contradicts is the
specific failure the clause is written against. v2 corrected it to 99.0%; v4 corrected it again to
**99.3%** once the fourth flow was found, with the derivation rendered next to it in the
game-information dialog. Recorded as decisions-log #67.

> Both corrections ran in the same direction: **a return flow existed in the code and not in the
> model.** That is the failure mode this game is prone to, because its return is assembled from
> separate funds rather than read off a paytable, and it is why `theoreticalRtp()` is now checked
> against a per-tier measurement rather than against itself.

---

## 4. What RTP is measured ON — and why two handles are carried

| Figure | Denominator | Why |
|---|---|---|
| **Theoretical** (§2) | Total handle, house seeds included | Keeps the pari-mutuel algebra exact — but see the correction below: it is **not** true that the seed faces the same edge as a player |
| **Reported** (Order 240, Res. 455) | Player handle, house seeds excluded | Res. 455 Art. 2(d) defines GGR as **bets received minus winnings paid**, and house-seed money is not a bet received |

> **Correction.** An earlier revision of this section justified the total-handle
> denominator by asserting that "the seed faces the identical `−r/K` edge". **That is
> false.** A uniform stake across all six harbours is `−r/K` only when the pools are
> *balanced*; the survivor payout `P_struck/(T − P_struck)` is **convex** in the struck
> pool, so against an imbalanced crowd a bettor present in every harbour collects
> disproportionately from the heavy ones. By Jensen's inequality the seed is
> systematically **+EV**, and it is the same mechanism math-model §4 already documents for
> players — *being where the crowd is not is relatively +EV* — applied to a bettor who is
> always partly where the crowd is not.
>
> Measured under production adaptive seeding, the seed gains **+0.086% of handle**. Under
> the retired flat 50-credit seed it gained **+1.5%**, which is why the adaptive policy of
> decisions-log #45 matters far more than a liquidity tuning change: it is also the control
> that keeps this effect small. The effect concentrates on **thin tables**, where the seed
> is largest relative to real handle:
>
> | Table state (Skiff) | Seed/harbour | Seed % of handle | Return on seed | Taken from players |
> |---|---|---|---|---|
> | 1 player | 12 cr | 73.4% | +0.5% | 0.34% of handle |
> | 3 players | 4 cr | 23.5% | +6.2% | 1.47% of handle |
> | 10–20 players | 1 cr | 1.5% | +1.2% | 0.02% of handle |
> | 25–35 players | 1 cr | 0.8% | 0.0% | 0.00% of handle |
>
> This does **not** breach GLI §A.7.1(c) — the gain is ring-fenced out of operator revenue
> into the segregated liquidity float (G8) and can only fund future seeds, the pot or the
> reserve. But it does falsify the *argument* in
> [03-game-classification.md](03-game-classification.md) §5.4(i), which rests the legal
> position on the seed's "expected profit and loss … approximately zero". The defensible
> position is the ring-fence, not the symmetry claim. **Open: §5.4(i) needs rewriting, and
> the float needs a release policy** — `releaseFloat()` exists and is tested but nothing
> calls it, so the ring-fenced gain currently accumulates instead of returning to players.

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

### 6.1 What the operator actually keeps, and what players actually get

The rake share is **not** the hold. Against it the operator funds three things that all move
money toward players: the jackpot's floor **re-seed** after every payout, the Storm Reserve
**backstop**, and any top-up the liquidity float needs. Measured over 2M rounds at production
adaptive seeding:

| | % of handle |
|---|---|
| Gross deduction (rake on the struck pool) | 1.9924% |
| — of which the operator books (house share) | 0.9964% |
| **less** house jackpot floor re-seeds | −0.2335% |
| **less** Storm Reserve backstop | −0.0068% |
| **= OPERATOR NET HOLD** | **≈ 0.76%** |
| **PLAYER RTP, measured on player handle** | **≈ 99.15%** |
| (ring-fenced house-seed gain — not operator revenue) | 0.0859% |

> **Updated for rules v3.** At rules v2 the re-seed cost 0.66% of handle and the operator
> netted 0.33%, because the reset value was fixed to the tier's minimum bet rather than to its
> handle. On the two smallest tiers that made the table structurally loss-making — Skiff
> returned 105.97% to players and lost the operator 5.46% of handle. The reset now follows the
> handle and the cost is uniform at ≈0.33% of handle across all five tiers. See
> [mathematical-model.md §9.1](../03-math/mathematical-model.md) for the derivation and the
> before/after table.

Two things follow that are worth stating to a reviewer before they are asked:

1. **The jackpot floor re-seed is the operator's largest single cost** — 35% of the rake share it
   keeps, by construction. It is not a rake flow; it is house money added after every payout so
   the next pot is never trivial for the table. Since rules v4 it is a **fixed fraction** of what
   the rake share can fund, which is what makes it a constant fraction of handle and therefore
   publishable as a term of theoretical RTP.
2. **It is counted.** Under v3 it was not, and measured return consequently ran 0.25–0.75 points
   ABOVE the published figure by a margin that grew as a table got quieter. Under v4 the measured
   player-basis return sits inside its 99% confidence interval at every tier — see §6.2.

### 6.2 Release-gate validation, 1,000,000 rounds (rules v4)

| Quantity | Measured | Theoretical |
|---|---|---|
| Gross take (rake) | 2.0052% | 2.0000% |
| House share of the rake | 1.0028% | 1.0000% |
| Surge funding | 0.5012% | 0.5000% |
| Storm Reserve inflow | 0.5012% | 0.5000% |
| Storm Reserve outflow | 0.4913% | ≤ inflow (funding invariant) |
| **Jackpot re-seed (RTP term 4)** | **0.3510%** | **0.3500%** |
| **Operator net hold** | **0.6518%** | **0.6509%** |
| Player RTP (player-handle basis) | 99.3370% | 99.3491% on total handle |
| Reserve drift (vs opening) | +0.0099% | ≈ 0, slightly positive |
| **Reserve minimum balance** | **never negative** | ≥ 0 by construction |
| **House backstop drawn** | **0.0000%** | the §A.4.1 obligation, quantified |
| Ring-fenced house-seed P&L | +0.0875% | small and positive (payout convex in the struck pool) |
| **Seed surplus released to players** | **0.0875%** | §A.7.1(d): played back, not banked |
| Liability cap hits | 0 in 1,000,000 | rare by construction at a 150× cap |
| Survivor pass-through at ×1 | exact, 0 violations | 88% |

### 6.3 Per-tier validation, 150,000 rounds each (rules v4)

The property that matters: **the hold is the same at every tier.** A return figure that moves with
table population is not a return figure.

| Tier | Player RTP | 99% interval | Seed share | Expected on that basis | Operator net |
|---|---|---|---|---|---|
| Skiff Harbor | 99.2874% | [99.2426%, 99.3355%] | 3.00% | 99.3290% | 0.6590% |
| Schooner Bay | 99.3154% | [99.2644%, 99.3701%] | 2.60% | 99.3317% | 0.6468% |
| Flagship Sound | 99.3085% | [99.2599%, 99.3551%] | 2.60% | 99.3317% | 0.6519% |
| Galleon Roads | 99.3445% | [99.2772%, 99.4258%] | 2.60% | 99.3317% | 0.6379% |
| Leviathan Deep | 99.3034% | [99.2505%, 99.3584%] | 2.60% | 99.3317% | 0.6458% |

Hold spread across the ladder: **0.021 points** (v3: 0.35). Expected inside the interval at every
tier. The measured figure is on **player** handle and the published one on **total** handle, which
differ by `hold × s/(1−s)` — see §4. Reproduce: `certification-tests/run.sh --evidence`.

---

## 7. Records of changes affecting RTP (§A.6.1)

§A.6.1 requires records of every change affecting RTP, and that each such change **treats the game
as new for reporting**. The register is `RULES_CHANGELOG` in `packages/core/src/rules.ts`, and the
version is stamped on every round at creation.

| Rules version | Effective | Change | Theoretical RTP | Material under Law Art. 24¹.2 |
|---|---|---|---|---|
| 1 | 2026-07-11 | Initial ruleset; ladder v2; cap 25× handle | 99.00% | Yes — (b), (c), (f) |
| 2 | 2026-09-11 | Cap re-derived to 150× so every advertised tier is payable; reserve capitalized and never negative; house-seed P&L ring-fenced; surge ceiling and diversion pool; published return corrected 98% → 99.0% | 99.00% | Yes — (c), (f) |
| 3 | 2026-09-11 | Jackpot reset value tied to table handle rather than minimum bet. The fixed value was unaffordable on the two smallest tiers, which lost the operator money on every round and returned over 100% to players | 99.00% | Yes — (f) |
| 4 | 2026-09-11 | Jackpot reset fixed at 35% of what the house rake share can fund, with no minimum able to override it; the resulting house-funded flow published as the fourth RTP term. Under v3 the minimum won at every tier, so the flow was neither constant nor disclosed and measured return ran above the published figure by a margin that grew as a table got quieter | **99.3491%** | Yes — (c), (f) |

**The theoretical RTP moved at v4 and only at v4.** v1 → v3 left the model's stated value at
99.00% while the shipped economy drifted away from it; v4 is the first version where the published
figure and the measured one agree at every tier. Raising the cap at v2 did not change what the
game returns in expectation — `E[M−1]` is a
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
