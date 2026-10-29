import { normalizeState } from './engine';
import type { GameState, Settings } from './types';

export const KEYS = {
  game: 'solitaire.game.v2',
  legacyStats: 'solitaire.stats.v1',
  profile: 'solitaire.profile.v1',
  settings: 'solitaire.settings.v2',
  tip: 'solitaire.tip.v1',
  ready: 'solitaire.ready.v2',
  daily: 'solitaire.dailyseed.v1',
} as const;

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode, quota) — the game still works */
  }
}

export function remove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

export const DEFAULT_SETTINGS: Settings = {
  variant: 'klondike',
  draw: 1,
  suits: 1,
  theme: 'emerald',
  cardBack: 'lattice',
  sound: true,
  volume: 0.7,
  haptics: true,
  winnable: true,
};

export interface SavedGame {
  game: GameState;
  elapsed: number;
}

export function loadSavedGame(): SavedGame | null {
  const saved = read<{ game?: unknown; elapsed?: unknown } | null>(KEYS.game, null);
  const game = normalizeState(saved?.game);
  if (!game || game.won) return null;
  return { game, elapsed: Number(saved?.elapsed) || 0 };
}
