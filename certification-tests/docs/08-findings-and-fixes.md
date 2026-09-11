# 08 — Findings and Fixes

**Defects found while preparing this pack, and how each was closed.**

This document exists because a submission that presents only a clean result is less useful to a
laboratory than one that shows what was wrong and how it was found. Everything below was fixed
before the pack was generated; each entry names the clause it engaged, the evidence that would
have exposed it, and the test that now guards it.

Eight findings. Three would have been findings at the laboratory, two were availability defects
that cost players money, one was a documentation error in the maths, one was a control that
reported a state it did not enforce, and one was a Georgian clause that the GLI mapping alone
made look satisfied.

---

## 1. The game stopped dealing rounds after 55 hours — HIGH

**Clause:** Order 240 Art. 3.1 (continuous 24-hour operation); GLI-19 §4.16 (interrupted games).

A season is a pre-committed chain of 10,000 seeds. `ChainHandle.consume()` threw
`seed chain exhausted` at the end of it — **from inside a `setTimeout` callback**, so the
exception escaped to the host and the round loop simply stopped. At the shipped 20-second cadence
that is about 55 hours of continuous play.

It had never been seen because `ensureChain` mints a fresh season **at boot**: any restart looked
healthy, so the failure only appears in a deployment left running for two and a half days — which
is exactly what a demo deployment is.

**Fix.** At exhaustion the server mints the next season, publishes its commitment *before* any
round is drawn against it, records a significant event, and pushes the new commitment to
connected clients. Historical verification is untouched: every round row stores the
`prevChainValue` it was drawn against, so a rollover cannot invalidate a settled round. The round
header now carries the commitment per round rather than per connection, so a client that joined
under the previous season is not left verifying against one that no longer covers what it is
watching.

**Guarded by:** `iGaming/packages/server/test/resilience.test.ts` — a short season is consumed
past its end, the rollover is asserted, the new chain's first link is verified against the newly
published commitment, and every link of the old season is checked to still verify. A second test
drives the round loop across a season boundary and asserts every round still settles.

---

## 2. The published return to player was wrong, and wrong by a margin that grew as a table got quieter — HIGH

**Clause:** GLI-19 §4.7.2(a) — a displayed RTP must be accompanied by an explanation of how it
was determined, and must match it.

The house restores the jackpot to its **reset value** after every win, out of its own share of
the rake. Rules v3 set that reset to `max(20 × minimum bet, budgetFraction × affordable)`, capped
by affordability, intending the budget fraction to bind and leave roughly two thirds of the house
share as margin.

**It never did.** Measured across all five shipped tiers, `20 × minimum bet` exceeded the budget
figure at every realistic handle, so the floor won every time and the tuning parameter was inert.
This is the *same defect, in the same function*, that rules v3 had been written to fix — and the
v3 test that claimed to pin the two-thirds property called the function with `minimum: 0`, which
is precisely why it did not catch it.

The consequences were not cosmetic:

| | Published (v3) | Measured (v3) |
|---|---|---|
| Player return | 98.999% | 99.25% – 99.74% |
| Operator hold | 1.00% | 0.26% – 0.61% |

Worse, the error was **handle-dependent**. `surgeResetFor` clamps to the affordability ceiling,
so on a table thin enough for the floor to exceed that ceiling the reset became the ceiling
exactly — the house then spent its entire rake share on the re-seed and the table returned
**100% of handle**. A return figure that moves with table population is not a return figure; it
is an unpriced liability.

**Fix, in two parts.**

1. The reset is now **exactly** `budgetFraction × affordable`, with no minimum able to override
   it. That makes the per-round cost `budget · split.house · r/K · H` — the handle cancels, so the
   flow is a constant fraction of handle at every tier and every table size.
2. That flow is now published as the **fourth term** of theoretical RTP
   (`jackpotReseedReturn` in `core/src/rtp.ts`), and the player-facing sentence names it.

Return to player is now **99.3491%** and the operator hold **0.6509%**, at every tier.

`surgeFloorFor()` survives only as the **opening pot** for a table that has never paid one — a
one-off house cost, not a recurring guarantee.

