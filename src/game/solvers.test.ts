import { describe, expect, it } from 'vitest';
import { canMove, draw, move, newDeal } from './engine';
import { solveFreecell, solvePyramid, solveSpider, type Action } from './solvers';
import type { Card, GameState, SpiderSuits, Suit, VariantId } from './types';

const card = (suit: Suit, rank: number, up = true): Card => ({ id: `${'SHDC'[suit]}${rank}`, suit, rank, up });

/** Plays a solution through the real rules, checking every step is legal. */
function replay(g: GameState, actions: Action[]): GameState {
  for (const a of actions) {
    if (a.kind === 'draw') {
      const n = draw(g);
      expect(n).not.toBeNull();
      g = n!;
    } else {
      expect(canMove(g, a.from, a.to)).toBe(true);
      g = move(g, a.from, a.to);
    }
  }
  return g;
}

const deal = (variant: VariantId, seed: number, suits: SpiderSuits = 4) =>
  newDeal({ variant, draw: 1, suits, dealId: 0, seed });

describe('FreeCell solver', () => {
  it('solves deals, and the solutions replay to a win', () => {
    let wins = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const g = deal('freecell', seed);
      const r = solveFreecell(g);
      if (r.result !== 'win') continue;
      wins++;
      expect(replay(g, r.actions).won).toBe(true);
    }
    expect(wins).toBeGreaterThanOrEqual(6);
  }, 60000);
});

describe('Spider solver', () => {
  it('solves one-suit deals, and the solutions replay to a win', () => {
    let wins = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const g = deal('spider', seed, 1);
      const r = solveSpider(g);
      if (r.result !== 'win') continue;
      wins++;
      expect(replay(g, r.actions).won).toBe(true);
    }
    expect(wins).toBeGreaterThanOrEqual(3);
  }, 120000);
});

describe('Pyramid solver', () => {
  it('finds wins that replay through the engine', () => {
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = deal('pyramid', seed);
      const r = solvePyramid(g);
      if (r.result !== 'win') continue;
      wins++;
      expect(replay(g, r.actions).won).toBe(true);
    }
    expect(wins).toBeGreaterThan(0);
  }, 60000);

  it('proves a hopeless pyramid unwinnable', () => {
    const g = deal('pyramid', 1);
    // Three aces and one more in the stock: nothing adds up to 13, so nothing can ever be removed.
    g.tableau = g.tableau.map(() => []);
    g.tableau[0] = [card(0, 1)];
    g.tableau[1] = [card(1, 1)];
    g.tableau[2] = [card(2, 1)];
    g.stock = [card(3, 1, false)];
    expect(solvePyramid(g).result).toBe('lose');
  });
});
