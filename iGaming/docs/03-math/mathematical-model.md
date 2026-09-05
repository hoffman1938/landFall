# Mathematical Model: LANDFALL — Pari-Mutuel Survivor Game

**Prepared by:** Gambling Mathematician
**Phase:** 4 (rerun) — Mathematical Model
**Depends on:** [game-design-document.md](../02-game-design/game-design-document.md)
**Consumed by:** [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md),
[simulation-methodology.md](simulation-methodology.md)
**Revision note:** fully replaces the Crash-era model (inverse-CDF multiplier distribution).
Landfall's math is a different family: a uniform categorical draw + pari-mutuel redistribution.
Notation is theme-agnostic (`zones`, `struck`, `stakes`); the maritime flavor is a UI layer only.

---

## 1. Parameters

| Symbol | Value (production) | Meaning |
|---|---|---|
| `K` | 6 | Number of zones (harbors) |
| `r` | 0.12 | Rake taken from the struck pool only ("harbormaster's cut") |
| `split` | house 0.50 / surge 0.25 / reserve 0.25 | Where the rake goes (fractions of rake) |
| `h` | adaptive, ≤ 50 credits | House seed per zone per round (liquidity — §6). No longer a constant: the house tops the table up to a per-room liquidity floor and withdraws to a token seed as real handle arrives. |
| `P_j` | — | Total stakes in zone `j` (players + house seed) |
| `T` | `Σ P_j` | Total handle for the round |
| `z*` | — | Struck zone, drawn uniformly: `P(z* = j) = 1/K` for all `j` |

All constants are configurable per room (rake validated to `[0.06, 0.20]`, split parts
non-negative and summing to 1), defined in exactly one place in `packages/core`
(`constants.ts`, `RAKE` / `RAKE_SPLIT`). The chosen values give a **gross take of `r/K` = 2%
of handle**, of which the operator keeps the house share — **net operator hold ≈ 1.0% of
handle** plus Storm Reserve underflow retention (§10); the surge share (0.5% of handle) and
reserve share (0.5% of handle) return to players through the Storm Surge pot and the Storm
Power ladder. Player-facing long-run return ≈ **98%**; survivors receive `(1 − r)` = **88% of
the struck pool**. These are the only two economy figures quoted in player-facing copy (A5).

## 2. Settlement Rule

For a round with pools `P_0..P_{K-1}` and struck zone `z*`:

- Every stake in zone `z*` is lost in full.
- The house takes rake `r × P_{z*}`.
- The remaining `(1 − r) × P_{z*}` is distributed to all surviving stakes pro-rata:
  a survivor who staked `S` in zone `i ≠ z*` receives

```
payout(S) = S + (1 − r) × P_{z*} × S / (T − P_{z*})
```

(their stake back, plus their proportional share of the net struck pool).

**Degenerate case:** if `P_{z*} = 0` there is nothing to distribute and survivors simply keep
their stakes (a push). With house seeding always on (§6), `P_{z*} ≥ h > 0`, so this case cannot
occur in practice; it is specified anyway so the settlement function is total.

## 3. House Edge — Exact, and Invariant to Crowd Shape

The house's take each round is `r × P_{z*}`. Since `z*` is uniform and independent of the pools:

```
E[house take] = r × E[P_{z*}] = r × (1/K) × Σ_j P_j = (r/K) × T
```

**The expected gross take is exactly `r/K` of total handle — 2% at production parameters — no
matter how the crowd distributes itself** (the operator's net hold is the house share of that
take, ≈ 1%). This is a stronger statement than the Crash model could
make (where realized edge per round depended on the multiplier distribution): here the *only*
randomness in the house's revenue is which pool's size gets multiplied by `r`, and its
expectation is the mean pool size by uniformity. Confirmed by simulation at both balanced and
heavily imbalanced pool shapes (§7: measured 0.01000 and 0.01002 of handle respectively).

**Zero-liability property:** settlement is pure redistribution of money already staked, minus
rake. The house can never owe more than a round collected. There is no analogue of Crash's
1000x-multiplier tail liability. (The house *seed* stakes (§6) are exposed like any player's,
bounded at `K × h` per round.)

## 4. Per-Player Expected Value — Where the Game Lives

For a player staking `S` in zone `i`, with pools `P_0..P_{K-1}` (including their own stake),
net EV is:

```
EV_i(S) = (S/K) × [ (1 − r) × Σ_{j≠i} P_j / (T − P_j)  −  1 ]
```

Derivation: with probability `1/K` their own zone is struck (net `−S`); for each other zone `j`
(probability `1/K` each), they net `(1 − r) × P_j × S / (T − P_j)`.

