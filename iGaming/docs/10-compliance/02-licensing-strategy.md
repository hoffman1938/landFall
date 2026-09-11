# Licensing Strategy — Supply Permit (B2B GSP)

**Decision:** Route A, per [00-compliance-plan.md](00-compliance-plan.md) §0 (D1).
**Depends on:** [01-regulatory-framework.md](01-regulatory-framework.md)
**Consumed by:** [20-certification-and-audit-plan.md](20-certification-and-audit-plan.md),
[13-electronic-control-system-integration.md](13-electronic-control-system-integration.md)

---

## 1. The position in one paragraph

LANDFALL will be licensed in Georgia as a **holder of a permit for the supply of games of chance
and/or prize games** — a B2B Game Service Provider. We do not run a website, hold player funds,
verify identities, or file suspicious-transaction reports. We build, certify and supply a single
critical product — the Landfall game, its RNG platform and its jackpot platform — to Georgian
operators who already hold casino or gaming-machine-salon permits and who carry the player-facing
obligations. Our permit costs **GEL 100,000 per year**, runs **5 years**, requires **no land-based
venue**, and is available to any entity registered in Georgia whose principals are clean.

## 2. Why this route

| | Route A — GSP (chosen) | Route B — B2C operator |
|---|---|---|
| Permit fee | **GEL 100,000/yr** | GEL 100,000/yr *with* a land casino or slot permit; **GEL 1,000,000** (slots-online) to **GEL 5,000,000** (casino-online) without one |
| Gambling business fee | **None** | **GEL 250,000–300,000 per quarter** where the permit rests on a land object |
| Land-based facility | **Not required** | Required as the permit base (subject to open question C1) |
| Player lifecycle, KYC, AML, payments, exclusion registers | **Operator's obligation** | Ours, in full |
| Documents to produce | **15** | 23 |
| Gaps to close | G8–G13, G17, G20–G29 | all of G1–G29 |
| Selected Person operating fee | ≤ **5% of GGR/month** | ≤ 0.5% of GGR/month |
| Revenue model | Share of the game's GGR, per operator contract | Full GGR, minus everything above |

Route A removes the four largest work blocks in the gap register — player accounts and KYC (G2–G4),
real money (G5), and the AML programme (G6) — while preserving the asset that actually has value:
a **certified, sealed, authorized instant game** that any Georgian operator can plug in, and that
the same certification work makes portable to other GLI-19 jurisdictions.

Route B stays open. It is a strictly additive step later, on the same certified game, and nothing in
this strategy forecloses it. The one thing to preserve for that option is **Georgian hosting**
(decision D3), because Route B *does* impose statutory server localisation.

## 3. Document checklist — Law Art. 24¹.1

What must reach the Revenue Service, via the electronic submission at **RS.GE**:

| # | Document | Status | Owner | Notes |
|---|---|---|---|---|
| a | Extract from the entrepreneurial register (LEPL National Agency of Public Registry) for the legal entity | ☐ Not started | Corporate | Requires the entity to exist first — §4 |
| b | Document confirming **payment of the permit fee** (GEL 100,000 for one year) | ☐ | Finance | |
| c | Document confirming the **origin of the funds** used to pay the permit fee | ☐ | Finance | *The applicant bears responsibility for its accuracy* (Law Art. 12.1(k) parallel). Expect this to be scrutinised — prepare a clean, documented funding trail |
| d | **List and detailed description** of the games and/or critical products/services to be supplied | ◐ Source material exists | Product + Compliance | Drafted from [03-game-classification.md](03-game-classification.md) and the existing GDD/math/RNG docs |
| e | **Authorization certificate** confirming compliance of the critical products/services with the Minister's standards/requirements | ☐ | Compliance | **The long pole.** Issued by the Selected Person after the three-stage process — §5 |
| f | **Certificate of criminal record** for the person with management and representation authority, the founder/partner (if any), and the **beneficial owner** — issued by the **country of citizenship** of each | ☐ | Corporate | Non-Georgian principals mean foreign issuance plus apostille and certified translation. Start early |
| g | Any other document the Revenue Service requests | — | Compliance | |

Two conditions are not documents but are checked: **no recognised tax arrears** (Law Art. 11.7), and
**no disqualifying conviction** for any principal (Art. 11.9–11.10), which is a *continuing*
condition, not a one-time check.

