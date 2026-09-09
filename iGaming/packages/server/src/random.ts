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
