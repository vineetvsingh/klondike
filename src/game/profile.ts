import { bestDailyStreak, dailyStreak, todayKey } from './daily';
import { KEYS, read } from './storage';
import type { CardBackId, GameState, ThemeName, VariantId } from './types';

/** One finished (won or abandoned) game. */
export interface GameRecord {
  v: VariantId;
  mode: number; // draw count for Klondike, suit count for Spider
  won: boolean;
  time: number;
  moves: number;
  score: number;
  at: number; // epoch ms
  daily?: string;
}

export interface Best { time: number | null; score: number | null; moves: number | null }

export interface DailyResult { time: number; moves: number; score: number }

export interface Profile {
  records: GameRecord[];
  totals: Record<VariantId, { played: number; won: number }>;
  best: Record<VariantId, Best>;
  streak: number;
  bestStreak: number;
  achievements: Partial<Record<AchievementId, number>>; // unlocked at (epoch ms)
  daily: Record<string, DailyResult>;
}

const MAX_RECORDS = 1000;
const VARIANT_IDS: VariantId[] = ['klondike', 'freecell', 'spider', 'pyramid'];
const noBest = (): Best => ({ time: null, score: null, moves: null });

export function emptyProfile(): Profile {
  return {
    records: [],
    totals: { klondike: { played: 0, won: 0 }, freecell: { played: 0, won: 0 }, spider: { played: 0, won: 0 }, pyramid: { played: 0, won: 0 } },
    best: { klondike: noBest(), freecell: noBest(), spider: noBest(), pyramid: noBest() },
    streak: 0,
    bestStreak: 0,
    achievements: {},
    daily: {},
  };
}

/** Loads the profile, carrying over the single-game statistics from earlier versions. */
export function loadProfile(): Profile {
  const base = emptyProfile();
  const saved = read<Partial<Profile> | null>(KEYS.profile, null);
  if (saved && typeof saved === 'object') {
    const p = { ...base, ...saved };
    for (const v of VARIANT_IDS) {
      p.totals[v] = { ...base.totals[v], ...saved.totals?.[v] };
      p.best[v] = { ...base.best[v], ...saved.best?.[v] };
    }
    if (!Array.isArray(p.records)) p.records = [];
    return p;
  }
  const old = read<{ played?: number; won?: number; streak?: number; bestStreak?: number; bestTime?: number | null; bestScore?: number | null } | null>(KEYS.legacyStats, null);
  if (old) {
    base.totals.klondike = { played: old.played ?? 0, won: old.won ?? 0 };
    base.streak = old.streak ?? 0;
    base.bestStreak = old.bestStreak ?? 0;
    base.best.klondike = { time: old.bestTime ?? null, score: old.bestScore ?? null, moves: null };
  }
  return base;
}

const modeOf = (g: GameState) => (g.variant === 'klondike' ? g.draw : g.variant === 'spider' ? g.suits : 0);

const pushRecord = (p: Profile, r: GameRecord) => [...p.records, r].slice(-MAX_RECORDS);

export function recordStart(p: Profile, g: GameState): Profile {
  return { ...p, totals: { ...p.totals, [g.variant]: { ...p.totals[g.variant], played: p.totals[g.variant].played + 1 } } };
}

export function recordLoss(p: Profile, g: GameState, time: number): Profile {
  return {
    ...p,
    streak: 0,
    records: pushRecord(p, { v: g.variant, mode: modeOf(g), won: false, time, moves: g.moves, score: g.score, at: Date.now(), ...(g.daily ? { daily: g.daily } : {}) }),
  };
}

export interface WinOutcome {
  profile: Profile;
  bestTime: boolean;
  bestScore: boolean;
  achievements: AchievementId[];
  unlocks: Unlock[];
}

export function recordWin(p: Profile, g: GameState, time: number): WinOutcome {
  const v = g.variant;
  const b = p.best[v];
  const bestTime = b.time == null || time < b.time;
  const bestScore = b.score == null || g.score > b.score;
  const streak = p.streak + 1;
  const next: Profile = {
    ...p,
    streak,
    bestStreak: Math.max(p.bestStreak, streak),
    totals: { ...p.totals, [v]: { ...p.totals[v], won: p.totals[v].won + 1 } },
    best: {
      ...p.best,
      [v]: {
        time: bestTime ? time : b.time,
        score: bestScore ? g.score : b.score,
        moves: b.moves == null || g.moves < b.moves ? g.moves : b.moves,
      },
    },
    records: pushRecord(p, { v, mode: modeOf(g), won: true, time, moves: g.moves, score: g.score, at: Date.now(), ...(g.daily ? { daily: g.daily } : {}) }),
    daily: g.daily && !p.daily[g.daily] ? { ...p.daily, [g.daily]: { time, moves: g.moves, score: g.score } } : p.daily,
  };

  const earned = ACHIEVEMENTS.filter((a) => !p.achievements[a.id] && a.test({ g, time, profile: next })).map((a) => a.id);
  const now = Date.now();
  next.achievements = { ...p.achievements, ...Object.fromEntries(earned.map((id) => [id, now])) };

  const before = new Set(unlockedItems(p).map((u) => u.id));
  const unlocks = unlockedItems(next).filter((u) => !before.has(u.id));
  return { profile: next, bestTime, bestScore, achievements: earned, unlocks };
}