## 4. Entity

- **Form:** an entrepreneurial entity **registered in Georgia** (Law Art. 11.1¹). LLC (შპს) is the
  normal vehicle.
- **Beneficial ownership** must be determinable and clean. Art. 3(gg²) imports the AML Law's
  definition of beneficial owner (Art. 13), so the chain must be traceable to natural persons.
- **Corporate governance:** Order 222 Annex 1 Art. 14(c) requires **authorized persons in key
  positions, at minimum in information technology and change management**. These are named roles in
  the application and in the internal control system, not informal ownership. Appoint them before
  authorization, because the Selected Person will ask who they are.
- Recommended additional named roles, from the obligations in
  [01-regulatory-framework.md](01-regulatory-framework.md) §3: a compliance owner (the Revenue
  Service and Selected Person relationship), a security owner (the annual assessment, incident
  notification), and a jackpot controller (monthly balancing, incident reporting).

## 5. Critical path

Two tracks run in parallel; the authorization track is the long one.

```
CORPORATE                      ┌─ entity registration
                               ├─ criminal-record certificates (foreign issuance + apostille)
                               ├─ funding trail + permit fee
                               └──────────────────────────────────┐
                                                                  │
AUTHORIZATION   ┌─ D3 hosting migration ─┐                        │
                ├─ close blocking gaps ──┤                        │
                ├─ GLI-19 lab testing ───┤                        │
                └─ Selected Person: ─────┘                        │
                     application (5d) → fee → research start (≤20d)│
                     → initial research (≤15d, +15) → result (7d)  │
                     → integration (≤45d, +30) → certificate (2d)  │
                                                                  ▼
                                              PERMIT APPLICATION (RS.GE)
                                              → decision ≤20 days
                                              → silence = deemed granted
```

### 5.1 Statutory minimum, best case

| Stage | Days |
|---|---|
| Selected Person examines the application | 5 |
| Commencement of initial research after fee payment | ≤ 20 |
| Initial research (critical products) | ≤ 15 |
| Result delivered | ≤ 7 |
| Integration (critical products) | ≤ 45 |
| Certificate issued | ≤ 2 |
| **Authorization subtotal** | **≈ 94 days (~13 weeks)** |
| Revenue Service permit decision | ≤ 20 |
| **Total, no extensions, no defects** | **≈ 114 days (~16 weeks)** |

With the one-time extensions the regime allows (+15 research, +30 integration), the authorization
track alone reaches ~139 days. A **temporary certificate** (Order 239 Art. 7.1(b)) buys up to
3 months to rectify immaterial defects and is a realistic outcome to plan for, not a failure.

### 5.2 What actually determines the date

The statutory clocks are not the constraint. These are:

1. **Closing the blocking technical gaps** before the initial research, because Order 239 Art. 5.6
   gives **no remediation path** where the research finds *material* non-compliance that cannot be
   fixed within the current process — the authorization simply terminates and the fee is spent.
   Going into the audit with G9, G10, G12, G13 and G17 open invites exactly that finding.
2. **The D3 hosting migration**, which cannot be done after sealing.
3. **GLI-19 laboratory testing** — RNG source-code review and a statistical battery at 99%
   confidence, which the lab schedules, not us.
4. **Criminal-record certificates** from each principal's country of citizenship.

**Recommended sequence: close gaps → migrate hosting → GLI lab → Selected Person → permit.** Paying
the Selected Person's fee before the product is ready is the most expensive mistake available here.

### 5.3 Expedited service

For the supply permit (PDF p. 414): **5 working days — GEL 10,000; 10 working days — GEL 5,000;
20 working days — free.** Since the permit decision is a 20-day clock at the *end* of a ~13-week
authorization process, expediting it buys little. Spend the money on the authorization track
instead.

## 6. Cost model

### 6.1 One-time

| Item | Amount | Source |
|---|---|---|
| Initial research / authorization certificate | **≤ GEL 35,000** per area of activity | Resolution 455 Art. 4.1 |
| Placement of integration equipment at the supplier | **≤ GEL 100,000** | Resolution 455 Art. 4.2 |
| Expedited permit service (optional) | GEL 0 / 5,000 / 10,000 | PDF p. 414 |
| GLI-19 laboratory certification | *Commercial, not in the PDF* | Quote required |
| Entity formation, legal, translations, apostilles | *Commercial* | |

