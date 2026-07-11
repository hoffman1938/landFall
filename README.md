# LANDFALL — Production Remediation Program (Master Prompt)

You are an AI engineering team turning LANDFALL from an excellent reference build into a
provider-grade casino product. This document is your complete mandate. It encodes every
decision from the pre-launch design review panel (CPO, Creative Director, UX Research, UI
Design, Game Economy, Casino Math, Behavioral Psychology, Casino Operator, Provider CEO,
Competitive Intelligence). Do not re-litigate the panel's decisions; implement them.

**The business goal:** LANDFALL will be licensed to casino operators worldwide by a game
provider (Spribe-model). Every task below exists because it moves the product toward
"operators want to buy it, regulators can approve it, players trust it, syndicates cannot
farm it, and the house cannot be bankrupted by its own math."

---

## 0. How to Use This Document

- Work is organized into **Workstreams A–H**, each split into numbered tasks.
- Execute in the **sequencing order of §12** — tasks have dependencies.
- Every task lists: **Why** (the panel finding), **What** (the change), **Where** (files),
  **Done when** (acceptance criteria). Do not mark a task complete until every criterion holds.
- After every task: the full test suite in `iGaming/packages/core/test` must pass, plus any
  new tests the task requires. **Never leave the tree red between tasks.**
- Docs are part of the product. Any change to math, protocol, or fairness **must update the
  corresponding doc in the same change** (see §11, Workstream G). Stale docs are a defect.
- If a task conflicts with something you discover in code, the **Identity Freeze (§2) wins,
  then this document, then existing docs, then existing code.** Record every deviation you
  make in `iGaming/docs/09-remediation/decisions-log.md` (create it) with one line of why.

## 1. Ground Truth — Repo Map

```
iGaming/
  packages/core/src/constants.ts    ← all tunables: RAKE, ladder, surge, stakes, timings
  packages/core/src/settlement.ts   ← pari-mutuel settlement, Golden Anchor, conservation assert
  packages/core/src/rng.ts          ← hash chain, HMAC draw, digest spans
  packages/core/src/verify.ts       ← client-side provably-fair recomputation
  packages/core/src/messages.ts     ← the entire wire protocol
  packages/core/test/               ← rng, settlement, storm-power, surge tests
  packages/server/src/coordinator.ts← authoritative round state machine (fog, tide, lock, settle)
  packages/server/src/hub.ts        ← websocket hub
  packages/server/src/bots.ts       ← LOCAL practice bots (LANDFALL_BOTS=0 disables)
  packages/server/src/db/schema.ts  ← SQLite via drizzle: players, rounds, stakes, surge
  packages/web/src/store.ts         ← zustand store, wire handling, fmt()
  packages/web/src/components/ControlDeck.tsx ← bottom deck (stake, presets, mode, primary button)
  packages/web/src/components/{StormClock,ResultBanner,RulesModal,VerifyModal,SecondaryPanel,...}.tsx
  packages/web/src/pixi/BayScene.ts ← bay world: fog, storm, wreck, cargo-transfer cinematic
  docs/02-game-design/  docs/03-math/  docs/04-architecture/  docs/05-security/  docs/07-ux/
```

Current key values (you will change several): `RAKE = 0.06` on struck pool (→ 1% hold, ~0.5%
after Surge), `SURGE_RAKE_SHARE = 0.5`, `MAX_STAKE_MINOR = 5_000_00` (GDD says 2,000 — drift),
Storm Power ladder floor `×0.5` at ~70% probability with uncapped `×500` tail, ControlDeck
presets `10/50/200/.../5000`, default stake `25.00` (`store.ts:316`), primary button morphs
into red CANCEL BET after anchoring.

## 2. Identity Freeze — Never Change These

1. Six harbors; exactly one struck per round; strike probability **uniform 1/6, never
   influenced by pools, timing, or players**.
2. Pari-mutuel settlement: struck pool (minus disclosed take) funds survivors pro-rata.
3. Provably fair: every outcome-relevant draw derives from the pre-committed seed chain;
   every new random mechanic gets a **documented, disjoint digest span** in
   `docs/04-architecture/rng-provably-fair-spec.md` and a recomputation path in `verify.ts`
   and `VerifyModal.tsx`.
