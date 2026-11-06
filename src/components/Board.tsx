import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { allCards, autoTarget, canMove, canPick, idsFor, locate, pileOf } from '../game/engine';
import { computeLayout, computeTargets, landingY, rosette, type Layout, type Point, type Target } from '../game/layout';
import type { Card, CardBackId, GameState, Hint, Loc, PileRef } from '../game/types';
import {
  CardHandle, DEAL_SPRING, DEAL_STAGGER, HandFeel, MOVE_SPRING, REDUCED_MOTION, WIN_SPRING,
} from './cardMotion';
import type { Spring } from './spring';
import { PlayingCard } from './PlayingCard';
import { RecycleIcon } from './Icons';
import { sound } from '../audio/sound';
import { haptics } from '../audio/haptics';

interface Props {
  game: GameState;
  /** Changes whenever a fresh deal should be animated out of the stock. */
  dealSignal: number;
  hint: Hint | null;
  locked: boolean;
  cardBack: CardBackId;
  onMove: (from: Loc, to: PileRef) => void;
  onDraw: () => void;
}

interface Press {
  pointerId: number;
  x: number;
  y: number;
  action: 'draw' | 'card';
  loc: Loc | null;
  dragging: boolean;
  ids: string[];
  base: Point[];
  dx: number;
  dy: number;
  raw: Point; // where the lead card would be without the magnetic pull
  want: Point; // the pull the nearest legal spot is asking for
  pull: Point;
}

const DRAG_THRESHOLD = 5;
const MAGNET = REDUCED_MOTION ? 0 : 0.42;
const pileKey = (p: PileRef) => `${p.pile}:${p.idx}`;