### 6.2 Recurring

| Item | Amount |
|---|---|
| Permit fee | **GEL 100,000 / year** |
| Selected Person operating fee | **≤ 5% of GGR / month** |
| Annual integrity & security assessment | Commercial; due by 1 March |
| Re-authorization on each material change | Per Resolution 455 ceilings, each time |

### 6.3 What the 5% supplier fee actually costs, for this game

Worth computing explicitly, because the supplier rate is **ten times** the operator rate and Landfall
runs on a thin, honest margin.

Landfall's settlement (math-model §2): the struck pool is lost in full; survivors receive their
stakes back plus `(1 − r) × P_z*`. So for a round with handle `T` and struck pool `P_z*`:

```
IN   = T
OUT  = (T − P_z*) + (1 − r) × P_z*  =  T − r × P_z*
GGR  = IN − OUT = r × P_z*          →  E[GGR] = (r/K) × T = 2% of handle
```

So the measured GGR is the **gross take, 2% of handle** — and 5% of that is **0.10% of handle**
flowing to the Selected Person.

Against that, the *operator's* net hold is the house share of the rake, ≈ **1% of handle**
(`RAKE_SPLIT.house = 0.5`), because the surge and reserve shares (0.5% + 0.5%) return to players
through the Storm Surge pot and the Storm Power ladder. The Selected Person's fee is therefore
roughly **10% of the game's net economic take** — material, but not structural.

**Two open items this raises**, both carried to the gap register:

- **Timing.** Measured month by month, IN−OUT is 2% of handle while the surge pot is *accumulating*
  and drops below it in months when the pot pays out. A monthly 5%-of-GGR fee on an accrual basis
  overcharges relative to the economics unless the jackpot liability is recognised. This needs a
  written position agreed with the Selected Person in the service contract, not discovered later.
- **Whose GGR.** Resolution 455 Art. 2(d) note defines a supplier's GGR as bets placed on *the games
  it supplies* minus winnings paid. For Landfall that is unambiguous — one game, one pool. It would
  not be for a supplier of many games, so do not assume the Selected Person's standard contract
  states it our way.

## 7. Release governance — the constraint that changes how we ship

Law Art. 24¹.2 and Order 222 Annex 1 Art. 16.3 together prohibit supplying a materially changed game
without prior Revenue Service consent and a fresh authorization certificate. Material change
expressly covers changes affecting **the bet placed by a player, the amount of winnings, the
architecture of the game, the combination lines, the RNG platform, and the jackpot payout system**.

### 7.1 What this captures, measured against our own history

From `09-remediation/decisions-log.md`, changes that would each have required prior consent:

| Decision | Change | Material-change limb |
|---|---|---|
| #1, #2 | Storm Power ladder frequencies and the ×500 tier | Amount of winnings |
| #3, #7 | Reserve clamp and its floor | Amount of winnings |
| #4 | Rake-split rounding to the house | Architecture |
| #8 | Flat-odds Golden Anchor | Jackpot payout system |
| #18 | Whale cap semantics | Bet placed by a player |
| #23, #59 | Stake tiers; `MAX_STAKE_MINOR` 5,000 → 500,000 | Bet placed by a player |
| #45–#48 | Adaptive house seed, asymmetric EMA, whale-cap floor, room routing | Architecture; amount of winnings |
| #63 | Bot stake ladder | Architecture *(demo-only — but see §7.3)* |

That is most of a release cycle. A studio that shipped 63 recorded decisions post-R5 cannot operate
that way under a supply permit.

### 7.2 The operating model that follows

- **A frozen certified build.** One version is authorized, sealed and supplied. It does not change
  between authorizations.
