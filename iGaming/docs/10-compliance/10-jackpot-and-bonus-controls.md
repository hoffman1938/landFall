# Jackpot and Bonus Controls — Storm Surge and Storm Power

**Closes:** G9 (disclosure), G10 (controls), G11 (reserve solvency).
**Obligations:** Order 222 Annex 1 **Ch. VI Art. 17** — clear accessible jackpot rules; the jackpot
**program** and the jackpot **control software** authorized **separately**; **monthly balancing**
with discrepancies raised as incidents; **cancellation of unpaid jackpots prohibited**; merging only
into equal-or-better odds. GLI-19 **§4.13** (progressive jackpots), **§4.8** (bonuses), **§4.7.3–4.7.4**
(advertised odds and award limitations), **§2.4.2–2.4.3**, **§A.4.1**, **§A.6.5**.
**Depends on:** [03-game-classification.md](03-game-classification.md) §6,
[09-rtp-and-par-sheet.md](09-rtp-and-par-sheet.md)
**Rules version:** 3 (in force 2026-09-11)

---

## 1. Two features, two classifications

| | **Storm Surge** | **Storm Power** |
|---|---|---|
| What | A pot fed by a fixed share of the rake; one surviving stake wins it whole | A hidden category revealed at landfall that multiplies survivors' salvage |
| Georgian | **Jackpot platform** — a critical product (Law Art. 3(cc), 3(dd)); Art. 17 applies in full | Part of the game's **architecture** and **amount of winnings** (Art. 24¹.2(b),(c)) |
| GLI | **Progressive jackpot**, §4.13.1(a) — increases with credits wagered | **Bonus** (§4.8) and **mystery award** (§4.8.6) |
| Funding | `RAKE_SPLIT.surge` = 0.5% of handle | `RAKE_SPLIT.stormReserve` = 0.5% of handle, via the Storm Reserve |
| Frequency | ~1 round in 25, **announced before betting opens** | Every round has a category; `M > 1` on ~1 round in 11.3 |

---

## 2. The jackpot control software, as a separate artefact

Art. 17.1 requires **two** authorizations, not one: the **program** (b) and the **control
software** (c). While the pot arithmetic lived inline in the coordinator's settlement transaction
there was nothing identifiable to hand an auditor as the control software.

It is now **`packages/core/src/jackpot.ts`** — pure integer arithmetic over explicit inputs, with
no clock, no database and no randomness, so it can be reviewed, replayed against the ledgers and
certified on its own. Extraction was not cosmetic: it forced four behaviours that previously
existed only as consequences of the code path not doing anything to become named and tested.

| Function | Clause | What it guarantees |
|---|---|---|
| `contributeToSurge` | §4.13.6(a) | `toPot + toDiversion === contribution`, exactly. Contributions are never lost and never truncated |
| `payOutSurge` | §4.13.6(b),(d) | The winner receives the pot **to the minor unit**, and the pot returns to a **defined reset value** |
| `rollOverSurge` | **Art. 17.3** | An unpaid jackpot rolls over **untouched**. There is no function in the module that reduces a pot without paying it |
| `decommissionSurge` | **Art. 17.4** / §A.6.5(e) | A transfer into worse odds is **refused**, not silently adjusted. The refusal is the control |
| `balanceJackpot` | **Art. 17.2** | Monthly balancing, exact in integer units — no tolerance band, so a discrepancy is always a real defect |
| `assertSingleWinner` | §4.13.9 | Exactly one winner per surge round, asserted rather than asserted-in-prose |
| `applyReserveRound` | §A.4.1, §A.6.5(d) | The reserve can never go negative; a shortfall is an explicit ledgered house backstop |

Data substrate: `surge_pots` (pot + diversion), `surge_events` (every payout and rollover),
`storm_reserve_ledger` (inflow, outflow, backstop, running balance).

---

## 3. Ceiling, diversion pool and reset value (§4.13.3, §4.13.6)

§4.13.3 requires a jackpot that reaches a maximum to **remain there until it is won**, with
further contributions credited to a **diversion pool** rather than lost.

- **Ceiling** — `surgeCeilingFor(minStake)`, a pure function of the tier, so a Skiff pot cannot
  advertise a Leviathan number and the ceiling can never move (§2.4.2).
- **Diversion pool** — everything the ceiling refuses. It is **not lost**: it funds the reset value
  after the next win, **before** the house contributes anything. So holding money back at the
  ceiling costs players nothing; it comes straight back as the next pot's opening balance.
- **Reset value** — `surgeResetFor(...)`, funded from diversion first and by the house for the
  remainder. Since **rules v3 it follows the table's HANDLE**, not its minimum bet: see §3.1.

### 3.1 The reset value has to be affordable (rules v3)

The house tops the pot back up after every win, so the reset is a recurring cost of
`reset × surgeProb` per round, funded solely from the house share of the rake. It is
affordable exactly while

```
reset · surgeProb  <  split.house · (r/K) · handlePerRound      →  reset < 0.25 × handle
```

The retired value, `max(500 credits, 20 × minStake)`, ignored that. Below a 25-credit minimum
bet the flat term always won, so the per-table scaling was inert on the small tiers, and
measured over 1,200 rounds **Skiff exceeded the affordability ceiling by 8.45× and Schooner by
1.67×** — both tiers lost money on every round played (−5.46% and −0.47% of handle) and
returned over 100% to players.

`surgeResetFor` now takes a fixed fraction of what the rake share can fund
(`SURGE_RESET_BUDGET_FRACTION = 0.35`) from the same settled-handle EMA that sizes the house
seed, bounded below by the "worth 20 minimum bets" floor and above by the affordability
ceiling. **Affordability overrides the floor** — an unpayable guarantee is worse than a small
one. After the change every tier nets the operator +0.62% to +0.70% of handle and returns
99.07%–99.26% to players, with the re-seed costing a uniform ≈0.33% of handle everywhere.

