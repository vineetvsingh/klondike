import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  autoStep, canAutoComplete, canMove, draw, drawBlocked, findHint, move, newDeal, variantLabel,
} from './game/engine';
import { dailyNumber, todayKey } from './game/daily';
import { dealer } from './game/dealer';
import { checkable } from './game/solvers';
import {
  CARD_BACKS, emptyProfile, loadProfile, recordLoss, recordStart, recordWin, totalPlayed, totalWins, type Profile,
} from './game/profile';
import { DEFAULT_SETTINGS, KEYS, loadSavedGame, read, remove, write } from './game/storage';
import type { DealOptions, GameState, Hint, Loc, PileRef, Settings } from './game/types';
import { Board } from './components/Board';
import { Confetti } from './components/Confetti';
import { SettingsDialog } from './components/SettingsDialog';
import { SwitchGameDialog } from './components/SwitchGameDialog';
import { sameGame, type GameChoice } from './components/GamePicker';
import { StatsDialog, type StatsTab } from './components/StatsDialog';
import { SuitSprite } from './components/SuitSprite';
import { TopBar } from './components/TopBar';
import { WinDialog, type WinSummary } from './components/WinDialog';
import { THEMES, THEME_COLOR } from './components/themes';
import { formatTime } from './components/format';
import { REDUCED_MOTION } from './components/cardMotion';
import { Toast, UndoSnackbar } from './kinetics/Feedback';
import { sound } from './audio/sound';
import { haptics } from './audio/haptics';

interface State {
  game: GameState;
  history: GameState[];
}

type Action =
  | { type: 'move'; from: Loc; to: PileRef }
  | { type: 'draw' }
  | { type: 'undo' }
  | { type: 'auto' }
  | { type: 'hinted' }
  | { type: 'set'; state: State };

const HISTORY_LIMIT = 300;
const UNDO_MS = 5000;

const push = (s: State, game: GameState): State => ({ game, history: [...s.history.slice(-HISTORY_LIMIT + 1), s.game] });

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'move':
      return canMove(s.game, a.from, a.to) ? push(s, move(s.game, a.from, a.to)) : s;
    case 'draw': {
      const g = draw(s.game);
      return g && !s.game.won ? push(s, g) : s;
    }
    case 'undo': {
      if (!s.history.length || s.game.won) return s;
      // Going back in time doesn't erase the fact that you did.
      const prev = s.history[s.history.length - 1];
      return { game: { ...prev, usedUndo: true, usedHint: prev.usedHint || s.game.usedHint }, history: s.history.slice(0, -1) };
    }
    case 'auto': {
      const step = autoStep(s.game);
      return step ? { ...s, game: move(s.game, step.from, step.to) } : s;
    }
    case 'hinted':
      return s.game.usedHint ? s : { ...s, game: { ...s.game, usedHint: true } };
    case 'set':
      return a.state;
  }
}

function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEYS.settings, {}) };
  const d = DEFAULT_SETTINGS;
  if (!['klondike', 'freecell', 'spider', 'pyramid'].includes(s.variant)) s.variant = d.variant;
  if (s.draw !== 1 && s.draw !== 3) s.draw = d.draw;
  if (s.suits !== 1 && s.suits !== 2 && s.suits !== 4) s.suits = d.suits;
  if (!THEMES.some((t) => t.name === s.theme)) s.theme = d.theme;
  if (!CARD_BACKS.some((b) => b.id === s.cardBack)) s.cardBack = d.cardBack;
  for (const k of ['sound', 'haptics', 'winnable'] as const) if (typeof s[k] !== 'boolean') s[k] = d[k];
  if (typeof s.volume !== 'number' || !(s.volume >= 0 && s.volume <= 1)) s.volume = d.volume;
  return s;
}

/** Keeps choices that a stats reset has locked again from lingering. */
function withinUnlocks(s: Settings, wins: number): Settings {
  const theme = THEMES.find((t) => t.name === s.theme)!.wins > wins ? DEFAULT_SETTINGS.theme : s.theme;
  const cardBack = CARD_BACKS.find((b) => b.id === s.cardBack)!.wins > wins ? DEFAULT_SETTINGS.cardBack : s.cardBack;
  return theme === s.theme && cardBack === s.cardBack ? s : { ...s, theme, cardBack };
}

