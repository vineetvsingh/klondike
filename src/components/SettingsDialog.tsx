import { memo, type CSSProperties } from 'react';
import { motion } from 'motion/react';
import { GlideTabs } from '../kinetics/GlideTabs';
import { CARD_BACKS } from '../game/profile';
import type { CardBackId, Settings, ThemeName } from '../game/types';
import { Modal } from './Modal';
import { LockIcon } from './Icons';
import { THEMES } from './themes';

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  wins: number;
  hapticsSupported: boolean;
  onChange: (patch: Partial<Settings>) => void;
  onVolumeChange: (volume: number) => void;
  onTestHaptics: () => void;
}

const RING = { type: 'spring', stiffness: 500, damping: 34 } as const;

export function SettingsDialog({ open, ...body }: Props) {
  return (
    <Modal open={open} onClose={body.onClose} labelledBy="settings-title" className="wide">
      <SettingsBody {...body} />
    </Modal>
  );
}

/** Kept apart from `open`, so showing the dialog doesn't re-render its contents. */
const SettingsBody = memo(function SettingsBody({ onClose, settings, wins, hapticsSupported, onChange, onVolumeChange, onTestHaptics }: Omit<Props, 'open'>) {
  const s = settings;

  return (
    <div className="dlg">
      <h2 id="settings-title">Table settings</h2>
      <p className="dlg-sub">To switch games, tap the game name in the top bar (on phones, it’s in the ⋯ menu).</p>

      <section className="field">
        <div className="field-label">Deals</div>
        <GlideTabs<'on' | 'off'>
          label="Winnable deals only"
          value={s.winnable ? 'on' : 'off'}
          onChange={(v) => onChange({ winnable: v === 'on' })}
          options={[
            { value: 'on', label: 'Winnable only' },
            { value: 'off', label: 'Any deal' },
          ]}
        />
        <p className="field-note">
          {s.winnable
            ? s.variant === 'spider' && s.suits === 4
              ? 'Every game is solved in the background before it is dealt, except four-suit Spider: proving those takes far too long, so they come unchecked.'
              : 'Every deal is solved in the background before you see it, so each one can be won.'
            : 'Fully random deals, as they come. Some of them cannot be won.'}
        </p>
      </section>

      <section className="field">
        <div className="field-label">Table felt</div>
        <div className="swatches" role="group" aria-label="Table felt">
          {THEMES.map((t) => {
            const locked = wins < t.wins;
            return (
              <button
                key={t.name}
                type="button"
                className={`swatch${locked ? ' locked' : ''}`}
                aria-label={locked ? `${t.label}, unlocks after ${t.wins} wins` : t.label}
                aria-pressed={s.theme === t.name}
                title={locked ? `${t.label}: win ${t.wins} games to unlock` : t.label}
                disabled={locked}
                style={{ background: `radial-gradient(circle at 35% 30%, ${t.swatch[0]}, ${t.swatch[1]})` }}
                onClick={() => onChange({ theme: t.name as ThemeName })}
              >
                {locked ? <span className="swatch-lock"><LockIcon /></span> : <span className="swatch-back" style={{ background: t.swatch[2] }} />}
                {s.theme === t.name && <motion.span layoutId="swatch-ring" className="swatch-ring" transition={RING} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="field">
        <div className="field-label">Card back</div>
        <div className="backs" role="group" aria-label="Card back">
          {CARD_BACKS.map((b) => {
            const locked = wins < b.wins;
            return (
              <button
                key={b.id}
                type="button"
                className={`back-pick${locked ? ' locked' : ''}`}
                aria-pressed={s.cardBack === b.id}
                aria-label={locked ? `${b.label}, unlocks after ${b.wins} win${b.wins > 1 ? 's' : ''}` : b.label}
                disabled={locked}
                onClick={() => onChange({ cardBack: b.id as CardBackId })}
              >
                <span className="mini-card" data-back={b.id} style={{ '--cw': '46px' } as CSSProperties}>
                  <span className="back" />
                  {locked && <span className="mini-lock"><LockIcon /></span>}
                </span>
                <span className="back-name">{locked ? `${b.wins} win${b.wins > 1 ? 's' : ''}` : b.label}</span>
                {s.cardBack === b.id && <motion.span layoutId="back-ring" className="back-ring" transition={RING} />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="field">
        <div className="field-label">Sound</div>
        <div className="sound-row">
          <GlideTabs<'on' | 'off'>
            label="Sound"
            value={s.sound ? 'on' : 'off'}
            onChange={(v) => onChange({ sound: v === 'on' })}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <label className={`volume${s.sound ? '' : ' muted'}`}>
            <span className="sr-only">Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(s.volume * 100)}
              disabled={!s.sound}
              onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
              style={{ '--fill': `${Math.round(s.volume * 100)}%` } as CSSProperties}
            />
            <output>{Math.round(s.volume * 100)}</output>
          </label>
        </div>
      </section>

      <section className="field">
        <div className="field-label">Vibration</div>
        <div className="sound-row">
          <GlideTabs<'on' | 'off'>
            label="Vibration"
            value={s.haptics ? 'on' : 'off'}
            onChange={(v) => onChange({ haptics: v === 'on' })}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' },
            ]}
          />
          <p className="field-note inline">
            {hapticsSupported ? 'A light tap on pickup and landing, and a longer one when you win.' : 'Not supported by this device or browser (iPhones don’t allow it).'}
          </p>
          {hapticsSupported && s.haptics && (
            <button type="button" className="dbtn small" onClick={onTestHaptics}>Try it</button>
          )}
        </div>
      </section>

      <div className="dlg-actions">
        <span className="spacer" />
        <button type="button" className="dbtn primary" onClick={onClose} data-autofocus>Done</button>
      </div>
    </div>
  );
});
