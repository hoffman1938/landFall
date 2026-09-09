/**
 * LANDFALL audio — warm coastal edition. Fully procedural (Web Audio API),
 * with no external assets or runtime dependencies.
 *
 * The mix uses rounded sine/triangle voices, a restrained room send, and
 * filtered-noise water and wind. Music stays deliberately quiet and yields
 * to the storm phase so gameplay information always reads first.
 *
 * Psychology rules:
 *  - glassy, high-register bell partials are reserved for player wins;
 *  - non-win information uses soft wood, water, and low brass-like timbres;
 *  - a loss is one short, low, quiet release — never harsh or punitive;
 *  - tension grows through smooth wind and mix density, not alarm sounds;
 *  - landfall is weighty but brief, with level and low-frequency limits.
 *
 * Autoplay policy: the context unlocks on the first user gesture. Every public
 * method remains a safe no-op until Web Audio is available.
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

// ---------- music data (D minor, four gently swung bars) ----------

const N = null;
const D4 = 293.66;
const F4 = 349.23;
const G4 = 392;
const A4 = 440;
const C5 = 523.25;
const D5 = 587.33;
const LEAD: (number | null)[] = [
  D4,
  N,
  N,
  G4,
  N,
  A4,
  N,
  N,
  C5,
  N,
  A4,
  N,
  G4,
  N,
  F4,
  N,
  F4,
  N,
  N,
  D4,
  N,
  F4,
  N,
  N,
  G4,
  N,
  N,
  N,
  N,
  N,
  D4,
  N,
  A4,
  N,
  N,
  C5,
  N,
  D5,
  N,
  N,
  C5,
  N,
  A4,
  N,
  G4,
  N,
  N,
  N,
  C5,
  N,
  N,
  G4,
  N,
  A4,
  N,
  N,
  G4,
  N,
  F4,
  N,
  D4,
  N,
  N,
  N,
];
const BASS_ROOTS = [73.42, 58.27, 87.31, 65.41]; // D2, Bb1, F2, C2
const PAD_CHORDS = [
  [146.83, 174.61, 220],
  [116.54, 146.83, 174.61],
  [174.61, 220, 261.63],
  [130.81, 164.81, 196],
];
const STEPS_PER_BAR = 16;
const TOTAL_STEPS = LEAD.length;
const STEP_SEC = 60 / 78 / 4;
const SWING = 0.08;
const IDLE_MUSIC_GAIN = 0.62;

interface ToneOptions {
  slideTo?: number;
  bus?: AudioNode;
  detune?: number;
  attack?: number;
  room?: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private roomBus: GainNode | null = null;
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

  // ---------- setup: clean, warm master chain ----------

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();

        this.master = this.ctx.createGain();
        const warm = this.ctx.createBiquadFilter();
        warm.type = 'lowpass';
        warm.frequency.value = 10500;
        warm.Q.value = 0.35;
        const rumbleCut = this.ctx.createBiquadFilter();
        rumbleCut.type = 'highpass';
        rumbleCut.frequency.value = 35;
        const limiter = this.ctx.createDynamicsCompressor();
        limiter.threshold.value = -20;
        limiter.knee.value = 14;
        limiter.ratio.value = 3;
        limiter.attack.value = 0.02;
        limiter.release.value = 0.24;
        this.master.connect(warm).connect(rumbleCut).connect(limiter).connect(this.ctx.destination);

        // A short generated room softens procedural voices without external IR files.
        this.roomBus = this.ctx.createGain();
        this.roomBus.gain.value = 1;
        const room = this.ctx.createConvolver();
        room.buffer = this.roomImpulse(1.35, 2.7);
        const roomFilter = this.ctx.createBiquadFilter();
        roomFilter.type = 'lowpass';
        roomFilter.frequency.value = 4200;
        const roomOut = this.ctx.createGain();
        roomOut.gain.value = 0.18;
        this.roomBus.connect(room).connect(roomFilter).connect(roomOut).connect(this.master);

        // A quiet, dark echo gives melody depth without rhythmic arcade chatter.
        this.echo = this.ctx.createDelay(1);
        this.echo.delayTime.value = STEP_SEC * 3;
        const feedback = this.ctx.createGain();
        feedback.gain.value = 0.2;
        const echoFilter = this.ctx.createBiquadFilter();
        echoFilter.type = 'lowpass';
        echoFilter.frequency.value = 2400;
        this.echo.connect(echoFilter).connect(feedback).connect(this.echo);
        const echoOut = this.ctx.createGain();
        echoOut.gain.value = 0.26;
        echoFilter.connect(echoOut).connect(this.master);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = IDLE_MUSIC_GAIN;
        this.musicBus.connect(this.master);

        this.applyPrefs();
        this.startWaterAmbience();
        this.startSequencer();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private roomImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const length = Math.floor(ctx.sampleRate * seconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  private noise(): AudioBuffer {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  setPrefs(p: Partial<AudioPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(this.prefs));
    } catch {
      /* audio still works when storage is unavailable */
    }
    this.applyPrefs();
  }

  private applyPrefs(): void {
    if (this.master && this.ctx) {
      const volume = this.prefs.muted ? 0 : Math.max(0, Math.min(1, this.prefs.volume));
      this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.05);
    }
  }

  // ---------- procedural voices ----------

  /** Rounded sine/triangle note with click-free attack and release. */
  private tone(
    type: 'sine' | 'triangle',
    freq: number,
    at: number,
    dur: number,
    gain: number,
    opts: ToneOptions = {},
  ): void {
    const ctx = this.ctx!;
    const oscillator = ctx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, freq), at);
    if (opts.slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), at + dur);
    }
    if (opts.detune) oscillator.detune.value = opts.detune;

    const envelope = ctx.createGain();
    const attack = Math.min(opts.attack ?? 0.012, dur * 0.35);
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(gain, at + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    const destination = opts.bus ?? this.master!;
    oscillator.connect(envelope).connect(destination);
    if (this.roomBus && (opts.room ?? 0.12) > 0) {
      const send = ctx.createGain();
      send.gain.value = opts.room ?? 0.12;
      envelope.connect(send).connect(this.roomBus);
    }
    oscillator.start(at);
    oscillator.stop(at + dur + 0.03);
  }

  /** Filtered noise for water, wind, air, and impact transients. */
  private noiseHit(
    at: number,
    dur: number,
    gain: number,
    filter: { type: BiquadFilterType; freq: number; slideTo?: number; q?: number },
    bus?: AudioNode,
    room = 0.08,
  ): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise();
    const toneFilter = ctx.createBiquadFilter();
    toneFilter.type = filter.type;
    toneFilter.Q.value = filter.q ?? 0.7;
    toneFilter.frequency.setValueAtTime(filter.freq, at);
    if (filter.slideTo) {
      toneFilter.frequency.exponentialRampToValueAtTime(filter.slideTo, at + dur);
    }
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(gain, at + Math.min(0.025, dur * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    source
      .connect(toneFilter)
      .connect(envelope)
      .connect(bus ?? this.master!);
    if (this.roomBus && room > 0) {
      const send = ctx.createGain();
      send.gain.value = room;
      envelope.connect(send).connect(this.roomBus);
    }
    source.start(at);
    source.stop(at + dur + 0.03);
  }

  /** Win-only bell: a soft fundamental plus glassy inharmonic partials. */
  private winBell(at: number, frequency: number, gain = 0.09): void {
    this.tone('sine', frequency, at, 0.52, gain, { attack: 0.004, room: 0.34 });
    this.tone('sine', frequency * 2.01, at, 0.32, gain * 0.36, { attack: 0.002, room: 0.42 });
    this.tone('sine', frequency * 3.97, at, 0.18, gain * 0.12, { attack: 0.002, room: 0.48 });
  }

  private setMusicLevel(level: number, seconds = 0.35): void {
    if (!this.musicBus || !this.ctx) return;
    this.musicBus.gain.setTargetAtTime(level, this.ctx.currentTime, seconds);
  }

  // ---------- game cues ----------

  /** Round opens: two warm, distant horn calls. */
  foghorn(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone('sine', 92, t, 0.75, 0.16, { slideTo: 68, attack: 0.08, room: 0.5 });
    this.tone('triangle', 138, t, 0.62, 0.045, { slideTo: 102, attack: 0.08, room: 0.55 });
    this.tone('sine', 82, t + 0.62, 0.9, 0.15, { slideTo: 58, attack: 0.09, room: 0.56 });
    this.tone('triangle', 123, t + 0.62, 0.72, 0.04, { slideTo: 87, attack: 0.09, room: 0.6 });
  }

  /** Surge round: horn plus a confident mid-register rise, distinct from win bells. */
  surgeCall(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.foghorn();
    const t = ctx.currentTime + 0.24;
    [220, 261.63, 293.66, 349.23].forEach((frequency, i) => {
      this.tone('triangle', frequency, t + i * 0.1, 0.3, 0.055, { attack: 0.025, room: 0.28 });
      this.tone('sine', frequency / 2, t + i * 0.1, 0.34, 0.035, { attack: 0.025, room: 0.2 });
    });
  }

  /** Storm approach: smooth filtered wind layers that grow with the phase. */
  wind(durationMs: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopWind();
    const t = ctx.currentTime;
    const duration = Math.max(0.25, durationMs / 1000);
    this.setMusicLevel(0.26, 0.45);

    const lowSource = ctx.createBufferSource();
    lowSource.buffer = this.noise();
    lowSource.loop = true;
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'bandpass';
    lowFilter.Q.value = 0.65;
    lowFilter.frequency.setValueAtTime(280, t);
    lowFilter.frequency.exponentialRampToValueAtTime(1050, t + duration * 0.88);
    const lowGain = ctx.createGain();
    lowGain.gain.setValueAtTime(0.0001, t);
    lowGain.gain.linearRampToValueAtTime(0.085, t + duration * 0.76);

    const airSource = ctx.createBufferSource();
    airSource.buffer = this.noise();
    airSource.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'highpass';
    airFilter.frequency.setValueAtTime(2400, t);
    airFilter.frequency.exponentialRampToValueAtTime(1250, t + duration * 0.9);
    const airGain = ctx.createGain();
    airGain.gain.setValueAtTime(0.0001, t);
    airGain.gain.linearRampToValueAtTime(0.024, t + duration * 0.82);

    lowSource.connect(lowFilter).connect(lowGain).connect(this.master!);
    airSource.connect(airFilter).connect(airGain).connect(this.master!);
    lowSource.start(t);
    airSource.start(t);

    let stopped = false;
    this.windStop = () => {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      lowGain.gain.cancelScheduledValues(now);
      airGain.gain.cancelScheduledValues(now);
      lowGain.gain.setTargetAtTime(0.0001, now, 0.08);
      airGain.gain.setTargetAtTime(0.0001, now, 0.06);
      lowSource.stop(now + 0.45);
      airSource.stop(now + 0.45);
      this.setMusicLevel(IDLE_MUSIC_GAIN, 0.5);
      this.windStop = null;
    };
  }

  private stopWind(): void {
    this.windStop?.();
  }

  /** Landfall: short cinematic weight, scaled carefully by Storm Power. */
  thunder(powerMult = 1): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.stopWind();
    const t = ctx.currentTime;
    const scale = Math.min(1.65, 1 + Math.log10(Math.max(1, powerMult)) * 0.24);
    this.setMusicLevel(0.16, 0.03);
    this.noiseHit(
      t,
      0.78 * scale,
      0.27,
      { type: 'lowpass', freq: 2100, slideTo: 85, q: 0.5 },
      undefined,
      0.22,
    );
    this.tone('sine', 92, t, 0.62 * scale, 0.24, { slideTo: 36, attack: 0.008, room: 0.28 });
    this.tone('triangle', 148, t + 0.015, 0.48 * scale, 0.1, {
      slideTo: 48,
      attack: 0.006,
      room: 0.25,
    });
    if (powerMult >= 25) {
      this.noiseHit(
        t + 0.3,
        0.92,
        0.2,
        { type: 'lowpass', freq: 1150, slideTo: 60 },
        undefined,
        0.26,
      );
      this.tone('sine', 66, t + 0.3, 0.76, 0.18, { slideTo: 30, room: 0.32 });
    }
    if (this.musicBus) {
      this.musicBus.gain.setTargetAtTime(IDLE_MUSIC_GAIN, t + 0.72 * scale, 0.7);
    }
  }

  /** Storm Power reveal: grounded, non-celebratory pulses sized by multiplier. */
  powerReveal(mult: number): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const notes = mult >= 100 ? 6 : mult >= 25 ? 5 : mult >= 5 ? 4 : 3;
    for (let i = 0; i < notes; i++) {
      const frequency = 164.81 * Math.pow(2, i / 7);
      this.tone('triangle', frequency, t + i * 0.085, 0.3, 0.065, { attack: 0.02, room: 0.25 });
      this.tone('sine', frequency / 2, t + i * 0.085, 0.34, 0.035, { attack: 0.02, room: 0.2 });
    }
  }

  /** Your salvage: high glass-and-brass bell language, reserved for wins. */
  salvageBell(big = false): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.winBell(t, 659.25, 0.095);
    this.winBell(t + 0.14, 987.77, 0.085);
    if (big) {
      this.winBell(t + 0.31, 1174.66, 0.09);
      this.winBell(t + 0.48, 1318.51, 0.08);
    }
  }

  /** Golden Anchor: restrained announcement for others, luminous cadence if yours. */
  fanfare(mine: boolean): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    const run = [293.66, 349.23, 440, 587.33];
    run.forEach((frequency, i) => {
      this.tone('triangle', frequency, t + i * 0.13, 0.34, mine ? 0.08 : 0.048, {
        attack: 0.025,
        room: 0.3,
      });
    });
    [293.66, 440, 587.33].forEach((frequency) => {
      this.tone('sine', frequency, t + 0.56, mine ? 1.18 : 0.66, mine ? 0.065 : 0.036, {
        attack: 0.04,
        room: 0.42,
      });
    });
    if (mine) {
      [783.99, 987.77, 1174.66].forEach((frequency, i) => {
        this.winBell(t + 0.65 + i * 0.16, frequency, 0.075);
      });
    }
  }

  /** Your harbor wrecked: a soft low release, never a punishment sting. */
  wreckThud(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone('triangle', 132, t, 0.2, 0.075, { slideTo: 82, attack: 0.018, room: 0.08 });
    this.tone('sine', 74, t + 0.045, 0.3, 0.09, { slideTo: 48, attack: 0.02, room: 0.12 });
  }

  /** Anchor lands: a rounded water drop with a short filtered splash. */
  splash(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.noiseHit(
      t,
      0.15,
      0.045,
      { type: 'bandpass', freq: 1750, slideTo: 720, q: 0.8 },
      undefined,
      0.18,
    );
    this.tone('sine', 420, t + 0.015, 0.16, 0.065, { slideTo: 190, attack: 0.006, room: 0.24 });
  }

  /** Final-seconds countdown: a clear but non-alarming wooden pulse. */
  tick(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone('triangle', 740, t, 0.075, 0.045, { slideTo: 620, attack: 0.003, room: 0.08 });
    this.tone('sine', 370, t, 0.09, 0.025, { attack: 0.003, room: 0.06 });
  }

  /** UI presses answer with small, tactile, non-reward timbres. */
  click(kind: ClickKind = 'tap'): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (kind) {
      case 'up':
        this.tone('sine', 440, t, 0.09, 0.04, { slideTo: 554.37, attack: 0.004, room: 0.06 });
        break;
      case 'down':
        this.tone('sine', 440, t, 0.09, 0.04, { slideTo: 349.23, attack: 0.004, room: 0.06 });
        break;
      case 'send':
        this.tone('triangle', 392, t, 0.08, 0.042, { attack: 0.004, room: 0.08 });
        this.tone('sine', 523.25, t + 0.045, 0.11, 0.038, { attack: 0.004, room: 0.12 });
        break;
      case 'nav':
        this.tone('triangle', 330, t, 0.1, 0.05, { attack: 0.005, room: 0.08 });
        break;
      default:
        this.tone('sine', 392, t, 0.075, 0.042, { slideTo: 370, attack: 0.004, room: 0.05 });
    }
  }

  // ---------- adaptive ambience and music ----------

  private startWaterAmbience(): void {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = this.noise();
    source.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 620;
    lowpass.Q.value = 0.4;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 310;
    band.Q.value = 0.55;
    const gain = ctx.createGain();
    gain.gain.value = 0.018;

    const tideLfo = ctx.createOscillator();
    tideLfo.type = 'sine';
    tideLfo.frequency.value = 0.09;
    const tideDepth = ctx.createGain();
    tideDepth.gain.value = 105;
    tideLfo.connect(tideDepth).connect(band.frequency);

    const breathLfo = ctx.createOscillator();
    breathLfo.type = 'sine';
    breathLfo.frequency.value = 0.055;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.004;
    breathLfo.connect(breathDepth).connect(gain.gain);

    source.connect(lowpass).connect(band).connect(gain).connect(this.master!);
    source.start();
    tideLfo.start();
    breathLfo.start();
  }

  /** Lookahead scheduler for the quiet coastal score. */
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

    // Slow sine pad establishes warmth without competing with the map.
    if (inBar === 0) {
      for (const frequency of PAD_CHORDS[bar]!) {
        this.tone('sine', frequency, t, STEP_SEC * 14, 0.026, {
          bus,
          attack: 0.32,
          detune: (Math.random() - 0.5) * 5,
          room: 0.22,
        });
      }
    }

    // A rounded pulse and brushed-noise accents replace arcade drums.
    if (inBar === 0 || inBar === 10) {
      this.tone('sine', 88, t, 0.2, 0.12, { slideTo: 46, bus, attack: 0.008, room: 0.05 });
    }
    if (inBar === 8) {
      this.noiseHit(t, 0.14, 0.035, { type: 'bandpass', freq: 1250, q: 0.65 }, bus, 0.12);
    }
    if (inBar % 4 === 2) {
      this.noiseHit(t, 0.055, 0.012, { type: 'highpass', freq: 4800 }, bus, 0.04);
    }

    if (inBar === 0 || inBar === 6 || inBar === 8) {
      const root = BASS_ROOTS[bar]!;
      this.tone('triangle', root, t, 0.42, 0.085, { bus, attack: 0.028, room: 0.08 });
      this.tone('sine', root * 2, t, 0.34, 0.03, { bus, attack: 0.028, room: 0.08 });
    }

    // Sparse triangle melody with a quiet sine body and dark echo.
    const note = LEAD[step];
    if (note !== null && note !== undefined) {
      const detune = (Math.random() - 0.5) * 5;
      this.tone('triangle', note, t, 0.3, 0.026, { bus, detune, attack: 0.022, room: 0.2 });
      this.tone('sine', note / 2, t, 0.34, 0.018, { bus, detune, attack: 0.025, room: 0.18 });
      if (this.echo) {
        this.tone('sine', note, t, 0.22, 0.014, { bus: this.echo, detune, attack: 0.02, room: 0 });
      }
    }
  }
}

export const audio = new AudioEngine();
