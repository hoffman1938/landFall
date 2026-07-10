/**
 * PixiJS harbor map — the game board, strategy display, and spectacle in one
 * canvas (docs/07-ux/wireframes-and-user-flow.md §1). Pure rendering: all
 * state arrives from the store; clicking a harbor only *requests* an anchor.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import {
  HARBOR_NAMES,
  ZONE_COUNT,
  type FleetMode,
  type SignalPublic,
  type TideBand,
  type TideReport,
  type WeatherId,
} from '@landfall/core';
import { ZONE_ACCENTS, harborSvg } from './art';

/**
 * Rasterize an in-repo SVG scene into a texture (no external assets).
 * Draws through a 2x canvas — the most portable path into a Pixi texture.
 */
function loadSvgTexture(svg: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 960;
      canvas.height = 640;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('no 2d context'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(Texture.from(canvas));
    };
    img.onerror = reject;
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  });
}

export interface MapState {
  phase: 'ANCHOR_OPEN' | 'LOCKED_STORM' | 'RESOLVED' | 'COOLDOWN' | null;
  totalsMinor: number[];
  boatCounts: number[];
  tideReport: TideReport | null;
  weatherId: WeatherId | null;
  myZones: { zone: number; label: string; primary: boolean }[];
  fogActive: boolean;
  storm: { feints: [number, number]; endsAt: number } | null;
  struckZone: number | null; // set during RESOLVED/COOLDOWN
  anchors: {
    name: string;
    zone: number;
    stakeMinor?: number;
    stakeBand?: TideBand;
    mode?: FleetMode;
    shareLabel?: string;
  }[];
  signals: SignalPublic[];
  myName: string | null;
  surgeRound: boolean;
}

const COLORS = {
  cell: 0x16233c,
  cellHover: 0x1d2f4d,
  line: 0x2a4064,
  bar: 0x3f74d9,
  barBg: 0x0d1728,
  text: 0xd7e2f2,
  dim: 0x7d90ad,
  amber: 0xffb02e,
  danger: 0xff5d5d,
  cloud: 0x93a7c4,
};

interface Cell {
  root: Container;
  scene: Sprite; // themed harbor artwork (SVG-rasterized, cover-fit)
  mask: Graphics; // rounded-rect crop for the artwork
  shade: Graphics; // readability overlay + struck/red tint
  bg: Graphics; // border stroke only (artwork underneath)
  bar: Graphics;
  water: Graphics; // animated wave band above the pool bar
  fleet: Container; // one bobbing ⛵ per anchored player
  total: Text;
  boats: Text;
  badge: Text;
  crew: Text; // anchored players' names + stakes
  signals: Text; // public bluff/coordination flags
  wreck: Text; // 'WRECKED' stamp on the struck harbor
  w: number;
  h: number;
  cx: number;
  cy: number;
}

// Rasterized scene texture dimensions (2x the SVG viewBox, see loadSvgTexture).
const SCENE_W = 960;
const SCENE_H = 640;

export class HarborMapScene {
  private app = new Application();
  private cells: Cell[] = [];
  private cloud = new Container();
  private lockedLabel!: Text;
  private state: MapState = {
    phase: null,
    totalsMinor: [],
    boatCounts: [],
    tideReport: null,
    weatherId: null,
    myZones: [],
    fogActive: false,
    struckZone: null,
    storm: null,
    anchors: [],
    signals: [],
    myName: null,
    surgeRound: false,
  };
  private cloudPos = { x: -100, y: -100 };
  private destroyed = false;

