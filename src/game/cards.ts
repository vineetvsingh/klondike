import type { Card, GameState, PileRef, Suit } from './types';

export const SUIT_KEYS = ['S', 'H', 'D', 'C'] as const;
export const RANK_LABELS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const isRed = (suit: Suit) => suit === 1 || suit === 2;
export const top = <T>(arr: readonly T[]): T | undefined => arr[arr.length - 1];

/** Builds `copies` decks over the given suits; ids stay unique with a `.n` suffix past the first copy. */
export function makeDeck(suits: Suit[], copies = 1): Card[] {
  const deck: Card[] = [];
  for (let k = 0; k < copies; k++) {
    for (const s of suits) {
      for (let r = 1; r <= 13; r++) {
        deck.push({ id: `${SUIT_KEYS[s]}${r}${k ? `.${k}` : ''}`, suit: s, rank: r, up: false });
      }
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[], random: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pileOf(g: GameState, ref: PileRef): Card[] {
  switch (ref.pile) {
    case 'stock': return g.stock;
    case 'waste': return g.waste;
    case 'cell': return g.cells[ref.idx];
    case 'foundation': return g.foundations[ref.idx];
    case 'tableau': return g.tableau[ref.idx];
  }
}

export function clone(g: GameState): GameState {
  return {
    ...g,
    stock: [...g.stock],
    waste: [...g.waste],
    cells: g.cells.map((p) => [...p]),
    foundations: g.foundations.map((p) => [...p]),
    tableau: g.tableau.map((p) => [...p]),
  };
}

export const allCards = (g: GameState): Card[] => [
  ...g.stock, ...g.waste, ...g.cells.flat(), ...g.foundations.flat(), ...g.tableau.flat(),
];

/** Bookkeeping shared by every move: score floor, move count, start and win flags. */
export function finish(n: GameState, delta: number): GameState {
  n.score = Math.max(0, n.score + delta);
  n.moves += 1;
  n.started = true;
  n.won = n.foundations.length > 0 && n.foundations.every((f) => f.length === 13);
  return n;
}

/** Flips the newly exposed top card of a tableau column; returns true if one turned over. */
export function reveal(col: Card[]): boolean {
  const t = top(col);
  if (t && !t.up) {
    col[col.length - 1] = { ...t, up: true };
    return true;
  }
  return false;
}

/** A run that can travel together: each card one rank lower, by `fits`. */
export function isRun(cards: Card[], fits: (lower: Card, upper: Card) => boolean): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (!cards[i].up || !fits(cards[i], cards[i - 1])) return false;
  }
  return cards.length > 0 && cards[0].up;
}

export const alternating = (lower: Card, upper: Card) =>
  lower.rank === upper.rank - 1 && isRed(lower.suit) !== isRed(upper.suit);

export const sameSuit = (lower: Card, upper: Card) =>
  lower.rank === upper.rank - 1 && lower.suit === upper.suit;

export function toFoundation(dest: Card[], c: Card) {
  const t = top(dest);
  return t ? t.suit === c.suit && c.rank === t.rank + 1 : c.rank === 1;
}
