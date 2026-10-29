export type Suit = 0 | 1 | 2 | 3; // spades, hearts, diamonds, clubs
export type DrawMode = 1 | 3;
export type SpiderSuits = 1 | 2 | 4;
export type VariantId = 'klondike' | 'freecell' | 'spider' | 'pyramid';
export type PileName = 'stock' | 'waste' | 'cell' | 'foundation' | 'tableau';

export interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1 (ace) … 13 (king)
  up: boolean;
}

export interface PileRef {
  pile: PileName;
  idx: number; // 0 for stock / waste
}

/** A specific card position: pile plus index within it. */
export interface Loc extends PileRef {
  i: number;
}

export interface GameState {
  variant: VariantId;
  stock: Card[];
  waste: Card[];
  cells: Card[][]; // FreeCell free cells, each holding at most one card
  foundations: Card[][];
  tableau: Card[][];
  score: number;
  moves: number;
  draw: DrawMode; // Klondike
  suits: SpiderSuits; // Spider
  passes: number; // times the stock has been turned over (Pyramid limits this)
  started: boolean;
  won: boolean;
  dealId: number;
  seed: number | null; // reproduces the deal
  daily: string | null; // YYYY-MM-DD when this is a Daily Deal
  verified: boolean; // the solver proved this deal can be won
  usedUndo: boolean;
  usedHint: boolean;
}

export interface DealOptions {
  variant: VariantId;
  draw: DrawMode;
  suits: SpiderSuits;
  dealId: number;
  seed?: number | null;
  daily?: string | null;
  verified?: boolean;
}

export type Hint =
  | { kind: 'move'; from: Loc; to: PileRef }
  | { kind: 'draw' };

export type ThemeName = 'emerald' | 'sapphire' | 'bordeaux' | 'noir' | 'lagoon' | 'copper' | 'plum';
export type CardBackId = 'lattice' | 'sunburst' | 'deco' | 'waves' | 'constellation' | 'gilded';

export interface Settings {
  variant: VariantId;
  draw: DrawMode;
  suits: SpiderSuits;
  theme: ThemeName;
  cardBack: CardBackId;
  sound: boolean;
  volume: number; // 0 … 1
  haptics: boolean;
  winnable: boolean;
}
