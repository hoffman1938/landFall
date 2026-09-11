# 10 — Compliance

Making LANDFALL a **licensed game in Georgia**, supplied B2B to licensed Georgian operators.

> **Not legal advice.** This pack is an engineering-and-compliance working baseline. Every
> conclusion must be reviewed and signed off by Georgian gambling counsel before it is relied on,
> and every citation re-verified against the current Georgian text at `matsne.gov.ge` (gap **G30**).

## Start here

| Document | What it is |
|---|---|
| [00-compliance-plan.md](00-compliance-plan.md) | **The plan.** What the source regulations require, where Landfall stands, the decisions taken, and the phased programme |
| [22-compliance-gap-register.md](22-compliance-gap-register.md) | **The live to-do list.** 53 open gaps with severity, owner and sequencing |

## Decisions taken

| # | Decision | Chosen |
|---|---|---|
| D1 | Licensing route | **B2B — Game Service Provider.** GEL 100,000/yr, 5 years, no land-based venue, no KYC/AML/payments burden |
| D2 | Game category | Game of chance in systemic-electronic form, gaming-machine family, supplied as a critical product |
| D3 | Server location | Georgian hosting for all critical components; Cloudflare as CDN/WAF only |
| D4 | Sequencing | Foundation and conformance matrices first |

## Written so far

| # | Document | Phase |
|---|---|---|
| [00](00-compliance-plan.md) | Compliance plan | 0 |
| [01](01-regulatory-framework.md) | Regulatory framework — the instrument map and the obligation register | 1 |
| [02](02-licensing-strategy.md) | Licensing strategy — route, documents, timeline, cost, release governance | 1 |
| [03](03-game-classification.md) | Game classification — what Landfall is under Georgian law | 1 |
| [11](11-gli-19-conformance-matrix.md) | GLI-19 v3.0 conformance matrix | 2 |
| [12](12-georgian-rules-conformance-matrix.md) | Georgian rules conformance matrix | 2 |
| [22](22-compliance-gap-register.md) | Gap register | 0 |

## Still to write

`04` regulatory game rules · `07` responsible gaming · `09` RTP and PAR sheet · `10` jackpot and
bonus controls · `13` electronic control system integration · `14` internal control system ·
`15` technical security controls · `16` data protection and retention · `18` geolocation and access
control · `19` reporting and records · `20` certification and audit plan · `21` Georgian localization

Documents `05`, `06`, `08` and `17` (player lifecycle/KYC, AML, payments, player-facing legal texts)
are **operator obligations** on Route A and are not in scope — their interface constraints are
recorded in [12](12-georgian-rules-conformance-matrix.md) §7 and
[22](22-compliance-gap-register.md) §6.

## The three things most worth knowing

1. **The product is in better shape than the paperwork.** The RNG and game-outcome chapters of
   GLI-19 are essentially clean — a pre-committed hash chain, a draw that takes no pool or
   participant input, exactly 1/6 per harbor, truncation bias quantified at 8.9 × 10⁻¹⁶, and zero
   operator payout liability. The gaps cluster in disclosure, platform self-verification and
   documented procedure.
2. **The house seed is the one design decision likely to be challenged.** House money staked into
   the player pool looks like a proposition position under GLI §A.7.1. The recommended fix —
   ring-fencing its profit and loss away from operator revenue — is contained and preserves the
   mechanic. Deciding it now is far cheaper than deciding it during the technical audit.
   ([03](03-game-classification.md) §5)
3. **The material-change regime changes how the studio ships.** Law Art. 24¹.2 requires prior
   Revenue Service consent and a fresh authorization certificate before supplying a game whose bet,
   winnings, architecture, RNG or jackpot system has changed — and configuration counts. Release
   trains become months, not days. ([02](02-licensing-strategy.md) §7)
