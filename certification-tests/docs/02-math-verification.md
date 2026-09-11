# 02 — Mathematical Verification (PAR Sheet)

**The published return to player, derived, proved, and measured.**

Rules version 4 · Theoretical RTP **99.3491%** · Operator hold **0.6509%** of handle

---

## 1. Notation

| Symbol | Meaning | Value |
|---|---|---|
| `K` | Harbours per round | 6 |
| `r` | Rake, taken from the struck pool only | 0.12 |
| `T` | Round handle (every stake, house seed included) | — |
| `P_hit` | The struck harbour's pool | — |
| `M` | Storm Power multiplier for the round | 1 … 500 |
| `split` | Rake destinations | house 0.50 / jackpot 0.25 / reserve 0.25 |
| `b` | Jackpot reset budget fraction | 0.35 |
| `p_j` | Jackpot trigger probability | 1/25 |

All money is integer **minor units**; 1 credit = 100 minor units. There is no floating-point
money anywhere in settlement.

---

## 2. The settlement rule, and why there is no paytable

A bet `S` in a **surviving** harbour returns

```
S  +  (1 − r) · P_hit · S / (T − P_hit)   ×  M
```

A bet in the struck harbour returns nothing. That is the whole game.

GLI-19 §4.4.1(d) requires the artwork to state "all possible winning outcomes and combinations,
along with their corresponding payouts". For a pari-mutuel game the set of outcomes is not
enumerable — the payout depends on the round's own pools, which are made by the players — so the
disclosure is the **formula itself**, rendered from
`settlementFormulaDisclosure()` in `core/src/rules.ts` and shown in the game-information dialog.

This is the one presentation question worth agreeing with the laboratory in advance. Our position
is that a formula stated in the player's own terms, with both of its quantities named and shown
live on the board during betting, discloses strictly more than a table could: a player watching
the tide report can see `P_hit` and `T` forming in front of them.

**Verified by:** `suites/payouts/settlement.test.ts` — the first test compares the code's output
against the sentence above, term by term, and the disclosure suite asserts the sentence names
both quantities.

### 2.1 The rounding policy

Exact shares almost never divide evenly. The policy is: **floor each share, then hand the
remaining minor units to the largest fractional remainders, tie-broken by stake id.**

Two properties follow and both are tested:

- **Nothing is created or destroyed.** The distributed salvage equals the distributable pool
  exactly, every round, not on average. Checked over 5,000 random rounds.
- **Order does not matter.** Settling the same stakes in reverse order produces identical
  payouts. The tie-break on stake id is what guarantees this, and it is why the stake id is part
  of the public lock snapshot: a player can recompute their own payout and get the same answer
  the server did.

---

## 3. Return to player — the four flows

Theoretical return is a function of **handle**. Each flow below is a closed form in the economy
configuration alone, so the figure does not move with table size, population or crowd shape.

### Flow 1 — the pari-mutuel pass-through

Every credit staked is returned except the rake, and the rake is taken only from the struck pool.
The draw is uniform and independent of the pools, so `E[P_hit] = T/K` **exactly**, whatever shape
the crowd takes. The expected deduction is therefore `(r/K)·T`.

```
base = 1 − r/K = 1 − 0.12/6 = 98.0000%
```

The load-bearing claim is `E[P_hit] = T/K` regardless of shape. It is verified by enumeration
rather than asserted: for four different pool shapes, including a 900:1 imbalance, the rake is
averaged over all six equally likely harbours and lands on `r/K` of handle every time.

### Flow 2 — the Storm Power ladder

Survivors' salvage is multiplied by `M ≥ 1`. The overpayment `E[M−1]` is paid from the Storm
Reserve on top of the base, and applies to the distributable pool `(1−r)·P_hit`:

```
power = E[M−1] · (1 − r) / K = 0.0340338 × 0.88 / 6 = 0.4991%
```

`E[M−1]` is an exact finite sum — the ladder's outcome space is 2²⁰ and every tier is an explicit
integer count — and the suite computes it in **BigInt over a common denominator** before
comparing it to the shipped `expectedOverpayment()`.

