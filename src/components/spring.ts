export interface Spring {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface Solved {
  zw: number; // decay rate
  wd: number; // damped frequency
  w2: number; // natural frequency, squared
}

export function solve({ stiffness, damping, mass }: Spring): Solved {
  const w = Math.sqrt(stiffness / mass);
  // Just under critical damping is indistinguishable from it, and needs only one formula.
  const zeta = Math.min(0.999, damping / (2 * Math.sqrt(stiffness * mass)));
  return { zw: zeta * w, wd: w * Math.sqrt(1 - zeta * zeta), w2: w * w };
}

/**
 * The closed-form spring: offset from rest and velocity, `t` seconds after letting go
 * at offset `d0` moving at `v0`. Because it needs no stepping, a card interrupted
 * mid-flight can ask exactly where it is and how fast it's going.
 */
export function springAt(q: Solved, d0: number, v0: number, t: number) {
  const decay = Math.exp(-q.zw * t);
  const a = decay * Math.cos(q.wd * t);
  const b = (decay * Math.sin(q.wd * t)) / q.wd;
  return {
    d: a * d0 + b * (v0 + q.zw * d0),
    v: a * v0 - b * (q.w2 * d0 + q.zw * v0),
  };
}
