import { motion, useMotionValue, useSpring } from 'motion/react';
import type { ButtonHTMLAttributes, PointerEvent, ReactNode } from 'react';

// Kinetics "Magnetic Button" (pointer pulls the button toward it) combined with
// "Squish Button" (quick press-down, bouncy release). The original CSS transitions
// are swapped for springs so rapid pointer movement never snaps.
const PULL = 0.3;

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart'> & {
  children: ReactNode;
};

export function MagneticButton({ children, className = '', disabled, ...rest }: Props) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 320, damping: 22, mass: 0.6 });
  const y = useSpring(my, { stiffness: 320, damping: 22, mass: 0.6 });

  const onMove = (e: PointerEvent<HTMLSpanElement>) => {
    if (disabled || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left - r.width / 2) * PULL);
    my.set((e.clientY - r.top - r.height / 2) * PULL);
  };
  const onLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <span className="magnet-zone" onPointerMove={onMove} onPointerLeave={onLeave}>
      <motion.button
        {...rest}
        disabled={disabled}
        className={className}
        style={{ x, y }}
        whileTap={disabled ? undefined : { scale: 0.88, transition: { duration: 0.08, ease: 'easeOut' } }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
      >
        {children}
      </motion.button>
    </span>
  );
}
