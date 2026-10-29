import { FELT_UNLOCKS } from '../game/profile';
import type { ThemeName } from '../game/types';

/** Swatch colours mirror the `[data-theme]` tokens in styles/tokens.css: [felt light, felt dark, card back]. */
export const THEMES: { name: ThemeName; label: string; swatch: [string, string, string]; wins: number }[] = [
  { name: 'emerald', label: 'Emerald', swatch: ['#1d7a58', '#0a3b2c', '#b3263e'], wins: 0 },
  { name: 'sapphire', label: 'Sapphire', swatch: ['#2a4f8f', '#0c1830', '#d8a93f'], wins: 0 },
  { name: 'bordeaux', label: 'Bordeaux', swatch: ['#7a2440', '#330b18', '#2f6aa0'], wins: 0 },
  { name: 'noir', label: 'Noir', swatch: ['#3a3f46', '#111316', '#c9a15a'], wins: 0 },
  { name: 'lagoon', label: 'Lagoon', swatch: ['#1f7f86', '#072d33', '#e0674f'], wins: FELT_UNLOCKS.lagoon! },
  { name: 'plum', label: 'Plum', swatch: ['#6a3f86', '#1f1029', '#e2b85a'], wins: FELT_UNLOCKS.plum! },
  { name: 'copper', label: 'Copper', swatch: ['#94522d', '#2e170c', '#2f8f8a'], wins: FELT_UNLOCKS.copper! },
];

export const THEME_COLOR: Record<ThemeName, string> = {
  emerald: '#0a3b2c',
  sapphire: '#0c1830',
  bordeaux: '#330b18',
  noir: '#111316',
  lagoon: '#072d33',
  plum: '#1f1029',
  copper: '#2e170c',
};
