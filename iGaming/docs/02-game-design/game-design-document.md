# Game Design Document: LANDFALL

**Prepared by:** Lead Game Designer
**Phase:** 3-4 supporting deliverable (Game Design Document)
**Depends on:** [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md),
[concept-generation.md](concept-generation.md)
**Revision note:** this document previously specified "Ember," a Crash-mechanic game with a
bonfire theme. The mandate changed from "an original game like Aviator" to "an original game
that copies no existing instant-game mechanic," which retired the Crash core entirely. LANDFALL
is a new mechanic (positional-survivor pari-mutuel), not a re-theme. Chat remains a **core MVP
feature**, carried forward from the previous direction — it fits Landfall even better, because
talking about where the crowd is standing is now strategically meaningful, not just ambient.
"LANDFALL" is a working title pending formal trademark clearance (Product/Legal, pre-release).

**Category-redesign note (v2 target):** the runnable MVP described in this GDD exposes exact
live pools and free re-anchoring until lock. The category-competitive redesign now treats that
as the v1 weakness: it preserves six harbors, one struck harbor, pari-mutuel settlement,
player-vs-player competition, provably fair RNG, and fixed 20-second rounds, but replaces the
exact final-second EV race with imperfect shared information, Blind Fog Lock, Focus/Split
fleet orders, signal flags, and replay/spectacle systems. The canonical v2 target is
[category-redesign-v2.md](category-redesign-v2.md).

---

## 0. The Game in One Sentence

> **Drop your anchor at one of six harbors. The storm wrecks one. Everyone else splits the
> wrecked harbor's cargo.**

### 0.1 World & Fiction

A stretch of coast, six harbor islands, one storm rolling in every ~20 seconds. Players are
skippers choosing where to shelter. The storm makes landfall on exactly one harbor — chosen by a
provably fair draw, committed cryptographically before anyone anchors
([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)). Boats in the wrecked
harbor lose their cargo (stake); every surviving boat keeps its cargo and receives a share of the
wreck's salvage, split pro-rata by stake. The house takes a fixed rake from the salvage only
([mathematical-model.md](../03-math/mathematical-model.md)).

### 0.2 Vocabulary (player-facing ↔ engineering)

| Player-facing term | Engineering term used in other docs |
|---|---|
| Harbor (×6) | Zone `0..K-1`, `K = 6` |
| Drop anchor | Place stake on a zone |
| Re-anchor | Change zone before lock (allowed, free) |
| The storm makes landfall | Round resolves; struck zone determined by the draw |
| Wrecked / "took the storm" | Player was in the struck zone; stake lost |
| Salvage | Pro-rata share of `(1 − rake) × struck pool` paid to survivors |
| Harbormaster's cut | Rake `r` (house edge mechanism) |
| Harbor Chat | In-round chat panel (§5) |
| In the Harbor | Live player list |
| Wreck Log | Round history strip (which harbor was struck, last ~20 rounds) |

### 0.3 Identity (brand kit summary)

Name **LANDFALL**; symbol: **lighthouse beam through storm clouds**; palette: deep navy +
storm gray, with **beacon amber reserved exclusively for payout moments** (a color players learn
to crave); four audio cues, all ownable: foghorn (anchor window opens), rising wind (storm
approach), one thunderclap (landfall), harbor bell (your salvage arrives). Full sourcing
constraints (royalty-free only): [technical-specification.md](../06-spec/technical-specification.md)§7.

## 1. Core Loop

```
 ┌───────────────┐    ┌────────────────┐    ┌───────────────┐    ┌────────────┐
 │ ANCHOR WINDOW  │ ─▶ │ STORM APPROACH │ ─▶ │   LANDFALL     │ ─▶ │  COOLDOWN   │──┐
 │ (~10s)         │    │ (~4-5s)        │    │ (~3s)          │    │  (~3s)      │  │
 │ pick a harbor, │    │ picks locked;  │    │ struck harbor  │    │ salvage     │  │
 │ re-anchor      │    │ storm path     │    │ revealed; seed │    │ settles;    │  │
 │ freely; watch  │    │ teases across  │    │ revealed;      │    │ next commit │  │
 │ the crowd      │    │ the map        │    │ payouts rain   │    │ published   │  │
 └───────────────┘    └────────────────┘    └───────────────┘    └────────────┘  │
        ▲                                                                          │
        └──────────────────────────────────────────────────────────────────────────┘
```