  async init(host: HTMLElement, onPick: (zone: number) => void): Promise<void> {
    const [, ...textures] = await Promise.all([
      this.app.init({ background: 0x0a1220, resizeTo: host, antialias: true }),
      ...Array.from({ length: ZONE_COUNT }, (_, z) => loadSvgTexture(harborSvg(z))),
    ]);
    if (this.destroyed) return; // component unmounted during async init
    host.appendChild(this.app.canvas);

    for (let z = 0; z < ZONE_COUNT; z++) {
      const root = new Container();
      const scene = new Sprite(textures[z] as Texture);
      const mask = new Graphics();
      scene.mask = mask;
      const shade = new Graphics();
      const bg = new Graphics();
      const bar = new Graphics();
      const shadow = { color: 0x000000, blur: 3, distance: 1, alpha: 0.8 };
      const name = new Text({
        text: `${z + 1} · ${HARBOR_NAMES[z]}`,
        style: { fill: 0xf2f6fd, fontSize: 14, fontWeight: '700', dropShadow: shadow },
      });
      const total = new Text({
        text: '',
        style: { fill: 0xdce6f5, fontSize: 13, fontWeight: '600', dropShadow: shadow },
      });
      const boats = new Text({
        text: '',
        style: { fill: 0xbfcde0, fontSize: 12, dropShadow: shadow },
      });
      const badge = new Text({
        text: '⚓ you',
        style: { fill: COLORS.amber, fontSize: 12, fontWeight: '700', dropShadow: shadow },
      });
      badge.visible = false;
      const crew = new Text({
        text: '',
        style: { fill: 0xc9d6e8, fontSize: 12, lineHeight: 17, dropShadow: shadow },
      });
      const signals = new Text({
        text: '',
        style: { fill: COLORS.amber, fontSize: 11, fontWeight: '700', dropShadow: shadow },
      });
      const water = new Graphics();
      const fleet = new Container();
      const wreck = new Text({
        text: 'WRECKED',
        style: { fill: COLORS.danger, fontSize: 26, fontWeight: '900', letterSpacing: 3 },
      });
      wreck.rotation = -0.18;
      wreck.visible = false;
      root.addChild(
        scene,
        mask,
        shade,
        bg,
        water,
        fleet,
        bar,
        name,
        total,
        boats,
        badge,
        crew,
        signals,
        wreck,
      );
      name.position.set(10, 8);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointerdown', () => onPick(z));
      this.app.stage.addChild(root);
      this.cells.push({
        root,
        scene,
        mask,
        shade,
        bg,
        bar,
        water,
        fleet,
        total,
        boats,
        badge,
        crew,
        signals,
        wreck,
        w: 0,
        h: 0,
        cx: 0,
        cy: 0,
      });
    }

    // storm cloud
    const puff = new Graphics();
    puff.ellipse(0, 0, 42, 20).fill({ color: COLORS.cloud, alpha: 0.9 });
    puff.ellipse(-24, 6, 26, 14).fill({ color: COLORS.cloud, alpha: 0.8 });
    puff.ellipse(24, 6, 26, 14).fill({ color: COLORS.cloud, alpha: 0.8 });
    const bolt = new Graphics();
    bolt.poly([0, 22, -8, 40, -2, 40, -10, 60, 6, 42, 0, 42, 8, 22]).fill(COLORS.amber);
    bolt.visible = false;
    bolt.label = 'bolt';
    this.cloud.addChild(puff, bolt);
    this.cloud.visible = false;
    this.app.stage.addChild(this.cloud);

    this.lockedLabel = new Text({
      text: 'ANCHORS LOCKED — the storm approaches',
      style: { fill: COLORS.dim, fontSize: 13, fontWeight: '600' },
    });
    this.lockedLabel.visible = false;
    this.app.stage.addChild(this.lockedLabel);

    this.layout();
    this.app.renderer.on('resize', () => this.layout());
    this.app.ticker.add(() => this.tick());
  }

