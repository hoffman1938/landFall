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

| Symbol | Value (MVP) | Meaning |
|---|---|---|
| `K` | 6 | Number of zones (harbors) |
| `r` | 0.06 | Rake taken from the struck pool only ("harbormaster's cut") |
| `h` | 50 credits | House seed stake per zone per round (liquidity — §6) |
| `P_j` | — | Total stakes in zone `j` (players + house seed) |
| `T` | `Σ P_j` | Total handle for the round |
| `z*` | — | Struck zone, drawn uniformly: `P(z* = j) = 1/K` for all `j` |

All three constants are configurable per room, defined in exactly one place in `packages/core`.
The chosen values give an **effective house edge of `r/K` = 1% of handle** (§3), matching the
edge target carried over from the previous model.

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

**The expected house take is exactly `r/K` of total handle — 1% at MVP parameters — no matter
how the crowd distributes itself.** This is a stronger statement than the Crash model could
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
EV_balanced = −S × r / K = −1% of stake
```

— every player faces the same 1% edge when the crowd is spread evenly, consistent with §3.

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
   all players face the identical 1% edge. Skill in reading/anticipating the crowd redistributes
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
- Win `S × (1 − r)/(K − 1)` ≈ `+0.188 × S` with probability `(K−1)/K` (≈ 83.3%)

Single-round standard deviation ≈ **0.443 × S** — comparable to conservative Crash play
(cash-out target ~1.2x had σ ≈ 0.50 × S in the retired model). Landfall's *baseline* is
low-volatility, frequent-small-win.

Volatility is **emergent**: it grows with pool imbalance. If one zone holds fraction `w` of the
handle, a survivor's win when that zone is struck scales like `(1 − r) × w/(1 − w)` per unit
staked — e.g. `w = 0.6` pays survivors ≈ +1.41 × S in that round. These occasional
imbalance-driven windfalls are the game's tail excitement, but the tail is structurally bounded:
**maximum single-round win = `(1 − r) × P_{z*} × S/(T − P_{z*})`, always less than the round's
own handle.** There is no 100x fantasy; this trade-off is accepted deliberately
([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)§4).

Players cannot dial personal volatility (no target multiplier exists to choose). Room tiers
varying `K` and `r` are the future coarse volatility control.

## 6. House Seeding — Liquidity Analysis

The house stakes a fixed `h` on every zone each round, settled under the same rules as any
player. Purposes: (a) `P_{z*} > 0` always, so survivors are always paid something; (b) solo and
low-population rounds remain meaningful.

Properties (validated by simulation, §7):

- In balanced play the seeds' own pari-mutuel EV is the same −`r/K` as any player's; the
  house's total expected take remains rake-driven and bounded.
- **Low-population honesty note:** a solo player staking `S` alongside seeds `h` on every zone
  faces slightly worse than the nominal 1% edge, because their own stake makes their zone the
  largest pool (they are the "whale" of their own round). Measured: a 10-credit solo stake
  against 50-credit seeds has EV ≈ **−1.62%** of stake (vs. −1% in balanced crowds), with the
  difference accruing to the house's seed stakes, not to the rake. This must appear in the
  fairness documentation rather than being discovered by a player with a calculator: the honest
  statement is *"the nominal 1% edge is exact for balanced crowds; tiny rounds tilt slightly
  further in the house's favor because your own stake concentrates your zone."* Raising `h`
  relative to typical stakes shrinks this deviation (the player's stake perturbs the pools
  less); `h = 50` vs. min stake 1 keeps the deviation under ~0.1% for minimum-stake players.

## 7. Simulation Spot-Check (informal; formal methodology in simulation-methodology.md)

An informal Monte Carlo (Python, 1-2M rounds per scenario, ideal uniform draw) was run while
drafting this model. Results, all matching theory:

| Check | Simulated | Theoretical |
|---|---|---|
| Balanced per-player EV (stake 10) | −0.0912 | −0.100 (within 2σ sampling noise) |
| House take, balanced pools | 1.0000% of handle | 1% |
| House take, whale-imbalanced pools | 1.0016% of handle | 1% |
| Whale-zone 10-stake EV (pools 600/80/40×4) | −1.258 | −1.254 |
| Small-zone 10-stake EV (same pools) | +3.374 | +3.363 |
| Conservation (10k random rounds) | exact to 1e-6 | exact |
| Solo player EV vs. 50-seed pools (stake 10) | −1.62% of stake | see §6 |

The formal, CI-integrated validation (10M+ rounds, run against the *production* settlement and
draw code, not a reimplementation) is specified in
[simulation-methodology.md](simulation-methodology.md).

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
Rake:   0.06 × 90 = 5.40 to the house
Salvage distributed: 0.94 × 90 = 84.60 across surviving pool total 710

A player with 20 staked on z2:
  payout = 20 + 84.60 × (20/710) = 20 + 2.383 = 22.38   (net +2.38, ≈ +11.9%)
A player with 40 staked on z1: net −40.
House: +5.40 rake − 50 seed lost on z1 + salvage on its five surviving seeds
  (5 × 50/710 × 84.60 = 29.79) → house net −14.81 this round
  (the house wins/loses its seeds like a player; in expectation across rounds its
   take converges to r/K × handle = +8.00 per 800-handle round, per §3.)
Conservation: 710 (survivor stakes returned) + 84.60 (salvage) + 5.40 (rake) = 800 ✓
```

