/**
 * BayScene — the board, drawn as an instrument.
 *
 * Everything here is a rectangle, a line or a tick: a coordinate frame with
 * ruler marks and two axes, six bracketed zone plots, player tokens instead of
 * figures, flat fill gauges, a targeting reticle for the storm, a shutter for
 * the fog, and the settlement transfer. Nothing is illustrated and nothing is
 * shaded — the board has to survive next to a hairline dashboard without
 * looking like a different product.
 *
 * All cove text lives in the DOM layer (CoveStatusCard) — the scene draws no
 * labels, so nothing is duplicated over the board.
 *
 * Pure presentation: all state arrives from the store; the scene never
 * computes outcomes. Mechanics, math, and the wire protocol are untouched.
 */
import { Application, Container, Graphics, Rectangle, Text } from 'pixi.js';
import {
  ZONE_COUNT,
  type SignalPublic,
  type TideBand,
  type TideReport,
  type WeatherId,
} from '@landfall/core';
import { getCoveLayouts } from '../coveLayout';
import { neutralStop, stormRoute, stormRouteStop } from '../stormPath';

export interface BayState {
  phase: 'ANCHOR_OPEN' | 'LOCKED_STORM' | 'RESOLVED' | 'COOLDOWN' | null;
  totalsMinor: number[];
  boatCounts: number[];
  tideReport: TideReport | null;
  weatherId: WeatherId | null;
  myZones: { zone: number; share: string | null; primary: boolean }[];
  fogActive: boolean;
  finalOrderUsed: boolean;
  storm: { feints: [number, number]; endsAt: number } | null;
  struckZone: number | null;
  resolvedRoundId: number | null;
  signals: SignalPublic[];
  surgeRound: boolean;
}

export interface BayHandlers {
  onPick(zone: number): void;
  onFlag(zone: number, clientX: number, clientY: number): void;
}

/* ---------- palette (mirrors index.css tokens; Pixi wants numbers) ---------- */

const CHART = 0x303030; // frame, ruler ticks, zone brackets — structure only
const LINE = 0x262626;
const DIM = 0x8e8e8e;
const DANGER = 0xff2f45; // the storm, and only the storm
const SAFE = 0x17e07d; // survived / money in
const FOCUS = 0xffffff; // YOU: your token, your bracket, your transfer
const AMBER = 0xff9f0a; // jackpot / caution
const CRATE = 0x8e8e8e; // other players' settlement, deliberately neutral
const OTHER = 0x6a6a6a; // other players' tokens
const ROPE = 0x3a3a3a;

/**
 * Phase tint. Near-neutral by design: the board's mood is carried by what the
 * marks are DOING, not by washing the screen in colour. Only the storm phase
 * gets a hue, and only barely.
 */
const MOOD = {
  dawn: 0x141414,
  fog: 0x1c1c1c,
  storm: 0x2a0a10,
  golden: 0x14140f,
  night: 0x101010,
};
type MoodName = keyof typeof MOOD;

const BAND_FRAC: Record<TideBand, number> = {
  seed: 0.14,
  light: 0.34,
  medium: 0.55,
  heavy: 0.78,
  packed: 1,
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff,
    ag = (a >> 8) & 0xff,
    ab = a & 0xff;
  const br = (b >> 16) & 0xff,
    bg = (b >> 8) & 0xff,
    bb = b & 0xff;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
}

/* ---------- per-cove display bundle ---------- */

interface Cove {
  hit: Graphics;
  land: Graphics; // static anchorage mark (dashed ring + zone disc)
  selection: Graphics;
  beam: Graphics; // lighthouse safety sweep after landfall
  wreckG: Graphics; // damage overlay: slick, X buoys
  gauge: Graphics; // pier tide gauge (band + trend, wordless)
  mast: Graphics; // signal flags
  flagCount: Text;
  fleet: Container; // other players' boats
  myBoat: Container;
  myHalo: Graphics;
  mySeal: Graphics;
  myRope: Graphics;
  // geometry
  x: number;
  y: number;
  w: number;
  h: number;
  side: 'top' | 'bottom';
  shoreH: number;
  moorX: number;
  moorY: number;
  /** Centre and size of the DOM zone card — every marker is framed around this. */
  markerX: number;
  markerY: number;
  markerW: number;
  markerH: number;
  beamOrigin: { x: number; y: number };
}

/**
 * The box a marker draws for a zone: concentric with the card, and always at
 * least `pad` clear of it on every side.
 *
 * Markers nest by padding, so they never collide: the static plot brackets sit
 * outside the card, your selection just outside those, and the strike frame and
 * storm reticle outside everything.
 */
function markerFrame(cove: Cove, pad: number) {
  const halfW = Math.max(cove.w * 0.42, cove.markerW / 2 + pad);
  const halfH = Math.max(cove.h * 0.3, cove.markerH / 2 + pad);
  return {
    x: cove.markerX - halfW,
    y: cove.markerY - halfH,
    w: halfW * 2,
    h: halfH * 2,
    halfW,
    halfH,
  };
}

interface Crate {
  g: Graphics;
  from: { x: number; y: number };
  to: { x: number; y: number };
  ctrl: { x: number; y: number };
  start: number;
  dur: number;
  amber: boolean;
  done: boolean;
}

/* ---------- player tokens ---------- */