4. Fixed ~20-second rounds; no mid-round player actions during `LOCKED_STORM`/`RESOLVED`.
5. Blind Fog Lock, banded Tide Reports, one Final Order, Focus/Split, Signal Flags —
   the v2 information design stays. **Never reintroduce exact live pools** or any live
   EV oracle, and never publish global totals in per-player ACKs.
6. All money in integer minor units. The conservation assert in `settlement.ts` may be
   extended, **never weakened or bypassed**.
7. Beacon amber is payout-only, across UI, motion, and audio.
8. Loss presentation stays short, honest, never shamed, never win-styled.
9. No pay-for-information, pay-for-priority, or pay-for-odds monetization. Ever.

## 3. Global Engineering Laws

- TypeScript strict; match the existing code style and comment density (constants carry the
  math rationale in comments — keep that tradition).
- Every tunable lives once in `packages/core/src/constants.ts` and is server-overridable by
  env/room config where the task says so.
- New DB tables via drizzle in `db/schema.ts`; settlement stays a single atomic transaction.
- New wire messages go in `messages.ts` with doc updates; never break existing message shapes
  without versioning the protocol.
- Accessibility law (from the UX spec, now enforced): interactive text ≥ 16px equivalents,
  touch targets ≥ 44px (48px preferred), every state encoded color + shape + icon (+ motion),
  `prefers-reduced-motion` respected.
- No new runtime dependencies without recording the reason in the decisions log.

## 4. Agent Roster

Spawn/assign these roles. One agent may hold several roles, but boundaries are hard:

