# Remediation Decisions Log

One line per deviation or judgment call made while executing the remediation program
(README.md at repo root). Precedence order applied: Identity Freeze (§2) → program document →
existing docs → existing code.

| # | Phase/Task | Decision | Why |
|---|---|---|---|
| 1 | R0/A2 | "≥×2 on roughly 1 round in 10" relaxed to "storm bonus (M>1) on ~1 in 11.3, ×2+ on ~1 in 131, via a ×1.25 Category 2". | Mathematically infeasible as written: the funding invariant (which the task itself declares as the invariant replacing E[M]=1) caps E[M−1] at `0.25×0.12/0.88 = 3/88 ≈ 0.0341`, while P(M≥2)=0.1 alone forces E[M−1] ≥ 0.1. Max feasible P(M≥2) is ~1 in 29 with zero tail. The invariant (bankroll protection, the panel's core A-workstream complaint) wins; the *felt* bonus frequency the constraint was after ("felt frequency of storm bonus") is delivered at ~1 in 11 by Category 2 ×1.25, keeping the funded ×100/×500 tail. |
| 2 | R0/A2 | Perfect Storm kept at nominal ×500 with count 1 in 2²⁰ (~1 per 1.05M rounds), rather than a fatter ×200 tier. | A2 allows "×200–×500 nominal given A3's cap"; ×500 preserves the marketable dream while A3's 25×-handle clamp bounds the real liability. Budget slack after all tiers: 61 units in 2²⁰ space. |
| 3 | R0/A3 | Reserve may go negative on an early big storm (house backstops); ledger records it rather than blocking the payout. | Blocking or shrinking a disclosed payout at settle time would be a worse integrity breach than a temporary reserve deficit; expected drift is positive (funding invariant with 99.8% utilization) so the fund self-heals. Insolvency policy documented in G2. |
| 4 | R0/A1 | Rounding dust from the rake split (floor on surge and reserve shares) accrues to the house share. | Deterministic, ≤2 minor units per round, and keeps `houseRake + surge + reserve === rakeMinor` exact in integer math. |
| 5 | R0/A1 | Rounds table now records `rake_bp`, `max_payout_multiple`, `power_capped` at settlement. | Verification of historic rounds must use the economy config in force *then*, not the live one; /api/round serves these with a fallback to the live config for legacy rows. |
| 6 | R0 | Portable Node.js v22.23.1 (official nodejs.org zip) installed to `C:\Users\gtsulaia\tools\` — no system-wide install. | The machine had no Node toolchain; the program mandates a green suite after every task. Zip distribution avoids admin rights and system changes. |
| 7 | R0/A3 | `settleRound` clamp floor: the cap never cuts below `distributable` (the ×1 pari-mutuel base). | Identity Freeze §2.2/§2.6 — survivors' pari-mutuel share is inviolate; the cap only limits the *reserve-funded bonus*. |
