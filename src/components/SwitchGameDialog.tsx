import { memo, useRef } from 'react';
import { choiceLabel, type GameChoice } from './GamePicker';
import { Modal } from './Modal';

interface Props {
  choice: GameChoice | null;
  /** What's on the table now, e.g. "Klondike · Draw 1" or "Daily #302". */
  currentLabel: string;
  inProgress: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SwitchGameDialog = memo(function SwitchGameDialog({ choice, currentLabel, inProgress, onConfirm, onCancel }: Props) {
  // Keep the text while the dialog animates out.
  const last = useRef(choice);
  if (choice) last.current = choice;
  const c = last.current;

  return (
    <Modal open={!!choice} onClose={onCancel} labelledBy="switch-title" className="narrow">
      {c && (
        <div className="dlg">
          <h2 id="switch-title">Switch to {choiceLabel(c)}?</h2>
          <p className="dlg-sub">
            {inProgress
              ? <>Your {currentLabel} game in progress will end and count as a loss. You can undo it for a few seconds afterwards.</>
              : <>This deals a new game of {choiceLabel(c)}.</>}
          </p>
          <div className="dlg-actions">
            <span className="spacer" />
            <button type="button" className="dbtn ghost" onClick={onCancel} {...(inProgress ? { 'data-autofocus': true } : {})}>
              Keep playing
            </button>
            <button type="button" className="dbtn primary" onClick={onConfirm} {...(inProgress ? {} : { 'data-autofocus': true })}>
              Switch game
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
});
