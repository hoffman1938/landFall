# LANDFALL — Certification Evidence Pack

**For the independent test laboratory and the Selected Person.**

This directory is the evidence pack for **LANDFALL**, a provably-fair pari-mutuel multiplayer
instant game. It contains the automated conformance suites, the statistical RNG testing, the
mathematical verification of the published return to player, the long-run economy simulations,
and the clause-by-clause mapping to GLI-19 v3.0 and to the Georgian regulatory framework.

Everything here runs against **the shipped source**, not a copy and not a build artefact.

---

## Run it

```bash
./run.sh              # every automated suite: this pack, then the product's own
./run.sh --evidence   # the suites, plus a regenerated evidence pack under evidence/
```

There is nothing to install. The suite runs on the application workspace's toolchain
(`../iGaming`), which must have had `pnpm install` run in it once.

Expected result: **every suite passes**. `run.sh` exits non-zero if anything does not.

| What | Count | Time |
|---|---|---|
| Certification suites (this directory) | 145 tests in 11 files | ~30 s |
| Application suites (`iGaming/packages/*`) | 375 tests in 40 files | ~20 s |
| Evidence pack (`--evidence`) | 9 reports, ~2.8M simulated rounds | ~5 min |

---

## What is being certified

| | |
|---|---|
| **Game** | LANDFALL — six harbours, one is struck per round, pari-mutuel settlement |
| **Classification** | Game of chance, systemic-electronic form. Peer-to-peer under GLI-19 §4.11 |
| **Rules version** | v4 (see `docs/08-findings-and-fixes.md` for what changed and why) |
| **Theoretical RTP** | **99.3491%** of handle. Operator hold 0.6509% |
| **RNG** | Pre-committed SHA-256 hash chain; outcome = HMAC-SHA256(seed, `landfall:round:<id>`) |
| **Strike probability** | Exactly 1/6 per harbour, per round, independent of every pool |
| **Build under test** | Demo build — virtual credits, no cash value, no payment path exists |

The exact artefact is identified by two digests printed by
`simulations/identity.ts` (and saved to `evidence/05-identity.txt`): a **source digest** over
every outcome-determining file, and a **configuration digest** over the resolved economy. Quote
both in any report that cites a figure from this pack.

---

## Where to start

A reviewer with an hour should read these four, in this order:

1. **`docs/01-scope-and-method.md`** — what this pack establishes, what it does not, and why the
   distinction matters. Read this before treating any number here as a result.
2. **`docs/08-findings-and-fixes.md`** — the eight defects found during preparation and how each
   was closed. Three would have been findings at the laboratory, two cost players money, and one
   was a Georgian clause the GLI mapping alone made look satisfied.
3. **`docs/02-math-verification.md`** — the PAR sheet. The return to player derived term by
   term, proved in exact integer arithmetic, and measured against the shipped code.
4. **`docs/03-rng-design-and-testing.md`** — the RNG construction, the §3.2.2 battery, and the
   one clause (§3.3.2(c)) this design only partially meets, stated plainly.

---

## Layout

```
certification-tests/
├── README.md                 you are here
├── run.sh                    the one command
├── vitest.config.ts          runs against ../iGaming/packages/*/src — the shipped source
├── tsconfig.json             the same path mappings, for tsx and the editor
│
├── docs/
│   ├── 01-scope-and-method.md          what this establishes, and what it does not
│   ├── 02-math-verification.md         the PAR sheet: RTP derived, proved, measured
│   ├── 03-rng-design-and-testing.md    construction, battery, strength, limits
│   ├── 04-gli-19-conformance.md        clause → evidence, Chapters 2–4 and Appendix A
│   ├── 05-georgian-conformance.md      Orders 222/239/240, the Law, Resolution 455
│   ├── 06-test-catalogue.md            every test → the clause it evidences
│   ├── 07-demo-mode.md                 the demo build: what it is and what it is not
│   └── 08-findings-and-fixes.md        defects found in preparation, and their fixes
│
├── suites/                   automated conformance tests
│   ├── rng/                  distribution, the seven-test battery, strength, independence
│   ├── math/                 the RTP derivation, proved three independent ways
│   ├── payouts/              settlement correctness, rounding, conservation, edges
│   ├── jackpot/              GLI §4.13 and Order 222 Art. 17 controls
│   ├── compliance/           disclosures, the rules artefact, the lifecycle, Georgian P2P
│   ├── demo/                 demo-mode behaviour and the bots policy
│   ├── edge-cases/           boundaries, configuration guards, hostile input
│   └── _lib/                 chi-square, KS, and the seeded chain walker
│
├── simulations/              evidence generators
│   ├── rtp-convergence.ts    measured RTP with a block-bootstrap CI, every stake tier
│   ├── rng-evidence.ts       the statistical report behind the battery's verdict
│   └── identity.ts           source and configuration digests, and the published economy
│
└── evidence/                 generated by ./run.sh --evidence
```

---

## The three properties this pack exists to establish

Everything else supports one of these.

### 1. The outcome cannot be influenced by anything except the RNG

`drawZone(seed, roundId, zoneCount)` has no parameter through which a pool, a stake, a player
count or a clock could reach it. That is a structural property, and the suite pins it
structurally (`drawZone.length === 3`) as well as behaviourally — the same round settled against
four wildly different crowds strikes the same harbour every time.

