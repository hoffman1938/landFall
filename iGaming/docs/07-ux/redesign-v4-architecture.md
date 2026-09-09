# LANDFALL Redesign v4 — "Four Words, One Storm"

**Status:** implemented on branch `redesign/landfall-v3`.
**Supersedes (presentation only):** parts of [ux-simplification-v3.md](ux-simplification-v3.md) §6–§10.
**Changes nothing about:** the 1/6 uniform harbor draw, the rake, settlement, Storm Power, Storm
Surge, the seed chain, room tiers, responsible-gambling limits, or any phase duration.

---

## 1. Objective

Two layers in one product.

| Layer | What it is |
|---|---|
| **Beginner** | `CHOOSE HARBOR → LOCK IN → WATCH THE STORM → SEE THE RESULT`. Four concepts, nothing else on screen. |
| **Advanced** | Tide details, Play Style, Signal Flags, history, statistics, seed-chain verification — all one tap deeper. |

Every addition in this pass had to answer *yes* to at least one of: does it make the game easier to
understand, the result easier to follow, the visuals less repetitive, or the fairness more
transparent. Nothing else was built.

---

## 2. Audit of what already existed (step 17.1–17.5)

| Concern | Where it lives today | Verdict |
|---|---|---|
| Authoritative round loop | `packages/server/src/coordinator.ts` — `ANCHOR_OPEN → LOCKED_STORM → RESOLVED → COOLDOWN` | **Keep verbatim.** It owns money. |
| Harbor draw | `core/src/rng.ts` `drawZone()` — `HMAC(seed, "landfall:round:"+roundId)`, `u = digest[0,13)/2^52`, `floor(u·6)` | **Keep byte-for-byte.** Changing the label would invalidate every settled round in the database. |
| Auxiliary rolls | Same digest, disjoint spans: feints `[13,17)`, surge `[17,22)`, golden anchor `[22,35)`, storm power `[35,40)`, weather `[40,42)` | **Keep.** Already independent; now joined by genuinely separate HMAC domains for the new presentation layers. |
| Blind Fog | `coordinator.beginRound()` sets `fogStartsAt = lockAt − BLIND_FOG_MS`; `FOG_STARTED` freezes the tide report; one `finalOrders` entry per player | **Keep.** This *is* the brief's FOG + FINAL_ORDER window. |
| Tide Report | `core/src/tide.ts` (hysteretic crowd bands) + `TIDE_REPORT`/`FOG_STARTED` messages | **Keep the data. Replace the presentation.** |
| Final Order | `coordinator.fleetOrder()` / `cancelOrder()` gated by `isBlindFogActive()` | **Keep.** Given a real UI for the first time (KEEP / CHANGE). |
| Focus / Split | `FLEET_ORDER` message, `SPLIT_PRIMARY_PERCENT = 70` | **Keep the maths.** Re-presented as "Play style". |
| Signal Flags | `SIGNAL` message, `flagHonest()`, B4 friction rules | **Keep.** Re-presented as dismissible information cards. |
| Provably fair | `core/src/verify.ts`, `GET /api/round/:id`, `VerifyModal` | **Keep and extend** to the new RNG domains. |
| Progressive disclosure | `web/src/deckProgress.ts` (D5) | **Keep and extend** with a mode switch above it. |
| Board | `web/src/pixi/BayScene.ts` | **Keep the instrument language.** Add environments and the reveal sequence. |

Conclusion: **nothing needed to be replaced with a mock.** Every system the brief names already had a
working, server-authoritative implementation. This pass adds domains, a client state machine, and a
presentation layer on top of them.

---

## 3. Conflicts between the brief and the shipped architecture, and how each was resolved

### 3.1 RNG domain labels

*Brief:* `HMAC(seed, "harbor:" + nonce)`.
*Shipped:* `HMAC(seed, "landfall:round:" + roundId)`.

These are the same construction with a different domain string. Renaming it would make every
already-settled round fail verification, which is a direct fairness regression, so the **harbor
domain keeps its label** and is now named explicitly:

