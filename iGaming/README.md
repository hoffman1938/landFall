# ⛯ LANDFALL

**A provably-fair, pari-mutuel multiplayer instant game.** Drop your anchor at one of six
harbors. The storm wrecks one. Everyone else splits the wrecked harbor's cargo.

Local/educational build — virtual credits only, no real money, no cloud dependencies.

## Quick Start (macOS)

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

Each ~20-second round: a 10s **anchor window** (pick a harbor, re-anchor freely, watch the live
pool bars), 5s **storm approach** (locked; the storm feints across the map), **landfall** (one
harbor is struck — its stakes are lost; survivors keep their stake plus a pro-rata share of the
struck pool minus a 6% rake), 3s cooldown, repeat. The house anchors a fixed 50.00-credit seed
on every harbor for liquidity. Strike odds are exactly 1/6 per harbor — *crowding never changes
where the storm hits, only what surviving pays* — and every round is verifiable in one click
(🛡 button in the Wreck Log).

Full design/math/security documentation lives in [`docs/`](docs) — start with
[docs/06-spec/technical-specification.md](docs/06-spec/technical-specification.md).
The category-competitive v2 redesign requested after the MVP is documented in
[docs/02-game-design/category-redesign-v2.md](docs/02-game-design/category-redesign-v2.md):
Public Tide Reports, Blind Fog Lock, Focus/Split fleet orders, signal flags, anti-bot
information design, and spectator/replay systems while preserving six harbors, one struck
harbor, pari-mutuel settlement, provably fair RNG, PvP competition, and fixed 20-second rounds.

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
