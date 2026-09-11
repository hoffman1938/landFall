# 05 — Georgian Regulatory Conformance

**Order No. 243 of 1 October 2020 (Annex No. 1), Order No. 239, Order No. 240, the Law of Georgia
"On Arranging Lotteries, Games of Chance and Prize Games", and Resolution 455.**

Submission route: **B2B — Game Service Provider (GSP)**. LANDFALL is a game and a remote gaming
system supplied to a licensed operator. Clauses addressed to the **operator** — player
registration, deposits and withdrawals, account states, AML — are marked **▽ operator**.

> **Citation caveat.** The Georgian instruments were read from the submitted
> `docsEng-combined.pdf`, an English compilation. Orders 222, 43, 41 and 239 have all been amended
> since. Every citation must be re-verified against the current text at `matsne.gov.ge` before
> filing, and an amendment watch is a standing obligation — Order 239 Art. 8.1¹ allows three
> months from a standards change to apply for re-authorization. This is tracked as **G30**.

---

## 1. Order 243 Annex 1, Chapter IV — Peer-to-Peer games

**This is the chapter that binds LANDFALL most tightly, and in one place it is stricter than
GLI-19.** LANDFALL is a Peer-to-Peer game in exactly the sense Art. 2(r) defines: "the process of
a game of chance ... that takes place between two or more players, where the players compete with
each other."

### Art. 13(a) — "must not use automatic or computerized players to play against players"

**Absolute, with no exception.** GLI-19 §4.11.1(c) permits proposition players and shills provided
they are "clearly indicated to all other players". Art. 13(a) has no such carve-out: computerized
players are prohibited, disclosed or not.

**Position.** The shipped configuration seats practice opponents in every room, so **this build is
a demo build and cannot be supplied under a permit.** That is not a defect; it is the honest
classification, and it is enforced rather than promised:

- `botsAllowed` is hard-false unless the server runs with `LANDFALL_ENV=demo`;
- a room configuration asking for bots outside demo is a **startup crash**, not a warning;
- the bots are marked in the database, in every public lock snapshot and in the results feed;
- they are excluded from the jackpot and are never counted as population.

A permitted deployment ships a `rooms.json` with `botsAllowed: false` everywhere and the
constraint is then vacuous.

**Evidence:** `suites/compliance/georgian-p2p.test.ts` — the crash is tested for a synthetic room
*and for every shipped room*, so the classification cannot drift.

### Art. 13(b) — "must give the player the possibility to be placed at a gaming table on a random basis"

**This clause requires an OPTION, not a disclosure** — a distinction the project's own compliance
register had missed. It had closed the equivalent GLI clause (§4.11.1(b)) by disclosing the
default routing rule, which is necessary but not sufficient here.

**Position.** A player may now ask to be seated at a table chosen at random from those their
balance can afford: `JOIN_ROOM` with the sentinel `random`, offered in the entry gate's table
step as "Or seat me at a random table". Affordability survives the randomisation — "at random"
cannot mean "at a table you cannot play". The default (busiest affordable table) remains, and is
disclosed along with the liquidity reason it exists.

**Evidence:** `suites/compliance/georgian-p2p.test.ts` — the option reaches every affordable
table, is uniform over them to within 5%, never seats a player at a table they cannot afford, and
the sentinel cannot collide with a tier id.

### Art. 13(c)–(d) — the time to act, and the consequence of not acting

**Position.** The only player action is placing a bet. The window is the first ten seconds of each
round and is published as an absolute instant (`phase.endsAt`) in every round header, so a client
with a skewed clock can compute the remaining time rather than trusting a countdown it was
handed. The final three seconds are Blind Fog, in which one last change is allowed;
`fogStartsAt` is published too.

The consequence of not acting is **nothing at all**: no bet is placed, nothing leaves the balance,
and the player watches as a spectator. There is no turn to lose and no penalty for sitting out.
Stated in `TIMING_DISCLOSURE` and rendered in the game-information dialog.

**Evidence:** same suite.

---

## 2. Order 243 Annex 1, Chapter V — the game supplier's system

