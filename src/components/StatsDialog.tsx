import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import { GlideTabs } from '../kinetics/GlideTabs';
import { VARIANTS } from '../game/engine';
import { bestDailyStreak, dailyNumber, dailyStreak, monthGrid } from '../game/daily';
import { ACHIEVEMENTS, totalPlayed, totalWins, type Profile } from '../game/profile';
import type { VariantId } from '../game/types';
import { BestRuns, TimeHistogram, WinRateChart } from './Charts';
import { Modal } from './Modal';
import { StatGrid } from './StatGrid';
import { formatTime } from './format';
import { CheckIcon, LockIcon } from './Icons';

export type StatsTab = 'daily' | 'stats' | 'awards';

interface Props {
  open: boolean;
  tab: StatsTab;
  onTab: (t: StatsTab) => void;
  onClose: () => void;
  profile: Profile;
  today: string;
  dailyActive: boolean;
  onPlayDaily: () => void;
  onShareDaily: (date: string) => void;
  onResetStats: () => void;
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function StatsDialog({ open, ...body }: Props) {
  return (
    <Modal open={open} onClose={body.onClose} labelledBy="stats-title" className="wide">
      <StatsBody {...body} />
    </Modal>
  );
}

/** Kept apart from `open`, so showing the dialog doesn't re-render its contents. */
const StatsBody = memo(function StatsBody({ tab, onTab, onClose, profile, today, dailyActive, onPlayDaily, onShareDaily, onResetStats }: Omit<Props, 'open'>) {
  return (
    <div className="dlg">
      <h2 id="stats-title">{tab === 'daily' ? 'Daily Deal' : tab === 'stats' ? 'Your statistics' : 'Achievements'}</h2>
      <div className="dlg-tabs">
        <GlideTabs<StatsTab>
          label="Section"
          value={tab}
          onChange={onTab}
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'stats', label: 'Stats' },
            { value: 'awards', label: 'Awards' },
          ]}
        />
      </div>
      {tab === 'daily' && (
        <DailyPane profile={profile} today={today} active={dailyActive} onPlay={onPlayDaily} onShare={onShareDaily} />
      )}
      {tab === 'stats' && <StatsPane profile={profile} onReset={onResetStats} />}
      {tab === 'awards' && <AwardsPane profile={profile} />}
      <div className="dlg-actions">
        <span className="spacer" />
        <button type="button" className="dbtn primary" onClick={onClose} data-autofocus>Done</button>
      </div>
    </div>
  );
});

// ---------- Daily ----------

