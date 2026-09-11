# Regulatory Framework — Georgia, B2B Game Supply

**Depends on:** [00-compliance-plan.md](00-compliance-plan.md)
**Consumed by:** [02-licensing-strategy.md](02-licensing-strategy.md),
[11-gli-19-conformance-matrix.md](11-gli-19-conformance-matrix.md),
[12-georgian-rules-conformance-matrix.md](12-georgian-rules-conformance-matrix.md)
**Scope:** the instruments that bind LANDFALL as a **holder of a permit for the supply of games of
chance and/or prize games** (Route A, decision D1). Obligations that fall on the *operator* rather
than on us are marked ▽ and are listed only where we must supply evidence for them.

> Source: `docsEng-combined.pdf`. Every citation here must be re-verified against the current
> Georgian text at `matsne.gov.ge` before filing — see §7.

---

## 1. The shape of the regime

Georgia regulates gambling through one statute and a layer of Ministerial orders and Government
resolutions, with technical control delegated to a private contractor called the **Selected
Person**. Four parties matter:

| Party | Role |
|---|---|
| **Revenue Service** (LEPL, under the Ministry of Finance) | Issues and cancels permits; maintains the addicted-persons and prohibited-persons lists; consents to game rules and material changes; inspects; fines |
| **Selected Person** | A contractor selected by the Revenue Service to implement and operate the **electronic control system**. Performs the technical audit, issues the **authorization certificate**, places integration equipment, affixes **security seals**, issues the website **Digital Seal**, and receives ongoing reporting. Its own server must be in Georgia (Law Art. 36¹.5) |
| **Financial Monitoring Service** (LEPL) | Receives AML/CFT reports. ▽ — binds operators as accountable persons, not suppliers |
| **Permit holders** | Operators (B2C) and **suppliers/GSPs (B2B — us)** |

The structural point that makes Route A viable: under **Order 239 Art. 7.5¹**, an operator can
obtain an authorization certificate for a critical product *only if that product is supplied to it
by a licensed supplier of games of chance*. The GSP permit is not an optional wrapper — it is the
only lawful way to put a third-party game in front of a Georgian operator.

---

## 2. Instrument map

### 2.1 Law of Georgia "On Arranging Lotteries, Games of Chance and Prize Games"

*(the "Gambling Law"; PDF pp. 61–100 official EN, pp. 220–250 machine translation)*

The parent statute. Provisions that bind a supplier:

| Article | Requirement |
|---|---|
| Art. 3(aa), (bb) | Defines **supply of games of chance** — supply, direct or indirect, of critical products/services to a game organizer *and/or to a person outside the territory of Georgia*, which may influence or does influence game outcomes |
| Art. 3(cc) | Defines **critical products/services** — includes games arranged in systemic-electronic form, the **RNG platform**, the **jackpot platform**, the **gaming platform including the servers on which the outcome is directly determined**, the player database, the financial database, and the management system |
| Art. 3(gg³) | Defines **authorization certificate** |
| Art. 5.1 | Supply of games of chance on the territory of Georgia **requires a permit**; supply without one, or breach of permit conditions, is a violation |
| Art. 11.1 | The supply of games of chance is a permitted activity (Art. 11.1(h)) |
| Art. 11.1¹ | A permit is issued **only to an entrepreneurial entity registered in Georgia** |
| Art. 11.3 | The supply permit is issued for **5 years** |
| Art. 11.7 | No permit where recognised **tax arrears** exist |
| Art. 11.8 | The permit **may not be transferred** to another person |
| Art. 11.9–11.10 | No permit where the person with management/representation authority, founder/partner, or **beneficial owner** has an unexpunged conviction for an intentional economic crime (including financial-sector crime) or an intentional grave/particularly grave crime. The prohibition is continuing, not just at issue |
| **Art. 24¹.1** | **The supply-permit document checklist** — see [02-licensing-strategy.md](02-licensing-strategy.md) §3 |
| **Art. 24¹.2** | **Material change requires prior Revenue Service consent + a new authorization certificate.** Material change expressly includes changes affecting the bet placed, the amount of winnings, the **architecture of the game**, the **combination lines**, the **RNG platform**, and the **jackpot payout system**. Supplying a materially changed game without consent is prohibited |
| **Art. 24¹.3** | The contract with each operator must reach the Revenue Service **within 3 days** of signature; amendments **within 2 days** |
| Art. 24¹.4 | The supplier must pay the Selected Person's fees on time |
| Art. 24².2 | The Minister of Finance may set the requirements/standards for critical products — this is the authority for Order 222 |
| Art. 7.3, 7.3¹ | The Revenue Service may inspect permit-condition compliance **at any time and without quantitative limit**, and may control compliance on an ongoing basis through the electronic control system |
| Art. 7.4–7.5 | Fines for permit-condition breaches; payable within 30 calendar days |
| Art. 36¹ | The electronic control system, the Selected Person, and the fees payable to it |

