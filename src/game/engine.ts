import { allCards } from './cards';
import { mulberry32, randomSeed } from './random';
import { freecell } from './rules/freecell';
import { klondike } from './rules/klondike';
import { pyramid } from './rules/pyramid';
import { spider } from './rules/spider';
import type { Rules } from './rules/types';
import type { DealOptions, GameState, Hint, Loc, PileRef, VariantId } from './types';

export { RANK_LABELS, SUIT_KEYS, allCards, isRed, pileOf } from './cards';

export const RULES: Record<VariantId, Rules> = { klondike, freecell, spider, pyramid };

export const VARIANTS: { id: VariantId; label: string; blurb: string }[] = [
  { id: 'klondike', label: 'Klondike', blurb: 'The classic: build down in alternating colours.' },
  { id: 'freecell', label: 'FreeCell', blurb: 'Every card face-up, four cells to work with.' },
  { id: 'spider', label: 'Spider', blurb: 'Two decks. Build full suits from King to Ace.' },
  { id: 'pyramid', label: 'Pyramid', blurb: 'Pair exposed cards that add up to 13. Kings go alone. Three passes through the stock.' },
];

export const variantLabel = (v: VariantId) => VARIANTS.find((x) => x.id === v)!.label;

/** Deals a game. With a seed the deal is reproducible (Daily Deal, winnable deals, replays). */
export function newDeal(opts: DealOptions): GameState {
  const seed = opts.seed ?? randomSeed();
  const piles = RULES[opts.variant].deal(opts, mulberry32(seed));
  return {
    variant: opts.variant,
    ...piles,
    moves: 0,
    draw: opts.draw,
    suits: opts.suits,
    passes: 0,
    started: false,
    won: false,
    dealId: opts.dealId,
    seed,
    daily: opts.daily ?? null,
    verified: !!opts.verified,
    usedUndo: false,
    usedHint: false,
  };
}

export function locate(g: GameState, id: string): Loc | null {
  const groups: [Loc['pile'], typeof g.tableau][] = [
    ['stock', [g.stock]], ['waste', [g.waste]], ['cell', g.cells], ['foundation', g.foundations], ['tableau', g.tableau],
  ];
  for (const [pile, piles] of groups) {
    for (let idx = 0; idx < piles.length; idx++) {
      const i = piles[idx].findIndex((c) => c.id === id);
      if (i >= 0) return { pile, idx, i };
    }
  }
  return null;
}

const rules = (g: GameState) => RULES[g.variant];

export const canPick = (g: GameState, loc: Loc) => rules(g).canPick(g, loc);
export const canMove = (g: GameState, from: Loc, to: PileRef) => rules(g).canMove(g, from, to);
export const move = (g: GameState, from: Loc, to: PileRef) => rules(g).move(g, from, to);
export const draw = (g: GameState) => rules(g).draw(g);
export const drawBlocked = (g: GameState) => rules(g).drawBlocked(g);
export const autoTarget = (g: GameState, from: Loc) => rules(g).autoTarget(g, from);
export const findHint = (g: GameState): Hint | null => rules(g).findHint(g);
export const canAutoComplete = (g: GameState) => rules(g).canAutoComplete(g);
export const autoStep = (g: GameState) => rules(g).autoStep(g);
export const hasStock = (v: VariantId) => v !== 'freecell';

/** Accepts saved games from older versions too, filling in fields they predate. */
export function normalizeState(x: unknown): GameState | null {
  const g = x as Partial<GameState> | null;
  if (!g || typeof g !== 'object') return null;
  const variant: VariantId = g.variant && g.variant in RULES ? g.variant : 'klondike';
  const n = {
    cells: [],
    suits: 4,
    passes: 0,
    seed: null,
    daily: null,
    verified: false,
    usedUndo: false,
    usedHint: false,
    ...g,
    variant,
  } as GameState;
  if (!Array.isArray(n.stock) || !Array.isArray(n.waste) || !Array.isArray(n.cells)) return null;
  if (!Array.isArray(n.foundations) || !Array.isArray(n.tableau)) return null;
  if (n.draw !== 1 && n.draw !== 3) return null;
  const expected = RULES[variant].ids({ suits: n.suits });
  const cards = allCards(n);
  const ids = new Set(cards.map((c) => c?.id));
  if (cards.length !== expected.length || ids.size !== expected.length || !expected.every((id) => ids.has(id))) return null;
  return n;
}

/** Stable card ids for a variant, used as React keys and animation handles. */
export const idsFor = (g: Pick<GameState, 'variant' | 'suits'>) => RULES[g.variant].ids({ suits: g.suits });