**Balanced case** (`P_j = T/K` for all `j`): the sum telescopes to exactly 1, so

```
EV_balanced = −S × r / K = −2% of stake (before surge/reserve returns)
```

— every player faces the same gross edge when the crowd is spread evenly, consistent with §3.
Adding back the surge and reserve return flows (which are stake-proportional in expectation),
the long-run player return is ≈ 98%.

**Imbalanced case — the strategic layer.** The function `P_j/(T − P_j)` is increasing in `P_j`,
so the sum `Σ_{j≠i}` is largest for players whose own zone is *small* while other zones are
*large*. Concretely (worked example, validated by 2M-round simulation, §7): pools
`(600, 80, 40, 40, 40, 40)`, total 800, a 10-credit stake:

| Position | Analytic EV | Simulated EV |
|---|---|---|
| In the whale zone (600) | −1.254 | −1.258 |
| In a small zone (80) | +3.363 | +3.374 |

Being where the crowd is not is **relatively** +EV; being in the crowd is −EV. Three facts make
this a game rather than an exploit:

1. **Zero-sum among players.** Summing `EV_i` over all stakes gives exactly `−(r/K) × T` (the
   house take) for *any* pool shape — imbalance only redistributes EV *between players*. The
   house cannot gain or lose from crowd shape (§3), so it has no incentive to manipulate it.
2. **Self-balancing.** Everyone sees the same live pools and faces the same incentive to move
   toward small zones; movement toward a small zone makes it larger. The anchor-window scramble
   is a repeated approximate-equilibrium-seeking process, and in equilibrium (balanced pools)
   all players face the identical `r/K` edge. Skill in reading/anticipating the crowd redistributes
   EV among players around that fixed house take — Landfall is honestly described as a
   **fixed-edge game with a zero-sum skill layer on top**, unlike Crash where every strategy had
   identical EV and skill was strictly illusory.
3. **The draw never follows the money.** `P(z* = j) = 1/K` regardless of pools — crowding
   changes payouts, never strike probability. This must be stated verbatim in player-facing
   copy, because "the storm chases the biggest pool" is the first suspicion every player will
   have, and the per-round verification tool disproves it.

## 5. Volatility Characterization

For a player staking `S` in balanced pools:

- Lose `S` with probability `1/K` (≈ 16.7%)
- Win `S × (1 − r)/(K − 1)` ≈ `+0.176 × S` with probability `(K−1)/K` (≈ 83.3%)

Single-round standard deviation ≈ **0.443 × S** — comparable to conservative Crash play
(cash-out target ~1.2x had σ ≈ 0.50 × S in the retired model). Landfall's *baseline* is
low-volatility, frequent-small-win.

Volatility is **emergent**: it grows with pool imbalance. If one zone holds fraction `w` of the
handle, a survivor's win when that zone is struck scales like `(1 − r) × w/(1 − w)` per unit
staked — e.g. `w = 0.6` pays survivors ≈ +1.41 × S in that round. These occasional
imbalance-driven windfalls are part of the game's tail excitement; the rest comes from the
Storm Power ladder (§10) and the Storm Surge pot (§9). The tail stays structurally bounded:
**base single-round win = `(1 − r) × P_{z*} × S/(T − P_{z*})` (less than the round's own
handle), and even with the ladder's multiplier the round's total salvage is clamped to
`25 ×` handle** (§10, operator-configurable).

Players cannot dial personal volatility (no target multiplier exists to choose). Room tiers
varying `K` and `r` are the future coarse volatility control.

## 6. House Seeding — Adaptive Liquidity

The house stakes `h` on every zone each round, settled under the same rules as any player.
Purposes: (a) `P_{z*} > 0` always, so survivors are always paid something; (b) solo and
low-population rounds remain meaningful.

**`h` is adaptive** (`packages/core/src/liquidity.ts`). It used to be a fixed 50 credits, and
that is worth stating plainly as a mistake: a large flat seed does not add liquidity, it
AVERAGES THE POOLS TOGETHER. The survivor gain

```
gain/stake = (1 − r) · P_{z*} / (T − P_{z*})
```

collapses to `(1 − r)/(K − 1) ≈ +17.6%` whenever the pools are equal, and a dominant uniform
seed makes them equal. The MEAN is fixed by the pari-mutuel identity and no seeding policy can
move it; what a seeding policy can move is the DISPERSION around it — which is the entire
strategic content of reading the crowd. Measured against the production `settleRound` with five
fleets on a six-cove table, the same five players spread payouts over 6.0pp at `h = 50` and
133pp at `h = 1`.

