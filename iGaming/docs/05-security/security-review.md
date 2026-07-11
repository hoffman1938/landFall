# Security Review — LANDFALL

**Prepared by:** Security Architect
**Phase:** 6 (rerun) — Security Review
**Depends on:** [software-architecture.md](../04-architecture/software-architecture.md),
[rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)
**Revision note:** rewritten for Landfall's flow (anchor → lock → draw → pari-mutuel
settlement). Generic web threats carry over from the Crash-era review; the game-specific threat
surface changed substantially — one entire attack class disappears (§1.3), two new ones appear
(§1.9, §1.12).

---

## 0. Governing Principle: Server-Authoritative Logic

Unchanged and restated: **the client never decides, computes, or is trusted to report a game
outcome.** Every client message is a *request* validated against server state. In Landfall this
principle has a second leg: **the outcome is also independent of the server's own round-time
behavior** — the draw is a pure function of a pre-committed seed and a public round counter
([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§1.2), so
server-authoritative does not mean server-discretionary.

## 1. Threat Model — Mapped to the Landfall Round Flow

Flow stages: round header (commit) → anchor window (place/move/resize stake) → lock → draw &
storm → settlement → next round.

### 1.1 Stake Manipulation

- **Scenario:** client submits a stake it can't cover, resizes after lock, or double-spends
  across concurrent messages.
- **Mitigation:** Zod-validated amounts (positive, min/max bounds); balance check and debit in
  the same transactional unit as anchor acceptance; stake changes accepted only in
  `ANCHOR_OPEN`; per-session sequence numbers make concurrent conflicting messages resolve
  deterministically (last valid pre-lock message wins).

### 1.2 Re-Anchor Races at the Lock Boundary

- **Scenario:** a player fires a re-anchor message timed to land exactly at lock, hoping for
  ambiguity about which zone their stake occupies — or replays an old anchor message later.
- **Mitigation:** the lock instant is the server's clock alone. Every anchor/re-anchor message
  is server-timestamped on receipt; messages after lock are rejected with an explicit
  `ROUND_LOCKED` error (visible to the player, so a laggy final move is *known* to have failed
  rather than silently ambiguous). The authoritative final position is whatever the server had
  at lock, echoed back to the client in the lock confirmation broadcast. Replayed anchor
  messages fail on round-id mismatch and per-session sequence numbers (idempotency).

### 1.3 Eliminated by Design: Mid-Round Action Attacks

The Crash-era model's most delicate surface — the cash-out message, with its replay, staleness,
latency-fairness, and timing-race concerns — **does not exist in Landfall.** There are no
player actions between lock and settlement. Nothing to replay, no reaction-time inequality to
compensate, no "my cash-out was in flight when it crashed" dispute class. This is a structural
security *and* fairness win of the mechanic itself and one of the reasons it was selected
([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)§3).

### 1.4 Packet Modification

- Unchanged in substance: every inbound message is Zod-validated against schemas from
  `packages/core`, reject-by-default. No message field carries outcome information the server
  would honor — a tampered packet can only produce a rejected message or a different (still
  valid, still the player's own) anchor position.

### 1.5 Session Hijacking

- Unchanged from the previous review: `httpOnly`/`Secure`/`SameSite=Strict` session pattern
  reserved for the future auth phase; sessions bound to server-side records; WS upgrade
  validated at handshake.

### 1.6 XSS

- Unchanged: React JSX escaping, no `dangerouslySetInnerHTML` for user content (lint-enforced),
  and Zod length/charset validation at the API boundary for display names and chat messages —
  reject before store/broadcast, not sanitize on render. Chat-specific threats: §1.13-1.15.

### 1.7 CSRF

- Unchanged: `Origin`/`Referer` validation on state-changing REST endpoints and on the WS
  handshake; `SameSite=Strict` cookies once auth exists.

### 1.8 Timing Attacks

- **Scenario:** measuring response-time differences to extract secret state — classically, the
  pre-reveal seed.
- **Mitigation:** constant-time comparison (`crypto.timingSafeEqual`) for any secret-derived
  check; and structurally, the server performs **no seed-dependent branching during a round**:
  the struck zone is computed once at lock (or lazily at reveal — implementation's choice), and
  no code path observable to clients (message handling, broadcast cadence, storm-path delivery
  timing) reads it before `RESOLVED`. The storm-path animation is delivered as a complete
  scripted sequence at the start of `LOCKED_STORM`, not streamed tick-by-tick from
  outcome-aware code.

### 1.9 Outcome Steering by the Operator (new, Landfall-specific)

- **Scenario:** the subtle one a pari-mutuel game must answer: the *house is a participant*
  (seed stakes), so could the operator steer outcomes toward rounds it profits from — e.g.
  adjust its seed placement after seeing the crowd, delay a whale's anchor to change the pools,
  or pick which rounds to run?
- **Mitigation, layered:** (a) the draw takes only `(seed, roundId)` — pools, participants, and
  timing are not inputs, and the simulation suite enforces this at the API level
  ([simulation-methodology.md](../03-math/simulation-methodology.md)§3, check 2); (b) house
  seeds are a fixed, published constant per room, identical across zones, stated in the round
  header *before* the anchor window — there is no per-round seed-placement discretion at all;
  (c) the seed chain is pre-committed for the whole season, so the operator cannot select
  favorable seeds between rounds ([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§1.1);
  (d) economically, the house take is `r/K × handle` in expectation **regardless of pool
  shape** ([mathematical-model.md](../03-math/mathematical-model.md)§3), so the operator has no
  financial incentive from crowd manipulation in the first place — the design removes the
  motive as well as the means. Residual risk: the operator *could* still censor (drop) a
  specific player's anchor message; this is visible to the affected player (their anchor
  confirmation never arrives) and does not change the draw — documented as detectable-but-
  possible, with the audit log (§1.11) as the recourse trail.

### 1.10 SQL Injection

- Unchanged: Drizzle parameterized queries throughout; raw interpolated SQL forbidden in
  `packages/server`.

### 1.11 Logging

- Every anchor, re-anchor, lock snapshot, draw, and settlement line item is logged with
  server timestamps — sufficient to reconstruct any round independently of the provably-fair
  path. The pool snapshot at lock is part of the round's public record (players need it to
  verify their own payout arithmetic —
  [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§4). Logs must
  **never** contain a chain seed before its official reveal.

### 1.12 Pool-Display Integrity (new, Landfall-specific)

- **Scenario:** players make their one decision based on the live pool bars. A compromised or
  malicious server could show *different pool states to different players* (lure victims onto a
  crowded zone by rendering it empty), or a MITM could rewrite pool broadcasts.
- **Mitigation:** (a) transport integrity via TLS/WSS in any non-local deployment; (b) the
  **lock snapshot is canonical and published**: at lock, the server broadcasts the full
  per-zone pool composition, and settlement arithmetic is verifiable against exactly that
  snapshot — a server that lied during the window is caught at settlement by anyone comparing
  their displayed pools to the snapshot their payout was computed from; (c) honest limitation,
  stated: *live* (pre-lock) bars are trust-on-display in the MVP — cryptographic real-time pool
  attestation (e.g. signed incremental updates) is disproportionate for a local educational
  build and is noted as future hardening. The draw's independence from pools (§1.9) bounds the
  damage: display manipulation could tilt *which players* win, never the house's take or the
  strike.

### 1.13 Chat: System-Message & Identity Spoofing

- Unchanged in substance from the previous review: server-only `SYSTEM_MESSAGE` type rendered
  in a style player messages cannot produce (client branches on server-assigned type, not
  content); reserved-word display-name validation ("system", "admin", "harbormaster", …)
  rejected at registration; no links in chat. Salvage-feed entries are system messages and thus
  unspoofable.

### 1.14 Chat: Spam / Flood

- Unchanged: per-session token bucket (~1 msg/2s, small burst), separate budget from gameplay
  messages, server-rejected with visible cooldown notice; escalating temporary chat cooldown on
  repeat violations.

### 1.15 Chat: Abusive Content

- Unchanged: server-side word-list filter, **reject-not-mask**, immediate "message not sent"
  notice; advanced moderation (dashboards, ML, bans) explicitly out of MVP scope.

### 1.16 Bots, Automation & Rate Limiting

- **Scenario:** scripted play — e.g. a bot that always re-anchors to the smallest pool in the
  final 200ms.
- **v1 analysis:** exact live bars plus free re-anchoring make last-instant minority-seeking the
  obvious strategy. A bot cannot beat the house (edge is pool-shape-invariant), but it can
  extract value from slower players. That is an ecosystem-fairness problem even when solvency is
  safe.
- **v1 mitigations:** human-scale rate limits on re-anchor frequency (e.g. max ~1
  re-anchor/500ms, generous for humans, capping bot advantage) and per-IP session caps against
  multi-account swarms.
- **v2 mitigation (implemented):** the category redesign moves anti-bot defense into the
  product rules: Public Tide Reports remove exact live telemetry, Blind Fog Lock makes final
  decisions simultaneous, Final Order limits remove micro-spam, and post-lock snapshots keep
  fairness verifiable. See [category-redesign-v2.md](../02-game-design/category-redesign-v2.md)§8.
  Random lock-jitter is superseded by Blind Fog Lock as the primary defense — the game should
  not depend on hidden timing tricks to protect humans — and remains only a documented
  escalation option.

### 1.17 DDoS

- Unchanged: Cloudflare-inherited protection post-migration; local connection caps for the MVP.

### 1.18 Input Validation (General)

- Unchanged: every boundary-crossing message validated against shared Zod schemas from
  `packages/core`; reject-by-default.

### 1.19 Secure Random Generation

- Unchanged hard rule: no `Math.random()` anywhere outcome-adjacent; CSPRNG only; lint-enforced
  once code exists. Chain construction rules:
  [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§1.1.

### 1.20 Settlement Integrity & Replay

- **Scenario:** a crash or retry mid-settlement double-pays survivors or double-debits the
  struck; or a client replays a settlement-affecting message.
- **Mitigation:** settlement is a single idempotent transaction keyed by `roundId` — all
  debits, credits, and the rake line commit atomically; re-running settlement for an
  already-settled `roundId` is a no-op by constraint (unique key on round settlement), not by
  convention. The per-round conservation invariant (`payouts + rake = handle`,
  [mathematical-model.md](../03-math/mathematical-model.md)§8) is asserted *at runtime* on
  every settlement, not only in tests — a violated invariant aborts the transaction and pages
  the operator rather than persisting corrupt money state. Clients send no settlement messages
  at all (settlement is entirely server-initiated), so there is nothing to replay from the
  client side.

### 1.21 Fog-Boundary Disputes → Signed Action Receipts (remediation B1)

- **Threat:** a player claims "my order was in before the fog lock and the server dropped it"
  (or the mirror: an operator backdates/denies an order). Without evidence, both are
  he-said/she-said — fatal for a licensed product.
- **Control:** every accepted **and** rejected anchor / fleet order / cancel is issued an
  HMAC-SHA256 receipt (`receipts.ts`): roundId, monotonic per-round sequence, playerId, action
  hash, server timestamp, and `msBeforeLock` relative to the anchor-lock boundary. Receipts are
  echoed in the ACK/ERROR frame, persisted in `action_receipts`, and rendered in the Verify
  sheet's order history. The signing key (`server_secrets`) is separate from the fairness chain
  terminal. HMAC is symmetric — players cannot self-verify, but any stored receipt is decidable
  by ops/regulator against the persisted key, and the signature binds the operator.
- **Tested:** `packages/server/test/receipts.test.ts` drives a real coordinator across the lock
  boundary (accept at T−10ms with receipt, reject at T+10ms with signed rejection) and asserts
  persistence, monotonic sequencing, signature validity, and tamper detection.

### 1.22 Tide-Band Probing → Hysteresis (remediation B2)

- **Threat:** band-edge binary search. A min-stake account nudges its anchor up/down and
  watches the public tide band flip, extracting the exact hidden pool total that the banded
  report exists to hide (which would resurrect the exact-pool sniping meta).
- **Control:** band boundaries carry hysteresis (`core/src/tide.ts`): a published band changes
  only after the underlying ratio crosses the threshold by ±10% of the adjacent band's width.
  The flip point therefore depends on approach direction, and no probe sequence can localize a
  pool tighter than the margin (band-scale, ≈5% of the average pool) — plus the existing
  report cadence floor. The `seed` band stays exact (it is a factual "no player anchors here",
  not a magnitude).
- **Tested:** `core/test/tide.test.ts` runs a binary-searching prober against a hidden pool and
  asserts the residual uncertainty stays band-scale and the naive threshold estimate is wrong
  by ~the margin.

### 1.23 Storm Reserve Accounting (remediation A3)

- **Exposure:** the Storm Power ladder v2 pays M>1 bonuses from a reserve; a silent clamp or
  unledgered draw would be an integrity breach.
- **Control:** per-round `storm_reserve_ledger` rows (inflow = reserve share of rake, outflow =
  `salvageTotal − distributable`, running balance) written inside the settlement transaction;
  the per-round liability cap (`STORM_POWER_MAX_PAYOUT_MULTIPLE`) is **published** in the round
  result (`powerCapped`) and recomputable from the public lock snapshot; the conservation
  assert covers capped rounds exactly.

### 1.24 Bots Policy (remediation C5) — one paragraph, zero exceptions

Practice bots exist **only** in demo environments, by construction: `botsAllowed` is a
per-room config flag that is hard-false unless the server process runs with
`LANDFALL_ENV=demo`; a room config requesting bots in any other environment is a **startup
crash** (`rooms.ts`), and constructing a `BotManager` against a bots-forbidden room throws.
Bot players are marked `is_bot` in the DB, their stakes are marked in the public lock
snapshot, and they are excluded from Golden Anchor eligibility even in demo (core
`pickGoldenAnchor`/`pickGoldenAnchorFlat`), so demo odds match production semantics — where
bots do not exist at all. There is no override, no warning mode, and no "just for launch"
path (Do-Not list). Tested: `packages/server/test/rooms.test.ts`.

### 1.25 Syndicate Detection Baseline → Telemetry + Offline Scan (remediation B3)

- **Threat:** a syndicate running N accounts holds N private pool observations and N fog
  orders per round; scripted accounts react with machine regularity; coordinated flag
  bluffs shape the crowd; min-stake churn probes the pools. None of these is provable from
  a single round — the pattern lives across rounds and accounts.
- **Control:** every ACCEPTED round action writes a behavioral telemetry row
  (`action_telemetry`: playerId, action, ms-into-phase, zone, stake, fog membership,
  min-stake marker — rejected actions are already covered by §1.21 receipts). The offline
  scan (`packages/server/scripts/collusion-scan.ts`, pure detectors in `src/collusion.ts`)
  ranks accounts by four signals: sub-human first-order timing variance, pairwise same-zone
  fog-order correlation in tight windows, coordinated same-zone flag/move divergence, and
  repeated min-stake probe churn. Output is a ranked suspicion report with per-detector
  evidence. **No auto-bans** — evidence for ops review only.
- **Tested:** `packages/server/test/collusion.test.ts` generates a deterministic 5-account
  synthetic syndicate amid 15 human-jittered normal accounts; the syndicate fills the top
  five ranks with ≥2× score separation, and each detector attributes to the right members.

## 2. Summary Table: Threat → Owning Layer

| Threat | Primary owning layer |
|---|---|
| Stake manipulation | `server` (RoundCoordinator + repository transaction) |
| Lock-boundary races / anchor replay | `server` (server clock, sequence numbers, lock echo) |
| Mid-round action attacks | **eliminated by mechanic design** (no mid-round actions exist) |
| Packet modification | `core` (Zod schemas) enforced at `server` boundary |
| Session hijacking | `server` (future auth layer) |
| XSS | `web` (React escaping) + `core` (Zod constraints) |
| CSRF | `server` (origin checks, cookie policy) |
| Timing attacks | `server` (constant-time compares; no pre-reveal seed-dependent branching) |
| Operator outcome-steering | `core` (draw API takes no pool input) + RNG chain pre-commitment + economics (edge invariant to pools) |
| SQL injection | `server` (Drizzle parameterization) |
| Logging discipline | `server` |
| Pool-display integrity | `server` (canonical lock snapshot) + transport (TLS/WSS); live-bar attestation = future hardening |
| Chat spoofing | `server` (message-type separation) + `web` (render by type) |
| Chat spam/flood | `server` (`ChatService` token bucket) |
| Abusive chat content | `server` (`ChatService` word-list, reject-not-mask) |
| Bots/automation | product rules (Tide Reports, Blind Fog Lock, one Final Order — §1.16) + `server` (re-anchor rate caps, session caps); lock-jitter superseded, escalation only |
| DDoS | Cloudflare platform (future) / `server` connection caps (local) |
| Input validation | `core` (schemas) at `server` and `web` boundaries |
| Secure random generation | `core` (RNG module) |
| Settlement integrity | `server` (idempotent atomic settlement + runtime conservation assert) |
| Fog-boundary disputes | `server` (signed action receipts — §1.21) |
| Tide-band probing | `server` + `core` (band hysteresis — §1.22) |
| Storm Reserve accounting | `server` (ledger inside settlement txn) + `core` (published cap — §1.23) |
| Multi-account collusion / syndicates | `server` telemetry + offline ranked scan for ops (`collusion-scan` — §1.25) |

Mapping is consistent with the module boundaries in
[software-architecture.md](../04-architecture/software-architecture.md)§2.