### Flow 3 — the Storm Surge jackpot

The jackpot share of the rake feeds the progressive pot, and the pot is always paid out: Order
222 Annex 1 Art. 17.3 forbids cancelling an unpaid jackpot, so a rollover **defers** a payout
rather than removing one. Over any horizon the whole contribution returns to players.

```
jackpot = split.surge · r/K = 0.25 × 0.02 = 0.5000%
```

### Flow 4 — the house-funded jackpot reset

After every win the house restores the pot to its **reset value** out of its own share of the
rake. That is operator capital which reaches a player the next time the pot pays, so it belongs
in the return figure.

The reset is set to a fixed fraction of what the house share can fund at this table's handle:

```
reset          = b · [ split.house · (r/K) · H ] / p_j
cost per round = reset · p_j = b · split.house · (r/K) · H
as a fraction of H:   b · split.house · r/K = 0.35 × 0.5 × 0.02 = 0.3500%
```

**The handle cancels.** That is the entire point, and it is what makes this flow expressible as a
constant rather than as "it depends". The cancellation is tested across five orders of magnitude
of table size.

> **This term was missing until rules v4, and its absence made the published figure wrong.** See
> `docs/08-findings-and-fixes.md` §2 for the full account: under rules v3 a `max(20 × minimum
> bet, budget)` floor overrode the budget at every shipped tier, the cancellation did not hold,
> and measured return ran 0.25–0.75 points above the published 98.999% by a margin that grew as a
> table got quieter.

### The total

| Flow | Formula | Value |
|---|---|---|
| Base pari-mutuel | `1 − r/K` | 98.0000% |
| Storm Surge jackpot | `split.surge · r/K` | 0.5000% |
| Storm Power ladder | `E[M−1] · (1−r)/K` | 0.4991% |
| Jackpot reset (house-funded) | `b · split.house · r/K` | 0.3500% |
| **Theoretical RTP** | | **99.3491%** |
| **Operator hold** | `1 − RTP` | **0.6509%** |

**GLI-19 §4.7.1** sets a floor of 75%. LANDFALL clears it by 24 percentage points, at every
permitted rake setting (6%–20%) and at every pool shape tested, including the worst realistic
single-player case in §6 below.

**Verified by:** `suites/math/rtp-derivation.test.ts` (12 tests).

---

## 4. What the operator actually keeps

The hold decomposes into exactly three components, and naming the third matters — an unexplained
residue in the hold is what a variance investigation spends a week chasing.

```
operator hold
  =  split.house · r/K                        house share of the rake        1.0000%
  −  b · split.house · r/K                    paid back into the jackpot    −0.3500%
  +  ( split.reserve · r/K − E[M−1]·(1−r)/K ) unspent reserve head-room     +0.0009%
  =  0.6509%
```

The third term is the deliberate slack in the ladder's funding budget: the ladder is designed to
draw **at most** the reserve's share of the rake, and it uses 99.8% of it. The unused 0.2% stays
with the operator.

**Verified by:** `suites/math/rtp-derivation.test.ts` — "decomposes exactly into its three
components", asserted to 12 decimal places.

---

## 5. The Storm Power ladder

Drawn from a 20-bit span of the round digest. Probabilities are exact integer counts in 2²⁰
space, so there is no rounding anywhere in the specification.

| Tier | Multiplier | Count / 2²⁰ | Probability | Actual odds |
|---|---|---|---|---|
| Category 1 | ×1 | 955,529 | 0.911260 | 1 in 1.10 |
| Category 2 | ×1.25 | 83,886 | 0.080000 | 1 in 12.5 |
| Category 3 | ×2 | 8,000 | 0.0076294 | 1 in 131 |
| Category 4 | ×5 | 1,100 | 0.0010490 | 1 in 953 |
| Category 5 | ×25 | 55 | 0.000052452 | 1 in 19,065 |
| Category 6 | ×100 | 5 | 0.0000047684 | 1 in 209,715 |
| PERFECT STORM | ×500 | 1 | 0.00000095367 | 1 in 1,048,576 |

