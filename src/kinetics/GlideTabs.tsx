import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// Kinetics "Tab Pill Glide": the pill reads the active tab's offsetLeft/offsetWidth
// and glides there with cubic-bezier(.65, 0, .35, 1).
export interface GlideOption<T> {
  value: T;
  label: ReactNode;
}

interface Props<T> {
  options: GlideOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function GlideTabs<T extends string | number>({ options, value, onChange, label }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const active = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setPill({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active]);

  return (
    <div className="glide-tabs" role="group" aria-label={label}>
      {pill && <span className="glide-pill" style={pill} aria-hidden="true" />}
      {options.map((o, i) => (
        <button
          key={String(o.value)}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          className="glide-tab"
          aria-pressed={i === active}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
