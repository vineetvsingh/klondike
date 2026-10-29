import { memo } from 'react';
import { motion, useSpring, useTransform, useVelocity } from 'motion/react';
import type { Card } from '../game/types';
import type { CardHandle } from './cardMotion';
import { REDUCED_MOTION } from './cardMotion';
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

const TILT = REDUCED_MOTION ? 0 : 4;

export const PlayingCard = memo(function PlayingCard({ card, handle, inStock, buried, hinted, dragging, target }: Props) {
  // A card in motion leans into its direction of travel, then settles upright.
  const vx = useVelocity(handle.x);
  const lean = useTransform(vx, [-2200, 0, 2200], [-TILT, 0, TILT], { clamp: true });
  const settle = useSpring(lean, { stiffness: 300, damping: 24 });
  const rotate = useTransform(() => settle.get() + handle.spin.get());

  const cls = ['card'];
  if (card.up) cls.push('up');
  if (inStock) cls.push('in-stock');
  if (buried) cls.push('buried');
  if (hinted) cls.push('hint');
  if (dragging) cls.push('dragging');
  if (target) cls.push('target');

  return (
    <motion.div
      className={cls.join(' ')}
      data-card={card.id}
      style={{ x: handle.x, y: handle.y, zIndex: handle.z, rotate, scale: handle.lift }}
    >
      <motion.div className="card-inner" style={{ rotateY: handle.flip }}>
        <div className="back" />
        <CardFace suit={card.suit} rank={card.rank} />
      </motion.div>
    </motion.div>
  );
});
