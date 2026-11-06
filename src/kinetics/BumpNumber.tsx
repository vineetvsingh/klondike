import { useEffect, useRef } from 'react';

// Kinetics "Number Counter": bump on change, settle with cubic-bezier(.34, 1.56, .64, 1).
// Only increases bump, so undo and penalties stay quiet. It's a transform on the compositor,
// so a score ticking up never competes with the cards moving at the same moment.
const UP = 80;
const DOWN = 400;

export function BumpNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const el = ref.current;
    const grew = value > prev.current;
    prev.current = value;
    if (!el || !grew) return;
    el.classList.add('bump');
    const anim = el.animate(
      [
        { transform: 'none', easing: 'ease-out' },
        { transform: 'scale(1.25) translateY(-4px)', offset: UP / (UP + DOWN), easing: 'cubic-bezier(.34, 1.56, .64, 1)' },
        { transform: 'none' },
      ],
      { duration: UP + DOWN },
    );
    const t = setTimeout(() => el.classList.remove('bump'), 120);
    return () => {
      clearTimeout(t);
      anim.cancel();
    };
  }, [value]);

  return <span ref={ref} className="bump-number">{value}</span>;
}