export const totalWins = (p: Profile) => VARIANT_IDS.reduce((n, v) => n + p.totals[v].won, 0);
export const totalPlayed = (p: Profile) => VARIANT_IDS.reduce((n, v) => n + p.totals[v].played, 0);

// ---------- Achievements ----------

export type AchievementId =
  | 'first-win' | 'no-undo' | 'no-hint' | 'quick' | 'blitz' | 'efficient' | 'draw-three'
  | 'streak-3' | 'streak-10' | 'daily-1' | 'daily-7' | 'freecell' | 'spider' | 'spider-4' | 'pyramid'
  | 'wins-25' | 'wins-100';

interface WinContext { g: GameState; time: number; profile: Profile }

export interface Achievement {
  id: AchievementId;
  title: string;
  detail: string;
  test: (c: WinContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-win', title: 'First Light', detail: 'Win your first game', test: () => true },
  { id: 'no-undo', title: 'No Regrets', detail: 'Win without using Undo', test: ({ g }) => !g.usedUndo },
  { id: 'no-hint', title: 'Unaided', detail: 'Win without asking for a hint', test: ({ g }) => !g.usedHint },
  { id: 'quick', title: 'Brisk', detail: 'Win in under 3 minutes', test: ({ time }) => time < 180 },
  { id: 'blitz', title: 'Lightning Hands', detail: 'Win in under 90 seconds', test: ({ time }) => time < 90 },
  { id: 'efficient', title: 'Economist', detail: 'Win Klondike in under 100 moves', test: ({ g }) => g.variant === 'klondike' && g.moves < 100 },
  { id: 'draw-three', title: 'Old School', detail: 'Win a Draw 3 game of Klondike', test: ({ g }) => g.variant === 'klondike' && g.draw === 3 },
  { id: 'streak-3', title: 'Hat Trick', detail: 'Win 3 games in a row', test: ({ profile }) => profile.streak >= 3 },
  { id: 'streak-10', title: 'Unbroken', detail: 'Win 10 games in a row', test: ({ profile }) => profile.streak >= 10 },
  { id: 'daily-1', title: 'Daily Bread', detail: 'Win a Daily Deal', test: ({ g }) => !!g.daily },
  { id: 'daily-7', title: 'Week of Wins', detail: 'Win the Daily Deal 7 days running', test: ({ profile }) => dailyStreak(profile.daily, todayKey()) >= 7 || bestDailyStreak(profile.daily) >= 7 },
  { id: 'freecell', title: 'Free Spirit', detail: 'Win a game of FreeCell', test: ({ g }) => g.variant === 'freecell' },
  { id: 'spider', title: 'Web Weaver', detail: 'Win a game of Spider', test: ({ g }) => g.variant === 'spider' },
  { id: 'spider-4', title: 'Arachnophile', detail: 'Win four-suit Spider', test: ({ g }) => g.variant === 'spider' && g.suits === 4 },
  { id: 'pyramid', title: 'Pharaoh', detail: 'Clear a Pyramid', test: ({ g }) => g.variant === 'pyramid' },
  { id: 'wins-25', title: 'Regular', detail: 'Win 25 games', test: ({ profile }) => totalWins(profile) >= 25 },
  { id: 'wins-100', title: 'Centurion', detail: 'Win 100 games', test: ({ profile }) => totalWins(profile) >= 100 },
];

// ---------- Unlockable card backs and felts ----------

export interface Unlock {
  id: string;
  kind: 'back' | 'felt';
  key: CardBackId | ThemeName;
  label: string;
  wins: number;
}

export const CARD_BACKS: { id: CardBackId; label: string; wins: number }[] = [
  { id: 'lattice', label: 'Lattice', wins: 0 },
  { id: 'sunburst', label: 'Sunburst', wins: 1 },
  { id: 'waves', label: 'Waves', wins: 3 },
  { id: 'deco', label: 'Deco', wins: 6 },
  { id: 'constellation', label: 'Constellation', wins: 10 },
  { id: 'gilded', label: 'Gilded', wins: 20 },
];

export const FELT_UNLOCKS: Partial<Record<ThemeName, number>> = { lagoon: 2, plum: 5, copper: 8 };

export function unlockedItems(p: Profile): Unlock[] {
  const wins = totalWins(p);
  const backs: Unlock[] = CARD_BACKS.filter((b) => b.wins > 0 && wins >= b.wins)
    .map((b) => ({ id: `back:${b.id}`, kind: 'back', key: b.id, label: b.label, wins: b.wins }));
  const felts: Unlock[] = (Object.entries(FELT_UNLOCKS) as [ThemeName, number][])
    .filter(([, w]) => wins >= w)
    .map(([key, w]) => ({ id: `felt:${key}`, kind: 'felt', key, label: key[0].toUpperCase() + key.slice(1), wins: w }));
  return [...backs, ...felts];
}
