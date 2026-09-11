# 01 — Scope and Method

**Read this before treating any number in this pack as a result.**

---

## 1. What is under test

LANDFALL is a **pari-mutuel multiplayer instant game**. Each round lasts about twenty seconds:
players bet on one of six harbours, exactly one harbour is struck, every bet in it is lost, and
the struck pool — less the rake — is shared among the surviving bets in proportion to size.

Two things follow from that shape and they govern everything in this pack.

**The operator is not the counterparty.** Settlement redistributes money staked in the same
round. On the base game the house cannot owe more than the round collected, so the payout
liability that dominates a house-banked game's risk analysis is structurally zero here. The
operator's real exposure is confined to three named funds, and `docs/02-math-verification.md` §7
measures each.

**There is no paytable.** A player's return is a function of the round's own pools. GLI-19
§4.4.1(d) requires "all possible winning outcomes and combinations, along with their
corresponding payouts" — for this game that is a formula, not a table, and the formula is what is
disclosed and what is tested. This is the single most likely point of discussion with a
laboratory, and it is treated head-on in `docs/02-math-verification.md` §2.

---

## 2. What this pack establishes

| Claim | How | Where |
|---|---|---|
| The outcome is decided by the RNG and by nothing else | Structural (the draw has no pool parameter) and behavioural (same round, four crowds, same harbour) | `suites/rng/strength-and-independence.test.ts` |
| The final outcome output is correctly distributed | χ² at 99% over 240,000 draws per stream, plus an exact bound on the scaling bias | `suites/rng/distribution.test.ts` |
| Outcomes are independent between and within draws | The seven-test battery over 20 independent streams, read as a rejection rate | `suites/rng/battery.test.ts` |
| The published RTP is the RTP the code produces | Derived term by term, proved in BigInt, measured over 150,000 rounds per tier with a 99% CI | `suites/math/`, `simulations/rtp-convergence.ts` |
| Payouts follow the disclosed formula, to the minor unit | Direct comparison against the disclosure sentence; 20,000-round conservation fuzz | `suites/payouts/settlement.test.ts` |
| No round creates or destroys value | Internal assert re-checked externally; whole-system sum invariant across 25 live rounds | `suites/payouts/`, `suites/compliance/game-lifecycle.test.ts` |
| A wager is never stranded | A real storage failure at lock is driven, and every bet comes back | `suites/compliance/game-lifecycle.test.ts` |
| The jackpot controls meet §4.13 and Art. 17 | Ceiling, diversion, reset, rollover, decommissioning, monthly balancing | `suites/jackpot/controls.test.ts` |
| Every required disclosure exists and is derived, not retyped | The disclosure objects the client renders are asserted against the certified figures | `suites/compliance/disclosures.test.ts` |
| The demo build has no real-money path | The protocol is enumerated; the bots policy is a startup crash outside demo | `suites/demo/demo-mode.test.ts` |

---

## 3. What this pack does not establish

**It does not certify the RNG.** GLI-19 §3.2 certifies an RNG by source-code review plus the
laboratory's own statistical testing of raw output. This pack tests the **final outcome output**
of the shipped construction, which is the subject §3.2.2 names, and it does so reproducibly — but
the certifying judgement is the laboratory's, and the raw-output testing is the laboratory's to
perform.

**It does not establish RTP for a regulator.** The model is proved and the measurement agrees
with it to within sampling error at every tier. That makes the PAR sheet checkable rather than
asserted. It does not make it certified.

**It covers the game supplier's scope only.** LANDFALL is submitted on the B2B / Game Service
Provider route. Player registration, identification and verification (Order 43), deposits and
withdrawals (Order 41), AML, account states, and the national self-exclusion register are the
licensed **operator's** obligations. They are not implemented here and are not tested here. Where
they constrain our integration surface, `docs/05-georgian-conformance.md` §5 says exactly how.

**It does not cover hosting, sealing, or operational controls.** GLI-19 Appendix B (technical
security controls) and Appendix C (service providers), and Order 239 Art. 9's physical security
seal, are deployment and organisational matters. The project's own gap register
(`iGaming/docs/10-compliance/22-compliance-gap-register.md`) tracks them and marks them open.

**It is not a penetration test.** Collusion detection, rate limiting and the signed action
receipts exist in the product and are exercised by the product's own suites, but adversarial
security testing is a separate engagement (GLI-19 §B.9).

---

## 4. Method

### 4.1 The suites run against the shipped source

`vitest.config.ts` aliases `@landfall/core` and `@landfall/server` directly at the `src`
directories of the shipped packages. There is no build step between the code that deploys and the
code under test, and no second copy of any game logic anywhere in this directory.

This matters more than it sounds. A simulation that models the game separately validates the
model, not the product. Every outcome in this pack comes from the production `drawZone`, every
settlement from the production `settleRound`, and every jackpot movement from the production
control software in `core/jackpot.ts`.

The one exception is deliberate and marked: a small convenience PRNG (a linear congruential
generator, seeded and reproducible) drives **player behaviour** in the simulations — how much
someone bets, which harbour they lean toward, whether they sit out. It decides nothing about an
outcome, and the two streams are separate objects so they cannot be confused.