▽ Operator-side articles we must nevertheless design *for*, because our game runs inside their
obligations: Art. 29.1 (organizer obligations), Art. 32 (age 25/18 and the two exclusion lists),
Art. 12.1(f) (rules of the systemic-electronic game and the mandatory Georgian disclosure block),
Art. 27 (rules displayed at the place of play and given to the player on first request).

### 2.2 Order No. 222 of the Minister of Finance (31.08.2021) — Requirements/Standards

*(PDF pp. 26–49; amended by Order 51 of 21.02.2022 and Order 257 of 30.09.2021)*

**The core technical rulebook.** Three annexes; only Annex 1 concerns us.

- **Annex 1** — Requirements/Standards for Games of Chance and/or Prize Games Organized in
  Systemic-Electronic Form
- **Annex 2** — Requirements/Standards for Gaming Machines *(physical machines; not applicable, but
  see §4.2 on the 80% payout floor)*
- **Annex 3** — Requirements/Standards for a POS Terminal *(totalizator only; not applicable)*

Annex 1 structure and what binds a supplier:

| Chapter | Articles | Binds us? |
|---|---|---|
| I — General provisions and definitions | 1–2 | Yes (definitional) |
| II — Requirements for players and their accounts | 3–7 | ▽ Operator. Art. 3.1(b) (player-device assurance) and Art. 3.2 (SSL) reach into our client, see §4.3 |
| III — Requirements for the operator's system/platform | 8–12 | ▽ Operator |
| **IV — Peer-to-peer games** | **13** | **Yes — see [03-game-classification.md](03-game-classification.md)** |
| **V — Requirements for the remote gaming system/platform of a supplier** | **14–16** | **Yes — our primary chapter** |
| **VI — Jackpots** | **17** | **Yes — Storm Surge and Storm Power** |
| VII — Totalizator systems | 18–20 | No |
| **VIII — Reporting** | **21** | **Yes — Art. 21(b)** |

**Chapter V in full, because it is the specification we are certified against:**

*Art. 14 — Requirements for the system/platform of a supplier.* Every supplier owning a remote
gaming system/platform (including a remote gaming server) through which it supplies games or other
critical products/services to an operator must:
- (a) formulate and implement **internal control mechanisms covering all aspects of the operation of
  the games**, with particular attention to the security, operation and reporting of the system;
- (b) submit those mechanisms on request of the Revenue Service and/or the Selected Person;
- (c) have **authorized persons in key positions, at a minimum in information technology and change
  management**.

*Art. 15 — Information technology requirements.* Through its duly authorized person(s) the supplier
must:
- (a) ensure the safe and secure operation of the **remote gaming server**;
- (b) ensure the safe and secure operation of main and auxiliary gaming devices;
- (c) ensure secure communication with the operator's system, such that **the recipient and sender of
  every communication are known**, and a **data encryption method and/or secure communications
  protocol** protects system integrity and communication confidentiality;
- Art. 15.2 — carry out an **annual assessment of the integrity and security of the system** (from
  1 March 2021, no later than 1 March of each following year) and submit a copy of the assessment
  report to the Selected Person.

*Art. 16 — Changes to critical products/services.* The supplier must:
- (a) supply operators **only** products/services authorized by the Selected Person;
- (b) carry out **continuous monitoring** and immediately notify the operator, the Revenue Service
  and/or the Selected Person of any case endangering the security and integrity of the remote gaming
  server;
- 16.2 — keep protected and stored **all information about each and every change** to the remote
  gaming server, *including but not limited to changes to the content delivery network, the games,
  and system reporting*;
