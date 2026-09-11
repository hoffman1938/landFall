/**
 * Cryptographically strong random hex.
 *
 * Web Crypto rather than `node:crypto`, because `crypto.getRandomValues` is a
 * real global on both hosts — Node and Cloudflare Workers — so the season's
 * seed-chain terminal and the receipt-signing key are produced by identical
 * code with no compatibility shim underneath them. Those two secrets are the
 * only randomness in the server that must be unguessable, which makes them the
 * wrong place to depend on a polyfill.
 */
export function randomHex(bytes: number): string {
  const out = new Uint8Array(bytes);
  crypto.getRandomValues(out);
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A uniform in [0, 1) from the same CSPRNG.
 *
 * Used for table placement (Order 243 Annex 1 Art. 13(b)) and nothing else.
 * DELIBERATELY NOT THE GAME'S RNG: no game outcome may come from a source that
 * is not the pre-committed chain, so keeping this in its own named function
 * makes a misuse visible rather than plausible. 32 bits is far more resolution
 * than choosing among five tables needs.
 */
export function randomUnitInterval(): number {
  const out = new Uint32Array(1);
  crypto.getRandomValues(out);
  return out[0]! / 2 ** 32;
}
