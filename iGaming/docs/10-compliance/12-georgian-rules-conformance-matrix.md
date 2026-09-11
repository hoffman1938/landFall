# Georgian Rules Conformance Matrix

**Subject:** LANDFALL as a holder of a permit for the supply of games of chance and/or prize games
(Route A, B2B GSP).
**Instruments:** the Gambling Law; Order 222 (Annex 1); Order 239; Order 240; Resolutions 455, 605
and the Critical Products list. Operator-only instruments (Order 43 registration/verification,
Order 41 deposits/withdrawals, the AML Law) appear only where they constrain our interface.
**Depends on:** [01-regulatory-framework.md](01-regulatory-framework.md),
[03-game-classification.md](03-game-classification.md)
**Paired with:** [11-gli-19-conformance-matrix.md](11-gli-19-conformance-matrix.md)

---

## Legend

| Mark | Meaning |
|---|---|
| ✅ | **Met** — implemented, with evidence in the repository |
| ◐ | **Partial** — substantially present, with a named shortfall |
| ❌ | **Not met** — no implementation |
| ▽ | **Operator obligation** on Route A — we supply evidence or an interface |
| — | **Not applicable** to this product |

Gap IDs are shared with [22-compliance-gap-register.md](22-compliance-gap-register.md).

**Scoring on rows that are ours: 14 ✅ · 11 ◐ · 21 ❌.** Unlike the GLI matrix — where the product
scores well and the documentation lags — the Georgian matrix is dominated by **corporate and
procedural** obligations that simply have not been started, because the entity does not yet exist.

---

## 1. Gambling Law — permit and corporate conditions

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 5.1 | Supply of games of chance on the territory of Georgia requires a permit | ❌ | **G1** |
| Art. 11.1(h) | The supply of games is a permitted activity | — | Confirms the route |
| Art. 11.1¹ | Permit only to an **entrepreneurial entity registered in Georgia** | ❌ | **G1** |
| Art. 11.3 | Supply permit issued for **5 years** | — | Planning input |
| Art. 11.7 | No permit where **recognised tax arrears** exist | ❌ | Continuing condition; needs a monitoring owner. **G1** |
| Art. 11.8 | Permit is **non-transferable** | — | Constrains any future corporate restructuring |
| Art. 11.9–11.10 | No disqualifying conviction for the person with management and representation authority, founder/partner, or **beneficial owner** — a **continuing** condition | ❌ | Certificates from each principal's country of citizenship. **G1** |
| Art. 24¹.1(a) | Extract from the entrepreneurial register | ❌ | **G1** |
| Art. 24¹.1(b) | Proof of permit-fee payment (**GEL 100,000/yr**) | ❌ | **G1** |
| Art. 24¹.1(c) | Document confirming the **origin of the funds** for the permit fee; the applicant bears responsibility for its accuracy | ❌ | **G1** |
| Art. 24¹.1(d) | **List and detailed description** of games and critical products/services to be supplied | ◐ | Source material is strong — GDD, math-model, rng spec, [03](03-game-classification.md). Not assembled as a submission. **G50** |
| Art. 24¹.1(e) | **Authorization certificate** for the critical products/services | ❌ | The long pole. **G51** |
| Art. 24¹.1(f) | Criminal-record certificates, issued by each principal's country of citizenship | ❌ | **G1** |
| **Art. 24¹.2** | **Material change requires prior Revenue Service consent and a new authorization certificate**, covering changes affecting the bet placed, amount of winnings, **architecture of the game**, combination lines, **RNG platform**, **jackpot payout system**. Supplying a materially changed game without consent is prohibited | ❌ | No change-classification procedure. The single most operationally consequential gap. **G28** — see [02](02-licensing-strategy.md) §7 |
| Art. 24¹.3 | Operator contract to the Revenue Service **within 3 days**; amendments **within 2 days** | ❌ | Needs an owner and a calendar control; a missed filing is a permit-condition breach. **G52** |
| Art. 24¹.4 | Pay the Selected Person's fees on time | ❌ | **G52** |
| Art. 7.3, 7.3¹ | Revenue Service may inspect **at any time, without quantitative limit**, and control compliance on an ongoing basis through the electronic control system | ❌ | Requires an inspection-readiness posture and an access procedure. **G53** |