The policy: with `F` the room's liquidity floor and `Ĥ` an estimate of recent real handle,

```
h = clamp( ceil( max(0, F − Ĥ) / K ),  h_min,  h_max )
```

so the house makes up the shortfall on a thin table and withdraws to `h_min` once players carry
the room themselves. `Ĥ` is an asymmetric EMA over SETTLED rounds only — never the live round's
pools — so `h` is fixed and published in the round header before anchoring opens and can leak
nothing about where money is going now. The asymmetry (α = 0.25 rising, 0.6 falling) exists for
the honesty note below: a room that empties out must restore its protective seed within a round
or two, so the estimate reacts fast to a falling handle and slowly to a rising one.

Operator note: the house pays the rake on its own seed, so seeding is a real cost. Under this
policy that cost decays towards zero exactly as the room becomes self-sustaining — the operator
funds liquidity only while liquidity is genuinely scarce.

Room defaults (`packages/server/config/rooms.json`): Skiff `F = 90`, `h_min = 1`, `h_max = 25`;
Schooner `F = 180`, `h_min = 5`, `h_max = 50`; Flagship `F = 900`, `h_min = 50`, `h_max = 250`.

Properties (validated by simulation, §7):

- In balanced play the seeds' own pari-mutuel EV is the same −`r/K` as any player's; the
  house's total expected take remains rake-driven and bounded.
- **Low-population honesty note:** a solo player staking `S` alongside seeds `h` on every zone
  faces slightly worse than the nominal `r/K` gross edge, because their own stake makes their
  zone the largest pool (they are the "whale" of their own round). At the pre-adaptive
  parameters a 10-credit solo stake against 50-credit seeds had analytic EV ≈ **−2.56%** of stake
  (vs. −2% gross in balanced crowds), with the difference accruing to the house's seed stakes,
  not to the rake — re-measured by the A6 sim harness on every constants change. This must
  appear in the fairness documentation rather than being discovered by a player with a
  calculator: the honest statement is *"the nominal edge is exact for balanced crowds; tiny
  rounds tilt slightly further in the house's favor because your own stake concentrates your
  zone."* Raising `h` relative to typical stakes shrinks this deviation (the player's stake
  perturbs the pools less). The adaptive policy therefore keeps `h` at its ceiling precisely
  when the deviation would be worst — an empty room — and only withdraws it once other players
  are diluting the effect anyway. The fast-falling EMA closes the transitional window where a
  busy room empties and someone is briefly alone against a token seed.

## 7. Simulation Spot-Check (informal; formal methodology in simulation-methodology.md)

The formal, CI-integrated validation runs against the **production** `settleRound`/`drawZone`
(not a reimplementation): `packages/core/scripts/simulate.ts` (methodology in
[simulation-methodology.md](simulation-methodology.md)). Results at production constants
(`r = 0.12`, split 0.5/0.25/0.25, ladder v2, cap 25×) — 10,000,000 rounds, 2026-07-11,
`pnpm --filter @landfall/core sim -- --rounds=10000000` (LCG seed 20260711, production HMAC draw):

| Check | Simulated (10M rounds) | Theoretical |
|---|---|---|
| Gross take (rake) | 2.0013% of handle | 2% of handle (`r/K`) |
| Operator hold (house share) | 1.0009% of handle | ≈ 1% of handle |
| Surge funding | 0.5002% of handle | 0.5% of handle |
| Storm Reserve inflow | 0.5002% of handle | 0.5% of handle |
| Storm Reserve outflow (ladder overpayment) | 0.4878% of handle | ≤ 0.5% (funding invariant) |
| Reserve drift | +0.0125% of handle (min balance −31.2k credits early, +4.15M final) | ≈ 0, slightly positive |
| Liability cap hits | 13 rounds in 10M (all disclosed via `powerCapped`) | ~1 in 10⁶ (Perfect Storm + fat Cat 6) |
| Survivor pass-through at ×1 | exact, 0 violations | 88% (`1 − r`) |
| Conservation (all rounds, incl. capped) | exact (assert never fired) | exact |
| Solo-player EV (10.00 vs 50-seed pools, ×1) | −2.452% of stake | −2.564% (§6 analytic) |

Rerun the script whenever any Workstream-A constant changes — the release gate (§13 of the
remediation program) requires it; the script exits non-zero when a check leaves tolerance.

## 8. Worked Example — Full Round, Real Numbers

Draw mechanics (hash chain, HMAC, uniform zone selection) are specified in
[rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md); this example uses a
real computed instance of that scheme end-to-end.