- 16.3 — **each and every relevant change must be authorized by the Selected Person before the
  supplier may supply the changed product to an operator.**

> Art. 16.3 and Law Art. 24¹.2 are the same constraint stated twice, once technically and once
> statutorily. Together they mean the certified build is frozen between authorizations. Note also
> that Art. 16.2 names **the CDN** explicitly as a change surface requiring recorded change control —
> which bears directly on decision D3.

**Chapter VI — Art. 17, Jackpots.** A systemic-electronic gaming system may contain a jackpot whose
value increases by a percentage and is paid out on a specific outcome or event. Obligations:
- 17.1(a) provide players **clear, easily accessible rules** on jackpot payment;
- 17.1(b) use a **program authorized by the Selected Person**;
- 17.1(c) use **jackpot control software authorized by the Selected Person** *(a second, separate
  authorization from the program itself)*;
- 17.1(d) a jackpot provided for 2 or more games must keep the **probability of winning the jackpot
  the same for all games**;
- 17.2 **balancing must be carried out monthly**; any discrepancy between the jackpot paid out and
  its contributing components must be **recorded as an incident** and notified to the Revenue Service
  and/or the Selected Person;
- 17.3 **cancellation of unpaid jackpots is not permitted**;
- 17.4 an unpaid jackpot may be added to another existing jackpot **only if the probability of
  winning is the same or higher**.

**Chapter VIII — Art. 21(b), Reporting.** On request, a supplier sends the Selected Person: game
transaction details; an overview of bets placed; **jackpot details**; and any other information
requested.

**Art. 10.2 (communication).** The connection between the operator's gaming platform and the
supplier's servers must use **at minimum SSL/TLS 1.2**.

### 2.3 Order No. 239 (30.09.2020) — Authorization and the Authorization Certificate

*(PDF pp. 50–57; amended by Order 40 of 25.02.2021 and Order 70 of 11.03.2022)*

Defines the three-stage authorization performed by the Selected Person:

1. **Initial research of the system** (technical audit) — assessment of the compatibility of the
   system and/or critical products with the electronic control system.
2. **Integration with the system** — placement of equipment for integration at the supplier.
3. **Issuance of the certificate.**

Authorization is carried out separately per **area of activity**; ours is Art. 1.4(c), *critical
products/services*.

| Provision | Content |
|---|---|
| Art. 3 | Application via the electronic form at `www.portal.rsi.ge`; must state the entity name, identification code, authorized representative's identity and personal number, address and contacts, and the list of services to be authorized |
| Art. 4.1 | The Selected Person examines the application **within 5 days** |
| Art. 4.3 | A **service contract** is concluded, setting the fee within the Resolution 455 ceilings |
| Art. 4.4–4.5 | Refund conditions; requests within 6 months |
| Art. 5.1(d) | **Initial research for critical products: ≤ 15 days** from fee payment; commencement within 20 days of payment |
| Art. 5.2 | One-time extension possible, by no more than the same period again |
| Art. 5.3 | The result is sent **within 7 days** of completion |
| Art. 5.5 | If defects are found: either a period to rectify (failure to rectify terminates authorization), or — if the defect is immaterial and does not hinder integration — proceed and issue a **temporary** certificate |
| Art. 5.6 | No remediation path where the initial research finds **material** non-compliance that cannot be rectified within the current process |
| Art. 6.2(d) | **Integration for critical products: ≤ 45 days** from fee payment |
| Art. 7.1 | The certificate issues **within 2 days** of completing integration — **indefinite** if no defects, **temporary** (≤3 months to rectify) otherwise |
| Art. 7.4 | Cancellation grounds: no re-authorization; unpaid fee; re-authorization finds defects; a new certificate issued; temporary conditions unfulfilled |
| Art. 7.5¹ | An operator's certificate for a critical product issues **only where that product is supplied by a licensed supplier** |
| **Art. 8.1** | **Material change to a game or critical product ⇒ apply in advance for re-authorization** |
| **Art. 8.1¹** | **A change to the Minister's standards ⇒ apply for re-authorization within 3 months** |
| **Art. 9.1** | The Selected Person affixes a **security seal** to the applicant's devices, "including, but not limited to, gaming machines and **the relevant servers**", to preclude unsanctioned modification |
| Art. 9.2 | ▽ The organizer additionally places the **electronic security seal (Digital Seal)** on its website |

