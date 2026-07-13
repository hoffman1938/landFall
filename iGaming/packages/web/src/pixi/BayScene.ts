/**
 * BayScene — minimal night-chart bay.
 *
 * The environment is a near-black nautical chart: sonar rings, six dashed
 * anchorage circles, vector boats, pier tide gauges, a physical storm,
 * rolling fog, wreck damage and the cargo-transfer payout cinematic.
 * All cove text lives in the DOM layer (CoveStatusCard) — the scene draws
 * no labels, so nothing is duplicated over the map.
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

const CHART = 0x15233c; // chart rings / static anchorage marks
const LINE = 0x1c2a40;
const DIM = 0x8da0ba;
const DANGER = 0xff5a5a;
const SAFE = 0x3ddc97;
const FOCUS = 0x41b7f5;
const AMBER = 0xffb02e; // payout moments ONLY (cargo to my boat)
const CRATE = 0xc8a06a;
const CLOUD = 0x232d40;
const ROPE = 0x8a6f4d;

/** Sky moods per phase — a single low-alpha tint; the chart stays dark. */
const MOOD = {
  dawn: 0x16324a,
  fog: 0x2a3644,
  storm: 0x0d1522,
  golden: 0x3a3020,
  night: 0x0b1526,
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

/** Dashed circle helper — Pixi has no dashed stroke, so we draw arc segments. */
function dashedCircle(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const gap = 0.4; // fraction of each segment left empty
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1 - gap) / segments) * Math.PI * 2;
    const steps = 4;
    g.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
    for (let s = 1; s <= steps; s++) {
      const a = a0 + ((a1 - a0) * s) / steps;
      g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    g.stroke({ color, width, alpha });
  }
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
  beamOrigin: { x: number; y: number };
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

/* ---------- boat drawing ---------- */