### 5.1 The floor is ×1

A survivor's salvage is **never reduced**. Category 1 leaves it exactly as the pari-mutuel split
calculated it. Tested directly: for 3,000 random rounds and every tier, no line's payout is ever
below its ×1 value.

### 5.2 §4.7.3 — the odds must be displayed

The top award occurs about once in 1,048,576 rounds, roughly **95× more frequently** than the
1-in-100,000,000 threshold at which §4.7.3 would permit the odds to be omitted. Displaying them
is therefore mandatory, and they render from `stormPowerPaytable()` on a permanent game-surface
control rather than from retyped copy.

### 5.3 §4.4.1(f) — the award must be winnable in full

The liability cap is denominated in round **handle** while the multiplier applies to the
**distributable pool**, so the cap binds as a function of pool shape:

```
salvage = (1−r)·P_hit·M ≤ C·T    ⟺    M ≤ C / ((1−r)·P_hit/T)
```

The cap is **derived from the ladder**, not chosen: it must pay every advertised tier in full
while the struck harbour holds up to twice its uniform share.

```
C ≥ (1−r) · M_max · (2/K) = 0.88 × 500 × 2/6 = 146.67  →  C = 150
```

`unwinnableTiers()` is the executable form of that requirement, and `RoundCoordinator` calls it
**at construction**, so a room configuration that would make the headline award unpayable refuses
to start rather than quietly clamping players' awards.

> The earlier 25× cap failed this. At 25× the ×500 was clamped in essentially every round it
> could land in. The suite asserts both that the current cap passes and that the old one fails —
> a guard that cannot fail is not a guard.

### 5.4 §4.7.4 — the limitation is disclosed

Where the cap can still bind, the struck-harbour share above which it starts to do so is
published next to each tier's odds. At the shipped cap the ×500 pays in full up to a struck
share of 34.1% of handle — twice a harbour's uniform share.

---

## 6. Variance, and the honest edge cases

### 6.1 Single-round dispersion

At a balanced table a survivor's gain is `(1−r)/(K−1) ≈ +17.6%` of stake, and the single-round
standard deviation is `σ ≈ 0.443 × stake`. That figure drives the variance bands in
`classifyRtpVariance()` used for the §A.6.2 theoretical-versus-actual monitoring.

### 6.2 The solo player

A lone player against the house seeds faces a **worse-than-nominal** return, because their own
stake makes their harbour the heaviest pool — they are the whale of their own round.

Measured at a 25.00 seed against a 100.00 stake: **91.48%**, against a published 99.35%.

This is disclosed rather than averaged away. It is also why `houseSeedPerZone()` raises the seed
when a table goes quiet: a bigger seed dilutes the player's own weight in their pool and pulls the
figure back toward the published one. The effect disappears entirely as soon as the player is not
alone.

It clears the §4.7.1 floor of 75% with a wide margin, and it is bounded and tested.

### 6.3 Nobody survives

If every stake in a round sits on the harbour that is struck, there is no survivor pool and the
pari-mutuel rule has nothing to say. **The round is a no-op and every bet is returned in full**,
with no rake taken.

This cannot happen while the house seeds every harbour, but a room may be configured with no seed
at all — a legitimate pure player-versus-player table, and the cleanest configuration there is
under §A.7.1. Before rules v4 this branch booked the entire pool as rake: a 100% hold, against a
§4.7.1 floor of 75%. See `docs/08-findings-and-fixes.md` §3.

---

## 7. The operator's exposure

On the base game the payout liability is **structurally zero** — settlement redistributes money
already staked in the same round. Real exposure is confined to three funds.

| Fund | What it covers | Opening capital | Measured draw |
|---|---|---|---|
| **Storm Reserve** | The ladder's `E[M−1]` overpayment | `150 × liquidity floor` | 0.49% of handle in, 0.49% out; **no backstop drawn** over 1M rounds |
| **Jackpot reset** | Restoring the pot after each win | — | 0.3503% of handle against a modelled 0.3500% |
| **Liquidity float** | The house seed that keeps a thin table playable | 20 fully-seeded rounds | No operator top-up required over 1M rounds |

