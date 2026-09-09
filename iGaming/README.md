# ⛯ LANDFALL

**A provably-fair, pari-mutuel multiplayer instant game.** Drop your anchor at one of six
harbors. The storm wrecks one. Everyone else splits the wrecked harbor's cargo.

Local/educational build — virtual credits only, no real money, no cloud dependencies.

## Quick Start (macOS / Windows / Linux)

Requirements: Node ≥ 22, pnpm ≥ 9 (`npm i -g pnpm`).

```bash
pnpm install
pnpm dev
```

Then open **http://localhost:5173**. Open it in two browser windows (one normal, one private)
to play against yourself — Landfall's payouts depend on where *other* players anchor, so it's
best experienced with company.

- Game server: `http://localhost:8787` (REST) + `ws://localhost:8787/ws` (realtime), SQLite at
  `packages/server/data/landfall.db`.
- Web app: Vite dev server on `:5173`, proxying `/api` and `/ws` to the server.

## How the Game Works

Each ~20-second round: a 10s **anchor window** (anchor Focus on one harbor or Split 70/30
across two, fly one signal flag, and read the banded **Tide Reports** — exact pools are never
shown live; the final ~3s are **Blind Fog**, where public movement freezes and each fleet gets
one hidden Final Order), 5s **storm approach** (locked; the lock snapshot publishes exact
pools and the storm feints across the map), **landfall** (one harbor is struck — its stakes
are lost; survivors keep their stake plus a pro-rata share of the struck pool, scaled by the
round's Storm Power; survivors receive 88% of the wrecked pool), 3s replay card, repeat. The house seeds every harbor for liquidity, but ADAPTIVELY: it tops a quiet table up to the
room's liquidity floor and withdraws to a token seed once real players carry the room, so the
pools stay genuinely uneven instead of being averaged flat by house money
(`packages/core/src/liquidity.ts`, math-model §6). Strike odds are exactly 1/6 per harbor — *crowding never changes
where the storm hits, only what surviving pays* — and every round is verifiable in one click
(🛡 button in the Wreck Log).

## Tables

A table (a "room") is a self-contained game: its own round loop, its own six harbors, its own
pools, chat and jackpot. Rounds in different tables are simultaneous and independent — nothing
crosses between them except your balance, your responsible-gambling limits and the seed chain
that proves every table's draws. What separates one table from the next is its **stake tier**,
and tiers exist so a casual is never in the same pool as someone betting a hundred times their
stake. Tier configs are server config, not code:
[`packages/server/config/rooms.json`](packages/server/config/rooms.json).

| Table | Your bet per round | Bots (demo) |
|---|---|---|
| Skiff Harbor | 1 – 50 credits | 14 |
| Schooner Bay | 5 – 500 | 14 |
| Flagship Sound | 50 – 5,000 | 12 |
| Galleon Roads | 500 – 50,000 | 10 |
| Leviathan Deep | 5,000 – 500,000 | 8 |

Each tier steps ×10 from the one below and spans exactly 100×, so the ladder overlaps: a player
outgrowing one table is already comfortable at the next. Two limits sit above the tier maximum
and are usually the ones you actually feel — your balance, and the **25% round-share cap**: no
single player may hold more than a quarter of a round's total handle, so the live maximum on a
quiet table is lower than the table maximum. The house tops a thin table up to that tier's
liquidity floor and withdraws as real players arrive, so an expensive table is never literally
empty. Every floor is sized so the round-share cap still admits the table's own minimum bet.

Players with no table preference are seated in the **busiest table they can afford** — splitting
a small population evenly across five tiers would produce five dead tables instead of one live
one. You can switch at the entry gate or from the top bar; switching refunds any live order.

Practice bots fill every table in demo builds so a solo player can see real crowd dynamics.
They are demo-only **by construction**: `botsAllowed` is hard-false unless the server runs with
`LANDFALL_ENV=demo`, and a config asking for bots anywhere else is a startup crash, never a
warning. Bots are marked in the DB and in every public lock snapshot, are excluded from the
jackpot, and are never counted as players in the lobby. Their bankroll scales with the tier —
a Leviathan bot funded like a Skiff bot would be broke on its first bet. `LANDFALL_BOTS=<n>`
overrides the head-count for every table; `LANDFALL_BOTS=0` turns them off.

Full design/math/security documentation lives in [`docs/`](docs) — start with
[docs/06-spec/technical-specification.md](docs/06-spec/technical-specification.md).
The category-competitive v2 redesign requested after the MVP is documented in
[docs/02-game-design/category-redesign-v2.md](docs/02-game-design/category-redesign-v2.md):
Public Tide Reports, Blind Fog Lock, Focus/Split fleet orders, signal flags, anti-bot
information design, and spectator/replay systems while preserving six harbors, one struck
harbor, pari-mutuel settlement, provably fair RNG, PvP competition, and fixed 20-second rounds.
The follow-up presentation-layer redesign (UX/UI/art/motion/audio, mechanics untouched) is
specified in [docs/07-ux/ux-redesign-v2.md](docs/07-ux/ux-redesign-v2.md) — "One Bay, One
Storm". The UX-simplification and player-friendly-terminology pass (plain trilingual
vocabulary, actionable Place Bet primary, beginner/casual/expert modes) is specified in
[docs/07-ux/ux-simplification-v3.md](docs/07-ux/ux-simplification-v3.md) — "Plain Words, One
Button".

## Workspace Layout

```
packages/
├── core/     # shared: draw (hash chain + HMAC), pari-mutuel settlement, Zod schemas,
│             # verification — zero DOM/Node deps, imported by server AND browser
├── server/   # Hono REST + ws hub + RoundCoordinator + Drizzle/SQLite
└── web/      # React + Vite + Tailwind + Zustand + PixiJS harbor map
```

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run server + web together (the normal way to play) |
| `pnpm test` | All test suites (core: chain/draw uniformity/settlement conservation) |
| `pnpm typecheck` | Strict TypeScript across all packages |
| `pnpm lint` | ESLint (flat config, type-aware) across all packages |
| `LANDFALL_FAST=1 pnpm --filter @landfall/server dev` | Fast rounds (~6s) for testing |
| `pnpm --filter @landfall/server exec tsx scripts/smoke.ts` | Two-client integration test against a running fast server |

## Provable Fairness (short version)

A season of 10,000 round seeds is pre-committed as a SHA-256 hash chain; the chain head is
printed at server start and shown in the verify modal. Each round's outcome is
`HMAC-SHA256(seed, "landfall:round:{id}")` → uniform zone. The seed is revealed at landfall and
anyone can recheck: the chain link, the draw, and their exact payout from the published lock
snapshot. The draw function takes no pool/participant input — the storm cannot chase the money.
Details: [docs/04-architecture/rng-provably-fair-spec.md](docs/04-architecture/rng-provably-fair-spec.md).

## Roadmap

Cloudflare migration (Pages → Workers → D1 → Durable Objects) is pre-planned with interface
seams already in place — see
[docs/04-architecture/software-architecture.md](docs/04-architecture/software-architecture.md) §4.
Known deferrals from this first runnable build: drizzle-kit migrations (schema bootstraps in
code for now), ESLint config, Playwright E2E, Docker Compose, shadcn/ui + TanStack
Router/Query (single-screen MVP didn't need them yet — tracked in
[docs/dependency-inventory.md](docs/dependency-inventory.md)).
