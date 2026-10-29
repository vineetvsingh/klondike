export type HapticName = 'pick' | 'land' | 'nope' | 'win';

const PATTERNS: Record<HapticName, number | number[]> = {
  pick: 7,
  land: 11,
  nope: [12, 50, 12],
  win: [40, 70, 40, 70, 140],
};

const THROTTLE: Partial<Record<HapticName, number>> = { land: 45, pick: 30 };

/** Tiny vibrations on phones that support them (Android browsers; iOS Safari ignores vibrate). */
class Haptics {
  readonly supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  private enabled = true;
  private last = new Map<HapticName, number>();

  configure(enabled: boolean) {
    this.enabled = enabled;
  }

  play(name: HapticName) {
    if (!this.enabled || !this.supported) return;
    const now = performance.now();
    const gap = THROTTLE[name];
    if (gap && now - (this.last.get(name) ?? -1e9) < gap) return;
    this.last.set(name, now);
    try {
      navigator.vibrate(PATTERNS[name]);
    } catch {
      /* blocked until the first user gesture */
    }
  }
}

export const haptics = new Haptics();
