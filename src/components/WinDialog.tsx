import { memo, type CSSProperties } from 'react';
import { PopText } from '../text-effects/PopText';
import { dailyNumber } from '../game/daily';
import { ACHIEVEMENTS, type AchievementId, type Unlock } from '../game/profile';
import { Modal } from './Modal';
import { StatGrid } from './StatGrid';
import { formatTime } from './format';
import { CheckIcon, ShareIcon } from './Icons';

export interface WinSummary {
  elapsed: number;
  moves: number;
  score: number;
  bestTime: boolean;
  bestScore: boolean;
  won: number;
  played: number;
  daily: string | null;
  achievements: AchievementId[];
  unlocks: Unlock[];
}

interface Props {
  open: boolean;
  summary: WinSummary | null;
  onClose: () => void;
  onNewGame: () => void;
  onShare: (date: string) => void;
}

export const WinDialog = memo(function WinDialog({ open, summary, onClose, onNewGame, onShare }: Props) {
  const rate = summary ? Math.round((summary.won / Math.max(summary.played, 1)) * 100) : 0;
  const earned = summary ? ACHIEVEMENTS.filter((a) => summary.achievements.includes(a.id)) : [];
  return (
    <Modal open={open && !!summary} onClose={onClose} labelledBy="win-title" className="win" fresh>
      {summary && (
        <div className="dlg win-body">
          <div className="fx-waxseal win-seal">WON</div>
          <h2 id="win-title"><PopText text={summary.daily ? `Daily #${dailyNumber(summary.daily)} solved.` : 'Beautifully played.'} /></h2>
          <p className="dlg-sub">
            {summary.bestTime || summary.bestScore
              ? 'A new personal best. Every card is home.'
              : `Every card is home. You've won ${summary.won} of ${summary.played} (${rate}%).`}
          </p>
          <StatGrid
            delay={0.35}
            items={[
              { label: 'Time', value: formatTime(summary.elapsed), best: summary.bestTime },
              { label: 'Moves', value: summary.moves },
              { label: 'Score', value: summary.score, best: summary.bestScore },
            ]}
          />
          {(earned.length > 0 || summary.unlocks.length > 0) && (
            <ul className="win-unlocks">
              {earned.map((a, i) => (
                <li key={a.id} className="rise" style={rise(i)}>
                  <span className="award-badge" aria-hidden="true"><CheckIcon /></span>
                  <span><b>{a.title}</b><small>{a.detail}</small></span>
                </li>
              ))}
              {summary.unlocks.map((u, i) => (
                <li key={u.id} className="unlock rise" style={rise(earned.length + i)}>
                  <span className="award-badge" aria-hidden="true">✦</span>
                  <span><b>New {u.kind === 'back' ? 'card back' : 'felt'}: {u.label}</b><small>Pick it in Settings</small></span>
                </li>
              ))}
            </ul>
          )}
          <div className="dlg-actions center">
            {summary.daily ? (
              <button type="button" className="dbtn ghost" onClick={() => onShare(summary.daily!)}>
                <ShareIcon /> Share
              </button>
            ) : (
              <button type="button" className="dbtn ghost" onClick={onClose}>Admire the table</button>
            )}
            <button type="button" className="dbtn primary" onClick={onNewGame} data-autofocus>Deal again</button>
          </div>
        </div>
      )}
    </Modal>
  );
});

const rise = (i: number) => ({ '--i': i, '--d': '0.6s', '--step': '80ms' }) as CSSProperties;