## 9. Storm Surge — Progressive Jackpot (added post-MVP-launch by product request)

The bounded per-round upside (§5) was flagged at concept selection as Landfall's main weakness
vs. Crash's "500x dream," with this exact mitigation sketched. Now implemented:

- **Funding:** `SURGE_RAKE_SHARE = 50%` of every round's rake feeds a progressive pot; the house
  keeps the other half. The pot is *already-collected* money — the zero-liability property (§3)
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
  same odds" property survives. Long-run effective house edge drops from `r/K = 1%` to
  **≈0.5% of handle** (half the take returns to players through the pot), further reduced by
  floor re-seeds. Big stakes hunt the pot with proportionally better odds (high-roller appeal);
  small stakes can win extreme multipliers (pot/stake can exceed 500x) — both audiences served
  by one mechanism.

## 10. Storm Power — Salvage Multiplier Ladder (added by product request: the "tail dream")

Product asked for Aviator's core motivation — *"even 1 credit can catch a 500×"* — without
abandoning pari-mutuel identity. Solution: every round's storm has a **category** drawn from
digest span `[35,40)` (20 bits), and survivors' salvage is multiplied by the category's `M`:

| Tier | M | Probability (exact, /2²⁰) | Frequency |
|---|---|---|---|
| Category 1 | ×0.5 | 733,570 | ~70% of rounds |
| Category 2 | ×1 | 168,980 | ~16% |
| Category 3 | ×2 | 104,858 | ~1 in 10 |
| Category 4 | ×5 | 37,749 | ~1 in 28 |
| Category 5 | ×25 | 3,146 | ~1 in 333 |
| Category 6 | ×100 | 252 | ~1 in 4,161 |
| PERFECT STORM | ×500 | 21 | ~1 in 49,932 |

**Key property: E[M] = 1 EXACTLY** in the integer probability space (asserted by a unit test
that sums `count × M` over the ladder — it equals 2²⁰ precisely). Therefore the ladder changes
*variance only*: house edge, per-strategy RTP, and all §3-§4 results are untouched. The
multiplier applies to salvage only, never the returned stake, so a surviving win can never
become a loss (Cat 1 halves the profit, doesn't erase it).

**Liability honesty:** with M > 1 the house pays `(M−1) × distributable` from bankroll; with
M < 1 it keeps the difference. Expected net is zero, but variance is real — worst case per
round is `499 × 0.94 × struckPool`. Settlement tracks `houseDeltaMinor` explicitly and the
runtime conservation assert becomes `payouts + rake = handle + houseDelta`. A production
deployment would cap per-round liability or size bankroll to the max table handle × 500 —
recorded as an operator decision, out of scope for the local build.

**Why E[M]=1 rather than funding the tail from extra edge:** transparency. The player-facing
statement stays simple ("the ladder is variance-neutral; the house takes the same 1% rake"),
and the verification tool can recompute the tier from the seed like everything else.

## 11. Open Parameters (tracked, not finalized here)

- Min/max stake per room, and whether max stake should be capped as a fraction of current
  handle (an anti-whale-domination lever unique to pari-mutuel games — worth a dedicated
  balancing pass at scaffold time).
- `h` (house seed) sizing policy as typical room population grows — could shrink as real
  liquidity arrives; requires re-checking §6's deviation bound whenever changed.
- Future room tiers: `(K, r)` variants for coarse volatility selection.

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
