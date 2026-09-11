# 06 — Test Catalogue

**Every automated test in this pack, and the clause it evidences.**

145 tests in 11 files, plus the 375 tests of the application's own suites, which `run.sh` also
executes. Regenerate this listing at any time:

```bash
cd iGaming && pnpm exec vitest run --config ../certification-tests/vitest.config.ts --reporter=verbose
```

---

## suites/rng/distribution.test.ts — 7 tests
**GLI-19 §3.2.3 (distribution), §3.2.5 (available outcomes)**

| Test | Clause | What it establishes |
|---|---|---|
| the struck harbour is uniform over 1/6 (chi-square, 99% confidence) | §3.2.3 | 240,000 draws from the production chain; χ² against the 99% critical value, computed by bisection rather than typed |
| bounds the modulo bias of the harbour mapping exactly | §3.2.3(a) | The mapping is *not* exactly uniform — 2⁵² mod 6 = 4 — and the bias is bounded at 1.3 × 10⁻¹⁵ relative, twelve orders of magnitude below what any feasible sample resolves |
| the Storm Power tier matches its published probabilities | §3.2.3 | A non-uniform distribution by design, tested against the published paytable; sparse tiers pooled |
| the Storm Surge trigger fires at its published probability | §3.2.3 | Tested against the **implemented** rate (a 20-bit threshold), not the nominal one |
| the weather pattern mapping is exactly uniform | §3.2.3 | 256 mod 4 = 0 — the contrast with the harbour mapping, asserted |
| every outcome is available on a single round number, across seeds | §3.2.5 | All six harbours, three or more tiers and both jackpot states reachable at a fixed round id |
| the harbour statistic is neither too large nor too small | §3.2.2 | Two-sided p in (0.005, 0.995). A χ² that is *too low* is its own non-randomness |

## suites/rng/battery.test.ts — 4 tests
**GLI-19 §3.2.2 (statistical analysis, collectively at 99%)**

| Test | What it establishes |
|---|---|
| runs all seven tests over independent streams | 7 tests × 20 streams × 12,000 draws; every p-value finite and in [0,1] |
| the rejection rate is consistent with the 1% the level implies | The collective reading — 140 decisions, 1.4 expected rejections |
| no individual test rejects in more than a small minority of streams | So one systematically broken test cannot hide inside an acceptable aggregate |
| the p-values are consistent with a uniform distribution | Kolmogorov–Smirnov against uniform(0,1) — a stronger statement than any individual pass |

The seven: Total Distribution, Overlaps, Coupon Collector, Runs (Wald–Wolfowitz on a binary
recoding — see `docs/03-rng-design-and-testing.md` §4.1 for why not runs-up-and-down), Interplay
Correlation, Serial Correlation, Duplicates.

## suites/rng/strength-and-independence.test.ts — 12 tests
**GLI-19 §3.2.4, §3.3.1–§3.3.2, §4.5.2**

| Test | Clause | What it establishes |
|---|---|---|
| the draw function cannot see the pools — it has no parameter for them | §4.5.2 | **Structural.** `drawZone.length === 3`; adding a fourth parameter fails the build |
| the struck harbour does not move when the money does | §4.5.2(a)–(e) | Four wildly different crowds, same round, same harbour |
| history does not influence the next outcome | §4.5.2(d) | Conditioned on every run of three identical harbours, the next is still uniform |
| the announced jackpot bit carries no information about the harbour | §3.2.4 | The game *announces* this bit before betting — a leak would hand players the answer |
| the multiplier tier carries no information about the harbour | §3.2.4 | 6 × 2 contingency independence over 200,000 draws |
| cosmetic domains are separate HMAC messages, not slices of the harbour digest | §3.2.4 | So a cosmetic change can never perturb the outcome bytes |
| outcomes from adjacent chain links are uncorrelated | §3.2.4 | Lag-1 to lag-5; adjacent seeds are related by construction, outcomes must not be |
| the outcome is exactly the published HMAC of the round seed | §3.3.1 | The construction, recomputed as a player's verifier would |
| past outcomes do not predict the next one better than chance | §3.3.2(a) | An order-2 Markov predictor fitted on half the sequence, evaluated on the other half |
| two seasons minted independently share no link | §3.3.2(b) | CSPRNG seeding; no clock in the path |
| a season boundary re-mints the state from fresh entropy, bounding any compromise | §3.3.2(c) | **The partially-met clause.** The bound is asserted; the residual risk is declared |
| every revealed seed verifies against the previously published value | provable fairness | 500 links walked; a single flipped bit fails |

