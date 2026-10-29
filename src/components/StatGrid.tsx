import type { CSSProperties, ReactNode } from 'react';

export interface StatItem {
  label: string;
  value: ReactNode;
  best?: boolean;
}

/** Stat tiles that rise in one after another (Kinetics "Stagger Entrance"). */
export function StatGrid({ items, delay = 0 }: { items: StatItem[]; delay?: number }) {
  return (
    <div className="stat-grid">
      {items.map((s, i) => (
        <div
          key={s.label}
          className={`stat-tile rise${s.best ? ' best' : ''}`}
          style={{ '--i': i, '--d': `${delay}s`, '--step': '60ms' } as CSSProperties}
        >
          <b>{s.value}</b>
          <span>{s.label}</span>
          {s.best && <em>Best</em>}
        </div>
      ))}
    </div>
  );
}