### 7.1 The reserve's funding invariant, proved in integers

```
E[M−1] · (1 − r)  ≤  split.reserve · r
```

Cleared of fractions and checked in BigInt: the ladder draws 99.83% of its budget, leaving
deliberate head-room. The reserve opens **capitalized** and can no longer go negative; where a
draw would exceed the balance the shortfall is booked as an explicit, ledgered house backstop —
a named obligation rather than a minus sign.

Measured over 1,000,000 rounds: **zero backstops**, minimum balance 20% of opening.

### 7.2 The house seed is +EV, and the surplus is returned

The seed is staked uniformly on all six harbours, so it expresses no view and cannot win by
predicting. Its expected profit is nevertheless **not zero**: the survivor payout is convex in
the struck pool, so the seed wins more when a heavy harbour is hit than it loses when a light one
is. Measured over 1,000,000 rounds: **+0.0875% of handle**.

> The ring-fence documentation used to say this expectation was zero by symmetry. It is not, and
> the correction is recorded in `docs/08-findings-and-fixes.md` §4.

GLI-19 §A.7.1(c)–(d) requires that the operator not profit from the play beyond the rake, and
that operator-funded wagers "shall ultimately be lost". Segregation alone satisfies the first;
only **returning the surplus** satisfies the second. The float keeps its opening capitalization
plus a few rounds of head-room and releases everything above that to the jackpot, which pays out
to a player in full.

Measured: **0.084%–0.104% of handle released per tier**, essentially all of the seed's profit.

---

## 8. Measured against the model

Every outcome from the production RNG, every settlement from the production settlement,
150,000 rounds per tier, 99% block-bootstrap interval resampled by round.

| Tier | Measured player RTP | 99% interval | Seed share | Expected on that basis | Inside CI |
|---|---|---|---|---|---|
| Skiff Harbor | 99.2874% | [99.2426%, 99.3355%] | 3.00% | 99.3290% | yes |
| Schooner Bay | 99.3154% | [99.2644%, 99.3701%] | 2.60% | 99.3317% | yes |
| Flagship Sound | 99.3085% | [99.2599%, 99.3551%] | 2.60% | 99.3317% | yes |
| Galleon Roads | 99.3445% | [99.2772%, 99.4258%] | 2.60% | 99.3317% | yes |
| Leviathan Deep | 99.3034% | [99.2505%, 99.3584%] | 2.60% | 99.3317% | yes |

### The two bases, and why they are not the same number

**The published figure is on TOTAL handle. The measured figure is on PLAYER handle** — Resolution
455 Art. 2(d) defines GGR as bets received minus winnings paid, and a house liquidity seed is not
a bet received.

Those denominators differ, so the figures differ, by an amount that is derivable rather than
mysterious. The operator's hold is levied on total handle while players supply only part of it, so
with `s` the seed's share of handle:

```
player-basis RTP  =  1 − hold / (1 − s)
```

At a populated table `s ≈ 2.6%`, giving 99.3317% — which is the column the measurements are
checked against. Comparing a player-basis measurement to a total-handle model would be comparing
two different quantities and calling the difference an error.

The same arithmetic is why a player **alone** at a table sees a lower return: `s` rises as the
table empties, and in the limit it is the 91.48% solo case of §6.2.

### The ledger behind those figures

Every figure a fraction of **total** handle, over 150,000 rounds per tier:

