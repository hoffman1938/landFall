# Simulation Methodology: Monte Carlo Validation for LANDFALL

**Prepared by:** Gambling Mathematician & QA Team (joint deliverable)
**Phase:** 4 (supporting) — validation methodology for
[mathematical-model.md](mathematical-model.md)
**Status:** Methodology specification only; no simulation code is written in the docs-only
phase. The informal spot-checks in [mathematical-model.md](mathematical-model.md)§7 were drafting
aids, not the formal validation — this document defines what the real (Phase 9+) test suite must
implement and what "passing" means.

---

## 1. Purpose

Landfall's math is proven analytically (edge = `r/K` invariant to pool shape; settlement
conservation; per-player EV formula). The simulation exists to catch **implementation bugs** the
proofs cannot: byte-slicing errors in the draw, rounding drift in pro-rata splits, settlement
races, off-by-one zone indexing. It is a regression test, runnable in CI, failing loudly on
drift.

**Cardinal rule (unchanged from the previous methodology):** the simulation must call the
**actual production code** — the real zone-draw function and the real settlement function from
`packages/core` — never a test-only reimplementation. A reimplementation validates the paper,
not the product.

## 2. Scale and Tiers

- **Fast tier:** N = 100,000 rounds, runs on every PR via Vitest + the sim script's default
  1M tier (`pnpm --filter @landfall/core sim`).
- **Full tier:** N = 10,000,000 rounds
  (`pnpm --filter @landfall/core sim -- --rounds=10000000`), nightly job; failure blocks
  release, not merge. The script exits non-zero on any out-of-tolerance check.
- Fixed, documented test vectors: a known hash-chain seed and LCG pool seed (default
  20260711), fixed `K = 6`, `r = 0.12`, split `0.5/0.25/0.25`, `h = 50`, cap `25×`,
  scripted pool scenarios (below), so every run is reproducible bit-for-bit.

**Implementation:** `packages/core/scripts/simulate.ts` (node/tsx, no Python) runs the
**production** `drawZone`, `stormPowerFromRoll`, `settleRound` and `pickGoldenAnchor` —
never a reimplementation. Latest full-tier results (10M rounds, 2026-07-11): gross take
2.0013% of handle (theory 2%), operator hold 1.0009% (≈1%), surge funding 0.5002% (0.5%),
reserve inflow 0.5002% / outflow 0.4878% (funding invariant respected), reserve drift
+0.0125% of handle, 13 liability-cap hits (all disclosed), conservation exact, solo-player
EV −2.452% of stake vs −2.564% analytic. Full table:
[mathematical-model.md](mathematical-model.md) §7.

## 3. Required Checks

1. **Draw uniformity (χ²):** over N rounds, struck-zone counts vs. uniform expectation
   (N/K each); chi-square test with pass threshold p > 0.01. Catches draw-derivation bugs
   (wrong hex slice, wrong flooring, biased modulo).
2. **Draw independence from pools:** run the same N draws against wildly different scripted
   pool shapes and assert the draw sequence is *identical* (the draw function must not even
   take pools as an argument — this check enforces the API boundary, the single most important
   fairness property: the storm cannot chase the money).
3. **House-edge convergence:** cumulative house take / cumulative handle must converge to
   `r/K` within a 6-sigma band of the binomial-derived standard error, under **each** pool
   scenario: (a) balanced, (b) whale-zone (one pool 10× the rest), (c) random Dirichlet-shaped
   pools per round, (d) solo-player-plus-seeds. Scenario (d)'s per-player EV must instead match
   the §6 low-population deviation figure from
   [mathematical-model.md](mathematical-model.md) — asserting the naive 1% there would be
   asserting a known-false value.
4. **Per-player EV formula check:** for scripted pools, empirical mean EV per position must
   match `EV_i = (S/K)[(1−r)Σ_{j≠i} P_j/(T−P_j) − 1]` within tolerance — validates settlement
   arithmetic independently of aggregate house take (compensating-error defense).
5. **Conservation (exact, not statistical):** for every simulated round:
   `Σ survivor payouts + rake + Σ struck losses consumed = handle`, exact to fixed-point
   tolerance (see §4). Any violation is an immediate hard failure — this is the "money is
   neither created nor destroyed" invariant, and in a pari-mutuel game it is checkable
   per-round, a luxury the Crash model never had.
6. **Rounding-policy check:** settlement uses integer minor units (credits × 100) with a
   documented largest-remainder distribution of indivisible remainders (§4); the check asserts
   remainders are distributed per policy and never silently dropped or duplicated.
7. **Hash-chain integrity:** for the simulated chain, every revealed seed hashes to its
   predecessor's published value, end to end.

## 4. Rounding Policy (specified here because only simulation can enforce it)

Pro-rata shares will generally not divide evenly. Policy for implementation: compute all
survivor shares in integer minor units by flooring, then distribute the remaining
`(1−r)·P_{z*} − Σ floored shares` minor units one each to the survivors with the largest
fractional remainders (deterministic tie-break by bet id). Rake absorbs no rounding dust;
players receive all of it. The simulation asserts this policy exactly. (Rationale: flooring
everything and letting the house keep dust would be a hidden, unquantified edge increase — the
exact class of subtlety the previous model's §6 taught us to surface rather than bury.)

## 5. Interface Contract for the Future Test Suite (Phase 9+)

```ts
interface LandfallSimConfig {
  rounds: number;
  K: number; rakeR: number; houseSeedH: number;   // sourced from core's constants
  chainSeed: string;                               // fixed test vector
  poolScenario: 'balanced' | 'whale' | 'dirichlet' | 'solo';
}

interface LandfallSimResult {
  strikeCounts: number[];              // per zone, for χ²
  houseTakeFraction: number;           // of handle
  evByPosition: Record<string, number>;
  conservationViolations: number;      // must be 0
  chiSquarePValue: number;
  roundingPolicyViolations: number;    // must be 0
}

function runLandfallSim(config: LandfallSimConfig): LandfallSimResult; // calls production core fns
```

## 6. CI Integration

Unchanged in structure from the previous methodology: fast tier on every PR; full tier nightly;
full-tier failure blocks release and must be triaged before any deploy. Thresholds above are
starting points to be tuned once real code exists — recorded as intended acceptance criteria,
not validated constants.