/**
 * A player, drawn as a token rather than a figure: other people are small grey
 * squares, you are a taller white block with a stem. Two shapes, two greys and
 * one white — a crowd of eight reads instantly at 12px, which a crowd of eight
 * little sailboats never did, and it costs the board no ornament.
 *
 * The signature is unchanged so the fleet/my-boat plumbing above is untouched.
 */
function drawBoat(g: Graphics, s: number, kind: 'other' | 'mine' | 'barge'): void {
  g.clear();
  if (kind === 'other') {
    const w = 7 * s;
    g.rect(-w / 2, -w / 2, w, w).fill(OTHER);
    return;
  }
  // yours: a block on a stem, so your position is found without reading colour
  const w = kind === 'mine' ? 9 * s : 7 * s;
  const h = kind === 'mine' ? 11 * s : 8 * s;
  g.rect(-w / 2, -h, w, h).fill(FOCUS);
  g.moveTo(0, 0)
    .lineTo(0, -h - 6 * s)
    .stroke({ color: FOCUS, width: Math.max(1, 1.2 * s) });
}

/* ---------- the scene ---------- */

export class BayScene {
  private app = new Application();
  private coves: Cove[] = [];
  private skyG = new Graphics();
  private chartG = new Graphics(); // static sonar rings
  private wavesG = new Graphics();
  private fogC = new Container();
  private stormC = new Container();
  private stormBolt = new Graphics();
  private stormRain = new Graphics();
  /** The reticle body — sized per layout so it always clears the zone card. */
  private stormReticle = new Graphics();
  /** Half-extents of the reticle, so the drop line and bolt start below it. */
  private stormReach = { halfW: 44, halfH: 26 };
  private flashG = new Graphics();
  private cargoC = new Container();
  private ripples = new Graphics();

  private state: BayState = {
    phase: null,
    totalsMinor: [],
    boatCounts: [],
    tideReport: null,
    weatherId: null,
    myZones: [],
    fogActive: false,
    finalOrderUsed: false,
    storm: null,
    struckZone: null,
    resolvedRoundId: null,
    signals: [],
    surgeRound: false,
  };
  private handlers: BayHandlers = { onPick: () => {}, onFlag: () => {} };
  private sky = MOOD.night;
  private fogAlpha = 0;
  private stormPos = { x: -200, y: -200 };
  /** Previous frame's timestamp, so scene motion is time-based, not per-frame. */
  private lastTickAt = Date.now();
  /** Storm-window identity + local start, so the feint patrol is phase-relative. */
  private stormLeg = { endsAt: 0, startedAt: 0 };
  private crates: Crate[] = [];
  private rippleFx: { x: number; y: number; start: number; amber: boolean }[] = [];
  private strikeHandledFor: number | null = null;
  private beamStart = 0;
  private flashUntil = 0;
  /** Expanding red shockwave centered on the struck zone (the "which zone?" answer). */
  private strikeImpact: { x: number; y: number; start: number } | null = null;
  private longPress: { timer: number; zone: number } | null = null;
  private suppressTap = false;
  private hoveredZone: number | null = null;
  private reduced = false;
  private destroyed = false;
  private hostObserver: ResizeObserver | null = null;

  async init(host: HTMLElement, handlers: BayHandlers): Promise<void> {
    this.handlers = handlers;
    this.reduced =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    await this.app.init({ backgroundAlpha: 0, resizeTo: host, antialias: true });
    if (this.destroyed) return;
    host.appendChild(this.app.canvas);
    host.addEventListener('contextmenu', (e) => e.preventDefault());

    const stage = this.app.stage;
    stage.addChild(this.skyG, this.chartG, this.wavesG);

    for (let z = 0; z < ZONE_COUNT; z++) {
      const land = new Graphics();
      const selection = new Graphics();
      const beam = new Graphics();
      const wreckG = new Graphics();
      const gauge = new Graphics();
      const mast = new Graphics();
      const fleet = new Container();
      const myBoat = new Container();
      const myHalo = new Graphics();
      const mySeal = new Graphics();
      const myRope = new Graphics();
      const myHull = new Graphics();
      drawBoat(myHull, 1.5, 'mine');
      myBoat.addChild(myRope, myHalo, myHull, mySeal);
      myBoat.visible = false;
      const shadow = { color: 0x000000, blur: 3, distance: 1, alpha: 0.8 };
      const flagCount = new Text({
        text: '',
        style: { fill: DIM, fontSize: 11, fontWeight: '700', dropShadow: shadow },
      });
      const hit = new Graphics();
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointertap', () => {
        if (this.suppressTap) {
          this.suppressTap = false;
          return;
        }
        this.handlers.onPick(z);
      });
      hit.on('rightclick', (e) => {
        const r = this.app.canvas.getBoundingClientRect();
        this.handlers.onFlag(z, r.left + e.global.x, r.top + e.global.y);
      });
      hit.on('pointerdown', (e) => {
        this.clearLongPress();
        const gx = e.global.x;
        const gy = e.global.y;
        this.longPress = {
          zone: z,
          timer: window.setTimeout(() => {
            this.suppressTap = true;
            const r = this.app.canvas.getBoundingClientRect();
            this.handlers.onFlag(z, r.left + gx, r.top + gy);
          }, 480),
        };
      });
      hit.on('pointerup', () => this.clearLongPress());
      hit.on('pointerupoutside', () => this.clearLongPress());
      hit.on('pointerover', () => {
        this.hoveredZone = z;
        this.redraw();
      });
      hit.on('pointerout', () => {
        if (this.hoveredZone === z) this.hoveredZone = null;
        this.redraw();
      });

