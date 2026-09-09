# Provably-Fair RNG Specification — LANDFALL

**Prepared by:** RNG Engineer, with input from Security Architect
**Phase:** 5 (supporting) — RNG/Provably Fair design
**Depends on:** [mathematical-model.md](../03-math/mathematical-model.md)
**Hard rule (unchanged):** `Math.random()` or any non-cryptographic PRNG must never be used for
anything outcome-adjacent. All outcome randomness derives from a CSPRNG
(`crypto.randomBytes` / Web Crypto).

**Revision note — an honest correction.** The previous (Crash-era) spec used per-player client
seeds: `HMAC(serverSeed, clientSeed:nonce)`. That scheme is sound for games where **each player
has their own independent outcome** (dice, solo mines). It does not compose with a **single
shared outcome per round**: one round has one struck zone for everyone, so whose client seed
would feed the HMAC? Any answer (first player's? hash of everyone's?) either privileges one
player or lets the *set of participants* — which the server observes and could influence by
delaying/dropping a join — perturb the outcome. The shared-round industry standard is instead a
**pre-committed hash chain**, and that is what Landfall uses. Player-supplied entropy is
replaced by a stronger guarantee: *every* round's seed is committed (transitively, via the
chain) before *any* round is played.

---

## 1. Scheme: Pre-Committed SHA-256 Hash Chain + Per-Round HMAC

### 1.1 Chain construction (operational setup, repeated per "season")

1. Generate a terminal secret `s_N` = 32 CSPRNG bytes (`N` on the order of 10⁶ rounds).
2. Compute the chain `s_i = SHA256(s_{i+1})` down to `s_0`.
3. **Publish `s_0` (the chain commitment) publicly before any round is played.**
4. Rounds consume seeds in order `s_1, s_2, …`: round `i` uses seed `s_i`, revealed at that
   round's resolution.

Verification is transitive and cumulative: `SHA256(s_i)` must equal the previously revealed
`s_{i-1}` (and `SHA256(s_1) = s_0`, the public commitment). Faking any round would require
inverting SHA-256. Every seed was therefore fixed — provably — before the first round of the
season, which is a *stronger* commitment than the Crash-era per-round commit (it rules out
choosing seeds adaptively between rounds, not just within one).

### 1.2 Per-round outcome derivation

```
digest  = HMAC-SHA256(key = s_i, message = "landfall:round:{roundId}")
u       = int(digest[0:13 hex chars], 16) / 2^52          // uniform in [0, 1)
z*      = floor(u × K)                                     // struck zone, K = 6
```

- 13 hex chars = 52 bits, matching IEEE-754 double mantissa precision (same rationale as the
  previous spec; unused digest bits are discarded safely — HMAC output bits are uniform and
  independent).
- **Truncation bias is quantified, not hand-waved:** 2⁵² mod 6 ≠ 0, so zones receive either
  ⌊2⁵²/6⌋ or ⌈2⁵²/6⌉ of the input space — a per-zone probability deviation of at most
  **8.9 × 10⁻¹⁶** (computed exactly). At any plausible play volume this is orders of magnitude
  below detectability and below the fixed-point resolution of any payout. Rejection sampling
  would remove it entirely at the cost of a variable-iteration hot path; the deviation is
  accepted and disclosed instead.
- The round message includes only `roundId` — **deliberately nothing that any participant
  (including the server operator at round time) can vary**: no bet data, no timestamps, no
  participant list. Combined with the chain pre-commitment, the outcome is a pure function of
  (pre-committed secret, public round counter). This is what §1.9 of the
  [security-review.md](../05-security/security-review.md) relies on: nothing that happens during
  a round can steer the draw — including the house's own seed stakes.

### 1.3 Protocol timeline per round

```
 SERVER                                            CLIENT(S)
   │ (season setup: chain committed, s_0 public)      │
   │ 1. Publish round header ────────────────────▶    │  roundId, chain position,
   │    (before ANCHOR_OPEN)                          │  house seeds h per zone
   │ 2. ANCHOR_OPEN: anchors/stakes accepted  ◀─────  │  players anchor, re-anchor
   │ 3. Lock. LOCKED_STORM begins.                    │
   │ 4. Compute z* from s_i (server-side only);       │
   │    animate storm path (cosmetic, §5) ────────▶   │  anticipation, no info leak
   │ 5. RESOLVED: reveal s_i and z* ─────────────▶    │  payouts settle atomically
   │                                                  │
   │            (anyone recomputes: SHA256(s_i) == s_{i-1}?  HMAC → z* matches?)
```