function drawBoat(g: Graphics, s: number, kind: 'other' | 'mine' | 'barge'): void {
  g.clear();
  const hull = kind === 'other' ? 0x31435f : 0x243450;
  const sail = kind === 'other' ? 0x51678a : 0xf2f6fd;
  // hull
  g.poly([-9 * s, 0, 9 * s, 0, 5.5 * s, 4.5 * s, -5.5 * s, 4.5 * s]).fill(hull);
  // mast + sail
  g.moveTo(0, 0).lineTo(0, -11 * s).stroke({ color: hull, width: 1.4 * s });
  g.poly([0.8 * s, -10.5 * s, 7.5 * s, -1.5 * s, 0.8 * s, -1.5 * s]).fill(sail);
  if (kind !== 'other') {
    g.poly([-0.8 * s, -9 * s, -5.5 * s, -2 * s, -0.8 * s, -2 * s]).fill({
      color: sail,
      alpha: 0.85,
    });
    // pennant — focus blue, never amber (amber = payout only)
    g.poly([0, -11 * s, 5 * s, -9.6 * s, 0, -8.4 * s]).fill(FOCUS);
  }
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
  private churn = new Graphics();
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
        beamOrigin: { x: 0, y: 0 },
      });
    }

    // Fog bank: restrained overlapping veils. Low opacity keeps the chart
    // legible while still making the information freeze physical.
    for (let i = 0; i < 11; i++) {
      const puff = new Graphics();
      puff.ellipse(0, 0, 110, 28).fill({ color: 0xc6d5e5, alpha: 0.055 });
      this.fogC.addChild(puff);
    }
    this.fogC.alpha = 0;
    stage.addChild(this.fogC);

    // storm: churn shadow + cloud mass + rain + bolt
    this.churn.ellipse(0, 0, 74, 16).fill({ color: 0x050b16, alpha: 0.38 });
    const mass = new Graphics();
    mass.ellipse(0, 0, 52, 24).fill({ color: CLOUD, alpha: 0.95 });
    mass.ellipse(-34, 8, 30, 16).fill({ color: CLOUD, alpha: 0.85 });
    mass.ellipse(32, 7, 32, 17).fill({ color: CLOUD, alpha: 0.85 });
    mass.ellipse(-4, -14, 30, 15).fill({ color: 0x2c3850, alpha: 0.9 });
    this.stormBolt
      .poly([0, 26, -9, 48, -2, 48, -11, 72, 7, 50, 0, 50, 9, 26])
      .fill(0xfff3c0);
    this.stormBolt.visible = false;
    this.stormC.addChild(this.churn, this.stormRain, mass, this.stormBolt);
    this.stormC.visible = false;
    stage.addChild(this.stormC, this.cargoC, this.ripples);

    this.flashG.rect(0, 0, 4, 4).fill(0xffffff);
    this.flashG.alpha = 0;
    stage.addChild(this.flashG);

    this.layout();
    this.app.renderer.on('resize', () => this.layout());
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
    const landscape = W >= H;
    const desktopCenters: readonly [number, number][] = [
      [0.17, 0.29],
      [0.16, 0.51],
      [0.36, 0.7],
      [0.59, 0.72],
      [0.78, 0.53],
      [0.81, 0.31],
    ];
    const mobileCenters: readonly [number, number][] = [
      [0.23, 0.26],
      [0.77, 0.26],
      [0.23, 0.44],
      [0.77, 0.44],
      [0.23, 0.62],
      [0.77, 0.62],
    ];
    const centers = landscape ? desktopCenters : mobileCenters;
    const cw = W * (landscape ? 0.24 : 0.44);
    const ch = H * (landscape ? 0.22 : 0.17);

    this.coves.forEach((cove, z) => {
      const [cx, cy] = centers[z]!;
      const x = cx * W - cw / 2;
      const y = cy * H - ch / 2;
      cove.x = x;
      cove.y = y;
      cove.w = cw;
      cove.h = ch;
      cove.side = cy < 0.48 ? 'top' : 'bottom';
      cove.shoreH = Math.min(54, ch * 0.3);
      cove.moorX = cx * W;
      cove.moorY = cy * H + ch * (cove.side === 'top' ? 0.12 : 0.04);
      cove.hit.clear();
      cove.hit.rect(0, 0, cw, ch).fill({ color: 0xffffff, alpha: 0.0001 });
      cove.hit.position.set(x, y);
      cove.hit.hitArea = new Rectangle(0, 0, cw, ch);
      cove.beamOrigin = {
        x: x + cw * (cove.side === 'top' ? 0.72 : 0.28),
        y: cove.side === 'top' ? y + ch * 0.3 : y + ch * 0.7,
      };
      this.drawAnchorage(cove);
    });

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

  /** Static anchorage mark: a faint zone disc + dashed mooring circle. */
  private drawAnchorage(cove: Cove): void {
    const { land, moorX, moorY, w, h } = cove;
    land.clear();
    const rx = w * 0.36;
    const ry = h * 0.34;
    land.ellipse(moorX, moorY, rx, ry).fill({ color: 0xffffff, alpha: 0.015 });
    dashedCircle(land, moorX, moorY, rx, ry, 26, CHART, 1.2, 0.85);
    // anchor-point tick at the mooring center
    land.circle(moorX, moorY, 2).fill({ color: CHART, alpha: 0.9 });
  }

  /** Static sonar rings — the whole environment, drawn once per resize. */
  private drawChart(W: number, H: number): void {
    this.chartG.clear();
    const cx = W / 2;
    const cy = H * 0.5;
    const maxR = Math.min(W, H) * 0.55;
    for (const f of [0.35, 0.65, 1]) {
      this.chartG.circle(cx, cy, maxR * f).stroke({ color: CHART, width: 1, alpha: 0.5 });
    }
    // bearing ticks on the outer ring
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.chartG
        .moveTo(cx + Math.cos(a) * maxR * 0.98, cy + Math.sin(a) * maxR * 0.98)
        .lineTo(cx + Math.cos(a) * maxR * 1.02, cy + Math.sin(a) * maxR * 1.02)
        .stroke({ color: CHART, width: 1, alpha: 0.6 });
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
        cove.selection
          .ellipse(cove.moorX, cove.moorY, cove.w * 0.36, cove.h * 0.34)
          .stroke({
            color: struck ? DANGER : FOCUS,
            width: mine ? 2.5 : 1.5,
            alpha: mine ? 0.95 : 0.55,
          });
        if (mine) {
          cove.selection
            .ellipse(cove.moorX, cove.moorY, cove.w * 0.36, cove.h * 0.34)
            .fill({ color: struck ? DANGER : FOCUS, alpha: 0.05 });
        }
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
        { n: sig.FLEE, color: 0xff9948, swallow: true, rect: false },
        { n: sig.HOLD, color: FOCUS, swallow: false, rect: true },
      ];
      const anyFlags = kinds.some((k) => k.n > 0);
      if (anyFlags) {
        cove.mast
          .moveTo(mx, mBase)
          .lineTo(mx, mBase + mDir * -34)
          .stroke({ color: 0x33465f, width: 2 });
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
        const rx = cove.w * 0.42;
        const ry = cove.h * 0.4;
        // strong, unmistakable "this zone was hit" mark — color + fill + double
        // ring + X buoys + broken mast, so it reads even with motion disabled.
        cove.wreckG.ellipse(cove.moorX, cove.moorY, rx, ry).fill({ color: 0x5c1220, alpha: 0.5 });
        cove.wreckG
          .ellipse(cove.moorX, cove.moorY, rx, ry)
          .stroke({ color: DANGER, width: 4, alpha: 0.95 });
        cove.wreckG
          .ellipse(cove.moorX, cove.moorY, rx * 0.72, ry * 0.72)
          .stroke({ color: DANGER, width: 1.5, alpha: 0.5 });
        // X buoys
        for (const [bx, by] of [
          [cove.moorX - 26, cove.moorY + 10],
          [cove.moorX + 24, cove.moorY - 6],
        ] as const) {
          cove.wreckG.circle(bx, by, 8).fill({ color: 0x1a0c12, alpha: 0.9 });
          cove.wreckG
            .moveTo(bx - 4, by - 4)
            .lineTo(bx + 4, by + 4)
            .stroke({ color: DANGER, width: 2.5 });
          cove.wreckG
            .moveTo(bx + 4, by - 4)
            .lineTo(bx - 4, by + 4)
            .stroke({ color: DANGER, width: 2.5 });
        }
        // broken mast
        cove.wreckG
          .moveTo(cove.moorX - 4, cove.moorY)
          .lineTo(cove.moorX + 6, cove.moorY - 14)
          .stroke({ color: 0x081420, width: 3 });
      } else if (survived) {
        // small green safety lamp at the landmark
        cove.wreckG
          .circle(cove.beamOrigin.x, cove.beamOrigin.y, 3.5)
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
        const c = mine ? AMBER : CRATE;
        g.roundRect(-4, -4, 8, 8, 1.5).fill(c);
        g.moveTo(-4, 0).lineTo(4, 0).stroke({ color: 0x000000, width: 1, alpha: 0.35 });
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
    const atmosphereAlpha =
      mood === 'storm' ? 0.22 : mood === 'fog' ? 0.14 : mood === 'golden' ? 0.06 : 0.08;
    this.skyG.rect(0, 0, W, H).fill({ color: this.sky, alpha: atmosphereAlpha });

    // sparse drifting swell lines — barely-there water motion
    this.wavesG.clear();
    if (!this.reduced) {
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const yBase = (H * (r + 0.5)) / rows;
        const amp = st.weatherId === 'HIGH_SWELL' && st.phase !== 'ANCHOR_OPEN' ? 3 : 1.6;
        this.wavesG.moveTo(0, yBase);
        for (let x = 0; x <= W; x += 16) {
          this.wavesG.lineTo(x, yBase + Math.sin(now / 1100 + x / 52 + r * 1.9) * amp);
        }
        this.wavesG.stroke({ color: 0x1b3050, width: 1, alpha: 0.22 });
      }
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
      p.x += Math.sin(now / 4000 + i) * 0.15;
    });

    // boats bob; freeze bobbing when locked (roped down)
    const bobAmp = st.phase === 'ANCHOR_OPEN' ? 2.4 : 0.7;
    this.coves.forEach((cove, z) => {
      const struck = st.struckZone === z && (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');
      const n = cove.fleet.children.length;
      cove.fleet.children.forEach((b, i) => {
        const slot = i - (n - 1) / 2;
        b.position.set(
          cove.moorX + slot * 28 + (i % 2) * 7,
          cove.moorY + 12 + Math.sin(now / 520 + i * 1.3 + z) * bobAmp,
        );
        b.rotation = struck ? 0.45 : Math.sin(now / 640 + i) * 0.05;
        b.alpha = struck ? 0.4 : st.fogActive ? 0.3 : 1;
        b.scale.y = struck ? 0.85 : 1;
      });

      // my boat: bob, halo while a fog order is available, seal once committed, rope when locked
      if (cove.myBoat.visible) {
        const mine = st.myZones.find((m) => m.zone === z);
        cove.myBoat.position.set(
          cove.moorX - 2,
          cove.moorY - 6 + Math.sin(now / 470 + z) * (struck ? 0 : bobAmp),
        );
        cove.myBoat.rotation = struck ? 0.5 : Math.sin(now / 600 + z) * 0.04;
        cove.myBoat.alpha = struck ? 0.55 : 1;
        cove.myHalo.clear();
        cove.mySeal.clear();
        cove.myRope.clear();
        if (st.fogActive && !st.finalOrderUsed && mine?.primary) {
          const pulse = 14 + Math.sin(now / 300) * 2.5;
          cove.myHalo.circle(0, -4, pulse).stroke({ color: FOCUS, width: 2, alpha: 0.85 });
        }
        if (st.fogActive && st.finalOrderUsed && mine?.primary) {
          cove.mySeal.circle(12, -16, 7).fill({ color: 0x142438, alpha: 0.9 });
          cove.mySeal.circle(12, -16, 7).stroke({ color: FOCUS, width: 2 });
          cove.mySeal
            .moveTo(8.5, -16)
            .lineTo(11, -13.5)
            .lineTo(15.5, -19)
            .stroke({ color: FOCUS, width: 2 });
        }
        if (st.phase === 'LOCKED_STORM') {
          const shoreY =
            cove.side === 'top'
              ? -(cove.moorY - (cove.y + cove.shoreH))
              : cove.y + cove.h - cove.shoreH - cove.moorY;
          cove.myRope
            .moveTo(-8, 4)
            .quadraticCurveTo(-20, shoreY / 2 + 8, -26, shoreY + 2)
            .stroke({ color: ROPE, width: 2, alpha: 0.9 });
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
      cove.gauge.roundRect(gx, gTop, 10, gH, 4).fill({ color: 0x0b1626, alpha: 0.85 });
      cove.gauge.roundRect(gx, gTop, 10, gH, 4).stroke({ color: LINE, width: 1 });
      const fillH = Math.max(4, gH * frac);
      cove.gauge
        .roundRect(gx + 2, gTop + gH - fillH, 6, fillH - 2, 3)
        .fill({ color: postLock ? FOCUS : 0x3f74d9, alpha: frozen ? 0.5 : 0.95 });
      // trend buoy above the post (▲ rising / ▼ falling / – stable)
      if (showTide && !frozen) {
        const ty = gTop - 10;
        if (report.trend === 'rising')
          cove.gauge.poly([gx + 1, ty + 6, gx + 9, ty + 6, gx + 5, ty]).fill(0x9fd0ff);
        else if (report.trend === 'falling')
          cove.gauge.poly([gx + 1, ty, gx + 9, ty, gx + 5, ty + 6]).fill(0x7d90ad);
        else cove.gauge.rect(gx + 1, ty + 2, 8, 2.5).fill({ color: 0x51678a });
      } else if (frozen) {
        // frozen gauge: pause bars — information is intentionally stopped
        cove.gauge.rect(gx + 1, gTop - 10, 3, 8).fill(0xaebccf);
        cove.gauge.rect(gx + 6, gTop - 10, 3, 8).fill(0xaebccf);
      }

      // lighthouse safety beams after the strike
      cove.beam.clear();
      const survived =
        st.struckZone !== null &&
        st.struckZone !== z &&
        (st.phase === 'RESOLVED' || st.phase === 'COOLDOWN');
      if (survived && this.beamStart && now > this.beamStart && now < this.beamStart + 1700) {
        const t = (now - this.beamStart) / 1700;
        const ang = Math.sin(t * Math.PI * 2) * 0.5 + (cove.side === 'top' ? 0.6 : -0.6);
        const ox = cove.beamOrigin.x;
        const oy = cove.beamOrigin.y;
        const len = 90;
        cove.beam
          .poly([
            ox,
            oy,
            ox + Math.cos(ang - 0.09) * len,
            oy + Math.sin(ang - 0.09) * len,
            ox + Math.cos(ang + 0.09) * len,
            oy + Math.sin(ang + 0.09) * len,
          ])
          .fill({ color: SAFE, alpha: 0.16 });
      } else if (struck && !this.reduced) {
        // pulsing danger ring keeps the eye on the struck zone until next round
        const pulse = 0.5 + 0.5 * Math.sin(now / 240);
        cove.beam
          .ellipse(cove.moorX, cove.moorY, cove.w * 0.46, cove.h * 0.44)
          .stroke({ color: DANGER, width: 2 + pulse * 2.5, alpha: 0.3 + pulse * 0.4 });
      }
    });

    // storm motion: prowls between feints while locked, lunges into the wreck
    if (this.stormC.visible) {
      let target: { x: number; y: number } | null = null;
      if (st.phase === 'LOCKED_STORM' && st.storm) {
        const which = now % 3000 < 1500 ? st.storm.feints[0] : st.storm.feints[1];
        const cove = this.coves[which];
        if (cove) target = { x: cove.moorX, y: cove.moorY - 34 };
      } else if (st.struckZone !== null) {
        const cove = this.coves[st.struckZone];
        if (cove) target = { x: cove.moorX, y: cove.moorY - 26 };
      }
      if (target) {
        if (this.stormPos.x < -100) this.stormPos = { x: W / 2, y: 60 };
        const speed =
          st.phase === 'RESOLVED' ? 0.28 : st.weatherId === 'HIGH_SWELL' ? 0.09 : 0.06;
        this.stormPos.x += (target.x - this.stormPos.x) * speed;
        this.stormPos.y += (target.y - this.stormPos.y) * speed;
      }
      this.stormC.position.set(
        this.stormPos.x + (this.reduced ? 0 : Math.sin(now / 700) * 4),
        this.stormPos.y + (this.reduced ? 0 : Math.sin(now / 900) * 2),
      );
      this.churn.position.set(0, 42);
      // rain
      this.stormRain.clear();
      if (st.phase !== 'COOLDOWN') {
        const drop = (now / 6) % 18;
        for (let i = -2; i <= 2; i++) {
          this.stormRain
            .moveTo(i * 16 - 4, 20 + drop)
            .lineTo(i * 16 - 8, 32 + drop)
            .stroke({ color: 0x8fa6c4, width: 1.4, alpha: 0.5 });
        }
      }
    } else {
      this.stormPos = { x: -200, y: -200 };
    }

    // strike flash
    if (this.flashUntil > now) {
      this.flashG.alpha = 0.22 * ((this.flashUntil - now) / 200);
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
      this.ripples
        .circle(r.x, r.y, 6 + t * 16)
        .stroke({ color: r.amber ? AMBER : 0x9fd0ff, width: 1.6, alpha: (1 - t) * 0.8 });
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
          this.ripples
            .circle(this.strikeImpact.x, this.strikeImpact.y, 8 + tt * 78)
            .stroke({ color: DANGER, width: 3.5 - k, alpha: (1 - tt) * 0.75 });
        }
      }
    }
  }
}
