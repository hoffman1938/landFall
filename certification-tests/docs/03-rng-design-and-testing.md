# 03 — RNG Design and Testing

**GLI-19 Chapter 3, and the "Game Outcome Using a Random Number Generator" section of Chapter 4.**

---

## 1. The construction

LANDFALL uses a **software-based RNG** in the §3.1.1(a) sense, built from two recognised
cryptographic primitives and nothing else.

### 1.1 The season chain

A season is a pre-committed SHA-256 hash chain of `SEED_CHAIN_LENGTH = 10,000` round seeds.

```
terminal   ← 32 bytes from the platform CSPRNG          (server/src/random.ts)
s_i        = SHA256^(L−i)(terminal)     for round i, 1-based
commitment = SHA256^L(terminal) = s_0

so   SHA256(s_i) = s_{i−1}   for every i
```

The **commitment is published before the first round of the season is dealt**. Each round's seed
is revealed at settlement, and anyone can check that it hashes to the previously published value.
A seed cannot be substituted after the fact without breaking SHA-256 preimage resistance.

### 1.2 The round draw

```
digest = HMAC-SHA256(s_i, "landfall:round:<roundId>")
```

One 256-bit digest per round, sliced into disjoint spans:

| Span (hex chars) | Bits | Drives |
|---|---|---|
| `[0, 13)` | 52 | **The struck harbour** — `floor(u × 6)` where `u = value / 2⁵²` |
| `[13, 15)`, `[15, 17)` | 8 + 8 | Storm-path feints (cosmetic) |
| `[17, 22)` | 20 | Jackpot trigger — fires when `value / 2²⁰ < p_j` |
| `[22, 35)` | 52 | Jackpot winner selection |
| `[35, 40)` | 20 | Storm Power tier |
| `[40, 42)` | 8 | Weather pattern (cosmetic) |

42 of the 64 available hex characters are used; the spans do not overlap.

### 1.3 Separate domains for presentation

Cosmetic layers added after the fact (event tier, board environment) use their own **HMAC
message** — `landfall:event:<id>`, `landfall:environment:<id>` — rather than another slice of the
harbour digest. This is a deliberate defence: a cosmetic change that widened a slice could
otherwise shift the harbour bytes. Nothing drawn from another domain can perturb the outcome.

### 1.4 Season rollover

When a season is exhausted the server mints the next one — a fresh terminal secret from the
CSPRNG, a fresh commitment — and **publishes the commitment before any round is drawn against
it**. The rollover is recorded as a significant event and pushed to connected clients, and every
already-settled round keeps verifying against the `prevChainValue` stored on its own row.

> This was a defect until this pass: `consume()` threw at exhaustion from inside a timer
> callback, so a deployment that ran for about 55 hours stopped dealing rounds permanently. See
> `docs/08-findings-and-fixes.md` §1.

---

## 2. §3.2.1 — Source code review

The whole of the outcome path is four files and about 400 lines:

| File | Lines | What it decides |
|---|---|---|
| `core/src/rng.ts` | ~130 | The chain, the HMAC, every scaling |
| `core/src/settlement.ts` | ~215 | The payout arithmetic and its rounding |
| `core/src/constants.ts` | — | The ladder, as exact integer counts |
| `server/src/chain.ts` | ~120 | Season management and rollover |

There are no other randomness algorithms, no shuffles, and no secondary mixers. `core/src/rng.ts`
has **no Node and no DOM dependency** — it runs identically in the server, in the browser's
verification UI, and in this test pack, which is what makes the player-side recomputation exact
rather than approximate.

---

## 3. §3.2.3 — Distribution

### 3.1 Measured

500,000 draws from the production chain and draw function:

| Harbour | Count | Frequency | Deviation from 1/6 |
|---|---|---|---|
| 1 | 83,253 | 16.6506% | −0.0161 pt |
| 2 | 82,796 | 16.5592% | −0.1075 pt |
| 3 | 83,164 | 16.6328% | −0.0339 pt |
| 4 | 83,455 | 16.6910% | +0.0243 pt |
| 5 | 83,629 | 16.7258% | +0.0591 pt |
| 6 | 83,703 | 16.7406% | +0.0739 pt |