### 4.2 Statistics are implemented from published formulae, not imported

`suites/_lib/stats.ts` implements the chi-square upper tail (regularised incomplete gamma, via
the standard series/continued-fraction pairing), the normal tail, and the critical values —
about a hundred lines, each with its source named. A reviewer has to be able to satisfy
themselves that the statistics are the statistics they are labelled as, and an import of somebody
else's package does not help with that.

Critical values are **computed by bisection on the tail function** rather than typed from a
table, so a transcription error is not possible.

### 4.3 "99% confidence" is read collectively, as the standard says

GLI-19 §3.2.2 says the applied tests "shall be evaluated, **collectively**, at a 99% confidence
level". That word does real work.

Seven tests at α = 0.01 reject at least once about **7%** of the time against a perfect source.
A suite that demands seven passes is therefore not testing at 99% — it is testing at about 93%,
and it fails intermittently on correct code, which is worse than useless because the failures get
ignored.

So the battery runs over **20 independent streams** and tests the **rejection rate** against the
1% the level implies, with a per-test check so that one systematically broken test cannot hide
inside an acceptable aggregate, and a Kolmogorov–Smirnov check that the pooled p-values are
uniform. `simulations/rng-evidence.ts` prints every individual p-value so the distribution can be
read rather than the verdict taken on trust.

### 4.4 Intervals resample rounds, not bets

Landfall is pari-mutuel: one player's salvage is funded by another player's lost stake, so
returns **within** a round are strongly dependent. A naive per-bet confidence interval treats
them as independent and reports a band several times too narrow.

`simulations/rtp-convergence.ts` uses a **block bootstrap resampled by round**, which is the
correct unit. Where this pack quotes an interval, that is how it was computed.

### 4.5 Sample sizes, and what they can resolve

| Measurement | Sample | Resolves |
|---|---|---|
| Harbour distribution | 240,000 draws | a deviation of ~0.23 percentage points at 3σ |
| Battery, per stream | 12,000 draws × 20 | a rejection rate of 1% versus 20% |
| Ladder frequencies | 240,000 draws | tiers down to 1 in 19,000; rarer tiers pooled |
| RTP, per tier | 150,000 rounds | an interval of roughly ±0.10 percentage points |
| Economy release gate | 1,000,000 rounds | the reset flow to within 0.0003 of handle |

The rarest ladder tier is expected once in 1,048,576 rounds. No feasible sample resolves it
individually, so it is **pooled** with the other sparse tiers for the chi-square — the standard
treatment, and the one a laboratory would apply. Reporting an unpooled statistic over cells with
an expectation of 0.2 is how a correct RNG gets failed by arithmetic.

### 4.6 Determinism

Every figure reproduces. Statistical streams are seeded from their labels
(`sha256("landfall-certification:<label>")`), simulations from a fixed behaviour seed, chain
walkers from a fixed terminal secret. Two runs on different machines produce byte-identical
reports apart from timestamps.

The one place this is relaxed is `suites/rng/strength-and-independence.test.ts`'s seeding tests,
which deliberately draw from the platform CSPRNG — because the property under test is that two
independently minted seasons share nothing, and a fixed seed could not demonstrate it.

---

## 5. How the evidence is bound to an artefact

`simulations/identity.ts` prints two SHA-256 digests:

- a **source digest** over every `.ts` file in `packages/core` and `packages/server`, plus
  `rooms.json`, sorted by path, with the per-file manifest;
- a **configuration digest** over the resolved economy: the rake and its split, the liability cap,
  the round-share cap, the Storm Power ladder, the jackpot parameters, the seed-chain length and
  the rules version.

The second is the one that is usually forgotten. `rooms.json`, `RAKE` and the ladder are all
runtime-configurable, and under Law of Georgia Art. 24¹.2 a change to the bet, the winnings, the
game architecture, the RNG platform or the jackpot payout system is a **material change**
requiring prior Revenue Service consent and a fresh authorization certificate. A verification
scheme that digested only code would let the most consequential class of change pass without
leaving a fingerprint.

The same manifest is what `server/src/selfVerify.ts` computes at runtime for the §2.3.2
self-verification, so the figure in this pack and the figure the live system reports are the same
number by construction.

---

## 6. Independent reproduction

A laboratory that wants to reproduce any figure without trusting this directory can:

1. Read `iGaming/packages/core/src/rng.ts` — about 120 lines — and reimplement the draw. It is
   `HMAC-SHA256(seed, "landfall:round:<id>")` with documented digest slices.
2. Read `iGaming/packages/core/src/settlement.ts` for the payout rule and its rounding policy.
3. Run `simulations/identity.ts` to fix which bytes those were.
4. Generate outcomes from their own chain and compare.

`suites/_lib/stats.ts` also cross-checks its own fast chain walk against the shipped `roundSeed`
and `chainCommitment` on every run, so the optimisation used to make large samples feasible
cannot drift from the construction the server uses.
