import type { CSSProperties } from 'react';

/** Vector suit glyphs, referenced by every card with <use href="#suit-X" />. */
export function SuitSprite() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <symbol id="suit-H" viewBox="0 0 100 100">
          <path d="M50 92C22 70 4 54 4 33 4 17 16 6 29.5 6 39 6 46 11.5 50 20 54 11.5 61 6 70.5 6 84 6 96 17 96 33 96 54 78 70 50 92Z" />
        </symbol>
        <symbol id="suit-D" viewBox="0 0 100 100">
          <path d="M50 3Q68 28 88 50 68 72 50 97 32 72 12 50 32 28 50 3Z" />
        </symbol>
        <symbol id="suit-S" viewBox="0 0 100 100">
          <path d="M50 4C62 22 96 38 96 61 96 75 85 85 72 85 63 85 57 81 53.5 75 54.5 84 58.5 91 67 96H33C41.5 91 45.5 84 46.5 75 43 81 37 85 28 85 15 85 4 75 4 61 4 38 38 22 50 4Z" />
        </symbol>
        <symbol id="suit-C" viewBox="0 0 100 100">
          <circle cx="50" cy="28" r="21" />
          <circle cx="27" cy="60" r="21" />
          <circle cx="73" cy="60" r="21" />
          <path d="M40 38H60V64H40Z" />
          <path d="M46.5 60C46.5 78 42 88 33 96H67C58 88 53.5 78 53.5 60Z" />
        </symbol>
      </defs>
    </svg>
  );
}

export function SuitIcon({ suit, className, style }: { suit: string; className?: string; style?: CSSProperties }) {
  return (
    <svg className={className} style={style} aria-hidden="true">
      <use href={`#suit-${suit}`} />
    </svg>
  );
}
