import { solve, springAt, type Spring } from './spring';

/**
 * How cards move, and why it's built this way.
 *
 * A table holds up to 104 cards. Moving them from JavaScript makes the browser redo its
 * layer bookkeeping on every frame, and that cost grows with the number of layers. So:
 *
 *  - A flight's whole spring is worked out up front and handed to the browser as a Web
 *    Animation of `transform`, which the compositor plays without any per-frame JavaScript.
 *    It stays smooth even while the main thread is busy.
 *  - Resting cards have no layer of their own: they flatten into one static picture and
 *    cost nothing. Only cards in the air are promoted (`data-fly`).
 *  - The 3D needed to turn a card over exists only while it's turning (`data-flip`).
 *    At rest a card paints just the side that's showing (`data-side`).
 */

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const REDUCED_MOTION = !!reduced;

const BRISK: Spring = { stiffness: 1400, damping: 75, mass: 1 };

// Critically-damped-ish springs: quick, with a whisper of overshoot so cards feel weighted.
export const MOVE_SPRING: Spring = reduced ? BRISK : { stiffness: 420, damping: 36, mass: 0.9 };
export const DEAL_SPRING: Spring = reduced ? BRISK : { stiffness: 260, damping: 28, mass: 1 };
export const WIN_SPRING: Spring = reduced ? BRISK : { stiffness: 110, damping: 17, mass: 1 };
const FLIP_SPRING: Spring = reduced ? BRISK : { stiffness: 260, damping: 22, mass: 0.8 };

export const DEAL_STAGGER = reduced ? 0.01 : 0.042;

const STEP = 1 / 60;
const MAX_SECONDS = 4;

// A card in motion leans into its direction of travel, then settles upright.
const TILT = reduced ? 0 : 4;
const LEAN_STIFFNESS = 300;
const LEAN_DAMPING = 24;
const leanFor = (vx: number) => (TILT * Math.max(-2200, Math.min(2200, vx))) / 2200;

// A brief lift sells the "picked up, set down" weight.
const LIFT_PEAK = 1.045;
const LIFT_UP = 0.147;
const LIFT_END = 0.42;
const HELD_LIFT = reduced ? 1 : 1.06;

function liftAt(t: number, from: number) {
  if (reduced) return 1;
  const ease = (u: number) => 1 - (1 - u) * (1 - u);
  if (t < LIFT_UP) return from + (LIFT_PEAK - from) * ease(t / LIFT_UP);
  if (t < LIFT_END) return LIFT_PEAK + (1 - LIFT_PEAK) * ease((t - LIFT_UP) / (LIFT_END - LIFT_UP));
  return 1;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Where a card is, and how it's moving, at some instant. */
export interface Pose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  scale: number;
  lean: number;
}

interface Flight {
  anim: Animation;
  from: Pose;
  q: ReturnType<typeof solve>;
  delay: number;
  leans: number[];
  timer: number;
}

interface Turning {
  anim: Animation | null; // null until its delay has passed
  timer: number;
  from: number;
  speed: number;
  q: ReturnType<typeof solve>;
}

// Landed cards stay on their layers until everything is down, then flatten in one go.
// That spends one paint at the end of a deal rather than one per card along the way.
let airborne = 0;
const landed = new Set<CardHandle>();

function settleIfCalm() {
  if (airborne) return;
  for (const h of landed) h.settle();
  landed.clear();
}

export class CardHandle {
  /** Where the card rests; while it's in flight, where it's heading. */
  x = 0;
  y = 0;
  spin = 0;
  targetZ = 1;
  flight: Flight | null = null;

  private el!: HTMLElement;
  private inner!: HTMLElement;
  private vx = 0;
  private vy = 0;
  private scale = 1;
  private lean = 0;
  private z = -1;
  private up = false;
  private turning: Turning | null = null;

  /** React re-attaches refs in development, so a detach mustn't disturb a running flight. */
  attach = (el: HTMLElement | null) => {
    if (!el) return;
    this.el = el;
    this.inner = el.firstElementChild as HTMLElement;
  };

  setZ(z: number) {
    if (z === this.z) return;
    this.z = z;
    this.el.style.zIndex = String(z);
  }

  /** The card's pose right now, read from the spring rather than the DOM. */
  now(): Pose {
    const f = this.flight;
    if (!f) return { x: this.x, y: this.y, vx: this.vx, vy: this.vy, spin: this.spin, scale: this.scale, lean: this.lean };
    const t = Math.max(0, Number(f.anim.currentTime ?? 0) / 1000 - f.delay);
    const px = springAt(f.q, f.from.x - this.x, f.from.vx, t);
    const py = springAt(f.q, f.from.y - this.y, f.from.vy, t);
    return {
      x: this.x + px.d,
      y: this.y + py.d,
      vx: px.v,
      vy: py.v,
      spin: this.spin + springAt(f.q, f.from.spin - this.spin, 0, t).d,
      scale: liftAt(t, f.from.scale),
      lean: f.leans[Math.min(f.leans.length - 1, Math.round(t / STEP))],
    };
  }