```
HARBOR      HMAC(seed, "landfall:round:"       + roundId)   ← unchanged, authoritative
EVENT        HMAC(seed, "landfall:event:"       + roundId)   ← new
ENVIRONMENT  HMAC(seed, "landfall:environment:" + roundId)   ← new
COSMETIC     HMAC(seed, "landfall:cosmetic:"    + roundId)   ← new
```

`core/src/rng.ts` exposes `HARBOR_DOMAIN` and `domainDigest()`; the three new domains are drawn in
`core/src/presentation.ts`. They are separate HMACs over separate messages, so no arithmetic
relationship exists between them and the harbor draw.

### 3.2 "SURGE" collides with the existing Storm Surge jackpot

The brief's middle event tier is called SURGE; the game already has a **Storm Surge** progressive
jackpot with a Golden Anchor payout. Two different things with one name at the highest-emotion moment
is exactly the failure v3 catalogued.

**Resolution:** the tiers keep the brief's names in code (`CALM`/`SURGE`/`TEMPEST`) because they are
an internal presentation enum, but the **player never sees the word "surge" for a tier** — the
tiers are shown as `CALM` / `HEAVY` / `TEMPEST`, and "jackpot" remains the only player-facing word for
the progressive. One word, one concept.

### 3.3 Event tiers vs. "demo scoring"

*Brief:* tiers "primarily change presentation and demo scoring/cosmetic rewards".

Settlement is a solved, tested, conservation-asserted pari-mutuel transaction; bolting a parallel
score onto it would fail all four of the brief's own tests (it makes the game harder to understand,
not easier). The credits already **are** the non-monetary demo score — virtual, no cash value.

**Resolution:** the tiers are strictly presentational — reveal choreography, sound weight, camera and
sky. `docs/03-math` is untouched; `landfall_*` metrics are untouched; the funding invariant test still
passes unchanged.

### 3.4 Twelve UI states vs. four server phases

*Brief:* `IDLE SELECTING LOCKED FOG TIDE_REPORT FINAL_ORDER FINAL_LOCK REVEAL IMPACT RESULT
VERIFICATION RESET`.
*Shipped:* four server phases, because four is what money needs.

**Resolution:** the twelve are a **client presentation machine derived from the authoritative
phase**, not a second source of truth. `web/src/roundMachine.ts` is a pure function
`deriveRoundState(input) → RoundState` plus a transition table; every render reads that one value.
The mapping:

| Client state | Derived from |
|---|---|
| `IDLE` | no connection or no round header |
| `SELECTING` | `ANCHOR_OPEN`, before `fogStartsAt`, no committed bet |
| `LOCKED` | `ANCHOR_OPEN`, before `fogStartsAt`, bet committed |
| `FOG` | first beat after `fogStartsAt` |
| `TIDE_REPORT` | second beat of the fog window |
| `FINAL_ORDER` | third beat — the one hidden order is still available |
| `FINAL_LOCK` | last beat, or the final order has been spent |
| `REVEAL` | `LOCKED_STORM` |
| `IMPACT` | first ~900 ms of `RESOLVED` |
| `RESULT` | rest of `RESOLVED` |
| `VERIFICATION` | `RESULT`/`RESET` with the verify sheet open |
| `RESET` | `COOLDOWN` |

Illegal transitions (`RESULT → REVEAL`, `FINAL_LOCK → SELECTING`, …) are rejected by
`nextRoundState()`, which holds the previous state instead. The fog sub-beats are computed by
`fogBeats()` from `fogStartsAt` and the lock time, so a Heavy Fog round (4 s) and a Clear Tide round
(3 s) both land every beat. **No new timers were added to the server, and no phase duration changed.**

### 3.5 "Tide Report: storm activity ← WEST"

