/**
 * Procedural sound effects via the Web Audio API — no audio files.
 * Card sounds are shaped noise (paper friction) plus a soft low "thock";
 * musical cues are small additive bells on a major pentatonic scale.
 */

export type SoundName =
  | 'pick' | 'place' | 'flip' | 'deal' | 'shuffle' | 'nope'
  | 'undo' | 'recycle' | 'hint' | 'chime' | 'win' | 'click';

interface PlayOptions {
  delay?: number; // seconds
  pan?: number; // -1 … 1
  rank?: number; // for 'chime'
}

interface NoiseOpts {
  dur: number;
  filter: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  attack?: number;
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  dur: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
}

// Minimum spacing per sound so a whole stack landing reads as one placement, not a machine-gun.
const THROTTLE_MS: Partial<Record<SoundName, number>> = {
  pick: 40, place: 45, flip: 28, nope: 120, click: 30, hint: 120,
};

const PENTATONIC = [0, 2, 4, 7, 9];
const C5 = 523.25;

const jitter = (v: number, amount = 0.08) => v * (1 + (Math.random() * 2 - 1) * amount);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SoundName, number>();
  private enabled = true;
  private volume = 0.7;

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 3;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      const master = ctx.createGain();
      master.gain.value = this.level();
      master.connect(comp).connect(ctx.destination);

      const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.master = master;
      this.noise = noise;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  configure(enabled: boolean, volume: number) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.02);
  }

  play(name: SoundName, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || this.volume <= 0 || ctx.state !== 'running') return;
    const gap = THROTTLE_MS[name];
    const now = performance.now() + (opts.delay ?? 0) * 1000;
    if (gap && now - (this.last.get(name) ?? -Infinity) < gap) return;
    this.last.set(name, now);

    const t = ctx.currentTime + 0.005 + (opts.delay ?? 0);
    const out = this.output(opts.pan ?? 0);
    this.recipes[name](t, out, opts);
  }

  // Perceived loudness is roughly logarithmic; square the slider for an even feel.
  private level() {
    return this.enabled ? this.volume * this.volume * 0.9 : 0;
  }

  private output(pan: number): AudioNode {
    const ctx = this.ctx!;
    if (!pan || !ctx.createStereoPanner) return this.master!;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master!);
    return p;
  }

  private noiseBurst(t: number, out: AudioNode, o: NoiseOpts) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    const g = ctx.createGain();
    const attack = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.8);
    src.stop(t + attack + o.dur + 0.05);
  }

  private tone(t: number, out: AudioNode, o: ToneOpts) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
    const g = ctx.createGain();
    const attack = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + o.dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + attack + o.dur + 0.05);
  }

  private bell(t: number, out: AudioNode, freq: number, gain: number, dur = 0.7) {
    this.tone(t, out, { freq, dur, gain, attack: 0.004 });
    this.tone(t, out, { freq: freq * 2.01, dur: dur * 0.55, gain: gain * 0.32, attack: 0.003 });
    this.tone(t, out, { freq: freq * 3.02, dur: dur * 0.3, gain: gain * 0.12, attack: 0.002 });
  }

  private riffle(t: number, out: AudioNode, count: number, span: number, gain: number) {
    for (let i = 0; i < count; i++) {
      const at = t + (i / count) * span + Math.random() * 0.008;
      const swell = Math.sin((i / (count - 1)) * Math.PI) * 0.6 + 0.4;
      this.noiseBurst(at, out, { dur: 0.022, filter: 'bandpass', freq: 2400 + Math.random() * 1800, q: 1.4, gain: gain * swell });
    }
  }

  private recipes: Record<SoundName, (t: number, out: AudioNode, o: PlayOptions) => void> = {
    pick: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.04, filter: 'bandpass', freq: jitter(3400), q: 1.2, gain: 0.22 });
      this.tone(t, out, { freq: jitter(820), freqEnd: 560, dur: 0.03, gain: 0.035 });
    },
    place: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.065, filter: 'bandpass', freq: jitter(1900), q: 0.9, gain: 0.45 });
      this.tone(t, out, { freq: jitter(150), freqEnd: 85, dur: 0.08, gain: 0.32 });
    },
    flip: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.085, filter: 'highpass', freq: jitter(1300), freqEnd: 5200, q: 0.7, gain: 0.2, attack: 0.012 });
    },
    deal: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.1, filter: 'bandpass', freq: jitter(2800), freqEnd: 1400, q: 0.7, gain: 0.24, attack: 0.014 });
      this.noiseBurst(t + 0.11, out, { dur: 0.045, filter: 'bandpass', freq: jitter(1800), q: 0.9, gain: 0.18 });
    },
    shuffle: (t, out) => {
      this.riffle(t, out, 22, 0.34, 0.2);
      this.noiseBurst(t + 0.36, out, { dur: 0.07, filter: 'bandpass', freq: 1600, q: 0.8, gain: 0.32 });
      this.tone(t + 0.36, out, { freq: 140, freqEnd: 80, dur: 0.09, gain: 0.25 });
    },
    nope: (t, out) => {
      this.tone(t, out, { freq: 210, freqEnd: 150, dur: 0.12, type: 'triangle', gain: 0.16 });
      this.tone(t + 0.09, out, { freq: 185, freqEnd: 130, dur: 0.14, type: 'triangle', gain: 0.13 });
    },
    undo: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.16, filter: 'bandpass', freq: 4200, freqEnd: 900, q: 1.6, gain: 0.18, attack: 0.03 });
      this.tone(t, out, { freq: 700, freqEnd: 440, dur: 0.12, gain: 0.04 });
    },
    recycle: (t, out) => {
      this.noiseBurst(t, out, { dur: 0.24, filter: 'bandpass', freq: 900, freqEnd: 3800, q: 1.1, gain: 0.16, attack: 0.05 });
      this.riffle(t + 0.06, out, 12, 0.22, 0.14);
    },
    hint: (t, out) => {
      this.bell(t, out, 1318.5, 0.07, 0.4);
      this.bell(t + 0.09, out, 1760, 0.06, 0.5);
    },
    chime: (t, out, o) => {
      const step = Math.max(0, (o.rank ?? 1) - 1);
      const semis = PENTATONIC[step % 5] + 12 * Math.floor(step / 5);
      this.bell(t, out, C5 * 2 ** (semis / 12), 0.09, 0.75);
    },
    win: (t, out) => {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.bell(t + i * 0.085, out, C5 * 2 ** (s / 12), 0.085, 0.9));
      const chordAt = t + 0.65;
      [0, 4, 7, 12].forEach((s) =>
        this.tone(chordAt, out, { freq: (C5 / 2) * 2 ** (s / 12), dur: 1.8, type: 'triangle', gain: 0.05, attack: 0.08 }));
      this.noiseBurst(chordAt, out, { dur: 1.2, filter: 'highpass', freq: 7000, q: 0.5, gain: 0.03, attack: 0.2 });
    },
    click: (t, out) => {
      this.tone(t, out, { freq: 1250, dur: 0.018, gain: 0.05 });
      this.noiseBurst(t, out, { dur: 0.015, filter: 'highpass', freq: 4000, gain: 0.06 });
    },
  };
}

export const sound = new SoundEngine();
