# Dependency Inventory

**Prepared by:** DevOps Engineer / Software Architect (jointly maintained)
**Status:** Living document — seeded now from the stack decisions made during Phases 1-8, even
though nothing is installed yet (no code exists in this iteration). Update this table at the
actual `pnpm add` time in Phase 9+ with real pinned versions.

Full rationale/tradeoffs for each choice: [technical-specification.md](06-spec/technical-specification.md)§14
and [software-architecture.md](04-architecture/software-architecture.md).

| Dependency | Package(s) using it | Why needed | License | Alternatives considered |
|---|---|---|---|---|
| React | `web` | UI rendering, component model shared conceptually with future React Native app | MIT | Vue, Svelte (less code-sharing synergy with React Native) |
| Vite | `web` | Fast dev server/HMR, build tool | MIT | Webpack, Parcel (slower dev loop) |
| TypeScript | all packages | Strict typing across the whole stack per code-standards requirement | Apache-2.0 | — (non-negotiable per master brief) |
| PixiJS | `web` | WebGL-accelerated canvas for the harbor map (live pool bars, storm animation, payout FX) | MIT | Phaser 3 (rejected — full game framework, overkill for one scene) |
| TanStack Router | `web` | Type-safe routing | MIT | React Router |
| TanStack Query | `web` | Server-state caching/retry/dedup | MIT | Manual fetch/useEffect |
| Zustand | `web` | Minimal global client state (session/wallet/UI) | MIT | Redux Toolkit (rejected — unnecessary ceremony) |
| React Hook Form | `web` | Form state/validation for bet/settings inputs | MIT | Formik |
| Zod | `core`, `web`, `server` | Single validation schema source of truth, shared client/server | MIT | Valibot (lighter, reconsider later if bundle size matters) |
| Tailwind CSS | `web` | Utility-first styling, fast iteration | MIT | — |
| shadcn/ui | `web` | Accessible, copy-in components (no runtime lock-in) | MIT | MUI, Chakra (rejected — heavier runtime) |
| Radix UI | `web` (via shadcn) | Accessible primitives underlying shadcn components | MIT | — |
| Motion (Framer Motion) | `web` | DOM/React chrome animation (modals, toasts, HUD transitions) | MIT | CSS-only (used for simple cases instead, to avoid overuse) |
| Lucide Icons | `web` | Icon set, shadcn's default, tree-shakeable | ISC | Heroicons |
| Hono | `server` | HTTP routing + WS upgrade; same code runs on Node now and Cloudflare Workers later | MIT | Express/Fastify (rejected — no Workers runtime support without heavy shims); plain Node http (rejected — real rewrite needed later) |
| Drizzle ORM | `server` | SQLite locally, first-class Cloudflare D1 support later, parameterized queries (SQLi mitigation) | Apache-2.0 | Prisma (rejected — Workers/D1 support still preview/WASM-blocked); Kysely (less migration-tooling maturity) |
| better-sqlite3 (or equivalent) | `server` | Local SQLite driver for Drizzle | MIT | node:sqlite (consider once stable) |
| ws | `server` | WebSocket implementation for local dev, behind `RealtimeTransport` interface | MIT | native Node http upgrade handling (more boilerplate) |
| Vitest | all packages | Unit testing, Vite-native config reuse | MIT | Jest (rejected — slower, more ESM/Vite config friction) |
| @testing-library/react | `web` | Component testing, behavior-focused | MIT | Enzyme (rejected — unmaintained) |
| Playwright | root/E2E | Cross-browser E2E, strong multi-tab/multi-client support (useful for multiplayer round testing) | Apache-2.0 | Cypress (rejected — weaker multi-client support) |
| MSW (Mock Service Worker) | `web` tests | Mock REST responses for frontend-independent development/testing | MIT | Manual fetch mocks |
| Storybook | `web` (HUD components only) | Isolated component development/review, scoped to reusable chrome | MIT | — |
| Lighthouse | CI (future) | Performance/accessibility auditing | Apache-2.0 | WebPageTest (unnecessary for this scope) |
| ESLint | all packages | Lint/hygiene baseline | MIT | Biome (viable alternative, left open for scaffold-time reconsideration) |
| Prettier | all packages | Formatting baseline | MIT | Biome (same note as above) |
| Husky | root | Git hook management for pre-commit checks | MIT | — |
| lint-staged | root | Run lint/format only on staged files | MIT | — |
| pnpm | root (package manager) | Workspace support, disk-efficient installs | MIT | npm, yarn (less efficient workspace handling) |
| Docker / Docker Compose | root (`docker/`) | Reproducible local dev orchestration | Apache-2.0 (Docker Engine) | — |
| React Native + Expo | `mobile` (future, not created this iteration) | Shares `core` TypeScript package unmodified; Expo removes native-build complexity | MIT | Flutter (rejected — Dart rewrite/bridge would break shared-core strategy) |