```
Round seed (revealed at landfall):
  3a33cbdcf656ccb1a1d4824ec190c14f26f0fd2d40654e99627ecaf52905dadf
Chain commitment (published before the round; SHA256(seed) must equal it):
  eaa8e7065436b0f713755dc95f41dc5201aa0c4b927dd90524874305ae7e7058
HMAC-SHA256(key = seed, msg = "landfall:round:1") =
  3f707085bf42950b8afa2ec4bb9b7884d06bcc23322fa3975e755148040534f0
First 13 hex chars → 0x3f707085bf429 = 1,116,034,507,207,721
u = 1116034507207721 / 2^52 = 0.247809...
struck zone z* = floor(u × 6) = 1        (Harbor 2, 0-indexed zone 1)
```

Settlement with example pools (house seed 50 per zone included):

```
Pools:  z0: 130   z1: 90   z2: 250   z3: 50   z4: 65   z5: 215     T = 800
Struck: z1 (pool 90) — all 90 lost by its stakers (40 player + 50 house seed)
Rake:   0.12 × 90 = 10.80, split: house 5.40 · surge pot 2.70 · storm reserve 2.70
Salvage distributed: 0.88 × 90 = 79.20 across surviving pool total 710
  (Storm Power ×1 this round — Category 1, the modal case)

A player with 20 staked on z2:
  payout = 20 + 79.20 × (20/710) = 20 + 2.231 = 22.23   (net +2.23, ≈ +11.2%)
A player with 40 staked on z1: net −40.
House: +5.40 rake share − 50 seed lost on z1 + salvage on its five surviving seeds
  (5 × 50/710 × 79.20 = 27.89) → house net −16.71 this round
  (the house wins/loses its seeds like a player; in expectation across rounds its
   rake share converges to house × r/K × handle = +8.00 per 800-handle round, per §3.)
Conservation: 710 (survivor stakes returned) + 79.20 (salvage) + 10.80 (rake) = 800 ✓
```

The exact integer-unit outcome of this round (largest-remainder rounding, payout 22.23) is
locked in `core/test/settlement.test.ts` ("worked example").

## 9. Storm Surge — Progressive Jackpot (added post-MVP-launch by product request)

The bounded per-round upside (§5) was flagged at concept selection as Landfall's main weakness
vs. Crash's "500x dream," with this exact mitigation sketched. Now implemented:

- **Funding:** `RAKE_SPLIT.surge = 25%` of every round's rake (0.5% of handle) feeds a
  progressive pot. The pot is *already-collected* money — the zero-liability property (§3)
  is preserved. The house additionally re-seeds a `SURGE_MIN_POT_MINOR = 500.00` floor after
  each payout (bounded, auditable generosity).
- **Trigger:** `uSurge < SURGE_PROB = 1/25`, where `uSurge` comes from digest hex span
  `[17,22)` — disjoint from the struck-zone span, so trigger and strike are independent
  (tested). Announced **before** anchoring opens; honesty of the announcement is verifiable
  after the seed reveal.
- **Golden Anchor:** on a surge round, ONE surviving player stake wins the entire pot, picked
  with probability proportional to stake from digest span `[22,35)` — deterministic and
  recomputable from the public lock snapshot. No player survivors → pot rolls over.
- **EV effect:** each staked credit has the same expected surge return (survival is uniform
  1−1/K and the pick is stake-weighted among survivors), so the elegant "every credit faces the
  same odds" property survives. The surge share (0.5% of handle) returns to players through the
  pot, which is one of the flows behind the player-facing "long-run return ≈ 98%". Big stakes
  hunt the pot with proportionally better odds (high-roller appeal); small stakes can win
  extreme multipliers (pot/stake can exceed 500x) — both audiences served by one mechanism.

## 10. Storm Power — Salvage Multiplier Ladder v2 (reserve-funded, ×1 floor, capped tail)

Product asked for Aviator's core motivation — *"even 1 credit can catch a 500×"* — without
abandoning pari-mutuel identity. Every round's storm has a **category** drawn from digest span
`[35,40)` (20 bits), and survivors' salvage is multiplied by the category's `M`.

The v1 ladder (E[M]=1 with a ×0.5 floor and an uncapped ×500 tail) failed the pre-launch
review: the ×0.5 floor poisoned the modal round, and the uncapped tail was a bankroll landmine.
Ladder v2 replaces it under three invariants:

1. **Floor is ×1.** A survivor's salvage is never reduced. Category 1 (a weak storm) leaves
   salvage untouched. No tier below ×1 exists anywhere in code or copy.