## suites/math/rtp-derivation.test.ts — 12 tests
**GLI-19 §4.7.1, §4.7.2**

| Test | What it establishes |
|---|---|
| base return is 1 − r/K, and the identity holds for any pool shape | `E[P_hit] = T/K` verified by enumeration over four shapes, including a 900:1 imbalance |
| ladder return is E[M−1]·(1−r)/K, with E[M−1] summed exactly | Exhaustive over the 2²⁰ outcome space, in BigInt |
| jackpot return is split.surge·r/K | Closed form |
| reset return is budget·split.house·r/K, and the handle cancels | **The rules-v4 fix.** Checked across five orders of magnitude of table size |
| the four flows sum to the published figure and its complement | To 12 decimal places |
| decomposes exactly into its three components | Including the reserve head-room, so no residue is unexplained |
| the ladder is funded by its reserve share, proved in integers | BigInt over a common denominator; utilisation reported, not asserted at a magic threshold |
| clears 75% by a wide margin, at every table size and every pool shape | §4.7.1, across the permitted rake range 6%–20% |
| a solo player against the house seeds still clears the floor | The worst realistic case: 91.48%, bounded and disclosed |
| returns every bet when no harbour survives, rather than taking the pool | **A closed defect** — this configuration used to return 0% |
| the player-facing sentence names every term and the hold | §4.7.2(a) |
| the figure is a pure function of configuration, not of table size | §4.7.2 |

## suites/payouts/settlement.test.ts — 16 tests
**GLI-19 §4.3.3, §4.4.1(d), §4.7.1, §4.13.9**

| Test | What it establishes |
|---|---|
| a survivor receives stake + (1−r)·P_hit·S/(T−P_hit) | The code compared against the sentence players are shown |
| distributes every minor unit, and is independent of stake ordering | The largest-remainder policy; order independence is what makes a player's own recomputation match |
| never leaves a minor unit behind, over 5,000 random rounds | Exactly, every round — not on average |
| holds across 20,000 random rounds, every ladder tier, cap engaged | Conservation re-asserted from outside; every line integral and non-negative; every stake appears exactly once |
| a survivor is never paid less than the ×1 identity | The ladder floor, across 3,000 rounds × every tier |
| the liability cap never clamps below the pari-mutuel base | A cap set absurdly low still pays the base |
| an empty round settles to nothing rather than throwing | Edge |
| a round where nothing was staked on the struck harbour pays no salvage | Edge |
| a single surviving stake takes the whole distributable pool | Edge |
| zero-amount stakes neither earn nor break the split | Edge |
| stays in exact integer arithmetic at the protocol ceiling | Worst case ~10¹¹ minor units, inside 2⁵³ — tested, not assumed |
| selects exactly one winner, deterministically and reproducibly | §4.13.9 |
| excludes house seeds and practice bots from the jackpot | §4.11.1(c) |
| rolls over when no player stake survived | Order 222 Art. 17.3 |
| weights selection by stake size | Swept rather than sampled, so it is exact |
| the flat-odds mode gives every surviving stake equal odds | The alternative mode, announced pre-round |

## suites/jackpot/controls.test.ts — 19 tests
**GLI-19 §4.13, §2.4.2; Order 243 Annex 1 Art. 17**

Grouped by clause: contributions never lost (2), the ceiling and its diversion pool (3), payoff
and reset (3), no cancellation of an unpaid jackpot (2), decommissioning (3), monthly balancing
(3), one winner per trigger (1), reset affordability and degenerate configurations (2).

Highlights:

