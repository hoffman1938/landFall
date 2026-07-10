/**
 * LANDFALL audio — 8-bit / lo-fi edition. Fully procedural (Web Audio API),
 * zero external assets, so there is nothing to license
 * (docs/08-audio/audio-design.md).
 *
 * The lo-fi character comes from the master chain: everything is played with
 * chip waveforms (square/triangle/noise), then bit-crushed (waveshaper
 * quantization), rolled off with a warm lowpass, and bedded on a quiet vinyl
 * crackle loop. The soundtrack is a swung ~84 BPM chiptune loop in D minor
 * (Dm–Bb–F–C) with a sparse pentatonic square lead over a triangle bass.
 *
 * Psychology rules carry over from v1 unchanged:
 *  - bright "coin" timbres are reserved EXCLUSIVELY for wins;
 *  - losses get one short, low, quiet blip — never harsh, never celebratory;
 *  - tension = rising wind; release = one thunder hit (scaled by Storm Power);
 *  - the ambient loop stays calm so the cues read by contrast.
 *
 * Autoplay policy: context unlocks on the first user gesture; all methods are
 * safe no-ops before that.
 */

interface AudioPrefs {
  muted: boolean;
  volume: number; // 0..1
}

const PREFS_KEY = 'landfall.audio';

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { muted: false, volume: 0.5, ...JSON.parse(raw) };
  } catch {
    /* defaults */
  }
  return { muted: false, volume: 0.5 };
}

export type ClickKind = 'up' | 'down' | 'tap' | 'nav' | 'send';

// ---------- music data (D minor, 4 bars × 16 swung steps) ----------

