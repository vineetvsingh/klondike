import { hashString } from './random';

/** Daily Deals are numbered from this day (#1). */
const EPOCH = Date.UTC(2026, 0, 1);
const DAY = 86400000;

/** The player's local calendar date as YYYY-MM-DD. */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const utc = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export const dailyNumber = (key: string) => Math.round((utc(key) - EPOCH) / DAY) + 1;

export function shiftDay(key: string, days: number): string {
  const t = new Date(utc(key) + days * DAY);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** Seeds to try for a given day. Deterministic, so every player gets the same Daily Deal. */
export const dailySeed = (key: string, attempt: number) => hashString(`daily:${key}:${attempt}`);

/** Consecutive completed days ending today (or yesterday, so the streak survives until you play). */
export function dailyStreak(done: Record<string, unknown>, today: string): number {
  let day = done[today] ? today : shiftDay(today, -1);
  let n = 0;
  while (done[day]) {
    n++;
    day = shiftDay(day, -1);
  }
  return n;
}

export function bestDailyStreak(done: Record<string, unknown>): number {
  const days = Object.keys(done).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const d of days) {
    run = prev && shiftDay(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Calendar grid for a month: weeks of day keys (null for padding), Monday first. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month, 1));
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
