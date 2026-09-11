# 04 — GLI-19 v3.0 Conformance Matrix

**Standards for Interactive Gaming Systems.** Clause → position → evidence.

Scope: LANDFALL is submitted as a **game supplied to a licensed operator** (B2B / Game Service
Provider). Clauses addressed to the *operator* — player registration, KYC, deposits, withdrawals,
account states, location detection, the self-exclusion register — are marked **▽ operator** and
are not implemented here. Where they constrain our integration surface, the row says how.

Legend: **✔** met and evidenced · **◐** partially met, declared · **▽** operator obligation ·
**n/a** not applicable to this game.

---

## Chapter 2 — Platform / System Requirements

| Clause | Requirement | Status | Evidence |
|---|---|---|---|
| 2.2.1 | System clock for time-stamping transactions, significant events, reporting | ✔ | Every round, stake, receipt, ledger row and significant event carries an epoch timestamp (`db/ddl.ts`) |
| 2.2.2 | Time synchronisation across components | ◐ | Single-instance in this build; multi-node discipline undocumented (**G31**) |
| 2.3.2 | Self-verification of critical control components, ≥ every 24 h and on demand, ≥128-bit digest, covering executables, libraries, **gaming and system configuration**, reporting components and DB elements, with a failure indication | ✔ | `server/src/selfVerify.ts` — SHA-256 over a sorted per-component manifest of source, the resolved economy, `rooms.json` and the schema; 24-hour timer plus `GET /api/compliance/verify`; failure raises a metric, a structured log line and an `INTEGRITY` significant event. On Cloudflare, `runtimeVerify.ts` covers the configuration surface and **declares** its narrower scope |
| 2.3.3 | Independent third-party verification, operating outside the system's own security software | ✔ | `controlManifest()` is a pure function of files on disk and resolved config; `simulations/identity.ts` reproduces the digest standalone without starting the server |
| 2.4.1 | Disable on demand: all gaming activity, individual game versions, individual player logins | ✔ | `GameControl` + `POST /api/compliance/disable` / `/enable`, authenticated. **Was a dead code path until this pass** — see `docs/08-findings-and-fixes.md` §5 |
| 2.4.2 | Jackpot parameter changes: increment rate deferred to the next win; ceiling only upward | ✔ | The ceiling is a pure function of the tier, so it cannot move at all while the table exists (`surgeCeilingFor`). Verified in `suites/jackpot/controls.test.ts` |
| 2.4.3 | Secure means to transfer or combine contributions from a decommissioned jackpot | ✔ | `decommissionSurge()` transfers pot and diversion pool in full, and **refuses** a destination with worse odds |
| 2.5.x | Player account management, registration, verification, inactivity, financial transactions, statements | ▽ operator | Order 43 / Order 41 obligations. Our interface constraints: `docs/05-georgian-conformance.md` §5 |
| 2.5.5 | Operator limits take priority over self-imposed ones | ◐ | `LimitsService` enforces self-imposed limits server-side; the operator-supplied precedence interface is **G33** |
| 2.6.2 | Player software carries identifiable software and version information | ✔ | Build id injected at build time (`web/src/buildInfo.ts`), shown in the game-information dialog |
| 2.6.3 | Client-side validation of critical components on load, preventing gaming on failure | ◐ | Server-side verification is complete; client-side load validation is **G17**'s open limb |
| 2.6.4 | On loss of communication the software prevents further gaming and shows an error | ✔ | Every action path is gated on `connected`; the deck and the accessibility layer state why. Reconnect uses exponential backoff; `error` and parse failures are handled (fixed this pass) |
| 2.6.5(a) | Players cannot transfer data to one another beyond chat | ✔ | The protocol is a closed discriminated union; the only player-to-player channel is rate-limited chat |
| 2.6.5(g) | **The client contains no logic that generates any game outcome** | ✔ | The client holds no seed and no draw path; it renders server state and re-verifies published results read-only. `suites/rng/strength-and-independence.test.ts` |
| 2.6.6 | Compatibility verification, preventing gaming on incompatibility | ◐ | **G35** — browser capability detection not implemented |
| 2.6.7 | No malicious code | ✔ | Dependency inventory at `iGaming/docs/dependency-inventory.md`; no analytics, no telemetry beacons, no third-party scripts |
| 2.6.8 | Cookie disclosure | ✔ | No cookies. Client state is `localStorage` (a player id and UI preferences), disclosed in the game-information dialog |
| 2.6.9 | Access to gaming rules, player-protection information, terms, privacy policy | ◐ | Rules and player-protection panel are present; **terms and privacy policy are operator artefacts** (**G36**) |
| 2.7.x | Location detection, VPN/proxy/RDP/VM/rooted device | ▽ operator | Pre-game gate hook is **G15** |
| 2.8.1 | Data retention and time-stamping; CSV/XLS export | ✔ | `GET /api/compliance/export/bets.csv`, `/export/jackpots.csv`; retention policy exercised by `server/test/retention.test.ts` |
| 2.8.2 | Game play information retained | ✔ | Per-round: chain index, previous chain value, revealed seed, struck harbour, **full lock snapshot**, rake, rake basis points, cap, rules version. Per-stake: harbour, amount, outcome, payout |
| 2.8.3 | Game theme / paytable record with theoretical RTP and lifetime aggregates | ✔ | `GET /api/compliance/paytable` |
| 2.8.7 | Jackpot information | ✔ | `surge_pots`, `surge_events`, `storm_reserve_ledger`, `house_float_ledger` |
| 2.8.8 | Significant event information | ✔ | `significant_events` with category, component, actor, reason, **value before and after**, incident flag |
| 2.9.1–2.9.4 | Reporting: game performance, operator liability, large jackpot payouts | ✔ | `GET /api/compliance/report` — the Order 240 Art. 2.2 data set including GGR and RTP |
| 2.9.5 | Significant events and alterations report with value before/after and responsible user | ✔ | `GET /api/compliance/events`. CDN change tracking is **G37**'s open limb |