χ² = 6.7528, df 5, critical 15.086 at 99%, p = 0.2397. **PASS.**

*(From `evidence/03-rng-statistics.txt`; `./run.sh --evidence` regenerates it.)*

The suite also checks the statistic is **not suspiciously small** — a two-sided p-value in
(0.005, 0.995). A χ² that is too low is its own kind of non-randomness and a one-sided test
cannot see it.

### 3.2 The scaling bias, bounded exactly

`floor(u × 6)` where `u = digest[0..13) / 2⁵²`. **2⁵² is not divisible by 6**, so four of the six
harbours are reachable from one extra 52-bit value each. This is a real bias and a source
reviewer will look for it, so it is stated rather than glossed:

```
remainder            2⁵² mod 6 = 4      (four harbours get one extra value)
absolute bias        1 / 2⁵²   ≈ 2.2 × 10⁻¹⁶   on a probability of 1/6
relative bias        6 / 2⁵²   ≈ 1.3 × 10⁻¹⁵
```

That is roughly one extra hit per 10¹⁵ rounds — about **twelve orders of magnitude** below what
the §3.2.2 battery can resolve at any feasible sample size, and below the spacing of a
double-precision float near 1/6.

§3.2.3(a) permits discarding RNG values to eliminate bias. LANDFALL does not need to, and the
decision not to add rejection sampling is **recorded as a test** rather than left as an omission:
if the bound ever stops holding, `suites/rng/distribution.test.ts` fails.

By contrast the cosmetic weather mapping is `roll % 4` over an 8-bit roll, and 256 **is**
divisible by 4 — exactly uniform. That contrast is asserted too, because it is the first thing a
reviewer checks after finding the harbour bias.

### 3.3 The intended non-uniform distribution

§3.2.3 explicitly allows a non-uniform distribution where the game design specifies one, provided
the final outcome conforms to it. The Storm Power ladder is that case, and the observed
frequencies are tested against the **published paytable** rather than against uniformity. Sparse
tiers are pooled (see `docs/01-scope-and-method.md` §4.5).

### 3.4 §3.2.5 — Available outcomes

The outcome space per round is a 256-bit HMAC digest, and each round uses a distinct chain seed.
Every harbour, every ladder tier and both jackpot states are therefore reachable from **every**
round — demonstrated by fixing the round id and varying only the seed until all six harbours,
three or more tiers and both jackpot states have been observed.

---

## 4. §3.2.2 — The seven-test battery

Applied to the **final outcome output** (the harbour a player is paid on), over **20 independent
streams of 12,000 draws**, at α = 0.01.

| Test | Implementation |
|---|---|
| Total Distribution | χ² on the six harbours, df 5 |
| Overlaps | χ² on the 36 ordered adjacent pairs, df 35 |
| Coupon Collector | χ² on collection lengths against the exact inclusion–exclusion CDF, tail pooled |
| Runs | Wald–Wolfowitz on a low/high binary recoding, exact moments |
| Interplay Correlation | 6 × 2 contingency independence of harbour against the jackpot bit |
| Serial Correlation | Lag-1 autocorrelation, asymptotically N(0, 1/n) |
| Duplicates | Bernoulli z-test on the repeat rate against 1/6 |

### 4.1 A note on the Runs test

The textbook runs-**up-and-down** statistic (Knuth TAOCP vol. 2 §3.3.2.G: mean `(2n−1)/3`,
variance `(16n−29)/90`) is derived for *n distinct values from a continuous distribution*. The
harbour alphabet has six symbols, so about one adjacent pair in six is a tie; dropping ties
changes both the length and the dependence structure of the sign sequence, and the continuous
moments no longer describe it.

Applied anyway it **rejects a perfectly good source in essentially every stream** — which is what
the first draft of this pack did. The Wald–Wolfowitz form on a low/high recoding has exact
moments for a finite binary sequence, no tie problem, and preserves the property the test exists
to find: clustering or alternation in the order outcomes arrive, which the marginal distribution
cannot see.

