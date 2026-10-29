import { memo } from 'react';
import { RANK_LABELS, SUIT_KEYS, isRed } from '../game/engine';
import type { Suit } from '../game/types';
import { SuitIcon } from './SuitSprite';

// Pip layouts as [x%, y%] on the card face; pips below the middle are drawn upside down.
const L = 34.5, M = 50, R = 65.5, T = 21, B = 79, C = 50;
const PIPS: Record<number, [number, number][]> = {
  2: [[M, T], [M, B]],
  3: [[M, T], [M, C], [M, B]],
  4: [[L, T], [R, T], [L, B], [R, B]],
  5: [[L, T], [R, T], [M, C], [L, B], [R, B]],
  6: [[L, T], [R, T], [L, C], [R, C], [L, B], [R, B]],
  7: [[L, T], [R, T], [M, 35.5], [L, C], [R, C], [L, B], [R, B]],
  8: [[L, T], [R, T], [M, 35.5], [L, C], [R, C], [M, 64.5], [L, B], [R, B]],
  9: [[L, T], [R, T], [L, 40.3], [R, 40.3], [M, C], [L, 59.7], [R, 59.7], [L, B], [R, B]],
  10: [[L, T], [R, T], [M, 30.7], [L, 40.3], [R, 40.3], [L, 59.7], [R, 59.7], [M, 69.3], [L, B], [R, B]],
};

export const CardFace = memo(function CardFace({ suit, rank }: { suit: Suit; rank: number }) {
  const key = SUIT_KEYS[suit];
  const label = RANK_LABELS[rank];
  const index = (
    <>
      <b>{label}</b>
      <SuitIcon suit={key} />
    </>
  );

  let center;
  if (rank === 1) {
    center = <div className="ace"><SuitIcon suit={key} /></div>;
  } else if (rank > 10) {
    center = (
      <div className="court">
        <b>{label}</b>
        <SuitIcon suit={key} />
      </div>
    );
  } else {
    center = (
      <>
        <div className="pips">
          {PIPS[rank].map(([x, y], i) => (
            <SuitIcon key={i} suit={key} className={y > 50 ? 'flip' : undefined} style={{ left: `${x}%`, top: `${y}%` }} />
          ))}
        </div>
        <div className="mini"><SuitIcon suit={key} /></div>
      </>
    );
  }

  return (
    <div className={`face ${isRed(suit) ? 'red' : 'black'}`}>
      <div className="idx tl">{index}</div>
      <div className="idx br">{index}</div>
      {center}
    </div>
  );
});
