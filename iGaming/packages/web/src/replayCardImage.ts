/**
 * Round recap card image export (remediation E2) — a pure client-side canvas
 * render + download. No external service, ever; the card is built from the
 * public LANDFALL payload only, so nothing private can leak into a share.
 *
 * THE CARD IS THE PRODUCT, NOT A POSTER ABOUT IT. The previous render was a
 * navy radial gradient with a cyan wordmark, amber highlights and emoji
 * pictographs — none of which exist anywhere in the interface it came from, so
 * a shared card looked like a generic template rather than a screenshot of
 * this game. It is now drawn from the same four ingredients as every other
 * surface:
 *
 *   ground     flat #0E0E0E with the board's faint coordinate grid, framed by
 *              the same corner brackets the plot area uses — no gradient
 *   colour     red is the storm, green is money coming back, orange is the
 *              jackpot, white is a figure, grey is a label. Nothing else.
 *   type       one leading number, a metric strip under it, uppercase
 *              micro-labels, and prose only where prose is the point
 *   marks      arrows and ticks are drawn as paths, because the interface has
 *              no emoji in it (see components/icons.tsx) and a colour-emoji
 *              rendered by whatever font the OS supplies is exactly how an
 *              export stops looking like the app
 */
import type { ReplayCard } from './store';
import { zoneName } from './strings';

const W = 720;
/*
 * 3:2 rather than 16:9. At 405 the card physically could not hold its own
 * content: with a biggest-win row placed, the flag ribbon had room for one line
 * and a "+3 more", which is a worse card than no ribbon at all. 75px more gives
 * every section air and still shares cleanly.
 */
const H = 480;
const PAD = 32;

/* The interface's own tokens, hardcoded because an export is theme-free. */
const BG = '#0e0e0e';
const GRID = 'rgba(255,255,255,0.022)';
const LINE = '#262626';
const LINE_2 = '#383838';
const TEXT = '#f4f4f4';
const DIM = '#a3a3a3';
const MUTE = '#8a8a8a';
const ACCENT = '#ff2f45';
const WIN = '#17e07d';
const WARN = '#ff9f0a';

const fmt = (minor: number) => (minor / 100).toFixed(2);

function zoneLabel(zone: number): string {
  return zoneName(zone);
}

/** Compact zone tag for the dense arrow row: "Z3". */
function zoneTag(zone: number): string {
  return `Z${zone + 1}`;
}

function font(weight: number, size: number): string {
  const family = `'Manrope Variable', Manrope, 'Segoe UI', system-ui, sans-serif`;
  return `${weight} ${size}px ${family}`;
}

/** An uppercase micro-label, letter-spaced by hand — canvas has no tracking. */
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): number {
  ctx.font = font(700, 11);
  ctx.fillStyle = MUTE;
  let cursor = x;
  for (const ch of text.toUpperCase()) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + 1.3;
  }
  return cursor - x;
}

function hairline(ctx: CanvasRenderingContext2D, y: number, color = LINE): void {
  ctx.fillStyle = color;
  ctx.fillRect(PAD, y, W - PAD * 2, 1);
}

/** A small solid triangle — the fog arrows, drawn rather than typed. */
function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, up: boolean): void {
  const w = 8;
  const h = 7;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x + w / 2, y - h);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x, y);
  } else {
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y - h);
    ctx.lineTo(x, y - h);
  }
  ctx.closePath();
  ctx.fill();
}