The **ceiling** is deliberately not adaptive. §2.4.2 permits a jackpot ceiling to move only
upward once contributions exist; making it a pure function of the tier means it cannot move at
all, which satisfies the clause by construction.

**Balancing identity** (Art. 17.2), exact in integer minor units:

```
closing = opening + contributions + houseSeeded − paidOut
```

Any non-zero discrepancy is an incident: `/api/compliance/balancing` returns **HTTP 409** rather
than a cheerful 200, and the notification path is Art. 16.1(b).

---

## 4. Storm Power disclosure — the three failures G9 recorded, and a fourth

G9 recorded three disclosure failures. Implementing them surfaced a fourth that is not a
disclosure problem at all.

| Clause | Requirement | Position |
|---|---|---|
| **§4.7.3** | The highest advertised award must occur at least once in 100,000,000 games **unless the artwork prominently displays the actual odds** | Perfect Storm is ~**1 in 1,048,576**, roughly 95× more frequent. The actual odds are displayed for **every** tier, on a permanent game-surface control — not in a collapsed accordion |
| **§4.8.6** | A mystery award's artwork must state the **minimum and maximum** | **×1** and **×500**, rendered as a pair so neither can appear without the other |
| **§4.7.4 / §4.13.3** | A limitation on an award must be clearly explained on the theme offering it | The per-tier condition under which the round payout cap binds is a column in the table |
| **§4.4.1(k)** | An explicit statement of **what the multiplier applies to** | The multiplier applies to the **salvage share**, never to the returned bet. This is the most misread number in the game — ×500 is not 500× a player's bet |

### 4.1 The fourth: the advertised award was not winnable (§4.4.1(f))

The cap is denominated in **handle**; the multiplier it limits applies to
`distributable = (1−r)·P_struck`. Different bases, so the effective ceiling on `M` is a function of
the round's pool shape:

```
salvage = (1−r)·P_struck·M ≤ C·T   ⟺   M ≤ C / ((1−r)·P_struck/T)
```

At the previous `C = 25` that bound is **×170.5 at uniform pools**, and the cap bit on any round
whose struck harbour held more than **5.68%** of the handle. Six harbours average **16.7%** — so
the advertised ×500 was clamped in essentially every round it ever landed in and **could never be
paid at its advertised value**. Category 6 ×100 cleared uniform pools but was clamped from 28.4%
upward. The 10M-round simulation's "13 cap hits" was almost exactly its 9.5 expected Perfect
Storms: the evidence was in the published table all along.

§4.4.1(f) — *an explicitly advertised award must be winnable from a single game or series* — is
therefore a separate and objective failure, independent of the disclosure clauses.

**Resolution.** The cap is now **derived from the ladder** rather than chosen: it must pay every
advertised tier in full while the struck harbour holds up to **twice its uniform share**.

```
C ≥ (1−r)·M_max·(2/K) = 0.88 × 500 × 2/6 = 146.67  →  C = 150
```

×500 now pays in full whenever the struck harbour holds up to **34.1%** of the handle. Re-measured
at 10M rounds, cap hits fall from **13 to 1**. `unwinnableTiers()` asserts the invariant in core
and the coordinator calls it at construction, so a room config cannot ship a dishonest paytable.

---

## 5. Reserve solvency (G11, §A.4.1, §4.13.5)

The Storm Reserve funds `E[M−1]`, and its funding invariant makes `E[outflow] ≤ E[inflow]`, so it
self-sustains over any long horizon. It had no position on the **short** horizon: a big storm in
the opening rounds drew against a fund that had collected almost nothing, and the ledger recorded
a **negative balance**.

1. **Opening capitalization** — each room's reserve opens at
   `STORM_RESERVE_OPENING_MULTIPLE × F`, the worst single round the cap admits at that room's
   guaranteed table size.
2. **Never negative** — a draw beyond the fund is booked as an explicit `backstopMinor` house
   capital injection and the balance floors at zero. **The player is paid in full either way**;
   decisions-log #3's rule that a disclosed payout is never shrunk at settlement is unchanged.

**Measured obligation:** over 33.29bn credits of handle, house backstops totalled **0.0041% of
handle**. That figure — small, bounded, on a ledger — is the bankroll-adequacy statement §A.4.1
asks for. It is not zero and is not presented as zero: a fund running at 99.8% of its budget with
a heavy tail will occasionally need capital, and the design choice is to record that rather than
let the fund go negative.

**§4.13.5** (*diversion schemes shall not have infinite mathematical expectation*) is satisfied
twice: `E[M−1]` is a finite sum over a finite ladder, and the cap bounds the worst single round.
Both are asserted in `core/test/compliance.test.ts`.

---

## 6. Remaining open items

| # | Item | Clause | Owner |
|---|---|---|---|
| 1 | **§2.4.2 increment-rate deferral** — a change to the contribution rate must defer to the next win. *(The ceiling limb is closed: it is a pure function of the tier and never moves — §3.1.)* | GLI §2.4.2 | Engineering |
| 2 | Written monthly-balancing **procedure** and the incident contact matrix (the computation exists; the procedure does not) | Art. 17.2, Art. 16.1(b) | Compliance |
| 3 | **§4.15.2 jackpot disable** — indication displayed, no increment or win while disabled, identical parameters on resumption | GLI §4.15.2 | Engineering |
| 4 | Independent reconciliation of contributions and awards with sign-off for large awards | §A.6.5 | Finance |
| 5 | Both artefacts submitted for **separate** authorization | Art. 17.1(b),(c) | Compliance |