This is recorded here rather than quietly corrected, because a laboratory applying the
continuous-case formula to a six-symbol alphabet will see the same spurious failure.

### 4.2 The collective verdict

Across 7 tests × 20 streams = 140 decisions at α = 0.01, the expected number of rejections is
**1.4**. Observed in the evidence run: **2**.

Per test, no more than 1 of 20 streams rejected. Kolmogorov–Smirnov of the pooled p-values
against uniform(0,1): D = 0.0745 against a critical 0.1378. **PASS.**

`simulations/rng-evidence.ts` prints every individual p-value, so the distribution can be read
rather than the verdict taken on trust.

---

## 5. §3.3 — RNG strength

### 5.1 §3.3.1 — Cryptographically strong

The outcome is an HMAC-SHA256 output. Predicting it requires either the round seed — which is a
256-bit chain link, revealed only after settlement — or a break of HMAC-SHA256's PRF property.
Recovering the seed from observed outcomes is a preimage problem against a source that leaks
`log₂(6) ≈ 2.58` bits per round.

### 5.2 §3.3.2(a) — Direct cryptanalytic attack

Tested as the necessary condition, measured directly: the strongest simple predictor available
to an attacker who sees only outcomes — an **order-2 Markov model** fitted on half the sequence
and evaluated on the other half — does not beat 1/6 by more than sampling noise over 120,000
draws.

Adjacent chain links are the one place a correlation could hide, because `s_i = SHA256(s_{i+1})`
relates the seeds by construction. Lag-1 through lag-5 serial correlation over 200,000 draws: all
within ±3.5σ.

### 5.3 §3.3.2(b) — Known input attack

The terminal secret is 32 bytes from the platform CSPRNG. **There is no clock anywhere in the
seeding path** — the clause's specific prohibition. Two seasons minted independently share no
link, verified by generating both and checking the intersection is empty.

### 5.4 §3.3.2(c) — State compromise extension

**This is the one clause this design only partially meets, and the honest position is worth more
than a test that pretends otherwise.**

The clause requires the RNG to "periodically modify its state, through the use of external
entropy, limiting the effective duration of any potential exploit by a successful attacker."

A pre-committed chain is **deterministic once the terminal secret is known**. An attacker who
obtains it can compute every remaining seed in the season. That is the unavoidable cost of
provable fairness: the commitment has to fix future outcomes in advance, or it proves nothing.

What the design does provide is a **bounded exploit window**. The state is re-minted from fresh
CSPRNG entropy at every season boundary, so a compromise cannot extend past the end of the
current season — 10,000 rounds, about 55 hours at the shipped cadence. The bound is a published
constant, and it is asserted in the suite.

**Residual risk and the mitigation on the roadmap.** The documented closure is to mix a public
beacon that is unpredictable at commit time (a blockchain header, a drand round) into each
round's HMAC message. That preserves verifiability — the beacon value is public and checkable —
while making the remaining seeds unpredictable even to someone holding the terminal secret. It is
tracked as **G39** in the project's gap register and is **not implemented**. A laboratory should
read this section and that register entry together before signing the RNG chapter.

The compensating controls in the meantime are key management (the terminal secret is generated
server-side and never transmitted; the receipt signing key is already separated into its own
store) and the fact that a compromise is *detectable*: a substituted seed fails the published
chain link, which every player's verify sheet checks on every round.

### 5.5 §3.3.3 — Hardware RNG monitoring

Not applicable. LANDFALL uses no hardware RNG. §3.4 (mechanical RNG) is likewise not applicable.

---

## 6. §4.5.2 — Game selection process

> "Determination of events of chance that result in a monetary award shall not be influenced,
> affected, or controlled by anything other than the values selected by an approved RNG."

LANDFALL's answer is structural rather than behavioural, which is the strongest form available.

