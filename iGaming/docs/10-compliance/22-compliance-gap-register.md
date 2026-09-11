# Compliance Gap Register

**The live register.** Every gap identified in the pack, with severity, owner and status. This is the
working document — the matrices are the analysis, this is the list of things to do.

**Scope:** Route A (B2B Game Service Provider), per [00-compliance-plan.md](00-compliance-plan.md) §0.
**Sources:** [11-gli-19-conformance-matrix.md](11-gli-19-conformance-matrix.md),
[12-georgian-rules-conformance-matrix.md](12-georgian-rules-conformance-matrix.md),
[03-game-classification.md](03-game-classification.md).

---

## Severity

| Level | Meaning |
|---|---|
| **BLOCKER** | The permit cannot issue until this is closed |
| **CRITICAL** | Likely to be found as **material** non-compliance at the Selected Person's initial research. Order 239 Art. 5.6 gives **no remediation path** for material findings — the authorization terminates and the fee is spent. **Close before paying.** |
| **HIGH** | Would be found at the technical audit or the GLI laboratory; rectifiable within a temporary certificate's 3-month window |
| **MEDIUM** | Required, not gating |
| **LOW** | Housekeeping |

**Status:** ☐ Not started · ◐ In progress · ☑ Closed · ▽ Operator obligation, interface only

> **Engineering pass of 2026-09-11 (rules v2).** The code-side gaps below marked ☑ or ◐ were
> worked in one pass; see `docs/09-remediation/decisions-log.md` rows 64–73 for every judgment
> call and `packages/core/test/compliance.test.ts` for the executable form of each invariant.
> Nothing here has been reviewed by counsel, and the BLOCKER rows are untouched — they are
> corporate and procedural, not engineering.
>
> **One finding was new and is worth flagging on its own:** the advertised ×500 Perfect Storm
> was **mathematically unpayable**. The 25×-handle liability cap clamped it in every round whose
> struck harbor held more than 5.68% of the handle, and six harbors average 16.7% — so the
> headline award could never be paid at its advertised value, and Category 6 ×100 was clamped
> from 28.4% upward. That is GLI-19 §4.4.1(f) ("an explicitly advertised award must be winnable")
> on top of the §4.7.3 / §4.8.6 / §4.7.4 disclosure failures G9 already recorded. Fixed by
> deriving the cap from the ladder (150×); re-measured at 10M rounds, cap hits fall from 13 to 1.

---

## 1. Summary

| Severity | Count | Owner concentration |
|---|---|---|
| BLOCKER | 4 | Corporate, Compliance |
| CRITICAL | 9 | Engineering, Compliance |
| HIGH | 17 | Engineering |
| MEDIUM | 19 | Compliance, Engineering |
| LOW | 4 | Engineering |
| **Total** | **53** | |

**After the 2026-09-11 engineering pass:** of the 52 rows actually tabulated below, **10 are
closed (☑), 11 partially closed (◐) and 31 untouched (☐)**. *(The severity table above totals 53;
the tables hold 52. The discrepancy predates this pass and is left for whoever owns the register
to reconcile — it is not resolved here by guessing which row was intended.)*
Every BLOCKER remains open — they are corporate and procedural, not engineering. Of the nine
CRITICAL rows: **2 closed** (G8 house seed, G9 Storm Power disclosure), **4 partial** (G10
jackpot controls, G17 self-verification, G22 reporting, G24 RTP), **3 untouched** (G7 hosting,
G20 internal control system, G28 change classification).

Gaps **G2–G6 and G19 are closed by the Route A decision** — they are player-lifecycle, KYC, AML,
payments and account-state obligations that fall on the licensed operator, not on a game supplier.
They are retained in §6 as interface constraints, because they shape our API even though we do not
implement them.

---

## 2. BLOCKER