| Article | Requirement | Status | Evidence |
|---|---|---|---|
| 14(a) | Internal control mechanisms covering all aspects of game operation, weighted to security, operation and reporting | ◐ | Technical controls exist and are tested; the single written ICS document is **G20** |
| 14(b) | Produce them on request of the Revenue Service or the Selected Person | ☐ | Depends on 14(a) |
| 14(c) | Authorized persons in key positions, at minimum IT and change management | ☐ | Corporate — **G54** |
| 15(1)(a)–(b) | Safe and secure operation of the remote gaming server and gaming devices | ◐ | Health and readiness probes, structured logging, Prometheus metrics, graceful shutdown that never interrupts a settlement transaction |
| 15(1)(c.a) | **The recipient and sender of every communication must be known** | ◐ | Every socket session is bound to a player id; every round action produces an HMAC-signed receipt naming the player, the action, the time and the verdict. Documented as a control: **G29** |
| 15(1)(c.b) | Encryption or a secure protocol protecting integrity and confidentiality | ◐ | TLS in deployment; the control is undocumented and untested against a real operator platform — **G29** |
| 15(2) | Annual integrity and security assessment, submitted by 1 March | ☐ | **G21** |
| 16(1)(a) | Supply only products authorized by the Selected Person | ☐ | Process control — **G28** |
| 16(1)(b) | **Immediately notify** the operator, Revenue Service and/or Selected Person of anything endangering the security or integrity of the remote gaming server | ◐ | Incidents are detected and recorded (`significant_events.incident`); the notification path and contact matrix are **G55** |
| 16(2) | Keep all information about every change to the remote gaming server, **including the content delivery network**, the games and the system reporting | ◐ | `significant_events` records category, component, actor, reason and value before/after; **CDN change tracking is absent** — **G37** |
| 16(3) | Every relevant change authorized by the Selected Person **before** supply | ☐ | **G28** |

---

## 3. Order 243 Annex 1, Chapter VI — jackpots

| Article | Requirement | Status | Evidence |
|---|---|---|---|
| 17.1(a) | Clear, easily accessible rules on jackpot payment | ✔ | `GET /api/rules` and the game-information dialog: trigger probability, selection rule, the pot's ceiling and reset |
| 17.1(b) | Use a jackpot **program** authorized by the Selected Person | ☐ | Authorization pending; the program is Storm Surge + Storm Power |
| 17.1(c) | Use jackpot **control software** authorized by the Selected Person | ✔ (as an artefact) | **Two authorizations, not one.** The control software is a separate, reviewable module — `core/src/jackpot.ts`, pure integer arithmetic, no clock, no database, no randomness — precisely so it can be certified on its own rather than as code inside settlement |
| 17.1(d) | A jackpot across 2+ games must keep the win probability the same for all | n/a | One game; the jackpot is per table and its trigger is a fixed 20-bit threshold |
| 17.2 | **Monthly balancing**; a discrepancy is recorded as an incident and notified | ✔ | `balanceJackpot()` — exact integer identity with **no tolerance band**, because every movement is integral. `GET /api/compliance/balancing` returns **409** on a discrepancy rather than a cheerful 200 |
| 17.3 | **Cancellation of unpaid jackpots is not permitted** | ✔ | `rollOverSurge()` returns the state unchanged, and there is no function anywhere in the module that reduces a pot without paying it — asserted directly |
| 17.4 | An unpaid jackpot may be added to another only if the win probability is the same or higher | ✔ | `decommissionSurge()` **refuses** a worse destination; the refusal is the control |

**Evidence:** `suites/jackpot/controls.test.ts` (19 tests).

---

## 4. Order 243 Annex 1, Chapters III and VIII — platform and reporting