### 2.4 Order No. 240 (30.09.2020) — Requirements for the Electronic Control System

*(PDF pp. 58–61)*

Binds the Selected Person, but determines what data we must be able to produce:

- Art. 2.1 — the System must be able to control the activity of the software and equipment used for
  organizing/supplying games at **every** operator and **every holder of a supply permit**.
- Art. 2.2(a) — for systemic-electronic games the controlled data must include, at minimum: permit
  holder identification data (name and identification code), **permit number**, **authorization
  certificate number**, **total GGR**, and **RTP (payout percentage)**.
- Art. 2.2(d) — defects and incidents: any inconsistency or suspicious action originating from the
  permit holder or its systems/equipment, with a description.
- Art. 3.1 — the System functions **continuously, 24 hours a day**.
- Art. 3.3 — the System must be able to provide the Revenue Service, on request, with information on
  **each specific transaction or group of transactions** — where a transaction is *any action carried
  out in the permit holder's gaming system* (expressly including each specific bet placed and each
  specific jackpot paid).
- Art. 3.4 — information protected against loss/deletion/damage, with immediate restore from backup.

> Art. 3.3 is the single most demanding data requirement in the pack: per-bet granularity, on
> demand, indefinitely. Landfall already persists per-stake rows and per-round lock snapshots, so
> the substrate exists; the export and query path does not.

### 2.5 Government Resolution No. 455 (22.07.2020) — Fees payable to the Selected Person

*(PDF pp. 15–17)*

| Fee | Ceiling | When |
|---|---|---|
| Initial research / issuance of the authorization certificate | **≤ GEL 35,000 per area of activity** | Before the service |
| Placement of integration equipment at a supply-permit holder | **≤ GEL 100,000 per permit holder** | Before the service |
| **Operating fee — suppliers** | **≤ 5% of GGR per month** | Per the service contract |
| *(Operating fee — operators, for comparison)* | *≤ 0.5% of GGR per month* | — |

GGR is defined in Art. 2(d): bets received minus winnings paid (IN−OUT). For a supplier, GGR is
"the difference between the bets placed by players on the game(s) supplied by it in systemic-
electronic form to the operator and the winnings paid out to players".

> **This definition needs a reasoned position for a pari-mutuel game.** Landfall's gross take is
> `r/K` = 2% of handle, of which the operator's share is ~1%; the rest returns to players through the
> surge pot and the reserve. A naive IN−OUT reading of a pari-mutuel round could be argued either
> way. Carried as an open item in [22-compliance-gap-register.md](22-compliance-gap-register.md)
> and analysed in [09-rtp-and-par-sheet.md](09-rtp-and-par-sheet.md) when written.

### 2.6 Government Resolution No. 605 (30.09.2020) — Rights and obligations re the ECS

*(PDF pp. 18–25)* — the rights and obligations of the game organizer/applicant, the **game
supplier/applicant**, and the Selected Person for implementing and operating the electronic control
system. Includes the Selected Person's confidentiality duty over personal data, commercial, tax and
banking secrets, its duty to ensure the System functions properly, and its right to require periodic
technical reports in a specified format and to receive information in continuous (**Live**) mode.

### 2.7 Government Resolution — List of Critical Products and Services

*(PDF pp. 101–104; in force for relations arising from 01.02.2022)*

Determines exactly what we must get authorized. The items Landfall triggers:

