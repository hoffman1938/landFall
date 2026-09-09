/**
 * Ops script: re-verify recent settled rounds (chain link, draw, surge trigger,
 * Golden Anchor winner) against a running server's public API — the same check
 * the in-browser Verify modal performs, runnable headlessly.
 * Usage: pnpm exec tsx scripts/verify-recent.ts
 */
import { verifyRound } from '@landfall/core';

const BASE = process.env.LANDFALL_API ?? 'http://localhost:8787';
const hist = (await (await fetch(`${BASE}/api/history`)).json()) as {
  rounds: { id: number }[];
};

let checked = 0;
let failed = 0;
for (const r of hist.rounds.slice(0, 20)) {
  const rec = (await (await fetch(`${BASE}/api/round/${r.id}`)).json());
  if (rec.error) continue;
  const v = verifyRound({
    roundId: rec.roundId,
    seedHex: rec.seedHex,
    prevChainValue: rec.prevChainValue,
    announcedStruckZone: rec.struckZone,
    zoneCount: rec.zoneCount,
    rake: rec.rake,
    stakes: rec.lockSnapshot,
    surgeProb: rec.surgeProb,
    announcedSurge: rec.surge !== null,
    announcedSurgeWinnerStakeId: rec.surge ? rec.surge.winnerStakeId : null,
    announcedPowerLabel: rec.stormPower.label,
  });
  checked++;
  const surgeNote = rec.surge
    ? ` | SURGE pot=${(rec.surge.amountMinor / 100).toFixed(2)} winnerStake=${rec.surge.winnerStakeId ?? 'rollover'} surgeOk=${v.surgeOk}`
    : '';
  console.log(
    `round ${rec.roundId}: chainOk=${v.chainOk} drawOk=${v.drawOk} powerOk=${v.powerOk} (${v.recomputedPower.label}) allOk=${v.allOk}${surgeNote}`,
  );
  if (!v.allOk) failed++;
}
console.log(failed === 0 ? `ALL ${checked} ROUNDS VERIFIED` : `${failed}/${checked} FAILED`);
process.exit(failed === 0 ? 0 : 1);
