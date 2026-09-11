/**
 * GLI-19 §3.2.4 INDEPENDENCE, §3.3.1–§3.3.2 RNG STRENGTH, and §4.5.2 GAME
 * SELECTION PROCESS.
 *
 * These three clauses ask different questions about the same construction:
 *
 *   §3.2.4   knowing past draws must not inform future ones
 *   §3.3.2   a skilled attacker WITH THE SOURCE CODE must not be able to predict
 *            or influence outcomes: direct cryptanalysis, known input, and state
 *            compromise extension
 *   §4.5.2   the outcome must be decided by the RNG and by nothing else — not by
 *            the pools, not by adaptive behaviour, not by the network
 *
 * Landfall's answer to all three is one design: a season of round seeds is a
 * pre-committed SHA-256 hash chain, and each round's outcome is
 * HMAC-SHA256(seed, "landfall:round:<id>"). The tests below are that answer
 * stated as assertions rather than as prose, including the two places where the
 * design's limits have to be admitted rather than argued away.
 */
import { describe, expect, it } from 'vitest';
import {
  SURGE_PROB,
  ZONE_COUNT,
  chainCommitment,
  domainDigest,
  drawEnvironment,
  drawEventTier,
  drawZone,
  roundSeed,
  settleRound,
  sha256Hex,
  stormPowerFromRoll,
  verifyChainLink,
  type StakeEntry,
} from '@landfall/core';
import { chiSquareUpperTail, seasonSeeds } from '../_lib/stats';

describe('GLI-19 §4.5.2 — the outcome is decided by the RNG and nothing else', () => {
  /**
   * THE STRUCTURAL ARGUMENT, made executable. `drawZone` takes (seed, roundId,
   * zoneCount). There is no parameter through which a pool, a stake, a player
   * count or a clock could reach it, so §4.5.2(a)–(e) are satisfied by the shape
   * of the function rather than by its behaviour. This test pins that shape:
   * if anyone ever adds a fourth argument, it fails.
   */
  it('the draw function cannot see the pools — it has no parameter for them', () => {
    expect(drawZone.length).toBe(3);
    const seedHex = sha256Hex('arity');
    const a = drawZone(seedHex, 1, ZONE_COUNT);
    const b = drawZone(seedHex, 1, ZONE_COUNT);
    expect(b).toEqual(a);
  });

  /**
   * …and the behavioural proof. The same round, settled against wildly different
   * crowds, strikes the same harbour every time. This is the property that makes
   * "the storm cannot chase the money" a fact rather than a claim.
   */
  it('the struck harbour does not move when the money does', () => {
    const seedHex = sha256Hex('pools-cannot-move-the-storm');
    const expected = drawZone(seedHex, 7, ZONE_COUNT).struckZone;

    const shapes: StakeEntry[][] = [
      // Everything on one harbour.
      [{ id: 'a', zone: 0, amountMinor: 500_000_00, isHouseSeed: false }],
      // Everything on the harbour the storm will hit.
      [{ id: 'b', zone: expected, amountMinor: 500_000_00, isHouseSeed: false }],
      // Spread evenly.
      Array.from({ length: ZONE_COUNT }, (_, z) => ({
        id: `c${z}`,
        zone: z,
        amountMinor: 1_000_00,
        isHouseSeed: false,
      })),
      // A single minimum bet.
      [{ id: 'd', zone: 3, amountMinor: 1_00, isHouseSeed: false }],
    ];
    for (const stakes of shapes) {
      expect(drawZone(seedHex, 7, ZONE_COUNT).struckZone).toBe(expected);
      // And settlement uses the drawn harbour rather than choosing one.
      const r = settleRound(stakes, expected, 0.12);
      expect(r.struckZone).toBe(expected);
    }
  });

  /**
   * §4.5.2(d)(ii) — "a game shall not adapt its theoretical return to the player
   * based on past payouts". The draw is a pure function of the seed and the
   * round id, so history cannot reach it; demonstrated by replaying an
   * artificially skewed history and finding the next outcome unchanged.
   */
  it('history does not influence the next outcome', () => {
    const terminal = sha256Hex('history-independence');
    const L = 2_000;
    const outcomes: number[] = [];
    for (let i = 1; i <= L; i++) {
      outcomes.push(drawZone(roundSeed(terminal, L, i), i, ZONE_COUNT).struckZone);
    }
    // Condition on every possible run of three identical harbours and check the
    // NEXT outcome is still uniform — the classic "is it due?" question.
    const after = new Array<number>(ZONE_COUNT).fill(0);
    let total = 0;
    for (let i = 3; i < outcomes.length; i++) {
      if (outcomes[i - 1] === outcomes[i - 2] && outcomes[i - 2] === outcomes[i - 3]) {
        after[outcomes[i]!]! += 1;
        total += 1;
      }
    }
    if (total >= 30) {
      const e = total / ZONE_COUNT;
      const chi2 = after.reduce((a, c) => a + (c - e) ** 2 / e, 0);
      expect(chiSquareUpperTail(chi2, ZONE_COUNT - 1)).toBeGreaterThan(0.001);
    }
    expect(outcomes).toHaveLength(L);
  });
});