1. **Anchor Window (~10s)** — the round's commitment hash is already published. Players stake
   an amount and drop anchor on one harbor. **Live pool bars on every harbor show where the
   crowd's money is, updating in real time.** Players may re-anchor (move to another harbor)
   freely and at no cost until lock. The final seconds of the window are the game's signature
   spectacle: the crowd redistributing itself.
2. **Storm Approach (~4-5s)** — picks are locked. The storm animates across the map, visually
   "threatening" 2-3 harbors before its true landfall. **The path is deterministic theater
   computed from the already-committed seed** — pure anticipation, zero outcome influence, and
   fully verifiable after the reveal ([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§5).
3. **Landfall (~3s)** — the struck harbor is revealed; the server reveals the round seed;
   survivors' salvage animates into their balances (beacon amber); the wrecked harbor's players
   see their loss plainly and immediately.
4. **Cooldown (~3s)** — settled results on screen, Wreck Log updates, next round's commitment
   hash appears. Total cycle: **~20 seconds, fixed** (unlike Crash, round length does not vary
   with the outcome — a scheduling advantage for spectators and for server room management).

## 2. One-Button Flow (<10-Second Learning Curve)

| Time | What a first-time viewer sees | What they learn |
|---|---|---|
| 0-3s | Six islands with money bars; people's names stacked on each; a countdown | "People are choosing islands before a timer runs out." |
| 3-6s | A storm sweeps in and smashes one island; red numbers on it | "One island loses." |
| 6-9s | Amber payouts rain on everyone else, proportional numbers tick up | "Everyone else wins — paid from the losers." |
| ~9-10s | The next anchor window opens; one big button: "Drop Anchor" | "I pick an island. That's the whole game." |

One watched round teaches the complete ruleset. There is exactly one button that matters
("Drop Anchor" / tap a harbor), satisfying the one-decision mandate.

## 3. Ruleset

- **Zones:** `K = 6` harbors. Chosen over K=4 (too chunky, 25% strike odds feel brutal) and K=8+
  (crowd spreads too thin in small rooms; pool bars lose drama). K is a per-room constant, not a
  player choice — future room tiers may vary it.
- **One anchor per player per round** (MVP). Stake amount set via stepper before/while anchoring;
  min 1 credit, max configurable per room (open balancing question, tracked in
  [technical-specification.md](../06-spec/technical-specification.md)§23).
- **Re-anchoring:** allowed, free, unlimited, until lock. The server honors the last position
  received before lock (server clock authoritative —
  [security-review.md](../05-security/security-review.md)§1.2). Stake amount may also be adjusted
  until lock.
- **Resolution:** one zone `z*` drawn uniformly (probability exactly 1/6 per harbor,
  independent of pool sizes — crowding never changes *where* the storm hits, only what surviving
  pays; this is stated in-game plainly to preempt the natural "the storm chases the money"
  suspicion, and is exactly what the verification tool proves round by round).
- **Settlement (pari-mutuel):** struck players lose their stakes. Each survivor receives
  `stake + (1 − r) × struckPool × (stake / survivorPoolTotal)`. Rake `r = 6%` of the struck pool
  only → effective house edge = `r/K` = **1% of total handle**, invariant to crowd distribution
  (proof and simulation: [mathematical-model.md](../03-math/mathematical-model.md)§3, §7).
- **House-seeded pools:** the house anchors a fixed baseline stake (e.g. 50 credits) on every
  harbor each round, participating under pari-mutuel rules like any player. Purpose: liquidity
  (solo and low-population rounds remain playable and meaningfully paid). The seeds are fixed,
  identical across harbors, published in the round header, and **committed before the draw** —
  they can never be adjusted per-round to steer outcomes
  ([security-review.md](../05-security/security-review.md)§1.9,
  [mathematical-model.md](../03-math/mathematical-model.md)§6).
- **Sitting out:** placing no anchor is always allowed; spectating (and chatting) is a
  first-class state.
- **⛈ Storm Power (salvage multiplier, added by product request):** every storm has a hidden
  hurricane category revealed at landfall that multiplies all survivors' salvage — ×0.5
  (common) up to ×500 ("Perfect Storm", ~1 in 50,000). The ladder is variance-neutral
  (E[M] = 1 exactly — [mathematical-model.md](../03-math/mathematical-model.md)§10), so it adds
  Aviator-grade tail dreams ("my 1 credit can become hundreds") without touching the edge; a
  surviving win never becomes a loss. Provably fair from the same digest.
- **⚡ Storm Surge (progressive jackpot, added by product request):** half the rake feeds a
  visible, always-growing pot; ~1 round in 25 (provably-fair trigger, announced before
  anchoring) is a **surge round** — after the storm, the **Golden Anchor** picks one surviving
  player (odds ∝ stake) who wins the entire pot. Restores the "someone just won 500x" marquee
  moment Landfall traded away vs. Crash, without breaking pari-mutuel zero-liability. Full math:
  [mathematical-model.md](../03-math/mathematical-model.md)§9; draw derivation:
  [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§7.
- **High-roller controls:** stake ceiling 2,000.00; **×2** press (roulette-style double of a
  placed stake), **½**, **MAX**, and **↻ Rebet** (repeat last round's anchor) — one-tap controls
  serving both small-stake and large-stake play without adding a second decision to the core
  loop.

## 4. Round Lifecycle State Machine

```
        ┌─────────────────────────────────────────────────────────────┐
        │                                                               │
        ▼                                                               │
 [ANCHOR_OPEN] --(timer)--> [LOCKED_STORM] --(reveal tick)--> [RESOLVED]
        ▲                        │                                 │
        │      (no anchor/stake/re-anchor                          │
        │       messages accepted here)                            │
        │                                                          │
        └──────────────(cooldown timer)──────── [COOLDOWN] <───────┘
```

Server-enforced invariants (never trusted from the client —
[security-review.md](../05-security/security-review.md)):

- Anchor placement, stake changes, and re-anchoring are accepted **only** during `ANCHOR_OPEN`.
- The struck zone derives **only** from the pre-committed seed
  (`HMAC` over the round id — [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)),
  which is committed before `ANCHOR_OPEN` begins. Nothing that happens during the round — pool
  sizes, timing, who anchored where — can influence the draw.
- Settlement is a single atomic transaction: all survivor credits and struck debits for a round
  commit together or not at all.
- There are **no player actions during `LOCKED_STORM` or `RESOLVED`** — unlike Crash, no
  mid-round message (like cash-out) exists at all, which removes the entire
  latency-fairness/timing-attack class from the design
  ([security-review.md](../05-security/security-review.md)§1.3).

## 5. Social Layer — Chat Is Core

Carried forward from the previous product direction and now strategically load-bearing: in
Landfall, talking about positions ("harbor 4 is overloaded, move!") is *gameplay-relevant*
speech, which no feed-only social layer can host.

### 5.1 Harbor Chat (core, MVP)

Identical scope and protections to the previously specified chat feature, restated as the
current spec:

- Always-visible persistent text channel per room, active across all round states.
- Attributed to display names (same identity as the player list and salvage feed).
- Plain text only for MVP: no links, media, or @-mention side effects.
- Server-enforced constraints: ~200-char max, per-user token-bucket rate limit (≈1 msg/2s,
  separate budget from gameplay actions), word-list filter that **rejects** (never masks) with
  a visible "message not sent" notice; repeat violations escalate to a temporary chat cooldown.
- Client-side per-player mute (personal, local, reversible).
- **System messages** (round open/landfall/big-salvage callouts) use a server-only message type
  rendered in a style no player message can imitate
  ([security-review.md](../05-security/security-review.md)§1.13).
- Deferred beyond MVP: moderation dashboards, ML toxicity filtering, bans/reporting workflows,
  DMs, threads.

### 5.2 In the Harbor (live player list)

Per-harbor stacks: who is anchored where, stake (hideable per personal preference), and result
state after landfall (safe / wrecked). This list *is* the strategic information surface — unlike
the Crash-era player list, it isn't social proof decoration; reading it well is playing well.

### 5.3 Salvage Feed

Attributed results ("Player_42 salvaged +18.40 from Harbor 3's wreck") interleaved as system
messages in chat rather than a separate panel — one social surface, not two competing ones
(a simplification vs. the Ember-era tabbed design, enabled by chat and results being
thematically the same conversation now).

### 5.4 Wreck Log

Last ~20 struck harbors as small island icons — lets players see streaks and feed their pattern
superstitions (the draw is uniform and memoryless; the verification tool exists precisely so
skeptics can check that — [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§6).

### 5.5 Future (explicitly not MVP)

Emoji reactions; **Oracle side-market** (bet on which harbor ends most crowded —
[concept-generation.md](concept-generation.md)#81); team harbors/regatta events; tournament
wrappers ([concept-generation.md](concept-generation.md)#76).

## 6. Emotional Design (why players stay)

- **Modal round = small win.** At K=6, ~83% of anchored players survive each round; the default
  experience is relief-plus-gain, punctuated by the 1-in-6 sting. Loss is an *event*, not the
  baseline — the emotional inverse of most instant games.
- **The scramble.** The last 3 seconds of every anchor window, as pool bars lurch and players
  re-anchor, is the repeatable, clip-able signature moment.
- **The upset.** When a whale-heavy harbor takes the storm, every survivor gets a visibly
  outsized salvage — the round players screenshot and retell. Its emergent rarity (it requires
  real crowd imbalance) is what makes it memorable; no paytable manufactures it.
- **Communal survivorship.** Wins are shared with visible others by construction — the payout
  literally arrives from a common event — which makes Harbor Chat celebration/commiseration
  native rather than performative.

## 7. Non-Goals (Explicit Scope Boundaries)

The MVP will **not**:

- Implement real-money wagering, deposits, withdrawals, or KYC — educational/local project only.
- Implement multi-anchor hedging, the Oracle side-market, team modes, tournaments, leaderboards,
  or achievements — future roadmap only.
- Implement advanced chat moderation beyond §5.1's scope.
- Add a second game mode (Undertow and Impact are documented Plans B/C in
  [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md)§5, on the shared platform, later).
- Reintroduce any banned mechanic (rising-multiplier timing, grid reveals, target dials, physics
  cascades deciding outcomes) through feature creep — every proposed feature must pass the
  resemblance check in [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md)§2.

## 8. Category-Competitive Redesign Target

The v2 direction is documented in full in
[category-redesign-v2.md](category-redesign-v2.md). Its strategic change is not a new outcome
mechanic; it is a new **information and commitment layer** around the existing outcome mechanic.

Summary:

- **Public Tide Reports:** replace exact live strategic telemetry with delayed/banded reports.
- **Blind Fog Lock:** final orders are hidden for the last seconds and revealed together at
  lock, preventing deterministic last-tick sniping.
- **Final Order:** one decisive late hold/move/split adjustment, not unlimited micro-spam.
- **Fleet Orders:** Focus (100% one harbor) or Split (preset two-harbor allocation), both
  settled as normal pari-mutuel stake entries.
- **Signal Flags:** one public social signal per round for bluffing, rallying, or baiting.
- **Stake Band Privacy and Harbor Compass:** reduce predatory precision while keeping casuals
  strategically literate.
- **Weather, Wreck Wake Replay, and Clip Cards:** add replayability, tension, and spectator
  moments without affecting strike odds or settlement.

The design goal changes from "watch exact bars and jump to the emptiest harbor" to "predict
where the crowd will end after the fog, decide how much risk to concentrate, and use social
signals to bend the room."