GLI-19 §4.5.2 · `suites/rng/strength-and-independence.test.ts`

### 2. The published return to player is the return the code produces

Return is derived from four flows, each with a closed form; the derivation is checked term by
term, by exhaustive enumeration of the ladder's 2²⁰ outcome space, and in BigInt so no
floating-point rounding can hide a shortfall. It is then **measured** over 150,000 rounds per
stake tier against the production settlement, with a 99% block-bootstrap interval.

The expected figure lands inside the measured interval at every tier, and the operator's hold is
the same at every tier to within **0.021 percentage points** — across a stake ladder whose ends
are a factor of 10,000 apart.

GLI-19 §4.7.1, §4.7.2 · `suites/math/`, `simulations/rtp-convergence.ts`

### 3. No round creates or destroys value, and no wager is ever stranded

Settlement asserts `payouts + rake === handle + reserveDraw` on every call. The suite re-asserts
it from outside over 20,000 fuzzed rounds across every ladder tier with the liability cap
engaged, and the lifecycle suite drives real rounds through a real database and checks that the
sum of every account, fund and ledger is invariant to the minor unit.

A round that cannot be settled is voided, every bet returned in full, and an incident recorded.

GLI-19 §4.16, §A.6.4, §A.7.1 · `suites/payouts/`, `suites/compliance/game-lifecycle.test.ts`

---

## What this pack does not establish

Stated here rather than buried, because a pack that overclaims wastes the laboratory's time.

- **It does not certify the RNG.** GLI-19 certifies by source-code review plus the laboratory's
  own statistical testing of raw output. This pack shows what the shipped construction produces
  and gives the laboratory a reproducible starting point. It is an exhibit, not a pass.
- **It does not establish RTP for a regulator.** The same reason: the model is proved and the
  measurement agrees with it, but the certifying figure is the laboratory's.
- **It covers the game supplier's scope only.** Player registration, KYC, AML, deposits,
  withdrawals, account states and self-exclusion registries are the licensed operator's
  obligations. Where they constrain our interface, `docs/05-georgian-conformance.md` says so.
- **It does not cover hosting, sealing or the operational controls** of GLI-19 Appendices B and
  C. Those are deployment and organisational matters; the open items are listed in the project's
  own `iGaming/docs/10-compliance/22-compliance-gap-register.md`.

---

## Driving the live game

The suites above exercise the game's code. To watch the **running** system — the round loop, the
WebSocket protocol, the compliance endpoints and provable fairness against a real HTTP response —
stand a demo instance up and drive it:

```bash
# A fast demo instance on its own database and port.
cd ../iGaming/packages/server
LANDFALL_ENV=demo LANDFALL_FAST=1 LANDFALL_BOTS=3 PORT=8899 \
  LANDFALL_DB=/tmp/landfall-cert.db LANDFALL_OPS_TOKEN=<a-secret> \
  pnpm exec tsx src/main.ts

# In another shell: two clients play a full round and re-verify the outcome.
LANDFALL_SMOKE_ORIGIN=localhost:8899 pnpm exec tsx scripts/smoke.ts
```

The endpoints a reviewer will want, all read-only except the last two:

| Endpoint | Shows |
|---|---|
| `GET /api/health`, `/api/ready` | Liveness and readiness |
| `GET /api/chain` | The season commitment in force **now** |
| `GET /api/round/:id` | A settled round's full public record: seed, previous chain value, struck harbour, the complete lock snapshot, the rake and cap as settled, and the rules version |
| `GET /api/rules` | The rules artefact — the same bytes the client renders |
| `GET /api/compliance/verify` | §2.3.2 control-program self-verification, on demand |
| `GET /api/compliance/report` | Order 240 Art. 2.2: GGR, actual RTP, theoretical RTP, variance band and alert |
| `GET /api/compliance/export/bets.csv` | Order 240 Art. 3.3: every bet placed |
| `GET /api/compliance/export/jackpots.csv` | Order 243 Art. 21(b.c): every jackpot payout and rollover |
| `GET /api/compliance/balancing?room=<id>` | Art. 17.2 monthly balancing — **409** on any discrepancy |
| `GET /api/compliance/paytable` | §2.8.3 theme record with the RTP breakdown and lifetime aggregates |
| `GET /api/compliance/events` | §2.9.5 significant events with value before and after |
| `GET /api/compliance/game-state` | What is currently disabled, and why |
| `POST /api/compliance/disable` / `/enable` | §2.4.1 disable on demand. **Bearer token required; refuses to act when `LANDFALL_OPS_TOKEN` is unset** |

Any settled round can be verified independently by feeding `GET /api/round/:id` into
`verifyRound()` from `@landfall/core` — the same function the player's verify sheet runs. It
recomputes the chain link, the harbour, the multiplier tier, the jackpot trigger and winner, and
the player's own payout, from the published snapshot alone.

---

## Reproducibility

Every figure in this pack is deterministic. Statistical streams are seeded from their labels,
simulations from a fixed behaviour seed, and the chain walkers from a fixed terminal secret. Two
runs on different machines produce identical reports.

Where a report quotes a measured number, it also quotes the sample size and the interval. Where
a test makes a probabilistic decision, it states the confidence level and the critical value it
used, and `suites/_lib/stats.ts` implements those distributions from published formulae with the
source named — a laboratory should be able to check the statistics as easily as the game.