/** A tick or a cross for the flag-honesty rows. */
function verdictMark(ctx: CanvasRenderingContext2D, x: number, y: number, honest: boolean): void {
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (honest) {
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 3.5, y - 0.5);
    ctx.lineTo(x + 9, y - 9);
  } else {
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 9, y);
    ctx.moveTo(x + 9, y - 9);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function renderReplayCard(card: ReplayCard): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.textBaseline = 'alphabetic';

  /* ---------- ground: flat, gridded, bracketed (the board's own look) ------- */

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = GRID;
  for (let x = 0; x <= W; x += 40) ctx.fillRect(x, 0, 1, H);
  for (let y = 0; y <= H; y += 40) ctx.fillRect(0, y, W, 1);

  ctx.fillStyle = LINE;
  ctx.fillRect(0, 0, W, 1);
  ctx.fillRect(0, H - 1, W, 1);
  ctx.fillRect(0, 0, 1, H);
  ctx.fillRect(W - 1, 0, 1, H);

  // corner brackets, as on the plot frame
  ctx.fillStyle = LINE_2;
  const arm = 34;
  for (const [cx, cy, sx, sy] of [
    [14, 14, 1, 1],
    [W - 14, 14, -1, 1],
    [14, H - 14, 1, -1],
    [W - 14, H - 14, -1, -1],
  ] as const) {
    ctx.fillRect(sx > 0 ? cx : cx - arm, cy, arm, 1);
    ctx.fillRect(cx, sy > 0 ? cy : cy - arm, 1, arm);
  }

  /* ---------- header: the mark, and which round this was ------------------- */

  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, 24, 18, 18);
  ctx.fillStyle = '#000000';
  ctx.font = font(800, 12);
  ctx.fillText('L', PAD + 6, 37);

  ctx.fillStyle = TEXT;
  ctx.font = font(800, 13);
  let cursor = PAD + 28;
  for (const ch of 'LANDFALL') {
    ctx.fillText(ch, cursor, 37);
    cursor += ctx.measureText(ch).width + 2.6;
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = MUTE;
  ctx.font = font(700, 13);
  ctx.fillText(`ROUND #${card.roundId}`, W - PAD, 37);
  ctx.textAlign = 'left';

  hairline(ctx, 56);

  /* ---------- the round in one number ------------------------------------- */

  label(ctx, 'Harbor hit', PAD, 80);

  ctx.fillStyle = ACCENT;
  ctx.font = font(800, 80);
  const struckText = String(card.struckZone + 1);
  // Baseline clears the label above it by the numeral's own cap height.
  ctx.fillText(struckText, PAD, 150);
  const struckWidth = ctx.measureText(struckText).width;

  // The server's one-line retelling sits beside the figure as context, not as
  // the headline it used to be — the number already says what happened.
  ctx.fillStyle = DIM;
  ctx.font = font(500, 15);
  const headlineX = PAD + struckWidth + 34;
  ctx.fillText(card.replay.headline, headlineX, 126, W - PAD - headlineX);

  /* ---------- metric row: even thirds, the way the rail reads -------------- */

  hairline(ctx, 166);
  hairline(ctx, 230);

  const mult = card.stormPower ? card.stormPower.mNum / card.stormPower.mDen : 1;
  // The biggest pot that SURVIVED is the natural counterpart to the one that
  // was hit, it is already in the payload, and it kept the card from looking
  // half-empty on a quiet round with no fog movement and no flags.
  const safeTop =
    card.replay.mostCrowdedSafeZone !== null
      ? `${fmt(card.replay.mostCrowdedSafePoolMinor)}`
      : '—';
  const metrics: [string, string, string][] = [
    ['Hit pot', fmt(card.replay.struckPoolMinor), TEXT],
    ['Biggest safe pot', safeTop, TEXT],
    ['Moved in fog', String(card.replay.fogMoves), TEXT],
    ['Payouts', `×${mult}${card.powerCapped ? ' capped' : ''}`, mult >= 2 ? WARN : DIM],
  ];
  const colWidth = (W - PAD * 2) / metrics.length;
  metrics.forEach(([name, value, color], i) => {
    const x = PAD + colWidth * i;
    if (i > 0) {
      ctx.fillStyle = LINE;
      ctx.fillRect(x - 16, 174, 1, 48);
    }
    label(ctx, name, x, 190);
    ctx.fillStyle = color;
    ctx.font = font(800, 21);
    ctx.fillText(value, x, 218, colWidth - 20);
  });

  /* ---------- what moved, and who took the money --------------------------- */

  let y = 264;

  label(ctx, 'Moved in the fog', PAD, y);
  y += 26;

  const moves = (card.replay.fogNetBoats ?? [])
    .map((net, zone) => ({ net, zone }))
    .filter(({ net }) => net !== 0);

  if (moves.length === 0) {
    ctx.fillStyle = MUTE;
    ctx.font = font(600, 15);
    ctx.fillText('Nobody moved.', PAD, y);
  } else {
    let x = PAD;
    ctx.font = font(700, 15);
    for (const { net, zone } of moves) {
      const up = net > 0;
      ctx.fillStyle = up ? WIN : ACCENT;
      arrow(ctx, x, y, up);
      const text = `${Math.abs(net)} ${zoneTag(zone)}`;
      ctx.fillStyle = TEXT;
      ctx.fillText(text, x + 13, y);
      x += 13 + ctx.measureText(text).width + 20;
      if (x > W - PAD - 60) break;
    }
  }
  y += 32;

  /** One "who took what" line: a label, a name, and the money in its colour. */
  const moneyRow = (name: string, who: string, amountMinor: number, color: string) => {
    const width = label(ctx, name, PAD, y);
    ctx.fillStyle = TEXT;
    ctx.font = font(700, 16);
    ctx.fillText(who, PAD + width + 16, y);
    const nameWidth = ctx.measureText(who).width;
    ctx.fillStyle = color;
    ctx.font = font(800, 16);
    ctx.fillText(`+${fmt(amountMinor)}`, PAD + width + 16 + nameWidth + 12, y);
    y += 26;
  };

  if (card.replay.biggestSalvage) {
    moneyRow('Biggest win', card.replay.biggestSalvage.name, card.replay.biggestSalvage.amountMinor, WIN);
  }
  if (card.surge?.winnerName) {
    moneyRow('Jackpot', card.surge.winnerName, card.surge.potMinor, WARN);
  }

  /* ---------- flags, revealed (only while there is room for them) ---------- */

  const reveals = card.replay.flagReveals ?? [];
  const footerTop = H - 52;
  // Two rows or none: a single row plus "+3 more" is a worse card than leaving
  // the space quiet, and the full ribbon is one tap away in the history sheet.
  const room = Math.floor((footerTop - y - 22) / 21);
  if (reveals.length > 0 && room >= 2) {
    label(ctx, 'Flags revealed', PAD, y);
    y += 22;
    const shown = reveals.slice(0, Math.min(3, room));
    for (const flag of shown) {
      ctx.strokeStyle = flag.honest ? WIN : ACCENT;
      verdictMark(ctx, PAD, y, flag.honest);
      ctx.fillStyle = DIM;
      ctx.font = font(600, 14);
      ctx.fillText(
        `${flag.name} — ${flag.kind.toLowerCase()} on ${zoneLabel(flag.zone)}`,
        PAD + 18,
        y,
        W - PAD * 2 - 18,
      );
      y += 21;
    }
    if (reveals.length > shown.length) {
      ctx.fillStyle = MUTE;
      ctx.font = font(600, 13);
      ctx.fillText(`+${reveals.length - shown.length} more`, PAD, y);
    }
  }

  /* ---------- footer ------------------------------------------------------- */

  hairline(ctx, footerTop);

  const powerLabel = card.stormPower?.label ?? 'Category 1';
  label(ctx, powerLabel, PAD, H - 24);

  ctx.textAlign = 'right';
  ctx.fillStyle = MUTE;
  ctx.font = font(700, 12);
  ctx.fillText('Provably fair — every round is verifiable', W - PAD, H - 24);
  ctx.textAlign = 'left';

  return canvas;
}

/** Render + trigger a local PNG download. */
export async function downloadReplayCard(card: ReplayCard): Promise<void> {
  // Without this the export races the webfont and bakes in the OS fallback,
  // which is most of why a shared card stopped looking like the product.
  try {
    await document.fonts.ready;
  } catch {
    // Font loading API unavailable — render with whatever is resolved.
  }
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
