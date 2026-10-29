import { exposed as pyramidExposed, MAX_PASSES, pidx, ROWS } from './rules/pyramid';
import { solveKlondike, type SolveOptions } from './solver';
import type { GameState, Loc, PileRef } from './types';

/**
 * Solvers for FreeCell, Spider and Pyramid. Each searches its own compact model of the
 * game but records plain engine actions, so a solution can be replayed move for move
 * through the real rules (the unit tests do exactly that). Every search has a node
 * budget: running out means "unknown", never a false "winnable".
 */

export type Action = { kind: 'move'; from: Loc; to: PileRef } | { kind: 'draw' };

export interface Solution {
  result: 'win' | 'lose' | 'unknown';
  nodes: number;
  actions: Action[];
}

const suitOf = (c: number) => (c / 13) | 0;
const rankOf = (c: number) => (c % 13) + 1;
const redSuit = (s: number) => s === 1 || s === 2;
const toInt = (c: { suit: number; rank: number }) => c.suit * 13 + c.rank - 1;
const chars = (a: number[]) => String.fromCharCode(...a.map((c) => c + 48));

const tab = (idx: number, i: number): Loc => ({ pile: 'tableau', idx, i });
const mv = (from: Loc, to: PileRef): Action => ({ kind: 'move', from, to });

/** Minimal binary heap keyed by priority (lower first). */
class Heap<T> {
  private items: { p: number; v: T }[] = [];
  get size() { return this.items.length; }
  push(p: number, v: T) {
    const a = this.items;
    a.push({ p, v });
    for (let i = a.length - 1; i > 0;) {
      const j = (i - 1) >> 1;
      if (a[j].p <= a[i].p) break;
      [a[i], a[j]] = [a[j], a[i]];
      i = j;
    }
  }
  pop(): T | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const out = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].p < a[m].p) m = l;
        if (r < a.length && a[r].p < a[m].p) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return out;
  }
}

interface SearchNode<S> { s: S; parent: SearchNode<S> | null; acts: Action[] }

function unwind<S>(n: SearchNode<S>): Action[] {
  const out: Action[][] = [];
  for (let x: SearchNode<S> | null = n; x; x = x.parent) out.push(x.acts);
  return out.reverse().flat();
}

/** Greedy best-first search, shared by FreeCell and Spider. */
function bestFirst<S>(
  start: S,
  budget: number,
  h: (s: S) => number,
  key: (s: S) => string,
  won: (s: S) => boolean,
  expand: (s: S) => { s: S; acts: Action[] }[],
): Solution {
  const seen = new Set<string>([key(start)]);
  const heap = new Heap<SearchNode<S>>();
  heap.push(h(start), { s: start, parent: null, acts: [] });
  let nodes = 0;
  for (let n = heap.pop(); n; n = heap.pop()) {
    if (won(n.s)) return { result: 'win', nodes, actions: unwind(n) };
    if (++nodes > budget) return { result: 'unknown', nodes, actions: [] };
    for (const next of expand(n.s)) {
      const k = key(next.s);
      if (seen.has(k)) continue;
      seen.add(k);
      heap.push(h(next.s), { s: next.s, parent: n, acts: next.acts });
    }
  }
  return { result: 'lose', nodes, actions: [] };
}

// ---------- FreeCell ----------

interface FC {
  cols: number[][];
  cells: number[]; // -1 when free
  found: number[]; // top rank per suit
  slot: number[]; // which engine foundation pile each suit lives on (-1 until its ace lands)
}

const fcFits = (c: number, t: number) => rankOf(t) === rankOf(c) + 1 && redSuit(suitOf(t)) !== redSuit(suitOf(c));

function fcHome(s: FC, c: number, acts: Action[], from: Loc): FC {
  const n: FC = { cols: s.cols, cells: s.cells, found: s.found.slice(), slot: s.slot };
  const suit = suitOf(c);
  if (n.slot[suit] < 0) {
    n.slot = s.slot.slice();
    n.slot[suit] = [0, 1, 2, 3].find((f) => !n.slot.includes(f))!;
  }
  n.found[suit]++;
  acts.push(mv(from, { pile: 'foundation', idx: n.slot[suit] }));
  return n;
}

