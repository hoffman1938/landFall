# Technical Specification — LANDFALL

**Prepared by:** Documentation Team, synthesizing all studio deliverables
**Phase:** 7 (rerun) — Technical Specification
**Depends on:** every document referenced below; this spec synthesizes and links rather than
restates. **Revision note:** fully rewritten for Landfall after the mandate changed from
"original game like Aviator" to "new category — copy no existing instant-game mechanic."

---

## 1. Vision

Define a new category of instant game rather than enter an existing one. **LANDFALL** is a
positional-survivor, pari-mutuel multiplayer game — *drop your anchor at one of six harbors;
the storm wrecks one; everyone else splits the wrecked harbor's cargo* — built as a
local-first, open-source, educational engineering exercise to production-quality standards.
Its category claim: the first instant game whose payout function takes **other players'
choices** as input, making it multiplayer by mathematical construction, not by presentation
([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)§2-3;
ideation record: [concept-generation.md](../02-game-design/concept-generation.md)).

## 2. Goals

- Ship a working local MVP of Landfall with full provably-fair verification and core chat.
- Keep the codebase architected for a no-rewrite migration to Cloudflare's free tier
  ([software-architecture.md](../04-architecture/software-architecture.md)§4 — unchanged by the
  mechanic pivot, which validated the module seams).
- Maximize shared logic with future React Native/Expo mobile apps via the dependency-free
  `core` package.
- Documentation, math rigor, and security review precede gameplay code — phase discipline
  unchanged.

## 3. Gameplay

One decision (which harbor), fixed ~20s rounds, pari-mutuel survivor settlement, live visible
crowd. Full ruleset and fiction:
[game-design-document.md](../02-game-design/game-design-document.md).

**v2 product target:** the first runnable build intentionally shipped the cleanest version of
the mechanic. The category-competitive redesign keeps the same core invariants but replaces
exact live pool telemetry and unlimited final-second re-anchoring with Public Tide Reports,
Blind Fog Lock, Final Orders, Focus/Split Fleet Orders, Signal Flags, stake-band privacy, and
replay/spectacle systems. See
[category-redesign-v2.md](../02-game-design/category-redesign-v2.md). Treat that document as
the product target for future gameplay work; treat this section's "one decision" wording as
the v1 MVP description.

## 4. Core Loop & Game States