  private stopFlight() {
    const f = this.flight;
    if (!f) return;
    clearTimeout(f.timer);
    f.anim.cancel();
    this.flight = null;
    airborne--;
  }

  /** Sends the card along a spring from wherever it is, keeping its speed. */
  fly(x: number, y: number, o: { z: number; delay?: number; spring?: Spring; spin?: number; stayLifted?: boolean; onArrive?: () => void }) {
    const { z, delay = 0, spring = MOVE_SPRING, spin = 0, stayLifted = false, onArrive } = o;
    const from = this.now();
    this.stopFlight();
    landed.delete(this);

    const q = solve(spring);
    const dx0 = from.x - x;
    const dy0 = from.y - y;
    const ds0 = from.spin - spin;
    const frames: string[] = [];
    const leans: number[] = [];
    const travels = Math.hypot(dx0, dy0) > 8;
    let arrive = -1;
    let lean = from.lean;
    let leanV = 0;

    for (let i = 0; ; i++) {
      const t = i * STEP;
      const decay = Math.exp(-q.zw * t);
      const a = decay * Math.cos(q.wd * t);
      const b = (decay * Math.sin(q.wd * t)) / q.wd;
      const ox = a * dx0 + b * (from.vx + q.zw * dx0);
      const oy = a * dy0 + b * (from.vy + q.zw * dy0);
      const os = a * ds0 + b * q.zw * ds0;
      const vx = a * from.vx - b * (q.w2 * dx0 + q.zw * from.vx);
      const vy = a * from.vy - b * (q.w2 * dy0 + q.zw * from.vy);
      if (travels && arrive < 0 && Math.hypot(ox, oy) < 6) arrive = t;

      const done = (reduced || t >= LIFT_END) && Math.abs(ox) < 0.2 && Math.abs(oy) < 0.2 && Math.abs(vx) < 10 && Math.abs(vy) < 10
        && Math.abs(os) < 0.1 && Math.abs(lean) < 0.05;
      if ((done || t >= MAX_SECONDS) && i > 0) {
        frames.push(`translate(${x}px, ${y}px) rotate(${spin}deg) scale(1)`);
        leans.push(0);
        break;
      }
      frames.push(`translate(${round(x + ox)}px, ${round(y + oy)}px) rotate(${round(spin + os + lean)}deg) scale(${round(liftAt(t, from.scale) * 100) / 100})`);
      leans.push(lean);
      leanV += (LEAN_STIFFNESS * (leanFor(vx) - lean) - LEAN_DAMPING * leanV) * STEP;
      lean += leanV * STEP;
    }

    this.place(x, y, spin);
    this.el.dataset.fly = '';
    this.setZ(z);
    const anim = this.el.animate({ transform: frames }, {
      duration: (frames.length - 1) * STEP * 1000,
      delay: delay * 1000,
      fill: 'backwards',
    });
    const timer = onArrive && arrive >= 0 ? window.setTimeout(onArrive, (delay + arrive) * 1000) : 0;
    const flight: Flight = { anim, from, q, delay, leans, timer };
    this.flight = flight;
    airborne++;
    anim.onfinish = () => {
      if (this.flight !== flight) return;
      this.flight = null;
      airborne--;
      if (!stayLifted) landed.add(this);
      settleIfCalm();
    };
  }

  /** Back to being part of the flat table. */
  settle() {
    if (this.flight) return;
    this.setZ(this.targetZ);
    delete this.el.dataset.fly;
  }

  private place(x: number, y: number, spin: number) {
    this.x = x;
    this.y = y;
    this.spin = spin;
    this.vx = 0;
    this.vy = 0;
    this.scale = 1;
    this.lean = 0;
    this.el.style.transform = spin ? `translate(${x}px, ${y}px) rotate(${spin}deg)` : `translate(${x}px, ${y}px)`;
  }

