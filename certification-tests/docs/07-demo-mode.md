# 07 — Demo Mode

**What this build is, what it is not, and what would have to change for a permitted deployment.**

---

## 1. The classification, stated plainly

**This is a demo build.** It plays for virtual credits with no cash value. There is no payment
instrument anywhere in the codebase — no card, no wallet, no bank reference, no cashier — and the
tables are populated with practice opponents so a solo player can see real crowd dynamics.

That is not a presentational choice. Under **Order 243 Annex 1 Art. 13(a)** a Peer-to-Peer system
"must not use automatic or computerized players to play against players", and the clause is
absolute — unlike GLI-19 §4.11.1(c), which permits proposition players provided they are clearly
indicated. The shipped `rooms.json` requests practice opponents in every room, so **this
configuration cannot be supplied under a permit at all**.

The build says so by failing rather than by promising:

```
BOTS POLICY VIOLATION: room "skiff" sets botsAllowed but
LANDFALL_ENV is not "demo". Refusing to start.
```

A startup crash, not a warning. A warning leaves the decision to whoever reads the log.

**Verified by:** `suites/demo/demo-mode.test.ts` and `suites/compliance/georgian-p2p.test.ts` —
the crash is asserted for a synthetic room *and for every room in the shipped configuration*, so
the classification cannot drift without a test failing.

---

## 2. GLI-19 §4.9.1 — free play mode

> (a) Free play games shall accurately represent the normal operation of a paid game and shall
> not mislead the player about the likelihood of winning any awards available in the wagered
> version.
> (b) Free play mode shall be prominently displayed so a player knows at all times if/when this
> mode is active.
> (c) Free play mode shall not increment the credit meter or the player account balance.

### (a) — it represents the paid game, because it *is* the paid game

There is **no demo branch** in the draw, in settlement, or in the return model. The same
`drawZone`, the same `settleRound`, the same `theoreticalRtp` run in both modes.

The suite proves this rather than asserting it: the same seed is drawn with `LANDFALL_ENV` set to
`demo` and then to `production`, and the outcomes are identical objects. If a demo branch were
ever introduced into the outcome path, that test fails.

Practice opponents **settle pari-mutuel exactly like players**, which is the subtle half of (a).
Excluding them from settlement would make demo payouts unlike production payouts — in production
those stakes would be other players' money. A bot stake and a human stake of the same size in the
same harbour receive the same payout, and that is asserted directly.

What bots *cannot* do is win the jackpot. They are excluded from Golden Anchor selection at every
roll, in both the stake-weighted and flat-odds modes, so a player's jackpot odds in the demo match
production semantics — where bots do not exist at all.

### (b) — prominently displayed, at all times

A permanent `DEMO · VIRTUAL CREDITS` badge sits in the game's top bar, and a permanent legal strip
carries the malfunction notice. Neither is behind a dialog, a scroll or a tab. The
game-information dialog carries the full statement, and the licence seal slot renders an honest
"No licence — demo build" rather than a decorative badge.

### (c) — practice credits are not a balance being incremented

There is no real balance in this build to increment. What exists is a **practice float**, and it
is governed by four rules, each tested against the reason it exists:

| Rule | Why |
|---|---|
| **Demo only** — refused outright unless `LANDFALL_ENV=demo` | So the capability cannot exist in a permitted deployment |
| **A restore, not a reward** — brings a balance back *up to* the starting float, only when the player cannot cover the smallest bet on the server | So it can never leave a player better off than they started, cannot be farmed, and cannot be mistaken for winnings |
| **Rate-limited** — one grant per minute per player | A demo that refills instantly is a slot machine with no downside, which misrepresents the game it is demonstrating |
| **Ledgered** — every grant is a significant event with the balance before and after | So the credits in play reconcile against something (§2.9.5) |

The credits are **minted**, not moved from the house account. A house debit would put practice
credits inside the operator-revenue reconciliation, where `reconcileOperatorRevenue` would
correctly report them as leakage.

> **This closed a defect, not merely a clause.** Nothing in the system ever added to a player's
> balance. Practice bots topped themselves up; players did not. A demo player who lost their float
> was finished permanently — every order refused as `INSUFFICIENT`, seated at the cheapest table
> and still unable to bet on it, with no path forward anywhere in the product. In a build whose
> only mode is demo, that is the product not working. See `docs/08-findings-and-fixes.md` §7.

---

## 3. There is no real-money path

Stated mechanically, because "we did not implement payments" is exactly the sort of claim that is
true until somebody adds a library.

**The wire protocol is a closed discriminated union.** Its complete membership:

```
HELLO · JOIN_ROOM · ANCHOR · FLEET_ORDER · CANCEL_ORDER · SIGNAL
CHAT · GET_SKIPPER · SET_LIMITS · SET_EXCLUSION · REQUEST_PRACTICE_CREDITS
```