The seed `s_i` is never transmitted, logged, or branched-on observably before step 5
([security-review.md](../05-security/security-review.md)§1.8-1.9).

## 2. Why a Hash Chain (Not Per-Player Client Seeds) — Decision Record

| | Hash chain (chosen) | Per-player client seed + nonce |
|---|---|---|
| Fits one-shared-outcome rounds | Yes — one seed per round, one outcome for all | No — see revision note above |
| Commitment strength | Entire season pre-committed transitively | Per-round commitment only |
| Player agency in the proof | None directly (the trade-off, stated honestly) | Strong for solo-outcome games |
| Operational model | Generate once per season; reveal sequentially | Rotate on demand |

The loss of player-contributed entropy is real and is mitigated in two documented ways: (a) the
transitive pre-commitment above (the server would have had to choose the *entire season*
adversarially before seeing any behavior — and §1.2 gives it no per-round steering input);
(b) **future hardening (roadmap, not MVP):** mix a public, unpredictable-at-commit-time beacon
(e.g. a future block hash or NIST-beacon value, chosen and announced *after* chain publication)
into every round's HMAC message, proving the operator couldn't have known outcomes even when
generating the chain. This is the established pattern in shared-round crash games and ports to
Landfall unchanged.

## 3. Seed-Chain Lifecycle & Exhaustion

When fewer than a safety margin of seeds remain, the server generates a new chain and publishes
the new commitment `s'_0` **inside a round of the old chain** (binding old to new — the new
commitment is timestamped by the old chain's integrity). Chain handover is logged and visible in
the verification tool.

## 4. What Fairness Does — and Does Not — Cover (player-facing honesty)

The proof guarantees: the struck zone was fixed before betting opened, is uniform across zones,
and cannot be influenced by pools, participants, timing, or the operator's round-time choices.
The proof does **not** cover payout amounts directly — those are deterministic pari-mutuel
arithmetic over the visible pools ([mathematical-model.md](../03-math/mathematical-model.md)§2),
which any player can recheck from the round's published pool snapshot: fairness of the draw is
cryptographic; fairness of the split is arithmetic on public data. The verification tool (§6)
checks both.

## 5. Deterministic Storm-Path Theater

The storm-approach animation (which harbors get "threatened" before landfall) is derived from
later bytes of the same round digest — e.g. feint zones `int(digest[13:15],16) mod K`,
`int(digest[15:17],16) mod K` — so the entire spectacle, feints included, is reproducible from
the revealed seed. Cosmetics carry zero outcome information before the reveal (clients receive
the path only *after* lock, during `LOCKED_STORM`, and it is generated server-side from data
already committed). This closes off the "the animation looked like it was steering toward the
big pool" suspicion with the same proof that covers the outcome. (Modulo-6 bias on a single
byte for feints is ~2.7% — acceptable for pure cosmetics; documented so nobody mistakes the
feint derivation for outcome-grade uniformity.)

## 6. Client-Side Verification Tool (specified, built in Phase 9+)

Framework-agnostic function in `packages/core` plus a first-class UI
([wireframes-and-user-flow.md](../07-ux/wireframes-and-user-flow.md)):

1. Input: `roundId`, revealed `s_i`, previous `s_{i-1}` (auto-filled from history), the round's
   published pool snapshot, and your own stake/zone.
2. Recomputes: `SHA256(s_i) == s_{i-1}` ✓; HMAC → `u` → `z*` ✓ matches announced strike;
   pari-mutuel arithmetic → your exact payout ✓ matches what you were paid; optionally the
   storm-path feints ✓ matches the animation you watched.
3. Output: plain-language pass/fail per check — one tap from the Wreck Log, not buried in
   settings.

## 7. Storm Surge Extensions (same digest, two more spans)

