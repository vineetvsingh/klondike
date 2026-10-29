import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { VARIANTS } from '../game/engine';
import type { DrawMode, SpiderSuits, VariantId } from '../game/types';
import { CheckIcon } from './Icons';

export interface GameChoice {
  variant: VariantId;
  draw: DrawMode;
  suits: SpiderSuits;
}

const MODES: Record<VariantId, { label: string; patch: Partial<GameChoice> }[]> = {
  klondike: [{ label: 'Draw 1', patch: { draw: 1 } }, { label: 'Draw 3', patch: { draw: 3 } }],
  freecell: [],
  spider: [{ label: '1 suit', patch: { suits: 1 } }, { label: '2 suits', patch: { suits: 2 } }, { label: '4 suits', patch: { suits: 4 } }],
  pyramid: [],
};

/** Same game and the same mode, ignoring settings that game doesn't use. */
export function sameGame(a: GameChoice, b: GameChoice) {
  return a.variant === b.variant
    && (a.variant !== 'klondike' || a.draw === b.draw)
    && (a.variant !== 'spider' || a.suits === b.suits);
}

export function choiceLabel(c: GameChoice) {
  const name = VARIANTS.find((v) => v.id === c.variant)!.label;
  if (c.variant === 'klondike') return `${name} · Draw ${c.draw}`;
  if (c.variant === 'spider') return `${name} · ${c.suits} suit${c.suits > 1 ? 's' : ''}`;
  return name;
}

interface Props {
  current: GameChoice;
  /** The modes last chosen, so picking a game by name keeps its usual mode. */
  saved: GameChoice;
  onPick: (choice: GameChoice) => void;
  onClose: () => void;
}

export function GamePicker({ current, saved, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) onClose();
    };
    // Clicks on the button that opened the picker toggle it themselves.
    const outside = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('[data-game-trigger]')) close(e);
    };
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', close);
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus({ preventScroll: true }));
    return () => {
      window.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', close);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className="game-menu"
      role="dialog"
      aria-label="Choose a game"
      initial={{ opacity: 0, transform: 'translateY(-8px) scale(0.97)' }}
      animate={{ opacity: 1, transform: 'translateY(0px) scale(1)' }}
      exit={{ opacity: 0, transform: 'translateY(-4px) scale(0.98)', transition: { duration: 0.12 } }}
      transition={{ duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }}
    >
      <div className="game-menu-title">Choose a game</div>
      {VARIANTS.map((v) => {
        const modes = MODES[v.id];
        const here = current.variant === v.id;
        return (
          <div key={v.id} className={`game-row${here ? ' here' : ''}`}>
            <button
              type="button"
              className="game-main"
              aria-current={here && !modes.length}
              onClick={() => onPick({ ...saved, variant: v.id })}
            >
              <span className="game-name">{v.label}</span>
              <span className="game-blurb">{v.blurb}</span>
              {here && !modes.length && <span className="game-check"><CheckIcon /></span>}
            </button>
            {modes.length > 0 && (
              <div className="game-modes" role="group" aria-label={`${v.label} mode`}>
                {modes.map((m) => {
                  const choice = { ...saved, variant: v.id, ...m.patch };
                  const on = sameGame(choice, current);
                  return (
                    <button
                      key={m.label}
                      type="button"
                      className="game-mode"
                      aria-current={on}
                      aria-label={choiceLabel(choice)}
                      onClick={() => onPick(choice)}
                    >
                      {on && <CheckIcon />}{m.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
