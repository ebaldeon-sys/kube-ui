import { AlertTriangle, Copy } from "lucide-react";
import type { DetailDialog as DetailDialogData } from "../../app/types";

type Props = {
  dialog: DetailDialogData;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
};

export function DetailDialog({ dialog, onClose, onCopy }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal detail-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <AlertTriangle size={18} />
          <strong>{dialog.title}</strong>
        </div>
        {dialog.message && <p className="modal-message">{dialog.message}</p>}
        {dialog.command && (
          <div className="command-box">
            <code>{dialog.command}</code>
            <button className="icon-button" title="Copiar comando" onClick={() => onCopy(dialog.command ?? "", "Comando")}>
              <Copy size={15} />
            </button>
          </div>
        )}
        {dialog.details && <pre className="modal-pre">{dialog.details}</pre>}
        <div className="modal-actions">
          {dialog.details && (
            <button className="toolbar-button" onClick={() => onCopy(dialog.details ?? "", "Detalle")}>
              <Copy size={16} />
              Copiar
            </button>
          )}
          <button className="toolbar-button primary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