const dealFrom = (s: Settings, extra: Partial<DealOptions> = {}): DealOptions => ({
  variant: s.variant, draw: s.draw, suits: s.suits, dealId: Date.now(), ...extra,
});

/** A proven-winnable seed when one is ready right now. */
function instantSeed(s: Settings): Partial<DealOptions> {
  if (!s.winnable) return {};
  const seed = dealer.takeNow(s);
  return seed == null ? {} : { seed, verified: true };
}

const testHaptics = () => haptics.play('win');

function modeName(g: GameState) {
  if (g.daily) return `Daily #${dailyNumber(g.daily)}`;
  if (g.variant === 'klondike') return `Klondike · Draw ${g.draw}`;
  if (g.variant === 'spider') return `Spider · ${g.suits} suit${g.suits > 1 ? 's' : ''}`;
  return variantLabel(g.variant);
}

export default function App() {
  const boot = useMemo(() => loadSavedGame(), []);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [{ game, history }, dispatch] = useReducer(reducer, undefined, () => ({
    game: boot?.game ?? newDeal(dealFrom(settings, instantSeed(settings))),
    history: [],
  }));
  const [elapsed, setElapsed] = useState(boot?.elapsed ?? 0);
  const [dealSignal, setDealSignal] = useState(boot ? 0 : 1);
  const [hint, setHint] = useState<Hint | null>(null);
  const [toast, setToast] = useState<{ msg: ReactNode; show: boolean }>({ msg: '', show: false });
  const [snack, setSnack] = useState({ open: false, run: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [switchTo, setSwitchTo] = useState<GameChoice | null>(null);
  const [stats, setStats] = useState<{ open: boolean; tab: StatsTab }>({ open: false, tab: 'stats' });
  const [win, setWin] = useState<WinSummary | null>(null);
  const [winOpen, setWinOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const today = todayKey();

  // Latest values for stable callbacks.
  const live = useRef({ game, history, elapsed, profile, settings });
  live.current = { game, history, elapsed, profile, settings };
  const undoSnapshot = useRef<{ state: State; elapsed: number; profile: Profile } | null>(null);
  const timers = useRef({ toast: 0, hint: 0, win: [] as number[] });
  const dealToken = useRef(0);

  const autoPlaying = canAutoComplete(game);

  // ---------- Persistence ----------

  useEffect(() => write(KEYS.settings, settings), [settings]);
  useEffect(() => write(KEYS.profile, profile), [profile]);
  useEffect(() => {
    if (game.won) remove(KEYS.game);
    else write(KEYS.game, { game, elapsed });
  }, [game, elapsed]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[settings.theme]);
  }, [settings.theme]);

  // Solve ahead in the background: the next winnable deal, and today's Daily Deal.
  useEffect(() => {
    if (settings.winnable) dealer.prefetch(settings);
  }, [settings.winnable, settings.variant, settings.draw, settings.suits]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setTimeout(() => void dealer.daily(todayKey()), 1200);
    return () => clearTimeout(t);
  }, []);

  // ---------- Sound & touch ----------

  useEffect(() => sound.configure(settings.sound, settings.volume), [settings.sound, settings.volume]);
  useEffect(() => haptics.configure(settings.haptics), [settings.haptics]);

  // Audio can only start from a user gesture; every press re-arms it (iOS suspends on backgrounding).
  useEffect(() => {
    const unlock = () => sound.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    return () => {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
  }, []);

  // Musical cues come from what changed in the game; card handling sounds live in the Board.
  const prevGame = useRef(game);
  useEffect(() => {
    const p = prevGame.current;
    prevGame.current = game;
    if (p === game || p.dealId !== game.dealId || game.moves < p.moves) return; // new deal, restore or undo
    game.foundations.forEach((pile, f) => {
      if (pile.length > p.foundations[f].length) {
        sound.play('chime', { rank: pile[pile.length - 1].rank, delay: 0.14 });
      }
    });
    if ((game.variant === 'klondike' || game.variant === 'pyramid') && !p.stock.length && game.stock.length) sound.play('recycle');
  }, [game]);

  // ---------- Feedback ----------

  const showToast = useCallback((msg: ReactNode, ms = 2600) => {
    clearTimeout(timers.current.toast);
    setToast({ msg, show: true });
    timers.current.toast = window.setTimeout(() => setToast((t) => ({ ...t, show: false })), ms);
  }, []);

  useEffect(() => {
    if (read(KEYS.tip, false)) return;
    const t = window.setTimeout(() => {
      write(KEYS.tip, true);
      showToast('Tip: tap a card to send it where it fits, or drag it.', 4200);
    }, 1800);
    return () => clearTimeout(t);
  }, [showToast]);

  // ---------- Clock ----------

  useEffect(() => {
    if (!game.started || game.won) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [game.started, game.won, game.dealId]);

  // ---------- Profile & celebration ----------

  const prev = useRef({ dealId: game.dealId, started: game.started, won: game.won });
  useEffect(() => {
    const p = prev.current;
    prev.current = { dealId: game.dealId, started: game.started, won: game.won };
    if (p.dealId !== game.dealId) return; // a different game was loaded, not played into

    if (!p.started && game.started) setProfile((pr) => recordStart(pr, game));

    if (!p.won && game.won) {
      const t = live.current.elapsed;
      const out = recordWin(live.current.profile, game, t);
      setProfile(out.profile);
      setWin({
        elapsed: t,
        moves: game.moves,
        score: game.score,
        bestTime: out.bestTime,
        bestScore: out.bestScore,
        won: totalWins(out.profile),
        played: totalPlayed(out.profile),
        daily: game.daily,
        achievements: out.achievements,
        unlocks: out.unlocks,
      });
      haptics.play('win');
      // Give the spiral its moment before the confetti and the summary.
      const [confettiAt, modalAt] = REDUCED_MOTION ? [300, 900] : [1500, 2500];
      timers.current.win = [
        window.setTimeout(() => {
          setBurst((b) => b + 1);
          sound.play('win');
        }, confettiAt),
        window.setTimeout(() => setWinOpen(true), modalAt),
      ];
    }
  }, [game]);

  // ---------- Auto-complete ----------

  const autoRunning = useRef(false);
  useEffect(() => {
    if (!autoPlaying) {
      autoRunning.current = false;
      return;
    }
    if (!autoRunning.current) showToast(<span className="fx-shimmer">Finishing the table…</span>, 1800);
    const delay = autoRunning.current ? 85 : 380;
    autoRunning.current = true;
    const t = window.setTimeout(() => dispatch({ type: 'auto' }), delay);
    return () => clearTimeout(t);
  }, [game, autoPlaying, showToast]);

  // ---------- Actions ----------

  const onMove = useCallback((from: Loc, to: PileRef) => dispatch({ type: 'move', from, to }), []);

  const onDraw = useCallback(() => {
    const g = live.current.game;
    const why = drawBlocked(g);
    if (why) {
      sound.play('nope');
      haptics.play('nope');
      showToast(why);
      return;
    }
    dispatch({ type: 'draw' });
  }, [showToast]);

  const undo = useCallback(() => {
    const { game: g, history: h } = live.current;
    if (!h.length || g.won || canAutoComplete(g)) return;
    sound.play('undo');
    dispatch({ type: 'undo' });
  }, []);

  /** Deals a new game; abandoning a game in progress counts as a loss but can be undone for a few seconds. */
  const newGame = useCallback(async (extra: Partial<DealOptions> = {}) => {
    const token = ++dealToken.current;
    const cur = live.current;
    const s = cur.settings;
    let opts = dealFrom(s, extra);

    if (opts.seed == null && s.winnable && checkable(opts)) {
      let seed = dealer.takeNow(opts);
      if (seed == null) {
        showToast(<span className="fx-shimmer">Finding a winnable deal…</span>, 4000);
        seed = await dealer.take(opts, 3500);
        if (token !== dealToken.current) return; // a newer deal superseded this one
        if (seed == null) showToast('No proven deal yet — this one is unchecked.');
        else setToast((t) => ({ ...t, show: false }));
      }
      if (seed != null) opts = { ...opts, seed, verified: true };
    }

    timers.current.win.forEach(clearTimeout);
    const now = live.current;
    if (now.game.started && !now.game.won) {
      undoSnapshot.current = { state: { game: now.game, history: now.history }, elapsed: now.elapsed, profile: now.profile };
      setProfile((p) => recordLoss(p, now.game, now.elapsed));
      setSnack((sn) => ({ open: true, run: sn.run + 1 }));
    } else {
      undoSnapshot.current = null;
      setSnack((sn) => ({ ...sn, open: false }));
    }
    sound.play('shuffle');
    dispatch({ type: 'set', state: { game: newDeal({ ...opts, dealId: Date.now() }), history: [] } });
    setElapsed(0);
    setDealSignal((n) => n + 1);
    setWinOpen(false);
    setHint(null);
  }, [showToast]);

  const restorePrevious = useCallback(() => {
    const snap = undoSnapshot.current;
    undoSnapshot.current = null;
    setSnack((s) => ({ ...s, open: false }));
    if (!snap) return;
    sound.play('undo');
    dispatch({ type: 'set', state: snap.state });
    setElapsed(snap.elapsed);
    setProfile(snap.profile);
  }, []);

  useEffect(() => {
    if (!snack.open) return;
    const t = window.setTimeout(() => {
      undoSnapshot.current = null;
      setSnack((s) => ({ ...s, open: false }));
    }, UNDO_MS);
    return () => clearTimeout(t);
  }, [snack.open, snack.run]);

  const showHint = useCallback(() => {
    const g = live.current.game;
    if (g.won || canAutoComplete(g)) return;
    const h = findHint(g);
    if (!h) {
      showToast('No moves left. Try Undo, or deal again.');
      return;
    }
    if (h.kind === 'draw' && !g.stock.length) showToast('Recycle the waste pile');
    sound.play('hint');
    dispatch({ type: 'hinted' });
    setHint(null);
    requestAnimationFrame(() => setHint(h)); // restart the glow even for a repeated hint
    clearTimeout(timers.current.hint);
    timers.current.hint = window.setTimeout(() => setHint(null), 1600);
  }, [showToast]);

  useEffect(() => setHint(null), [game]);

  // ---------- Daily Deal ----------

  const playDaily = useCallback(async () => {
    const date = todayKey();
    const g = live.current.game;
    setStats((s) => ({ ...s, open: false }));
    if (g.daily === date && !g.won) return; // already on the table
    const ready = dealer.daily(date);
    const slow = window.setTimeout(() => showToast(<span className="fx-shimmer">Preparing today's deal…</span>, 6000), 250);
    const { seed, verified } = await ready;
    clearTimeout(slow);
    setToast((t) => ({ ...t, show: false }));
    void newGame({ variant: 'klondike', draw: 1, suits: 4, seed, verified, daily: date });
  }, [newGame, showToast]);

  const shareDaily = useCallback(async (date: string) => {
    const r = live.current.profile.daily[date];
    if (!r) return;
    const text = `Solitaire Daily #${dailyNumber(date)} · ${formatTime(r.time)} · ${r.moves} moves`;
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    try {
      if (touch && navigator.share) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      showToast(<>Copied: <b>{text}</b></>, 3200);
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return;
      showToast(text, 6000); // no clipboard access: show it so it can be copied by hand
    }
  }, [showToast]);

  // ---------- Settings ----------

  const changeSettings = useCallback((patch: Partial<Settings>) => {
    sound.play('click');
    const next = { ...live.current.settings, ...patch };
    setSettings(next);
    if ('haptics' in patch) {
      haptics.configure(!!patch.haptics);
      haptics.play('pick');
    }
    if ('sound' in patch && patch.sound) {
      sound.configure(true, next.volume);
      sound.play('click');
    }
  }, []);

  // ---------- Switching games ----------

  const pickGame = useCallback((c: GameChoice) => {
    const g = live.current.game;
    if (sameGame(c, g) && !g.daily) return; // already playing it
    sound.play('click');
    setSwitchTo(c);
  }, []);

  const confirmSwitch = useCallback(() => {
    const c = switchTo;
    setSwitchTo(null);
    if (!c) return;
    const next = { ...live.current.settings, ...c };
    setSettings(next);
    live.current.settings = next;
    void newGame();
  }, [switchTo, newGame]);
  const cancelSwitch = useCallback(() => setSwitchTo(null), []);

  const toggleSound = useCallback(() => {
    const on = !live.current.settings.sound;
    setSettings((s) => ({ ...s, sound: on }));
    if (on) {
      sound.configure(true, live.current.settings.volume);
      sound.play('click');
    }
    showToast(on ? 'Sound on' : 'Sound off', 1400);
  }, [showToast]);

  const changeVolume = useCallback((volume: number) => {
    setSettings((s) => ({ ...s, volume }));
    sound.configure(true, volume);
    sound.play('place'); // throttled, so dragging the slider gives a gentle preview
  }, []);

  const openStats = useCallback((tab: StatsTab) => {
    sound.play('click');
    setStats({ open: true, tab });
  }, []);

  // Stable handlers, so the (memoised) dialogs skip the once-a-second clock re-render.
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const statsTab = useCallback((tab: StatsTab) => setStats((s) => ({ ...s, tab })), []);
  const closeStats = useCallback(() => setStats((s) => ({ ...s, open: false })), []);
  const onPlayDaily = useCallback(() => void playDaily(), [playDaily]);
  const onShareDaily = useCallback((d: string) => void shareDaily(d), [shareDaily]);
  const resetStats = useCallback(() => {
    setProfile(emptyProfile());
    setSettings((s) => withinUnlocks(s, 0));
    showToast('Statistics reset');
  }, [showToast]);
  const closeWin = useCallback(() => setWinOpen(false), []);
  const dealAgain = useCallback(() => void newGame(), [newGame]);

  // ---------- Keyboard ----------

  const anyModal = settingsOpen || winOpen || stats.open || !!switchTo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModal) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (k === 'n') void newGame();
      else if (k === 'h') showHint();
      else if (k === 'u') undo();
      else if (k === 'm') toggleSound();
      else if (k === 's') openStats('stats');
      else if (k === ' ' || k === 'd') {
        e.preventDefault();
        if (!canAutoComplete(live.current.game)) onDraw();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyModal, undo, newGame, showHint, onDraw, toggleSound, openStats]);

  const wins = totalWins(profile);

  return (
    <div className="app">
      <SuitSprite />
      <TopBar
        elapsed={elapsed}
        moves={game.moves}
        score={game.score}
        mode={modeName(game)}
        verified={game.verified}
        current={game}
        saved={settings}
        onPickGame={pickGame}
        canUndo={history.length > 0 && !game.won && !autoPlaying}
        soundOn={settings.sound}
        onToggleSound={toggleSound}
        onNew={() => void newGame()}
        onUndo={undo}
        onHint={showHint}
        onDaily={() => openStats('daily')}
        onStats={() => openStats('stats')}
        onSettings={() => {
          sound.play('click');
          setSettingsOpen(true);
        }}
      />
      <Board
        game={game}
        dealSignal={dealSignal}
        hint={hint}
        locked={autoPlaying}
        cardBack={settings.cardBack}
        onMove={onMove}
        onDraw={onDraw}
      />

      <Toast message={toast.msg} show={toast.show} />
      <UndoSnackbar
        open={snack.open}
        runId={snack.run}
        message="New deal started"
        durationMs={UNDO_MS}
        onUndo={restorePrevious}
      />
      <Confetti burst={burst} />

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings}
        wins={wins}
        hapticsSupported={haptics.supported}
        onChange={changeSettings}
        onVolumeChange={changeVolume}
        onTestHaptics={testHaptics}
      />
      <StatsDialog
        open={stats.open}
        tab={stats.tab}
        onTab={statsTab}
        onClose={closeStats}
        profile={profile}
        today={today}
        dailyActive={game.daily === today && !game.won}
        onPlayDaily={onPlayDaily}
        onShareDaily={onShareDaily}
        onResetStats={resetStats}
      />
      <SwitchGameDialog
        choice={switchTo}
        currentLabel={modeName(game)}
        inProgress={game.started && !game.won}
        onConfirm={confirmSwitch}
        onCancel={cancelSwitch}
      />
      <WinDialog
        open={winOpen}
        summary={win}
        onClose={closeWin}
        onNewGame={dealAgain}
        onShare={onShareDaily}
      />
    </div>
  );
}