---

## Chapter 3 — Random Number Generator

Fully treated in `docs/03-rng-design-and-testing.md`. Summary:

| Clause | Status | Evidence |
|---|---|---|
| 3.2.1 Source code review | ✔ ready — ~400 lines, no other randomness algorithms | `core/src/rng.ts`, `settlement.ts`, `server/src/chain.ts` |
| 3.2.2 Statistical analysis, collectively at 99% | ✔ | Seven tests × 20 streams; `evidence/03-rng-statistics.txt` |
| 3.2.3 Distribution, unbiased scaling | ✔ | χ² 0.38 / 15.09; mapping bias bounded at 1.3 × 10⁻¹⁵ and **stated** |
| 3.2.4 Independence between and within draws | ✔ | `suites/rng/strength-and-independence.test.ts` |
| 3.2.5 Available outcomes | ✔ | 256-bit space; all outcomes reachable on every draw |
| 3.3.1 Cryptographically strong | ✔ | HMAC-SHA256 over a SHA-256 chain |
| 3.3.2(a) Direct cryptanalytic attack | ✔ | Order-2 Markov predictor no better than chance over 120,000 draws |
| 3.3.2(b) Known input attack | ✔ | CSPRNG seeding, **no clock in the path**, seasons provably disjoint |
| 3.3.2(c) State compromise extension | **◐ declared** | Bounded to one season (10,000 rounds); beacon mixing designed, not implemented (**G39**) |
| 3.3.3 Hardware RNG monitoring | n/a | No hardware RNG |
| 3.4 Mechanical RNG | n/a | No physical randomness device |

---

## Chapter 4 — Game Requirements

### 4.2–4.3 Player interface and gaming session

