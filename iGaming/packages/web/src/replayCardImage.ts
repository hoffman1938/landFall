/**
 * Wreck Wake Replay card image export (remediation E2) — a pure client-side
 * canvas render + download. No external service, ever; the card is built from
 * the public LANDFALL payload only, so nothing private can leak into a share.
 */
import type { ReplayCard } from './store';
import { zoneName } from './strings';

const W = 720;
const H = 405;

const fmt = (minor: number) => (minor / 100).toFixed(2);

function zoneLabel(zone: number): string {
  return zoneName(zone);
}

export function renderReplayCard(card: ReplayCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Bay-night backdrop (matches --lf-bg family; hardcoded — export is theme-free).
  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H * 0.5, W * 0.75);
  bg.addColorStop(0, '#0c1526');
  bg.addColorStop(1, '#04070e');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1c2a40';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  const font = (weight: number, size: number) =>
    `${weight} ${size}px Manrope, 'Segoe UI', system-ui, sans-serif`;

  // Header
  ctx.fillStyle = '#41b7f5';
  ctx.font = font(800, 15);
  ctx.fillText('LANDFALL — WRECK WAKE', 28, 40);
  ctx.fillStyle = '#8da0ba';
  ctx.font = font(700, 15);
  ctx.textAlign = 'right';
  ctx.fillText(`Round #${card.roundId}`, W - 28, 40);
  ctx.textAlign = 'left';

  // Headline
  ctx.fillStyle = '#edf2f9';
  ctx.font = font(800, 22);
  ctx.fillText(card.replay.headline, 28, 84, W - 56);

  // Struck cove + wreck value
  ctx.fillStyle = '#ff5a5a';
  ctx.font = font(800, 17);
  ctx.fillText(`⛈ ${zoneLabel(card.struckZone)} was struck`, 28, 122);
  ctx.fillStyle = '#8da0ba';
  ctx.font = font(700, 15);
  ctx.fillText(`Wrecked cargo: ${fmt(card.replay.struckPoolMinor)} cr`, 28, 146);

  let y = 182;

  // Net fog movement arrows
  ctx.fillStyle = '#8da0ba';
  ctx.font = font(700, 13);
  ctx.fillText('MOVED IN THE FOG', 28, y);
  y += 24;
  const moves = (card.replay.fogNetBoats ?? [])
    .map((net, zone) => ({ net, zone }))
    .filter(({ net }) => net !== 0);
  ctx.font = font(700, 16);
  if (moves.length === 0) {
    ctx.fillStyle = '#edf2f9';
    ctx.fillText('The fleet held steady.', 28, y);
    y += 28;
  } else {
    let x = 28;
    for (const { net, zone } of moves) {
      const text = `${net > 0 ? '▲' : '▼'}${Math.abs(net)} ${zoneName(zone)}`;
      ctx.fillStyle = net > 0 ? '#3ddc97' : '#ff5a5a';
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width + 22;
    }
    y += 28;
  }

  // Biggest salvage (payout figure — the one amber element).
  if (card.replay.biggestSalvage) {
    ctx.fillStyle = '#ffb02e';
    ctx.font = font(800, 17);
    ctx.fillText(
      `⚓ Biggest salvage: ${card.replay.biggestSalvage.name} +${fmt(card.replay.biggestSalvage.amountMinor)} cr`,
      28,
      y,
    );
    y += 30;
  }
  if (card.surge?.winnerName) {
    ctx.fillStyle = '#ffb02e';
    ctx.font = font(800, 17);
    ctx.fillText(
      `⚡ Golden Anchor: ${card.surge.winnerName} takes ${fmt(card.surge.potMinor)} cr`,
      28,
      y,
    );
    y += 30;
  }

  // Flag honesty reveals
  const reveals = card.replay.flagReveals ?? [];
  if (reveals.length > 0) {
    ctx.fillStyle = '#8da0ba';
    ctx.font = font(700, 13);
    ctx.fillText('FLAGS, REVEALED', 28, y);
    y += 24;
    ctx.font = font(700, 15);
    for (const flag of reveals.slice(0, 4)) {
      ctx.fillStyle = flag.honest ? '#3ddc97' : '#ff5a5a';
      ctx.fillText(
        `${flag.honest ? '✓ honest' : '✗ bluff'} — ${flag.name}: ${flag.kind} ${zoneName(flag.zone)}`,
        28,
        y,
        W - 56,
      );
      y += 24;
    }
    if (reveals.length > 4) {
      ctx.fillStyle = '#8da0ba';
      ctx.fillText(`…and ${reveals.length - 4} more`, 28, y);
    }
  }

  // Footer: storm power + provably-fair note.
  const mult = card.stormPower ? card.stormPower.mNum / card.stormPower.mDen : 1;
  ctx.fillStyle = mult >= 2 ? '#ffb02e' : '#8da0ba';
  ctx.font = font(800, 14);
  ctx.fillText(
    `${card.stormPower?.label ?? 'Category 1'} — salvage ×${mult}${card.powerCapped ? ' (capped)' : ''}`,
    28,
    H - 28,
  );
  ctx.fillStyle = '#8da0ba';
  ctx.font = font(700, 13);
  ctx.textAlign = 'right';
  ctx.fillText('Provably fair — every round verifiable', W - 28, H - 28);
  ctx.textAlign = 'left';

  return canvas;
}

/** Render + trigger a local PNG download. */
export function downloadReplayCard(card: ReplayCard): void {
  renderReplayCard(card).toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `landfall-round-${card.roundId}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
}
