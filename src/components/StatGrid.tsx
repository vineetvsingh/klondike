import { motion } from 'motion/react';
import type { ReactNode } from 'react';

export interface StatItem {
  label: string;
  value: ReactNode;
  best?: boolean;
}

/** Stat tiles that rise in one after another (Kinetics "Stagger Entrance"). */
export function StatGrid({ items, delay = 0 }: { items: StatItem[]; delay?: number }) {
  return (
    <motion.div
      className="stat-grid"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
    >
      {items.map((s) => (
        <motion.div
          key={s.label}
          className={`stat-tile${s.best ? ' best' : ''}`}
          variants={{
            hidden: { opacity: 0, y: 14, scale: 0.96 },
            show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 26 } },
          }}
        >
          <b>{s.value}</b>
          <span>{s.label}</span>
          {s.best && <em>Best</em>}
        </motion.div>
      ))}
    </motion.div>
  );
}