| Clause | Requirement | Status | Evidence |
|---|---|---|---|
| 4.2.2(b) | Controls clearly labelled, operating per the rules | ✔ | Six numbered harbour buttons, one primary "Place bet", explicit amount field |
| 4.2.2(c) | **No hidden or undocumented controls affecting the outcome** | ✔ | The protocol is a closed schema (`clientMessage`); `suites/edge-cases/boundaries.test.ts` enumerates what is accepted and what is refused |
| 4.2.2(d) | Instructions adapted to the interface; full version reachable | ✔ | Abridged rule on the deck, full rules sheet and game-information dialog |
| 4.2.3 | Simultaneous/sequential input cannot malfunction or defeat design intent | ✔ | 200-order burst with the balance reconciling after **every** order, accepted or refused |
| 4.3.3(a)–(b) | Game cycle begins at the wager; the wager is subtracted; no negative balance | ✔ | `suites/compliance/game-lifecycle.test.ts` |
| 4.3.3(d) | Cycle complete when the award reaches the balance | ✔ | same |
| 4.3.4 | Display: funds, current wager, wager options, last completed game | ✔ | Top bar, deck, result card, live rail |
| 4.3.5 | Credit meter visible whenever a wager may be placed | ✔ | Persistent in the top bar |

### 4.4 Game information and rules of play

| Clause | Requirement | Status | Evidence |
|---|---|---|---|
| 4.4.1(a) | Rules complete, unambiguous, not misleading | ✔ | `GET /api/rules` — the same bytes the client renders and the submission cites |
| 4.4.1(b) | Help accessible without funds or a wager | ✔ | Game-information dialog, always reachable |
| 4.4.1(c) | Minimum, maximum and other wagers stated | ✔ | Tier range on the deck; the live round-share cap is shown when it binds |
| 4.4.1(d) | **All winning outcomes and their payouts** | ✔ | A pari-mutuel game has no enumerable paytable: the **formula** is disclosed, with both quantities live on the board. `settlementFormulaDisclosure()` |
| 4.4.1(f) | An advertised award must be winnable in full | ✔ | `unwinnableTiers()` asserted **at room construction**. The earlier 25× cap failed this; see findings §2 of the project register |
| 4.4.1(i) | Instructions legible, contrasting | ✔ | Accessibility audit at `iGaming/docs/09-remediation/d2-accessibility-audit.md` |
| 4.4.1(j) | Rules for payment of awards | ✔ | The settlement formula plus the multiplier statement |
| 4.4.1(k) | **What the multiplier applies to, and does not** | ✔ | `STORM_POWER_APPLIES_TO` — ×500 multiplies the salvage *share*, never the returned bet, and never reduces |
| 4.4.1(r) | Restrictive features disclosed (play limits, maximum win) | ✔ | The liability cap and the share above which it binds, per tier |
| 4.4.1(s) | Rake, commission or fee disclosed | ✔ | 12% of the struck pool, stated in the rules and in the return derivation |
| 4.4.13(a) | One player's actions must not affect another's **outcome** | ✔ | The draw takes no participant input. Crowding changes *payouts*, never *probabilities* — and that distinction is itself disclosed (`SKILL_DISCLOSURE`) |
| 4.4.13(b) | A method to know when the next game begins | ✔ | The round clock and phase banner |

### 4.5–4.6 Outcome and fairness

| Clause | Status | Evidence |
|---|---|---|
| 4.5.1 Each RNG evaluated separately | ✔ | One RNG, one implementation |
| 4.5.2(a)–(f) Outcome influenced by nothing but the RNG | ✔ | Structural (no pool parameter) and behavioural; `docs/03-rng-design-and-testing.md` §6 |
| 4.6.1(a) Perception of control disclosed | ✔ | `SKILL_DISCLOSURE`: "reading the crowd changes how much you are paid, never whether you are hit" |
| 4.6.1(b) No hidden source code exploitable by a player | ✔ | Client holds no outcome logic; protocol closed |
| 4.6.1(c) Outcome displayed long enough to verify | ✔ | 3-second reveal plus a persistent replay card and the Wreck Log |
| 4.6.5 Chance probability constant for a paid game | ✔ | Exactly 1/6 per harbour, every round, disclosed |

### 4.7 Payout percentages and odds