- **A separate uncertified track** for development and demonstration, which never reaches an
  operator. Landfall already has the mechanism for this: `LANDFALL_ENV=demo`, with a **startup crash**
  outside demo and a CI job asserting it (decisions-log #50, #60, #62). That gate becomes a
  regulatory control, and should be documented as one in
  [14-internal-control-system.md](14-internal-control-system.md).
- **A change classification procedure.** Every change is triaged before merge: *material* (needs
  consent + re-authorization), *recorded* (Art. 16.2 — must be stored and protected, including CDN
  and reporting changes), or *neither*. The register of triggers lives in
  [20-certification-and-audit-plan.md](20-certification-and-audit-plan.md).
- **Batched release trains.** Because each material change costs a re-authorization cycle (≤15 days
  research + ≤45 days integration + fees up to GEL 35,000), material changes are batched into
  planned releases measured in **months**, not shipped continuously.
- **Config is not an escape hatch.** `RAKE`, `RAKE_SPLIT`, the stake tiers in
  `packages/server/config/rooms.json`, the Storm Power ladder and the liquidity parameters are all
  runtime-configurable today. Under Art. 24¹.2 a config change to any of them is a **material
  change** exactly as a code change would be. The certified artefact must therefore include the
  configuration, and config changes must be sealed and change-controlled with the binary.

### 7.3 An open question worth raising early

Does the demo track — bots, `LANDFALL_ENV=demo`, fast rounds — need to be disclosed as part of the
supplied product, or is it out of scope because it never reaches an operator? Order 222 Annex 1
Art. 13(a) prohibits computerised players against players, and our bots exist only in demo. The
honest answer is to disclose the gate and its CI assertion as a **control**, which turns a potential
finding into evidence of change discipline. Carried as Q8 in the gap register.

## 8. Operator relationships

- **Who can buy from us.** Only holders of a Georgian permit for arranging a casino or a gaming
  machine salon, extended to systemic-electronic form (Law Art. 11.2¹). Open question C1 affects how
  many such operators exist and whether online-only operators can lawfully take supply.
- **Contract filing.** Each operator contract to the Revenue Service **within 3 days**; each
  amendment **within 2 days** (Art. 24¹.3). This is a permit condition, so a missed filing is a
  permit-condition breach, not an administrative slip. It needs an owner and a calendar control.
- **The operator needs us to be licensed.** Order 239 Art. 7.5¹ means an operator cannot get an
  authorization certificate for our game unless we are a licensed supplier — which is the
  commercial argument for the permit, and worth putting in front of prospective operators.
- **Integration surface.** TLS 1.2 minimum, with sender and recipient of every communication known
  (Order 222 Annex 1 Arts. 10.2, 15.1(c)). The operator carries the player lifecycle; our API must
  therefore accept an already-verified player identity and must refuse to accept a bet for an
  unverified, excluded or underage player — which means the contract and the API both need an
  explicit **player-eligibility assertion** from the operator. Specified in
  [13-electronic-control-system-integration.md](13-electronic-control-system-integration.md).

## 9. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Initial research finds **material** non-compliance | Authorization terminates (Order 239 Art. 5.6); fee spent; restart | Close the blocking gaps *before* paying. Pre-audit against [11](11-gli-19-conformance-matrix.md) and [12](12-georgian-rules-conformance-matrix.md) |
| Material-change regime throttles the roadmap | Product velocity drops from days to months | Accept it and design for it — §7.2. Batch releases; freeze config into the certified artefact |
| House seed fails GLI A.7.1 | Design change late in certification | Resolve in [03-game-classification.md](03-game-classification.md) §5 **now**, not at audit |
| GGR definition disputed with the Selected Person | Fee 2× what the economics support | Settle in writing in the service contract — §6.3 |
| Principal's criminal record or a tax arrear | Permit refused outright, or cancelled later | Continuous monitoring, not a one-time check (Art. 11.9–11.10 is continuing) |
| Amended instruments since the PDF snapshot | Pack cites superseded law | Gap **G30** — counsel verifies against `matsne.gov.ge` before filing |
| No Georgian operator adopts a novel mechanic | Permit cost with no revenue | Commercial, out of scope here — but note the permit is 5 years and the fee is annual |

## 10. Next actions

| # | Action | Owner | Blocks |
|---|---|---|---|
| 1 | Engage Georgian gambling counsel; hand over [01](01-regulatory-framework.md) §6 and §7 | Compliance | Everything |
| 2 | Identify the current Selected Person; obtain the integration specification and service-contract template | Compliance | Authorization track, §6.3 |
| 3 | Decide the house-seed position (Q4) | Product + Compliance | Certification, classification |
| 4 | Scope the D3 hosting migration | Engineering | Authorization track |
| 5 | Obtain a GLI-19 certification quote and lead time | Compliance | Timeline |
| 6 | Begin entity formation and criminal-record certificate collection | Corporate | Permit application |
| 7 | Triage the existing backlog against §7.2's change classification | Engineering | Release planning |