---

## 2. Order 222, Annex 1 — Requirements/Standards for Systemic-Electronic Games

### 2.1 Chapter V — Requirements for a supplier's remote gaming system/platform *(our primary chapter)*

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| **Art. 14(a)** | Formulate and implement **internal control mechanisms covering all aspects of the operation of the games**, with particular attention to **security, operation and reporting** | ❌ | **G20** — the single document both the Revenue Service and the Selected Person will ask for |
| Art. 14(b) | Submit those mechanisms on request of the Revenue Service and/or the Selected Person | ❌ | **G20** |
| **Art. 14(c)** | **Authorized persons in key positions — at minimum information technology and change management** | ❌ | Named roles in the application and the ICS, not informal ownership. **G54** |
| Art. 15.1(a) | Safe and secure operation of the **remote gaming server** | ◐ | Server-authoritative architecture, structured logging, Prometheus metrics, liveness/readiness split, graceful drain (decisions-log #49). Not documented as a control set. **G47** |
| Art. 15.1(b) | Safe and secure operation of main and auxiliary gaming devices | ◐ | Same |
| **Art. 15.1(c)** | Secure communication with the operator's system: **the recipient and sender of every communication must be known**; a data encryption method and/or secure communications protocol must protect system integrity and communication confidentiality | ❌ | No mutual authentication contract with an operator platform; no documented encryption control. **G29** |
| **Art. 15.2** | **Annual assessment of the integrity and security of the system**, no later than **1 March** each year, with a copy of the report to the Selected Person | ❌ | Report must contain: work carried out; assessor identification data; date; materials investigated; recommended corrective actions; completed and planned actions. **G21** |
| **Art. 16.1(a)** | Supply operators **only** products/services authorized by the Selected Person | ❌ | Depends on G51, then on the §7 release governance in [02](02-licensing-strategy.md). **G28** |
| Art. 16.1(b) | **Continuous monitoring**; immediately notify the operator, Revenue Service and/or Selected Person of anything endangering the security or integrity of the remote gaming server | ◐ | Metrics and structured logging exist; **no notification procedure, no contact matrix, no timescale**. **G55** |
| **Art. 16.2** | Keep protected and stored **all information about each and every change** to the remote gaming server, expressly including **content delivery network**, games and system reporting | ◐ | Git history plus a disciplined `decisions-log.md` is a genuinely strong substrate and should be presented as such. It is not a controlled record with retention and integrity guarantees, and **CDN changes are not tracked at all**. **G37** |
| **Art. 16.3** | **Each and every relevant change must be authorized by the Selected Person before the changed product may be supplied** | ❌ | **G28** |

### 2.2 Chapter VI — Art. 17, Jackpots

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 17.1(a) | Provide players **clear rules on the payment of the jackpot that are easily accessible** | ◐ | Surge rules are described in the Rules sheet; not a complete, accessible jackpot rules artefact. **G10** |
| Art. 17.1(b) | Use a **jackpot program authorized by the Selected Person** | ❌ | **G51** |
| Art. 17.1(c) | Use **jackpot control software authorized by the Selected Person** | ❌ | **A second, separate authorization.** Requires the control software to exist as a distinct, identifiable artefact — reconciliation, balancing, adjustment and decommissioning — which today is code inside settlement. **G10, G51** |
| Art. 17.1(d) | A jackpot for 2+ games must keep the **probability of winning the jackpot the same for all games** | — | One game. State it |
| **Art. 17.2** | **Balancing carried out monthly**; any discrepancy between the jackpot paid out and its contributing components **recorded as an incident** and notified to the Revenue Service and/or Selected Person | ❌ | `surge_pots`, `surge_events` and `storm_reserve_ledger` make this computable today; the **job, the procedure and the incident path do not exist**. **G10** |
| **Art. 17.3** | **Cancellation of unpaid jackpots is not permitted** | ◐ | Rollover is implemented, which is the right behaviour; no written guarantee and no decommissioning procedure. **G10** |
| Art. 17.4 | An unpaid jackpot may be added to another **only if the probability of winning is the same or higher** | — | No second jackpot; constrains any future multi-jackpot design |

### 2.3 Chapter VIII — Art. 21(b), Reporting (suppliers)

| Item | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 21(b.a) | Details of the game transaction | ◐ | `rounds`, `stakes`, `lock_snapshot_json` persist everything; **no reporting interface and no agreed format**. **G22** |
| 21(b.b) | Overview of the bets placed | ◐ | **G22** |
| 21(b.c) | **Jackpot details** | ◐ | `surge_events`, `storm_reserve_ledger`. **G22** |
| 21(b.d) | Other information requested by the Selected Person | ❌ | Needs an ad-hoc query and export capability. **G22** |

### 2.4 Chapter IV — Art. 13, Peer-to-peer *(treated as applicable — [03](03-game-classification.md) §4.1)*

| Item | Requirement | Status | Evidence |
|---|---|---|---|
| **13(a)** | **Must not use automatic or computerized players to play against players** | ✅ | `botsAllowed` hard-false outside `LANDFALL_ENV=demo`; a bots configuration elsewhere is a **startup crash**; CI boots the shipped config under `LANDFALL_ENV=production` and asserts the crash (decisions-log #50, #60, #62). Present as a control with an automated test. *Separately: the house seed — [03](03-game-classification.md) §5, **G8*** |
| 13(b) | Possibility to be placed at a gaming table on a **random basis** | ◐ | No table seating exists; room routing is by stake tier and population (decisions-log #48). Disclose the rule and the player-protection reason. **G43** |
| 13(c) | Define the **time required for the player to perform an action** | ✅ | Fixed ~10 s anchor window, published, with a visible countdown |
| 13(d) | Define the **consequences of failing to act** | ✅ | No bet placed ⇒ no participation, no cost; spectating is a first-class state. To be stated in the regulatory rules |

### 2.5 Provisions that bind the operator but reach into our client

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 3.1(a) | ▽ The website must display the player's **last log-in date and time** | ▽ / ❌ | Our client must render what the operator supplies. **G36** |
| **Art. 3.1(b)** | ▽ The system must be able to establish that the player's device contains **no gaming logic capable of determining the outcome**, performs **no unauthorized data collection or file extraction**, contains no viruses, and uses **no automation** | ◐ | The first limb is structurally true and is our strongest statement: **the client contains no outcome logic** (rng spec; GLI §2.6.5(g)). The attestation *surface* for the operator's system does not exist. **G16** |
| Art. 3.2 | ▽ At least SSL encryption to player devices | ✅ | TLS in transit; formalise under **G29** |
| **Art. 8.1(b)** | ▽ Place the notice **"Malfunction Voids All Pays"** clearly and legibly | ❌ | Belongs on our game surface, not operator chrome. **G12** |
| Art. 8.1(e) | ▽ Statement of gaming activity: deposited, withdrawn, won, lost, balance, promo credit accrued, promo balance, **playing time in hours** | ▽ | We supply the won/lost/playing-time components. **G18** |
| Art. 8.1(f) | ▽ Instructions on responsible gaming mechanisms where they exist | ◐ | `limits.ts` exists but must become an interface to operator-owned limits. **G33** |
| Art. 8.3 | ▽ Internal control mechanisms to the Revenue Service: change management, business continuity, incident notification, AML, fraud/collusion/deception detection, network security, **a detailed diagram of the network, system and data**, credential issuance and player notification, T&C change and consent | ❌ | Largely mirrors our own Art. 14(a) obligation — write once, supply to both. **G20** |
| Art. 9 | ▽ The **electronic security seal (Digital Seal)** on the gaming platform/website | ❌ | ▽ for the operator's site; **Art. 9.1 of Order 239 puts a physical seal on our servers** — see §3. **G13** |
| Art. 10.2 | **Connection between the gaming platform and the supplier's servers at minimum SSL/TLS 1.2** | ◐ | Met in practice, undocumented as a control, and untested against an operator platform. **G29** |
| Art. 12 | ▽ Suspension and blocking of accounts | ▽ | Our API must honour an operator eligibility assertion and refuse bets. **G33** |
| Arts. 4–7 | ▽ Player accounts, account checking above GEL 3,000, closure, inactive accounts | ▽ | Not ours on Route A |
| Arts. 18–20 | Totalizator system requirements | — | Not a totalizator — [03](03-game-classification.md) §2.2 |

### 2.6 Annex 2 — Gaming machines

Not applicable: Landfall is a systemic-electronic game, not a physical gaming machine — no cabinet,
door switches, banknote acceptor, SAS or GAT port. The **80% theoretical payout floor**
(Annex 2 Art. 4.2(d)) is nonetheless likely to be cited at us by analogy; the answer is in
[03](03-game-classification.md) §4.2 — Landfall returns **≈ 98%** and clears it regardless.

---

## 3. Order 239 — Authorization and the Authorization Certificate

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 1.4(c) | Authorization carried out for the area of activity **critical products/services** | ❌ | Our area. **G51** |
| Art. 3 | Electronic application at `www.portal.rsi.ge` with entity name, identification code, authorized representative's identity and personal number, address, contacts, and the list of services | ❌ | Blocked on G1 (entity) and G54 (authorized persons). **G51** |
| Art. 4.3 | Service contract with the Selected Person, fixing the fee within the Resolution 455 ceilings | ❌ | Settle the **GGR definition** here — [02](02-licensing-strategy.md) §6.3. **G56** |
| Art. 5 | **Initial research** (technical audit) ≤15 days for critical products; result within 7 days | ❌ | **The gate.** Art. 5.6 gives **no remediation path** for material non-compliance that cannot be fixed within the process. Enter only after the [11](11-gli-19-conformance-matrix.md) priorities are closed. **G51** |
| Art. 6 | **Integration** — placement of equipment for integration with the electronic control system at the supplier, ≤45 days | ❌ | Requires physical infrastructure we control, i.e. the D3 migration. **G7, G51** |
| Art. 7.1 | Certificate issued within 2 days — indefinite, or **temporary** with ≤3 months to rectify | — | A temporary certificate is a realistic and acceptable outcome to plan for |
| Art. 7.4 | Cancellation grounds — no re-authorization; unpaid fee; defects at re-authorization; temporary conditions unfulfilled | — | Ongoing risk register input |
| Art. 7.5¹ | An operator's certificate for a critical product issues **only where supplied by a licensed supplier** | — | The commercial argument for the permit — [02](02-licensing-strategy.md) §8 |
| **Art. 8.1** | Material change to a game or critical product ⇒ **apply in advance** for re-authorization | ❌ | **G28** |
| **Art. 8.1¹** | A change to the Minister's standards ⇒ apply for re-authorization **within 3 months** | ❌ | Requires an active watch on `matsne.gov.ge` for amendments to Orders 222, 239 and 240. **G30, G28** |
| **Art. 9.1** | The Selected Person affixes a **security seal** to the applicant's devices, "including, but not limited to, gaming machines and **the relevant servers**", precluding unsanctioned modification | ❌ | **Architecturally decisive.** A seal cannot be affixed to a Cloudflare Worker — this, with Resolution 455 Art. 4.2, is why D3 holds even though statutory server localisation does not bind suppliers. **G7** |
| Art. 9.2 | ▽ The organizer places the **Digital Seal** on its website | ▽ | Our client must have a place to render it. **G13** |

---

## 4. Order 240 — Electronic Control System (data we must be able to produce)

| Article | Requirement | Status | Evidence / gap |
|---|---|---|---|
| Art. 2.1 | The System controls the activity of software and equipment at **every holder of a supply permit** | ❌ | **G22** |
| Art. 2.2(a.a–a.c) | Permit holder identification data (name, identification code), **permit number**, **authorization certificate number** | ❌ | Blocked on G1 and G51 |
| **Art. 2.2(a.d)** | **Total GGR** | ◐ | Computable exactly today: `E[GGR] = r × P_z*` per round, with `rakeMinor` persisted per round. **No reporting surface; the definition needs agreement** — [02](02-licensing-strategy.md) §6.3. **G22, G56** |
| **Art. 2.2(a.e)** | **RTP (payout percentage)** | ❌ | The real work is **defining** RTP for a pari-mutuel game, where theoretical return is a function of handle rather than of a paytable. **G24** |
| Art. 2.2(d) | Defects and incidents — any inconsistency or suspicious action originating from the permit holder or its systems, with a description | ❌ | Substrate exists (conservation assert, collusion scan, metrics); no incident record or notification path. **G55** |
| Art. 3.1 | The System functions **continuously, 24 hours a day** | ◐ | Liveness and readiness split, graceful SIGTERM drain, room-loop assertion in readiness (decisions-log #49). No documented availability target or continuity plan. **G48** |
| **Art. 3.3** | On request, information on **each specific transaction or group of transactions** — expressly including **each specific bet placed and each specific jackpot paid** | ◐ | **The most demanding data requirement in the pack.** Per-stake rows and per-round lock snapshots already exist, so the substrate is genuinely there; the **query and export path is not** — and GLI §2.8.1(b) asks for the same thing (CSV/XLS export). Build once. **G22** |
| Art. 3.4 | Information protected against loss, deletion or damage; **immediate restore** from backup | ❌ | No backup or restore procedure. **G48** |

---

## 5. Resolutions 455 and 605 — fees and ECS obligations

| Provision | Requirement | Status | Note |
|---|---|---|---|
| 455 Art. 4.1 | Initial research / certificate fee **≤ GEL 35,000** per area, paid before the service | ❌ | Do not pay before the [11](11-gli-19-conformance-matrix.md) priorities are closed — Order 239 Art. 5.6 |
| 455 Art. 4.2 | Integration equipment placement **≤ GEL 100,000** | ❌ | Presupposes infrastructure we physically control |
| **455 Art. 5(b)** | Operating fee for suppliers **≤ 5% of GGR per month** — ten times the operator rate | ❌ | ≈ 0.10% of handle for this game, ≈ 10% of net economic take. Settle the accrual treatment of the jackpot liability in the service contract. **G56** |
| 455 Art. 2(d) | GGR = bets received minus winnings paid (IN−OUT); for a supplier, on the games it supplies | ◐ | Unambiguous for a single-game supplier. The **timing** question is not — [02](02-licensing-strategy.md) §6.3. **G56** |
| 605 | Rights and obligations re the ECS; the Selected Person may require **periodic technical reports in a specified format** and information in continuous (**Live**) mode | ❌ | "Live mode" is an architectural requirement, not a reporting one. Scope it in [13](13-electronic-control-system-integration.md). **G22** |

---

## 6. Critical Products list — artefacts to be authorized

| § | Critical product | Artefact | Status |
|---|---|---|---|
| 1(a) | Game of chance in systemic-electronic form | The Landfall game | ❌ **G51** |
| 1(d) | **Random number generation platform** | `packages/core/src/rng.ts` | ◐ — technically the strongest artefact we have ([11](11-gli-19-conformance-matrix.md) Ch. 3); not yet authorized |
| 1(f) | Systemic-electronic gaming platform and components | `packages/server` | ❌ Component mapping not written. **G50** |
| 1(g), 1(h), 1(k), 1(l) | Remote gaming server / system / supplier servers / outcome-determining servers | Production deployment | ❌ Blocked on D3. **G7** |
| 1(p) | **Architecture of the game** | Round lifecycle, six zones, pari-mutuel settlement | ◐ Documented to an unusually high standard already (GDD, math-model); not assembled as a submission. **G50** |
| 1(q) | Combination lines of the game | Zone-to-settlement mapping | ◐ Labelling question **Q1** |
| 1(r) | Website supply, hosting, remote technical servicing | `packages/web` + hosting | ❌ **G7** |
| 1(s) | Software **and its updates** | Every release | ❌ **G28** |
| 1(v), 1(w) | Server operation; remote administration | Ops | ❌ **G47** |
| — | **Jackpot platform** (Law Art. 3(cc), 3(dd)) | Storm Surge pot + Storm Power ladder | ❌ **Two** authorizations required. **G10, G51** |

---

## 7. Constraints inherited from operator obligations

Not our rows, but they shape the integration API. The full treatment goes in
[13-electronic-control-system-integration.md](13-electronic-control-system-integration.md).

| Source | Constraint on our interface |
|---|---|
| Order 43 Arts. 5–6; Law Art. 29.1(p) | A player must be **identified and verified before any bet**. Our API must require, and refuse to act without, an operator assertion of verified status |
| Law Art. 32.1 | **Georgian citizens ≥ 25, foreign/stateless ≥ 18**. The eligibility assertion must carry an age-eligibility flag; we must never hold the date of birth |
| Law Arts. 7¹, 32.1¹ | **Addicted-persons and prohibited-persons lists.** The assertion must be current at bet time, not at session start |
| Order 43 Art. 3.6 | **Annual re-verification.** The assertion must be able to go stale, so it needs a validity horizon |
| Order 41 Art. 4(c) | **No transfers between player accounts.** Landfall moves value between players *within settlement* — this is the pari-mutuel mechanic, not a transfer, and the distinction should be stated explicitly in the submission before someone else raises it |
| Order 222 Annex 1 Art. 4(k)–(l) | **15-minute** idle re-authorization; block after **3** failed logins — both stricter than GLI. Our client must support a 15-minute idle contract |
| Order 222 Annex 1 Art. 5 | ▽ Account changes above **GEL 3,000** periodically checked — we supply the win/loss events that feed it |
| AML Law Art. 11 | ▽ CDD at registration and at the **GEL 5,000** cash/prize threshold. Our reporting must be able to surface per-player aggregates the operator needs |

**Design principle that falls out of this table:** we should hold **as little player data as legally
possible** — an opaque operator-scoped player identifier plus an eligibility assertion, and no PII.
That keeps us outside most of the Order 43 and AML surface by construction rather than by policy,
and it is a materially better answer at audit than a data-protection programme covering data we
never needed. Carried into
[16-data-protection-and-retention.md](16-data-protection-and-retention.md).

---

## 8. Priorities

**Corporate track — start immediately, longest lead time, blocks everything**

G1 (entity, criminal records, funding trail, tax standing), G54 (authorized persons in IT and change
management — required by Order 222 Art. 14(c) *and* named in the Order 239 Art. 3 application).

**Before the Selected Person's initial research** — Order 239 Art. 5.6 offers no second chance

G7 (hosting, so servers can be sealed), G28 (change classification), G20 (internal control system),
G10 (jackpot controls), plus the GLI priorities G9, G12, G17, G45.

**Can be built on substrate that already exists** — cheapest real progress available

G22 (export and reporting over existing per-stake and snapshot tables), G37 (change record over git
history and `decisions-log.md`), G55 (incident path over existing metrics and asserts), G24 (RTP
definition over the existing math model).

**Watch item**

G30 — Orders 222, 239 and 240 have all been amended since the PDF snapshot, and Order 239 Art. 8.1¹
gives us **3 months** from any standards change to apply for re-authorization. An amendment watch is
a standing obligation, not a one-time verification.