| ID | Gap | Source | Owner | Status |
|---|---|---|---|---|
| **G1** | **No Georgian entity, no permit.** Entity registration; criminal-record certificates for the person with management and representation authority, founder/partner and **beneficial owner**, issued by each one's **country of citizenship** (apostille + certified translation for non-Georgian principals); documented source-of-funds trail for the GEL 100,000 permit fee; clean tax standing. Art. 11.9–11.10 is a **continuing** condition, so it needs ongoing monitoring, not a one-time check | Law Arts. 11.1¹, 11.7, 11.9–11.10, 24¹.1 | Corporate | ☐ |
| **G51** | **No authorization certificate.** The three-stage Order 239 process — application (5 d) → initial research (≤15 d) → integration (≤45 d) → certificate (2 d). Presupposes G1, G54, G7 and every CRITICAL row below | Order 239; Law Art. 24¹.1(e) | Compliance | ☐ |
| **G54** | **No authorized persons in key positions.** Order 222 Art. 14(c) requires named authorized persons at minimum in **information technology** and **change management**. These are also named in the Order 239 Art. 3 application. Recommend adding a compliance owner, a security owner and a jackpot controller | Order 222 Annex 1 Art. 14(c); Order 239 Art. 3 | Corporate | ☐ |
| **G30** | **Pack cites an unverified snapshot.** Orders 222, 43, 41 and 239 have all been amended since `docsEng-combined.pdf`; the permit-fee pages read as Revenue Service website content, not statute. Every citation must be re-verified against the current Georgian text at `matsne.gov.ge` before filing. Thereafter an **amendment watch** is a standing obligation — Order 239 Art. 8.1¹ gives 3 months from any standards change to apply for re-authorization | [01](01-regulatory-framework.md) §7 | Counsel | ☐ |

---

## 3. CRITICAL — close before paying the Selected Person