**Measured after the fix** (with §2a and §2b below also applied): the operator hold spans
0.6379% – 0.6590% across the five tiers — a spread of **0.021 points** against the previous 0.35 —
and every tier's player-basis return sits inside its 99% confidence interval.

**Guarded by:** `suites/math/rtp-derivation.test.ts` (the closed form and the cancellation across
five orders of magnitude), `iGaming/packages/core/test/surge-floor.test.ts` (rewritten to pin the
*share*, not merely affordability, and to assert that the retired floor **would** have overridden
the budget at every tier — a regression guard with teeth), and
`simulations/rtp-convergence.ts` (the per-tier spread).

### 2a. A second-order bias in the same flow

Sizing the reset requires an estimate of the table's handle, and it was using
`updateHandleEma` — an estimator deliberately made **asymmetric** (fast to admit a room went
quiet, slow to admit it got busy) because the house seed it was written for is a player-protection
mechanism.

That asymmetry is a **bias** wherever the estimate stands in for an average, and the reset is
linear in it. Measured against the release gate's deliberately spiky synthetic crowd the re-seed
came out at **0.2345% of handle against a modelled 0.3500%** — a third short, and short in the
direction that makes the *displayed* return higher than the realised one. Against a smoother
behavioural crowd it ran slightly high instead. An estimator whose bias changes sign with crowd
volatility cannot underwrite a published figure.

**Fix.** The two uses get two estimators. `updateHandleMeanEma` is symmetric and slow — which is
what "average handle at this table" actually means — and only the jackpot reset uses it. The
house seed keeps its asymmetric estimator and its player-protection property.

**Measured after the fix:** 0.3503% against a modelled 0.3500%, over 1,000,000 rounds.

### 2b. A basis error in the same flow, found by the per-tier simulation

With the estimator corrected, the per-tier measurement still ran systematically **below** the
model — 0.323%–0.347% against 0.350% — and worst on the thinnest tier. The
`simulations/rtp-convergence.ts` ledger table is what located it: the re-seed column was low
while every other column matched.

The cause was a **denominator mismatch**. The handle estimator tracks REAL (non-house) stakes,
because the house seed is sized against it and using total handle there would be circular. But
the published RTP term expresses the re-seed cost as a fraction of TOTAL handle. Sizing the reset
from the player-only figure therefore made the realised flow low by exactly the seed's share of
handle — and the seed's share is largest on the thinnest table, which is why Skiff was worst.

**Fix.** The reset is sized from `max(liquidity floor, player-handle mean + zones × seed)`. The
seed for the coming round is already fixed and published before the reset is computed, so adding
it back is neither circular nor a guess, and the liquidity floor is by definition the table's
guaranteed **total** handle.

**Measured after the fix:** 0.3434%–0.3546% per tier against a modelled 0.3500%, and 0.3510% over
1,000,000 rounds on the release gate. Every tier's player-basis return now sits inside its 99%
confidence interval.

> This one is worth noting as a method point rather than only a defect: neither the closed-form
> proof nor the 1,000,000-round release gate caught it. The **per-tier** simulation did, because
> the error scaled with the seed share and only the thinnest tier made it visible above the noise.

---

## 3. A configuration existed in which the operator took 100% of the round — HIGH

**Clause:** GLI-19 §4.7.1 — the minimum payout percentage must be met **for all wagering
configurations**.

If every stake in a round sits on the harbour that is struck, there is no survivor pool. The
degenerate branch in `settleRound` booked **the entire struck pool as rake** — a 100% hold —
and was defended in a comment as unreachable, because the house seeds a stake on every harbour
and five of the six always survive.

The defence did not hold. `resolveRoomConfig` accepts a room with `seedMinor: 0` — a legitimate
pure player-versus-player table, and in fact the cleanest configuration there is under §A.7.1 —
and in such a room a crowd that all picks the same harbour reaches exactly this branch.

"Unreachable, and if reached the operator takes everything" is not a position to put in front of
a test laboratory.

