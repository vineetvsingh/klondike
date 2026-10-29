import { Fragment, useEffect, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  className?: string;
  /** Rebuild the content on every open, so its entrance effects play again from the start. */
  fresh?: boolean;
  children: ReactNode;
}

/**
 * Dialogs stay mounted and are only shown and hidden, so opening one costs a CSS
 * transition on the compositor rather than building its whole tree on the spot.
 * Closed, a dialog is `visibility: hidden` and `inert`: unseen, unfocusable, silent.
 */
export function Modal({ open, onClose, labelledBy, className = '', fresh = false, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const opens = useRef(0);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) opens.current++;
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    if (panel.current) panel.current.scrollTop = 0;
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }));
    return () => {
      window.removeEventListener('keydown', onKey);
      restore?.focus?.();
    };
  }, [open, onClose]);

  return (
    <div
      className={`modal-root${open ? ' open' : ''}`}
      inert={!open}
      onPointerDown={(e) => { if (open && e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} className={`modal-panel ${className}`}>
        <Fragment key={fresh ? opens.current : 0}>{children}</Fragment>
      </div>
    </div>
  );
}
