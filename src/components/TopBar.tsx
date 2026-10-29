import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { BumpNumber } from '../kinetics/BumpNumber';
import { MagneticButton } from '../kinetics/MagneticButton';
import { SuitIcon } from './SuitSprite';
import {
  BulbIcon, CalendarIcon, ChartIcon, MoreIcon, ShuffleIcon, SlidersIcon, SoundOffIcon, SoundOnIcon, UndoIcon,
} from './Icons';
import { formatTime } from './format';

interface Props {
  elapsed: number;
  moves: number;
  score: number;
  mode: string;
  verified: boolean;
  canUndo: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
  onNew: () => void;
  onUndo: () => void;
  onHint: () => void;
  onDaily: () => void;
  onStats: () => void;
  onSettings: () => void;
}

export function TopBar(p: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  const pick = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark"><SuitIcon suit="S" /></span>
        <span className="brand-text">
          <span className="brand-name fx-foil">Solitaire</span>
          <span className="brand-mode">
            {p.mode}
            {p.verified && <span className="verified" title="The solver proved this deal can be won">Winnable</span>}
          </span>
        </span>
      </div>

      <div className="hud" aria-live="polite">
        <div className="hud-stat"><span className="hud-label">Time</span><span className="hud-value">{formatTime(p.elapsed)}</span></div>
        <div className="hud-stat"><span className="hud-label">Moves</span><span className="hud-value"><BumpNumber value={p.moves} /></span></div>
        <div className="hud-stat"><span className="hud-label">Score</span><span className="hud-value"><BumpNumber value={p.score} /></span></div>
      </div>

      <nav className="actions">
        <MagneticButton className="btn" onClick={p.onNew} title="New game (N)" aria-label="New game">
          <ShuffleIcon /><span>New</span>
        </MagneticButton>
        <MagneticButton className="btn" onClick={p.onUndo} disabled={!p.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <UndoIcon /><span>Undo</span>
        </MagneticButton>
        <MagneticButton className="btn" onClick={p.onHint} title="Hint (H)" aria-label="Hint">
          <BulbIcon /><span>Hint</span>
        </MagneticButton>
        <MagneticButton className="btn btn-icon wide-only" onClick={p.onDaily} title="Daily Deal" aria-label="Daily Deal">
          <CalendarIcon />
        </MagneticButton>
        <MagneticButton className="btn btn-icon wide-only" onClick={p.onStats} title="Statistics & achievements" aria-label="Statistics and achievements">
          <ChartIcon />
        </MagneticButton>
        <MagneticButton
          className="btn btn-icon btn-sound wide-only"
          onClick={p.onToggleSound}
          title={p.soundOn ? 'Mute (M)' : 'Unmute (M)'}
          aria-label={p.soundOn ? 'Mute sound' : 'Unmute sound'}
          aria-pressed={!p.soundOn}
        >
          {p.soundOn ? <SoundOnIcon /> : <SoundOffIcon />}
        </MagneticButton>
        <MagneticButton className="btn btn-icon wide-only" onClick={p.onSettings} title="Settings" aria-label="Settings">
          <SlidersIcon />
        </MagneticButton>

        <div className="more" ref={menuRef}>
          <MagneticButton
            className="btn btn-icon"
            onClick={() => setMenu((m) => !m)}
            title="More"
            aria-label="More"
            aria-expanded={menu}
            aria-haspopup="menu"
          >
            <MoreIcon />
          </MagneticButton>
          <AnimatePresence>
            {menu && (
              <motion.div
                className="more-menu"
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ type: 'spring', stiffness: 520, damping: 32 }}
              >
                <button type="button" role="menuitem" onClick={pick(p.onDaily)}><CalendarIcon />Daily Deal</button>
                <button type="button" role="menuitem" onClick={pick(p.onStats)}><ChartIcon />Stats & awards</button>
                <button type="button" role="menuitem" onClick={pick(p.onToggleSound)}>
                  {p.soundOn ? <SoundOnIcon /> : <SoundOffIcon />}{p.soundOn ? 'Mute sound' : 'Unmute sound'}
                </button>
                <button type="button" role="menuitem" onClick={pick(p.onSettings)}><SlidersIcon />Settings</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>
    </header>
  );
}
