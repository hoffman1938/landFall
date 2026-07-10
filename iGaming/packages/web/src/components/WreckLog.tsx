import { audio } from '../audio/engine';
import { useStore } from '../store';

const ZONE_HUES = ['#5b8def', '#8f6bd8', '#4db6ac', '#e08f4f', '#d8677f', '#7fb069'];

export function WreckLog() {
  const wreckLog = useStore((s) => s.wreckLog);
  const lastLandfall = useStore((s) => s.lastLandfall);
  const openVerify = useStore((s) => s.openVerify);

  return (
    <div className="flex items-center gap-2 overflow-x-auto border-t border-[var(--lf-line)] px-4 py-2">
      <span className="shrink-0 text-xs font-semibold text-[var(--lf-dim)]">WRECK LOG</span>
      {wreckLog.map((z, i) => (
        <span
          key={i}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-black/80"
          style={{ background: ZONE_HUES[z] }}
          title={`Harbor ${z + 1} wrecked`}
        >
          {z + 1}
        </span>
      ))}
      {lastLandfall && (
        <button
          onClick={() => {
            audio.click('nav');
            openVerify(lastLandfall.roundId);
          }}
          className="ml-auto shrink-0 rounded-md border border-[var(--lf-line)] px-2 py-1 text-xs text-[var(--lf-dim)] hover:border-[var(--lf-dim)]"
        >
          🛡 Verify round #{lastLandfall.roundId}
        </button>
      )}
    </div>
  );
}