| Clause | Status | Evidence |
|---|---|---|
| 4.7.1 Minimum 75% for every wagering configuration | ✔ | 99.3491% theoretical; 91.48% in the worst solo case; 100% in the no-survivor case. `docs/02-math-verification.md` |
| 4.7.2(a) Displayed RTP explains how it was determined | ✔ | Four named terms and the hold, in one derived sentence. **Was wrong until rules v4** — findings §2 |
| 4.7.2(c) Jackpot and bonus contribution broken out | ✔ | The jackpot and ladder terms are separate line items |
| 4.7.3 Actual odds of the highest advertised award | ✔ | ~1 in 1,048,576 — 95× more frequent than the threshold, so display is mandatory and rendered from `stormPowerPaytable()` |
| 4.7.4 Limitations on awards explained | ✔ | The cap and the struck-share above which each tier begins to be clamped |

### 4.8–4.9 Bonuses and alternative modes

| Clause | Status | Evidence |
|---|---|---|
| 4.8.1(a) Status toward the next bonus shown | ✔ | Jackpot meter and the pre-round surge announcement |
| 4.8.4(b) Community bonus eligibility display | ✔ | Live eligibility line during a jackpot round |
| 4.8.6 Mystery award minimum and maximum stated | ✔ | ×1 and ×500, from `stormPowerRange()` |
| 4.9.1(a) Free play represents the paid game | ✔ | Identical code path; no demo branch in the draw, settlement or RTP. `suites/demo/demo-mode.test.ts` |
| 4.9.1(b) Mode prominently displayed at all times | ✔ | Permanent `DEMO · VIRTUAL CREDITS` badge and legal strip |
| 4.9.1(c) Does not increment a real balance | ✔ | No real balance exists in this build; practice credits are minted, ledgered and demo-gated |
| 4.9.2 Autoplay | n/a | Not supported — every round requires an explicit confirmation |
| 4.9.3 Tournament mode | n/a | Not supported |
| 4.10 Games with skill | ◐ | The skill layer is real but purely redistributive, and is disclosed as such (§4.6.1(a)) |

### 4.11 Peer-to-peer

| Clause | Status | Evidence |
|---|---|---|
| 4.11.1(a) One position per player unless the rules allow otherwise | ✔ | One fleet order per player per round; the Split 70/30 order is disclosed |
| 4.11.1(b) Random placement, or the rule disclosed | ✔ | `TABLE_ROUTING_DISCLOSURE` — players choose freely; the default routing rule and its player-protection reason are stated |
| 4.11.1(c) **House money and proposition players indicated** | ✔ | `HOUSE_SEED_DISCLOSURE`; the seed is published in the round header before betting and is identical on all six harbours |
| 4.11.1(d) Warning where bots can affect play | ✔ | Practice opponents labelled everywhere they appear; excluded from the jackpot; impossible outside a demo build |
| 4.11.3 "Away from play" status | ◐ | No turn order exists, so no turn can be skipped; a player who does nothing simply does not bet. Inactivity handling is ▽ operator (§2.5.4) |

### 4.13 Progressive jackpots

| Clause | Status | Evidence |
|---|---|---|
| 4.13.2 Display updated at least every 30 s | ✔ | Live jackpot meter |
| 4.13.3 Ceiling; contributions above it diverted, not lost | ✔ | `contributeToSurge()`; `toPot + toDiversion === contribution`, always |
| 4.13.5 Diversion scheme without infinite expectation | ✔ | Bounded state driven over 200,000 rounds |
| 4.13.6(a) Contributions never lost | ✔ | Verified over 5,000 contributions |
| 4.13.6(b) Payoff never rounded down or truncated | ✔ | The winner receives the pot to the minor unit |
| 4.13.6(d) Reset value defined | ✔ | `budgetFraction × affordable`, funded from the diversion pool first |
| 4.13.9 One winner, or a disclosed distribution | ✔ | Exactly one surviving stake per jackpot round, by construction; `assertSingleWinner()` |

### 4.14–4.16 Recall, disable, interrupted games