      stage.addChild(land, selection, beam, wreckG, gauge, mast, fleet, myBoat);
      stage.addChild(flagCount, hit);
      this.coves.push({
        hit,
        land,
        selection,
        beam,
        wreckG,
        gauge,
        mast,
        flagCount,
        fleet,
        myBoat,
        myHalo,
        mySeal,
        myRope,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        side: 'top',
        shoreH: 0,
        moorX: 0,
        moorY: 0,
        markerX: 0,
        markerY: 0,
        markerW: 168,
        markerH: 76,
        beamOrigin: { x: 0, y: 0 },
      });
    }

    // The information shutter. Blind Fog is not weather here, it is a screen
    // coming down over the readout, so it is drawn as flat horizontal bands.
    for (let i = 0; i < 11; i++) {
      const puff = new Graphics();
      puff.rect(-140, -14, 280, 28).fill({ color: 0xffffff, alpha: 0.05 });
      this.fogC.addChild(puff);
    }
    this.fogC.alpha = 0;
    stage.addChild(this.fogC);

    /*
     * The storm is a targeting reticle that hunts between the two published
     * feints and then locks onto the zone that was drawn. A weather system
     * would be an illustration; a reticle is the same information as a mark,
     * and it says the honest thing — something is being aimed, and it is not
     * aiming at you personally. Its geometry is set in layout(), because it has
     * to be sized to clear the DOM card it lands on.
     */
    this.stormBolt.visible = false;
    this.stormC.addChild(this.stormRain, this.stormReticle, this.stormBolt);
    this.stormC.visible = false;
    stage.addChild(this.stormC, this.cargoC, this.ripples);

    this.flashG.rect(0, 0, 4, 4).fill(0xffffff);
    this.flashG.alpha = 0;
    stage.addChild(this.flashG);

    this.layout();
    this.app.renderer.on('resize', () => this.layout());

    // `resizeTo` only reacts to WINDOW resizes, so the bay kept its old size
    // whenever the host box changed on its own — opening or closing the docked
    // chat column, for instance. The canvas then drew every anchorage, boat and
    // pier at the previous width while the DOM cove cards had already moved:
    // the two halves of the same map, visibly out of register. Observe the host.
    this.hostObserver = new ResizeObserver(() => {
      if (this.destroyed || !this.app.renderer) return;
      const { clientWidth, clientHeight } = host;
      if (clientWidth <= 0 || clientHeight <= 0) return;
      if (clientWidth === this.app.screen.width && clientHeight === this.app.screen.height) return;
      this.app.resize();
    });
    this.hostObserver.observe(host);

    this.app.ticker.add(() => this.tick());
  }

  update(state: BayState): void {
    this.state = state;
    if (
      state.phase === 'RESOLVED' &&
      state.struckZone !== null &&
      state.resolvedRoundId !== null &&
      this.strikeHandledFor !== state.resolvedRoundId
    ) {
      this.strikeHandledFor = state.resolvedRoundId;
      this.beginStrike(state.struckZone);
    }
    this.redraw();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearLongPress();
    this.hostObserver?.disconnect();
    this.hostObserver = null;
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private clearLongPress(): void {
    if (this.longPress) {
      clearTimeout(this.longPress.timer);
      this.longPress = null;
    }
  }

  /* ---------- layout ---------- */

  private layout(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // Geometry comes from coveLayout.ts — the ONE source the DOM cove cards
    // also read. This used to be a second hardcoded copy of the centers, which
    // silently drifted: the cards sat in one arrangement and the boats, piers
    // and anchorages in another.
    const layouts = getCoveLayouts(W, H);

    this.coves.forEach((cove, z) => {
      const l = layouts[z];
      if (!l) return;
      cove.x = l.hit.x;
      cove.y = l.hit.y;
      cove.w = l.hit.width;
      cove.h = l.hit.height;
      cove.side = l.side;
      cove.shoreH = l.shoreHeight;
      cove.moorX = l.moorX;
      cove.moorY = l.moorY;
      cove.markerX = l.markerX;
      cove.markerY = l.markerY;
      cove.markerW = l.markerWidth;
      cove.markerH = l.markerHeight;
      cove.hit.clear();
      cove.hit.rect(0, 0, cove.w, cove.h).fill({ color: 0xffffff, alpha: 0.0001 });
      cove.hit.position.set(cove.x, cove.y);
      cove.hit.hitArea = new Rectangle(0, 0, cove.w, cove.h);
      cove.beamOrigin = {
        x: cove.x + cove.w * (cove.side === 'top' ? 0.72 : 0.28),
        y: cove.side === 'top' ? cove.y + cove.h * 0.3 : cove.y + cove.h * 0.7,
      };
      this.drawAnchorage(cove);
    });

    // Every cove shares a card size, so one reticle serves all six.
    const firstCove = this.coves[0];
    if (firstCove) this.drawStormReticle(firstCove);

    this.drawChart(W, H);
    this.flashG.clear();
    this.flashG.rect(0, 0, W, H).fill(0xffffff);
    this.flashG.alpha = 0;

    // fog puffs spread over the water area
    this.fogC.children.forEach((puff, i) => {
      puff.position.set(((i * 173) % Math.max(1, W)) + 40, 60 + ((i * 97) % Math.max(1, H - 60)));
      puff.scale.set(Math.min(1.25, Math.max(0.82, W / 1200)));
    });

    this.redraw();
  }

  /**
   * Static zone plot: corner brackets around the seat, and a centre tick.
   * Brackets rather than a closed box — an open frame sits behind the DOM
   * card without drawing a second border around it.
   */
  private drawAnchorage(cove: Cove): void {
    const { land } = cove;
    land.clear();
    const f = markerFrame(cove, 12);
    const arm = Math.min(18, Math.min(f.halfW, f.halfH) * 0.36);
    land.rect(f.x, f.y, f.w, f.h).fill({ color: 0xffffff, alpha: 0.012 });
    for (const [x, y, sx, sy] of [
      [f.x, f.y, 1, 1],
      [f.x + f.w, f.y, -1, 1],
      [f.x, f.y + f.h, 1, -1],
      [f.x + f.w, f.y + f.h, -1, -1],
    ] as const) {
      land
        .moveTo(x + sx * arm, y)
        .lineTo(x, y)
        .lineTo(x, y + sy * arm)
        .stroke({ color: CHART, width: 1 });
    }
  }

  /**
   * The reticle brackets its target rather than sitting on it.
   *
   * Sized from the zone card plus a margin, so the card can never swallow it —
   * which is exactly what happened when this was a fixed 88x52 box aimed at the
   * middle of a 168x76 card. Bracketing is also the truer picture: a targeting
   * reticle encloses what it is aimed at.
   */
  private drawStormReticle(cove: Cove): void {
    const f = markerFrame(cove, 20);
    this.stormReach = { halfW: f.halfW, halfH: f.halfH };

    const g = this.stormReticle;
    g.clear();
    const arm = Math.min(30, Math.min(f.halfW, f.halfH) * 0.45);
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const x = sx * f.halfW;
      const y = sy * f.halfH;
      g.moveTo(x - sx * arm, y)
        .lineTo(x, y)
        .lineTo(x, y - sy * arm)
        .stroke({ color: DANGER, width: 2 });
    }
    // A hairline ties the four brackets together. Nothing is painted inside the
    // frame: that is the card's territory, and a fill there would be invisible
    // over a zone and a loud red slab over open board.
    g.rect(-f.halfW, -f.halfH, f.halfW * 2, f.halfH * 2).stroke({
      color: DANGER,
      width: 1,
      alpha: 0.3,
    });

    // The strike: a hard red column dropping from the bottom of the frame.
    this.stormBolt.clear();
    this.stormBolt.rect(-5, f.halfH, 10, 52).fill(DANGER);
    this.stormBolt.rect(-1.5, f.halfH, 3, 60).fill(0xffffff);
  }

  /**
   * The plot frame — drawn once per resize. Corner brackets, ruler ticks on
   * every edge, and two axes through the origin that BREAK before the centre
   * so the round's leading figure sits in clean space. This is the whole of
   * the board's decoration: it says "this is a measured field", and it says
   * nothing else.
   */
  private drawChart(W: number, H: number): void {
    this.chartG.clear();
    const m = 16;
    const cx = W / 2;
    const cy = H / 2;
    const gap = Math.min(W, H) * 0.19; // clear space for the centre readout

    // frame: four corner brackets, never a closed box
    const arm = Math.min(52, Math.min(W, H) * 0.07);
    for (const [x, y, sx, sy] of [
      [m, m, 1, 1],
      [W - m, m, -1, 1],
      [m, H - m, 1, -1],
      [W - m, H - m, -1, -1],
    ] as const) {
      this.chartG
        .moveTo(x + sx * arm, y)
        .lineTo(x, y)
        .lineTo(x, y + sy * arm)
        .stroke({ color: CHART, width: 1 });
    }

    // axes, interrupted at the origin
    this.chartG.moveTo(m, cy).lineTo(cx - gap, cy).stroke({ color: CHART, width: 1, alpha: 0.7 });
    this.chartG
      .moveTo(cx + gap, cy)
      .lineTo(W - m, cy)
      .stroke({ color: CHART, width: 1, alpha: 0.7 });
    this.chartG
      .moveTo(cx, m)
      .lineTo(cx, cy - gap * 0.75)
      .stroke({ color: CHART, width: 1, alpha: 0.4 });
    this.chartG
      .moveTo(cx, cy + gap * 0.75)
      .lineTo(cx, H - m)
      .stroke({ color: CHART, width: 1, alpha: 0.4 });

    // ruler ticks — every twelfth across, every eighth down, long on the beat
    for (let i = 1; i < 12; i++) {
      const x = m + ((W - 2 * m) * i) / 12;
      const long = i % 3 === 0;
      const len = long ? 9 : 5;
      this.chartG.moveTo(x, m).lineTo(x, m + len).stroke({ color: CHART, width: 1, alpha: long ? 0.9 : 0.45 });
      this.chartG
        .moveTo(x, H - m)
        .lineTo(x, H - m - len)
        .stroke({ color: CHART, width: 1, alpha: long ? 0.9 : 0.45 });
    }
    for (let i = 1; i < 8; i++) {
      const y = m + ((H - 2 * m) * i) / 8;
      const long = i % 2 === 0;
      const len = long ? 9 : 5;
      this.chartG.moveTo(m, y).lineTo(m + len, y).stroke({ color: CHART, width: 1, alpha: long ? 0.9 : 0.45 });
      this.chartG
        .moveTo(W - m, y)
        .lineTo(W - m - len, y)
        .stroke({ color: CHART, width: 1, alpha: long ? 0.9 : 0.45 });
    }
  }

  /* ---------- state-driven redraw (cheap, on every store change) ---------- */

  private redraw(): void {
    const st = this.state;
    const showTide = st.phase === 'ANCHOR_OPEN' && st.tideReport;
    const tideByZone = new Map(st.tideReport?.entries.map((e) => [e.zone, e]) ?? []);

    this.coves.forEach((cove, z) => {
      const report = tideByZone.get(z);
      const struck =
        st.struckZone === z && (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');

      // Selection uses ring + boat + the DOM card so it never relies on color alone.
      const mine = st.myZones.find((m) => m.zone === z);
      const hovered = this.hoveredZone === z;
      cove.selection.clear();
      if (mine || (hovered && st.phase === 'ANCHOR_OPEN')) {
        // Just outside the card, inside the static plot brackets.
        const f = markerFrame(cove, 5);
        const color = struck ? DANGER : FOCUS;
        cove.selection
          .rect(f.x, f.y, f.w, f.h)
          .stroke({ color, width: mine ? 2 : 1, alpha: mine ? 1 : 0.5 });
      }

      // other players' boats — crowding as literal fleets (public boatCount)
      const count = showTide && report ? report.boatCount : (st.boatCounts[z] ?? 0);
      const shown = Math.min(count, 7);
      while (cove.fleet.children.length < shown) {
        const b = new Graphics();
        drawBoat(b, 1.45, 'other');
        cove.fleet.addChild(b);
      }
      while (cove.fleet.children.length > shown) {
        cove.fleet.removeChildAt(cove.fleet.children.length - 1);
      }

      // my boat(s)
      cove.myBoat.visible = !!mine;
      if (mine) {
        const hull = cove.myBoat.children[2] as Graphics;
        drawBoat(hull, mine.primary ? 1.9 : 1.35, mine.primary ? 'mine' : 'barge');
      }

      // signal flags on the mast
      const sig = { RALLY: 0, FLEE: 0, HOLD: 0 };
      for (const s of st.signals) if (s.zone === z) sig[s.kind] += 1;
      cove.mast.clear();
      const mx = cove.x + cove.w * 0.16;
      const mBase =
        cove.side === 'top' ? cove.y + cove.shoreH - 4 : cove.y + cove.h - cove.shoreH + 4;
      const mDir = cove.side === 'top' ? -1 : 1;
      const kinds: { n: number; color: number; swallow: boolean; rect: boolean }[] = [
        { n: sig.RALLY, color: SAFE, swallow: false, rect: false },
        { n: sig.FLEE, color: AMBER, swallow: true, rect: false },
        { n: sig.HOLD, color: FOCUS, swallow: false, rect: true },
      ];
      const anyFlags = kinds.some((k) => k.n > 0);
      if (anyFlags) {
        cove.mast
          .moveTo(mx, mBase)
          .lineTo(mx, mBase + mDir * -34)
          .stroke({ color: ROPE, width: 2 });
        let fy = mBase + mDir * -32;
        for (const k of kinds) {
          if (!k.n) continue;
          if (k.rect) cove.mast.rect(mx + 2, fy, 14, 8).fill(k.color);
          else if (k.swallow)
            cove.mast
              .poly([mx + 2, fy, mx + 17, fy, mx + 11, fy + 4, mx + 17, fy + 8, mx + 2, fy + 8])
              .fill(k.color);
          else cove.mast.poly([mx + 2, fy, mx + 17, fy + 4, mx + 2, fy + 8]).fill(k.color);
          fy += mDir * -11;
        }
        const total = sig.RALLY + sig.FLEE + sig.HOLD;
        cove.flagCount.text = total > 1 ? `×${total}` : '';
        cove.flagCount.position.set(mx + 20, mBase + mDir * -40);
      } else {
        cove.flagCount.text = '';
      }

      // wreck damage overlay
      cove.wreckG.clear();
      const survived =
        st.struckZone !== null &&
        st.struckZone !== z &&
        (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');
      if (struck) {
        // "This one." Fill, hard frame and a struck-through diagonal — three
        // signals, none of them colour alone, all of them legible with motion
        // disabled and at a glance from across a desk.
        const f = markerFrame(cove, 20);
        cove.wreckG.rect(f.x, f.y, f.w, f.h).fill({ color: DANGER, alpha: 0.14 });
        cove.wreckG.rect(f.x, f.y, f.w, f.h).stroke({ color: DANGER, width: 2.5 });
        cove.wreckG
          .moveTo(f.x, f.y)
          .lineTo(f.x + f.w, f.y + f.h)
          .stroke({ color: DANGER, width: 1.5, alpha: 0.6 });
        cove.wreckG
          .moveTo(f.x + f.w, f.y)
          .lineTo(f.x, f.y + f.h)
          .stroke({ color: DANGER, width: 1.5, alpha: 0.6 });
      } else if (survived) {
        // survived: one small green tick at the plot's corner
        cove.wreckG
          .rect(cove.beamOrigin.x - 3, cove.beamOrigin.y - 3, 6, 6)
          .fill({ color: SAFE, alpha: 0.95 });
      }
    });

    this.stormC.visible =
      st.phase === 'LOCKED_STORM' || st.phase === 'RESOLVED' || st.phase === 'COOLDOWN';
  }

  /* ---------- the strike cinematic ---------- */

  private beginStrike(struck: number): void {
    this.beamStart = Date.now() + 650;
    if (!this.reduced) this.flashUntil = Date.now() + 200;
    this.stormBolt.visible = true;
    window.setTimeout(() => (this.stormBolt.visible = false), 420);

    // cargo transfer: crates stream from the wreck to every surviving manned cove
    const from = this.coves[struck];
    if (!from) return;
    // the shockwave that answers "which zone got hit?" — fires as the bolt lands
    this.strikeImpact = { x: from.moorX, y: from.moorY, start: Date.now() + (this.reduced ? 0 : 150) };
    const now = Date.now();
    let stagger = 620; // let the bolt land first
    this.coves.forEach((cove, z) => {
      if (z === struck) return;
      const manned =
        (this.state.boatCounts[z] ?? 0) > 0 || this.state.myZones.some((m) => m.zone === z);
      if (!manned) return;
      const mine = this.state.myZones.some((m) => m.zone === z);
      const n = Math.min(3, Math.max(1, Math.round((this.state.boatCounts[z] ?? 1) / 3)));
      for (let i = 0; i < n; i++) {
        const g = new Graphics();
        // Money moving toward YOU is white; money moving to other players is
        // grey. Nothing here is gold — a payout is a number, not a treasure.
        const c = mine ? FOCUS : CRATE;
        g.rect(-3.5, -3.5, 7, 7).fill(c);
        this.cargoC.addChild(g);
        const midX = (from.moorX + cove.moorX) / 2;
        const midY = Math.max(from.moorY, cove.moorY) + 46;
        this.crates.push({
          g,
          from: { x: from.moorX + (i - 1) * 10, y: from.moorY },
          to: { x: cove.moorX + (i - 1) * 12, y: cove.moorY },
          ctrl: { x: midX, y: midY },
          start: now + stagger,
          dur: this.reduced ? 350 : 850 + i * 90,
          amber: mine,
          done: false,
        });
        stagger += 55;
      }
    });
  }

  /* ---------- per-frame ambience ---------- */

  private tick(): void {
    const st = this.state;
    const now = Date.now();
    const sinceLastTick = Math.min(64, Math.max(0, now - this.lastTickAt));
    this.lastTickAt = now;
    const W = this.app.screen.width;
    const H = this.app.screen.height;

    // sky mood: one restrained tint over the chart
    const mood: MoodName =
      st.phase === 'ANCHOR_OPEN'
        ? st.fogActive
          ? 'fog'
          : 'dawn'
        : st.phase === 'LOCKED_STORM'
          ? 'storm'
          : st.phase === 'RESOLVED'
            ? 'golden'
            : 'night';
    this.sky = lerpColor(this.sky, MOOD[mood], 0.05);
    this.skyG.clear();
    // Barely there. The phase is told by the reticle, the shutter and the
    // colour of the countdown — the tint only keeps the board from feeling
    // identical in every phase.
    const atmosphereAlpha = mood === 'storm' ? 0.3 : mood === 'fog' ? 0.16 : 0.1;
    this.skyG.rect(0, 0, W, H).fill({ color: this.sky, alpha: atmosphereAlpha });

    /*
     * Sweep line. One horizontal scan travelling down the plot while bets are
     * open, the way a live channel shows it is live. It stops the moment the
     * table seals, which is the point: motion here means "still open".
     */
    this.wavesG.clear();
    if (!this.reduced && st.phase === 'ANCHOR_OPEN' && !st.fogActive) {
      const sweepY = ((now / 26) % (H + 160)) - 80;
      this.wavesG
        .moveTo(16, sweepY)
        .lineTo(W - 16, sweepY)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.05 });
    }

    // fog
    const fogTarget = st.fogActive
      ? 1
      : st.weatherId === 'HEAVY_FOG' && st.phase === 'ANCHOR_OPEN'
        ? 0.18
        : 0;
    this.fogAlpha += (fogTarget - this.fogAlpha) * (this.reduced ? 1 : 0.08);
    this.fogC.alpha = this.fogAlpha;
    this.fogC.children.forEach((p, i) => {
      p.x += Math.sin(now / 4000 + i) * 0.12;
    });

    this.coves.forEach((cove, z) => {
      const struck = st.struckZone === z && (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');
      const n = cove.fleet.children.length;
      /*
       * Tokens sit on an even row BELOW the zone's frame — a queue, not a
       * scatter, and out from under the card. Drawn at the mooring point they
       * were inside the DOM card's rectangle, so the crowd was reduced to a few
       * grey pixels poking out under the card's bottom edge. They do not bob
       * either: a data mark that drifts is a data mark you cannot count.
       */
      const plotFrame = markerFrame(cove, 12);
      const tokenRowY = plotFrame.y + plotFrame.h + 10;
      cove.fleet.children.forEach((b, i) => {
        const slot = i - (n - 1) / 2;
        b.position.set(cove.markerX + slot * 13, tokenRowY);
        b.rotation = 0;
        b.alpha = struck ? 0.3 : st.fogActive ? 0.35 : 1;
        b.scale.set(1);
      });

      // my boat: bob, halo while a fog order is available, seal once committed, rope when locked
      if (cove.myBoat.visible) {
        const mine = st.myZones.find((m) => m.zone === z);
        // Your own token gets its own line under the crowd, stem pointing up at
        // the card it is staked on — visible, and unmistakably not one of them.
        cove.myBoat.position.set(cove.markerX, tokenRowY + 18);
        cove.myBoat.rotation = 0;
        cove.myBoat.alpha = struck ? 0.55 : 1;
        cove.myHalo.clear();
        cove.mySeal.clear();
        cove.myRope.clear();
        // One last move still available: a white bracket opens around your
        // token. Spent: the bracket closes to a solid bar.
        if (st.fogActive && !st.finalOrderUsed && mine?.primary) {
          const r = 15 + Math.sin(now / 320) * 2;
          cove.myHalo.rect(-r, -r - 6, r * 2, r * 2).stroke({ color: FOCUS, width: 1.5, alpha: 0.9 });
        }
        if (st.fogActive && st.finalOrderUsed && mine?.primary) {
          cove.mySeal.rect(-11, -30, 22, 3).fill({ color: FOCUS, alpha: 0.9 });
        }
        // Locked: a grey tie-bar under your token. Your position is committed
        // and the board says so without a word.
        if (st.phase === 'LOCKED_STORM') {
          cove.myRope.rect(-13, 4, 26, 2).fill({ color: ROPE, alpha: 0.9 });
        }
      }

      // pier tide gauge: waterline height = public band (or exact frac post-lock)
      const report = st.tideReport?.entries.find((e) => e.zone === z);
      const showTide = st.phase === 'ANCHOR_OPEN' && report;
      const postLock = st.phase !== 'ANCHOR_OPEN' && st.totalsMinor.length > 0;
      const frac = showTide
        ? BAND_FRAC[report.band]
        : postLock
          ? (st.totalsMinor[z] ?? 0) / Math.max(1, ...st.totalsMinor)
          : 0.14;
      const frozen = !!st.tideReport?.frozen && st.phase === 'ANCHOR_OPEN';
      const gx = cove.x + cove.w - 26;
      const gTop =
        cove.side === 'top' ? cove.y + cove.shoreH + 8 : cove.y + cove.h - cove.shoreH - 58;
      const gH = 46;
      cove.gauge.clear();
      // Flat fill gauge: a track, a level, and a tick for the trend.
      cove.gauge.rect(gx, gTop, 8, gH).fill({ color: 0x000000, alpha: 0.5 });
      cove.gauge.rect(gx, gTop, 8, gH).stroke({ color: LINE, width: 1 });
      const fillH = Math.max(3, gH * frac);
      cove.gauge
        .rect(gx, gTop + gH - fillH, 8, fillH)
        .fill({ color: DIM, alpha: frozen ? 0.4 : postLock ? 0.95 : 0.75 });
      if (showTide && !frozen) {
        const ty = gTop - 9;
        if (report.trend === 'rising')
          cove.gauge.poly([gx, ty + 6, gx + 8, ty + 6, gx + 4, ty]).fill(DIM);
        else if (report.trend === 'falling')
          cove.gauge.poly([gx, ty, gx + 8, ty, gx + 4, ty + 6]).fill(0x5e5e5e);
        else cove.gauge.rect(gx, ty + 2, 8, 2).fill({ color: 0x5e5e5e });
      } else if (frozen) {
        // frozen: pause bars — information is intentionally stopped
        cove.gauge.rect(gx, gTop - 9, 3, 7).fill(AMBER);
        cove.gauge.rect(gx + 5, gTop - 9, 3, 7).fill(AMBER);
      }

      // lighthouse safety beams after the strike
      cove.beam.clear();
      const survived =
        st.struckZone !== null &&
        st.struckZone !== z &&
        (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');
      if (survived && this.beamStart && now > this.beamStart && now < this.beamStart + 1400) {
        // survived: a green underline that draws itself once, then stops
        const t = Math.min(1, (now - this.beamStart) / 500);
        const f = markerFrame(cove, 12);
        cove.beam.rect(f.x, f.y + f.h, f.w * t, 2).fill({ color: SAFE, alpha: 0.85 });
      } else if (struck && !this.reduced) {
        // the struck plot keeps a slow red pulse until the next round opens
        const pulse = 0.5 + 0.5 * Math.sin(now / 300);
        const f = markerFrame(cove, 28);
        cove.beam
          .rect(f.x, f.y, f.w, f.h)
          .stroke({ color: DANGER, width: 1 + pulse * 2, alpha: 0.25 + pulse * 0.4 });
      }
    });

    // storm motion: prowls between feints while locked, lunges into the wreck
    if (this.stormC.visible) {
      let target: { x: number; y: number } | null = null;
      if (st.phase === 'LOCKED_STORM' && st.storm) {
        // Restart the leg clock whenever a new storm window opens, so the
        // patrol is timed against THIS phase rather than the wall clock.
        if (this.stormLeg.endsAt !== st.storm.endsAt) {
          this.stormLeg = { endsAt: st.storm.endsAt, startedAt: now };
        }
        // Route rules and the reason they exist live in ../stormPath.ts.
        const route = stormRoute(
          st.storm.feints,
          (zone) => {
            const cove = this.coves[zone];
            // Dead centre of the card: the reticle frames it, so aiming at the
            // mooring point would leave the frame hanging low over the zone.
            return cove ? { x: cove.markerX, y: cove.markerY } : null;
          },
          neutralStop(W, H, this.stormReach.halfH + 12),
        );
        target = stormRouteStop(route, now - this.stormLeg.startedAt);
      } else if (st.struckZone !== null) {
        const cove = this.coves[st.struckZone];
        if (cove) target = { x: cove.markerX, y: cove.markerY };
      }
      if (target) {
        if (this.stormPos.x < -100) this.stormPos = { x: W / 2, y: 60 };
        /*
         * Frame-rate independent. The old constant was a fixed fraction PER
         * FRAME, so on a throttled ticker the reticle crawled — it spent the
         * whole dwell drifting across the middle of the board (straight through
         * the countdown) instead of arriving at a zone and sitting on it. With
         * a time constant it covers ~95% of the distance in 300ms whatever the
         * ticker is doing, so each leg is a quick move and a long hold.
         */
        const dt = sinceLastTick;
        const tau = st.phase === 'RESOLVED' ? 45 : st.weatherId === 'HIGH_SWELL' ? 150 : 110;
        const k = 1 - Math.exp(-dt / tau);
        this.stormPos.x += (target.x - this.stormPos.x) * k;
        this.stormPos.y += (target.y - this.stormPos.y) * k;
      }
      this.stormC.position.set(
        this.stormPos.x + (this.reduced ? 0 : Math.sin(now / 700) * 4),
        this.stormPos.y + (this.reduced ? 0 : Math.sin(now / 900) * 2),
      );
      /*
       * Once the round resolves the strike frame takes over the struck zone, so
       * the reticle stands down rather than stacking a second red box on top of
       * it. Eased, not cut, so the lock-on visibly becomes the hit.
       */
      const reticleTarget = st.phase === 'LOCKED_STORM' ? 1 : 0;
      this.stormReticle.alpha +=
        (reticleTarget - this.stormReticle.alpha) *
        (this.reduced ? 1 : 1 - Math.exp(-sinceLastTick / 90));

      // The aiming line: a dashed red drop-line below the frame, running
      // downward while the table is sealed.
      this.stormRain.clear();
      if (st.phase === 'LOCKED_STORM') {
        const drop = (now / 9) % 12;
        for (let i = 0; i < 4; i++) {
          const y = this.stormReach.halfH + 6 + drop + i * 12;
          this.stormRain.rect(-1, y, 2, 6).fill({ color: DANGER, alpha: 0.45 });
        }
      }
    } else {
      this.stormPos = { x: -200, y: -200 };
    }

    // strike flash
    if (this.flashUntil > now) {
      this.flashG.alpha = 0.1 * ((this.flashUntil - now) / 200);
    } else {
      this.flashG.alpha = 0;
    }

    // cargo crates along their arcs
    if (this.crates.length) {
      let alive = false;
      for (const c of this.crates) {
        if (c.done) continue;
        const t = (now - c.start) / c.dur;
        if (t < 0) {
          c.g.visible = false;
          alive = true;
          continue;
        }
        if (t >= 1) {
          c.done = true;
          c.g.visible = false;
          this.rippleFx.push({ x: c.to.x, y: c.to.y, start: now, amber: c.amber });
          continue;
        }
        alive = true;
        c.g.visible = true;
        const u = 1 - t;
        c.g.position.set(
          u * u * c.from.x + 2 * u * t * c.ctrl.x + t * t * c.to.x,
          u * u * c.from.y + 2 * u * t * c.ctrl.y + t * t * c.to.y,
        );
        c.g.rotation = t * 2.2;
      }
      if (!alive && this.crates.every((c) => c.done)) {
        this.crates = [];
        this.cargoC.removeChildren();
      }
    }

    // arrival ripples
    this.ripples.clear();
    this.rippleFx = this.rippleFx.filter((r) => now - r.start < 500);
    for (const r of this.rippleFx) {
      const t = (now - r.start) / 500;
      const rr = 6 + t * 16;
      this.ripples
        .rect(r.x - rr, r.y - rr, rr * 2, rr * 2)
        .stroke({ color: r.amber ? FOCUS : DIM, width: 1.4, alpha: (1 - t) * 0.7 });
    }

    // strike impact shockwave — a triple red ring bursting from the struck zone
    // the instant the bolt lands, so the eye is pulled straight to the answer.
    if (this.strikeImpact) {
      const t = (now - this.strikeImpact.start) / 900;
      if (t >= 1) {
        this.strikeImpact = null;
      } else if (t >= 0) {
        for (let k = 0; k < 3; k++) {
          const tt = t - k * 0.14;
          if (tt < 0 || tt > 1) continue;
          const rr = 8 + tt * 78;
          this.ripples
            .rect(this.strikeImpact.x - rr, this.strikeImpact.y - rr, rr * 2, rr * 2)
            .stroke({ color: DANGER, width: 3 - k, alpha: (1 - tt) * 0.7 });
        }
      }
    }
  }
}
