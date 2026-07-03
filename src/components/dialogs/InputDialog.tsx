import type { InputDialogState } from "../../app/types";

type Props = {
  dialog: InputDialogState;
  onChange: (value: string) => void;
  onClose: (value: string | null) => void;
};

export function InputDialog({ dialog, onChange, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={() => onClose(null)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <p className="modal-message">{dialog.message}</p>
        <input
          className="modal-input"
          autoFocus
          value={dialog.value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onClose(dialog.value);
            else if (event.key === "Escape") onClose(null);
          }}
        />
        <div className="modal-actions">
          <button className="toolbar-button" onClick={() => onClose(null)}>
            Cancelar
          </button>
          <button className="toolbar-button primary" onClick={() => onClose(dialog.value)}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