No message contains `DEPOSIT`, `WITHDRAW`, `PAYMENT`, `CARD`, `CASHOUT` or `TRANSFER`, and the
suite asserts that by enumeration. The one message that moves credits is explicitly a **practice**
message and the server refuses it outside a demo build.

**GLI-19 §2.5.6(f)** — "it shall not be possible to transfer funds between two player accounts" —
holds structurally. A player's own order can only reduce their own balance by their own stake.
Settlement pays survivors from the **pool**, not from a named counterparty: replacing one losing
stake with a different stake of the same size produces an identical payout for every survivor,
which is what "paid from the pool" means and what the suite checks.

---

## 4. Practice opponents, in detail

| Property | Behaviour |
|---|---|
| Existence | Only under `LANDFALL_ENV=demo`; otherwise a startup crash |
| Marking | `is_bot` in the database, in every public lock snapshot, in the results feed, and labelled "practice" in the live rail |
| Jackpot | Excluded from Golden Anchor selection at every roll, both modes |
| Population | Never counted in the lobby's human counts or in the liquidity hint, which takes only a human count as its argument |
| Settlement | Identical to a player stake — see §2(a) |
| Bankroll | Scales with the tier; a room whose bots cannot cover one table-maximum bet refuses to start |
| Head-count | Per tier in `rooms.json`; `LANDFALL_BOTS=0` disables them entirely |

The bankroll rule is worth a sentence: a Leviathan bot funded like a Skiff bot would be broke on
its first bet, which would leave the expensive tables looking deserted and therefore
misrepresenting the crowd — a §4.9.1(a) problem, not just a cosmetic one.

---

## 5. What a permitted deployment would change

| | Demo build | Permitted deployment |
|---|---|---|
| `LANDFALL_ENV` | `demo` | anything else |
| `rooms.json` | `botsAllowed: true` everywhere | `botsAllowed: false` everywhere (Art. 13(a)) |
| Practice opponents | Seated, marked, jackpot-excluded | **None.** The server refuses to start otherwise |
| Practice credits | Available, rate-limited, ledgered | `PracticeCredits` is not constructed; the message is refused |
| Player balance | Virtual credits, no cash value | Supplied by the operator's cashier through the platform integration |
| Identity | An anonymous generated name per browser session | Operator-verified per Order 43; the accept path takes the id from the host |
| Second browser window | A second player — a demo affordance | Prohibited: Order 43 Art. 6(d), no two accounts per person |
| Licence seal | "No licence — demo build" | The Selected Person's Digital Seal (Order 243 Annex 1 Art. 9) |
| Hosting | Cloudflare Workers | Georgian hosting compatible with the Order 239 Art. 9.1 physical seal — **G7** |

**Nothing in the game's mathematics changes between these two columns.** The odds, the settlement,
the rake, the ladder, the jackpot and the published return are the same code and the same numbers.
That is the point of §4.9.1(a), and it is why the demo is worth certifying: what a laboratory
tests here is what a player would get there.

---

## 6. Responsible gambling in the demo

Present and **server-enforced**, not client cosmetics — a limit the client could bypass is not a
limit. Every gate is consulted on the coordinator's accept path.

| Control | Behaviour |
|---|---|
| Per-round stake cap | Self-imposed; refuses an order above it |
| Session loss limit | Committed stake counts against remaining headroom **before** it is lost |
| Daily loss limit | Same, against a UTC-day ledger written inside the settlement transaction |
| Reality check | Player-chosen cadence; reports elapsed time and session net, including when negative |
| Self-exclusion | A lockout that **only ever extends** — a shorter request is a no-op |
| Loosening a limit | Queued behind a 24-hour cooldown; tightening is immediate |

The asymmetry between tightening and loosening is the whole mechanism: a limit a player can lift
in the moment they want to exceed it is not a limit. Tested in
`suites/edge-cases/boundaries.test.ts`.

The session telemetry rail shows a running, honest session P&L — never smoothed, never reset by a
win, and never hidden while it is negative. That is the same disclosure the reality check makes,
shown continuously instead of on a timer.

---

## 7. Where this is verified

| Claim | Test |
|---|---|
| Bots outside a demo build are a startup crash | `suites/demo/demo-mode.test.ts`, `suites/compliance/georgian-p2p.test.ts` |
| Every shipped room refuses to start outside demo | `suites/compliance/georgian-p2p.test.ts` |
| The demo flag comes from the environment and nothing else opens it | `suites/demo/demo-mode.test.ts` |
| A bot can never win the jackpot, at any roll | same |
| A bot stake settles exactly like a player stake | same |
| The population hint counts humans only | same |
| The draw has no demo branch | same |
| Practice credits: demo-gated, capped, rate-limited, ledgered, minted | same, plus `iGaming/packages/server/test/demoCredits.test.ts` |
| The protocol carries no payment message | `suites/demo/demo-mode.test.ts` |
| No player action moves credits to another named player | same |
| RG gates are enforced on the accept path | `suites/edge-cases/boundaries.test.ts` |
