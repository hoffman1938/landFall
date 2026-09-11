# Compliance Plan — Making LANDFALL a Licensed Game in Georgia

**Prepared by:** Engineering, from a full reading of `docsEng-combined.pdf` (417 pages) and the
complete existing `docs/` tree (22 documents, ~5,200 lines) plus the shipped code.
**Status:** Plan, with Decision Gate §3 answered — see §0.
**Branch:** `legality`

---

## 0. Decisions taken

| # | Decision | Chosen | Consequence |
|---|---|---|---|
| **D1** | Licensing route | **Route A — B2B Game Service Provider (GSP)** | Permit fee GEL 100,000/yr. No land-based venue. No player-lifecycle, AML or payments burden on us — those stay with the licensed operator. **Document scope: 15, not 23.** Gaps G2–G6 drop out; G8–G13, G17, G20–G29 remain ours. |
| **D2** | Game category | Game of chance in systemic-electronic form, **gaming-machine family**, supplied as a critical product. Peer-to-peer characteristics analysed in `03-game-classification.md` | Order 222 **Annex 1 Chapter V** (Arts. 14–16) is our primary standards chapter, not Chapters II–III |
| **D3** | Server location | **Georgian hosting for all critical components; Cloudflare restricted to CDN/WAF for static assets** | The Cloudflare Workers → D1 → Durable Objects roadmap in `software-architecture.md` §4 is retired for production. Reasoning revised — see §0.1 |
| **D4** | Sequencing | Phase 1 (foundation) + Phase 2 (conformance matrices) + gap register first | This pass produces 6 documents; the remaining 9 follow after review |

### 0.1 Correction to §2.2/G7 — why D3 still holds, for a different reason

My initial read applied the Georgian-server-localisation requirement to us. On re-checking the
permit checklists (PDF pp. 405–406 for the GSP permit vs pp. 408, 411, 413 for the B2C permits),
**the requirement to declare a server address on the territory of Georgia appears only in the B2C
systemic-electronic operator checklists.** The GSP checklist (Law Art. 24¹.1) requires only: the
register extract, the fee payment, the source-of-funds document, the list and description of games
and critical products/services, the authorization certificate, and criminal-record certificates.
There is no statutory server-localisation clause for suppliers — and the Critical Products list
§1(k) expressly contemplates a supplier's servers serving "a person outside the territory of
Georgia".

D3 is nevertheless correct, on two grounds that are stronger than the one I first gave:

1. **Physical sealing.** Order 239 Art. 9.1 requires the Selected Person to affix a **security
   seal** to the applicant's devices, "which includes, but is not limited to, gaming machines and
   the relevant servers". Resolution 455 Art. 4.2 prices the **placement of integration equipment
   at the supplier** at up to GEL 100,000. A seal cannot be affixed to, and an appliance cannot be
   placed at, a Cloudflare Worker.
2. **Authorization is per-artefact.** Every critical product must be an authorized, change-
   controlled artefact. A multi-tenant global edge runtime whose deployment surface changes outside
   our control is not one.

So the Cloudflare roadmap is retired for critical components regardless — and Georgian hosting is
additionally the path of least resistance if we later exercise Route B, which *does* impose
localisation.

### 0.2 The constraint that will bite hardest on Route A — Law Art. 24¹.2

> "If a game and/or critical products/services supplied by a permit holder **change materially**
> (including where the rule for paying out the jackpot changes, or any type of change is made to
> existing games, or new games are added), it shall be obliged, **in order to obtain the consent of
> the Revenue Service**, to notify it of the relevant change and to submit an authorization
> certificate. Where such consent is not obtained, the permit holder shall be **prohibited from
> supplying** the materially changed game."

Material change is defined to expressly include changes affecting: **the bet placed by a player,
the amount of winnings, the architecture of the game, the combination lines of the game, the RNG
platform, and the jackpot payout system.**