| Test | What it establishes |
|---|---|
| every contributed unit reaches either the pot or the diversion pool | `toPot + toDiversion === contribution`, over 5,000 contributions |
| the ceiling is a pure function of the tier and cannot drift downward | §2.4.2(b) satisfied **by construction**, not by procedure |
| the diversion scheme has finite expectation and a bounded state | §4.13.5, driven over 200,000 rounds |
| refuses a destination where the player is less likely to win | Art. 17.4 — the refusal *is* the control |
| raises an incident on a discrepancy of a single minor unit | Art. 17.2, with **no tolerance band** — every movement is integral, so a discrepancy is always a real defect |
| balances a simulated month driven through the control software | 90,000 rounds through the real functions, then reconciled from the aggregates they produced |

## suites/compliance/disclosures.test.ts — 19 tests
**GLI-19 §4.4.1, §4.6.1, §4.7.2–§4.7.4, §4.8.6, §4.11.1, §A.5.1–§A.5.2**

Checks the **derived disclosure objects** the client renders, not the pixels — a number rendered
from the certified source cannot drift from it, while a number retyped in a component can.

| Test | Clause |
|---|---|
| the top award is far more frequent than 1 in 100,000,000, so the odds must be shown | §4.7.3 |
| every tier publishes a probability and an odds figure that agree | §4.7.3 |
| publishes the floor and the ceiling of the multiplier | §4.8.6 |
| no advertised tier is unpayable at the reference pool shape | §4.4.1(f) |
| **the old 25× cap would have failed this check — the guard has teeth** | §4.4.1(f) |
| publishes the pool share above which each tier starts to be clamped | §4.7.4 |
| states the settlement formula and the two quantities in it | §4.4.1(d) |
| states what the multiplier applies to, and what it does not | §4.4.1(k) |
| says plainly that reading the crowd changes payout, not probability | §4.6.1(a) |
| discloses the house seed, its uniformity, and where its profit goes | §4.11.1(c), §A.7.1 |
| discloses the table-routing rule and the reason for it | §4.11.1(b) |
| carries the malfunction notice verbatim | Order 243 Art. 8.1(b) |
| covers settlement failure, disconnection and malfunction | §A.5.2(c)–(e) |
| every version in the changelog is present, ordered, and dated | §A.5.1 |
| the current version resolves, and is the newest one | §A.5.1 |
| every material change names the limb of Art. 24¹.2 it engages | Law Art. 24¹.2 |
| the shipped rules version reflects the current economy | §A.5.1 |
| quotes one figure, derived once, with every term named | §4.7.2(a) |
| the same figure appears wherever the rake is the same | §4.7.2 |

## suites/compliance/game-lifecycle.test.ts — 11 tests
**GLI-19 §4.3.3, §4.15.1, §4.16, §A.5.1, §A.6.3, §A.6.4, §A.7.1**

Stands a real `RoundCoordinator` up against a real in-memory SQLite and drives whole rounds
through it. Queries use **plain SQL**, not the ORM the game uses, so the assertions cannot pass by
a mapping layer agreeing with itself.

| Test | Clause |
|---|---|
| debits on accept and credits the award at settlement | §4.3.3(b),(d) |
| refuses a wager that would take the balance negative | §4.3.3(b) |
| a cancelled order is refunded in full before lock | §4.3.3 |
| the house account never receives house-seed winnings | §A.7.1(c) |
| **conserves total value across many settled rounds, jackpot included** | §A.7.1 — every account, fund and ledger summed, invariant to the minor unit over 25 rounds |
| stops new bets immediately and lets the locked round conclude | §4.15.1 |
| records the disable with date, time, actor and reason | §A.6.3 |
| **voids, refunds in full, and records an incident** | §4.16.2, §A.6.4 — a real storage failure is driven at lock |
| keeps dealing rounds after a failed one | Order 240 Art. 3.1 |
| stamps the rules version on the round at creation, not at settlement | §A.5.1 |
| refuses a room whose cap cannot pay the advertised ladder | §4.4.1(f) |

## suites/compliance/georgian-p2p.test.ts — 10 tests
**Order 243 Annex 1 Art. 13 — Peer-to-Peer games**

The chapter where the Georgian text is **stricter than GLI-19**, and where two obligations are
not satisfied by the GLI reading of the same subject.