| Tier | Rake | House share | Jackpot re-seed | Float surplus released | Reserve backstop | Float top-up |
|---|---|---|---|---|---|---|
| Skiff Harbor | 1.9983% | 1.0024% | 0.3434% | 0.0793% | 0.0000% | 0.0000% |
| Schooner Bay | 2.0016% | 1.0014% | 0.3546% | 0.1028% | 0.0000% | 0.0000% |
| Flagship Sound | 2.0011% | 1.0006% | 0.3487% | 0.1018% | 0.0000% | 0.0000% |
| Galleon Roads | 2.0005% | 1.0003% | 0.3502% | 0.1022% | 0.0122% | 0.0000% |
| Leviathan Deep | 2.0036% | 1.0018% | 0.3474% | 0.1029% | 0.0086% | 0.0000% |
| **Modelled** | **2.0000%** | **1.0000%** | **0.3500%** | — | — | — |

### The property that matters most

A return figure that moves with table size is not a return figure. The operator hold now spans
**0.6379% – 0.6590%**, a spread of **0.021 percentage points** across a stake ladder whose tiers
are a factor of 10,000 apart end to end.

Under rules v3 the same measurement gave a spread of **0.26% – 0.61%** against a published 1.00%,
and the spread was systematic rather than noise: the thinner the table, the larger the error. That
is the defect rules v4 fixed.

At 1,000,000 rounds on the release gate the re-seed flow lands at **0.3510%** against a modelled
0.3500%, and the operator net hold at **0.6518%** against a modelled 0.6509%.

Reproduce: `./run.sh --evidence` → `evidence/02-rtp-convergence.txt`, `evidence/01-release-gate.txt`.

### The residual, and where it comes from

Three effects remain, all small and all named in `core/src/rtp.ts` beside the model so the code
and the PAR sheet cannot drift apart:

1. **The jackpot count is Poisson.** The reset is paid per win, so in any finite window the flow
   moves with the number of wins — ±12% on the count over a thousand rounds. This dominates, and
   it has no sign.
2. **Rollovers and diversion-funded resets**, both downward: a jackpot round with no surviving
   player stake rolls over without a re-seed, and a reset funded from the diversion pool costs the
   house nothing.
3. **Integer flooring**, downward and largest at the smallest tier, where a minor unit is a larger
   fraction of the amounts being divided.

---

## 9. Reporting definitions

| Figure | Definition | Basis |
|---|---|---|
| Theoretical RTP | The four flows above | Total handle |
| Actual RTP | Returned ÷ player handle | Player handle |
| GGR | Bets received − winnings paid (Order 240 Art. 2.2(a.d), Res. 455 Art. 2(d)) | Player handle |
| Operator net | Rake share − jackpot re-seed − reserve backstop − float top-up | Total handle |

`actualRtp()` in `core/src/rtp.ts` returns all three from the ledgers, and carries both handle
figures deliberately — reporting one while computing the other is exactly the kind of mismatch a
variance investigation would chase for a week.

**Variance monitoring (§A.6.2):** `rtpVarianceBand(n)` widens as the sample shrinks, using the
single-round σ scaled by √n at 3σ. `classifyRtpVariance()` returns OK / WATCH / INVESTIGATE. A
naive fixed band would alarm constantly, because a pari-mutuel game's realised return is
dominated by whether a jackpot landed in the window.

---

## 10. Where each claim is verified

| Claim | Test |
|---|---|
| Base return is `1 − r/K` for any pool shape | `suites/math/rtp-derivation.test.ts` |
| `E[M−1]` summed exactly in BigInt | same |
| Reset term is `b·split.house·r/K`, handle cancels | same |
| The four flows sum to the published figure | same |
| The hold decomposes into its three components | same |
| The ladder is funded by its reserve share (integers) | same |
| 75% floor cleared at every rake and pool shape | same |
| Payout matches the disclosed formula | `suites/payouts/settlement.test.ts` |
| Rounding distributes every unit, order-independent | same |
| Conservation over 20,000 fuzzed rounds | same |
| Multiplier never reduces a payout | same |
| Cap never clamps below the pari-mutuel base | same |
| No harbour survives → full refund | both |
| Measured RTP agrees with the model, every tier | `simulations/rtp-convergence.ts` |
| Reserve never negative, no backstop over 1M rounds | `iGaming/packages/core/scripts/simulate.ts` |
| Float surplus released to players | same |
