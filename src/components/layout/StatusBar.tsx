import { Boxes, CheckCircle2, Moon, Settings, Sun, XCircle } from "lucide-react";
import { memo } from "react";
import type { Theme } from "../../theme/useTheme";

type Props = {
  kubeconfigCount: number;
  statusOk: boolean | undefined;
  theme: Theme;
  onToggleTheme: () => void;
  onShowStatus: () => void;
  onOpenSettings: () => void;
};

export const StatusBar = memo(function StatusBar({ kubeconfigCount, statusOk, theme, onToggleTheme, onShowStatus, onOpenSettings }: Props) {
  const dark = theme === "dark";
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
      <button
        className="icon-button"
        title={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        onClick={onToggleTheme}
      >
        {dark ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className="icon-button" title="Configurar kubeconfig" onClick={onOpenSettings}>
        <Settings size={18} />
      </button>
    </footer>
  );
});
