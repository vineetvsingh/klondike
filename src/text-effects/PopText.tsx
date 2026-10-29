import type { CSSProperties } from 'react';

/** Per-letter wrapper for the Pop-Riot effect: each glyph gets its own `--i` stagger index. */
export function PopText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`fx-pop ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <b key={i} aria-hidden="true" style={{ '--i': i } as CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </b>
      ))}
    </span>
  );
}
