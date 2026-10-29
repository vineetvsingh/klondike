import type { DealOptions, GameState, Hint, Loc, PileRef } from '../types';

export type DealtPiles = Pick<GameState, 'stock' | 'waste' | 'cells' | 'foundations' | 'tableau' | 'score'>;

export interface Rules {
  deal(opts: DealOptions, random: () => number): DealtPiles;
  /** Card ids this variant uses, for validating saved games. */
  ids(opts: Pick<DealOptions, 'suits'>): string[];
  /** Can the card at `loc` (and what sits on it) be picked up? */
  canPick(g: GameState, loc: Loc): boolean;
  canMove(g: GameState, from: Loc, to: PileRef): boolean;
  /** Applies a legal move, including scoring and any follow-on effects. */
  move(g: GameState, from: Loc, to: PileRef): GameState;
  /** Stock action (draw / recycle / deal a row). Null when nothing happens. */
  draw(g: GameState): GameState | null;
  /** Why the stock can't be used right now, if there's a reason worth saying. */
  drawBlocked(g: GameState): string | null;
  autoTarget(g: GameState, from: Loc): PileRef | null;
  findHint(g: GameState): Hint | null;
  canAutoComplete(g: GameState): boolean;
  autoStep(g: GameState): { from: Loc; to: PileRef } | null;
}