2. **Reserve funding.** The expected overpayment is paid by the Storm Reserve, not hoped away:
   `E[M−1] × E[distributable] ≤ stormReserve share of expected rake`, i.e.
   `E[M−1] × (1−r) ≤ split.stormReserve × r`. At production constants the exact budget is
   `E[M−1] ≤ 3/88 ≈ 0.03409`. This ladder uses `E[M−1] = 35,685.5/2²⁰ ≈ 0.03403`
   (99.8% of budget; the slack is deliberate reserve head-room). Asserted by an
   exact-arithmetic (BigInt) unit test in `core/test/storm-power.test.ts` — this test
   **replaces** the old E[M]=1 assertion.
3. **Capped tail.** Total salvage in a round is clamped to
   `STORM_POWER_MAX_PAYOUT_MULTIPLE = 25 ×` the round handle (operator-configurable). The
   clamp is published in the round result (`powerCapped`) and recomputable from the public
   snapshot — honesty over silence. The clamp never cuts below the pari-mutuel base
   `(1−r) × P_{z*}`.

| Tier | M | Count (exact, /2²⁰) | Frequency |
|---|---|---|---|
| Category 1 | ×1 | 955,529 | ~91.1% of rounds |
| Category 2 | ×1.25 | 83,886 | 8.0% (~1 in 12.5) |
| Category 3 | ×2 | 8,000 | ~1 in 131 |
| Category 4 | ×5 | 1,100 | ~1 in 953 |
| Category 5 | ×25 | 55 | ~1 in 19,065 |
| Category 6 | ×100 | 5 | ~1 in 209,715 |
| PERFECT STORM | ×500 (nominal, capped) | 1 | ~1 in 1,048,576 |

A "storm bonus" (M>1) lands on ~1 round in 11.3 — the felt frequency the design targets. The
review's original "≥×2 on ~1 in 10" is mathematically incompatible with the funding invariant
(P(M≥2)·1 ≤ E[M−1] ≤ 3/88 caps ×2-or-better at ~1 in 29); the resolution — deliver the felt
bonus via a ×1.25 Category 2 and keep the funded tail — is recorded in the decisions log
(`docs/09-remediation/decisions-log.md`).

**Liability accounting:** with M > 1 the settlement's `houseDeltaMinor = salvageTotal −
distributable` is drawn from the **Storm Reserve**, a ledgered fund (`storm_reserve_ledger`:
roundId, inflow, outflow, running balance) fed `split.stormReserve × rake` every round. The
runtime conservation assert is `payouts + rake = handle + houseDelta`, exact in integer minor
units including capped rounds. Expected reserve drift is slightly positive (budget slack), so
the fund self-sustains; worst-case single-round outflow is bounded by the cap:
`25 × handle − (1−r) × P_{z*}`. Reserve custody and insolvency policy:
`docs/10-compliance/jackpot-reserve-policy.md`.

**Why reserve funding rather than E[M]=1:** the v1 "variance-neutral" ladder financed its tail
by clawing back 50% of the modal round's salvage (×0.5), which players read — correctly — as
the house keeping most of the wreck. v2 makes the modal round clean pari-mutuel (88% of the
wreck to survivors, full stop) and pays the dream tiers from a disclosed, audited fund. The
verification tool recomputes the tier from the seed like everything else (span `[35,40)`
unchanged).

## 11. Open Parameters (tracked, not finalized here)

- Min/max stake come from room tier config (Skiff/Schooner/Flagship — Workstream C2). A single
  player's round stake is additionally capped at `WHALE_CAP_FRACTION` (default 25%) of the
  current public handle at accept time (B5) — the pari-mutuel-native anti-domination lever.
- ~~`h` (house seed) sizing policy as typical room population grows~~ — RESOLVED: `h` now
  shrinks as real liquidity arrives (§6). `F`, `h_min` and `h_max` per room remain open
  parameters; changing any of them requires re-checking §6's deviation bound.
- Future room tiers: `(K, r)` variants for coarse volatility selection (rake validated to
  `[0.06, 0.20]` per room).

## 12. v2 Split Orders (design target)

The category redesign
([category-redesign-v2.md](../02-game-design/category-redesign-v2.md)) adds an optional
Focus/Split fleet order. Mathematically, Split does not require a new settlement rule: it is
represented as multiple ordinary `StakeEntry` rows for the same player. A 100-credit 70/30 split
between zones `a` and `b` is equivalent to a 70-credit stake in `a` plus a 30-credit stake in
`b`.

Consequences:

- player EV is the weighted sum of the selected zones' EVs from §4;
- house edge remains `r/K` of handle in expectation;
- the struck zone still destroys exactly one harbor;
- Split changes volatility and psychology, not the pari-mutuel economy;
- exact split entries must appear in the lock snapshot so payout verification remains
  arithmetic on public data.