**Fix.** The round is a **no-op and every bet is returned in full**, with no rake taken. That is
also the only arithmetic that is not arbitrary: destroying 88% of the pool and banking 12%
expresses no rule at all, and a full refund is what `INTERRUPTION_RULES` already promises for a
round that cannot be settled. `SettlementResult` gains `allStakesRefunded`, and the coordinator
tells the table what happened rather than letting a silent refund read as a settlement error.

**Guarded by:** `suites/math/rtp-derivation.test.ts` and
`iGaming/packages/core/test/settlement.test.ts`.

---

## 4. "The house seed's expected profit is zero" was false — MEDIUM

**Clause:** GLI-19 §A.7.1(c)–(d) — the operator shall not profit from the play beyond the rake,
and operator-funded wagers "shall ultimately be lost".

The ring-fence documentation asserted that a uniform seed across all six harbours has zero
expected profit "by symmetry". It does not. The survivor payout is **convex in the struck pool**,
so a uniform seed wins more when a heavy harbour is hit than it loses when a light one is.
Measured over 1,000,000 rounds: **+0.0875% of handle**.

That mattered twice over. The claim was wrong on its face, and it had hidden a second gap:
`releaseFloat()` existed — the ring-fence's designed exit — and **was never called from
anywhere**. The float accumulated its profit indefinitely. Segregating the money satisfies
§A.7.1(c); only returning it satisfies §A.7.1(d)'s "shall ultimately be lost". A fund that only
grows is banked in a different account, not played back.

**Fix.** The header now states the expectation correctly and says why. `floatSurplusMinor()`
computes the surplus above the float's disclosed opening capitalization plus a few rounds of
head-room, and settlement releases it to the **Storm Surge pot**, which pays out to a player in
full. The release is a ledgered significant event.

**Measured after the fix:** 0.084% – 0.104% of handle released per tier — essentially all of the
seed's profit — and the measured player-basis return moved from 99.13% to 99.34%, against a
published 99.3491%.

**Guarded by:** `iGaming/packages/core/scripts/simulate.ts` (the float keeps only its opening
capital over 1M rounds) and `simulations/rtp-convergence.ts` (per-tier release figures).

---

## 5. "Disable all gaming activity" did not disable gaming — HIGH

**Clause:** GLI-19 §2.4.1 (disable on demand), §4.15.1 (conclude the game in progress), §A.6.3
(audit entry with date, time and reason). Project gap **G32**.

`GameControl` existed, `/api/compliance/game-state` reported its state, and the audit entry was
written correctly. But **`betsAllowed()` was called from nowhere in the codebase** — the method
was reachable only from its own definition.

So a disable wrote an audit record, reported `DISABLED` to anyone who asked, and then went on
accepting bets. That is a worse failure than an absent control, because the compliance surface is
the thing an inspector trusts. There was also no endpoint to *invoke* a disable at all: the
capability was read-only.

**Fix.** The gate is now consulted on the coordinator's accept path — for orders and for signals,
but **not** for cancellations, because a refund is player protection and must always be
available. A round already locked still settles normally, which is §4.15.1's "conclude the game
in play" and avoids turning a routine operational action into the interrupted-game incident
§4.16 exists to handle.

`POST /api/compliance/disable` and `/enable` were added, authenticated by a bearer token from
`LANDFALL_OPS_TOKEN` compared in constant time. **Where the token is unset the routes refuse to
act** — §2.4.1 asks for the ability to disable gaming, not for anyone on the internet to have it.
A reason is required, not defaulted, because §A.6.3 wants a reason in the record.

**Guarded by:** `iGaming/packages/server/test/gameControl.test.ts` (7 tests: all/room/player
scopes, signals, the locked round concluding, cancels still working, both transitions
audit-logged) and `suites/compliance/game-lifecycle.test.ts`.

---

## 6. An exception during a round left player money stranded and stopped the game — HIGH

**Clause:** GLI-19 §4.16.2 (wagers in interrupted games must be held and reflected in the
account), §A.6.4 (return the wagers, update balances, inform the regulator).