A tide report reports where the **crowd** is. Labelling it "storm activity" would present public
crowd data as a storm prediction — which the brief itself forbids two lines later ("never visually
present a Tide Report as a certain prediction"), and which is false: the draw is uniform and
independent of the pools.

**Resolution:** the beginner card keeps the brief's shape — one headline, one direction, one arrow,
a `DETAILS` disclosure — and states the true fact:

```
TIDE REPORT
Crowd building
WEST  ←
Where players are betting. The storm ignores it.
```

`web/src/tideDirection.ts` derives the direction from the published bands and the board's own
geometry (west column = harbors 1·3·5, east = 2·4·6; north/south by row), and is unit-tested.

### 3.6 "Result remains visible without scrolling" vs. the dashboard rails

The telemetry rail and chat column are useful to an experienced player and pure noise to a new one.

**Resolution:** `web/src/uiMode.ts` — a persisted `beginner | advanced` mode. Beginner hides both
rails, the exact-pot readouts, weather chips, and the jackpot ticker; the board fills the window.
The mode is offered (never forced) after the fifth completed round, and the existing D5 deck
disclosure continues to operate underneath it.

---

## 4. Independent probability tables

All three are drawn from their own HMAC domain, in parts per million, exactly summing to 1 000 000.
None of them can move the harbor draw, which remains `1/6 = 16.6667 %` per harbor, generated in
`beginRound()` **before** anything is broadcast and never touched again.

**Event tier** (`core/src/presentation.ts`)

| Tier | ppm | probability |
|---|---:|---:|
| `CALM` | 750 000 | 75 % |
| `SURGE` (shown as HEAVY) | 200 000 | 20 % |
| `TEMPEST` | 50 000 | 5 % |

**Environment**

| Environment | ppm | probability |
|---|---:|---:|
| `NORMAL_SEA` | 650 000 | 65 % |
| `RAIN` | 200 000 | 20 % |
| `NIGHT` | 80 000 | 8 % |
| `LIGHTNING` | 40 000 | 4 % |
| `RED_SKY` | 20 000 | 2 % |
| `AURORA` | 8 000 | 0.8 % |
| `BLACK_FOG` | 2 000 | 0.2 % |

**Cosmetic** — a 32-bit stream used for wave phase, rain offsets and lightning placement. It reaches
nothing but the canvas.

Independence is asserted by `core/test/presentation.test.ts`: distributions over 200 000 rounds, and a
χ²-style check that harbor frequency is flat *within* every tier and every environment.

---

## 5. Round choreography (what the player actually experiences)

```
 SELECT            6 harbors, one tap, LOCK IN                     ~7 s
 FOG               the board greys, chrome recedes                  ~0.6 s
 TIDE REPORT       one card, one direction, one arrow               ~1.1 s
 FINAL ORDER       KEEP  /  CHANGE — two large controls             ~0.8 s
 FINAL LOCK        LOCKED. nothing accepted                         ~0.5 s
 REVEAL            storm → radar pulse → sectors narrow → focus     5 s
 IMPACT            strike, shockwave, camera settle                 0.9 s
 RESULT            HARBOR X, your figure, VERIFY, NEXT ROUND       ~2.1 s
 RESET             next round                                       2 s
```

Total 20 s, exactly as before — no dead beat was added, and the reveal's five seconds now carry four
distinct readable stages instead of one patrol loop.

Event tier changes the *choreography inside* the reveal, never its length:

| Tier | Reveal |
|---|---|
| `CALM` | two radar sweeps, straight narrowing, no shake |
| `SURGE` | three sweeps, wider sector sweep, sea lifts, light shake |
| `TEMPEST` | four sweeps, sky change, lightning, hard shake, distinct result frame |

---

## 6. What was deliberately NOT built

* No parallel scoring system (§3.3).
* No fish, ice, rods, holes, or any Ice Fishing motif — the board is still a chart, the harbors are
  still harbors, the storm is still a targeting reticle.
* No change to the wire protocol's existing fields; the three new fields are additive and optional,
  so an older client keeps parsing (§3 law of `messages.ts`).
* No animation that does not carry information: the reveal's stages each answer "how close is this to
  being decided", and the impact answers "which harbor".