interface Rect { x: number; y: number; w: number; h: number }
function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const Board = memo(function Board({ game, dealSignal, hint, locked, cardBack, onMove, onDraw }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropKey, setDropKey] = useState<string | null>(null);

  // One set of motion values per card; Spider's two decks need their own set.
  const deckKey = `${game.variant}:${game.suits}`;
  const ids = useMemo(() => idsFor(game), [deckKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const handles = useMemo(() => new Map<string, CardHandle>(ids.map((id) => [id, new CardHandle()])), [ids]);
  const press = useRef<Press | null>(null);
  const placed = useRef(false);
  const lastLayout = useRef<Layout | null>(null);
  const lastHandles = useRef(handles);
  const lastTargets = useRef<Map<string, Target> | null>(null);
  const lastDeal = useRef(0);
  const dealingUntil = useRef(0);
  const celebrated = useRef(false);
  const winTimer = useRef(0);

  useLayoutEffect(() => {
    const el = boardRef.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(winTimer.current), []);

  const L = useMemo(() => computeLayout(size.w, size.h, game.variant), [size.w, size.h, game.variant]);
  const targets = useMemo(() => (L ? computeTargets(game, L) : null), [game, L]);
  const cards = useMemo(() => new Map<string, Card>(allCards(game).map((c) => [c.id, c])), [game]);

  // ---------- Imperative animation ----------

  const panAt = (x: number) =>
    L ? Math.max(-1, Math.min(1, ((x + L.cw / 2) / L.w) * 2 - 1)) * 0.55 : 0;

  const fly = (h: CardHandle, x: number, y: number, z: number, delay = 0, spring: Spring = MOVE_SPRING, land = true) => {
    h.fly(x, y, {
      z, delay, spring,
      // Play the placement the moment the card arrives rather than when the spring fully rests.
      onArrive: land ? () => {
        sound.play('place', { pan: panAt(x) });
        haptics.play('land');
      } : undefined,
    });
  };

  const turn = (h: CardHandle, up: boolean, delay = 0, quiet = false) => {
    if (h.turn(up, delay) && !quiet) sound.play('flip', { delay, pan: panAt(h.x) });
  };

  const runDeal = (L: Layout, targets: Map<string, Target>) => {
    for (const h of handles.values()) h.snap(L.deck.x, L.deck.y, 1, false);
    const dealt = new Set<string>();
    const total = game.tableau.reduce((n, c) => n + c.length, 0);
    const stagger = Math.min(DEAL_STAGGER, 1.7 / Math.max(total, 1)); // Spider's 54 cards still deal briskly
    // Each sound builds its audio nodes now, however far off it plays, and a big deal
    // would build over a hundred at once. Past a point more of them can't be told apart.
    const dealSoundEvery = stagger < 0.04 ? 2 : 1;
    const quietFlips = total > 28;
    let n = 0;
    const rows = Math.max(...game.tableau.map((c) => c.length));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < game.tableau.length; col++) {
        const c = game.tableau[col][row];
        if (!c) continue;
        const t = targets.get(c.id)!;
        const h = handles.get(c.id)!;
        const delay = n * stagger;
        h.targetZ = t.z;
        fly(h, t.x, t.y, 1000 + n, delay, DEAL_SPRING, false);
        if (n % dealSoundEvery === 0) sound.play('deal', { delay, pan: panAt(t.x) });
        if (t.up) turn(h, true, delay + 0.24, quietFlips);
        dealt.add(c.id);
        n++;
      }
    }
    for (const [id, t] of targets) {
      if (dealt.has(id)) continue;
      const h = handles.get(id)!;
      h.snap(t.x, t.y, t.z, t.up);
    }
    dealingUntil.current = performance.now() + (n * stagger + 0.55) * 1000;
  };

  /** The win flourish: every card spirals out of the foundations into a rosette. */
  const celebrate = (L: Layout, instant = false) => {
    const spots = rosette(game, L);
    const stagger = Math.min(0.035, 1.5 / Math.max(spots.length, 1));
    for (const s of spots) {
      const h = handles.get(s.id)!;
      h.targetZ = s.z;
      if (instant) {
        h.snap(s.x, s.y, s.z, true, s.spin);
        continue;
      }
      const delay = s.order * stagger;
      // No flattening a finished rosette: it would cost a big repaint just as the confetti
      // is falling, for a table that won't move again until the next deal.
      h.fly(s.x, s.y, { z: s.z, delay, spring: WIN_SPRING, spin: s.spin, stayLifted: true });
      if (s.order % 4 === 0) sound.play('deal', { delay, pan: panAt(s.x) });
    }
  };

  useLayoutEffect(() => {
    if (!L || !targets) return;
    const resized = lastLayout.current !== L || lastHandles.current !== handles;
    // A new deck can reuse the same elements, so the old one's animations must go first.
    if (lastHandles.current !== handles) for (const h of lastHandles.current.values()) h.halt();
    const prev = lastTargets.current;
    lastLayout.current = L;
    lastHandles.current = handles;
    lastTargets.current = targets;

    if (dealSignal !== lastDeal.current) {
      lastDeal.current = dealSignal;
      clearTimeout(winTimer.current);
      celebrated.current = false;
      runDeal(L, targets);
      placed.current = true;
      return;
    }

    if (game.won && celebrated.current) {
      if (resized) celebrate(L, true);
      return;
    }

    const dragging = press.current?.dragging ? new Set(press.current.ids) : null;
    for (const [id, t] of targets) {
      const h = handles.get(id)!;
      h.targetZ = t.z;
      if (dragging?.has(id)) continue;
      if (!placed.current || resized) {
        h.snap(t.x, t.y, t.z, t.up);
        continue;
      }
      const heading = h.flight && h.x === t.x && h.y === t.y;
      const now = h.now();
      const away = now.scale !== 1 || Math.abs(now.x - t.x) > 0.5 || Math.abs(now.y - t.y) > 0.5;
      const from = prev?.get(id)?.pile ?? '';
      if (!heading && away) {
        if (from === 'stock' && t.pile.startsWith('tableau')) {
          // Spider deals a row: one card to each column, left to right.
          const delay = Number(t.pile.split(':')[1]) * 0.05;
          fly(h, t.x, t.y, 1000 + t.z, delay, DEAL_SPRING, false);
          sound.play('deal', { delay, pan: panAt(t.x) });
          turn(h, t.up, delay + 0.12);
          continue;
        }
        if (game.variant === 'spider' && from.startsWith('tableau') && t.pile.startsWith('foundation')) {
          // A finished suit peels off the column one card at a time, ace first.
          fly(h, t.x, t.y, 1000 + t.z, (t.z - 1) * 0.035, MOVE_SPRING, t.z === 13);
          continue;
        }
        fly(h, t.x, t.y, 1000 + t.z);
      } else if (!h.flight) h.setZ(t.z);
      turn(h, t.up, away ? 0.05 : 0);
    }
    placed.current = true;

    if (game.won && !celebrated.current) {
      celebrated.current = true;
      winTimer.current = window.setTimeout(() => celebrate(lastLayout.current ?? L), REDUCED_MOTION ? 200 : 650);
    }
  }, [targets, handles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Pointer input ----------

  const inputBlocked = () => locked || game.won || performance.now() < dealingUntil.current;

  /** Every legal destination for the pressed cards, with the rectangle that accepts a drop. */
  const dropZones = (loc: Loc) => {
    const zones: { to: PileRef; rect: Rect; land: Point }[] = [];
    if (!L || !targets) return zones;
    const slot = (p: Point): Rect => ({ x: p.x, y: p.y, w: L.cw, h: L.ch });
    const add = (to: PileRef, rect: Rect, land: Point) => {
      if (canMove(game, loc, to)) zones.push({ to, rect, land });
    };
    L.found.forEach((f, idx) => add({ pile: 'foundation', idx }, slot(f), f));
    L.cells.forEach((c, idx) => add({ pile: 'cell', idx }, slot(c), c));
    if (game.variant === 'pyramid') {
      // Pairs: drop onto the partner card itself, in the pyramid or on the waste.
      L.tab.forEach((t, idx) => add({ pile: 'tableau', idx }, slot(t), t));
      const w = game.waste.length ? targets.get(game.waste[game.waste.length - 1].id) : null;
      if (w) add({ pile: 'waste', idx: 0 }, slot(w), w);
      return zones;
    }
    L.tab.forEach((t, idx) => {
      const col = game.tableau[idx];
      const bottom = col.length ? targets.get(col[col.length - 1].id)!.y : t.y;
      add(
        { pile: 'tableau', idx },
        { x: t.x - L.gap / 2, y: t.y, w: L.cw + L.gap, h: bottom - t.y + L.ch * 1.3 },
        { x: t.x, y: landingY(col, L, idx, targets) },
      );
    });
    return zones;
  };

  const findDrop = (p: Press) => {
    if (!L || !p.loc) return null;
    const r = { x: p.raw.x, y: p.raw.y, w: L.cw, h: L.ch };
    let best: { to: PileRef; land: Point } | null = null;
    let bestArea = 0;
    for (const z of dropZones(p.loc)) {
      const a = overlap(r, z.rect);
      if (a > bestArea) { bestArea = a; best = z; }
    }
    return best;
  };

  const shake = (ids: string[]) => {
    sound.play('nope', { pan: panAt(handles.get(ids[0])!.x) });
    haptics.play('nope');
    for (const id of ids) handles.get(id)!.shake();
  };

  const returnHome = (ids: string[]) => {
    for (const id of ids) {
      const t = targets?.get(id);
      if (t) fly(handles.get(id)!, t.x, t.y, 1000 + t.z);
    }
  };

  const endDrag = () => {
    setDragIds([]);
    setDropKey(null);
  };

  /** Held cards are the one thing still moved by script: they have to follow the pointer. */
  const followPointer = (p: Press, feel: HandFeel) => {
    let last = performance.now();
    const frame = (time: number) => {
      if (press.current !== p) return;
      const dt = Math.min(0.05, Math.max(0.001, (time - last) / 1000));
      last = time;
      const k = 1 - Math.pow(0.55, dt * 60);
      p.pull.x += (p.want.x - p.pull.x) * k;
      p.pull.y += (p.want.y - p.pull.y) * k;
      feel.step(p.raw.x + p.pull.x, p.raw.y + p.pull.y, dt);
      p.ids.forEach((id, i) => {
        handles.get(id)!.pose(p.base[i].x + p.dx + p.pull.x, p.base[i].y + p.dy + p.pull.y, feel);
      });
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (press.current || inputBlocked()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = e.target as Element;
    const cardEl = el.closest<HTMLElement>('[data-card]');
    let action: Press['action'] | null = null;
    let loc: Loc | null = null;

    if (cardEl) {
      loc = locate(game, cardEl.dataset.card!);
      if (!loc) return;
      if (loc.pile === 'stock') action = 'draw';
      else if (canPick(game, loc)) action = 'card';
      else if (pileOf(game, loc)[loc.i]?.up) {
        // Visible but not movable as a group (e.g. a broken run): explain with a shake.
        shake(pileOf(game, loc).slice(loc.i).map((c) => c.id));
        return;
      }
    } else if (el.closest('[data-slot="stock"]')) {
      action = 'draw';
    }
    if (!action) return;

    press.current = {
      pointerId: e.pointerId, x: e.clientX, y: e.clientY, action, loc, dragging: false, ids: [], base: [],
      dx: 0, dy: 0, raw: { x: 0, y: 0 }, want: { x: 0, y: 0 }, pull: { x: 0, y: 0 },
    };
    try { boardRef.current!.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;

    if (!p.dragging) {
      if (p.action !== 'card' || !p.loc || Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      p.dragging = true;
      p.ids = pileOf(game, p.loc).slice(p.loc.i).map((c) => c.id);
      // Grab from where the cards are right now, even mid-flight.
      const poses = p.ids.map((id, k) => handles.get(id)!.grab(5000 + k));
      p.base = poses.map((pose) => ({ x: pose.x - dx, y: pose.y - dy }));
      followPointer(p, new HandFeel(poses[0]));
      setDragIds(p.ids);
      sound.play('pick', { pan: panAt(p.base[0].x + dx) });
      haptics.play('pick');
    }

    p.dx = dx;
    p.dy = dy;
    p.raw = { x: p.base[0].x + dx, y: p.base[0].y + dy };
    const to = findDrop(p);

    // Magnetic drop: near a legal spot, the cards ease toward where they would land.
    let want = { x: 0, y: 0 };
    if (to && L && MAGNET) {
      const ox = to.land.x - p.raw.x;
      const oy = to.land.y - p.raw.y;
      const reach = L.cw * 1.3;
      const d = Math.hypot(ox, oy);
      if (d < reach) {
        const k = MAGNET * (1 - d / reach) ** 1.4;
        want = { x: ox * k, y: oy * k };
      }
    }
    p.want = want;
    setDropKey(to ? pileKey(to.to) : null);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || e.pointerId !== p.pointerId) return;
    press.current = null;
    try { boardRef.current!.releasePointerCapture(e.pointerId); } catch { /* already released */ }

    if (p.dragging) {
      const to = findDrop(p);
      endDrag();
      // The cards keep their release velocity: the spring picks up where the hand let go.
      if (to) onMove(p.loc!, to.to);
      else returnHome(p.ids);
      return;
    }

    if (p.action === 'draw') {
      onDraw();
    } else if (p.loc) {
      const to = autoTarget(game, p.loc);
      if (to) onMove(p.loc, to);
      else shake(pileOf(game, p.loc).slice(p.loc.i).map((c) => c.id));
    }
  };

  const onPointerCancel = () => {
    const p = press.current;
    press.current = null;
    if (p?.dragging) {
      endDrag();
      returnHome(p.ids);
    }
  };

  // ---------- Highlights ----------

  const hintIds = new Set<string>();
  const hintSlots = new Set<string>();
  if (hint?.kind === 'move') {
    pileOf(game, hint.from).slice(hint.from.i).forEach((c) => hintIds.add(c.id));
    const dest = pileOf(game, hint.to);
    if (dest.length) hintIds.add(dest[dest.length - 1].id);
    else hintSlots.add(pileKey(hint.to));
  } else if (hint?.kind === 'draw') {
    if (game.stock.length) hintIds.add(game.stock[game.stock.length - 1].id);
    else hintSlots.add('stock:0');
  }

  let dropCard: string | null = null;
  let dropSlot: string | null = null;
  if (dropKey) {
    const [pile, idx] = dropKey.split(':');
    const dest = pileOf(game, { pile: pile as PileRef['pile'], idx: Number(idx) });
    if (dest.length) dropCard = dest[dest.length - 1].id;
    else dropSlot = dropKey;
  }

  const dragSet = new Set(dragIds);
  const slotClass = (key: string, extra = '') =>
    `slot ${extra}${hintSlots.has(key) ? ' hint' : ''}${dropSlot === key ? ' target' : ''}`;
  const at = (p: Point): CSSProperties => ({ transform: `translate(${p.x}px, ${p.y}px)` });
  const klondike = game.variant === 'klondike';
  const pyramid = game.variant === 'pyramid';
  const recycles = (klondike || (pyramid && game.passes < 2)) && !game.stock.length && game.waste.length > 0;

  return (
    <div
      ref={boardRef}
      className={`board v-${game.variant}${L?.compact ? ' compact' : ''}`}
      data-back={cardBack}
      style={L ? ({ '--cw': `${L.cw}px`, '--ch': `${L.ch}px` } as CSSProperties) : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      role="application"
      aria-label={`${game.variant} solitaire table`}
    >
      {L && targets && (
        <>
          {L.stock && (
            <div
              data-slot="stock"
              className={slotClass('stock:0', `stock${recycles ? ' can-recycle' : ''}`)}
              style={at(L.stock)}
            >
              {(klondike || pyramid) && <RecycleIcon />}
            </div>
          )}
          {L.cells.map((p, i) => (
            <div key={`c${i}`} className={slotClass(`cell:${i}`, 'cell')} style={at(p)} />
          ))}
          {L.found.map((p, i) => (
            <div key={`f${i}`} className={slotClass(`foundation:${i}`, 'foundation')} style={at(p)}>
              {klondike || game.variant === 'freecell' ? 'A' : ''}
            </div>
          ))}
          {!pyramid && L.tab.map((p, i) => (
            <div key={`t${i}`} className={slotClass(`tableau:${i}`, 'tableau')} style={at(p)}>{klondike ? 'K' : ''}</div>
          ))}
          {ids.map((id) => {
            const t = targets.get(id);
            const card = cards.get(id);
            if (!t || !card) return null;
            return (
              <PlayingCard
                key={id}
                card={card}
                handle={handles.get(id)!}
                inStock={t.inStock}
                buried={t.buried}
                hinted={hintIds.has(id)}
                dragging={dragSet.has(id)}
                target={dropCard === id}
              />
            );
          })}
        </>
      )}
    </div>
  );
});