A player's balance is debited when their order is **accepted**, several seconds before `lock()`
persists the stakes. Settlement was already guarded — the conservation assert is expected to be
able to fire there — but `lock()` and `beginRound()` were not.

A throw in `lock()` therefore left the money gone, no stake rows written, no settlement coming,
and — because the throw escaped a timer callback — **no further rounds either**. Every bet
accepted afterwards would have been stranded too. This is not hypothetical: the product's own
ring-fence suite already exhibits a `UNIQUE constraint` failure reaching the settlement path.

**Fix.** Every phase transition runs inside `guardPhase()`, which on a throw voids the round,
refunds every bet in full, records an incident, clears the table, and **continues the loop**.
Continuing is the point: a loop that dies on a transient database error strands every bet
accepted after it, and a game that cannot deal the next round is not "safe", it is unavailable.
`voidRound` also gained an idempotency flag, because a void does not set `settled_at` and the
existing database guard would not have caught a second call.

**Guarded by:** `iGaming/packages/server/test/resilience.test.ts` — a repository whose first
stake write throws is driven through a real round; the balance returns to its opening value, the
round is marked void with the failing phase named, an incident is recorded, and the following
rounds settle normally. A third test calls the void path twice and asserts the refund happens
once.

---

## 7. A demo player who lost their credits could never play again — MEDIUM

**Clause:** GLI-19 §4.9.1(a) — free play "shall accurately represent the normal operation of a
paid game".

A player starts with a fixed float of virtual credits and **nothing in the system ever added to
it**. Practice bots topped themselves up; players did not. A demo player who lost their float was
finished permanently: every order refused as `INSUFFICIENT`, and — because room routing skips any
table whose minimum they cannot afford — seated at the cheapest table and still unable to bet on
it, with no path forward anywhere in the product.

In a build whose only mode is demo, that is the product not working. It is also a §4.9.1(a)
problem in its own right: a paid game does not lock a player out of its own rules.

**Fix.** `PracticeCredits` restores the practice float, under four rules that are each tested
against the reason they exist:

1. **Demo only.** Refused outright unless the server runs with `LANDFALL_ENV=demo`.
2. **A restore, not a reward.** It brings a balance back *up to* the starting float and only when
   the player cannot cover the smallest bet on the server, so it can never leave them better off
   than they started and cannot be farmed.
3. **Rate-limited.** One grant per minute per player. A demo that refills instantly is a slot
   machine with no downside, which misrepresents the game it is demonstrating.
4. **Ledgered.** Every grant is a significant event with the balance before and after, so the
   credits in play reconcile against something. They are **minted**, not moved from the house
   account — a house debit would put practice credits inside the operator-revenue reconciliation.

The client offers the restore only when the server has said the deployment is a demo, and the
game surface already carries a permanent `DEMO · VIRTUAL CREDITS` badge and a legal strip
(§4.9.1(b)).

**Guarded by:** `iGaming/packages/server/test/demoCredits.test.ts` (9 tests) and
`suites/demo/demo-mode.test.ts`.

---

## 8. Random table placement existed as a disclosure, not as an option — MEDIUM

**Clause:** Order 243 Annex 1 Art. 13(b) — a Peer-to-Peer system "must give the player the
possibility to be placed at a gaming table on a random basis". GLI-19 §4.11.1(b) asks the same.

The project's compliance register had closed this (as **G43**) by **disclosing** the default
routing rule: a player who has not chosen a table is seated at the busiest one they can afford,
which is a liquidity decision and is explained as such.

That is necessary and not sufficient. Art. 13(b) requires the **possibility to exist**, and a
disclosure that placement is deterministic does not create a random alternative. This was found by
reading the Georgian text directly rather than through the GLI mapping, and it is the clearest
example of why both matter: the GLI clause is loose enough that a disclosure looks like
compliance, and the Georgian clause is not.

**Fix.** `JOIN_ROOM` accepts the sentinel `random`; the server picks uniformly from the tables the
player's balance can afford, and the entry gate offers it as "Or seat me at a random table".
Affordability survives the randomisation — "at random" cannot mean "at a table you cannot play".
The routing disclosure now names the option, because a player who cannot find it does not have it.

