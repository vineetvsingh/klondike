import { dailySeed } from './daily';
import { checkable } from './solvers';
import { KEYS, read, write } from './storage';
import type { DealKind, SolverAsk, SolverReply, SolverRequest } from './solver.worker';

export type { DealKind };

export interface DealSeed {
  seed: number;
  verified: boolean;
}

const KEEP = 2;

/** One reserve per game and mode: Klondike Draw 1 and Draw 3, Spider by suits, and so on. */
const keyOf = (k: DealKind) =>
  `${k.variant}:${k.variant === 'klondike' ? k.draw : k.variant === 'spider' ? k.suits : 0}`;

/**
 * Hands out seeds the solvers have proven winnable. Solving runs in a Web Worker and
 * keeps a couple of seeds in reserve for the current game (saved across visits), so a
 * new game is usually instant.
 */
class Dealer {
  private worker: Worker | null | undefined;
  private seq = 0;
  private pending = new Map<number, (r: SolverReply | null) => void>();
  private ready: Record<string, number[]> = read<Record<string, number[]>>(KEYS.ready, {});
  private filling: Record<string, Promise<void>> = {};
  private dailyCache = read<{ date: string; seed: number; verified: boolean } | null>(KEYS.daily, null);

  private spawn(): Worker | null {
    try {
      const w = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<SolverReply>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
      return w;
    } catch {
      return null;
    }
  }

  private get w(): Worker | null {
    if (this.worker === undefined) {
      this.worker = this.spawn();
      if (this.worker) this.worker.onerror = () => { this.worker = null; };
    }
    return this.worker;
  }

  private ask(req: SolverAsk, w = this.w): Promise<SolverReply | null> {
    if (!w) return Promise.resolve(null);
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      w.addEventListener('error', () => resolve(null), { once: true });
      w.postMessage({ ...req, id } satisfies SolverRequest);
    });
  }

  private list(k: DealKind) {
    return (this.ready[keyOf(k)] ??= []);
  }

  private save() {
    write(KEYS.ready, this.ready);
  }

  /** A proven seed if one is already waiting. */
  takeNow(k: DealKind): number | null {
    if (!checkable(k)) return null;
    const seed = this.list(k).shift();
    this.save();
    this.prefetch(k);
    return seed ?? null;
  }

  /** Waits (up to `timeoutMs`) for a proven seed; null means deal an unchecked one. */
  async take(k: DealKind, timeoutMs: number): Promise<number | null> {
    const now = this.takeNow(k);
    if (now != null || !checkable(k)) return now;
    const fill = this.filling[keyOf(k)] ?? this.prefetch(k);
    await Promise.race([fill, new Promise((r) => setTimeout(r, timeoutMs))]);
    return this.list(k).length ? this.takeNow(k) : null;
  }

  prefetch(k: DealKind): Promise<void> {
    const key = keyOf(k);
    if (key in this.filling) return this.filling[key];
    if (!checkable(k) || this.list(k).length >= KEEP) return Promise.resolve();
    const run = async () => {
      while (this.list(k).length < KEEP) {
        const r = await this.ask({ kind: 'random', variant: k.variant, draw: k.draw, suits: k.suits });
        if (!r) return;
        if (r.verified) {
          this.list(k).push(r.seed);
          this.save();
        }
      }
    };
    const p = run().finally(() => { delete this.filling[key]; });
    this.filling[key] = p;
    return p;
  }

  /** Today's Daily Deal: the first seed in the day's fixed sequence that the solver can win. */
  async daily(date: string): Promise<DealSeed> {
    if (this.dailyCache?.date === date) return this.dailyCache;
    // Its own worker, so it never queues behind background prefetching.
    const w = this.spawn();
    const r = await this.ask({ kind: 'daily', date }, w);
    w?.terminate();
    const result = r ? { seed: r.seed, verified: r.verified } : { seed: dailySeed(date, 0), verified: false };
    if (r) {
      this.dailyCache = { date, ...result };
      write(KEYS.daily, this.dailyCache);
    }
    return result;
  }
}

export const dealer = new Dealer();