Measured against Landfall's actual history, that captures almost everything the team has shipped.
From `09-remediation/decisions-log.md` alone: the Storm Power ladder (#1, #2), the reserve clamp
(#3, #7), the rake-split rounding (#4), flat-odds Golden Anchor (#8), the whale cap (#18), the
stake tiers (#23, #59), the adaptive house seed (#45–#48), the bot stake ladder (#63) — each is a
change to the bet, the winnings, the architecture, or the jackpot system, and each would have
required prior Revenue Service consent and a fresh authorization certificate.

**This is a change to how the studio ships, not a document.** It belongs in
`02-licensing-strategy.md` as a release-governance section and in `20-certification-and-audit-plan.md`
as the re-authorization trigger register, and the practical consequence — a release train measured
in months rather than days, with a frozen certified build and a separate uncertified demo track —
should be understood before the permit is applied for, not after.

Secondary obligation from the same article: the **contract with each operator must reach the Revenue
Service within 3 days** of signature, and any amendment within 2 days (Art. 24¹.3).

---

> **Read this first.** This is an engineering-and-compliance working baseline, not legal advice.
> Every conclusion below must be reviewed and signed off by Georgian gambling counsel before it is
> relied on. The source PDF is a *compilation* that mixes official English translations with
> machine translations of the Georgian originals, and the two disagree in places (§1.4 lists the
> disagreements I found). Where they disagree, the Georgian original at `matsne.gov.ge` governs.

---

## 1. What the source document actually contains

`docsEng-combined.pdf` is not one document. It is eleven stacked instruments plus one
international technical standard. Knowing which is which matters, because they bind different
parties and are amended on different clocks.

### 1.1 The instruments

| # | PDF pages | Instrument | Binds |
|---|---|---|---|
| 1 | 1–3 | Revenue Service guidance: issuance of B2B/B2C permits; authorization-certificate process | Permit applicants |
| 2 | 4–11 | **Order No. 43 (26.02.2021)** — Rule for Registration, Identification and Verification of a Player | B2C operators |
| 3 | 11–14 | **Order No. 41 (26.02.2021)** — Rule for Depositing/Withdrawing Funds | B2C operators |
| 4 | 15–17 | **Resolution No. 455 (22.07.2020)** — fees payable to the Selected Person | Operators + GSPs |
| 5 | 18–25 | **Resolution No. 605 (30.09.2020)** — rights/obligations re the electronic control system | Operators + GSPs + Selected Person |
| 6 | 26–49 | **Order No. 222 (31.08.2021)** — Requirements/Standards, Annex 1 (systemic-electronic games), Annex 2 (gaming machines), Annex 3 (POS terminals) | **Operators + GSPs — the core technical rulebook** |
| 7 | 50–57 | **Order No. 239 (30.09.2020)** — Rule of Authorization & Authorization Certificate | Operators + GSPs |
| 8 | 58–61 | **Order No. 240 (30.09.2020)** — Requirements for the Electronic Control System | Selected Person |
| 9 | 61–100 | **Law of Georgia "On Arranging Lotteries, Games of Chance and Prize Games"** (official EN translation) | Everyone |
| 10 | 101–104 | **Resolution: List of Critical Products and Services** (in force from 01.02.2022) | GSPs |
| 11 | 105–219 | **GLI-19 v3.0 (17.07.2020) — Standards for Interactive Gaming Systems** | The certification target |
| 12 | 220–250 | The Gambling Law again (machine translation) | — duplicate |
| 13 | 251–317 | Law of Georgia **"On Licences and Permits"** | Permit procedure |
| 14 | 318–349 | Law of Georgia **"On Facilitating the Prevention of Money Laundering and the Financing of Terrorism"** | Operators as accountable persons |
| 15 | 350–417 | Government resolutions on fees; prohibited-persons list rule; venue-entry recording rule; Revenue Service permit-fee schedule | Permit applicants |

### 1.2 The ten requirements that reshape the product

Stripped of procedure, these are the provisions that change what Landfall *is*:

1. **A permit is mandatory and territorial.** Conducting a game of chance in Georgia without a
   permit is a violation (Law Art. 5.1). Permits issue only to an **entrepreneurial entity
   registered in Georgia** (Art. 11.1¹).
2. **Age 25 for Georgian citizens, 18 for foreign/stateless** (Law Art. 32.1) — not 18/21.
   This is unusually high and is a hard gate at registration and at every login.
3. **Two mandatory exclusion registers**: the *addicted persons list* and the *prohibited persons
   list* (Art. 7¹, Art. 32.1¹). Prohibited persons include **all budget-organisation employees,
   regulatory-body staff, National Bank staff, and members of socially-vulnerable-registered
   families**. The operator queries the Revenue Service per specific player.
4. **Identity verification before any play or any money movement** (Order 43 Art. 6(a)), by one of
   five prescribed methods, plus a **PSDA database check** for Georgian citizens, plus a
   **sanctions-list check**, plus **annual re-verification**.
5. **Money may move only through prescribed channels** (Order 41 Art. 3), with an **e-wallet cap of
   GEL 2,000 per 24 h** unless the wallet belongs to an NBG/EU/UK/US-licensed institution. **No
   player-to-player transfers.**
6. **Every critical product/service needs an authorization certificate** from the *Selected Person*,
   issued after a technical audit and a physical/logical integration into the state **electronic
   control system**. A systemic-electronic game, an RNG platform, a jackpot platform, a gaming
   platform and the servers that decide outcomes are all named critical products
   (Resolution: List of Critical Products and Services, §1(a),(d),(f),(l)).
7. **A state Digital Seal must be displayed on the website** (Order 239 Art. 9.2; Order 222 Annex 1
   Art. 9), proving live integration into the control system.
8. **Server infrastructure must be located on the territory of Georgia**, and its address is a
   required field of the permit application (Revenue Service permit checklists, PDF pp. 409, 411,
   413).
9. **Georgian-language disclosure is mandatory on the site**: organizer name, legal address,
   telephone, permit number, list of games, detailed game rules, and the age/exclusion prohibition
   notice (Law Art. 12.1(f.d)).
10. **The rules of the systemic-electronic game are a regulated artefact.** They are submitted to
    the Revenue Service for consent, it is prohibited to run a game not covered by them, and **any
    amendment requires prior consent** (Law Art. 12.1(f), 12.1¹; PDF p. 86).

### 1.3 GLI-19 v3.0 — the technical standard behind the authorization

Order 222 sets Georgian standards; GLI-19 is the international standard an independent test
laboratory certifies against, and it is the practical yardstick the Selected Person's technical
audit will use. Its four load-bearing chapters for Landfall:

- **Ch. 2 Platform/System** — system clock, 24-hour control-program self-verification, gaming
  management (disable on demand), player account management, player software rules, **location
  detection**, information to be maintained, reporting.
- **Ch. 3 RNG** — source-code review, statistical battery at 99% confidence, uniform distribution,
  independence, cryptographic strength against direct-cryptanalytic / known-input /
  state-compromise-extension attack.
- **Ch. 4 Game** — player interface, gaming session, rules of play and artwork, outcome selection,
  game fairness, payout percentages and odds, bonuses, **P2P gaming**, **progressive/incrementing
  jackpots**, game recall, disable, **interrupted games**.
- **Appendices A/B/C** — operational audit of gaming procedures, technical security controls
  (B.2–B.9), and third-party service providers.

### 1.4 Contradictions and ambiguities found in the source — counsel must resolve these

| # | The conflict | Why it matters |
|---|---|---|
| C1 | PDF p. 1 states a systemic-electronic gambling permit "may be issued **only** to the operator which holds a permit for casino or slot club", and Law Art. 11.2¹ says the same. But the Revenue Service fee schedule (pp. 415–417) explicitly prices **online-only** permits: casino online without a land permit = **GEL 5,000,000/yr**, slot online without a land permit = **GEL 1,000,000/yr**, and p. 417 states the permit "can be issued both on the basis of the … (land object) permit and without it (online only)". | This decides whether a land-based facility is a precondition for the B2C route, and changes the fee by a factor of 10–50. |
| C2 | Order 222 Annex 1 Art. 4(k)–(l) requires re-authorization after **15 minutes** of inactivity and **blocking after 3 failed logins**; GLI-19 §2.5.3(d)/§2.5.4 says 30 minutes and a lock after three failures in a 30-minute window. | Take the stricter (Georgian) rule. Recorded so the GLI matrix does not read as a deviation. |
| C3 | The Gambling Law's official EN translation and the machine translation in the same PDF use different vocabulary for the same concepts ("Samorine"/"casino", "profitable game"/"prize game", "dependent"/"addicted"). | Terminology in our regulator-facing documents must follow the official Georgian text, not the PDF's machine translation. |
| C4 | Order 222 Annex 1 Art. 7.2 deems funds on an inactive account "abandoned" from the moment of inactivity, while Art. 7.3 requires notice **60 days before** funds are deemed abandoned. | The notice window and the abandonment trigger need a reconciled internal procedure. |

---

## 2. Where Landfall stands today

### 2.1 What already meets the standard — and it is a lot

The provably-fair and settlement engineering is genuinely strong and, in several places, ahead of
what the standards require. These are assets, not gaps:

| Requirement | Landfall's existing position | Evidence |
|---|---|---|
| GLI 3.3.1–3.3.2 cryptographically strong RNG, resistant to known-input and state-compromise attack | CSPRNG-generated terminal secret, SHA-256 pre-committed hash chain, `HMAC-SHA256(seed, "landfall:round:{id}")`. Never seeded from time. `Math.random()` banned by written rule. | `packages/core/src/rng.ts`; `docs/04-architecture/rng-provably-fair-spec.md` §1 |
| GLI 3.2.3 unbiased distribution | Truncation bias computed exactly at **8.9 × 10⁻¹⁶** per zone and disclosed rather than hand-waved | rng spec §1.2 |
| GLI 4.5.2(b),(d) outcome not modified by adaptive behaviour; events of chance independent | The draw function takes **no pool, participant, timing or bet input** — only `roundId`. Structurally incapable of chasing money. | rng spec §1.2; `docs/05-security/security-review.md` §1.9 |
| GLI 4.6.5 constant probability | Exactly 1/6 per harbor, invariant to pools; proven per round by the verification tool | `docs/03-math/mathematical-model.md` §3 |
| GLI 2.6.5(g) no outcome logic in the client | All outcome generation server-side; client receives results only | software-architecture §3 |
| GLI 4.14 game recall | Wreck Log, per-round lock snapshot, one-click verification modal, published seeds | rng spec §6 |
| GLI 2.8.2 game play information retained | `rounds`, `stakes`, `lock_snapshot_json`, `rake_bp`, `powerCapped` persisted per round | `packages/server/src/db/schema.ts` |
| GLI A.7.3 report suspicious players; A.8.1 collusion monitoring | Signed HMAC action receipts on every accepted/rejected order; behavioural telemetry + offline collusion scan | security-review §1.21, §1.25 |
| Order 222 Annex 1 Art. 13(a) no computerised players against players | Practice bots are **hard-gated by construction** — `botsAllowed` is false unless `LANDFALL_ENV=demo`, and a bots config outside demo is a **startup crash**, asserted in CI | security-review §1.24; `.github/workflows/ci.yml` |
| GLI A.6.4 settlement integrity | Single atomic transaction with a runtime conservation assert | security-review §1.20 |
| Order 222 Annex 1 Art. 8.1(f) responsible-gaming mechanisms | Server-enforced session/daily loss limits, per-round stake cap, reality checks, self-exclusion, 24 h loosening cooldown | `packages/server/src/limits.ts`; decisions-log #34–#37 |
| GLI 4.7.1 minimum payout percentage | Pari-mutuel; player-facing long-run return ≈ **98%**, far above the GLI 75% and the Georgian 80% gaming-machine floors | math-model §1, §3 |

**Zero-liability is a licensing advantage worth stating explicitly in the application.** Landfall
is pure redistribution minus rake: the house can never owe more than the round collected
(math-model §3). There is no jackpot-style tail liability of the kind regulators require bank
guarantees and prize-fund securing for.

### 2.2 The gaps, by severity

**Blocking — no legal entity, no permit, no player**

| ID | Gap | Source |
|---|---|---|
| G1 | No Georgian entity; no permit; no authorization certificate; no Selected Person contract | Law Art. 5.1, 11.1¹; Order 239 |
| G2 | **No player accounts at all.** `players` is `(id, name, balance, isHouse, isBot)`. No PII, no DOB, no document data, no verification state, no consent records | Order 43 Art. 4.2; Order 222 Annex 1 Art. 4; GLI 2.8.5 |
| G3 | No identification, verification, PSDA check, sanctions screening or annual re-verification | Order 43 Arts. 3, 5, 6 |
| G4 | No age gate (25/18), no addicted-persons check, no prohibited-persons check | Law Arts. 32.1, 32.1¹, 29.1(t¹) |
| G5 | No real money: no deposits, withdrawals, payment channels, segregation or GEL handling. The build is virtual credits by design | Order 41 |
| G6 | No AML/CFT programme, no designated officer, no STR path to the Financial Monitoring Service | AML Law Arts. 3, 10, 11 |
| G7 | **Hosting incompatibility.** The documented roadmap is Cloudflare Pages → Workers → D1 → Durable Objects, i.e. a globally distributed edge. Critical products must be sealable and change-controlled artefacts with integration equipment physically placed at the supplier — see §0.1. *(Revised: statutory server-localisation binds B2C operators, not GSPs; the conclusion is unchanged, the reasoning is not)* | Order 239 Art. 9.1; Resolution 455 Art. 4.2; software-architecture §4 |

**High — the game itself needs changes to pass authorization**

| ID | Gap | Source |
|---|---|---|
| G8 | **House seed stakes look like proposition/shill play.** The house stakes into the pari-mutuel pool and wins or loses like a player. GLI A.7.1 requires shills to be clearly indicated to all players, requires the operator **not to profit from the play beyond the rake**, and requires that operator-funded wagers cannot be withdrawn and are ultimately lost/played. Landfall does publish seeds in the round header and flags them in the lock snapshot — but the "no profit beyond the rake" test needs either a ring-fencing design change or a reasoned legal position | GLI A.7.1(c),(d); Order 222 Annex 1 Art. 13 |
| G9 | **Storm Power ×500 odds must be prominently displayed.** GLI 4.7.3: the highest advertised award must occur at least once in 100,000,000 games *unless the actual odds are prominently displayed*. Perfect Storm is ~1 in 1,048,576 — 95× more frequent — so the artwork **must** show the real odds. GLI 4.8.6 additionally requires min and max for mystery awards, and the 25×-handle clamp must be disclosed as a payoff ceiling | GLI 4.7.3, 4.7.4, 4.8.6, 4.13.3 |
| G10 | **Storm Surge jackpot controls.** Order 222 Annex 1 Art. 17 requires: the jackpot program *and* the jackpot control software to be separately authorized; **monthly balancing** with any discrepancy raised as an incident and notified to the Revenue Service; **cancellation of unpaid jackpots prohibited**; merging permitted only where win probability is equal or better. GLI 4.13 adds ≤30 s display refresh, ceiling rules, diversion-pool accounting, reset value, simultaneous-trigger handling, disable and decommissioning rules | Order 222 Annex 1 Ch. VI; GLI 4.13, 2.4.2, 2.4.3, A.6.5 |
| G11 | **Storm Reserve may go negative** (decisions-log #3, by deliberate design, with the house backstopping). A regulator reviewing bankroll adequacy will treat an obligation fund that can run negative as a solvency question | GLI A.4.1 operator reserves; A.6.5(d) |
| G12 | `"Malfunction Voids All Pays"` notice not present — it is expressly required, "clearly and legibly" | Order 222 Annex 1 Art. 8.1(b) |
| G13 | State **Digital Seal** not present on the site | Order 239 Art. 9.2 |
| G14 | **English only.** `strings.ts` has one locale. Georgian is mandatory for the statutory disclosure block, and the game rules must be available in Georgian | Law Art. 12.1(f.d) |
| G15 | No location detection: no VPN/proxy/RDP/VM/rooted-device detection, no pre-game location check, no 30-minute/IP-change recheck, no violation log | GLI 2.7.2–2.7.4 |
| G16 | No player-device assurance that the device carries no outcome-determining logic, no unauthorised extraction, no automation | Order 222 Annex 1 Art. 3.1(b) |
| G17 | No 24-hour control-program self-verification with a ≥128-bit digest over executables, libraries, configs, OS files, reporting components and DB elements; no independent third-party verification method | GLI 2.3.2, 2.3.3 |
| G18 | No statement of gaming activity (deposited / withdrawn / won / lost / balance / promo accrued / promo balance / **playing time in hours**) | Order 222 Annex 1 Art. 8.1(e) |
| G19 | Account state machine incomplete: no suspended/blocked/inactive/closed states with the prescribed effects, notifications, restoration conditions, or the prohibited-person fund-return flow and its 90-day abandonment rule | Order 222 Annex 1 Arts. 6, 7, 12 |

**Medium — process, reporting and documentation**

| ID | Gap | Source |
|---|---|---|
| G20 | No internal control mechanisms bundle for the Revenue Service / Selected Person: change management, business continuity, incident notification, AML, fraud/collusion/deception detection, network security, network+system+data diagram, credential issuance and player notification, T&C change and consent | Order 222 Annex 1 Art. 8.3 |
| G21 | No annual system integrity and security assessment (due by 1 March each year, copy to the Selected Person) with the six prescribed report contents | Order 222 Annex 1 Art. 8.4–8.5; Art. 15.2 for GSPs |
| G22 | No reporting feeds to the Selected Person (account transaction detail/overview/status; game transaction detail; bets overview; jackpot detail) and no ECS data set (permit holder ID, permit number, certificate number, **total GGR**, **RTP**) at 24/7 availability and per-transaction granularity on request | Order 222 Annex 1 Art. 21; Order 240 Art. 2.2, Art. 3 |
| G23 | No complaint/dispute procedure (≤30-day statutory examination limit, 24/7 logging, 5-year records, documented process with the regulator) | Law Art. 12.1(b.c); GLI A.4.4 |
| G24 | No PAR sheet / theoretical-RTP documentation and no theoretical-vs-actual variance monitoring procedure | GLI A.6.1, A.6.2 |
| G25 | No restricted-player policy (employees, subcontractors, directors, owners, officers, same household) and no test-account procedure | GLI A.2.4, A.2.5 |
| G26 | No retention schedule: verification documents, venue/entry records 5 y, malfunction data ≥3 y, chat logs 90 d, complaints 5 y, AML records | Order 222 Annex 1 Art. 18(b); GLI A.4.7; venue-entry rule Art. 4(b) |
| G27 | No documented interrupted-game handling for a round interrupted between lock and settlement (return wagers, update balances and history, inform the regulator, disable if likely to recur) | GLI 4.16, A.6.4 |
| G28 | No re-authorization trigger register (material change to the game or any critical product; within 3 months of any change to the Minister's standards) | Order 239 Art. 8 |
| G29 | TLS 1.2 minimum for player↔platform and platform↔GSP is met in practice but not documented as a control | Order 222 Annex 1 Art. 10 |

### 2.3 The documentation problem

All 22 existing documents are written for an explicitly non-commercial build and say so, often in
load-bearing places. These statements must be reversed, not merely footnoted:

- `technical-specification.md` §19: *"This educational build uses virtual credits with no cash
  value, no purchases, no deposits."*
- `game-design-document.md` §7: *"The MVP will not implement real-money wagering, deposits,
  withdrawals, or KYC — educational/local project only."*
- `market-research.md` §4: regulatory analysis is a **placeholder**, explicitly deferred.
- `README.md`: *"Local/educational build — virtual credits only, no real money."*
- `simulation-methodology.md`, `security-review.md`, `software-architecture.md`: all assume no
  regulated context.

---

## 3. Decision Gate — three questions that must be answered before drafting

These change the document set materially. Everything in §4 is sequenced behind them.

### D1 — Which licensing route? *(the big one)*

| | **Route A — B2B: Game Service Provider (GSP)** | **Route B — B2C: Operator** |
|---|---|---|
| What we are | A supplier of a critical product (the Landfall game + its RNG) to licensed Georgian operators | The operator running landfall.ge ourselves |
| Permit | Supply of games of chance and/or prize games | Casino-online or slot-online in systemic-electronic form |
| Permit fee | **GEL 100,000 / year** | **GEL 100,000/yr** with a land casino/slot permit; **GEL 1,000,000–5,000,000/yr** online-only (subject to C1) |
| Quarterly gambling-business fee | None | **GEL 250,000–300,000 per quarter** where issued on a land object |
| Land-based facility | **Not required** | Required, or the online-only fee applies (subject to C1) |
| Selected Person operating fee | ≤ **5% of GGR/month** | ≤ **0.5% of GGR/month** |
| Do we do KYC, AML, payments, RG? | **No** — the operator does. We supply the game | **Yes, all of it** |
| Document set needed | ~12 documents | ~22 documents |
| Work eliminated | G2–G6, most of G15/G18/G19, all payment work | — |

**Recommendation: Route A (B2B GSP) first.** Landfall is a *game*, not a wallet. The B2B route
removes the entire player-lifecycle, AML and payments burden (G2–G6 — by far the largest block of
work), costs GEL 100,000/yr instead of 1–5 million, needs no land-based venue, and still requires
the authorization certificate and GLI-19 certification that constitute the genuinely valuable
technical asset. Route B remains open later on the same certified game.

Note the trade: the Selected Person's operating fee is **5% of GGR for suppliers vs 0.5% for
operators**. On Landfall's ~1% net hold the supplier fee is a real margin question that belongs in
the licensing-strategy document, not a footnote.

### D2 — Which game category? *(drives the permit type and the standards annex)*

Landfall is a **game of chance** under Law Art. 3(a): the outcome depends wholly on chance, it is
conducted by electronic gaming equipment, and participation offers a monetary win. It is **not** a
totalizator (no event forecast), not lotto, not bingo, not a lottery, not a promotional draw.

Within systemic-electronic games of chance it maps most naturally to the **gaming-machine** family
(an RNG-driven electronic game) rather than the casino-table family — which matters because
Order 222 **Annex 2** then supplies the substantive standards (80% minimum theoretical payout,
RNG determination of outcome, rules disclosure in Georgian or English, state restoration after
power loss, retention of the last 50 games).

**Open question for counsel:** Landfall is also a **peer-to-peer game** by construction — payouts
are funded by other players, not by the house. Order 222 Annex 1 Chapter IV (Art. 13) then applies:
no computerised players against players (already satisfied by construction), random table
placement, defined action time and defined consequences of inaction. Getting this classification
right in the application is worth more than any other single paragraph in it, because it is what
makes the house seed (G8) and the pari-mutuel payout legible to the regulator.

### D3 — Where do the servers live?

The permit application requires a **declared server address on the territory of Georgia**. The
documented Cloudflare roadmap (software-architecture §4) is incompatible with that as written.
Options: Georgian-hosted primary (Datahouse / Caucasus Online / Silknet colocation or a Tbilisi
private cloud) with Cloudflare restricted to CDN/WAF for static assets only; or full Georgian
self-hosting. **This is the single largest architectural change** and must be decided before
`software-architecture.md` is rewritten.

---

## 4. The plan

### Phase 0 — Decisions and counsel engagement *(blocking; ~1–2 weeks)*

1. Answer D1, D2, D3.
2. Engage Georgian gambling counsel; hand them §1.4 (C1–C4) as the first brief.
3. Obtain the current official Georgian texts from `matsne.gov.ge` for every instrument in §1.1 —
   the PDF is a snapshot, and several orders were amended in 2022.
4. Confirm the identity of the current **Selected Person** and obtain their integration
   specification and service-contract template (this is not in the PDF and is not public).

**Deliverable:** `docs/10-compliance/22-compliance-gap-register.md` — the live register seeded from
§2.2, with owner, severity, target date and counsel-review status per row.

### Phase 1 — Foundation *(the map before the territory)*

| Document | Contents |
|---|---|
| `01-regulatory-framework.md` | The §1.1 instrument map, expanded: what each instrument requires of us, citation-accurate, with the C1–C4 ambiguities carried as open items and a change-watch list (each instrument's amendment history and where to monitor it) |
| `02-licensing-strategy.md` | Chosen route, entity formation, full document checklist per the Revenue Service lists (extract from the entrepreneurial register, permit-fee payment proof, **source-of-funds document**, criminal-record certificates for management/founders/UBO issued by their country of citizenship, game descriptions, authorization certificate, supplier contracts), fees, expedited-service options (20 days free / 10 days / 5 days), the 20-day deemed-approval rule, and the timeline |
| `03-game-classification.md` | The D2 analysis as a defensible written position: why Landfall is a game of chance, why the gaming-machine family, the P2P analysis under Ch. IV, the house-seed analysis (G8), and the pari-mutuel settlement explained for a regulator who has never seen one |

### Phase 2 — Conformance matrices *(these drive every later document)*

| Document | Contents |
|---|---|
| `11-gli-19-conformance-matrix.md` | Clause-by-clause across Ch. 2, 3, 4 and Appendices A, B, C: requirement → current status → evidence (file/§) → gap ID → owner → target. Starts from §2.1 (which is already substantial) rather than from zero |
| `12-georgian-rules-conformance-matrix.md` | The same against Order 222 Annex 1 (Arts. 3–21) and Annex 2, Order 43, Order 41, Order 239, and Law Arts. 12, 29, 32 |

These two are the backbone. Everything in Phases 3–4 is written to close rows in them, and the
Selected Person's technical audit is effectively a re-run of them.

### Phase 3 — Operational policy pack

*Route A (B2B) needs the starred items only. Route B needs all of them.*

| Document | Closes |
|---|---|
| `05-player-lifecycle-kyc.md` | G2, G3, G4, G19 — registration fields, the five verification methods, PSDA integration, sanctions screening, annual re-verification, the 25/18 age gate, both exclusion registers, the full account state machine with notification and restoration rules |
| `06-aml-cft-program.md` | G6 — accountable-person status, risk-based approach, CDD at registration and at the GEL 5,000 cash/prize threshold, beneficial owner and PEP screening, STR path to the Financial Monitoring Service, retention, designated officer, training |
| `07-responsible-gaming-policy.md` ★ | G4, G19 — limits and exclusions (hardening what `limits.ts` already does), addicted/prohibited-list integration, the prohibited-person fund-return flow and 90-day abandonment, the Player Protection Information page per GLI A.4.5, and the rule that no marketing targets blocked or excluded players |
| `08-payments-and-player-funds.md` | G5 — permitted channels, the GEL 2,000/24 h e-wallet cap and its exemptions, no P2P transfers, segregation of player funds, withdrawal identity controls, the >GEL 3,000 account-change review, inactive-account and abandoned-funds handling |
| `14-internal-control-system.md` ★ | G20 — the Art. 8.3 bundle in full, this being the single document the Revenue Service and the Selected Person will both ask for |
| `15-technical-security-controls.md` ★ | G17, G29 — GLI Appendix B mapped section by section (B.2 system operation, B.3 data integrity, B.4 communications, B.5 third parties, B.6 technical controls, B.7 remote access and firewalls, B.8 change management, B.9 security testing), merged with the existing `security-review.md` rather than duplicating it |
| `16-data-protection-and-retention.md` ★ | G26 — PII inventory, the Art. 4(g) encryption requirements (personal number, ID document data, passwords, financial information), the retention schedule, and player data rights |
| `18-geolocation-and-access-control.md` ★ | G15, G16 — territoriality, VPN/proxy/RDP/VM detection, pre-game and 30-minute rechecks, violation logging, device assurance |

### Phase 4 — Regulator-facing artefacts

| Document | Closes |
|---|---|
| `04-game-rules-regulatory.md` ★ | The formal *Rules of the Systemic-Electronic Game* for Revenue Service consent: game description, bet mechanics, settlement formula, Storm Power and Storm Surge rules, RTP, payout procedure and deadlines, claim procedure with the ≤30-day limit, and the mandatory Georgian disclosure block. **Versioned and change-controlled** — a change needs prior consent, and GLI A.5.1(e) requires applying the rules in force when the wager was accepted |
| `09-rtp-and-par-sheet.md` ★ | G24 — theoretical RTP with the jackpot and Storm Power contributions broken out, all wagering configurations, the theoretical-vs-actual monitoring procedure and escalation thresholds, and the GGR definition used for the Selected Person's fee |
| `10-jackpot-and-bonus-controls.md` ★ | G9, G10, G11 — Storm Surge and Storm Power under Order 222 Ch. VI and GLI 4.13/4.8: authorization of both the program and the control software, monthly balancing and incident reporting, the no-cancellation guarantee, merge conditions, ceiling and diversion accounting, simultaneous-trigger handling, disable and decommissioning, and the Storm Reserve solvency policy |
| `13-electronic-control-system-integration.md` ★ | G13, G22 — the Selected Person relationship: the three authorization stages (initial research ≤45 d, integration ≤30 d, certificate ≤2 d), fees (≤GEL 35,000 audit, ≤GEL 100,000 integration, then the GGR operating fee), the Digital Seal, the reporting feeds, and the Order 240 data set |
| `17-terms-privacy-player-protection.md` | The three player-facing legal texts against GLI A.3.3, A.3.4 and A.4.5, in English and Georgian |
| `19-reporting-and-records.md` ★ | G22, G23, G26 — what goes to the Revenue Service, the Selected Person and the Financial Monitoring Service; formats, cadence, retention; the complaint/dispute process |
| `21-georgian-localization-requirements.md` ★ | G14 — the mandatory Georgian content inventory, where each item appears, and translation governance (a rules change is a regulated change in *both* languages) |

### Phase 5 — Rewrite the existing tree

Not annotations — rewrites. Each existing document gets a revision note in the style the repo
already uses (see the GDD's "Revision note" and decisions-log conventions):

| Document | Change |
|---|---|
| `README.md` | Remove "virtual credits only, no real money"; state the licensed posture and link the compliance pack |
| `06-spec/technical-specification.md` | §19 Monetization rewritten from "virtual credits, no purchases" to the licensed commercial model; §10 Security and §16 Deployment updated for D3; new §24 Regulatory Compliance |
| `02-game-design/game-design-document.md` | §7 Non-Goals rewritten (real money, KYC and deposits move from "will not" to "required"); §3 Ruleset gains the mandatory disclosures (Storm Power odds, malfunction notice, payout ceiling) |
| `01-research/market-research.md` | §4 replaced by a pointer to `01-regulatory-framework.md` — the placeholder becomes real |
| `05-security/security-review.md` | Extended with the GLI Appendix B control set; §1.24 bots policy gains its Order 222 Art. 13 citation |
| `04-architecture/software-architecture.md` | §4 deployment path rewritten for D3; segregation, ECS integration seam, control-program verification |
| `04-architecture/rng-provably-fair-spec.md` | New section: GLI-19 Ch. 3 conformance and certification scope; the roadmap public-beacon hardening promoted to a certification consideration |
| `03-math/mathematical-model.md` | Cross-references to the PAR sheet; the house-seed analysis (G8); the Storm Reserve solvency policy (G11) |
| `03-math/simulation-methodology.md` | Aligned to the GLI 3.2.2 statistical battery (chi-square, overlaps, coupon collector, runs, interplay and serial correlation, duplicates) at 99% confidence |
| `09-remediation/decisions-log.md` | Continues — every deviation taken in this programme gets a row, same format |

### Phase 6 — Certification and audit

`20-certification-and-audit-plan.md`: the GLI-19 test scope and submission package, the annual
integrity-and-security assessment (due 1 March, with the six prescribed contents), penetration
testing and vulnerability assessment cadence per GLI B.9, and the re-authorization trigger
register (G28).

### Phase 7 — Engineering backlog

The document work produces a code backlog. It is tracked as a register rather than written into
prose, and it is large: player accounts and the full KYC pipeline, the money layer, the account
state machine, the two exclusion-register integrations, Georgian localization, the Digital Seal,
the malfunction notice, the Storm Power odds disclosure, jackpot reconciliation jobs, control-program
self-verification, location detection, the ECS reporting feeds, the activity statement, and the
server relocation (D3). Sequenced against the conformance matrices, not against product appetite.

---

## 5. Three things I want to flag before any of this starts

**The house seed is the one design decision most likely to be challenged (G8).** Everything else on
this list is work; this one may be a change to the game. The house stakes real money into a
pari-mutuel pool against players and keeps its winnings. Under GLI A.7.1 that reads as a proposition
position, and the standard says the operator "shall not profit from the play (beyond the rake)" and
that operator-funded wagers "may not be withdrawn, and so shall ultimately be lost/played". Landfall
already does the hard part — the seeds are published before the draw, flagged in the public lock
snapshot, and provably cannot steer the outcome — but the profit test needs either a ring-fencing
design (seed winnings returned to the liquidity pool or the surge pot rather than to house revenue)
or a written legal position. Deciding this early is much cheaper than deciding it during the
technical audit.

**The Cloudflare roadmap and the Georgian server requirement are mutually exclusive as written
(G7/D3).** The architecture document has treated Cloudflare migration as pre-planned with interface
seams in place since the first build. Georgian territoriality does not care about seams. This should
be settled in Phase 0, because `software-architecture.md` cannot be rewritten twice.

**The PDF is a compilation, and parts of it are machine-translated.** Order 222 was amended in
February 2022 (Order No. 51), Order 43 in April 2021 and February 2022, Order 41 in February 2022.
The permit-fee pages read as Revenue Service website content rather than statute. Before any of this
is filed, every citation in the pack must be re-verified against the current Georgian text on
`matsne.gov.ge`. I have written §1.4 so that the known disagreements are visible rather than
silently resolved in our favour.

---

## 6. Proposed document tree

```
docs/10-compliance/
├── 00-compliance-plan.md                      ← this document
├── 01-regulatory-framework.md
├── 02-licensing-strategy.md
├── 03-game-classification.md
├── 04-game-rules-regulatory.md          ★
├── 05-player-lifecycle-kyc.md
├── 06-aml-cft-program.md
├── 07-responsible-gaming-policy.md      ★
├── 08-payments-and-player-funds.md
├── 09-rtp-and-par-sheet.md              ★
├── 10-jackpot-and-bonus-controls.md     ★
├── 11-gli-19-conformance-matrix.md      ★
├── 12-georgian-rules-conformance-matrix.md ★
├── 13-electronic-control-system-integration.md ★
├── 14-internal-control-system.md        ★
├── 15-technical-security-controls.md    ★
├── 16-data-protection-and-retention.md  ★
├── 17-terms-privacy-player-protection.md
├── 18-geolocation-and-access-control.md ★
├── 19-reporting-and-records.md          ★
├── 20-certification-and-audit-plan.md   ★
├── 21-georgian-localization-requirements.md ★
└── 22-compliance-gap-register.md        ★
```

★ = required on **both** the B2B and B2C routes. Unstarred documents are B2C-only; on Route A they
become the *operator's* obligation, and we supply supporting evidence rather than the policy itself.

**Route A scope: 15 documents. Route B scope: 23 documents.**
