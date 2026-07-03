import { Boxes, CheckCircle2, Settings, XCircle } from "lucide-react";

type Props = {
  kubeconfigCount: number;
  statusOk: boolean | undefined;
  onShowStatus: () => void;
  onOpenSettings: () => void;
};

export function StatusBar({ kubeconfigCount, statusOk, onShowStatus, onOpenSettings }: Props) {
  return (
    <footer className="statusbar">
      <div className="brand">
        <Boxes size={20} />
        <div>
          <strong>kubeui</strong>
          <span>{kubeconfigCount ? `${kubeconfigCount} kubeconfig` : "sin kubeconfig"}</span>
        </div>
      </div>
      <button className={`status-pill ${statusOk ? "ok" : "bad"}`} title="Ver detalle de kubectl" onClick={onShowStatus}>
        {statusOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        <span>{statusOk ? "kubectl listo" : "kubectl no disponible"}</span>
      </button>
      <button className="icon-button" title="Configurar kubeconfig" onClick={onOpenSettings}>
        <Settings size={18} />
      </button>
    </footer>
  );
}