| ID | Gap | Source | Owner | Status |
|---|---|---|---|---|
| **G9** | **Storm Power disclosure.** Three separate failures in one feature: (a) the ×500 Perfect Storm occurs at ~1 in 1,048,576, roughly **95× more frequent** than the 1-in-100,000,000 threshold, so GLI §4.7.3 **requires the actual odds to be prominently displayed in the artwork**; (b) §4.8.6 requires a mystery award's minimum and maximum to be stated — ours are ×1 and ×500; (c) §4.7.4/§4.13.3 require the **25×-handle salvage cap** to be explained, since a player shown "×500" who receives a clamped figure is exactly the harm the clause exists to prevent. Objective, unarguable findings **→ Closed 2026-09-11 (rules v2).** All three limbs, plus a fourth the row did not anticipate: the ×500 was **unpayable** at the 25× cap (GLI §4.4.1(f)). Cap re-derived to 150×; odds, minimum/maximum and the cap condition now render from `stormPowerPaytable()` on a permanent game-surface control, not a collapsed accordion. decisions-log #64. | GLI §§4.7.3, 4.7.4, 4.8.6, 4.13.3 | Product + Engineering | ☑ |
| **G8** | **House seed vs. shills and proposition players.** House money staked into the player pool, winning and losing like a player, credited to the operator's revenue account. GLI §A.7.1(c)–(d) prohibits the operator profiting beyond the rake and requires operator-funded wagers to be non-withdrawable and ultimately played. Order 222 Art. 13(a) is the sharper risk. **Recommended resolution** ([03](03-game-classification.md) §5.4): ring-fence house-seed P&L into a segregated liquidity float that may fund only future seeds, the surge pot or the reserve — never operator revenue — plus a player-facing UI indication per §A.7.1(a) and §4.11.1(c) **→ Closed 2026-09-11.** Ring-fence implemented exactly as §5.4 recommends (`house_float_ledger`, `core/houseFloat.ts`); operator revenue is now the rake alone by construction, with the UI indication in the round rail. Conservation pinned by `server/test/ringfence.test.ts`. decisions-log #66. *Counsel still to answer Q4.* | GLI §§A.7.1, 4.11.1(c); Order 222 Annex 1 Art. 13(a) | Product + Compliance | ☑ |
| **G10** | **Jackpot controls absent.** Required: **monthly balancing** with discrepancies raised as incidents and notified; a written **no-cancellation** guarantee; decommissioning and contribution-transfer procedure; ceiling and diversion-pool accounting; reset-value definition; parameter-change deferral; disable behaviour; simultaneous-trigger documentation. Also — **the jackpot control software must be authorized separately from the jackpot program**, which requires it to exist as a distinct identifiable artefact rather than as code inside settlement. The data substrate (`surge_pots`, `surge_events`, `storm_reserve_ledger`) already exists **→ Partial 2026-09-11.** Jackpot control software extracted as a separate artefact (`core/jackpot.ts`) with ceiling, diversion pool, reset value, no-cancellation rollover, decommissioning and monthly balancing. decisions-log #68. *Still open: the written procedure, the incident path and the §2.4.2 parameter-change deferral.* | Order 222 Annex 1 Art. 17; GLI §§4.13, 2.4.2, 2.4.3, 4.15.2, A.6.5 | Engineering + Compliance | ◐ |
| **G17** | **No control-program self-verification.** Required at least every 24 h and on demand, with a ≥128-bit digest, covering executables, libraries, **gaming and system configuration**, OS files, reporting components and DB elements, with a failure indication; plus an independent third-party verification method; plus client-side validation on load. Note the configuration limb — `rooms.json`, `RAKE`, `RAKE_SPLIT` and the Storm Power ladder are all runtime-configurable and all material-change surfaces **→ Partial 2026-09-11.** 24-hour and on-demand self-verification over source, resolved runtime config and the DB schema, with failure indication. decisions-log #72. *Still open: client-side validation on load (§2.6.3).* | GLI §§2.3.2, 2.3.3, 2.6.3 | Engineering | ◐ |
| **G20** | **No internal control system.** Order 222 Art. 14(a) requires internal control mechanisms **covering all aspects of game operation**, weighted to security, operation and reporting, producible on request. Must include (mirroring Art. 8.3): change management, business continuity and disaster recovery, incident notification, fraud/collusion/deception detection, network security, and a **detailed diagram of the network, system and data**. The single document both the Revenue Service and the Selected Person will ask for | Order 222 Annex 1 Arts. 14(a)–(b), 8.3; GLI §§A.2.1–A.2.3, B.2.1, B.3.9, B.8 | Compliance + Engineering | ☐ |
| **G22** | **No reporting or export path.** Order 240 Art. 3.3 requires information on **each specific transaction** on demand — expressly each bet placed and each jackpot paid. Art. 21(b) requires game transaction details, a bets overview and jackpot details to the Selected Person. Order 240 Art. 2.2(a) requires permit and certificate numbers, **total GGR** and **RTP**. GLI §2.8.1(b) requires CSV/XLS export. Resolution 605 contemplates continuous (**Live**) mode. Per-stake rows and per-round lock snapshots already exist — the substrate is there, the query, export and feed are not **→ Partial 2026-09-11.** Per-bet and per-jackpot CSV export, the Order 240 Art. 2.2 data set with GGR and RTP, and the §2.8.3 paytable record. *Still open: the Selected Person feed format and Resolution 605 Live mode.* | Order 240 Arts. 2.2, 3.3; Order 222 Annex 1 Art. 21(b); Res. 605; GLI §2.8.1(b) | Engineering | ◐ |
| **G24** | **No RTP definition, PAR sheet or variance monitoring.** Order 240 Art. 2.2(a.e) makes RTP a reported figure. The work is **defining** theoretical return for a pari-mutuel game, where it is a function of handle rather than of a paytable, then documenting it per GLI §A.6.1 with change records, a theme/paytable record carrying lifetime aggregates, and a **periodic theoretical-vs-actual comparison** with escalation bands. §4.7.2 also requires the ≈98% figure already in player copy to be accompanied by an explanation of its derivation and the surge/reserve contribution breakdown **→ Partial 2026-09-11.** RTP **defined** for a pari-mutuel game (`core/rtp.ts`) with the §4.7.2 derivation rendered to players, and §A.6.2 variance bands. The quoted figure was also **wrong** — 98% is the base term alone; it is now 99.0%. decisions-log #67. *Still open: the PAR sheet document.* | Order 240 Art. 2.2(a.e); GLI §§A.6.1, A.6.2, 4.7.2, 2.8.3 | Math + Compliance | ◐ |
| **G28** | **No change-classification procedure.** Law Art. 24¹.2 and Order 222 Art. 16.3 prohibit supplying a materially changed game without prior Revenue Service consent and a fresh certificate. Material change covers the bet placed, amount of winnings, **game architecture**, combination lines, **RNG platform** and **jackpot payout system**. Measured against `decisions-log.md`, that captures most of a release cycle. Needs: a triage procedure, a trigger register, a frozen certified build, and **configuration sealed into the certified artefact** — a config change to `RAKE` or the stake tiers is a material change exactly as a code change is | Law Art. 24¹.2; Order 239 Arts. 8.1, 8.1¹; Order 222 Annex 1 Art. 16.3 | Engineering + Compliance | ☐ |
| **G7** | **Hosting incompatible with sealing.** Order 239 Art. 9.1 requires a **security seal** affixed to our servers; Resolution 455 Art. 4.2 prices **integration equipment placed at the supplier**. Neither is possible on Cloudflare Workers/D1/Durable Objects. Decision D3: Georgian hosting for all critical components, Cloudflare restricted to CDN/WAF for static assets — and note Order 222 Art. 16.2 names **the CDN** as a recorded change surface. Must precede integration; cannot be redone after sealing | Order 239 Art. 9.1; Res. 455 Art. 4.2; Order 222 Annex 1 Art. 16.2; GLI §§B.2.2, C.3 | Engineering | ☐ |