/** Cards nothing could ever need again go home straight away. */
function fcAuto(s: FC, acts: Action[]): FC {
  const safe = (c: number) => {
    const r = rankOf(c);
    if (s.found[suitOf(c)] !== r - 1) return false;
    if (r <= 2) return true;
    const red = redSuit(suitOf(c));
    return s.found.every((f, suit) => redSuit(suit) === red || f >= r - 1);
  };
  for (let again = true; again;) {
    again = false;
    for (let t = 0; t < s.cols.length; t++) {
      const col = s.cols[t];
      const c = col[col.length - 1];
      if (col.length && safe(c)) {
        const from = tab(t, col.length - 1);
        s = fcHome(s, c, acts, from);
        s.cols = s.cols.slice();
        s.cols[t] = col.slice(0, -1);
        again = true;
      }
    }
    for (let k = 0; k < 4; k++) {
      const c = s.cells[k];
      if (c >= 0 && safe(c)) {
        s = fcHome(s, c, acts, { pile: 'cell', idx: k, i: 0 });
        s.cells = s.cells.slice();
        s.cells[k] = -1;
        again = true;
      }
    }
  }
  return s;
}

function fcExpand(s: FC): { s: FC; acts: Action[] }[] {
  const out: { s: FC; acts: Action[] }[] = [];
  const emit = (next: FC, act: Action) => {
    const acts = [act];
    out.push({ s: fcAuto(next, acts), acts });
  };
  const freeCell = s.cells.indexOf(-1);
  const emptyCol = s.cols.findIndex((c) => !c.length);
  const withCol = (t: number, col: number[]) => { const cols = s.cols.slice(); cols[t] = col; return cols; };

  // From a cell.
  s.cells.forEach((c, k) => {
    if (c < 0) return;
    const from: Loc = { pile: 'cell', idx: k, i: 0 };
    const cells = s.cells.slice();
    cells[k] = -1;
    if (s.found[suitOf(c)] === rankOf(c) - 1) {
      const acts: Action[] = [];
      const n = fcHome({ ...s, cells }, c, acts, from);
      out.push({ s: fcAuto(n, acts), acts });
    }
    s.cols.forEach((col, t) => {
      if (col.length ? fcFits(c, col[col.length - 1]) : t === emptyCol) {
        emit({ ...s, cells, cols: withCol(t, [...col, c]) }, mv(from, { pile: 'tableau', idx: t }));
      }
    });
  });

  // From a column top.
  s.cols.forEach((col, f) => {
    if (!col.length) return;
    const c = col[col.length - 1];
    const from = tab(f, col.length - 1);
    const rest = col.slice(0, -1);
    const settled = rest.length > 0 && fcFits(c, rest[rest.length - 1]);
    if (s.found[suitOf(c)] === rankOf(c) - 1) {
      const acts: Action[] = [];
      const n = fcHome({ ...s, cols: withCol(f, rest) }, c, acts, from);
      out.push({ s: fcAuto(n, acts), acts });
    }
    if (!settled) {
      s.cols.forEach((dest, t) => {
        if (t === f) return;
        if (dest.length ? fcFits(c, dest[dest.length - 1]) : t === emptyCol && rest.length > 0) {
          const cols = withCol(f, rest);
          cols[t] = [...dest, c];
          emit({ ...s, cols }, mv(from, { pile: 'tableau', idx: t }));
        }
      });
    }
    if (freeCell >= 0) {
      const cells = s.cells.slice();
      cells[freeCell] = c;
      emit({ ...s, cells, cols: withCol(f, rest) }, mv(from, { pile: 'cell', idx: freeCell }));
    }
  });
  return out;
}

function fcScore(s: FC) {
  const home = s.found.reduce((a, b) => a + b, 0);
  let blocked = 0;
  let empty = 0;
  for (const col of s.cols) {
    if (!col.length) empty++;
    let min = 99;
    for (const c of col) {
      if (rankOf(c) > min) blocked++;
      min = Math.min(min, rankOf(c));
    }
  }
  const used = s.cells.filter((c) => c >= 0).length;
  return 4 * (52 - home) + 3 * blocked + used - 2 * empty;
}

export function solveFreecell(g: GameState, opts: SolveOptions = {}): Solution {
  const slot = [-1, -1, -1, -1];
  const found = [0, 0, 0, 0];
  g.foundations.forEach((p, f) => {
    const t = p[p.length - 1];
    if (t) { slot[t.suit] = f; found[t.suit] = t.rank; }
  });
  const acts: Action[] = [];
  const start = fcAuto({ cols: g.tableau.map((c) => c.map(toInt)), cells: g.cells.map((c) => (c[0] ? toInt(c[0]) : -1)), found, slot }, acts);
  const r = bestFirst(
    start,
    opts.budget ?? 200000,
    fcScore,
    (s) => `${s.found.join('')}|${chars(s.cells.filter((c) => c >= 0).sort())}|${s.cols.map(chars).sort().join(',')}`,
    (s) => s.found.every((f) => f === 13),
    fcExpand,
  );
  return r.result === 'win' ? { ...r, actions: [...acts, ...r.actions] } : r;
}