## Chat Feature — No New Dependency Added

Harbor Chat (a core MVP feature — see
[game-design-document.md](02-game-design/game-design-document.md)§5.1) deliberately does **not**
introduce a new dependency:

- **Word-list content filter:** implemented as a small, maintained word list + regex match in
  `packages/core`, not a third-party moderation SaaS/library — the MVP's reject-and-notify
  approach (see [security-review.md](05-security/security-review.md)§1.15) doesn't need ML-based
  classification, and pulling in an external moderation service would be a real dependency and
  data-flow decision (sending player text to a third party) that this local-first, no-paid-APIs
  project explicitly avoids per its own constraints.
- **Chat rate limiting:** implemented as a small in-memory token-bucket in `packages/server`
  (the same pattern used for gameplay-action rate limiting, per
  [security-review.md](05-security/security-review.md)§1.16), not a separate rate-limiting
  package — the two limiters share an implementation, not a dependency, but use independent
  budgets per §1.14.
- **Chat message schema:** a `Zod` schema in `packages/core` (already a dependency for every
  other message type), not a new validation library.

## Status After First Runnable Build (Phase 9-12 first slice)

The local MVP is running with the core stack: React 19, Vite 6, TypeScript 5 (strict), PixiJS 8,
Zustand 5, Zod 3, Tailwind 4, Hono 4, `ws` 8, Drizzle + better-sqlite3, `@noble/hashes`
(added: environment-agnostic SHA-256/HMAC for `core`, so the same draw/verification code runs
in Node and the browser — audited, zero-dep, the standard choice over hand-rolled crypto),
Vitest 3, pnpm workspaces, tsx (dev runner), concurrently (dev orchestration).

**Deliberately deferred from the first slice** (decided-for-later, not rejected): TanStack
Router/Query and React Hook Form (single-screen MVP with one WS connection had no routing or
server-cache surface yet), shadcn/ui + Radix + Motion + Lucide (hand-rolled Tailwind components
were sufficient for the first HUD; adopt when the settings/lobby surfaces grow), drizzle-kit
migrations (schema bootstraps via DDL in `packages/server/src/db/index.ts` for now), ESLint +
Husky + lint-staged (no git repo initialized yet), Playwright E2E, MSW, Storybook, Docker
Compose. Each remains on the adoption path documented above; none of the *rejections* below
changed.

## Explicitly Rejected (documented for traceability)

| Rejected | Reason |
|---|---|
| tRPC | Hono's own RPC client (`hono/client`) already provides end-to-end type safety once Hono is the backend router; adding tRPC on top duplicates that capability for no net gain |
| Nx / TurboRepo | Only 3-4 packages currently/planned; plain pnpm workspace filtering is sufficient. Revisit only if a real build-caching pain point emerges post-scaffold |
| Prisma | Cloudflare Workers/D1 support still preview-status and WASM-compilation-limited as of this research; Drizzle has first-class D1 support today |
| Phaser 3 | Full game framework (scene manager, physics, asset pipeline) — more than needed for a single embedded animated scene; PixiJS is the renderer-only fit |
| Flutter | Would require rewriting or bridging the shared `core` TypeScript package into Dart, defeating the shared-business-logic goal for future mobile |
| Next.js | SSR/server-component capabilities are not needed for a client-heavy real-time game; adds complexity with no corresponding benefit here |
| WebTransport (now) | Immature browser support relative to WebSocket's universal support; documented as a future upgrade option, not adopted now |

## Upgrade Strategy (documented now, exercised in Phase 9+)

- Pin exact versions in `package.json` (no floating `^`/`~` ranges for anything touching RNG or
  money math, to avoid an unreviewed transitive update silently changing behavior); floating
  ranges acceptable for pure dev tooling (ESLint plugins, Storybook, etc.).
- Renovate/Dependabot (free, GitHub-native) is the planned mechanism for surfacing update PRs once
  the repo exists — not configured in this iteration since there is no repo yet.
- Any dependency with no commit activity in the prior 12 months at scaffold time should be
  re-evaluated against current alternatives before being added, not just carried over from this
  document unquestioned.