  /** Turns the card over. Returns false if it's already showing, or heading for, that side. */
  turn(up: boolean, delay = 0) {
    if (this.up === up) return false;
    this.up = up;
    const to = up ? 180 : 0;

    let angle = up ? 0 : 180;
    let speed = 0;
    const was = this.turning;
    if (was) {
      clearTimeout(was.timer);
      if (!was.anim) {
        // That turn never got going, so the card is already showing this side.
        this.turning = null;
        this.showSide();
        return false;
      }
      // Mid-turn, carry on from the current angle and speed.
      const s = springAt(was.q, was.from - angle, was.speed, Number(was.anim.currentTime ?? 0) / 1000);
      angle += s.d;
      speed = s.v;
      was.anim.cancel();
    }

    const q = solve(FLIP_SPRING);
    const frames: string[] = [];
    for (let i = 0; ; i++) {
      const t = i * STEP;
      const s = springAt(q, angle - to, speed, t);
      if ((Math.abs(s.d) < 0.3 && Math.abs(s.v) < 5 && i > 0) || t >= MAX_SECONDS) {
        frames.push(`rotateY(${to}deg)`);
        break;
      }
      frames.push(`rotateY(${round(to + s.d)}deg)`);
    }

    const turning: Turning = { anim: null, timer: 0, from: angle, speed, q };
    this.turning = turning;
    // Both sides and the 3D are switched on only when the turn is due. Otherwise a deal
    // of 52 face-up cards would hold over a hundred extra layers for its whole length.
    const begin = () => {
      this.el.dataset.flip = '';
      turning.anim = this.inner.animate({ transform: frames }, { duration: (frames.length - 1) * STEP * 1000 });
      turning.anim.onfinish = () => {
        if (this.turning !== turning) return;
        this.turning = null;
        this.showSide();
      };
    };
    if (delay > 0) turning.timer = window.setTimeout(begin, delay * 1000);
    else begin();
    return true;
  }

  private showSide() {
    delete this.el.dataset.flip;
    this.el.dataset.side = this.up ? 'face' : 'back';
  }

  /** Cancels everything and puts the card straight there, on the flat table. */
  snap(x: number, y: number, z: number, up: boolean, spin = 0) {
    this.halt();
    this.place(x, y, spin);
    this.up = up;
    this.showSide();
    this.targetZ = z;
    this.setZ(z);
    delete this.el.dataset.fly;
  }

  /** Stops all animation where it stands. */
  halt() {
    this.stopFlight();
    landed.delete(this);
    settleIfCalm();
    if (this.turning) {
      clearTimeout(this.turning.timer);
      this.turning.anim?.cancel();
      this.turning = null;
    }
  }

  /** Takes the card into the hand, from wherever it is right now. */
  grab(z: number) {
    const pose = this.now();
    this.stopFlight();
    landed.delete(this);
    settleIfCalm();
    this.el.dataset.fly = '';
    this.setZ(z);
    this.pose(pose.x, pose.y, pose);
    return pose;
  }

  /** Puts a held card at a position, as `feel` says it should lean and lift. */
  pose(x: number, y: number, feel: Pick<Pose, 'vx' | 'vy' | 'lean' | 'scale'>) {
    this.x = x;
    this.y = y;
    this.vx = feel.vx;
    this.vy = feel.vy;
    this.lean = feel.lean;
    this.scale = feel.scale;
    this.el.style.transform = `translate(${round(x)}px, ${round(y)}px) rotate(${round(this.spin + feel.lean)}deg) scale(${round(feel.scale * 1000) / 1000})`;
  }

  /** A little "no": shakes side to side where it rests. */
  shake() {
    if (this.flight) return;
    const at = (d: number) => `translate(${this.x + d}px, ${this.y}px)`;
    this.el.animate({ transform: [at(0), at(7), at(-6), at(4), at(-2), at(0)] }, { duration: 420, easing: 'ease-in-out' });
  }
}

/** The feel of cards in the hand, stepped once a frame during a drag. */
export class HandFeel {
  vx = 0;
  vy = 0;
  lean: number;
  scale: number;
  private leanV = 0;
  private scaleV = 0;
  private x: number;
  private y: number;

  constructor(start: Pose) {
    this.x = start.x;
    this.y = start.y;
    this.lean = start.lean;
    this.scale = start.scale;
  }

  step(x: number, y: number, dt: number) {
    const keep = Math.pow(0.6, dt * 60);
    this.vx = this.vx * keep + ((x - this.x) / dt) * (1 - keep);
    this.vy = this.vy * keep + ((y - this.y) / dt) * (1 - keep);
    this.x = x;
    this.y = y;
    this.leanV += (LEAN_STIFFNESS * (leanFor(this.vx) - this.lean) - LEAN_DAMPING * this.leanV) * dt;
    this.lean += this.leanV * dt;
    this.scaleV += (520 * (HELD_LIFT - this.scale) - 28 * this.scaleV) * dt;
    this.scale += this.scaleV * dt;
  }
}
