/**
 * Ops script (B3): offline collusion scan over the persisted action telemetry.
 * Prints a ranked suspicion report — evidence for ops review, never auto-bans.
 * Usage: pnpm exec tsx scripts/collusion-scan.ts [--db path] [--top N]
 */
import { eq } from 'drizzle-orm';
import { openDb, schema } from '../src/db/index.js';
import { scanTelemetry, type TelemetryEvent } from '../src/collusion.js';

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const dbFile = argValue('--db') ?? new URL('../data/landfall.db', import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/, '');
const top = Number(argValue('--top') ?? 20);

const { db } = openDb(dbFile);

const rows = db.select().from(schema.actionTelemetry).all();
const events: TelemetryEvent[] = rows.map((r) => ({
  playerId: r.playerId,
  action: r.action as TelemetryEvent['action'],
  roundId: r.roundId,
  msIntoPhase: r.msIntoPhase,
  zone: r.zone,
  stakeMinor: r.stakeMinor,
  inFog: r.inFog,
  isMinStake: r.isMinStake,
  detail: r.detail,
}));

if (events.length === 0) {
  console.log('No telemetry recorded yet — play some rounds first.');
  process.exit(0);
}

const nameOf = new Map<string, string>();
for (const p of db.select().from(schema.players).where(eq(schema.players.isHouse, false)).all()) {
  nameOf.set(p.id, `${p.name}${p.isBot ? ' [bot]' : ''}`);
}

const reports = scanTelemetry(events).slice(0, top);
console.log(`Collusion scan — ${events.length} events, ${nameOf.size} players, top ${reports.length}:\n`);
for (const [rank, r] of reports.entries()) {
  console.log(
    `#${String(rank + 1).padStart(2)}  score ${r.score.toFixed(3)}  ${nameOf.get(r.playerId) ?? r.playerId}`,
  );
  console.log(`      regularity   ${r.regularity.score.toFixed(2)}  ${r.regularity.evidence}`);
  console.log(`      fog-partner  ${r.fogCorrelation.score.toFixed(2)}  ${r.fogCorrelation.evidence}`);
  console.log(`      mass bluffs  ${r.coordinatedBluffs.score.toFixed(2)}  ${r.coordinatedBluffs.evidence}`);
  console.log(`      probing      ${r.probing.score.toFixed(2)}  ${r.probing.evidence}`);
}
console.log('\nEvidence for ops review only — no automated action is taken.');
