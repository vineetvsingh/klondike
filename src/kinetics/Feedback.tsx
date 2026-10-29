import type { CSSProperties, ReactNode } from 'react';

// Kinetics "Toast Overshoot": slides up past its rest position, then settles.
export function Toast({ message, show }: { message: ReactNode; show: boolean }) {
  return (
    <div className={show ? 'toast show' : 'toast'} role="status" aria-live="polite">
      {message}
    </div>
  );
}

// Kinetics "Undo Snackbar": a bar drains across the bottom for the length of the undo window.
export function UndoSnackbar({
  open, message, durationMs, onUndo, runId,
}: {
  open: boolean;
  message: string;
  durationMs: number;
  onUndo: () => void;
  runId: number;
}) {
  return (
    <div className={open ? 'snackbar show' : 'snackbar'} role="status" aria-hidden={!open}>
      <span>{message}</span>
      <button type="button" onClick={onUndo} tabIndex={open ? 0 : -1}>Undo</button>
      {open && (
        <span key={runId} className="progress" style={{ '--undo-ms': `${durationMs}ms` } as CSSProperties} />
      )}
    </div>
  );
}
