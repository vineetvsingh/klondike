import type { CSSProperties } from 'react';

/**
 * Per-letter wrapper for the Ghostwrite shimmer: each glyph gets its own `--i` stagger index,
 * so the band of light passes along the text one letter at a time (see text-effects.css).
 */
export function ShimmerText({ text }: { text: string }) {
  return (
    <span className="fx-shimmer" aria-label={text}>
      {[...text].map((ch, i) => (
        <b key={i} aria-hidden="true" style={{ '--i': i } as CSSProperties}>
          {ch === ' ' ? ' ' : ch}
        </b>
      ))}
    </span>
  );
}