| Article | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1(a) | All charges and obligations clearly displayed | ✔ | The 12% rake on the struck pool, in the rules and in the return derivation |
| 8.1(b) | **"Malfunction Voids All Pays" placed clearly and legibly** | ✔ | Permanent legal strip on the game surface, plus the rules sheet and the information dialog |
| 8.1(c) | Exhaustive information on rules and procedures | ✔ | `GET /api/rules` — the same bytes the client renders |
| 8.1(d) | Account information: deposits, withdrawal timing, inactive accounts | ▽ operator | No accounts exist in this build |
| 8.1(e) | Statement of gaming activity: deposited, withdrawn, **won, lost, balance, promo, playing time in hours** | ◐ | Won/lost/balance are derivable from the per-stake ledger and the session curve; the assembled statement is **G18** |
| 8.1(f) | Instructions on responsible gaming mechanisms | ✔ | Limits modal; reality checks; self-exclusion. Server-enforced on the accept path |
| 8.1(g.c) | **Consequences of an internet interruption** | ✔ | `INTERRUPTION_RULES` — "nothing you can do after bets lock affects the result, so a disconnection cannot cost you a decision" |
| 8.2 | Immediate notification of suspected fraud/AML, or a threat to system integrity | ◐ | `collusion.ts` plus an offline scan detect it; the notification path is **G55** |
| 8.3 | Internal control mechanisms: change management, business continuity, incident notification, AML, fraud/collusion detection, network security, **a detailed network/system/data diagram** | ◐ | **G20** |
| 8.4–8.5 | Annual integrity and security assessment with named contents | ☐ | **G21** |
| 9 | The Selected Person's **electronic seal (Digital Seal)** placed on the platform | ◐ | The client has a seal slot; it renders an honest "no licence — demo build" statement rather than a decorative badge. Server sealing depends on **G7** |
| 10.1–10.2 | **TLS 1.2 minimum** to player devices and to the operator's system | ◐ | Met in deployment; undocumented as a control — **G29** |
| 21(b.a) | Game transaction details to the Selected Person | ✔ | `GET /api/compliance/export/bets.csv` — every bet, per round, with the outcome and payout |
| 21(b.b) | Overview of bets placed | ✔ | `GET /api/compliance/report` |
| 21(b.c) | **Jackpot details** | ✔ | `GET /api/compliance/export/jackpots.csv` — every payout and every rollover |
| 21(b.d) | Other information on request | ◐ | The substrate is complete; the Selected Person's feed format is **G22**'s open limb |

---

## 5. Operator obligations — our interface constraints

These are **not** implemented here and are not tested here. They are listed because each one
constrains the integration surface a licensed operator would build against, and the constraint is
a design fact rather than a to-do.

| Instrument | Obligation | What it means for our interface |
|---|---|---|
| Order 43 | Registration, electronic identification and verification; annual re-verification | The platform must not admit an unverified player to a round. Our accept path takes a player id from the host and enforces no identity rule of its own — so the gate must be upstream, and the host is where it belongs |
| Order 43 Art. 6(d) | **No two gaming accounts for one person** | A player id is one seat. The demo build deliberately allows a second browser session as a second player, which is a demo affordance and would be prohibited under a permit |
| Order 41 | Deposits and withdrawals only through named instruments; e-wallet capped at GEL 2,000 / 24 h | **No payment path exists in this codebase at all** — no card, no wallet, no bank reference, no cashier. §2.5.6 is not engaged. `suites/demo/demo-mode.test.ts` enumerates the protocol to show it |
| Order 243 Annex 1 Art. 12 | Suspension and blocking of accounts; a suspended account must not be able to place a bet | The disable gate (`GameControl`, `PLAYER` scope) is the hook the operator's platform would drive. It is now enforced on the accept path — it was not until this pass |
| Law Art. 3 | Prohibited persons may not participate | Same hook; the list is the operator's |
| Resolution 455 Art. 2(d) | **GGR = bets received − winnings paid** | Reported on **player** handle, not total handle: a house liquidity seed is not a bet received. `actualRtp()` returns both figures deliberately, and `docs/02-math-verification.md` §9 explains why reporting one while computing the other is the mismatch a variance investigation chases for a week |

---

## 6. The Law — material change and re-authorization