**`drawZone(seedHex, roundId, zoneCount)` has three parameters.** There is no argument through
which a pool, a stake, a player count, a balance, a clock or a network condition could reach it.
The suite pins the arity as well as the behaviour, so adding a fourth parameter fails the build.

| Clause | Position |
|---|---|
| §4.5.2(a) outcomes not limited | All six harbours reachable on every draw (§3.4) |
| §4.5.2(b) no adaptive discard | The draw is a pure function; nothing reads history |
| §4.5.2(c) no near-miss substitution | The harbour is the only outcome; nothing else is shown in its place |
| §4.5.2(d)(i) bonus odds not history-based | Jackpot trigger is a fixed 20-bit threshold |
| §4.5.2(d)(ii) RTP not adapted to past payouts | RTP is a pure function of configuration; no code path reads results |
| §4.5.2(e) associated equipment cannot influence | The client contains no outcome logic at all |
| §4.5.2(f) not affected by the communications channel | The whole round is drawn at round start, before anything is broadcast |

The behavioural demonstration: the same round, settled against four wildly different crowds —
everything on one harbour, everything on the harbour that will be struck, an even spread, and a
single minimum bet — strikes the same harbour every time.

**§4.5.2(f) deserves a specific note.** The entire round — harbour, jackpot trigger, jackpot
winner, multiplier tier, cosmetic layers — is drawn at round creation, before a single frame is
broadcast. No animation, no click, no reconnection and no latency can be an input to any of it.

---

## 7. Provable fairness, from the player's side

The property that makes all of the above checkable rather than merely asserted: **a player can
recompute the whole round themselves.**

After settlement the server publishes the round seed, the previous chain value, and the full lock
snapshot (every stake, its harbour, its amount, and whether it was a house seed or a practice
bot). The client's verify sheet then recomputes, using the same `@landfall/core` the server runs:

1. `SHA256(seed) === prevChainValue` — the seed was committed in advance;
2. `HMAC(seed, "landfall:round:<id>")` → the harbour, the jackpot trigger, the winner, the tier;
3. the player's own payout, from the published snapshot and the published rake.

Because the draw takes no pool input, and because the snapshot is published, **there is nothing
the server could have chosen after seeing the money.**

`verifyRound()` in `core/src/verify.ts` is the one implementation of this, shared by the client
and by `server/src/selfVerify.ts`.

---

## 8. Summary against Chapter 3

| Clause | Status | Evidence |
|---|---|---|
| §3.2.1 Source code review | Ready — ~400 lines, no other randomness algorithms | `core/src/rng.ts`, `settlement.ts`, `server/src/chain.ts` |
| §3.2.2 Statistical analysis | **Pass** — seven tests, 20 streams, 99% collective | `suites/rng/battery.test.ts`, `evidence/03-rng-statistics.txt` |
| §3.2.3 Distribution | **Pass** — χ² 0.38/15.09; bias bounded at 1.3 × 10⁻¹⁵ | `suites/rng/distribution.test.ts` |
| §3.2.4 Independence | **Pass** — within and between draws | `suites/rng/strength-and-independence.test.ts` |
| §3.2.5 Available outcomes | **Pass** — 256-bit space, all outcomes on every draw | same |
| §3.3.1 Cryptographic strength | **Pass** — HMAC-SHA256 throughout | same |
| §3.3.2(a) Direct cryptanalysis | **Pass** — Markov-2 predictor no better than chance | same |
| §3.3.2(b) Known input | **Pass** — CSPRNG seeding, no clock, seasons disjoint | same |
| §3.3.2(c) State compromise extension | **Partial — declared.** Bounded to one season; beacon mixing on the roadmap (G39) | §5.4 above |
| §3.3.3 Hardware RNG monitoring | Not applicable | — |
| §3.4 Mechanical RNG | Not applicable | — |
| §4.5.1 Separate evaluation per RNG | One RNG, one implementation | `core/src/rng.ts` |
| §4.5.2 Game selection process | **Pass** — structural and behavioural | `suites/rng/strength-and-independence.test.ts` |