| § | Item | Landfall artefact |
|---|---|---|
| 1(a) | A game of chance arranged in systemic-electronic form | The Landfall game itself |
| 1(d) | A random number generation platform | The hash chain + HMAC draw (`packages/core/src/rng.ts`) |
| 1(f) | A systemic-electronic gaming platform and each of its components: core system, internal control panel (back office), **Casino Engine**, payment methods system, reporting system, integration module | `packages/server` — coordinator, hub, rooms, receipts, metrics |
| 1(g) | A remote gaming server | Our production game server |
| 1(h) | A remote gaming system/platform | The deployed system as a whole |
| 1(k) | The server(s) used by a **supplier** for supplying games to an operator and/or to a person outside Georgia | Explicitly contemplates cross-border supply |
| 1(l) | Servers on which the outcome of a game is determined | The round coordinator process |
| 1(p) | **The architecture of the game** | The round lifecycle, zones, settlement |
| 1(q) | The combination lines of the game | *(slot terminology; our analogue is the zone/settlement mapping — see classification)* |
| 1(r) | Supply of a website for organizing/supplying a game, web hosting, remote technical servicing | The web client and its hosting |
| 1(s) | Software intended for organizing/supplying a game, **and the relevant updates** | Every release |
| 1(v) | Accompanying and auxiliary services, **including the operation of servers and devices** | Ops |
| 1(w) | Remote administration of the system | Ops access |
| §2 | Anything functionally identical, regardless of what the manufacturer calls it | Anti-avoidance clause |

The jackpot platform (Law Art. 3(cc), Art. 3(dd)) is separately a critical product — Storm Surge.

### 2.8 Law of Georgia "On Licences and Permits"

*(PDF pp. 251–317)* — the general permit procedure: application, decision deadlines, the
**deemed-approval rule** where the authority misses its deadline, appeal, amendment, duplicate
issuance, the departmental permit register, and control over permit-condition fulfilment. The
Gambling Law is *lex specialis*; this is the procedural backstop.

### 2.9 AML/CFT Law ▽

*(PDF pp. 318–349)* — "On Facilitating the Prevention of Money Laundering and the Financing of
Terrorism". Art. 3.1(b.b) makes the **organizer of gambling or prize games** an accountable person.
Art. 11 triggers customer due diligence on: cash receipt or prize payout where the transaction or
linked transactions exceed **GEL 5,000**; and — for systemic-electronic games — **establishing the
business relationship, i.e. registering the client as a player**.

Not our obligation on Route A. It is listed because the operator's CDD flow determines what player
data reaches our platform and when, which constrains our integration API design (a player must be
verified before any bet reaches us).

### 2.10 GLI-19 v3.0 (17.07.2020) — Standards for Interactive Gaming Systems

*(PDF pp. 105–219)* — not Georgian law. It is the international standard an independent test
laboratory certifies against, and the practical yardstick for the Selected Person's technical audit.
Chapters 2, 3, 4 and Appendices A, B, C are mapped clause-by-clause in
[11-gli-19-conformance-matrix.md](11-gli-19-conformance-matrix.md).

Its own §1.3.1(e) is worth noting: the standard deliberately **excludes** AML, financial and business
internal controls from laboratory testing and assigns them to the operational audit performed for the
local jurisdiction. So GLI certification alone never discharges the Georgian obligations — the two
matrices are complements, not alternatives.

---

## 3. Obligation register — what binds LANDFALL as a GSP

Consolidated, deduplicated, and stated as commitments rather than citations.

### 3.1 Corporate and permit

1. Be an entrepreneurial entity **registered in Georgia**.
2. Hold a valid **supply permit** (5 years), with no tax arrears, and never transfer it.
3. Keep management, founders/partners and the **beneficial owner** free of the disqualifying
   convictions — continuously, not only at application.
4. Pay the permit fee of **GEL 100,000 per year** and evidence the **origin of those funds**.
5. Submit every **operator contract within 3 days**, and every amendment within 2 days.
6. Pay the Selected Person's fees on time.

### 3.2 Authorization and change control

7. Hold a valid **authorization certificate** for every critical product/service supplied.
8. Supply operators **only** authorized products.
9. Obtain **prior Revenue Service consent and a fresh certificate before any material change** —
   bet, winnings, game architecture, combination lines, RNG platform, jackpot payout system.
10. Obtain **Selected Person authorization before supplying any changed product**.
11. Apply for **re-authorization within 3 months** of any change to the Minister's standards.
12. Record and protect information about **every change** to the remote gaming server, expressly
    including CDN, game and system-reporting changes.
13. Permit the **security seal** to be affixed to our devices and servers, and preserve it.

### 3.3 Technical and operational

14. Maintain **internal control mechanisms covering all aspects of game operation**, weighted to
    security, operation and reporting, and produce them on request.
