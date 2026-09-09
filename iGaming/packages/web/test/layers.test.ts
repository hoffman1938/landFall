/**
 * The layering system, guarded.
 *
 * The audit that produced `--lf-z-*` found eleven different z-index values
 * scattered across sixteen components, with a drawer and a sheet both at 50, a
 * deck at 10 in one layout and 20 in another, and a gate at `z-[60]` that only
 * happened to be above the modals. This test is what stops that coming back:
 * every stacking value in the client must name a token, and the tokens must be
 * strictly ordered.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(SRC).filter((f) => /\.(ts|tsx)$/.test(f));
const css = readFileSync(join(SRC, 'index.css'), 'utf8');

/** The scale, read from the stylesheet rather than restated here. */
function tokenScale(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const match of css.matchAll(/--lf-z-([a-z-]+):\s*(\d+);/g)) {
    out[match[1]!] = Number(match[2]);
  }
  return out;
}

describe('layer tokens', () => {
  const scale = tokenScale();

  it('defines the whole stack', () => {
    expect(Object.keys(scale).sort()).toEqual(
      [
        'board',
        'board-ui',
        'chrome',
        'deck',
        'drawer',
        'gate',
        'hud',
        'modal',
        'notice',
        'scene-hud',
        'scrim',
        'stage',
      ].sort(),
    );
  });

  it('is strictly ordered bottom to top', () => {
    const order = [
      'board',
      'board-ui',
      'scene-hud',
      'hud',
      'stage',
      'deck',
      'notice',
      'chrome',
      'scrim',
      'drawer',
      'modal',
      'gate',
    ];
    const values = order.map((k) => scale[k]!);
    for (let i = 1; i < values.length; i++) {
      expect(values[i], `${order[i]} must sit above ${order[i - 1]}`).toBeGreaterThan(
        values[i - 1]!,
      );
    }
  });

  it('puts every overlay above every piece of board furniture', () => {
    for (const overlay of ['scrim', 'drawer', 'modal', 'gate']) {
      for (const board of ['board', 'board-ui', 'scene-hud', 'hud', 'stage', 'deck', 'notice']) {
        expect(scale[overlay]!, `${overlay} vs ${board}`).toBeGreaterThan(scale[board]!);
      }
    }
  });

  it('leaves room to insert a layer without renumbering', () => {
    const sorted = Object.values(scale).sort((a, b) => a - b);
    // Neighbouring tokens that matter are spaced; only the three board layers
    // are deliberately adjacent (1, 2, 3).
    const tight = sorted.filter((v, i) => i > 0 && v - sorted[i - 1]! < 2);
    expect(tight.length).toBeLessThanOrEqual(2);
  });
});

describe('components use the tokens', () => {
  /**
   * A raw stacking value in a component is the beginning of the next
   * `z-index: 99999`. The only ones allowed are `z-[1]` and `z-[2]`, which are
   * LOCAL ordering inside an element that already makes its own stacking
   * context (a sticky header inside a sheet, a dropdown inside the top bar) —
   * those are not part of the global stack and must not borrow a global token.
   */
  const LOCAL_ONLY = new Set(['z-[1]', 'z-[2]']);

  it('has no un-tokenised global z-index', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      for (const [match] of text.matchAll(/\bz-(?:\[[^\]]+\]|\d+)/g)) {
        if (match.includes('--lf-z-')) continue;
        if (LOCAL_ONLY.has(match)) continue;
        offenders.push(`${file.slice(SRC.length + 1)}: ${match}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('has no inline zIndex style', () => {
    const offenders = sourceFiles.filter((f) => /zIndex\s*:/.test(readFileSync(f, 'utf8')));
    expect(offenders.map((f) => f.slice(SRC.length + 1))).toEqual([]);
  });
});

/**
 * The overlay pointer rule, guarded.
 *
 * The board's overlays float over six buttons that are live for most of the
 * round. An overlay BODY that takes clicks is therefore a harbor that cannot be
 * picked — found twice: the advanced offer covering four harbors during
 * SELECTING (locally), and the tide report covering four during the fog window
 * (in production, after the first deploy). The rule is that a body is
 * information and only its own controls capture, so every floating card must
 * declare `pointer-events-none` on its root.
 */
describe('overlay pointer rule', () => {
  const FLOATING = [
    'components/TideReportCard.tsx',
    'components/FinalOrderBar.tsx',
    'components/RoundResultCard.tsx',
    'components/BoardNotices.tsx',
    'components/TableIntro.tsx',
    'components/SignalFlagCard.tsx',
  ];

  it('every floating card body is click-through', () => {
    const offenders: string[] = [];
    for (const rel of FLOATING) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      if (/pointer-events-auto/.test(text) && !/pointer-events-none/.test(text)) {
        offenders.push(`${rel}: has pointer-events-auto but never pointer-events-none`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('a card that opts a control back in still declares a click-through body', () => {
    for (const rel of FLOATING) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      const autos = (text.match(/pointer-events-auto/g) ?? []).length;
      const nones = (text.match(/pointer-events-none/g) ?? []).length;
      if (autos > 0) {
        expect(nones, `${rel} opts controls in without a click-through body`).toBeGreaterThan(0);
      }
    }
  });
});
