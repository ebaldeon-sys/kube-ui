import type { ConfirmDialogState } from "../../app/types";

type Props = {
  dialog: ConfirmDialogState;
  onClose: (value: boolean) => void;
};

export function ConfirmDialog({ dialog, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <p className="modal-message">{dialog.message}</p>
        <div className="modal-actions">
          <button className="toolbar-button" onClick={() => onClose(false)}>
            Cancelar
          </button>
          <button className="toolbar-button primary" onClick={() => onClose(true)}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