| Clause | Status | Evidence |
|---|---|---|
| 4.14.1 Player-facing game recall | ✔ | Replay card and the Wreck Log, with the 🛡 verification button |
| 4.14.2 Last-play fields (funds before/after, rake, intermediate phases) | ◐ | Persisted and served by `GET /api/round/:id`; not all fields rendered (**G44**) |
| 4.14.3 At least the last 50 bonus events | ◐ | The Wreck Log holds ~20 (**G44**) |
| 4.15.1 Disable lets the game in progress conclude | ✔ | A locked round always settles; only new bets are refused |
| 4.15.2 Jackpot disable | ◐ | The pot cannot be incremented or won while a room is disabled; a dedicated jackpot-disable surface is not exposed |
| 4.16.1–4.16.3 Interrupted games | ✔ | **There are no player actions after bets lock**, so the "interrupted mid-decision" class cannot occur. A round interrupted between lock and settlement is voided, every bet returned, and an incident recorded — driven for real in `resilience.test.ts` |
| 4.17 Virtual event wagering | n/a | — |
| 4.18 Live game requirements | n/a | No live dealer or physical device |

---

## Appendix A — Operational audit (gaming procedures)

| Clause | Status | Note |
|---|---|---|
| A.2.4 Restricted players list | ▽ operator | Interface is **G25** |
| A.2.5 Test accounts | ✔ | The demo track and practice opponents are disclosed to players as test activity |
| A.4.1 Operator reserves adequate and protected | ✔ | Reserve opens capitalized at `150 × liquidity floor`; **zero backstops over 1M rounds** |
| A.4.4 Complaints and disputes | ◐ | HMAC-signed `action_receipts` are an ideal dispute substrate; the written procedure is **G23** |
| A.5.1 Rules complete; **change log; rules in force at the time of the wager** | ✔ | `RULES_VERSION` + `RULES_CHANGELOG`, stamped on every round **at creation** |
| A.5.2(c)–(e) Malfunction, disconnection, undecided wagers | ✔ | `INTERRUPTION_RULES`; `MALFUNCTION VOIDS ALL PAYS AND PLAYS` on a permanent legal strip |
| A.6.1 RTP documented with change records | ✔ | `core/src/rtp.ts` plus `docs/02-math-verification.md` |
| A.6.2 Theoretical-versus-actual comparison with escalation bands | ✔ | `rtpVarianceBand()`, `classifyRtpVariance()` — bands widen as the sample shrinks |
| A.6.3 Disable audit entry with date, time and reason | ✔ | Reason is **required**, not defaulted |
| A.6.4 Interrupted game: return wagers, update balances, inform the regulator | ✔ | `voidRound()` + an incident-flagged significant event |
| A.6.5 Jackpot contributions not assimilated into revenue; reconciliation | ✔ | The rake's jackpot share never reaches the operator account; monthly balancing has no tolerance band |
| A.7.1(a) House money indicated to players | ✔ | `HOUSE_SEED_DISCLOSURE` |
| A.7.1(c) Operator does not profit beyond the rake | ✔ | Operator revenue is the rake alone, by construction |
| A.7.1(d) Operator-funded wagers not withdrawable; **ultimately lost or played** | ✔ | Segregated float; surplus **released to the jackpot**. The release path existed but was never called until this pass — findings §4 |
| A.7.3 Player reporting of suspected cheating | ◐ | In-product panel exists; operator routing is **G46** |

---

## Appendix B / C — Technical security controls, service providers

Out of scope for this pack. Deployment and organisational matters, tracked as **G7, G20, G21,
G29, G47, G48, G49** in the project's gap register.

---

## Summary

| | Count |
|---|---|
| ✔ Met and evidenced | 71 |
| ◐ Partial, declared | 13 |
| ▽ Operator obligation | 6 |
| n/a | 6 |

The one clause where the game's design cannot fully meet the standard rather than merely not
having got there yet is **§3.3.2(c)**, and it is stated plainly in
`docs/03-rng-design-and-testing.md` §5.4 with its bound, its compensating controls, and the
designed mitigation.
