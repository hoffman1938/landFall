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
  type CosmeticDraw,
  type EnvironmentSpec,
  type EventTierSpec,
  type SignalPublic,
  type TideBand,
  type TideReport,
  type WeatherId,
} from '@landfall/core';
import { getCoveLayouts } from '../coveLayout';
import {
  FEINT_ACQUIRE_MS,
  stormRouteLeg,
  stormRouteZones,
} from '../stormPath';

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
  /**
   * v4 cosmetic board skin. Drawn from its own HMAC domain server-side; the
   * scene only ever reads it. It changes the sky and the ambient layer and
   * touches nothing else — a Black Fog round and an Open Sea round play the
   * same game with the same odds.
   */
  environment: EnvironmentSpec | null;
  /** How loud the reveal is: sweeps, shake, sky, lightning. Presentation only. */
  eventTier: EventTierSpec | null;
  /** Deterministic visual jitter, so every client draws the round identically. */
  cosmetic: CosmeticDraw | null;
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
  /** Environment ambience BEHIND the harbors: stars, aurora, horizon glow. */
  private envBackG = new Graphics();
  /** Environment ambience IN FRONT: rain, fog density, lightning forks. */
  private envFrontG = new Graphics();
  /** The reveal's own layer: radar sweeps and the closing frame. */
  private revealG = new Graphics();
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
    environment: null,
    eventTier: null,
    cosmetic: null,
  };
  private handlers: BayHandlers = { onPick: () => {}, onFlag: () => {} };
  private sky = MOOD.night;
  private fogAlpha = 0;
  private stormPos = { x: -200, y: -200 };
  /** Previous frame's timestamp, so scene motion is time-based, not per-frame. */
  private lastTickAt = Date.now();
  /** Storm-window identity + local start, so the feint patrol is phase-relative. */
  private stormLeg = { endsAt: 0, startedAt: 0 };
  /** Which stop the reticle is on and when it took it, driving the lock-on. */
  private stormAcquire = { legKey: -1, at: 0 };
  private crates: Crate[] = [];
  private rippleFx: { x: number; y: number; start: number; amber: boolean }[] = [];
  private strikeHandledFor: number | null = null;
  private beamStart = 0;
  private flashUntil = 0;
  /** Expanding red shockwave centered on the struck zone (the "which zone?" answer). */
  private strikeImpact: { x: number; y: number; start: number } | null = null;
  /**
   * Camera shake, in board pixels, decaying to zero. Amplitude comes from the
   * event tier and nothing else; on a CALM round it is exactly 0, so the great
   * majority of rounds have a perfectly still board.
   */
  private shake = { amplitude: 0, until: 0 };
  /** Scheduled lightning forks: when to draw one, and for how long. */
  private bolts: { at: number; x: number; seed: number }[] = [];
  /** Reveal window identity, so its progress is measured against THIS window. */
  private revealWindow = { endsAt: 0, startedAt: 0 };
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
    // Order is the whole z-index policy: sky, ambience behind, the chart, then
    // the harbors (added below), then the reveal layer, then the storm.
    stage.addChild(this.skyG, this.envBackG, this.chartG, this.wavesG);

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
    stage.addChild(this.revealG, this.stormC, this.cargoC, this.ripples, this.envFrontG);

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

  /* ---------- environment (cosmetic, independent of everything) ---------- */

  /**
   * A tiny deterministic PRNG seeded from the round's cosmetic draw.
   *
   * Deterministic because every client should see the SAME rain, the same
   * lightning fork in the same place — a round is one shared event, and two
   * players describing it to each other should be describing one thing. It also
   * means the ambience can never accidentally become an input to anything: it
   * is a pure function of a number the server already committed to.
   */
  private cosmeticRandom(index: number): number {
    const base = this.state.cosmetic?.seed ?? 0x9e3779b9;
    let x = (base ^ (index * 0x85ebca6b)) >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  }

  /**
   * The ambient layer. Every branch is a handful of primitives on the same two
   * Graphics objects, because the environments have to be free: one of them
   * runs on 65% of rounds and none of them may cost the board a frame.
   */
  private drawEnvironment(now: number, W: number, H: number): void {
    const env = this.state.environment;
    this.envBackG.clear();
    this.envFrontG.clear();
    if (!env || this.reduced) return;

    switch (env.id) {
      case 'NORMAL_SEA':
        break;

      case 'RAIN': {
        // Rain is drawn as a shear of short strokes, not as particles: the
        // board is an instrument and the weather on it should read as hatching.
        const drift = (now / 9) % 26;
        for (let i = 0; i < 46; i++) {
          const x = (this.cosmeticRandom(i) * (W + 120) + drift * 2) % (W + 120) - 60;
          const y = (this.cosmeticRandom(i + 200) * H + drift * 6) % H;
          this.envFrontG
            .moveTo(x, y)
            .lineTo(x - 4, y + 14)
            .stroke({ color: 0x9fb3c8, width: 1, alpha: 0.14 });
        }
        break;
      }

      case 'NIGHT': {
        for (let i = 0; i < 60; i++) {
          const x = this.cosmeticRandom(i) * W;
          const y = this.cosmeticRandom(i + 300) * H * 0.55;
          const twinkle = 0.25 + 0.25 * Math.sin(now / 900 + i);
          this.envBackG.rect(x, y, 1.4, 1.4).fill({ color: 0xffffff, alpha: twinkle });
        }
        break;
      }

      case 'LIGHTNING': {
        // Horizon flashes only — the fork itself belongs to a TEMPEST reveal.
        const beat = (now / 2_600) % 1;
        if (beat < 0.05) {
          this.envBackG
            .rect(0, 0, W, H * 0.42)
            .fill({ color: 0x6f7fa8, alpha: 0.05 * (1 - beat / 0.05) });
        }
        break;
      }

      case 'RED_SKY': {
        this.envBackG.rect(0, 0, W, H * 0.5).fill({ color: 0x7a1c14, alpha: 0.09 });
        break;
      }

      case 'AURORA': {
        for (let band = 0; band < 3; band++) {
          const phase = now / (5_200 + band * 900);
          const y = H * (0.08 + band * 0.05) + Math.sin(phase) * 12;
          this.envBackG
            .rect(0, y, W, 16 + band * 6)
            .fill({ color: band === 1 ? 0x17e07d : 0x2f8fbf, alpha: 0.05 });
        }
        break;
      }

      case 'BLACK_FOG': {
        // The rarest skin: a heavy vignette that leaves the harbors legible and
        // takes the horizon away. It must never obscure a control — the game is
        // still being played through it.
        const inset = Math.min(W, H) * 0.1;
        this.envFrontG.rect(0, 0, W, inset).fill({ color: 0x000000, alpha: 0.5 });
        this.envFrontG.rect(0, H - inset, W, inset).fill({ color: 0x000000, alpha: 0.5 });
        this.envFrontG.rect(0, 0, inset, H).fill({ color: 0x000000, alpha: 0.45 });
        this.envFrontG.rect(W - inset, 0, inset, H).fill({ color: 0x000000, alpha: 0.45 });
        break;
      }
    }

    // Scheduled forks (TEMPEST reveals, and only those).
    for (const bolt of this.bolts) {
      const age = now - bolt.at;
      if (age < 0 || age > 220) continue;
      const alpha = 1 - age / 220;
      let x = bolt.x;
      let y = 0;
      for (let seg = 0; seg < 7; seg++) {
        const nx = x + (this.cosmeticRandom(bolt.seed + seg) - 0.5) * 60;
        const ny = y + H / 7;
        this.envFrontG
          .moveTo(x, y)
          .lineTo(nx, ny)
          .stroke({ color: 0xffffff, width: 2, alpha: alpha * 0.7 });
        x = nx;
        y = ny;
      }
    }
    if (this.bolts.length && now - this.bolts[this.bolts.length - 1]!.at > 400) this.bolts = [];
  }

  /* ---------- the reveal, in four readable stages ---------- */

  /**
   * The five seconds between the table sealing and the strike, spent saying one
   * thing: *how close is this to being decided?*
   *
   *   0–18 %   the storm arrives      a ring opens at the centre of the board
   *   18–52 %  radar sweeps           N pulses cross every harbor in turn
   *   52–84 %  the approach           a frame closes from the board's edges
   *   84–100 % focus                  the frame tightens onto the reticle
   *
   * `pulses` is the only thing the event tier changes here. The RESULT ALREADY
   * EXISTS — it was drawn in `beginRound()` on the server, before this window
   * opened — and nothing in this method has, or could have, any access to it:
   * the client is not told the struck harbor until the LANDFALL message. The
   * narrowing therefore cannot leak an answer, and equally it never CLAIMS to
   * exclude a harbor: the sweeps keep crossing all six, and the frame closes
   * on the reticle's patrol stop, which is a published decoy.
   */
  private drawReveal(now: number, W: number, H: number): void {
    this.revealG.clear();
    const st = this.state;
    if (st.phase !== 'LOCKED_STORM' || !st.storm) return;

    const span = Math.max(1, this.revealWindow.endsAt - this.revealWindow.startedAt);
    const t = Math.min(1, Math.max(0, (now - this.revealWindow.startedAt) / span));
    const tier = st.eventTier;
    const pulses = tier?.pulses ?? 2;
    const cx = W / 2;
    const cy = H / 2;
    const maxR = Math.hypot(W, H) / 2;

    // Stage 1 — arrival.
    if (t < 0.2) {
      const u = t / 0.2;
      const r = maxR * 0.16 * (1 - (1 - u) ** 2);
      this.revealG
        .circle(cx, cy, r)
        .stroke({ color: DANGER, width: 2, alpha: 0.5 * (1 - u) });
    }

    // Stage 2 — radar sweeps. Each pulse is a ring crossing the whole board, so
    // every harbor is scanned by every pulse. Nothing is eliminated.
    if (t >= 0.14 && t < 0.9) {
      const u = (t - 0.14) / (0.9 - 0.14);
      for (let i = 0; i < pulses; i++) {
        const pu = (u * pulses - i) % 1;
        if (pu < 0 || pu > 1) continue;
        const r = maxR * pu;
        this.revealG
          .circle(cx, cy, r)
          .stroke({ color: DANGER, width: 1.5, alpha: 0.28 * (1 - pu) });
      }
    }

    // Stage 3+4 — the frame closes. It is drawn as four inward-marching edges,
    // easing toward the reticle's current stop rather than toward any harbor
    // the client has been told about (it has not been told about one).
    if (t >= 0.5) {
      const u = Math.min(1, (t - 0.5) / 0.5);
      const ease = 1 - (1 - u) ** 3;
      const tx = this.stormPos.x >= 0 ? this.stormPos.x : cx;
      const ty = this.stormPos.y >= 0 ? this.stormPos.y : cy;
      const halfW = lerp(W / 2, this.stormReach.halfW + 26, ease);
      const halfH = lerp(H / 2, this.stormReach.halfH + 26, ease);
      const x = lerp(cx, tx, ease);
      const y = lerp(cy, ty, ease);
      this.revealG
        .rect(x - halfW, y - halfH, halfW * 2, halfH * 2)
        .stroke({ color: DANGER, width: 1, alpha: 0.18 + ease * 0.4 });

      // Everything outside the closing frame loses light. Dimming is the honest
      // half of "narrowing": it says the attention is here now, not that the
      // rest is safe — and it lifts completely the instant the strike lands.
      const dim = ease * 0.34;
      if (dim > 0.01) {
        this.revealG.rect(0, 0, W, Math.max(0, y - halfH)).fill({ color: 0x000000, alpha: dim });
        this.revealG
          .rect(0, y + halfH, W, Math.max(0, H - (y + halfH)))
          .fill({ color: 0x000000, alpha: dim });
        this.revealG
          .rect(0, Math.max(0, y - halfH), Math.max(0, x - halfW), halfH * 2)
          .fill({ color: 0x000000, alpha: dim });
        this.revealG
          .rect(x + halfW, Math.max(0, y - halfH), Math.max(0, W - (x + halfW)), halfH * 2)
          .fill({ color: 0x000000, alpha: dim });
      }
    }

    // A TEMPEST throws its lightning during the approach, not at the strike —
    // at the strike it would compete with the answer.
    if (tier?.lightning && this.bolts.length === 0 && t > 0.55) {
      this.bolts = [0, 1, 2].map((i) => ({
        at: now + i * 170,
        x: this.cosmeticRandom(i + 900) * W,
        seed: 1_000 + i * 17,
      }));
    }
  }

  /* ---------- the strike cinematic ---------- */

  private beginStrike(struck: number): void {
    this.beamStart = Date.now() + 650;
    if (!this.reduced) this.flashUntil = Date.now() + 200;
    // Shake amplitude comes from the event tier and nowhere else. CALM is 0, so
    // three rounds in four have a completely still board — which is what makes
    // the one in twenty that moves mean something.
    const amplitude = this.reduced ? 0 : (this.state.eventTier?.shakePx ?? 0);
    if (amplitude > 0) {
      this.shake = { amplitude, until: Date.now() + 520 };
    }
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
    // The environment owns the ground colour; the phase tints on top of it. A
    // Red Sky round stays a red sky in every phase, which is the point of a
    // cosmetic skin — otherwise the rare ones would be invisible for most of
    // the round they are supposed to decorate.
    const envHex = st.environment?.skyHex ?? null;
    const phaseHex = MOOD[mood];
    const target = envHex === null ? phaseHex : lerpColor(envHex, phaseHex, 0.45);
    this.sky = lerpColor(this.sky, target, 0.05);
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

    /*
     * Storm motion. The reticle has exactly six possible positions — the six
     * zone plots — and it SNAPS between them. It never slides, so there is no
     * frame in which it sits between harbors, drifts across the countdown, or
     * hangs off the board. Re-acquiring is carried by a 160ms lock-on instead
     * of by travel, which is both the stricter reading of "it moves between
     * zones" and the more instrument-like one.
     */
    if (this.stormC.visible) {
      let target: { x: number; y: number } | null = null;
      let legKey = -1;
      if (st.phase === 'LOCKED_STORM' && st.storm) {
        // Restart the leg clock whenever a new storm window opens, so the
        // patrol is timed against THIS phase rather than the wall clock.
        if (this.stormLeg.endsAt !== st.storm.endsAt) {
          this.stormLeg = { endsAt: st.storm.endsAt, startedAt: now };
          this.revealWindow = { endsAt: st.storm.endsAt, startedAt: now };
          this.bolts = [];
        }
        // Route rules and the reason they exist live in ../stormPath.ts.
        const zones = stormRouteZones(st.storm.feints, ZONE_COUNT);
        const leg = stormRouteLeg(zones.length, now - this.stormLeg.startedAt);
        const zone = zones[leg];
        const cove = zone === undefined ? undefined : this.coves[zone];
        if (cove) {
          // Dead centre of the card: the reticle frames it, so aiming at the
          // mooring point would leave the frame hanging low over the zone.
          target = { x: cove.markerX, y: cove.markerY };
          legKey = leg;
        }
      } else if (st.struckZone !== null) {
        const cove = this.coves[st.struckZone];
        if (cove) {
          target = { x: cove.markerX, y: cove.markerY };
          legKey = ZONE_COUNT + st.struckZone;
        }
      }
      if (target) {
        this.stormPos = target;
        if (this.stormAcquire.legKey !== legKey) {
          this.stormAcquire = { legKey, at: now };
        }
      }
      // Before the first target exists there is nowhere legitimate to draw, and
      // the sentinel is off-board. `renderable` skips the draw without touching
      // `visible`, which redraw() owns.
      this.stormC.renderable = this.stormPos.x >= 0;
      this.stormC.position.set(this.stormPos.x, this.stormPos.y);
      // Lock-on: a brief settle from slightly wide, in the 120-180ms band the
      // rest of the interface uses for a press. No idle jitter — a reticle that
      // trembles on its target reads as noise, not as aim.
      const acquire = this.reduced
        ? 1
        : Math.min(1, (now - this.stormAcquire.at) / FEINT_ACQUIRE_MS);
      const ease = 1 - (1 - acquire) ** 3;
      this.stormC.scale.set(1 + (1 - ease) * 0.18);
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
    }

    // The cosmetic skin, then the reveal's own layer.
    this.drawEnvironment(now, W, H);
    this.drawReveal(now, W, H);

    // Camera shake — the whole stage, so nothing can drift out of register with
    // anything else. It decays to exactly zero and the stage is snapped back,
    // because a board that ends a round half a pixel off never recovers.
    if (this.shake.until > now) {
      const remaining = (this.shake.until - now) / 520;
      const amp = this.shake.amplitude * remaining * remaining;
      this.app.stage.position.set(
        (Math.random() - 0.5) * 2 * amp,
        (Math.random() - 0.5) * 2 * amp,
      );
    } else if (this.app.stage.position.x !== 0 || this.app.stage.position.y !== 0) {
      this.app.stage.position.set(0, 0);
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
