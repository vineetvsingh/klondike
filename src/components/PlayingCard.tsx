import { memo } from 'react';
import type { Card } from '../game/types';
import type { CardHandle } from './cardMotion';
import { CardFace } from './CardFace';

interface Props {
  card: Card;
  handle: CardHandle;
  inStock: boolean;
  buried: boolean;
  hinted: boolean;
  dragging: boolean;
  target: boolean;
}

/** Plain elements: the handle moves them directly, and React only ever touches the class. */
export const PlayingCard = memo(function PlayingCard({ card, handle, inStock, buried, hinted, dragging, target }: Props) {
  const cls = ['card'];
  if (card.up) cls.push('up');
  if (inStock) cls.push('in-stock');
  if (buried) cls.push('buried');
  if (hinted) cls.push('hint');
  if (dragging) cls.push('dragging');
  if (target) cls.push('target');

  return (
    <div ref={handle.attach} className={cls.join(' ')} data-card={card.id}>
      <div className="card-inner">
        <div className="back" />
        <CardFace suit={card.suit} rank={card.rank} />
      </div>
    </div>
  );
});