const N = null;
// D pentatonic minor frequencies
const D4 = 293.66, F4 = 349.23, G4 = 392.0, A4 = 440.0, C5 = 523.25, D5 = 587.33;
const LEAD: (number | null)[] = [
  // bar 1 (Dm)
  D4, N, N, G4, N, A4, N, N, C5, N, A4, N, G4, N, F4, N,
  // bar 2 (Bb)
  F4, N, N, D4, N, F4, N, N, G4, N, N, N, N, N, D4, N,
  // bar 3 (F)
  A4, N, N, C5, N, D5, N, N, C5, N, A4, N, G4, N, N, N,
  // bar 4 (C)
  C5, N, N, G4, N, A4, N, N, G4, N, F4, N, D4, N, N, N,
];
const BASS_ROOTS = [73.42, 58.27, 87.31, 65.41]; // D2 Bb1 F2 C2, one per bar
const STEPS_PER_BAR = 16;
const TOTAL_STEPS = LEAD.length;
const STEP_SEC = 60 / 84 / 4; // 84 BPM sixteenths
const SWING = 0.16; // odd sixteenths delayed → lazy lo-fi shuffle

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null; // pre-crush bus — everything connects here
  private musicBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private windStop: (() => void) | null = null;
  private echo: DelayNode | null = null;
  private schedTimer: number | null = null;
  private step = 0;
  private nextStepTime = 0;
  prefs: AudioPrefs = loadPrefs();

  constructor() {
    const unlock = () => {
      this.ensure();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  // ---------- setup: lo-fi master chain ----------

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();

        // master (volume) -> bitcrusher -> warm lowpass -> gentle highpass -> out
        this.master = this.ctx.createGain();
        const crusher = this.ctx.createWaveShaper();
        crusher.curve = this.crushCurve(48); // audible 8-bit grit without fizz
        const warm = this.ctx.createBiquadFilter();
        warm.type = 'lowpass';
        warm.frequency.value = 3800; // "old speaker" roll-off
        warm.Q.value = 0.5;
        const rumbleCut = this.ctx.createBiquadFilter();
        rumbleCut.type = 'highpass';
        rumbleCut.frequency.value = 45;
        this.master.connect(crusher).connect(warm).connect(rumbleCut).connect(this.ctx.destination);

        // tape-style echo bus for the lead (feedback delay into master)
        this.echo = this.ctx.createDelay(1.0);
        this.echo.delayTime.value = STEP_SEC * 3; // dotted-eighth feel
        const fb = this.ctx.createGain();
        fb.gain.value = 0.3;
        const echoLp = this.ctx.createBiquadFilter();
        echoLp.type = 'lowpass';
        echoLp.frequency.value = 1800;
        this.echo.connect(echoLp).connect(fb).connect(this.echo);
        const echoOut = this.ctx.createGain();
        echoOut.gain.value = 0.5;
        echoLp.connect(echoOut).connect(this.master);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 1;
        this.musicBus.connect(this.master);

        this.applyPrefs();
        this.startVinyl();
        this.startSequencer();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private crushCurve(levels: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(new ArrayBuffer(2048 * 4));
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.round(x * levels) / levels;
    }
    return curve;
  }

  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  setPrefs(p: Partial<AudioPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    this.applyPrefs();
  }

  private applyPrefs(): void {
    if (this.master && this.ctx) {
      const v = this.prefs.muted ? 0 : this.prefs.volume;
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    }
  }

  // ---------- chip voices ----------

  /** One chip note: square/triangle with a fast decay envelope (+optional pitch slide). */
  private chip(
    type: OscillatorType,
    freq: number,
    at: number,
    dur: number,
    gain: number,
    opts: { slideTo?: number; bus?: AudioNode; detune?: number } = {},
  ): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, at + dur);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(opts.bus ?? this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** Short noise hit through a filter (hats, snare, splashes, explosions). */
  private noiseHit(
    at: number,
    dur: number,
    gain: number,
    filter: { type: BiquadFilterType; freq: number; slideTo?: number },
    bus?: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.setValueAtTime(filter.freq, at);
    if (filter.slideTo) f.frequency.exponentialRampToValueAtTime(filter.slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(bus ?? this.master!);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  // ---------- game cues (8-bit vocabulary) ----------

  /** Round opens: chip foghorn — two low square blasts sliding down. */
  foghorn(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.chip('square', 90, t, 0.5, 0.16, { slideTo: 62 });
    this.chip('square', 82, t + 0.55, 0.7, 0.16, { slideTo: 55 });
  }

  /** Surge round: foghorn + classic power-up arpeggio (the pot is live!). */
  surgeCall(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.foghorn();
    const t = ctx.currentTime + 0.2;
    [D5, 698.46, 880, 1174.66, 1396.91].forEach((f, i) =>
      this.chip('square', f, t + i * 0.07, 0.14, 0.09),
    );
  }

  /** Storm approach: noise wind that RISES IN STEPS (retro), for the whole phase. */
  wind(durationMs: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopWind();
    const t = ctx.currentTime;
    const dur = durationMs / 1000;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    const steps = 6; // stepped sweep = 8-bit wind
    for (let i = 0; i <= steps; i++) {
      bp.frequency.setValueAtTime(300 + (i * 1300) / steps, t + (dur * i) / steps);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.14, t + dur * 0.8);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(t);
    this.windStop = () => {
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
      src.stop(ctx.currentTime + 0.3);
      this.windStop = null;
    };
  }

  private stopWind(): void {
    this.windStop?.();
  }

  /** Landfall: 8-bit explosion — noise sweep + descending square. Scales with Storm Power. */
  thunder(powerMult = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopWind();
    const t = ctx.currentTime;
    const big = Math.min(3, 1 + Math.log10(Math.max(1, powerMult))); // 1..3
    this.noiseHit(t, 0.7 * big, 0.4, { type: 'lowpass', freq: 2400, slideTo: 90 });
    this.chip('square', 160, t, 0.5 * big, 0.22, { slideTo: 40 });
    this.chip('triangle', 55, t, 0.6 * big, 0.3, { slideTo: 30 });
    if (powerMult >= 25) {
      // monster storm: second, deeper detonation
      this.noiseHit(t + 0.28, 1.1, 0.42, { type: 'lowpass', freq: 1400, slideTo: 60 });
      this.chip('square', 100, t + 0.28, 0.9, 0.2, { slideTo: 28 });
    }
  }

  /** Storm Power reveal (Cat 3+): rising chip arpeggio sized by the multiplier. */
  powerReveal(mult: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = mult >= 100 ? 8 : mult >= 25 ? 6 : mult >= 5 ? 4 : 3;
    for (let i = 0; i < notes; i++) {
      this.chip('square', 440 * Math.pow(2, i / 4), t + i * 0.06, 0.12, 0.09);
    }
  }

  /** Your salvage: THE COIN — bright two-note square chirp; wins only. */
  salvageBell(big = false): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.coin(t, 988, 1319); // B5 -> E6, the canonical 8-bit coin
    if (big) {
      this.coin(t + 0.12, 1175, 1568);
      this.coin(t + 0.24, 1319, 1760);
    }
  }

  private coin(at: number, f1: number, f2: number): void {
    this.chip('square', f1, at, 0.07, 0.1);
    this.chip('square', f2, at + 0.07, 0.24, 0.1);
  }

  /** Golden Anchor: full 8-bit victory fanfare; coin rain if it's yours. */
  fanfare(mine: boolean): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = [D5, 698.46, 880, 1174.66];
    run.forEach((f, i) => this.chip('square', f, t + i * 0.11, 0.2, mine ? 0.12 : 0.08));
    // closing chord
    [587.33, 880, 1174.66].forEach((f) =>
      this.chip('square', f, t + 0.5, mine ? 1.2 : 0.6, mine ? 0.09 : 0.05),
    );
    if (mine) {
      for (let i = 0; i < 6; i++) {
        this.coin(t + 0.7 + i * 0.09, 988 + i * 60, 1319 + i * 80);
      }
    }
  }

  /** Your harbor wrecked: soft descending square "bump". Short; never celebratory. */
  wreckThud(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.chip('square', 220, t, 0.09, 0.09, { slideTo: 110 });
    this.chip('triangle', 110, t + 0.08, 0.18, 0.12, { slideTo: 55 });
  }

  /** Anchor lands: chip "plop" — tiny noise + downward blip. */
  splash(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(t, 0.08, 0.07, { type: 'highpass', freq: 2500 });
    this.chip('square', 520, t + 0.01, 0.09, 0.07, { slideTo: 240 });
  }

  /** Final-seconds countdown: NES metronome blip. */
  tick(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.chip('square', 1046, ctx.currentTime, 0.04, 0.05);
  }

  /** UI clicks — every press answers in theme. */
  click(kind: ClickKind = 'tap'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (kind) {
      case 'up':
        this.chip('square', 660, t, 0.05, 0.06, { slideTo: 880 });
        break;
      case 'down':
        this.chip('square', 660, t, 0.05, 0.06, { slideTo: 494 });
        break;
      case 'send':
        this.chip('square', 784, t, 0.04, 0.06);
        this.chip('square', 1046, t + 0.05, 0.07, 0.06);
        break;
      case 'nav':
        this.chip('triangle', 392, t, 0.06, 0.08);
        break;
      default:
        this.chip('square', 587, t, 0.045, 0.06);
    }
  }

  // ---------- soundtrack: swung lo-fi chiptune loop ----------

  private startVinyl(): void {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < 70; i++) {
      const pos = Math.floor(Math.random() * d.length);
      const amp = Math.random() ** 2 * 0.5;
      for (let j = 0; j < 20 && pos + j < d.length; j++) {
        d[pos + j] = (Math.random() * 2 - 1) * amp * (1 - j / 20);
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.value = 0.05;
    src.connect(lp).connect(g).connect(this.master!);
    src.start();
  }

  /** Lookahead scheduler — sample-accurate chiptune with swing. */
  private startSequencer(): void {
    const ctx = this.ctx!;
    this.nextStepTime = ctx.currentTime + 0.1;
    this.schedTimer = window.setInterval(() => {
      while (this.nextStepTime < ctx.currentTime + 0.3) {
        if (!this.prefs.muted) this.scheduleStep(this.step, this.nextStepTime);
        const isOdd = this.step % 2 === 1;
        this.nextStepTime += STEP_SEC * (isOdd ? 1 - SWING : 1 + SWING);
        this.step = (this.step + 1) % TOTAL_STEPS;
      }
    }, 120);
  }

  private scheduleStep(step: number, t: number): void {
    const bus = this.musicBus!;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const inBar = step % STEPS_PER_BAR;

    // drums: kick on 1, snare on 3, swung hats on offbeats
    if (inBar === 0 || inBar === 10) {
      this.chip('sine' as OscillatorType, 120, t, 0.13, 0.24, { slideTo: 45, bus });
    }
    if (inBar === 8) {
      this.noiseHit(t, 0.11, 0.07, { type: 'bandpass', freq: 1800 }, bus);
    }
    if (inBar % 4 === 2) {
      this.noiseHit(t, 0.03, 0.03, { type: 'highpass', freq: 6000 }, bus);
    }

    // bass: triangle root pulses (1, 2-and, 3)
    if (inBar === 0 || inBar === 6 || inBar === 8) {
      const root = BASS_ROOTS[bar]!;
      this.chip('triangle', root, t, 0.3, 0.16, { bus });
    }

    // lead: sparse square melody with tape echo + human detune
    const note = LEAD[step];
    if (note !== null && note !== undefined) {
      const detune = (Math.random() - 0.5) * 8; // lo-fi wobble, ±4 cents
      this.chip('square', note, t, 0.22, 0.045, { bus, detune });
      if (this.echo) this.chip('square', note, t, 0.18, 0.028, { bus: this.echo, detune });
    }
  }
}

export const audio = new AudioEngine();