The same reading surfaced **Art. 13(c)–(d)** — the time a player has to act, and the consequence
of failing to act in time. Both were true of the game and neither was stated, so `TIMING_DISCLOSURE`
now says them: betting is open for ten seconds, the exact closing instant is published with the
round, and missing it costs nothing at all — no bet, no forfeit, no default wager, no penalty.

**Guarded by:** `suites/compliance/georgian-p2p.test.ts` (10 tests), which also pins Art. 13(a)'s
absolute prohibition on computerized players against **every shipped room**, so the demo
classification cannot drift.

---

## 9. Smaller items fixed in the same pass

| Item | Clause | Fix |
|---|---|---|
| `/api/compliance/verify` returned 503 on the Cloudflare host — the one the public demo runs on — because that host passed no verifier | §2.3.2 | A host-neutral `runtimeControlManifest` digests the **resolved gaming configuration**, which is what Law Art. 24¹.2 makes a material-change surface. It reports `coverage: 'CONFIGURATION'` so it cannot be mistaken for the full source manifest |
| `/api/chain` returned the commitment captured at boot, which a season rollover makes stale | §3.2 | The endpoint takes a getter; the hub pushes `CHAIN_COMMITMENT` on rollover |
| The client's socket handler parsed frames without a `try`/`catch`, and had no `error` handler — a failed handshake left a dead socket with the connection indicator still green | §2.6.4 | Both added, plus exponential reconnect backoff. A flat one-second retry across a fleet is the load a recovering server cannot absorb |
| Operator control body fields were coerced with `String()`, so a nested object would have written `[object Object]` into an audit reason | §A.6.3 | Typed accessor; non-strings are rejected |

---

## 10. What was checked and found already correct

Recorded so the laboratory knows these were examined rather than assumed.

- **Conservation.** `payouts + rake === handle + reserveDraw` held across 20,000 fuzzed rounds,
  every ladder tier, cap engaged, and across 25 live rounds against a real database.
- **The rounding policy.** Largest-remainder distribution, tie-broken by stake id, leaves no unit
  behind and is independent of the order stakes arrive in.
- **The draw's independence from the pools.** Structural — the function has no parameter for
  them — and behavioural.
- **Jackpot controls.** Ceiling, diversion pool, reset, rollover, decommissioning and monthly
  balancing all behave as §4.13 and Order 222 Art. 17 require, including the refusal to
  decommission into a pot with worse odds.
- **The liability cap.** Derived from the ladder rather than chosen, asserted at room
  construction, and never clamping below the pari-mutuel base.
- **Responsible-gambling gates.** Server-enforced on the accept path; tightening is immediate and
  loosening waits out a cooldown; self-exclusion only ever extends.
- **The bots policy.** A room requesting practice opponents outside a demo build is a startup
  crash, not a warning.
- **The scaling bias in the harbour mapping.** Real, and bounded at 1.3 × 10⁻¹⁵ relative — twelve
  orders of magnitude below what any feasible sample can resolve. Documented rather than glossed.

---

## 11. Open items this pack does not close

These are tracked in `iGaming/docs/10-compliance/22-compliance-gap-register.md` and are stated
here so the laboratory does not have to discover them.

| Ref | Item | Owner |
|---|---|---|
| **G39** | RNG state-compromise extension (§3.3.2(c)) — bounded to one season; public-beacon mixing is designed but not implemented. See `docs/03-rng-design-and-testing.md` §5.4 | Engineering |
| **G7** | Hosting incompatible with the Order 239 Art. 9.1 physical security seal | Engineering |
| **G49** | The fairness chain's terminal secret lives in the database in this build — a documented local-build compromise that must not survive to production | Engineering |
| **G20, G21, G47** | Internal control system, annual integrity assessment, Appendix B technical security controls | Compliance / Security |
| **G1, G51, G54, G30** | Corporate: Georgian entity, permit, authorized persons, citation re-verification | Corporate / Counsel |
| **G14** | Georgian-language rules text | Product |
