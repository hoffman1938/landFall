/**
 * Provably-fair draw — implements docs/04-architecture/rng-provably-fair-spec.md.
 *
 * Pre-committed SHA-256 hash chain + per-round HMAC -> uniform zone draw.
 * Pure functions over hex strings; no Node/DOM APIs (@noble/hashes is
 * environment-agnostic), so this module runs identically in server, web
 * verification UI, and future mobile.
 */
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

/**
 * SHA-256 of a UTF-8 string, hex. The one hashing primitive shared by hosts
 * that have `node:crypto` and hosts that do not (Cloudflare Workers), so an
 * integrity digest computed on one is byte-identical on the other.
 */
export function sha256Hex(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

/** SHA256^n(terminal) — chain value n links up from the terminal secret. */
export function chainValue(terminalHex: string, hashes: number): string {
  let cur = hexToBytes(terminalHex);
  for (let i = 0; i < hashes; i++) cur = sha256(cur);
  return bytesToHex(cur);
}

/**
 * Chain layout for a season of `length` rounds:
 *   commitment s_0 = SHA256^length(terminal)
 *   round i (1-based) uses s_i = SHA256^(length - i)(terminal)
 * so SHA256(s_i) === s_{i-1} for every i, and SHA256(s_1) === s_0.
 */
export function chainCommitment(terminalHex: string, length: number): string {
  return chainValue(terminalHex, length);
}

export function roundSeed(terminalHex: string, length: number, roundIndex: number): string {
  if (roundIndex < 1 || roundIndex > length) {
    throw new Error(`roundIndex ${roundIndex} out of chain range 1..${length}`);
  }
  return chainValue(terminalHex, length - roundIndex);
}

/** Verify one link: the revealed seed must hash to the previously published value. */
export function verifyChainLink(revealedSeedHex: string, previousValueHex: string): boolean {
  return bytesToHex(sha256(hexToBytes(revealedSeedHex))) === previousValueHex;
}

export interface DrawResult {
  digestHex: string;
  u: number; // uniform in [0,1), 52-bit precision
  struckZone: number;
  /** Cosmetic storm-path feints (mod-6 over single bytes; cosmetic-grade only, per spec §5). */
  feints: [number, number];
  /** Storm Surge trigger roll — uniform in [0,1) from digest hex [17,22). Surge fires when uSurge < SURGE_PROB. */
  uSurge: number;
  /** Golden Anchor winner roll — uniform in [0,1) from digest hex [22,35), 52-bit precision. */
  uWinner: number;
  /** Storm Power roll — uniform integer in [0, 2^20) from digest hex [35,40); maps to the multiplier ladder. */
  stormPowerRoll: number;
  /** Weather pattern roll — cosmetic/information-layer only, from digest hex [40,42). */
  weatherRoll: number;
}

/**
 * The draw. Signature deliberately takes NO pool/participant input —
 * docs/05-security/security-review.md §1.9 depends on this API boundary,
 * and the test suite asserts determinism from (seed, roundId, K) alone.
 * All rolls (zone, feints, surge trigger, surge winner) come from disjoint
 * spans of one HMAC digest, so a single seed reveal verifies everything.
 */
export function drawZone(seedHex: string, roundId: number, zoneCount: number): DrawResult {
  const digest = bytesToHex(
    hmac(sha256, hexToBytes(seedHex), new TextEncoder().encode(`landfall:round:${roundId}`)),
  );
  const u = parseInt(digest.slice(0, 13), 16) / 2 ** 52;
  const struckZone = Math.floor(u * zoneCount);
  const feints: [number, number] = [
    parseInt(digest.slice(13, 15), 16) % zoneCount,
    parseInt(digest.slice(15, 17), 16) % zoneCount,
  ];
  const uSurge = parseInt(digest.slice(17, 22), 16) / 2 ** 20; // 5 hex chars = 20 bits
  const uWinner = parseInt(digest.slice(22, 35), 16) / 2 ** 52; // 13 hex chars = 52 bits
  const stormPowerRoll = parseInt(digest.slice(35, 40), 16); // 5 hex chars = 20 bits
  const weatherRoll = parseInt(digest.slice(40, 42), 16); // cosmetic/info layer
  return { digestHex: digest, u, struckZone, feints, uSurge, uWinner, stormPowerRoll, weatherRoll };
}

/**
 * The domain string the AUTHORITATIVE harbor draw uses.
 *
 * The redesign brief names this domain `harbor:`; this codebase has always
 * written `landfall:round:`. They are the same construction — one HMAC over one
 * fixed message — and renaming it would invalidate every round already settled
 * in the database, which is a fairness regression rather than a fairness
 * improvement. So the label stays and is named here instead, and every OTHER
 * domain is a genuinely separate HMAC over a genuinely different message
 * (see presentation.ts). Nothing drawn from another domain can shift this one.
 */
export const HARBOR_DOMAIN = 'round';

/**
 * `HMAC(seed, "landfall:<domain>:<roundId>")`, hex.
 *
 * The one primitive every RNG domain is built from. Distinct `domain` strings
 * produce independent digests under HMAC's PRF assumption, which is the
 * property "separate RNG domains" actually needs — disjoint spans of ONE digest
 * (how the harbor draw carries its feints, surge and power rolls) are also
 * independent, but only presentation layers added after the fact get their own
 * message here, so a cosmetic change can never perturb the harbor bytes.
 */
export function domainDigest(seedHex: string, domain: string, roundId: number): string {
  return bytesToHex(
    hmac(sha256, hexToBytes(seedHex), new TextEncoder().encode(`landfall:${domain}:${roundId}`)),
  );
}

/**
 * A uniform integer in [0, 1_000_000) from 13 hex characters (52 bits) of a
 * digest — parts per million, the unit every presentation table below is
 * written in. 52 bits over a 10^6 range leaves a bucket bias below 2^-32, which
 * is exact for any purpose that never touches money (and these never do).
 */
export function ppmFrom(digestHex: string, offset = 0): number {
  const u = parseInt(digestHex.slice(offset, offset + 13), 16) / 2 ** 52;
  return Math.floor(u * 1_000_000);
}