15. Appoint **authorized persons in key positions — at minimum IT and change management**.
16. Ensure safe and secure operation of the remote gaming server and auxiliary devices.
17. Ensure **sender and recipient of every communication are known**, and encrypt using at minimum
    **TLS 1.2** to the operator's platform.
18. Carry out an **annual integrity and security assessment** and send the report to the Selected
    Person **by 1 March** each year, containing: work carried out; assessor identification; date;
    materials investigated; recommended corrective actions; completed and planned actions.
19. Monitor continuously and **immediately notify** the operator, Revenue Service and/or Selected
    Person of anything endangering the security or integrity of the remote gaming server.

### 3.4 Jackpot (Storm Surge and Storm Power)

20. Publish **clear, easily accessible** jackpot payment rules.
21. Have both the **jackpot program** and the **jackpot control software** separately authorized.
22. Keep the win probability **equal across all games** a jackpot spans.
23. **Balance monthly**; raise any discrepancy as an **incident** and notify.
24. **Never cancel an unpaid jackpot**; merge only into a jackpot with equal or better odds.

### 3.5 Reporting and data

25. On request, provide the Selected Person with **game transaction details, an overview of bets
    placed, and jackpot details**.
26. Support the ECS data set: permit holder ID and code, permit number, certificate number, **total
    GGR**, **RTP** — continuously available, with **per-transaction granularity on demand**.
27. Accept Revenue Service inspection **at any time, without quantitative limit**, including ongoing
    electronic control.

---

## 4. Where the Georgian rules and GLI-19 diverge

Both apply. Where they differ, the stricter binds. The three that matter:

### 4.1 Session and authentication timeouts ▽

Order 222 Annex 1 Art. 4(k): re-authorization required after **15 minutes** of inactivity.
Art. 4(l): account **blocked after 3 unsuccessful authorization attempts**.
GLI-19 §2.5.4: **30 minutes**. §2.5.3(d): lock after three consecutive failures **in a thirty-minute
period**, unlockable by MFA.

→ Georgian rule binds: 15 minutes, hard block at 3. An operator obligation, but our client must
support a 15-minute idle contract.

### 4.2 Minimum payout percentage

GLI-19 §4.7.1: each **house-banked** game must theoretically pay out a minimum of **75%**.
Order 222 **Annex 2** Art. 4.2(d): a **gaming machine** must mathematically provide a theoretical
payout of at least **80%**; Annex 2 Art. 5(b) sets the same floor for linked machines.
Order 222 **Annex 1** sets **no explicit RTP floor** for systemic-electronic games.

→ Landfall is **not house-banked** — it is pari-mutuel, so §4.7.1 is not directly on point, and the
Annex 2 machine floor is not directly on point either. Player-facing long-run return is ≈ **98%**
(math-model §1), comfortably above both. The obligation that *does* bite is **Order 240 Art. 2.2(a.e)**:
RTP must be a reported figure in the electronic control system. So the work is not achieving a
number, it is **defining, documenting and reporting** one for a pari-mutuel game — see
[09-rtp-and-par-sheet.md](09-rtp-and-par-sheet.md).

### 4.3 Where operator obligations reach into our client

Three Annex 1 articles nominally bind the operator but can only be satisfied by the supplied game:

- **Art. 3.1(a)** — the site must display the player's **last log-in date and time**. Our client
  must render what the operator supplies.
- **Art. 3.1(b)** — the operator's system must be able to establish that the player's device
  contains **no gaming logic capable of determining the outcome**, performs no unauthorized data
  collection or file extraction, and uses no automation. Our client is the thing being attested;
  we must provide the attestation surface (gap **G16**).
- **Art. 8.1(b)** — the **"Malfunction Voids All Pays"** notice must be placed clearly and legibly.
  It belongs on our game surface, not the operator's chrome (gap **G12**).

---

## 5. Timelines the regime imposes