function DailyPane({ profile, today, active, onPlay, onShare }: {
  profile: Profile; today: string; active: boolean; onPlay: () => void; onShare: (d: string) => void;
}) {
  const [y0, m0] = today.split('-').map(Number);
  const [month, setMonth] = useState({ y: y0, m: m0 - 1 });
  const done = profile.daily;
  const result = done[today];
  const streak = dailyStreak(done, today);
  const weeks = monthGrid(month.y, month.m);
  const title = new Date(Date.UTC(month.y, month.m, 1)).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (d: number) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + d) / 12), m: (m + d + 12) % 12 }));
  const atCurrent = month.y === y0 && month.m === m0 - 1;
  const count = Object.keys(done).length;

  return (
    <>
      <p className="dlg-sub">
        Everyone gets the same Klondike deal today, Draw 1, checked by the solver to be winnable. A new one arrives at midnight.
      </p>
      <div className="daily-hero">
        <div>
          <span className="daily-no">Daily #{dailyNumber(today)}</span>
          {result ? (
            <b>Solved in {formatTime(result.time)} · {result.moves} moves</b>
          ) : (
            <b>{active ? 'In progress on the table' : 'Not played yet'}</b>
          )}
        </div>
        {result ? (
          <button type="button" className="dbtn primary" onClick={() => onShare(today)}>Share result</button>
        ) : (
          <button type="button" className="dbtn primary" onClick={onPlay}>{active ? 'Back to the table' : 'Play today'}</button>
        )}
      </div>

      <StatGrid
        items={[
          { label: 'Streak', value: <>{streak}<small> day{streak === 1 ? '' : 's'}</small></> },
          { label: 'Best streak', value: bestDailyStreak(done) },
          { label: 'Solved', value: count },
        ]}
      />

      <div className="calendar">
        <div className="cal-head">
          <button type="button" className="cal-nav" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
          <b>{title}</b>
          <button type="button" className="cal-nav" onClick={() => shift(1)} disabled={atCurrent} aria-label="Next month">›</button>
        </div>
        <div className="cal-grid" role="grid" aria-label={`Daily Deals solved in ${title}`}>
          {WEEKDAYS.map((d, i) => <span key={i} className="cal-dow" aria-hidden="true">{d}</span>)}
          {weeks.flat().map((key, i) => {
            if (!key) return <span key={i} className="cal-day pad" />;
            const r = done[key];
            const cls = `cal-day${r ? ' done' : ''}${key === today ? ' today' : ''}${key > today ? ' future' : ''}`;
            const label = r ? `${key}: solved in ${formatTime(r.time)}, ${r.moves} moves` : key;
            return (
              <span
                key={key}
                className={`${cls}${r ? ' pop-in' : ''}`}
                style={r ? ({ '--i': i % 7 } as CSSProperties) : undefined}
                role="gridcell"
                aria-label={label}
                title={r ? `#${dailyNumber(key)} · ${formatTime(r.time)} · ${r.moves} moves` : undefined}
              >
                {Number(key.slice(-2))}
              </span>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ---------- Stats ----------

type Filter = 'all' | VariantId;

function StatsPane({ profile, onReset }: { profile: Profile; onReset: () => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [armed, setArmed] = useState(false);
  const armTimer = useRef(0);
  useEffect(() => () => clearTimeout(armTimer.current), []);

  const records = filter === 'all' ? profile.records : profile.records.filter((r) => r.v === filter);
  const played = filter === 'all' ? totalPlayed(profile) : profile.totals[filter].played;
  const won = filter === 'all' ? totalWins(profile) : profile.totals[filter].won;
  const bestTimes = (filter === 'all' ? VARIANTS.map((v) => v.id) : [filter])
    .map((v) => profile.best[v].time)
    .filter((t): t is number => t != null);

  const reset = () => {
    if (!armed) {
      setArmed(true);
      armTimer.current = window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(false);
    onReset();
  };

  return (
    <>
      <div className="filter-row">
        <GlideTabs<Filter>
          label="Game"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'All' }, ...VARIANTS.map((v) => ({ value: v.id, label: v.label }))]}
        />
      </div>
      <StatGrid
        key={filter}
        items={[
          { label: 'Played', value: played },
          { label: 'Won', value: won },
          { label: 'Win rate', value: `${played ? Math.round((won / played) * 100) : 0}%` },
          { label: 'Best time', value: bestTimes.length ? formatTime(Math.min(...bestTimes)) : '—' },
          { label: 'Streak', value: <>{profile.streak}<small> / {profile.bestStreak}</small></> },
          { label: 'Achievements', value: <>{Object.keys(profile.achievements).length}<small> / {ACHIEVEMENTS.length}</small></> },
        ]}
      />
      <div className="charts">
        <WinRateChart records={records} />
        <TimeHistogram records={records} />
        <BestRuns records={records} />
      </div>
      <div className="dlg-actions">
        <button type="button" className={`dbtn ghost${armed ? ' armed' : ''}`} onClick={reset}>
          {armed ? 'Tap again to reset everything' : 'Reset statistics'}
        </button>
      </div>
    </>
  );
}

// ---------- Achievements ----------

function AwardsPane({ profile }: { profile: Profile }) {
  const got = profile.achievements;
  const n = Object.keys(got).length;
  return (
    <>
      <p className="dlg-sub">{n} of {ACHIEVEMENTS.length} unlocked. Winning games also unlocks new card backs and felts in Settings.</p>
      <ul className="awards">
        {ACHIEVEMENTS.map((a, i) => {
          const at = got[a.id];
          return (
            <li key={a.id} className={`award rise${at ? ' got' : ''}`} style={{ '--i': i, '--step': '25ms' } as CSSProperties}>
              <span className="award-badge" aria-hidden="true">{at ? <CheckIcon /> : <LockIcon />}</span>
              <span className="award-text">
                <b>{a.title}</b>
                <small>{a.detail}</small>
              </span>
              {at && <time dateTime={new Date(at).toISOString()}>{new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
