import { useEffect, useRef } from 'react';

// Kinetics "Number Counter": bump on change, settle with cubic-bezier(.34, 1.56, .64, 1).
// Only increases bump, so undo and penalties stay quiet.
export function BumpNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);

  useEffect(() => {
    const el = ref.current;
    const grew = value > prev.current;
    prev.current = value;
    if (!el || !grew) return;
    el.classList.remove('bump');
    void el.offsetWidth; // restart cleanly on rapid changes
    el.classList.add('bump');
    const t = setTimeout(() => el.classList.remove('bump'), 120);
    return () => clearTimeout(t);
  }, [value]);

  return <span ref={ref} className="bump-number">{value}</span>;
}