| Clock | Duration | Source |
|---|---|---|
| Revenue Service decision on a permit application | **20 days**; silence ⇒ **permit deemed granted** | PDF p. 1 §5 |
| Expedited permit service (supply permit) | 5 working days = GEL 10,000; 10 = GEL 5,000; 20 = free | PDF p. 414 |
| Selected Person examines the authorization application | 5 days | Order 239 Art. 4.1 |
| Initial research commences | ≤ 20 days from fee payment | Order 239 Art. 5.1 |
| Initial research (critical products) | ≤ 15 days (+ one extension ≤ 15) | Order 239 Art. 5.1(d) |
| Research result delivered | ≤ 7 days after completion | Order 239 Art. 5.3 |
| Integration (critical products) | ≤ 45 days (+ one extension ≤ 30) | Order 239 Art. 6.2(d) |
| Certificate issued | ≤ 2 days after integration | Order 239 Art. 7.1 |
| Temporary certificate rectification window | ≤ 3 months | Order 239 Art. 7.1(b) |
| Re-authorization after a standards change | ≤ 3 months | Order 239 Art. 8.1¹ |
| Operator contract filed | 3 days; amendments 2 days | Law Art. 24¹.3 |
| Annual integrity & security assessment | by **1 March** each year | Order 222 Annex 1 Art. 15.2 |
| Jackpot balancing | **monthly** | Order 222 Annex 1 Art. 17.2 |
| Fine payment after an adverse act | 30 calendar days | Law Art. 7.5 |

**Critical-path estimate for authorization alone: ~12 weeks** (5 + 20 + 15 + 7 + 45 + 2 days), before
any extension, and before the permit application's own 20 days. Entity formation, criminal-record
certificates from each UBO's country of citizenship, and GLI-19 laboratory testing run in parallel
and are likely to dominate. See [02-licensing-strategy.md](02-licensing-strategy.md) §5.

---

## 6. Open legal questions

Carried into [22-compliance-gap-register.md](22-compliance-gap-register.md) with owners.

| # | Question |
|---|---|
| Q1 | **Is a pari-mutuel game of chance supplied B2B classifiable without difficulty?** The Critical Products list is written in slot vocabulary ("combination lines of the game"). Confirm the Revenue Service accepts a zone/settlement mapping as the analogue. |
| Q2 | **Does Chapter IV (peer-to-peer) apply to Landfall?** Payouts are funded by other players; players do not act against each other turn-by-turn. If it applies, Art. 13's random-table-placement and action-time rules attach. |
| Q3 | **How is GGR computed for a pari-mutuel game** for the purposes of the Selected Person's 5%-of-GGR supplier fee (Resolution 455 Art. 2(d), Art. 5(b))? |
| Q4 | **Does the house seed survive GLI A.7.1?** Operator/house money staked into the player pool, winning and losing like a player — see [00-compliance-plan.md](00-compliance-plan.md) §5 and [03-game-classification.md](03-game-classification.md) §5. |
| Q5 | **C1 from the plan** — can a systemic-electronic operator permit issue without a land-based permit? Not our permit, but it determines which operators can lawfully take our supply. |
| Q6 | **Is a "season" of pre-committed seeds a material change when the chain is rotated?** The chain handover is a documented, verifiable event (rng spec §3) but touches the RNG platform, which Art. 24¹.2(e) names as a material-change surface. A per-rotation consent cycle would be operationally fatal; a standing authorization of the *rotation procedure* is the outcome to seek. |
| Q7 | Are there **Georgian data-protection** obligations beyond the sectoral ones (Law of Georgia on Personal Data Protection, as amended 2023) that bind a supplier processing player identifiers passed through from operators? |

---

## 7. Verification status of this document

Every citation here is taken from `docsEng-combined.pdf`. That document is a compilation that mixes
official English translations with machine translations, and several instruments have been amended
since the snapshot:

- Order 222 — amended by Order 51 (21.02.2022) and Order 257 (30.09.2021)
- Order 43 — amended by Order 74 (05.04.2021) and Order 52 (21.02.2022)
- Order 41 — amended by Order 48 (18.02.2022)
- Order 239 — amended by Order 40 (25.02.2021) and Order 70 (11.03.2022)
- The Gambling Law — last amendments in the PDF dated 22.12.2021 (No. 1185) and 14.12.2021 (No. 1083)

The permit-fee and document-checklist pages (PDF pp. 405–417) read as Revenue Service **website
content**, not statute, and must be treated as indicative until confirmed against the Law on Licence
and Permit Fees.

**Status: UNVERIFIED against current Georgian originals.** No part of this pack may be filed until
counsel has completed that check. Tracked as gap **G30**.