// ---------- Spider ----------

interface SP {
  cols: number[][];
  down: number[];
  stock: number[]; // dealt from the end, one card per column
  home: number;
}

const spRun = (c: number, below: number) => rankOf(below) === rankOf(c) + 1 && suitOf(below) === suitOf(c);

/** Lifts finished King→Ace runs off the columns, as the engine does after every move. */
function spCollect(s: SP): SP {
  for (let t = 0; t < s.cols.length; t++) {
    const col = s.cols[t];
    if (col.length - s.down[t] < 13) continue;
    const start = col.length - 13;
    if (rankOf(col[start]) !== 13) continue;
    let ok = true;
    for (let i = start + 1; i < col.length && ok; i++) ok = spRun(col[i], col[i - 1]);
    if (!ok) continue;
    s = { ...s, cols: s.cols.slice(), down: s.down.slice(), home: s.home + 1 };
    s.cols[t] = col.slice(0, start);
    if (s.down[t] > 0 && s.cols[t].length === s.down[t]) s.down[t]--;
  }
  return s;
}

/** Where the movable same-suit run at the top of a column starts. */
function spRunStart(col: number[], down: number) {
  let i = col.length - 1;
  while (i > down && spRun(col[i], col[i - 1])) i--;
  return i;
}

function spExpand(s: SP): { s: SP; acts: Action[] }[] {
  const out: { s: SP; acts: Action[] }[] = [];
  const emptyCol = s.cols.findIndex((c) => !c.length);
  s.cols.forEach((col, f) => {
    if (col.length <= s.down[f]) return;
    const i = spRunStart(col, s.down[f]);
    const c = col[i];
    const base = i > 0 ? col[i - 1] : -1;
    const baseUp = i > s.down[f];
    const natural = baseUp && rankOf(base) === rankOf(c) + 1; // already sitting somewhere legal
    s.cols.forEach((dest, t) => {
      if (t === f) return;
      const top = dest[dest.length - 1];
      if (dest.length) {
        if (rankOf(top) !== rankOf(c) + 1) return;
        if (natural && suitOf(top) !== suitOf(c)) return; // a sideways move gains nothing
      } else {
        if (t !== emptyCol || i === 0 || natural) return;
      }
      const cols = s.cols.slice();
      const down = s.down.slice();
      cols[f] = col.slice(0, i);
      cols[t] = [...dest, ...col.slice(i)];
      if (down[f] > 0 && cols[f].length === down[f]) down[f]--;
      out.push({ s: spCollect({ ...s, cols, down }), acts: [mv(tab(f, i), { pile: 'tableau', idx: t })] });
    });
  });
  if (s.stock.length && emptyCol < 0) {
    const stock = s.stock.slice();
    const cols = s.cols.map((c) => [...c, stock.pop()!]);
    out.push({ s: spCollect({ ...s, cols, stock }), acts: [{ kind: 'draw' }] });
  }
  return out;
}

const SPIDER_WEIGHTS = { home: 200, down: 4, breaks: 10, empty: 6, stock: 3 };

function spScore(s: SP) {
  const w = SPIDER_WEIGHTS;
  let breaks = 0;
  let down = 0;
  let empty = 0;
  s.cols.forEach((col, t) => {
    down += s.down[t];
    if (!col.length) empty++;
    for (let i = s.down[t] + 1; i < col.length; i++) if (!spRun(col[i], col[i - 1])) breaks++;
  });
  return w.home * (8 - s.home) + w.down * down + w.breaks * breaks - w.empty * empty + w.stock * s.stock.length;
}

export function solveSpider(g: GameState, opts: SolveOptions = {}): Solution {
  const home = g.foundations.filter((f) => f.length).length;
  const start: SP = {
    cols: g.tableau.map((c) => c.map(toInt)),
    down: g.tableau.map((c) => c.filter((x) => !x.up).length),
    stock: g.stock.map(toInt),
    home,
  };
  return bestFirst(
    start,
    opts.budget ?? 150000,
    spScore,
    (s) => `${s.home}|${s.stock.length}|${s.cols.map((c, t) => `${s.down[t]}${chars(c)}`).sort().join(',')}`,
    (s) => s.home === 8,
    spExpand,
  );
}

// ---------- Pyramid ----------

