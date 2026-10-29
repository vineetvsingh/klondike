import { describe, expect, it } from 'vitest';
import { canMove, draw, move, newDeal } from './engine';
import { drawsBetween, reachable, solveKlondike, type SolverMove } from './solver';
import type { Card, DrawMode, GameState, PileRef, Suit } from './types';

const card = (suit: Suit, rank: number, up = true): Card => ({ id: `${'SHDC'[suit]}${rank}`, suit, rank, up });

/** Plays a solver move list through the real engine, so a "winnable" verdict is checked end to end. */
function replay(g: GameState, path: SolverMove[]): GameState {
  const home = (s: GameState, from: Parameters<typeof canMove>[1]): PileRef => {
    for (let f = 0; f < 4; f++) if (canMove(s, from, { pile: 'foundation', idx: f })) return { pile: 'foundation', idx: f };
    throw new Error('no foundation accepts this card');
  };
  for (const m of path) {
    if (m.k === 'tf') {
      const from = { pile: 'tableau' as const, idx: m.col, i: g.tableau[m.col].length - 1 };
      g = move(g, from, home(g, from));
    } else if (m.k === 'tt') {
      const from = { pile: 'tableau' as const, idx: m.from, i: m.i };
      expect(canMove(g, from, { pile: 'tableau', idx: m.to })).toBe(true);
      g = move(g, from, { pile: 'tableau', idx: m.to });
    } else {
      const len = g.stock.length + g.waste.length;
      for (let n = drawsBetween(len, g.waste.length, m.q, g.draw); n > 0; n--) g = draw(g)!;
      const from = { pile: 'waste' as const, idx: 0, i: g.waste.length - 1 };
      const to: PileRef = m.k === 'wf' ? home(g, from) : { pile: 'tableau', idx: m.to };
      expect(canMove(g, from, to)).toBe(true);
      g = move(g, from, to);
    }
  }
  return g;
}

describe('talon reachability', () => {
  it('reaches every card when drawing one', () => {
    expect(reachable(4, 0, 1)).toEqual([1, 2, 3, 4]);
  });
  it('reaches every third card, plus the short last draw, when drawing three', () => {
    expect(reachable(7, 0, 3).sort()).toEqual([3, 6, 7]);
    expect(reachable(7, 1, 3).sort()).toEqual([1, 3, 4, 6, 7]);
  });
});

describe('solveKlondike', () => {
  it('proves a deadlocked table unwinnable', () => {
    const g = newDeal({ variant: 'klondike', draw: 1, suits: 4, dealId: 0, seed: 1 });
    g.stock = [];
    g.waste = [];
    g.foundations = [
      Array.from({ length: 13 }, (_, i) => card(3, i + 1)),
      Array.from({ length: 13 }, (_, i) => card(2, i + 1)),
      [], [],
    ];
    // Each two needs the ace buried under the other two; kings only go to empty columns.
    const downRun = (s: Suit) => Array.from({ length: 11 }, (_, i) => card(s, 13 - i, false));
    g.tableau = [
      [...downRun(0), card(1, 1, false), card(0, 2)],
      [...downRun(1), card(0, 1, false), card(1, 2)],
      [], [], [], [], [],
    ];
    expect(solveKlondike(g).result).toBe('lose');
  });

  it.each([1, 3] as DrawMode[])('finds wins that replay through the engine (draw %i)', (drawMode) => {
    let wins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const g = newDeal({ variant: 'klondike', draw: drawMode, suits: 4, dealId: 0, seed });
      const r = solveKlondike(g, { shortcut: false, budget: 60000 });
      if (r.result !== 'win') continue;
      wins++;
      expect(replay(g, r.path).won).toBe(true);
    }
    expect(wins).toBeGreaterThan(3);
  }, 60000);
});