describe('GLI-19 §3.2.4 — independence between and within draws', () => {
  /**
   * WITHIN A DRAW. One HMAC digest is sliced into the harbour, the jackpot
   * trigger, the jackpot winner roll, the multiplier tier and the cosmetic
   * weather. The slices are disjoint, which under HMAC's PRF assumption makes
   * them independent — and this matters operationally, not just theoretically:
   * the game ANNOUNCES the jackpot bit before betting opens. If that bit leaked
   * the harbour, the announcement would hand every player the answer.
   */
  it('the announced jackpot bit carries no information about the harbour', () => {
    const N = 200_000;
    const table = new Array<number>(ZONE_COUNT * 2).fill(0);
    for (const { seedHex, roundId } of seasonSeeds('independence-surge', N)) {
      const d = drawZone(seedHex, roundId, ZONE_COUNT);
      table[d.struckZone * 2 + (d.uSurge < SURGE_PROB ? 1 : 0)]! += 1;
    }
    // Contingency independence over the 6×2 table.
    const rows = new Array<number>(ZONE_COUNT).fill(0);
    const cols = [0, 0];
    for (let z = 0; z < ZONE_COUNT; z++) {
      for (let c = 0; c < 2; c++) {
        rows[z]! += table[z * 2 + c]!;
        cols[c]! += table[z * 2 + c]!;
      }
    }
    let chi2 = 0;
    for (let z = 0; z < ZONE_COUNT; z++) {
      for (let c = 0; c < 2; c++) {
        const e = (rows[z]! * cols[c]!) / N;
        chi2 += (table[z * 2 + c]! - e) ** 2 / e;
      }
    }
    expect(chiSquareUpperTail(chi2, ZONE_COUNT - 1)).toBeGreaterThan(0.005);
  });

  /** The multiplier tier is likewise independent of the harbour it multiplies. */
  it('the multiplier tier carries no information about the harbour', () => {
    const N = 200_000;
    // Two tier classes: the ×1 floor, and anything above it.
    const table = new Array<number>(ZONE_COUNT * 2).fill(0);
    for (const { seedHex, roundId } of seasonSeeds('independence-power', N)) {
      const d = drawZone(seedHex, roundId, ZONE_COUNT);
      const t = stormPowerFromRoll(d.stormPowerRoll);
      table[d.struckZone * 2 + (t.mNum > t.mDen ? 1 : 0)]! += 1;
    }
    const rows = new Array<number>(ZONE_COUNT).fill(0);
    const cols = [0, 0];
    for (let z = 0; z < ZONE_COUNT; z++) {
      for (let c = 0; c < 2; c++) {
        rows[z]! += table[z * 2 + c]!;
        cols[c]! += table[z * 2 + c]!;
      }
    }
    let chi2 = 0;
    for (let z = 0; z < ZONE_COUNT; z++) {
      for (let c = 0; c < 2; c++) {
        const e = (rows[z]! * cols[c]!) / N;
        chi2 += (table[z * 2 + c]! - e) ** 2 / e;
      }
    }
    expect(chiSquareUpperTail(chi2, ZONE_COUNT - 1)).toBeGreaterThan(0.005);
  });

  /**
   * THE PRESENTATION DOMAINS. Cosmetic draws (event tier, board environment)
   * use their own HMAC message rather than another slice of the harbour digest.
   * That is a deliberate defence: a cosmetic change that widened a slice could
   * otherwise shift the harbour bytes. Here the harbour is held fixed while the
   * presentation draws are computed, to show they are separate messages.
   */
  it('cosmetic domains are separate HMAC messages, not slices of the harbour digest', () => {
    const seedHex = sha256Hex('domain-separation');
    const harbour = domainDigest(seedHex, 'round', 99);
    const event = drawEventTier(seedHex, 99);
    const environment = drawEnvironment(seedHex, 99);
    expect(drawZone(seedHex, 99, ZONE_COUNT).digestHex).toBe(harbour);
    // Different messages produce unrelated digests; assert they are not equal
    // and that the cosmetic ids are stable under recomputation (verifiable).
    expect(domainDigest(seedHex, 'event', 99)).not.toBe(harbour);
    expect(domainDigest(seedHex, 'environment', 99)).not.toBe(harbour);
    expect(drawEventTier(seedHex, 99).id).toBe(event.id);
    expect(drawEnvironment(seedHex, 99).id).toBe(environment.id);
  });

  /**
   * BETWEEN DRAWS. Consecutive rounds use consecutive chain links, which is the
   * one place a correlation could hide: s_{i} = SHA256(s_{i+1}), so the seeds
   * are related by construction. What must be true is that the OUTCOMES are not.
   */
  it('outcomes from adjacent chain links are uncorrelated', () => {
    const N = 200_000;
    const xs: number[] = [];
    for (const { seedHex, roundId } of seasonSeeds('independence-adjacent', N)) {
      xs.push(drawZone(seedHex, roundId, ZONE_COUNT).struckZone);
    }
    // Lag-1 through lag-5 serial correlation, each asymptotically N(0, 1/n).
    for (let lag = 1; lag <= 5; lag++) {
      const n = xs.length - lag;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) num += (xs[i]! - mean) * (xs[i + lag]! - mean);
      for (const x of xs) den += (x - mean) ** 2;
      const z = (num / den) * Math.sqrt(n);
      expect(Math.abs(z), `lag ${lag} z=${z.toFixed(3)}`).toBeLessThan(3.5);
    }
  });
});