| Agent | Owns | Must not touch |
|---|---|---|
| **R1 Program Architect** | Sequencing (§12), decisions log, doc-code consistency, final gates (§13) | Direct gameplay math edits |
| **R2 Economy & Math** | Workstream A: rake, ladder, reserve, surge math, simulations | UI, protocol |
| **R3 Core Engine** | `settlement.ts`, `rng.ts`, `verify.ts`, core tests | Server ops, UI |
| **R4 Server & Protocol** | Workstreams B, C, F server-side: coordinator, receipts, rooms, telemetry, RG | Ladder/rake values (consumes R2's constants) |
| **R5 Frontend UX** | Workstream D, E client-side: deck, disclosure, band indicator, accessibility | Settlement math, wire protocol shapes (requests via R4) |
| **R6 Security & Anti-Collusion** | Workstream B analysis/review: probing, syndicate detection design, red-team pass | Shipping features without R4 review |
| **R7 Compliance & Docs** | Workstream G: regulatory pack, policy docs, player-facing copy, doc sync | Code |
| **R8 QA & Verification** | Workstream H: test matrix, sim CI, release gates; blocks any phase exit | Feature code (tests only) |

Handoffs: R2 → R3 (constants → settlement), R3 → R4 (core API → coordinator), R4 → R5
(protocol → UI), everything → R7 (docs) → R8 (gate). R1 arbitrates conflicts using §2.

---

## 5. Workstream A — Economics & Storm Power (P0)

> Panel verdict: 1% hold (≈0.5% after Surge) is unsellable to operators; the ×0.5 Storm
> Power floor poisons the modal round and makes the house visibly keep ~53% of the wreck on
> 70% of rounds; the ×500 tail is an uncapped bankroll landmine (one Perfect Storm per room
> per ~11.6 days at 24/7 play).

### A1 — Rake restructure
**What:** In `constants.ts`: `RAKE = 0.12` (struck pool) → base hold 2% of handle. Introduce
`RAKE_SPLIT = { house: 0.5, surge: 0.25, stormReserve: 0.25 }` (fractions of rake; replaces
`SURGE_RAKE_SHARE`). Net operator hold ≈ 1.0% + reserve underflow retention; player-facing
RTP ≈ 98%. Make `RAKE` and `RAKE_SPLIT` overridable per room via server env/room config with
validation (rake ∈ [0.06, 0.20], split sums to 1).
**Where:** `constants.ts`, `coordinator.ts` (rake application + surge pot funding),
`db/schema.ts` if surge state changes, `RulesModal.tsx` copy, docs §G4.
**Done when:** settlement tests updated and green; a new unit test asserts hold = RAKE/6 of
handle in expectation on simulated rounds; survivors still receive `(1−RAKE)` = 88% of the
struck pool pass-through; verify modal recomputes payouts with the new rake.

### A2 — Storm Power ladder v2 (floor ×1, funded tail)
**What:** Replace `STORM_POWER_LADDER`. Constraints for R2 to solve exactly (integer counts
in 2^20 space, rational multipliers `mNum/mDen`):
- Minimum multiplier **×1** — a survivor's salvage is never reduced. Delete ×0.5.
- ≥ ×2 on roughly 1 round in 10 (felt frequency of "storm bonus").
- Top tier ≥ ×100 (the marketable dream survives; ×200–×500 nominal allowed given A3's cap).
- New invariant replacing E[M]=1: **expected ladder overpayment is funded by the reserve** —
  `E[M−1] × E[distributable] ≤ stormReserve share of expected rake` (compute with
  E[P_struck] = T/6, distributable = (1−RAKE)·P_struck). Encode this as an exact-arithmetic
  unit test replacing the current E[M]=1 assertion in `core/test/storm-power.test.ts`.
- Tier labels: keep hurricane categories ascending with M (Category 1 is now ×1 — a weak
  storm leaves salvage untouched; thematically cleaner than halving it).
**Where:** `constants.ts`, `core/test/storm-power.test.ts`, `verify.ts` (tier recompute),
`RulesModal.tsx`, math-model doc §10 rewrite.
**Done when:** the funding-invariant test passes with exact integers; no tier < ×1 exists
anywhere in code or copy; verification recomputes tiers from the same digest span [35,40).

### A3 — Storm Reserve ledger + per-round liability cap
**What:** New server-side reserve: funded each round with `rake × RAKE_SPLIT.stormReserve`;
every M>1 settlement draws `(M−1) × distributable` from it. Add
`STORM_POWER_MAX_PAYOUT_MULTIPLE` (default 25 — max total salvage = 25 × round handle,
operator-configurable): if `salvageTotal` would exceed the cap, clamp it and roll the
overflow intent into the reserve (publish the clamp in the round result — honesty over
silence). Persist a reserve ledger table (roundId, inflow, outflow, balance) for audit.
`settleRound()` gains an optional `maxSalvageMinor` param; `houseDeltaMinor` semantics keep
the conservation assert exact.
**Where:** `settlement.ts`, `coordinator.ts`, `db/schema.ts`, `messages.ts` (result carries
`powerCapped: boolean`), `VerifyModal.tsx`, security-review doc.
**Done when:** simulated 10M rounds show reserve balance drift ≈ 0 with A2's ladder; a
Perfect-Storm-on-whale-pool test proves payout is clamped and conservation holds; reserve
ledger reconciles to the credit against every settled round.

### A4 — Surge funding + optics
**What:** Surge pot now funded from `RAKE_SPLIT.surge` (A1). Keep `SURGE_MIN_POT_MINOR`
floor re-seed. Add (P2, behind a flag): every Nth surge round is a **flat-odds** Golden
Anchor (equal chance per surviving player, not stake-weighted) — announced in the round
header like surge itself — so small stakes visibly win pots sometimes.
**Where:** `coordinator.ts`, `constants.ts`, `messages.ts` (header flag), docs.
**Done when:** surge trigger/draw remain on their existing digest spans; verification
recomputes the winner under both modes; pot accounting reconciles.

### A5 — One set of numbers everywhere
**What:** After A1–A3, exactly two player-facing figures exist: **"Survivors receive 88% of
the wrecked pool"** and **"Long-run return to players ≈ 98%"** (recompute precisely from
final constants, including surge return and reserve flows). Purge every other RTP/rake/edge
phrasing from `RulesModal.tsx`, captions, docs, and system messages. Operator-facing docs
state hold % of handle explicitly.
**Done when:** `grep -ri "99.5\|1% rake\|6%"` over `packages/web` and `docs` returns only
historical changelog references.

### A6 — Simulation revalidation
**What:** Rerun the full simulation methodology (10M+ rounds against **production**
`settleRound`/`drawZone`, not a reimplementation) with new constants; regenerate the results
tables in `docs/03-math/mathematical-model.md` §7 and simulation doc. Add the sim as a
CI-runnable script under `packages/core/scripts/` (node, no Python dependency).
**Done when:** measured hold, solo-player deviation, reserve drift, and surge return all
match theory within stated tolerances, and the doc tables show the new measured values.

---

## 6. Workstream B — Fair-Play Infrastructure (P0)

> Panel verdict: single-bot sniping is dead (good), but syndicates with N accounts hold
> private pool knowledge and N final orders; flags are free lies at scale; fog-boundary
> disputes have no receipts; band edges can be binary-searched.

### B1 — Signed action receipts
**What:** Every accepted anchor/final-order/cancel gets an HMAC-signed receipt: server
timestamp, monotonic per-round sequence, roundId, playerId, action hash. Sent in the ACK,
persisted (new table), and shown in the client (order history in the Verify sheet: "Your
fog order was received at 11.42s — 0.58s before lock"). Rejected-because-late actions get a
signed rejection with the same fields.
**Where:** `coordinator.ts`, `hub.ts`, `messages.ts`, `db/schema.ts`, `VerifyModal.tsx`.
**Done when:** a client can prove after the round exactly what the server accepted and when;
lock-boundary integration test covers accept-at-11.99s / reject-at-12.01s with receipts.

### B2 — Tide band hysteresis (anti-probing)
**What:** Band boundaries in the tide report get hysteresis (a band changes only after the
underlying pool crosses the threshold by a margin, e.g. ±10% of band width) plus a minimum
report cadence already in place. This kills min-stake binary-search probing of exact totals.
**Where:** `coordinator.ts` (report builder), constants for margins, unit test simulating a
probing account failing to localize a pool below band resolution.
**Done when:** the probing test demonstrates ≥ band-width uncertainty regardless of probe count.

### B3 — Telemetry + collusion baseline
**What:** Persist per-action telemetry (playerId, action, ms-into-phase, zone, stake). Add
an offline analysis script (`packages/server/scripts/collusion-scan.ts`) flagging: reaction
regularity impossible for humans, correlated final orders across accounts (same zone within
tight windows round after round), coordinated flag/move divergence (mass bluffs), and
repeated min-stake probing. Output: ranked suspicion report. No auto-bans — evidence for ops.
**Where:** `db/schema.ts`, `coordinator.ts` (emit), new script; security-review doc §.
**Done when:** a scripted 5-account synthetic syndicate run is flagged in the top ranks
while normal bot traffic is not.

### B4 — Signal flag friction
**What:** Flags stay free to read, no longer free to spam-lie: one flag per round (already
enforced) **plus** flags require an anchored fleet in that round ≥ a minimal stake, and a
per-account cooldown (e.g. flags usable in at most 2 of any 3 consecutive rounds). Replay
card honesty ribbon stays.
**Where:** `coordinator.ts` validation, constants, client disable-state + tooltip.
**Done when:** server rejects violating flags with a typed error; UI communicates the
cooldown without prose (dimmed flag with a small round counter).

### B5 — Handle-fraction stake caps (whale guardrail)
**What:** Reconcile the drift: `MAX_STAKE_MINOR` returns to room config. Add the
pari-mutuel-native guardrail from the docs: a single player's total round stake may not
exceed `WHALE_CAP_FRACTION` (default 25%) of the current public handle (evaluated at accept
time, house seeds included). Clear typed rejection; client pre-checks against the tide
report to avoid surprise rejects.
**Where:** `constants.ts`, `coordinator.ts`, `ControlDeck.tsx`/`store.ts` (clamp + message),
math-model §11 update.
**Done when:** integration test: a whale in a thin room is clamped; the same stake passes in
a fat room; UI shows the cap reason before the server ever rejects.

---

## 7. Workstream C — Rooms & Liquidity (P0 architecture, P1 build)

> Panel verdict: liquidity is existential. The game needs pooled cross-operator rooms; the
> strategy layer lives at ~20–300 players; bots must never touch real-money surfaces.

### C1 — Multi-room coordinator
**What:** Refactor server from one implicit global room to N rooms, each an independent
`RoundCoordinator` + config `(K, rake, rakeSplit, minStake, maxStake, whaleCapFraction,
seedMinor, timings, botsAllowed)`. Hub routes players to rooms; chat/tide/lock scoped per
room. Room list message for the client lobby (minimal lobby UI: room name, stakes, players).
**Where:** `coordinator.ts`, `hub.ts`, `main.ts`, `messages.ts`, `db/schema.ts` (roomId on
rounds/stakes), client store + a simple room switcher in `TopBar.tsx`.
**Done when:** two rooms run concurrent independent rounds against one server; all existing
tests pass scoped to a room; reconnect restores the player to their room.

### C2 — Stake-tier rooms
**What:** Ship three default tiers (Skiff / Schooner / Flagship) with min/max stakes and
whale caps set so casuals never share a room with 100× their stake. Population honesty:
rooms display real human counts.
**Done when:** tier configs live in server config, not code; B5 caps derive per tier.

### C3 — Storage abstraction
**What:** Isolate persistence behind a repository interface so SQLite (dev) can be swapped
for Postgres (production) without touching game logic. Settlement atomicity contract stays
explicit in the interface. Do **not** migrate to Postgres now; make the seam and prove it
with the existing SQLite implementation.
**Where:** `db/index.ts`, `coordinator.ts` call sites.
**Done when:** coordinator has zero direct drizzle/SQLite imports; smoke test green.

### C4 — Provider network specification (document, not code)
**What:** Write `docs/04-architecture/provider-network-spec.md`: cross-operator pooled rooms
(poker-network model), seamless-wallet operator API (bet/win/rollback, idempotency keys),
per-operator session tokens, jurisdiction/room eligibility matrix, latency budget for the
fog boundary, data-protection posture for cross-operator visibility of display names, and
the horizontal scaling design (room service instances, sticky routing, shared seed-chain
custody). This is the licensing-critical architecture; it must exist before any real-money
work is scoped.
**Done when:** R6 and R7 have both reviewed it; open questions are listed with owners.

### C5 — Bots policy enforcement
**What:** Bots become impossible outside demo mode by construction: `botsAllowed` is a room
flag, hard-false unless `LANDFALL_ENV=demo` at the server level; bot players are marked in
DB and excluded from Surge eligibility (already excluded via `isHouseSeed`? — verify: bots
are **not** house seeds; make bot exclusion from Golden Anchor an explicit tested rule in
demo too, so demo odds match production semantics). Any real-money room with a bot present
must be a startup crash, not a warning.
**Where:** `bots.ts`, `coordinator.ts`, `settlement.ts` callers, tests.
**Done when:** the crash-on-misconfig test exists; docs state the policy in one paragraph.

---

## 8. Workstream D — Client UX (P0)

> Panel verdict: the primary button is a trap; the shipped deck violates the project's own
> 60+ accessibility law; presets contradict the casual funnel; players get no payout
> magnitude signal; the novice sees the full expert surface on round one.

### D1 — Primary button state machine fix (the trap)
**What:** In `ControlDeck.tsx`, after a fleet is placed the primary button becomes a calm
**confirmed** state: `ANCHORED — {cove} · {stake}` (non-destructive; pressing it does
nothing or opens fleet summary). Cancel lives **only** on the small ✕ button, which gets a
confirm-affordance during Blind Fog ("this uses your one fog order — hold to confirm").
RESTAKE becomes its own explicit secondary button that appears when the stepper differs from
the placed stake — it never replaces the primary's meaning. The primary's physical position
and size never change within a phase.
**Done when:** a state-machine table in the component comment enumerates every
(phase × fleet × fog × order) → button state; no destructive action is ever the visually
dominant control; an interaction test (or storybook-style state dump) covers all states.

### D2 — Accessibility pass (the 60+ mandate)
**What:** Deck and overlays: interactive text ≥ 14px minimum with primary labels ≥ 16px
(current 10–11px labels are non-compliant), touch targets ≥ 44px (mode toggle currently
36px, preset chips 28px), focus states visible, `aria` roles kept. Re-verify color+shape+icon
redundancy for every state color. Do not densify back later.
**Done when:** an audit table in the PR lists every interactive element with its final
size; nothing interactive is below 44px or 14px.

### D3 — Presets, defaults, ceilings
**What:** `PRESETS = [1, 2, 5, 10, 25, 50, 100, 500]` (minor units ×100); default stake
`5_00` (store.ts). Demo bots' stake table scaled down (or per-tier) so a 1–5 credit human is
visible in the pools of the entry tier. Max stake comes from room tier (C2), not a global.
**Done when:** first-session flow places a small default stake in a room where it is
visually meaningful.

### D4 — Payout expectation band ("if you survive" indicator)
**What:** From the **public tide report only** (bands everyone sees — no privileged data,
no bot edge), compute and show near the stake module during ANCHOR_OPEN:
`If another cove is hit: ≈ +8–15% · if the heaviest cove is hit: up to ≈ +40%` — band
arithmetic: for cove j struck, survivor share ≈ (1−RAKE) × P_j_band × S / (T_band −
P_j_band), at Storm Power ×1 with a "storm can multiply" glyph. Freezes with the tide report
in fog. Range formatting, tabular nums, never implies a guarantee.
**Where:** `store.ts` (derive from tideReport), `ControlDeck.tsx` or a small strip above the
deck; copy through R7.
**Done when:** the shown range matches hand-computed band arithmetic in a unit test; the
indicator visibly freezes when the report freezes.

### D5 — Progressive deck (novice → expert)
**What:** Implement the UX doc §6.3 disclosure schedule for the deck itself: first session
shows **stake stepper + presets + primary button only**; Focus/Split unlocks after 3
completed rounds (or tapping the dimmed toggle), flags after 5 rounds or first rival flag
seen, ×2/½/MAX behind the existing row once stake is first edited. Persist progress in
localStorage; "expert deck" toggle in settings shows everything immediately.
**Done when:** a fresh profile sees ≤ 3 control groups; the unlock triggers fire per
schedule; returning experts are never re-gated.

### D6 — Fog & weather comprehension
**What:** Heavy Fog rounds (fog starts 1s earlier) must not read as a broken timer: the
Storm Clock shows the fog segment sized per this round's weather from the header, and the
weather chip gets one localized ≤ 6-word caption on first encounter per pattern.
**Done when:** the clock's fog arc matches the actual `fogStartsAt` for all four weather
patterns (integration-tested against server timings).

### D7 — Missions: remove or gate
**What:** Missions shipped in `SecondaryPanel.tsx` without design/RG review. Remove the
missions tab from the product. If retained later, it re-enters through the five-question
feature gate and an RG review (Workstream G) — not before.
**Done when:** no mission UI or mission state remains in the client or schema (or it is
flag-gated off by default with the flag documented as compliance-pending).

---

## 9. Workstream E — Retention & Social (P1)

### E1 — Skipper Record (cosmetic reputation)
**What:** Per-player, cosmetic-only, odds-irrelevant record: survival streak (current/best),
bluffs called (flag ≠ final order, discovered at reveal), biggest salvage, rounds sailed,
Surge wins. Shown on tap of a name in chat/crew lists and on own profile. No XP, no
progression rewards, no wagering incentives — identity, not Skinner box.
**Where:** `db/schema.ts`, coordinator emits, `messages.ts`, small client profile card.
**Done when:** the record survives reconnects; nothing in it modifies gameplay or odds.

### E2 — Replay/Clip card completion
**What:** Finish the Wreck Wake Replay per the category-redesign spec: post-round card with
net fog movement arrows, struck cove value, biggest salvage, flag honesty reveals, and a
share/save-as-image action (canvas render — no external service). The Wreck Log becomes a
stack of these cards (last ~20).
**Done when:** every round produces a card from the lock snapshot + event log only (no
private data); the exported image contains no player-exact stakes below the privacy rules.

### E3 — First-loss trust moment
**What:** Keep and verify the existing pattern: first loss ≥ 10× min stake makes the verify
stamp glow once. Confirm implemented; if not, implement per UX doc §6.3.

---

## 10. Workstream F — Responsible Gambling (P1; hard-required before real money)

### F1 — Player limits & reality checks
**What:** Per-player, self-set: loss limit per session/day, stake-per-round cap, session
reality check (every N minutes: net position + elapsed time, dismissible, calm styling —
never amber). Server-enforced (not client cosmetics): anchors rejected past a limit with a
supportive, non-shaming message. Defaults off; setting a limit requires no friction,
raising a limit takes a 24h cooldown (industry standard).
**Where:** `db/schema.ts`, `coordinator.ts` accept path, settings UI, `messages.ts`.
**Done when:** limits survive reconnect; the raise-cooldown is server-enforced; copy
reviewed by R7.

### F2 — Self-exclusion + session hygiene stubs
**What:** Self-exclusion (demo-grade: lockout timer per player), and a visible session clock
in settings. Document the production mapping (GamStop-style integrations) in the compliance
pack rather than mocking it.

---

## 11. Workstream G — Compliance & Documentation (parallel, R7)

### G1 — Regulatory classification pack
`docs/10-compliance/regulatory-classification.md`: analysis framework of pari-mutuel/pool
betting vs RNG-game licensing per target market class (UK, MGA, Curaçao, LatAm, Ontario…),
the progressive-jackpot (Surge) fund requirements, chat obligations, and the cross-operator
pooling questions from C4. Written as a brief for real counsel — questions and exposure map,
not legal conclusions.

### G2 — Jackpot & reserve fund policy
`docs/10-compliance/jackpot-reserve-policy.md`: Surge pot and Storm Reserve custody,
funding rates (from A1/A3 constants), caps, rollover, insolvency behavior, and audit trail
(the ledgers from A3). Public player-facing summary paragraph included.

### G3 — Chat moderation policy
`docs/10-compliance/chat-moderation.md`: real-money moderation staffing model, escalation,
report tooling requirements (beyond MVP word-list), grooming/collusion channel risks (link
B3), retention of chat logs.

### G4 — Doc-code sync sweep
After A–D land: rewrite math-model §1/§3/§9/§10 (new rake, split, ladder, reserve, caps),
GDD §3 (stake ceilings per tier, flag friction), category-redesign §12 status table,
security-review (receipts, telemetry, probing defense), UX doc §12.1 conformance. Kill the
"feed their pattern superstitions" phrasing in GDD §5.4 — describe the Wreck Log as history
players expect, paired with verification. Every number quoted in any doc must trace to
`constants.ts`.

## 12. Sequencing

```
Phase R0  A1 A2 A3          (economy core — everything else consumes these constants)
Phase R1  A4 A5 A6 · B1 B2  (fairness infra + numbers, sim revalidation gate)
Phase R2  D1 D2 D3 D4       (client P0 — shippable UX safety)
Phase R3  C1 C2 C3 C5 · B4 B5 (rooms, guardrails)
Phase R4  D5 D6 D7 · B3     (disclosure, telemetry)
Phase R5  E1 E2 E3 · F1 F2  (retention + RG)
Phase R6  C4 · G1–G4        (network spec + compliance pack; G4 requires all code landed)
```
R8 gates every phase exit (§13). Docs tasks in G may start anytime; G4 is last.

## 13. Release Gates (R8 enforces; no gate, no phase exit)

1. **Green suite:** all `packages/core/test` + new server/client tests pass.
2. **Conservation:** the assert holds across a fuzz run (10k random rounds incl. caps,
   splits, surges, degenerate pools).
3. **Simulation:** A6 sims match theory (hold, reserve drift ≈ 0, surge return) — rerun
   whenever any Workstream A constant changes.
4. **Verification completeness:** everything random (strike, power, surge, weather,
   choreography) recomputes in `VerifyModal` from the revealed seed for the new mechanics.
5. **Red team (R6):** probing test (B2), synthetic syndicate flagged (B3), no ACK leaks
   global totals, receipts cover the lock boundary.
6. **Grandmother protocol (from the UX doc §12):** 5 participants 55+, non-gamers, one
   spectated + three played rounds; ≥ 4/5 answer unprompted: where am I betting, can I still
   change, what happened, why did money move. Run after Phase R2 and again after R4.
7. **Copy audit:** exactly two player-facing economy numbers (A5) everywhere.
8. **Decisions log** current; docs sweep (G4) merged before calling the program done.

## 14. Do-Not List (fast failure modes)

- Do not reintroduce exact live pool telemetry, per-player differential feedback, or any
  live EV/win-probability meter.
- Do not add insurance side-bets, paid information, priority orders, or odds-affecting
  cosmetics.
- Do not "fix" the ladder by hiding it — every mechanic stays verifiable and disclosed.
- Do not let bots into non-demo rooms, ever, for any reason, including "just for launch."
- Do not weaken the conservation assert, skip it in tests, or catch-and-continue around it.
- Do not ship a destructive action as the dominant control in any phase.
- Do not change phase timings, K, or the uniform draw as a tuning shortcut.
- Do not leave a doc contradicting a constant. If you change a number, you change its docs.

---

*Program context: this remediation implements the unanimous pre-launch review verdict —
the mechanic is original and worth building an empire on; the blockers are economics,
syndicate defense, liquidity architecture, UX safety, and compliance. Execute in order,
verify everything, and keep the identity frozen.*