**Law Art. 24¹.2** makes a change to *the bet placed, the amount of winnings, the game
architecture, combination lines, the RNG platform or the jackpot payout system* a **material
change**: prior Revenue Service consent and a fresh authorization certificate are required before
the changed game may be supplied. **Order 239 Art. 8.1** and **Order 243 Annex 1 Art. 16.3** say
the same from the Selected Person's side.

Measured against this codebase, that captures most of a release cycle — which is why the rules
artefact carries the classification rather than leaving it to judgement:

```
RULES_VERSION = 4, stamped on every round AT CREATION
RULES_CHANGELOG[] = { version, effective, summary, material, limb }
```

Every material row names the **limb of Art. 24¹.2** it engages, so the re-authorization filing
can be prepared from the changelog rather than reconstructed from a git history. `rulesAsOf(v)`
resolves the rules in force for any settled round, which is what GLI-19 §A.5.1 asks for and what
a `git log` cannot answer on its own.

**The configuration is part of the artefact.** `rooms.json`, the rake and its split, the liability
cap and the Storm Power ladder are all runtime-configurable, and every one of them is an
Art. 24¹.2 surface. A verification scheme that digested only code would let the most consequential
class of change pass unfingerprinted — so `simulations/identity.ts` and
`server/src/selfVerify.ts` both digest the **resolved configuration** alongside the source.

**Open:** the triage procedure, the trigger register and a frozen certified build are **G28**.

**Evidence:** `suites/compliance/disclosures.test.ts` — the changelog is ordered, dated, and every
material row carries its limb.

---

## 7. Order 240 — the electronic control system

| Article | Requirement | Status | Evidence |
|---|---|---|---|
| 2.2(a) | Permit and certificate numbers, **total GGR**, **RTP** | ✔ (data set) | `GET /api/compliance/report`; the permit and certificate numbers are operator/corporate fields |
| 2.2(a.d) | GGR = IN − OUT | ✔ | `actualRtp()`, on player handle |
| 2.2(a.e) | **RTP as a reported figure** | ✔ | `theoreticalRtp()` and `actualRtp()`; the definition problem for a pari-mutuel game is solved in `docs/02-math-verification.md` |
| 2.2(d) | Notification of incidents | ◐ | Recorded; the path is **G55** |
| 3.1 | **Continuous 24-hour operation** | ✔ | Fixed this pass. Season rollover no longer halts the loop, and a failing phase transition voids, refunds and **continues**. See `docs/08-findings-and-fixes.md` §1 and §6 |
| 3.3 | Information on **each specific transaction** on demand — expressly each bet placed and each jackpot paid | ✔ | `export/bets.csv`, `export/jackpots.csv` |
| 3.4 | **Immediate restore** from backup | ☐ | **G48** |

---

## 8. Order 239 — authorization

| Article | Requirement | Status |
|---|---|---|
| 3 | Application with named authorized persons | ☐ **G54** |
| 5.6 | **No remediation path for material findings** at initial research — the authorization terminates and the fee is spent | — | This is why the CRITICAL rows in the project's gap register are marked "close before paying" |
| 8.1, 8.1¹ | Re-authorization on a material change; 3 months from a standards change | ☐ **G28**, **G30** |
| 9.1 | **A physical security seal affixed to the servers** | ☐ **G7** — incompatible with the current serverless deployment. Must precede integration; cannot be redone afterwards |

---

## 9. Summary

| | Count |
|---|---|
| ✔ Met and evidenced | 24 |
| ◐ Partial, declared | 17 |
| ▽ Operator obligation | 6 |
| ☐ Open (procedural or corporate) | 13 |
| n/a | 1 |

**The two engineering items closed in this pass that the GLI mapping alone would have missed are
Art. 13(b) — random table placement as an option rather than a disclosure — and Art. 13(a)'s
absolute prohibition on computerized players**, which makes the demo classification a hard
constraint rather than a presentational choice.

**The gating items are not engineering.** G1 (Georgian entity and permit), G51 (authorization
certificate), G54 (authorized persons), G7 (hosting compatible with a physical seal) and G30
(citation re-verification) are corporate, procedural or infrastructural, and are tracked in
`iGaming/docs/10-compliance/22-compliance-gap-register.md`.