  update(state: MapState): void {
    this.state = state;
    this.redraw();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.app.renderer) this.app.destroy(true, { children: true });
  }

  private layout(): void {
    const W = this.app.screen.width;
    const H = this.app.screen.height;
    const cols = W >= H ? 3 : 2;
    const rows = ZONE_COUNT / cols;
    const pad = 12;
    const cw = (W - pad * (cols + 1)) / cols;
    const ch = (H - pad * (rows + 1) - 24) / rows;
    this.cells.forEach((cell, z) => {
      const col = z % cols;
      const row = Math.floor(z / cols);
      const x = pad + col * (cw + pad);
      const y = pad + row * (ch + pad);
      cell.root.position.set(x, y);
      cell.w = cw;
      cell.h = ch;
      cell.cx = x + cw / 2;
      cell.cy = y + ch / 2;

      // Cover-fit the artwork and crop to the rounded cell.
      const scale = Math.max(cw / SCENE_W, ch / SCENE_H);
      cell.scene.scale.set(scale);
      cell.scene.position.set((cw - SCENE_W * scale) / 2, (ch - SCENE_H * scale) / 2);
      cell.mask.clear();
      cell.mask.roundRect(0, 0, cw, ch, 10).fill(0xffffff);
    });
    this.lockedLabel.position.set(pad, H - 22);
    this.redraw();
  }

  private redraw(): void {
    const { totalsMinor, boatCounts, myZones, phase, struckZone, surgeRound, tideReport } =
      this.state;
    const showTide = phase === 'ANCHOR_OPEN' && tideReport;
    const tideByZone = new Map(tideReport?.entries.map((e) => [e.zone, e]) ?? []);
    const max = Math.max(1, ...totalsMinor);
    const bandScore: Record<TideBand, number> = {
      seed: 0.2,
      light: 0.38,
      medium: 0.58,
      heavy: 0.78,
      packed: 1,
    };
    this.cells.forEach((cell, z) => {
      const report = tideByZone.get(z);
      const struck = struckZone === z && (phase === 'RESOLVED' || phase === 'COOLDOWN');
      const survivedGlow =
        struckZone !== null && struckZone !== z && (phase === 'RESOLVED' || phase === 'COOLDOWN');
      const surgeGlow = surgeRound && !struck && !survivedGlow;

      // Border on top of the artwork; shade keeps text readable and tints the wreck.
      cell.bg.clear();
      cell.bg.roundRect(0, 0, cell.w, cell.h, 10).stroke({
        color: struck ? COLORS.danger : survivedGlow || surgeGlow ? COLORS.amber : COLORS.line,
        width: struck || survivedGlow ? 2.5 : surgeGlow ? 2 : 1,
      });
      cell.shade.clear();
      cell.shade
        .roundRect(0, 0, cell.w, cell.h, 10)
        .fill({ color: struck ? 0x4a0a14 : 0x050c18, alpha: struck ? 0.55 : 0.28 });
      if (showTide && tideReport.frozen) {
        cell.shade.roundRect(0, 0, cell.w, cell.h, 10).fill({ color: 0x9fb1c8, alpha: 0.13 });
      }
      if (this.state.weatherId === 'HEAVY_FOG') {
        cell.shade.roundRect(0, 0, cell.w, cell.h, 10).fill({ color: 0xb7c2d6, alpha: 0.08 });
      }
      // extra gradient-ish band behind the header texts
      cell.shade.roundRect(0, 0, cell.w, 34, 10).fill({ color: 0x030810, alpha: 0.35 });
      if (surgeGlow) {
        cell.shade.roundRect(0, 0, cell.w, cell.h, 10).fill({ color: 0xffb02e, alpha: 0.05 });
      }

      const total = totalsMinor[z] ?? 0;
      cell.total.text =
        showTide && report
          ? `${report.band.toUpperCase()} · ${report.trend}`
          : `${(total / 100).toFixed(2)} cr`;
      cell.total.position.set(10, cell.h - 44);
      const shownBoatCount = showTide && report ? report.boatCount : (boatCounts[z] ?? 0);
      cell.boats.text = `${shownBoatCount} boats`;
      cell.boats.position.set(cell.w - cell.boats.width - 10, 10);
      const myMark = myZones.find((m) => m.zone === z);
      cell.badge.visible = !!myMark;
      cell.badge.text = myMark?.label ?? 'you';
      cell.badge.position.set(10, 30);

      // Anchored players in this harbor ("In the Harbor" — the strategic info surface).
      const here = this.state.anchors.filter((a) => a.zone === z);
      const maxRows = Math.max(0, Math.floor((cell.h - 118) / 17));
      const shown = here.slice(0, maxRows).map((a) => {
        const you = a.name === this.state.myName ? '⚓ ' : '';
        const stake =
          a.stakeMinor != null ? (a.stakeMinor / 100).toFixed(0) : (a.stakeBand ?? 'medium');
        const share = a.mode === 'SPLIT' && a.shareLabel ? ` ${a.shareLabel}` : '';
        return `${you}${a.name} · ${stake}${share}`;
      });
      if (here.length > shown.length) shown.push(`+${here.length - shown.length} more…`);
      cell.crew.text = shown.join('\n');
      cell.crew.position.set(10, myMark ? 50 : 32);

      const signalCounts = this.state.signals
        .filter((s) => s.zone === z)
        .reduce(
          (acc, s) => {
            acc[s.kind] += 1;
            return acc;
          },
          { RALLY: 0, FLEE: 0, HOLD: 0 },
        );
      const signalText = [
        signalCounts.RALLY ? `Rally ${signalCounts.RALLY}` : '',
        signalCounts.FLEE ? `Flee ${signalCounts.FLEE}` : '',
        signalCounts.HOLD ? `Hold ${signalCounts.HOLD}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      cell.signals.text = signalText;
      cell.signals.position.set(10, cell.h - 62);

      // Fleet: one bobbing boat per anchored player (capped), mine highlighted.
      const boatsWanted = Math.min(here.length, 8);
      while (cell.fleet.children.length < boatsWanted) {
        cell.fleet.addChild(new Text({ text: '⛵', style: { fontSize: 18 } }));
      }
      while (cell.fleet.children.length > boatsWanted) {
        cell.fleet.removeChildAt(cell.fleet.children.length - 1);
      }
      const mineHere = !!myMark;
      cell.fleet.children.forEach((b, i) => {
        const t = b as Text;
        t.style.fill = mineHere && i === 0 ? COLORS.amber : COLORS.text;
        t.alpha = struck ? 0.35 : 1;
      });

      // Wreck stamp on the struck harbor.
      cell.wreck.visible = struck;
      if (struck) {
        cell.wreck.position.set(
          cell.w / 2 - cell.wreck.width / 2,
          cell.h / 2 - cell.wreck.height / 2,
        );
      }

      const frac = showTide && report ? bandScore[report.band] : total / max;
      cell.bar.clear();
      cell.bar
        .roundRect(10, cell.h - 24, cell.w - 20, 12, 6)
        .fill({ color: COLORS.barBg, alpha: 0.85 });
      cell.bar
        .roundRect(10, cell.h - 24, Math.max(6, (cell.w - 20) * frac), 12, 6)
        .fill(struck ? COLORS.danger : ZONE_ACCENTS[z]!);
    });
    this.lockedLabel.visible = phase === 'LOCKED_STORM';
    this.cloud.visible = phase === 'LOCKED_STORM' || phase === 'RESOLVED';
    const bolt = this.cloud.getChildByLabel('bolt');
    if (bolt) bolt.visible = phase === 'RESOLVED';
  }

  /** Per-frame ambience (waves, bobbing fleet) + storm-cloud motion. */
  private tick(): void {
    const { phase, storm, struckZone } = this.state;
    const now = Date.now();

    // Water band + bobbing boats, per cell.
    this.cells.forEach((cell, z) => {
      const waterTop = cell.h - 72;
      const waterH = 40;
      const struck = struckZone === z && (phase === 'RESOLVED' || phase === 'COOLDOWN');
      cell.water.clear();
      cell.water
        .roundRect(6, waterTop, cell.w - 12, waterH, 8)
        .fill({ color: struck ? 0x2a1020 : 0x0c1a30, alpha: 0.35 });
      for (let line = 0; line < 2; line++) {
        const yBase = waterTop + 12 + line * 14;
        const amp = struck ? 1 : this.state.weatherId === 'HIGH_SWELL' ? 4.1 : 2.2;
        cell.water.moveTo(10, yBase);
        for (let x = 10; x <= cell.w - 10; x += 8) {
          cell.water.lineTo(x, yBase + Math.sin(now / 700 + x / 22 + z * 2 + line * 1.7) * amp);
        }
        cell.water.stroke({ color: 0x2a4a7a, width: 1, alpha: 0.8 });
      }
      cell.fleet.children.forEach((b, i) => {
        const slot = i - (cell.fleet.children.length - 1) / 2;
        b.position.set(
          cell.w / 2 + slot * 24 - 9,
          waterTop + 8 + Math.sin(now / 450 + i * 1.3 + z) * 2.5,
        );
        b.rotation = Math.sin(now / 600 + i) * 0.06;
      });
    });

    if (!this.cloud.visible) return;
    let target: { x: number; y: number } | null = null;
    if (phase === 'LOCKED_STORM' && storm) {
      const now = Date.now();
      const total = storm.endsAt - now;
      const which = total > 0 && now % 3000 < 1500 ? storm.feints[0] : storm.feints[1];
      const cell = this.cells[which];
      if (cell) target = { x: cell.cx, y: cell.cy - cell.h / 2 };
    } else if ((phase === 'RESOLVED' || phase === 'COOLDOWN') && struckZone !== null) {
      const cell = this.cells[struckZone];
      if (cell) target = { x: cell.cx, y: cell.cy - cell.h / 4 };
    }
    if (!target) return;
    if (this.cloudPos.x < -50) {
      this.cloudPos = { x: this.app.screen.width / 2, y: -40 };
    }
    const speed = phase === 'RESOLVED' ? 0.25 : this.state.weatherId === 'HIGH_SWELL' ? 0.09 : 0.06;
    this.cloudPos.x += (target.x - this.cloudPos.x) * speed;
    this.cloudPos.y += (target.y - this.cloudPos.y) * speed;
    this.cloud.position.set(this.cloudPos.x, this.cloudPos.y);
  }
}
