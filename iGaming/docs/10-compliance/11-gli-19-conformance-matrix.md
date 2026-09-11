# GLI-19 v3.0 Conformance Matrix

**Standard:** GLI-19 — Standards for Interactive Gaming Systems, Version 3.0, revision date
17 July 2020 (`docsEng-combined.pdf` pp. 105–219).
**Subject:** LANDFALL as a supplied critical product (Route A, B2B GSP).
**Depends on:** [01-regulatory-framework.md](01-regulatory-framework.md),
[03-game-classification.md](03-game-classification.md)
**Paired with:** [12-georgian-rules-conformance-matrix.md](12-georgian-rules-conformance-matrix.md)
— GLI certification never discharges the Georgian obligations, because GLI's own §1.3.1(e)
deliberately excludes AML, financial and business internal controls from laboratory testing and
assigns them to the local operational audit.

---

## Legend

| Mark | Meaning |
|---|---|
| ✅ | **Met** — implemented, with evidence in the repository |
| ◐ | **Partial** — substantially present, with a named shortfall |
| ❌ | **Not met** — no implementation |
| ▽ | **Operator obligation** on Route A — we supply evidence or an interface, not the control |
| — | **Not applicable** to this product |

Gap IDs are shared with [22-compliance-gap-register.md](22-compliance-gap-register.md).

**Scoring as at this revision (rows that are ours, i.e. excluding ▽ and —): 31 ✅ · 14 ◐ · 17 ❌.**
The RNG and game-outcome chapters are essentially clean; the shortfalls cluster in disclosure,
platform self-verification, and documented operational procedure.

---

## Chapter 2 — Platform/System Requirements

| § | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 2.2.1 | Internal clock for time-stamping transactions, games and significant events; reference clock for reporting | ✅ | Server clock authoritative (`packages/server/src/clock.ts`); `rounds.createdAt`, `settledAt`, `actionReceipts.ts`, `actionTelemetry.createdAt` |
| 2.2.2 | Mechanism ensuring time and dates are synchronised across all components | ◐ | Single-process clock today; no documented NTP discipline across a multi-node Georgian deployment. **G31** |
| 2.3.2 | **Control program self-verification at least every 24 h and on demand**; ≥128-bit digest; covering executables, libraries, gaming and system configuration, OS files, reporting components and DB elements; indication on failure | ❌ | No self-verification. Note §2.3.2(b) reaches **configuration** — which under Georgian law is also a material-change surface (`rooms.json`, `RAKE`, the Storm Power ladder). **G17** |
| 2.3.3 | Independent third-party verification method, operating independently of system security software | ❌ | **G17** |
| 2.4.1 | Ability to disable on demand: all gaming activity; individual game themes/paytables or versions; individual player logins | ◐ | Graceful SIGTERM drain and readiness gating exist (decisions-log #49); no operator-facing selective disable of a game version, and player-login disable is ▽ | **G32** |
| 2.4.2 | Constraints on changing jackpot parameters after contributions: increment-rate changes deferred to the next win; ceiling changes only upward; probabilities unaffected | ❌ | Surge parameters are live config with no deferral logic. **G10** |
| 2.4.3 | Secure means of transferring or combining contributions from a decommissioned jackpot, correcting errors | ❌ | No decommissioning path. **G10** |
| 2.5.2 | Player registration and identity verification | ▽ | Operator. Our API must refuse a bet absent an eligibility assertion — see [02](02-licensing-strategy.md) §8 |
| 2.5.3 | Player access, authentication credentials, error-message uniformity, lockout after three failures | ▽ | Operator. Georgian rule is stricter — [12](12-georgian-rules-conformance-matrix.md) |
| 2.5.4 | Re-authentication after 30 minutes of inactivity | ▽ | Operator; Georgian rule is **15 minutes** |
| 2.5.5 | System correctly implements player- and operator-imposed limitations and exclusions; self-imposed limits never override stricter operator limits | ◐ | `packages/server/src/limits.ts` implements session/daily loss limits, a per-round stake cap, reality checks and a self-exclusion lockout, with tightening immediate and loosening behind a 24 h cooldown. Built for a standalone product; on Route A it must become an **interface** honouring operator-supplied limits. **G33** |
| 2.5.6 | Financial transactions — confirmation/denial, audit trail, no transfers between player accounts | ▽ | Operator |
| 2.5.7 | Transaction log / account statement | ▽ | Operator; we supply the game-history component |
| 2.5.8 | Player loyalty programmes | — | None |
| 2.6.2 | Player software contains sufficient information to identify the software and its version | ❌ | No version surface in the client. **G34** |
| 2.6.3 | Authentication of critical software components each time the software loads; prevent gaming and show an error on mismatch | ❌ | **G17** |
| 2.6.4 | Player software communicates only with authorized components over secure communications; on loss of communication, prevent further gaming and display an error | ◐ | Reconnect handling exists; no explicit authorized-endpoint pinning and no documented gaming-halt-on-disconnect contract. **G35** |
| 2.6.5(a) | Players cannot transfer data to one another other than chat and approved files | ✅ | Chat is plain text only, ≤200 chars, no links or media (GDD §5.1) |
| 2.6.5(b–f) | No disabling virus scanners; no unnecessary ports; added functionality must not alter integrity; no volume override; no storage of sensitive information | ✅ | Browser client; no such behaviour. To be asserted in the submission |
| **2.6.5(g)** | **No logic in the client generates any game result; all critical functions including outcome generation are on the Gaming Platform and independent of the player device** | ✅ | Outcome derived server-side from the committed seed; the client receives results. rng spec §1.3; software-architecture §3 |
| 2.6.6 | Detect incompatibilities or resource limitations and prevent gaming with an error | ❌ | **G35** |
| 2.6.7 | No malicious code | ✅ | Dependency inventory maintained (`docs/dependency-inventory.md`); CI typecheck/lint/test/build |
| 2.6.8 | Cookie disclosure at registration or installation | ▽ | Operator |
| 2.6.9 | Player software can display gaming rules, player protection information, terms and conditions, privacy policy | ◐ | A Rules sheet and verification modal exist; the other three are operator surfaces we must be able to host or link. **G36** |
| 2.7.2 | Location fraud prevention — detect and block fake-location apps, VMs, remote desktop, VPN/proxy, rooted or jailbroken devices, MITM | ❌ | **G15** |
| 2.7.3–2.7.4 | Location detection before the first game and on IP change or every 30 minutes; violation logged with player ID and detected location; confidence radius within the permitted boundary | ❌ | **G15**. Primarily ▽, but the pre-game check gates *our* round entry, so we must expose the hook |
| 2.8.1 | Maintain and back up all recorded data; system clock for all time stamps; **export mechanism for analysis and audit (e.g. CSV, XLS)** | ◐ | Data is persisted and complete; **no export mechanism**. Reads directly on Order 240 Art. 3.3. **G22** |
| 2.8.2 | Game play information per game: date/time, outcome display, funds before/after, amount wagered, amount won, jackpot contributions and wins, rake, player choices, intermediate phases, status, game cycle ID, theme ID, player ID — *recorded for each player in multi-player games* | ✅ | `rounds`, `stakes`, `lock_snapshot_json`, `rakeBp`, `powerCapped`, `surgeEvents`, `stormReserveLedger`, `actionReceipts`. Per-stake rows satisfy the multi-player note |
| 2.8.3 | Game theme/paytable information: theme ID, configuration, availability date, **theoretical RTP**, games played, totals wagered and won, jackpot totals, voided wagers, rake, status, decommission date | ◐ | Round-level economy config is persisted (`rakeBp`, `maxPayoutMultiple`); there is no **theme/paytable record** carrying theoretical RTP and lifetime aggregates. **G24** |
| 2.8.4 | Contest/tournament information | — | None |
| 2.8.5 | Player account information, PII, verification method and date, exclusions, financial transactions | ▽ | Operator |
| 2.9.4 | Jackpot reports: winning game cycle/session ID, trigger date and time, hit and payoff amount, user who processed or confirmed | ◐ | `surgeEvents` records round, winner, stake and amount; no processing-user field and no report surface. **G10** |
| 2.9.5 | Significant events and alterations reports: date/time, component, user, reason and description, value before and after | ❌ | No significant-event log with before/after values — this is the audit trail for configuration changes, and therefore the evidence that the material-change regime is being honoured. **G37** |

---

## Chapter 3 — Random Number Generator Requirements

**The strongest chapter in the product.** Notes below are written for the laboratory reviewer.

| § | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 3.2.1 | Source-code review of all core randomness, scaling and shuffling algorithms; examination for bias, implementation error, malicious code, undisclosed switches or parameters influencing randomness | ✅ | `packages/core/src/rng.ts` is small, dependency-free and shared verbatim by server and browser. Scaling is a single documented truncation. No switches or parameters exist |
| 3.2.2 | Statistical testing of final outcome output at 99% confidence — chi-square, overlaps, coupon collector, runs, interplay correlation, serial correlation, duplicates | ◐ | Draw-uniformity (χ²) and draw-independence-from-pools tests exist (`packages/core/test`, simulation-methodology §2). **The full seven-test battery is not run.** **G38** |
| 3.2.3 | Each possible selection equally likely; scaling, mapping and shuffling unbiased; discard of RNG values permissible to remove bias | ✅ | `z* = floor(u × 6)`, `u = int(digest[0:13]) / 2^52`. Truncation bias computed exactly at **8.9 × 10⁻¹⁶** per zone and disclosed rather than hidden (rng spec §1.2). Rejection sampling was considered and rejected for a variable-iteration hot path, with the deviation documented — present this as the disclosure §3.2.3 asks for |
| 3.2.4 | Knowledge of one draw gives no information about a future draw; no discarding or modifying based on previous selections | ✅ | Each round's seed is an independent link of a pre-committed SHA-256 chain consumed in order; the HMAC message is the round id alone. Past outcomes are structurally uninformative about future seeds (pre-image resistance) |
| 3.2.5 | The set of possible outcomes is sufficiently large that all outcomes are available on every draw | ✅ | 52-bit uniform mapped onto 6 outcomes |
| **3.3.1** | **Cryptographically strong** — resistant to an attacker with modern resources who may know the source code | ✅ | SHA-256 chain + HMAC-SHA256; terminal secret from a CSPRNG (`crypto.randomBytes` / Web Crypto). `Math.random()` banned by written rule for anything outcome-adjacent |
| 3.3.2(a) | **Direct cryptanalytic attack** — infeasible to predict future values from past values | ✅ | Requires inverting SHA-256 |
| 3.3.2(b) | **Known input attack** — infeasible to determine the state after seeding; **the RNG shall not be seeded from a time value alone**; games shall not share an initial seed | ✅ | Terminal secret is 32 CSPRNG bytes. No time input anywhere in the derivation |
| 3.3.2(c) | **State compromise extension attack** — the RNG periodically modifies its state through external entropy, limiting the duration of any exploit | ◐ | **The one genuine RNG finding.** A hash chain is deterministic once the terminal secret is known: compromise of `chain_state.terminal_hex` exposes the remainder of the season. Chain rotation per season bounds it (rng spec §3) but is not external entropy. The documented mitigation — mixing a **public beacon unpredictable at commit time** (a future block hash or NIST beacon value) into each round's HMAC message — is on the roadmap, not implemented (rng spec §2). **Recommend promoting it from roadmap to certification scope. G39** |
| 3.3.3 | Dynamic output monitoring for hardware-based RNGs | — | Software RNG |
| 3.4 | Mechanical RNG requirements | — | No physical randomness device |

> **Submission note.** The pre-committed chain is *stronger* than §3.3 requires in one respect worth
> stating explicitly to the laboratory: every seed for an entire season is fixed and publicly
> committed before the first round is played, so the operator cannot select seeds adaptively even
> between rounds. Combined with an HMAC message containing nothing but the round counter, there is
> no round-time input the operator could vary. That is the affirmative case for §4.5.2 as well.

---

## Chapter 4 — Game Requirements

| § | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 4.2.2 | Interface accurately mapped on resize; all outcome-affecting controls clearly labelled; **no hidden or undocumented controls**; instructions adapted to the display; alternating information readable | ◐ | Responsive layout, accessibility audit performed (`docs/09-remediation/d2-accessibility-audit.md`), one primary action by design. Needs a formal no-hidden-controls attestation. **G40** |
| 4.2.3 | Simultaneous or sequential inputs cause no malfunction or unintended results | ◐ | Server-authoritative last-write-wins before lock; rate-limited. Not explicitly tested. **G40** |
| 4.3.2 | Player informed of all available games; aware which theme is selected; not forced to play by selecting a theme; default display not the highest advertised award | ✅ | Entry gate with a mandatory table choice; no auto-commit; the deck shows no award by default |
| 4.3.3 | Game cycle initiation on wager; wagers subtracted from balance; **no wager accepted that could cause a negative balance**; cycle complete when funds are lost or the final transfer occurs; no new game before the current cycle completes | ✅ | Balance checked at accept (`INSUFFICIENT` receipt verdict); settlement atomic with a conservation assert; one bet per player per round |
| 4.3.4 | Display within a session: funds available; current wager amount and placement; wager options; and for the last completed game — accurate outcome, amount won, options in effect | ✅ | Deck, cove cards and verdict card; Wreck Log for prior rounds |
| 4.3.5 | Credit meter rules | — | No session credit meter; the account balance is used directly |
| 4.4.1(a) | Instructions, paytable information and rules **complete, unambiguous, not misleading or unfair** | ◐ | A Rules sheet exists and UX v3 fixed the player-facing vocabulary. **Incomplete against §4.4 until the Storm Power odds (G9) and the malfunction notice (G12) are added** |
| 4.4.1(b) | Help accessible **without depositing funds or committing a wager** | ✅ | Rules sheet and entry gate are pre-bet |
| 4.4.1(c) | Minimum, maximum and other available wagers stated or deducible | ✅ | Tier ranges shown at the gate and in the top bar; the 25% round-share cap is disclosed in the gate copy (decisions-log #58) |
| 4.4.1(d) | Paytable information covers **all possible winning outcomes and payouts** for all modifiers and wager options | ◐ | The settlement formula is published and the payout indicator shows banded estimates, but a pari-mutuel game has no enumerable paytable — this requires a **formula-as-paytable** presentation, agreed in advance with the laboratory. **G41** |
| 4.4.1(e) | Artwork indicates whether awards are in credits, currency or another unit | ✅ | Credits, consistently |
| 4.4.1(f) | An explicitly advertised award must be winnable from a single game or series, or the criteria stated | ◐ | Tied to **G9** — the ×500 Perfect Storm is advertised |
| 4.4.1(g) | Any change in award value during play is reflected and its criteria stated | ✅ | Live jackpot ticker; Storm Power revealed at landfall |
| 4.4.1(h–i) | Aural instructions also in written form; contrast sufficient | ✅ | Audio is procedural cues only, never instructional; contrast audited (d2 audit) |
| 4.4.1(j–l) | Rules for payment of awards, coinciding outcomes, multipliers, symbols not misleading | ◐ | Split fleets and the Storm Power multiplier need an explicit "what the multiplier applies to" statement per §4.4.1(k). **G41** |
| 4.4.13(a) | **Multi-player: one player's actions or results must not affect another's outcome, unless denoted by the game rules** | ✅ *with a required disclosure* | Outcomes are unaffected — the draw is independent of everything. **Payout amounts are affected by design**, so the rules must *denote* it. Landfall already leads with this ("everyone else splits its money"), and math-model §12 fixes the honesty statements. Present the denotation explicitly in the submission |
| 4.4.13(b) | A method for each player to know when the next game begins | ✅ | Storm Clock countdown |
| 4.5.1 | Each RNG and each distinct implementation separately evaluated | ✅ | One RNG; three consumers derived from the same digest — struck zone, storm-path theatre, surge selection (rng spec §5, §7). Disclose all three |
| **4.5.2(a–b)** | Outcomes not limited except by design; **outcomes not modified or discarded due to adaptive behaviour** | ✅ | The draw takes no pool, participant, timing or bet input |
| 4.5.2(c) | No "near miss" — no variable secondary decision substituting a different losing outcome | ✅ | **Deliberate design point.** The storm-approach feint path is derived from later bytes of the same committed digest and is verifiable after reveal; it cannot vary with the result shown (rng spec §5) |
| 4.5.2(d) | Events of chance independent; bonus likelihood not adjusted by award history; **theoretical return not adapted to past payouts** | ✅ | No adaptive return anywhere. Note in the submission that the **adaptive house seed** derives only from settled non-house handle, never from outcomes or payouts, and is published before the round opens — [03](03-game-classification.md) §5 |
| 4.5.2(e–f) | Associated equipment does not influence the RNG; outcomes unaffected by bandwidth, latency or bit error rate; player informed where these may appear to affect the game | ◐ | Structurally satisfied; the **disclosure** about disconnection during a round is missing. **G27** |
| 4.6.1(a) | Games giving a **perception of control that does not exist** must disclose this in help | ✅ *with a required statement* | Landfall's skill layer is real but redistributive only. math-model §12 already fixes the wording: *crowd-reading skill redistributes EV between players, never against the house*, and *a player cannot change the probability that their harbor is struck*. Put both in the help screen |
| 4.6.1(b) | No hidden source code exploitable to circumvent the rules | ✅ | Server-authoritative; open architecture documentation |
| 4.6.1(c) | Final outcome displayed long enough to verify; bypass allowed | ✅ | ~3 s landfall + ~3 s cooldown, fixed |
| 4.6.2 | Simulation of physical objects behaves consistently with the real object | — | The storm is not a simulation of a physical randomness device; it is theatre over a completed draw, and is disclosed as such |
| 4.6.3 | Physics engine consistency | — | None |
| 4.6.4 | Live-game correlation | — | Not a simulation of a live casino game |
| **4.6.5** | **Probability of any chance event constant** unless denoted in artwork | ✅ | Exactly 1/6, always, provable per round |
| 4.7.1 | House-banked games pay a theoretical minimum of 75% | — *with a stated position* | **Not house-banked.** Pari-mutuel. Player-facing return ≈ 98% regardless. State the classification rather than claiming the number — [03](03-game-classification.md) §4.2 |
| 4.7.2 | If RTP is displayed, explain how it was determined, disclose variable jackpot contributions, etc. | ◐ | ≈98% is quoted in player-facing copy without the §4.7.2(a) explanation of derivation or the §4.7.2(c) breakdown of the surge and reserve contributions. **G24** |
| **4.7.3** | **The highest advertised award must occur at least once in 100,000,000 games — unless the artwork prominently displays the actual odds** | ❌ | **Perfect Storm ×500 at ~1 in 1,048,576 — roughly 95× more frequent than the threshold. The actual odds MUST be prominently displayed. G9** |
| 4.7.4 | Limitations on award amounts clearly explained on the game theme offering the prize | ❌ | The 25×-handle salvage cap is not disclosed to players. **G9** |
| 4.8.1 | Bonus/feature: status toward the next trigger displayed; bonus mode made clear; probability must not deteriorate as a bonus progresses | ◐ | Surge rounds are announced before anchoring; Storm Power has no progress state by design (it is a mystery award). Needs the §4.8.1(c) "you are in a bonus" clarity for surge rounds. **G42** |
| 4.8.2 | No automatic selection or initiation of a player-interactive bonus | — | Neither feature requires player interaction |
| 4.8.3 | Extra credits wagered during a bonus | — | None |
| 4.8.4 | **Community bonuses** — rules, payouts, eligibility conditions described; eligibility continuously displayed | ◐ | Storm Power is community by nature (all survivors share the multiplier) and the Golden Anchor is a community draw. Eligibility rules exist but are not continuously displayed per §4.8.4(b). **G42** |
| 4.8.5 | Double-up / gamble features | — | None |
| **4.8.6** | **Mystery award** — artwork must indicate the **minimum and maximum** winnable | ❌ | Storm Power's ×1 floor and ×500 ceiling are not both stated in the artwork. **G9** |
| 4.10 | Games with skill | — | The skill layer is redistributive between players and disclosed under §4.6.1(a); no skill element determines an outcome |
| 4.11.1(a) | Players prevented from occupying more than one position unless the rules allow | ✅ | One bet per player per round; a Split fleet is one order across two harbors and is disclosed |
| 4.11.1(b) | Option to join a session where all players are selected at random | ◐ | Rooms are stake tiers; unrouted players go to the busiest affordable table (decisions-log #48). Disclose the rule and the reason. **G43** |
| **4.11.1(c)** | **Players playing with house money (shills) or proposition players clearly indicated to all other players** | ◐ | House seeds are published in the round header and flagged in the public lock snapshot — but **not surfaced in the player-facing UI**. See [03](03-game-classification.md) §5. **G8** |
| 4.11.1(d) | Warnings where bots or unauthorized software can affect play | ✅ | Bots exist only under `LANDFALL_ENV=demo`, are marked in the DB and in every public lock snapshot, are excluded from the jackpot, and are never counted as players in the lobby |
| 4.11.2 | P2P advantage features | — | None |
| 4.11.3 | "Away from Play" status | — | No turn-based seating; a player who does not bet simply sits out, which is disclosed |
| 4.12 | Persistence games | — | The Skipper Record is cosmetic and is *never* an input to gameplay, odds or settlement (decisions-log #29) — state this explicitly, since a reviewer will ask |
| 4.13.1 | Progressive jackpot classification | ✅ | Storm Surge increases with credits wagered — [03](03-game-classification.md) §6.1 |
| 4.13.2 | Jackpot display updated **at least every 30 seconds** from the incrementing event | ✅ | Live ticker (`jackpotTicker.ts`, `useJackpotTicker.ts`) |
| 4.13.3 | Maximum payoff limits — once at the ceiling, remains there until won; overflow credited to a diversion pool; a disclosed ceiling must be accurate | ❌ | No ceiling on the surge pot; the Storm Power 25×-handle cap is an undisclosed limit. **G9, G10** |
| 4.13.4 | Linked odds proportional to the wager across themes | ✅ | One game; Golden Anchor odds are proportional to stake, with a flag-gated flat-odds variant default-off pending review (decisions-log #8) |
| 4.13.5 | Jackpot diversion schemes must not have infinite mathematical expectation; diversion pools not truncated | ◐ | The **Storm Reserve is effectively a diversion pool**. Rounding dust accrues deterministically to the house (decisions-log #4, ≤2 minor units/round) and the ledger is auditable, but the §4.13.5 analysis has not been written. **G11** |
| 4.13.6 | **Contributions not lost**; payoffs not rounded down or truncated unless carried to the reset; winner notified by the end of the game; payoff updates to the reset value | ◐ | Rollover is implemented and the ledger is exact; no formal reset-value definition and no §4.13.6(b) attestation. **G10** |
| 4.13.7 | Swapping jackpot levels — pay the highest applicable | — | Single level |
| 4.13.8 | Mystery-triggered jackpots — hidden trigger set randomly at reset and unknowable | ✅ *with a note* | The surge trigger is provably fair and **announced before anchoring**, which is stronger than §4.13.8 requires — disclose the difference rather than mapping it |
| **4.13.9** | Multiple simultaneous triggers — order recorded accurately, or the full payoff to each winner, or the distribution disclosed | ◐ | Exactly one surviving stake is drawn per surge round, so simultaneity cannot arise. **Document why**, since §4.13.9 assumes it can. **G10** |
| 4.14.1 | Game recall available to the player, clearly indicated as a replay | ✅ | Wreck Log + Wreck Wake Replay + verification modal |
| 4.14.2 | Recall content: date/time, outcome, funds before and after, amount wagered, amount won, non-wager purchases, **rake/commission collected**, player choices, intermediate phases, jackpot indication | ◐ | Lock snapshot, seed, struck zone, stake, payout and `rakeMinor` are all persisted and exposed via `/api/round/:id`. The **player-facing** recall does not render every §4.14.2 field. **G44** |
| 4.14.3 | Recall reflects at least the last 50 bonus/feature events | ◐ | Wreck Log holds ~20 rounds. **G44** |
| 4.15.1 | On disable, players may conclude the game in progress; thereafter it is inaccessible | ❌ | No documented disable-with-conclusion path. **G32** |
| 4.15.2 | Jackpot disable — indication displayed, no increment or win while disabled, identical parameters on resumption | ❌ | **G10** |
| 4.16.1–4.16.3 | **Interrupted games** — wagers held until completion; accounts reflect held funds; a mechanism to complete; for multi-player, the platform completes on the player's behalf, records which decisions it made, and one player's failure must not affect others | ◐ | **Structurally the strongest position available**: there are no player actions after lock, so the entire mid-round interruption class does not exist (security-review §1.3). What remains is a round interrupted **between lock and settlement**, for which there is no documented procedure. **G27** |
| 4.17 | Virtual event wagering | — | None |
| 4.18 | Live game requirements | — | No live dealer content |

---

## Appendix A — Operational Audit for Gaming Procedures and Practices

| § | Requirement | Status | Evidence / gap |
|---|---|---|---|
| A.2.1–A.2.3 | Internal control procedures, organisational description, third-party service provider descriptions | ❌ | **G20** — also required verbatim by Order 222 Annex 1 Art. 14(a) |
| A.2.4 | **Restricted players** — method to prevent play by employees, subcontractors, directors, owners and officers, and members of their households | ❌ | ▽ in enforcement, ours in policy — we must supply the operator with the restricted list and a blocking interface. **G25** |
| A.2.5 | **Test accounts** — authorisation, fund issuance, records, auditing, and adjustment of reports | ❌ | Directly relevant: the demo track and bots are, in GLI terms, test activity. **G25** |
| A.3.1–A.3.10 | Registration, fraudulent accounts, terms and conditions, privacy policy, PII security, player funds, limitations, exclusions, inactive accounts, account closure | ▽ | Operator. `limits.ts` becomes the interface for A.3.7–A.3.8 — **G33** |
| A.4.1 | **Operator reserves** — maintaining and protecting adequate cash reserves | ◐ | Zero payout liability is a strong position (math-model §3), but the **Storm Reserve can run negative** by design (decisions-log #3). Needs a written bankroll and insolvency policy. **G11** |
| A.4.2 | Protection of player funds in segregated accounts | ▽ | Operator |
| A.4.3 | Taxation — identify wins subject to taxation | ▽ | Operator |
| A.4.4 | **Complaint/dispute process** — 24/7 logging, records for 5 years, a documented process with the regulator | ❌ | ▽ in player contact, ours in evidence. The **signed action receipts** (`action_receipts`, HMAC, per-round sequence, ms-before-lock) are precisely the dispute-resolution substrate — security-review §1.21. Needs a documented procedure and an operator-facing dispute API. **G23** |
| A.4.5 | **Player protection information** — risks of excessive gaming and where to get help; no underage participation; available protection measures; unauthorized-use detection; complaint contacts; regulator contact or link, with links regularly tested | ▽ | Operator, but our game surface must host or link it. **G36** |
| A.4.6 | Responsible gaming — policies for interaction when behaviour indicates risk; trained staff | ▽ | Operator |
| A.4.7 | Chat features — defined procedure, **chat logs retained 90 days** | ◐ | `chat_messages` persists with timestamps; no retention policy or purge job. **G26** |
| A.5.1 | Gaming rules complete, unambiguous and not misleading; **a log of changes kept**; changes time and date stamped; **the rules in place when the wager was accepted apply** | ❌ | No versioned rules artefact and no as-of-wager rule binding. Compounds with Law Art. 24¹.2 — **G45** |
| A.5.2 | Gaming rules content: funding methods and fees; prizes in kind; **procedures for unrecoverable malfunctions including whether pays are voided**; disconnection handling; undecided wagers in interrupted games; restricted players; per-jackpot disclosure of communications imperfections, ceiling, funding and decommissioning | ❌ | **G12, G27, G45** |
| A.5.3 | Incentive award offers — terms, eligibility, wagering requirements, cancellation | — | None on Route A; promo credit fields exist in the schema for operator use |
| A.5.4 | Contests/tournaments | — | None |
| A.6.1 | **PAR sheets** — documented theoretical RTP per game; records of changes affecting RTP; each change treats the game as new for reports; **periodic comparison of theoretical and actual RTP** | ❌ | **G24** |
| A.6.2 | **Monitoring game and RNG output** on a defined periodic or volume basis; abnormalities logged and escalated | ◐ | Prometheus metrics and a conservation assert exist (decisions-log #49); no RTP-band alerting and no RNG-output monitoring procedure. **G24, G38** |
| A.6.3 | Disabling gaming — established procedures; audit-log entry with date, time and reason | ❌ | **G32** |
| A.6.4 | Interrupted game handling — return wagers, update balances and history, **inform the regulatory body**, disable if the failure is likely to recur | ❌ | **G27** |
| A.6.5 | Jackpot procedures — contributions not assimilated into revenue; adjustments and transfers; verification and payment for large awards with independent reconciliation and sign-off; handling of simultaneous triggers; **independent reconciliation of contributions and awards**; decommissioning | ❌ | **G10**. Note §A.6.5(a) — *contributions not assimilated into revenue* — is the same principle as the house-seed ring-fence in [03](03-game-classification.md) §5.4 |
| A.7.1 | **Shills and proposition players** | ◐ | **The material finding. G8** — see [03](03-game-classification.md) §5 |
| A.7.2 | P2P session tracking, including opposing players and repeated session entry/exit without playing | ✅ | `action_telemetry` records room, round, player, action, phase timing, zone, stake, fog membership and min-stake probing (security-review §1.25) |
| A.7.3 | A method for players to report suspected cheating, collusion or bot usage | ❌ | No in-product reporting path. **G46** |
| A.8.1 | Monitoring for collusion and fraud — identifying and refusing suspicious wagers | ✅ | `packages/server/src/collusion.ts` plus the offline scan (`scripts/collusion-scan.ts`) with regularity, fog-correlation, bluff and probing detectors |

---

## Appendix B — Technical Security Controls

Detailed treatment belongs in [15-technical-security-controls.md](15-technical-security-controls.md),
merged with the existing [security-review.md](../05-security/security-review.md) rather than
duplicating it. Summary status:

| § | Area | Status | Note |
|---|---|---|---|
| B.2.1 | System procedures | ❌ | **G20** |
| B.2.2 | **Physical location of servers** | ❌ | Blocked on the D3 migration. **G7** |
| B.2.3–B.2.4 | Logical access control; user authorization | ◐ | Server-authoritative design throughout; no documented RBAC or access-review procedure. **G47** |
| B.2.5 | Server programming | ✅ | Strict TypeScript across all packages; CI typecheck, lint, test, build |
| B.2.6 | Verification procedures | ❌ | **G17** |
| B.2.7 | Electronic document retention | ❌ | **G26** |
| B.2.8–B.2.9 | Asset management; **Critical Asset Register** | ❌ | The CAR maps almost one-to-one onto the Georgian critical-products list — build it once, use it twice. **G47** |
| B.3.1–B.3.2 | Data security; data alteration | ◐ | Money in integer minor units; settlement atomic; receipts HMAC-signed. No documented data-alteration control. **G47** |
| B.3.3–B.3.4 | Backup frequency; storage medium backup | ❌ | Order 240 Art. 3.4 requires immediate restore from backup. **G48** |
| B.3.5–B.3.7 | System failure; master resets; recovery | ◐ | Graceful drain, liveness/readiness split (decisions-log #49); no documented recovery procedure. **G48** |
| B.3.8 | UPS support | ❌ | Becomes live with the D3 hosting decision. **G48** |
| B.3.9 | Business continuity and disaster recovery plan | ❌ | Also required by Order 222 Annex 1 Art. 8.3(b). **G20** |
| B.4.1–B.4.4 | Connectivity; communication protocol; communications over public networks | ◐ | TLS in transit; WebSocket frame reassembly fixed (decisions-log #53). Order 222 Art. 10.2 requires **TLS 1.2 minimum** and Art. 15.1(c) requires **sender and recipient of every communication to be known** — neither is documented as a control. **G29** |
| B.4.5 | WLAN communications | — | |
| B.4.6–B.4.8 | Network security management; active and passive attacks; mobile computing | ◐ | Threat model is thorough (security-review §1.1–§1.25); not mapped to B.4. **G47** |
| B.5.1–B.5.3 | Third-party communications, services and data processing | ◐ | `docs/dependency-inventory.md` exists and is maintained; no third-party **service** register. **G47** |
| B.6.1 | DNS requirements | ❌ | **G47** |
| B.6.2–B.6.3 | Cryptographic controls; **encryption key management** | ◐ | Two distinct secrets already separated by design — the fairness chain terminal and the receipt signing key (`server_secrets`, decisions-log #9). But the chain terminal lives in the database in the local build, which is explicitly a local-build compromise and must not survive to production. **G49** |
| B.6.4 | Critical component hardening | ❌ | **G47** |
| B.6.5 | Generation and storage of logs | ◐ | Structured JSON logging (`log.ts`); no retention, integrity or tamper-evidence policy. **G26** |
| B.7.1–B.7.5 | Remote access security and procedures; activity log; firewalls and audit logs | ❌ | Becomes live with D3. **G47** |
| B.8.1–B.8.4 | **Change management**; program change control; SDLC; patches | ◐ | CI gates exist (decisions-log #50); `format:check` deliberately not a gate (#51). **Change management is a named key position under Order 222 Art. 14(c) and the hinge of the material-change regime** — this needs to be excellent, not adequate. **G20** |
| B.9.1–B.9.4 | Periodic security testing; vulnerability assessment; **penetration testing**; firewall rules review | ❌ | Also the Order 222 Art. 15.2 annual assessment, due 1 March. **G21** |

---

## Appendix C — Service Providers

| § | Area | Status | Note |
|---|---|---|---|
| C.2.1–C.2.5 | ISMS audit; information security policy; access control policy; allocation of security responsibilities; incident management | ❌ | **G20, G47** |
| C.3.1–C.3.2 | **Cloud service provider audit and relationship** | ❌ | Directly engaged by decision D3. Whatever Cloudflare retains as CDN/WAF falls under C.3, and Order 222 Annex 1 Art. 16.2 names **the CDN** as a recorded change surface. **G7** |
| C.4.1–C.4.2 | Payment service provider audit; securing payments | ▽ | Operator |
| C.5.1–C.5.3 | Location service provider audit, reporting and maintenance | ▽ / ❌ | Depends on how G15 is implemented |
| C.6.1–C.6.2 | Live game service provider | — | No live content |

---

## Priorities

**Before paying the Selected Person's authorization fee** — because Order 239 Art. 5.6 gives no
remediation path for material non-compliance found at initial research:

1. **G9** — Storm Power odds, minimum/maximum and the payout cap disclosed. A §4.7.3 failure is a
   plain, objective, unarguable finding.
2. **G8** — house-seed position resolved and the UI indication added.
3. **G12** — "Malfunction Voids All Pays" notice.
4. **G17** — control-program self-verification.
5. **G10** — jackpot controls: monthly balancing, no-cancellation guarantee, decommissioning, ceiling.
6. **G7** — hosting migration, since sealing and physical location depend on it.
7. **G45** — versioned rules artefact with as-of-wager binding.

**Cheapest high-value wins**, because the substrate already exists and only the procedure is
missing: G22 (data export over existing tables), G23 (dispute procedure over existing receipts),
G26 (retention policy over existing logs), G38 (extend the existing statistical suite to the full
seven-test battery).
