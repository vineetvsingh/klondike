import type { CSSProperties } from 'react';

/**
 * Per-letter wrapper for the Pop-Riot effect: each glyph gets its own `--i` stagger index.
 * `data-c` feeds the copy of the letter that leaps off it (see text-effects.css).
 */
export function PopText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`fx-pop ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <b key={i} aria-hidden="true" data-c={ch === ' ' ? '\u00a0' : ch} style={{ '--i': i } as CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </b>
      ))}
    </span>
  );
}