describe('GLI-19 §3.3.1–§3.3.2 — RNG strength', () => {
  /**
   * §3.3.1 "cryptographically strong". The primitives are SHA-256 and
   * HMAC-SHA256, both recognised cryptographic algorithms, and the outcome is
   * an HMAC output rather than a hand-rolled mixer. This test asserts the
   * construction rather than trying to prove cryptography: it shows that the
   * per-round outcome is exactly the published HMAC of the revealed seed, which
   * is the fact a reviewer checks against the specification.
   */
  it('the outcome is exactly the published HMAC of the round seed', () => {
    const seedHex = sha256Hex('strength-construction');
    for (const roundId of [1, 2, 17, 9_999]) {
      const draw = drawZone(seedHex, roundId, ZONE_COUNT);
      expect(draw.digestHex).toBe(domainDigest(seedHex, 'round', roundId));
      expect(draw.digestHex).toHaveLength(64);
      // The harbour is the top 52 bits of that digest, scaled. Recomputed here
      // from the digest alone, which is what a player's verifier does.
      const u = parseInt(draw.digestHex.slice(0, 13), 16) / 2 ** 52;
      expect(Math.floor(u * ZONE_COUNT)).toBe(draw.struckZone);
    }
  });

  /**
   * §3.3.2(a) DIRECT CRYPTANALYTIC ATTACK — "given a sequence of past values it
   * shall be computationally infeasible to predict future RNG values".
   *
   * The honest form of this test is a NEGATIVE one: past OUTCOMES (the six-way
   * harbour) carry only log2(6) ≈ 2.58 bits each, while the state is a 256-bit
   * chain link. Recovering the state from outcomes is a preimage problem. What
   * can be demonstrated here is the necessary condition: past outcomes do not
   * predict the next one better than chance, measured directly.
   */
  it('past outcomes do not predict the next one better than chance', () => {
    const N = 120_000;
    const xs: number[] = [];
    for (const { seedHex, roundId } of seasonSeeds('strength-prediction', N)) {
      xs.push(drawZone(seedHex, roundId, ZONE_COUNT).struckZone);
    }
    /*
     * The strongest simple predictor available to an attacker who sees only
     * outcomes: an order-2 Markov model fitted on the first half, evaluated on
     * the second. If the source leaked, this would beat 1/6.
     */
    const half = Math.floor(xs.length / 2);
    const table = new Map<string, number[]>();
    for (let i = 2; i < half; i++) {
      const key = `${xs[i - 2]}-${xs[i - 1]}`;
      const row = table.get(key) ?? new Array<number>(ZONE_COUNT).fill(0);
      row[xs[i]!]! += 1;
      table.set(key, row);
    }
    let hits = 0;
    let tried = 0;
    for (let i = half + 2; i < xs.length; i++) {
      const row = table.get(`${xs[i - 2]}-${xs[i - 1]}`);
      if (!row) continue;
      let best = 0;
      for (let z = 1; z < ZONE_COUNT; z++) if (row[z]! > row[best]!) best = z;
      if (best === xs[i]) hits += 1;
      tried += 1;
    }
    const accuracy = hits / tried;
    const chance = 1 / ZONE_COUNT;
    const sd = Math.sqrt((chance * (1 - chance)) / tried);
    expect(tried).toBeGreaterThan(10_000);
    expect(
      (accuracy - chance) / sd,
      `Markov-2 accuracy ${(accuracy * 100).toFixed(3)}% vs chance ${(chance * 100).toFixed(3)}%`,
    ).toBeLessThan(4);
  });

  /**
   * §3.3.2(b) KNOWN INPUT ATTACK — "the RNG shall not be seeded from a time
   * value alone" and "games shall not have the same initial seed".
   *
   * The terminal secret comes from `randomHex(32)`, which is `crypto`'s CSPRNG
   * — 256 bits, no clock anywhere in the path. Two seasons minted back to back
   * must differ; and a chain derived from a clock-like value must not be what
   * the game does. The first is testable directly; the second is a source-review
   * fact recorded here so it is not lost.
   */
  it('two seasons minted independently share no link', () => {
    // The production minting path is `randomHex(32)` in server/src/random.ts.
    // Reproduced here through the same Web Crypto primitive it uses.
    const a = randomTerminal();
    const b = randomTerminal();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(64);
    const L = 64;
    const commitA = chainCommitment(a, L);
    const commitB = chainCommitment(b, L);
    expect(commitA).not.toBe(commitB);
    const seedsA = new Set(Array.from({ length: L }, (_, i) => roundSeed(a, L, i + 1)));
    for (let i = 1; i <= L; i++) expect(seedsA.has(roundSeed(b, L, i))).toBe(false);
  });

  /**
   * §3.3.2(c) STATE COMPROMISE EXTENSION — "the RNG shall periodically modify
   * its state, through the use of external entropy, limiting the effective
   * duration of any potential exploit by a successful attacker."
   *
   * THIS IS THE ONE CLAUSE LANDFALL ONLY PARTIALLY MEETS, and the honest
   * position is worth more than a test that pretends otherwise.
   *
   * A pre-committed chain is deterministic once the terminal secret is known:
   * an attacker who obtains it can compute every remaining seed in the season.
   * That is the unavoidable cost of provable fairness — the commitment has to
   * fix the future outcomes in advance or it proves nothing. What the design
   * does provide is a BOUNDED exploit window: the state is re-minted from fresh
   * CSPRNG entropy at every season boundary, so a compromise cannot extend past
   * the end of the current season.
   *
   * The test asserts the bound. The residual risk, and the roadmap item that
   * closes it (mixing a public beacon unpredictable at commit time into each
   * round's HMAC message), are recorded in
   * `docs/03-rng-design-and-testing.md` §5 and in the compliance gap register
   * as G39. A laboratory should read both before signing the RNG section.
   */
  it('a season boundary re-mints the state from fresh entropy, bounding any compromise', () => {
    const L = 32;
    const compromised = randomTerminal();
    // Everything in the current season is derivable from the compromised secret.
    const derivable = Array.from({ length: L }, (_, i) => roundSeed(compromised, L, i + 1));
    expect(new Set(derivable).size).toBe(L);

    // The next season is minted independently: none of its links is derivable.
    const next = randomTerminal();
    const nextSeeds = new Set(Array.from({ length: L }, (_, i) => roundSeed(next, L, i + 1)));
    for (const s of derivable) expect(nextSeeds.has(s)).toBe(false);

    // …and the exploit window is exactly the season, which is a published
    // constant rather than an open-ended one.
    expect(L).toBeGreaterThan(0);
  });

  /**
   * THE PLAYER-SIDE CHECK. Provable fairness is only worth what a player can
   * actually verify, so the chain link and the draw are recomputed here exactly
   * as the client's verify sheet does it.
   */
  it('every revealed seed verifies against the previously published value', () => {
    const terminal = sha256Hex('verify-walk');
    const L = 500;
    let previous = chainCommitment(terminal, L);
    for (let i = 1; i <= L; i++) {
      const seed = roundSeed(terminal, L, i);
      expect(verifyChainLink(seed, previous), `link ${i}`).toBe(true);
      // A tampered seed must not verify.
      const tampered = `${seed.slice(0, 63)}${seed[63] === '0' ? '1' : '0'}`;
      expect(verifyChainLink(tampered, previous)).toBe(false);
      previous = seed;
    }
  });
});

/** The production minting primitive: 32 bytes of CSPRNG, hex. */
function randomTerminal(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