export function solvePyramid(g: GameState, opts: SolveOptions = {}): Solution {
  const budget = opts.budget ?? 200000;
  const ranks = g.tableau.map((p) => (p[0] ? p[0].rank : 0));
  const full = (1 << pidx(ROWS, 0)) - 1;
  let mask = 0;
  ranks.forEach((r, i) => { if (!r) mask |= 1 << i; });

  const isExposed = (m: number, i: number) => {
    if (m & (1 << i)) return false;
    const r = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
    if (r === ROWS - 1) return true;
    const c = i - pidx(r, 0);
    return !!(m & (1 << pidx(r + 1, c))) && !!(m & (1 << pidx(r + 1, c + 1)));
  };
  // Sanity: the closed form above agrees with the rules' own check.
  if (!g.tableau.every((_, i) => isExposed(mask, i) === pyramidExposed(g, i))) throw new Error('pyramid geometry mismatch');

  const visited = new Set<string>();
  const path: Action[] = [];
  let nodes = 0;
  class OutOfBudget extends Error {}

  const dfs = (m: number, talon: number[], p: number, passes: number): boolean => {
    if (m === full) return true;
    if (++nodes > budget) throw new OutOfBudget();
    const k = `${m}|${p}|${passes}|${chars(talon)}`;
    if (visited.has(k)) return false;
    visited.add(k);
    const free: number[] = [];
    for (let i = 0; i < ranks.length; i++) if (isExposed(m, i)) free.push(i);
    const wasteTop = p > 0 ? talon[p - 1] : 0;
    const wasteLoc: Loc = { pile: 'waste', idx: 0, i: p - 1 };
    const dropWaste = () => talon.slice(0, p - 1).concat(talon.slice(p));
    const tryMove = (act: Action, ...next: Parameters<typeof dfs>) => {
      path.push(act);
      if (dfs(...next)) return true;
      path.pop();
      return false;
    };

    // Kings leave alone and never pair, so taking them is always right.
    const king = free.find((i) => ranks[i] === 13);
    if (king !== undefined) return tryMove(mv(tab(king, 0), { pile: 'foundation', idx: 0 }), m | (1 << king), talon, p, passes);
    if (wasteTop === 13) return tryMove(mv(wasteLoc, { pile: 'foundation', idx: 0 }), m, dropWaste(), p - 1, passes);

    // Pairs inside the pyramid, deepest rows first (they uncover the most).
    for (let a = free.length - 1; a >= 0; a--) {
      for (let b = a - 1; b >= 0; b--) {
        if (ranks[free[a]] + ranks[free[b]] !== 13) continue;
        if (tryMove(mv(tab(free[a], 0), { pile: 'tableau', idx: free[b] }), m | (1 << free[a]) | (1 << free[b]), talon, p, passes)) return true;
      }
    }
    if (wasteTop) {
      for (let a = free.length - 1; a >= 0; a--) {
        if (ranks[free[a]] + wasteTop !== 13) continue;
        if (tryMove(mv(wasteLoc, { pile: 'tableau', idx: free[a] }), m | (1 << free[a]), dropWaste(), p - 1, passes)) return true;
      }
    }
    if (p < talon.length) return tryMove({ kind: 'draw' }, m, talon, p + 1, passes);
    if (talon.length && passes < MAX_PASSES) return tryMove({ kind: 'draw' }, m, talon, 0, passes + 1);
    return false;
  };

  const talon = [...g.waste.map((c) => c.rank), ...[...g.stock].reverse().map((c) => c.rank)];
  try {
    const won = dfs(mask, talon, g.waste.length, g.passes);
    return { result: won ? 'win' : 'lose', nodes, actions: won ? path : [] };
  } catch (e) {
    if (e instanceof OutOfBudget) return { result: 'unknown', nodes, actions: [] };
    throw e;
  }
}

/**
 * Which deals the solvers can vouch for. Four-suit Spider is beyond what a background
 * search can prove in reasonable time, so those deals are dealt unchecked.
 */
export const checkable = (g: Pick<GameState, 'variant' | 'suits'>) => !(g.variant === 'spider' && g.suits === 4);

/** One entry point for "can this deal be won?". */
export function provablyWinnable(g: GameState, budget?: number): boolean {
  switch (g.variant) {
    case 'klondike': return solveKlondike(g, { budget }).result === 'win';
    case 'freecell': return solveFreecell(g, { budget }).result === 'win';
    case 'spider': return checkable(g) && solveSpider(g, { budget }).result === 'win';
    case 'pyramid': return solvePyramid(g, { budget }).result === 'win';
  }
}
