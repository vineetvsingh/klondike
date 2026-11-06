import { describe, expect, it } from 'vitest';
import { solve, springAt } from './spring';

const MOVE = solve({ stiffness: 420, damping: 36, mass: 0.9 });
const OVERDAMPED = solve({ stiffness: 100, damping: 60, mass: 1 });

describe('springAt', () => {
  it('starts exactly where and how fast it was let go', () => {
    const { d, v } = springAt(MOVE, 300, -500, 0);
    expect(d).toBeCloseTo(300);
    expect(v).toBeCloseTo(-500);
  });

  it('comes to rest', () => {
    for (const q of [MOVE, OVERDAMPED]) {
      const { d, v } = springAt(q, 300, 800, 12);
      expect(Math.abs(d)).toBeLessThan(0.01);
      expect(Math.abs(v)).toBeLessThan(0.01);
    }
  });

  it('reports the velocity that its own motion implies', () => {
    const t = 0.13;
    const h = 1e-4;
    const slope = (springAt(MOVE, 300, 100, t + h).d - springAt(MOVE, 300, 100, t - h).d) / (2 * h);
    expect(springAt(MOVE, 300, 100, t).v).toBeCloseTo(slope, 2);
  });

  it('continues seamlessly when a flight is interrupted and re-aimed at the same spot', () => {
    // Stopping at t and starting a new spring from that state must trace the same path.
    const t = 0.1;
    const { d, v } = springAt(MOVE, 300, 0, t);
    expect(springAt(MOVE, d, v, 0.05).d).toBeCloseTo(springAt(MOVE, 300, 0, t + 0.05).d, 6);
  });
});