`ANCHOR_OPEN → LOCKED_STORM → RESOLVED → COOLDOWN` (fixed total duration ≈ 20s — a scheduling
advantage over Crash's variable-length rounds). State machine and invariants:
[game-design-document.md](../02-game-design/game-design-document.md)§4; message-level sequence:
[software-architecture.md](../04-architecture/software-architecture.md)§3.

## 5. UI

Harbor-map layout, live pool bars, Harbor Chat rail, Wreck Log, verification modal, responsive
breakpoints, dark-default theming:
[wireframes-and-user-flow.md](../07-ux/wireframes-and-user-flow.md).

## 6. Animations

PixiJS owns the map canvas (pool bars, storm approach with scripted feints, landfall impact,
beacon-amber salvage FX); Motion owns DOM chrome (modals, toasts, chat transitions); plain CSS
for simple cases. The storm animation is deterministic theater derived from the committed seed —
verifiable, zero outcome influence
([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§5).

## 7. Audio

**Implemented — fully procedural (Web Audio API), zero external assets and therefore zero
third-party licenses.** The four-cue identity set from
[game-design-document.md](../02-game-design/game-design-document.md)§0.3 (foghorn / rising wind
/ thunderclap / harbor bell) plus surge call, Golden Anchor fanfare, countdown ticks, anchor
splash, loss thud, and a sparse D-minor-pentatonic ambient theme. Psychology rationale and the
responsible-design exclusion list (no losses-disguised-as-wins, bright timbres reserved for
wins only): [audio-design.md](../08-audio/audio-design.md). If produced audio is ever sourced
later, the Pixabay/Freesound/OpenGameArt CC0-with-register rule applies.

## 8. Networking

REST (Hono) for history/settings/verification data; one WebSocket per client multiplexing
`ROUND_*`, `POOL_UPDATE`, `CHAT_*`, and `SYSTEM_MESSAGE` frames, behind the `RealtimeTransport`
interface (Durable Objects swap later). Landfall's traffic profile is *lighter* than Crash's:
no per-tick multiplier stream — pool updates during the anchor window (coalesced, e.g. ≥10/s
cap), one lock snapshot, one scripted storm path, one settlement broadcast.
Full sequence: [software-architecture.md](../04-architecture/software-architecture.md)§3.

## 9. Database

Unchanged decisions: SQLite locally via Drizzle behind a repository interface → Cloudflare D1
by driver swap. New schema emphasis for Landfall: the **lock snapshot** (canonical per-zone
pools) and per-stake settlement lines are first-class records, since payout verification is
arithmetic over that public snapshot
([rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md)§4).

## 10. Security

Threat model rewritten for the anchor→lock→draw→settle flow:
[security-review.md](../05-security/security-review.md). Highlights: the mid-round-action
attack class is **eliminated by design** (no player actions after lock); two Landfall-specific
surfaces added and mitigated (operator outcome-steering §1.9, pool-display integrity §1.12);
settlement is idempotent-atomic with a runtime conservation assert (§1.20).

## 11. RNG / Provably Fair

Pre-committed SHA-256 hash chain + per-round HMAC → uniform zone draw; per-player client seeds
were **removed with documented reasoning** (they don't compose with one shared outcome per
round): [rng-provably-fair-spec.md](../04-architecture/rng-provably-fair-spec.md). Math:
[mathematical-model.md](../03-math/mathematical-model.md) — house edge exactly `r/K` (1%) of
handle, invariant to crowd shape; zero payout liability (pure redistribution); per-player EV
formula with validated crowd dynamics.

## 12. Mathematical Honesty Requirements (player-facing copy rules)

Three statements must appear in fairness documentation, verbatim in substance
([mathematical-model.md](../03-math/mathematical-model.md)§4, §6):

1. *The storm never follows the money* — strike probability is exactly 1/6 per harbor,
   independent of pools; the verification tool proves it per round.
2. *The 1% edge is exact for balanced crowds; very small rounds tilt slightly further
   houseward* (solo-vs-seeds ≈ −1.6% at reference parameters) because your own stake
   concentrates your zone.
3. *Crowd-reading skill redistributes EV between players, never against the house* — Landfall
   is a fixed-edge game with a zero-sum skill layer, unlike fixed-odds games where skill is
   illusory.

## 13. Performance

Targets unchanged (first load < 2s, 60 FPS, 120Hz-ready, fast reconnect — reconnection is
simpler than Crash since a rejoining client needs only the current round header, pool state,
and chat tail, with no mid-round position to reconstruct). Validation in Phases 13-14 via
Lighthouse and profiling.

## 14. Final Technology Stack

**Unchanged by the pivot** — the full decision table (React+Vite+TS, PixiJS, TanStack
Router/Query, Zustand, RHF+Zod, Tailwind+shadcn/ui+Radix+Lucide, Motion, Hono (tRPC rejected),
WebSocket behind `RealtimeTransport`, Drizzle+SQLite→D1 (Prisma rejected), pnpm workspaces
(Nx/Turbo rejected), Vitest/Testing Library/Playwright/MSW/Storybook/Lighthouse,
ESLint+Prettier+Husky+lint-staged, Docker Compose, React Native+Expo for future mobile (Flutter
rejected)) — is maintained in [dependency-inventory.md](../dependency-inventory.md) and
[software-architecture.md](../04-architecture/software-architecture.md). That a full mechanic
replacement required zero stack changes is recorded as evidence the choices were
mechanic-agnostic platform decisions.

## 15. Multiplayer Architecture & Scalability

- **Room = harbor map = one `RoundCoordinator` instance** (in-memory now, one Durable Object
  per room later — the natural scaling unit is unchanged).
- Pool updates are coalesced broadcasts; rounds are fixed-length, so room scheduling is
  metronomic (every ~20s), simplifying capacity planning versus variable-length Crash rounds.
- **Scalability roadmap:** single local room → multiple named rooms (one process) → Cloudflare
  Workers + one DO per room → room tiers (stake bands; future `(K, r)` variants) → scheduled
  live events ("Storm Season": elevated house seeds, tournament wrappers per
  [concept-generation.md](../02-game-design/concept-generation.md)#76) → second title on the
  same platform (Impact, Plan C — reuses wallet, chain, settlement engine, chat wholesale).

## 16. Deployment

Unchanged path: local Docker Compose → GitHub → Cloudflare Pages → Workers → D1 → Durable
Objects ([software-architecture.md](../04-architecture/software-architecture.md)§4). Docs-only
phase: nothing deployed.

## 17. Testing

Stack per §14; Landfall-specific validation suite fully specified in
[simulation-methodology.md](../03-math/simulation-methodology.md): draw uniformity (χ²), draw
independence from pools (API-level), edge convergence under four pool scenarios, per-player EV
formula check, **exact per-round conservation**, rounding-policy enforcement
(largest-remainder, no house dust), hash-chain integrity. Playwright multi-client E2E remains
essential (a pari-mutuel round *requires* multiple simulated clients to test at all).

## 18. Analytics

Unchanged posture: future roadmap only, no unnecessary personal data. Landfall adds natural
aggregate (non-personal) metrics when that phase arrives: pool-balance entropy per round,
re-anchor frequency, herding index — useful for balancing `h` and lock-jitter decisions.

## 19. Monetization Strategy (mandate deliverable — principles only)

This educational build uses **virtual credits with no cash value, no purchases, no deposits.**
For any hypothetical future commercial descendant, the documented posture is: revenue from the
transparent, published rake (`r/K` of handle — the same number the fairness docs disclose), and
optionally **cosmetics only** (harbor themes, boat skins, chat flair) — explicitly excluding:
loot boxes, pay-for-odds anything (structurally impossible here: the draw takes no inputs money
could influence), credit sales that blur virtual/real value, and dark-pattern retention
mechanics. Operator-specific implementations are out of scope by mandate. Responsible-gambling
tooling (limits, reality checks, self-exclusion) is a precondition of any real-money context,
per the compliance placeholder in [market-research.md](../01-research/market-research.md)§4.

## 20. Branding (mandate deliverable — summary; detail in GDD §0.3)

Name **LANDFALL** (working title, trademark clearance pending); lighthouse-beam icon; navy/storm
palette with beacon amber reserved for payout moments; four ownable audio cues; tagline
candidate: *"Weather it together."* All assets free/royalty-free per the unchanged Art/Audio
constraints; no copyrighted material.

## 21. Roadmap

**Phase 9 (next):** repo scaffold per
[software-architecture.md](../04-architecture/software-architecture.md)§6 (unchanged), then
README/API docs/deployment/onboarding guides. **Phases 10-16:** Database → API → Frontend →
Backend → Testing → Optimization → Deployment → Mobile, never skipped. **Post-MVP:** PWA,
iOS/Android (RN/Expo), localization, accessibility beyond baseline, leaderboards, Oracle
side-market ([concept-generation.md](../02-game-design/concept-generation.md)#81), team
harbors/live events, tournament wrappers, replay/spectator modes, second title (Impact),
Undertow if population supports it, emoji reactions, advanced chat moderation.

**Category-redesign roadmap (new priority track):** before additional games, prioritize the
LANDFALL v2 upgrades in
[category-redesign-v2.md](../02-game-design/category-redesign-v2.md)§12: P0 design lock and
instrumentation; P1 Public Tide Reports + Blind Fog Lock + Final Order receipts; P2
Focus/Split Fleet Orders, Signal Flags, stake-band privacy, and Harbor Compass; P3 Weather
Patterns, Wreck Wake Replay, Clip Cards, and enhanced storm choreography; P4 stake-tier rooms,
whale guardrails, cosmetics, and spectator mode.

## 22. Risks

- **Liquidity dependence** (the crowd is the content): mitigated by analyzed house seeding
  ([mathematical-model.md](../03-math/mathematical-model.md)§6) and honest solo-round pricing
  disclosure; residual risk accepted — the game is best with a crowd and says so.
- **No jackpot fantasy** (bounded per-round upside): accepted trade
  ([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)§4); "storm
  surge" progressive side pool documented as a future option, not MVP.
- **Wheel-resemblance perception risk**: the mechanic is structurally distinct (survivorship +
  pari-mutuel + live crowd), but marketing/onboarding must lead with the crowd dynamics or
  casual observers may file it as "reverse roulette" — the resemblance-check table
  ([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)§2) is the
  canonical answer.
- **Bot pressure on the re-anchor meta**: bounded by design (can't beat the house, only other
  players) and by rate caps; lock-jitter documented as an escalation option
  ([security-review.md](../05-security/security-review.md)§1.16).
- **v1 exact-information exploitability**: the current live-pool design creates a simple
  final-second strategy and a bot-friendly EV surface. The v2 mitigation is product-level:
  delayed/banded Public Tide Reports, Blind Fog Lock, one Final Order, and post-lock canonical
  verification
  ([category-redesign-v2.md](../02-game-design/category-redesign-v2.md)§8).
- **Scope creep** into social features beyond GDD §5 / non-goals §7: unchanged mitigation.

## 23. Open Questions

- Min/max stake; whether max stake should cap as a fraction of live handle (anti-whale lever
  unique to pari-mutuel — needs a balancing pass at scaffold time).
- House-seed sizing policy as real population grows
  ([mathematical-model.md](../03-math/mathematical-model.md)§9).
- Final name/trademark clearance for "LANDFALL" (Product/Legal, pre-release).
- Lock-jitter: adopt at MVP or hold as escalation? (Currently: hold —
  [security-review.md](../05-security/security-review.md)§1.16.)
- Biome vs. ESLint+Prettier at scaffold time (carried over, still open).
