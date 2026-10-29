import { motionValue, type MotionValue, type ValueAnimationTransition } from 'motion/react';

/**
 * Motion values for one card. The board drives these imperatively, so dragging
 * and flights run at frame rate without re-rendering React.
 */
export interface CardHandle {
  x: MotionValue<number>;
  y: MotionValue<number>;
  z: MotionValue<number>;
  flip: MotionValue<number>; // rotateY: 0 = back, 180 = face
  lift: MotionValue<number>; // scale while in the air
  spin: MotionValue<number>; // extra rotation, for the win rosette
  tx: number;
  ty: number;
  targetZ: number;
  flipTarget: number;
  token: number; // bumps whenever a newer animation supersedes the current one
  flying: boolean;
}

export function createHandle(): CardHandle {
  return {
    x: motionValue(0),
    y: motionValue(0),
    z: motionValue(1),
    flip: motionValue(0),
    lift: motionValue(1),
    spin: motionValue(0),
    tx: 0,
    ty: 0,
    targetZ: 1,
    flipTarget: 0,
    token: 0,
    flying: false,
  };
}

const reduced =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Critically-damped-ish springs: quick, with a whisper of overshoot so cards feel weighted.
export const MOVE_SPRING: ValueAnimationTransition = reduced
  ? { duration: 0.12 }
  : { type: 'spring', stiffness: 420, damping: 36, mass: 0.9, restDelta: 0.2 };

export const DEAL_SPRING: ValueAnimationTransition = reduced
  ? { duration: 0.12 }
  : { type: 'spring', stiffness: 260, damping: 28, mass: 1, restDelta: 0.2 };

export const FLIP_SPRING: ValueAnimationTransition = reduced
  ? { duration: 0.12 }
  : { type: 'spring', stiffness: 260, damping: 22, mass: 0.8 };

export const LIFT_SPRING: ValueAnimationTransition = reduced
  ? { duration: 0.1 }
  : { type: 'spring', stiffness: 520, damping: 28 };

export const WIN_SPRING: ValueAnimationTransition = reduced
  ? { duration: 0.15 }
  : { type: 'spring', stiffness: 110, damping: 17, mass: 1 };

export const DEAL_STAGGER = reduced ? 0.01 : 0.042;
export const REDUCED_MOTION = !!reduced;
