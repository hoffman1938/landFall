# Mechanic Comparison: Crash vs. Mines vs. Plinko vs. Limbo

> **⚠ SUPERSEDED — retained as reference, not as the current decision.**
> This document compared *existing* instant-game mechanics and selected Crash, under the
> original brief ("build a game that competes with Aviator-likes"). The brief has since changed:
> the studio must **invent a new mechanic**, not adopt any existing one (Crash, Aviator, Mines,
> Limbo, Dice, Plinko, Hi-Lo, Wheel, slots are all off-limits). The current decision process is
> [concept-generation.md](concept-generation.md) → [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md)
> (winner: **Landfall**). This document now serves two purposes: (1) the historical record of
> the earlier decision, and (2) the reference map of banned mechanics used for resemblance
> checks — its analysis of *why* each existing mechanic works remains accurate and useful.

**Prepared by:** Lead Game Designer & Gambling Mathematician (joint deliverable)
**Phase:** 2 — Brainstorm Mechanics (original run; superseded by the rerun in
[concept-generation.md](concept-generation.md))
**Depends on:** [market-research.md](../01-research/market-research.md)

---

## 1. Evaluation Criteria

Per the master brief, the chosen mechanic must satisfy:

1. **One-button gameplay** with a **learning curve under 10 seconds** — anyone should
   understand the entire round just by watching one play through.
2. **Genuine multiplayer/social fit** — the brief explicitly calls for a "multiplayer browser
   instant game," which we interpret strictly: a *shared, synchronous* experience, not merely
   private rounds executing on shared server infrastructure.
3. **Mathematical/RNG showcase value** — how well the mechanic demonstrates the provably-fair
   verification system in an understandable, high-stakes-feeling way.
4. **Build effort for an MVP** — engineering cost to reach a polished, testable first version.
5. **Differentiation potential** — per the brief's instruction to challenge weak ideas, not
   just clone Aviator: does the mechanic leave room for genuine product differentiation?

## 2. Comparison Table

| Criterion | Crash | Mines | Plinko | Limbo |
|---|---|---|---|---|
| One-button / <10s learning curve | Yes — one action ("cash out"), explainable in one sentence | Yes, but N sequential grid decisions per round add cognitive load | Yes — single drop action | Yes — but closer to a form submission (enter a number) than a game |
| Genuine multiplayer/social fit | **Strong** — shared round timer, everyone watches the same live multiplier, other players' cash-outs visible in real time | Weak — round state is private per player; "shared infra" ≠ "shared experience" | Weak — each drop is independent and resolves instantly; no shared temporal event | Weakest — resolves instantly, nothing to watch together |
| RNG/math showcase value | **Strong** — continuous crash-point distribution derived from an inverse-CDF over house edge; the "cash out now vs. wait" tension makes live verification meaningful | Moderate — rich combinatorics (reveal without replacement) but static, no live tension | Simple — physics/bucket probability, RNG is almost incidental to the peg-bounce visual | Simple — single float draw, least interesting RNG story |
| Build effort for MVP | Moderate — needs a real-time round loop/broadcast; PixiJS animating a curve is a well-trodden pattern | Low-moderate — turn-based grid, simpler state machine, no strict real-time broadcast requirement | Low — physics engine or deterministic bucket math + falling-ball animation | Lowest — essentially a slider/number input with an animation flourish |
| Differentiation potential | Good — can differentiate via social layer (live multiplayer bus, spectator cash-out feed, side bets on other players) without touching the proven core mechanic | Limited — grid games mostly differentiate via skins/themes | Limited — differentiates mainly via board layout/visual theme | Very limited — almost no room to differentiate; it is intentionally the simplest possible game |

## 3. Narrative Analysis

**Crash** wins on the criterion the brief weights most heavily and most explicitly: genuine
multiplayer fit. The other three mechanics are all, structurally, single-player rounds — the
fact that a server can host many of them concurrently does not make the *experience* shared.
Crash is the only mechanic where every player in a round is looking at the same clock, the same
climbing number, and the same live decisions from other participants. That shared tension is
also what makes provably-fair verification narratively meaningful: because the crash point must
be committed to *before* anyone bets and revealed *after* the round resolves, and because players
are making live, time-pressured decisions against it, the question "could the house have changed
this after seeing our bets?" has real weight — far more than it would for a Mines grid that
resolves privately, or a Limbo draw that resolves instantly.

**Mines** is the credible runner-up: it has real per-round decision-making (arguably more
"skill-adjacent" moment-to-moment than Crash's single cash-out decision) and solid combinatorial
math, at lower build cost. It is documented as the explicit Plan B in
[chosen-mechanic-rationale.md](chosen-mechanic-rationale.md).

**Plinko** and **Limbo** are both rejected as primary mechanics for this project: Plinko's
appeal is almost entirely visual/physics-driven rather than mathematical or social, and Limbo is
arguably not different enough from a raw number generator to satisfy "game design" in any
meaningful sense. Both remain candidates for a *future additional game mode* once the core
platform (round infrastructure, wallet, provably-fair pipeline, social layer) exists and can be
reused, since the brief's roadmap explicitly anticipates "additional game modes" later.

## 4. Weighted Scoring (for transparency, not as the sole justification)

Using a simple 1-5 scale per criterion, equally weighted:

| Mechanic | One-button/<10s | Multiplayer fit | RNG showcase | Build effort (5=lowest effort) | Differentiation | Total |
|---|---|---|---|---|---|---|
| Crash | 4 | 5 | 5 | 3 | 4 | **21** |
| Mines | 3 | 2 | 4 | 4 | 2 | 15 |
| Plinko | 5 | 2 | 2 | 4 | 2 | 15 |
| Limbo | 5 | 1 | 2 | 5 | 1 | 14 |

Crash is the clear top score, driven primarily by the multiplayer-fit and RNG-showcase
criteria — exactly the two dimensions the master brief cares most about (a genuinely
multiplayer game, and a provably-fair system worth building well).

## 5. Decision

**Crash is selected as the flagship mechanic.** Full rationale, differentiation strategy, and
Plan B documentation: [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md).

**Historical note:** the Crash selection above was subsequently superseded in full — first
softened (original theme "Ember" instead of an Aviator skin), then replaced outright when the
mandate changed to "invent a new mechanic, copy nothing." The current game is **Landfall**
([chosen-mechanic-rationale.md](chosen-mechanic-rationale.md)), which is deliberately *not* any
of the four mechanics compared in this document. The scoring table above remains valid as an
analysis of the existing genre.