---

## 4. HIGH

| ID | Gap | Source | Owner | Status |
|---|---|---|---|---|
| **G12** | `"Malfunction Voids All Pays"` notice not placed clearly and legibly on the game surface **→ Closed 2026-09-11.** Permanent legal strip on the game surface, plus the rules sheet and the game-information dialog. | Order 222 Annex 1 Art. 8.1(b) | Engineering | ☑ |
| **G45** | No versioned, change-controlled gaming-rules artefact; no log of rule changes; no binding of **the rules in force when the wager was accepted**; §A.5.2 content (malfunction handling, disconnection, undecided wagers, restricted players, per-jackpot disclosures) absent **→ Partial 2026-09-11.** `RULES_VERSION` + `RULES_CHANGELOG` with material-change classification, stamped on every round at creation so §A.5.1 as-of-wager binding holds. decisions-log #69. *Still open: counsel sign-off and the Georgian text.* | GLI §§A.5.1, A.5.2; Law Art. 12.1(f) | Compliance | ◐ |
| **G27** | No interrupted-game procedure for a round interrupted **between lock and settlement**: return wagers, update balances and history, **inform the regulator**, disable if the failure is likely to recur; and no player disclosure about disconnection effects. *The mid-round action class does not exist at all by design — that is a strength to present, not a gap* **→ Closed 2026-09-11.** A settlement that throws now voids the round, refunds every bet, and records an incident; the disconnection and malfunction disclosures are in `INTERRUPTION_RULES`. decisions-log #71. | GLI §§4.16, 4.5.2(f), A.6.4, A.5.2(c)–(e) | Engineering | ☑ |
| **G11** | Storm Reserve may run negative by design (decisions-log #3); no bankroll-adequacy or insolvency policy; no §4.13.5 diversion-pool analysis showing the scheme has no infinite mathematical expectation **→ Closed 2026-09-11.** Reserve opens capitalized and can no longer go negative; shortfalls are ledgered house backstops, measured at **0.0041% of handle** over 10M rounds. §4.13.5 finite-expectation and bounded-worst-case both asserted. decisions-log #65. | GLI §§A.4.1, 4.13.5, A.6.5(d) | Math + Compliance | ☑ |
| **G21** | No annual integrity and security assessment (due **1 March**, copy to the Selected Person) containing: work carried out, assessor identification, date, materials investigated, recommended corrective actions, completed and planned actions. Includes GLI §B.9 vulnerability assessment, penetration testing and firewall-rules review | Order 222 Annex 1 Art. 15.2; GLI §B.9 | Security | ☐ |
| **G29** | TLS 1.2 minimum to the operator platform, and **sender and recipient of every communication known**, are met in practice but undocumented as controls and untested against a real operator platform | Order 222 Annex 1 Arts. 10.2, 15.1(c); GLI §B.4 | Engineering | ☐ |
| **G37** | No significant-event and alteration log with **value before and after** and the responsible user. This is the evidence that the material-change regime is being honoured. `decisions-log.md` plus git history is a strong substrate but is not a controlled record, and **CDN changes are not tracked at all** **→ Partial 2026-09-11.** `significant_events` records category, component, actor, reason and **value before and after**. *Still open: CDN change tracking and retention.* | GLI §2.9.5; Order 222 Annex 1 Art. 16.2 | Engineering | ◐ |
| **G55** | No incident notification path — Art. 16.1(b) requires **immediate** notification to the operator, Revenue Service and/or Selected Person of anything endangering the security or integrity of the remote gaming server. No contact matrix, no timescale, no incident record | Order 222 Annex 1 Art. 16.1(b); Order 240 Art. 2.2(d) | Compliance | ☐ |
| **G38** | Statistical testing incomplete. Draw uniformity (χ²) and independence-from-pools exist; the **full seven-test battery at 99% confidence** does not — chi-square, overlaps, coupon collector, runs, interplay correlation, serial correlation, duplicates. Extends an existing suite **→ Closed 2026-09-11.** All seven tests, over 12 independent streams with the rejection count compared against the 1% rate rather than a single seeded run. decisions-log #70. | GLI §3.2.2; also GLI §A.6.2 RNG output monitoring | Math + Engineering | ☑ |
| **G39** | RNG **state compromise extension** — a hash chain is deterministic once the terminal secret is known, so compromise exposes the remainder of the season. The documented mitigation (mixing a public beacon unpredictable at commit time into each round's HMAC message) is on the roadmap, not implemented. Recommend promoting it into certification scope | GLI §3.3.2(c); rng spec §2 | Engineering | ☐ |
| **G49** | Key management: the fairness chain terminal secret lives in the database in the local build — an explicitly documented local-build compromise that **must not survive to production**. The receipt signing key is already correctly separated (`server_secrets`) | GLI §§B.6.2, B.6.3 | Engineering | ☐ |
| **G48** | No backup, restore, disaster-recovery or UPS posture. Order 240 Art. 3.4 requires **immediate restore** from backup; Art. 3.1 requires continuous 24-hour operation | Order 240 Arts. 3.1, 3.4; GLI §§B.3.3–B.3.9 | Engineering | ☐ |
| **G32** | No disable capability: all gaming activity, individual game versions, or individual player logins; no disable-with-conclusion path; no audit-log entry with date, time and reason **→ Partial 2026-09-11.** `GameControl` disables all gaming, a room or a player, audit-logged with date, time and reason; a locked round always concludes. *Still open: operator-facing surface.* | GLI §§2.4.1, 4.15.1, A.6.3 | Engineering | ◐ |
| **G16** | No attestation surface allowing the operator's system to establish that the player device carries no outcome-determining logic, performs no unauthorized extraction and uses no automation. *The first limb is structurally true — the client contains no outcome logic — which is the strongest part of the answer* | Order 222 Annex 1 Art. 3.1(b); GLI §2.6.5(g) | Engineering | ☐ |
| **G41** | Paytable presentation. A pari-mutuel game has no enumerable paytable; §4.4.1(d) requires all winning outcomes and payouts. Needs a **formula-as-paytable** presentation agreed with the laboratory in advance, plus an explicit §4.4.1(k) statement of what the Storm Power multiplier applies to **→ Closed 2026-09-11.** Formula-as-paytable and the §4.4.1(k) "what the multiplier applies to" statement both render from core. | GLI §§4.4.1(d), 4.4.1(j)–(l) | Product + Math | ☑ |
| **G44** | Game recall incomplete player-side: §4.14.2 fields (funds before and after, **rake collected**, intermediate phases) are persisted and served by `/api/round/:id` but not rendered; §4.14.3 wants the last **50** events and the Wreck Log holds ~20 | GLI §§4.14.2, 4.14.3 | Engineering | ☐ |
| **G13** | No place in the client for the Selected Person's **Digital Seal** (▽ the operator places it, but our surface must host it); and our servers must be physically sealable — see G7 **→ Partial 2026-09-11.** The client now has a seal slot; it renders an honest "no licence" statement rather than a decorative badge. *Still open: G7 server sealing.* | Order 239 Art. 9; Order 222 Annex 1 Art. 9 | Engineering | ◐ |

---

## 5. MEDIUM and LOW

| ID | Gap | Severity | Source | Owner | Status |
|---|---|---|---|---|---|
| **G23** | No complaint/dispute procedure: 24/7 logging, **5-year** records, a documented process with the regulator, and an operator-facing dispute API. *The HMAC-signed `action_receipts` are already the ideal dispute substrate — only the procedure is missing* | MEDIUM | GLI §A.4.4; Law Art. 12.1(b.c) (≤30-day statutory limit) | Compliance | ☐ |
| **G26** | No retention schedule or purge jobs: chat logs 90 d, complaints 5 y, malfunction data ≥3 y, change records, logs; no log integrity or tamper-evidence policy | MEDIUM | GLI §§A.4.7, A.4.4, B.2.7, B.6.5 | Engineering | ☐ |
| **G25** | No restricted-player list interface (employees, subcontractors, directors, owners, officers and their households) and **no test-account procedure** — directly relevant, since the demo track and bots are test activity in GLI terms | MEDIUM **→ Partial 2026-09-11.** The demo track and practice bots are now disclosed to players as test activity. *Still open: the restricted-player list interface.* | GLI §§A.2.4, A.2.5 | Compliance | ◐ |
| **G47** | Technical security controls undocumented across GLI Appendix B: logical access control and RBAC, **Critical Asset Register** (which maps almost one-to-one onto the Georgian critical-products list — build once, use twice), data-alteration controls, DNS, component hardening, remote access and firewalls, third-party service register, ISMS and incident management | MEDIUM | GLI §§B.2–B.7, C.2 | Security | ☐ |
| **G50** | Art. 24¹.1(d) "list and detailed description of games and critical products/services" not assembled. Source material is strong and unusually complete; it is a packaging job | MEDIUM | Law Art. 24¹.1(d) | Compliance | ☐ |
| **G52** | No calendar control for the **3-day** operator-contract filing and **2-day** amendment filing, or for Selected Person fee payments. A missed filing is a permit-condition breach, not an administrative slip | MEDIUM | Law Arts. 24¹.3, 24¹.4 | Compliance | ☐ |
| **G53** | No inspection-readiness posture. The Revenue Service may inspect at any time, without quantitative limit, and control compliance on an ongoing basis | MEDIUM | Law Arts. 7.3, 7.3¹ | Compliance | ☐ |
| **G56** | **GGR definition for a pari-mutuel game not agreed** with the Selected Person. Measured monthly, IN−OUT is 2% of handle while the surge pot accumulates and drops below it when the pot pays out, so a 5%-of-GGR accrual fee overcharges relative to the economics unless the jackpot liability is recognised. Settle in the Order 239 Art. 4.3 service contract, not afterwards | MEDIUM | Res. 455 Arts. 2(d), 5(b); Order 240 Art. 2.2(a.d) | Finance + Compliance | ☐ |
| **G14** | Georgian localization. `strings.ts` has one locale. On Route A the statutory site disclosure block is ▽ the operator's, but **the detailed game rules must be available in Georgian**, and translation is a regulated artefact — a rules change is a regulated change in both languages | MEDIUM | Law Art. 12.1(f.d) | Product | ☐ |
| **G36** | No surface for player protection information, terms and conditions, privacy policy, or the operator-supplied **last log-in date and time** | MEDIUM **→ Partial 2026-09-11.** Player-protection panel in the game-information dialog. *Still open: T&C, privacy policy and the operator-supplied last log-in.* | GLI §§2.6.9, A.4.5; Order 222 Annex 1 Art. 3.1(a) | Engineering | ◐ |
| **G33** | `limits.ts` is built as a standalone responsible-gaming service; on Route A it must become an **interface** honouring operator-supplied limits and exclusions, where operator limits always win and self-imposed limits never override stricter ones | MEDIUM | GLI §§2.5.5, A.3.7, A.3.8 | Engineering | ☐ |
| **G18** | Statement-of-activity components not exposed: won, lost, and **playing time in hours** | MEDIUM | Order 222 Annex 1 Art. 8.1(e) | Engineering | ☐ |
| **G42** | Bonus clarity: surge rounds need the §4.8.1(c) "you are in a bonus" indication, and the community-bonus eligibility display of §4.8.4(b) | MEDIUM **→ Closed 2026-09-11.** "BONUS ROUND IN PROGRESS" plus a live eligibility line. | GLI §§4.8.1, 4.8.4 | Product | ☑ |
| **G43** | Room routing (busiest affordable table) is not random placement; disclose the rule and the player-protection reason it exists | MEDIUM **→ Closed 2026-09-11.** `TABLE_ROUTING_DISCLOSURE`, rendered in the game-information dialog. | GLI §4.11.1(b); Order 222 Annex 1 Art. 13(b) | Compliance | ☑ |
| **G15** | No location detection: VPN, proxy, RDP, VM, rooted or jailbroken device; pre-game check and 30-minute/IP-change recheck; violation logging. Mostly ▽, but the pre-game check gates our round entry so we must expose the hook | MEDIUM | GLI §§2.7.2–2.7.4, C.5 | Engineering | ☐ |
| **G46** | No in-product path for a player to report suspected cheating, collusion or bot usage. *The detection side is already strong — `collusion.ts` plus the offline scan* | MEDIUM **→ Partial 2026-09-11.** In-product "Report a concern" panel. *Still open: the operator routing path.* | GLI §A.7.3 | Engineering | ◐ |
| **G31** | No documented time-synchronisation discipline across a multi-node deployment | MEDIUM | GLI §2.2.2 | Engineering | ☐ |
| **G35** | No authorized-endpoint pinning, no documented gaming-halt-on-disconnect contract, no compatibility verification with an error on incompatibility | MEDIUM | GLI §§2.6.4, 2.6.6 | Engineering | ☐ |
| **G34** | Player software carries no identifiable software and version information | LOW **→ Closed 2026-09-11.** Build id injected at build time; shown in the game-information dialog. | GLI §2.6.2 | Engineering | ☑ |
| **G40** | No formal attestation that there are no hidden or undocumented controls, and no simultaneous-input test | LOW | GLI §§4.2.2(c), 4.2.3 | Engineering | ☐ |
| **G57** | `pnpm format:check` exists but is deliberately not a CI gate; 100 files fail (decisions-log #51). Under a change-management regime, a repo-wide reformat should land as its own commit before the certified build is frozen | LOW | GLI §B.8 | Engineering | ☐ |
| **G58** | The `no-unsafe-*` ESLint rule family is off by decision (decisions-log #50). Reasoned and defensible, but a laboratory reviewer will ask — have the written justification ready | LOW | GLI §B.2.5 | Engineering | ☐ |

---

## 6. Closed by the Route A decision — retained as interface constraints

These are **operator** obligations. We do not implement them, but each constrains our integration
API, and the design principle that falls out is in
[12](12-georgian-rules-conformance-matrix.md) §7: **hold as little player data as legally possible** —
an opaque operator-scoped player identifier plus an eligibility assertion, and no PII. That keeps us
outside most of the Order 43 and AML surface by construction rather than by policy.

| Was | Operator obligation | Constraint on our interface |
|---|---|---|
| G2 | Player accounts and PII (Order 43 Art. 4.2; Order 222 Annex 1 Art. 4) | We accept an opaque player identifier; we hold no PII |
| G3 | Identification, verification, PSDA check, sanctions screening, annual re-verification | The eligibility assertion must carry a **validity horizon**, because verification goes stale annually |
| G4 | Age 25/18; addicted-persons and prohibited-persons lists | The assertion must be **current at bet time**, not at session start, and must carry an age-eligibility flag — we never hold a date of birth |
| G5 | Deposits, withdrawals, permitted channels, GEL 2,000/24 h e-wallet cap, segregation | We move no money. **Note for the submission:** Landfall moves value between players *within settlement*; that is the pari-mutuel mechanic, not the player-to-player transfer prohibited by Order 41 Art. 4(c), and we should say so before someone else raises it |
| G6 | AML/CFT programme, CDD, STRs to the Financial Monitoring Service | Our reporting must surface the per-player aggregates the operator's CDD needs (GEL 3,000 account-change review, GEL 5,000 threshold) |
| G19 | Account state machine — suspended, blocked, inactive, closed | Our API must refuse a bet whenever the assertion is absent, stale or negative |

---

## 7. Open questions for counsel

| # | Question | Raised in | Owner | Status |
|---|---|---|---|---|
| **Q1** | The Critical Products list §1(q) names "the combination lines of the game" — slot vocabulary with no direct analogue. Will the Selected Person accept the **zone-to-settlement mapping** as the artefact under that head? | [03](03-game-classification.md) §2.3 | Counsel | ☐ |
| **Q2** | Does Chapter IV (peer-to-peer) apply? *Answered conservatively — we treat it as applicable and satisfy Art. 13 in full, because doing so is inexpensive and arguing the opposite is not* | [03](03-game-classification.md) §4.1 | Counsel | ◐ |
| **Q3** | How is **GGR** computed for a pari-mutuel game for the 5%-of-GGR supplier fee, and on what accrual basis given the jackpot liability? | [01](01-regulatory-framework.md) §2.5 | Counsel + Finance | ☐ **G56** |
| **Q4** | **Does the house seed survive GLI §A.7.1 and Order 222 Art. 13(a)?** The recommended ring-fence is in [03](03-game-classification.md) §5.4; fallbacks in §5.5 | [03](03-game-classification.md) §5 | Counsel + Product | ☐ **G8** |
| **Q5** | C1 — can a systemic-electronic operator permit issue **without** a land-based permit? Not our permit, but it determines how many operators can lawfully take our supply | [00](00-compliance-plan.md) §1.4 | Counsel | ☐ |
| **Q6** | Is a **seed-chain rotation** a material change under Art. 24¹.2(e)? A per-rotation consent cycle would be operationally fatal; the outcome to seek is a **standing authorization of the rotation procedure** | [01](01-regulatory-framework.md) §6 | Counsel | ☐ |
| **Q7** | Do Georgian data-protection obligations bind a supplier processing operator-passed player identifiers? *Largely mooted if the minimal-data principle is adopted* | [01](01-regulatory-framework.md) §6 | Counsel | ☐ |
| **Q8** | Must the **demo track** (bots, `LANDFALL_ENV=demo`) be disclosed as part of the supplied product, or is it out of scope because it never reaches an operator? *Recommendation: disclose the gate and its CI assertion as a **control**, turning a potential finding into evidence of change discipline* | [02](02-licensing-strategy.md) §7.3 | Counsel | ☐ |

---

## 8. Sequencing

```
NOW ─────────────────────────────────────────────────────────────────────
  Corporate:    G1, G54            ← longest lead time; blocks everything
  Counsel:      G30, Q1–Q8         ← Q4 blocks a design decision
  Decide:       G8 (house seed)    ← cheapest to change now, costly later

THEN ────────────────────────────────────────────────────────────────────
  Engineering:  G7 (hosting)       ← must precede sealing; cannot be redone after
                G9, G12 (disclosure — small, objective, unarguable wins)
                G17, G10, G22      ← the substantial build
  Compliance:   G20, G28, G45, G24

PRE-AUDIT GATE ──────────────────────────────────────────────────────────
  All BLOCKER + CRITICAL closed and self-assessed against both matrices
  ONLY THEN pay the Selected Person (Order 239 Art. 5.6 — no second chance)

AUTHORIZATION ───────────────────────────────────────────────────────────
  Application (5d) → research (≤15d) → result (7d) → integration (≤45d)
  → certificate (2d)   [a temporary certificate buys 3 months for HIGH rows]

PERMIT ──────────────────────────────────────────────────────────────────
  RS.GE submission → ≤20 days → silence = deemed granted

ONGOING ─────────────────────────────────────────────────────────────────
  Monthly:  jackpot balancing (G10)
  Annual:   integrity & security assessment by 1 March (G21)
  Per change: classification and re-authorization (G28)
  Standing: amendment watch on matsne.gov.ge (G30)
```

**Cheapest real progress available**, because the substrate already exists and only the procedure or
surface is missing: **G22** (export over existing per-stake and snapshot tables), **G23** (dispute
procedure over existing HMAC receipts), **G26** (retention over existing logs), **G37** (change
record over git history and `decisions-log.md`), **G38** (extend the existing statistical suite),
**G55** (incident path over existing metrics and asserts).