| Test | Clause |
|---|---|
| a room requesting computerized players refuses to start outside a demo build | Art. 13(a) — absolute, no disclosure exception |
| every shipped room refuses to start outside a demo build | Art. 13(a) — the classification cannot drift |
| the option exists, and reaches every affordable table | Art. 13(b) — an **option**, not a disclosure |
| is roughly uniform over the tables the player can afford | Art. 13(b) |
| never seats a player at a table they cannot afford | Art. 13(b) — "at random" ≠ "at a table you cannot play" |
| falls back to a real table when the balance affords none | Art. 13(b) |
| the sentinel is not a room id, so it cannot collide with a tier | Art. 13(b) |
| the disclosure names both the default rule and the random option | Art. 13(b), §4.11.1(b) |
| the disclosure states the window and what happens if it passes | Art. 13(c)–(d) |
| the window is published on the round itself, not only on the clock | Art. 13(c) |

## suites/demo/demo-mode.test.ts — 16 tests
**GLI-19 §4.9.1, §4.11.1(c)–(d), §2.5.6, §A.2.5**

See `docs/07-demo-mode.md` for the narrative. Grouped: the bots policy (4), bot marking and
jackpot exclusion (3), the demo represents the paid game (2), practice credits (5), no real-money
path (2).

## suites/edge-cases/boundaries.test.ts — 19 tests
**GLI-19 §4.2.2(c), §4.2.3, §2.5.5; configuration validators**

| Group | Tests | What it establishes |
|---|---|---|
| The wire protocol | 3 | A closed schema; 16 hostile inputs refused, the documented set accepted at its boundaries, and the deliberate split between what the schema bounds and what the game decides |
| Configuration guards | 5 | A bad room cannot start: rake range, split sum, inverted tiers, a round-share cap that would reject the first bet, an under-funded practice bot, an inverted seed floor |
| The accept path | 7 | Tier bounds, the round-share cap and its rise as players arrive, split validation, **a 200-order burst with the balance reconciling after every order**, post-lock refusal, unknown players, signals without a fleet |
| Responsible gambling | 4 | Server-enforced stake cap, self-exclusion that only extends, tighten-now/loosen-later asymmetry, committed stake counted against the daily limit **before** it is lost |

---

## The application's own suites

`run.sh` also runs these — 375 tests across `iGaming/packages/*`. The ones most relevant to a
certification review:

| File | Tests | Subject |
|---|---|---|
| `core/test/compliance.test.ts` | 27 | The compliance invariants, including the four RTP flows |
| `core/test/rng-battery.test.ts` | 8 | The product's own battery |
| `core/test/storm-power.test.ts` | 11 | The ladder's funding invariant in exact arithmetic |
| `core/test/settlement.test.ts` | 9 | Settlement, including the no-survivor refund |
| `core/test/surge-floor.test.ts` | 11 | The jackpot reset policy, rewritten for rules v4 |
| `server/test/resilience.test.ts` | 5 | **Season rollover and the phase fault boundary** |
| `server/test/gameControl.test.ts` | 7 | **The disable gate, end to end** |
| `server/test/demoCredits.test.ts` | 9 | **Practice credits** |
| `server/test/ringfence.test.ts` | 6 | The house-seed ring-fence and value conservation |
| `server/test/limits.test.ts` | 6 | Responsible-gambling enforcement |
| `server/test/retention.test.ts` | 6 | Data retention |
| `server/test/collusion.test.ts` | 4 | Collusion detection |
| `web/test/*` | 187 | Client state machines, payout preview, stake limits, accessibility helpers |

The three files in bold are new in this pass and guard the defects recorded in
`docs/08-findings-and-fixes.md`.

---

## Evidence generators

| Script | Output | Runtime |
|---|---|---|
| `simulations/rtp-convergence.ts` | Measured RTP per tier with a 99% block-bootstrap CI, and the operator-hold spread | ~90 s |
| `simulations/rng-evidence.ts` | The statistical report behind the battery: every p-value, every observed frequency | ~60 s |
| `simulations/identity.ts` | Source and configuration digests, the per-file manifest, the published economy, the rules changelog | instant |
| `iGaming/packages/core/scripts/simulate.ts` | The 1,000,000-round economy release gate, 13 pass/fail checks | ~20 s |
| `iGaming/packages/core/scripts/certification-sim.ts` | A per-tier behavioural-crowd season report with distribution tests and a risk analysis | ~30 s/tier |