The progressive-jackpot feature ([mathematical-model.md](../03-math/mathematical-model.md)§9)
extends the derivation in §1.2 without new cryptography:

```
uSurge  = int(digest[17:22], 16) / 2^20    // surge trigger roll (20 bits)
uWinner = int(digest[22:35], 16) / 2^52    // Golden Anchor winner roll (52 bits)
surge round  ⟺  uSurge < SURGE_PROB
winner = stake-weighted pick over surviving player stakes (sorted by id) at uWinner
```

**Flat-odds mode (A4, feature-flagged, default off):** when a deployment enables
`surgeFlatEveryN` (env `LANDFALL_SURGE_FLAT_EVERY`), every Nth surge round — counted over the
auditable `surge_events` history — pays the pot with **equal odds per surviving stake entry**
instead of stake-weighted odds. The mode consumes the *same* `uWinner` span (no new span, no
new cryptography): `winner = eligible[floor(uWinner × |eligible|)]` over the same
id-sorted survivor list (`pickGoldenAnchorFlat` in `settlement.ts`). The mode is announced in
the round header (`surgeFlatOdds`) before anchoring, persisted on the surge event, returned in
the round's public verification record, and `verifyRound` recomputes the winner under whichever
mode was announced — a cross-mode mismatch fails verification (tested in `core/test/surge.test.ts`).

**Pre-announcement note (deliberate exception to "no observable seed-dependent behavior"):**
the surge flag is announced in the round header, *before* anchoring — that is the product
point (players pile into surge rounds). This leaks exactly one seed-derived bit, from a span
disjoint from the struck-zone bits (independence is asserted by a dedicated core test), so it
conveys zero information about *where* the storm hits. Honesty of the announcement — both the
flag and the winner — is verifiable from the revealed seed like everything else, and the
verification tool (§6) recomputes both. The surge probability in force is included in the
round's public verification record.

## 8. Security Invariants (cross-reference)

- Seeds generated by CSPRNG only; 32 bytes.
- `s_i` never exposed pre-reveal, including via logs
  ([security-review.md](../05-security/security-review.md)§1.11) or timing
  ([security-review.md](../05-security/security-review.md)§1.8).
- Constant-time comparison for any secret-derived check server-side.
- The draw function's signature takes `(seed, roundId, K)` — **pools are not a parameter**, and
  the simulation suite enforces this boundary
  ([simulation-methodology.md](../03-math/simulation-methodology.md)§3.2).

## 9. v2 Weather, Storm Power, and Spectacle Extensions (implemented)

The category redesign
([category-redesign-v2.md](../02-game-design/category-redesign-v2.md)) introduced Weather
Patterns, Storm Power, and richer storm choreography. All follow the same rule as Storm
Surge: derive from digest spans disjoint from the struck-zone span, publish any pre-round
flags in the round header, and recompute them in the verification tool after seed reveal
(`verifyRound` recomputes weather and power alongside the draw, surge, and payout checks).

Canonical digest span map (hex-char offsets into the 64-char round digest, kept in lockstep
with `packages/core/src/rng.ts`):

| Span | Bits | Purpose | Payout-affecting? |
|---|---|---|---|
| `[0,13)` | 52 | `u` → struck zone | Yes |
| `[13,15)`, `[15,17)` | 8+8 | storm-path feints (cosmetic, §5) | No |
| `[17,22)` | 20 | `uSurge` — Storm Surge trigger (§7) | Yes (jackpot trigger) |
| `[22,35)` | 52 | `uWinner` — Golden Anchor winner (§7) | Yes (jackpot winner) |
| `[35,40)` | 20 | Storm Power ladder roll ([mathematical-model.md](../03-math/mathematical-model.md)§10) | Yes (salvage ×M) |
| `[40,42)` | 8 | Weather pattern (information/spectacle layer only; 4 patterns, 256 mod 4 = 0 so uniform) | No |

Hard boundaries:

- weather may change information presentation, fog timing, signal delay, or animation style;
- weather must never change the number of harbors, strike probability, rake, or settlement;
- spectacle may create feints and near misses, but must never be streamed from pre-reveal
  outcome-aware code in a way that leaks the struck harbor;
- exact lock snapshots remain the source of payout truth.
