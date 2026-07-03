import { ArrowLeft, Boxes, FolderOpen, FolderPlus, RefreshCw, Settings, Shield, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { KubeconfigInspection, Settings as AppSettings } from "../../types";

export function MissingBridge() {
  return (
    <div className="bridge-error">
      <div>
        <Boxes size={34} />
        <h1>kubeui no pudo cargar la API de escritorio</h1>
        <p>
          Abre la app con <code>start-macos.command</code>, <code>start-windows.bat</code> o <code>npm run dev</code>. Si estás viendo esto
          dentro de Electron, cierra la ventana y vuelve a iniciar.
        </p>
      </div>
    </div>
  );
}

export function EmptyWorkspace({
  settingsReady,
  kubeconfigCount,
  onAdd,
  onSettings
}: {
  settingsReady: boolean;
  kubeconfigCount: number;
  onAdd: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="empty-workspace">
      <div>
        <Boxes size={28} />
        <h1>{settingsReady ? "No hay contextos cargados" : "Cargando configuracion"}</h1>
        <p>
          {kubeconfigCount
            ? "No se encontraron contextos disponibles en los kubeconfig registrados."
            : "Agrega un kubeconfig para empezar a explorar tus recursos Kubernetes."}
        </p>
        <div className="button-row">
          <button className="toolbar-button primary" onClick={onAdd}>
            <FolderPlus size={16} />
            Agregar kubeconfig
          </button>
          <button className="toolbar-button" onClick={onSettings}>
            <Settings size={16} />
            Configuracion
          </button>
        </div>
      </div>
    </div>
  );
}

export function SettingsView({
  settings,
  infos,
  loading,
  onAdd,
  onRemove,
  onRefresh,
  onValidate,
  onReveal,
  onBack
}: {
  settings: AppSettings;
  infos: KubeconfigInspection[];
  loading: boolean;
  onAdd: () => void;
  onRemove: (path: string) => void;
  onValidate: () => void;
  onReveal: (path: string) => void;
  onRefresh: () => void;
  onBack?: () => void;
}) {
  const infoByPath = useMemo(() => new Map(infos.map((info) => [info.path, info])), [infos]);
  return (
    <div className="settings-view">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && (
            <button className="icon-button" title="Regresar" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1>Kubeconfig</h1>
            <p>{settings.kubeconfigPaths.length ? "Archivos registrados" : "Sin archivos registrados"}</p>
          </div>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onAdd}>
            <FolderPlus size={16} />
            Agregar
          </button>
          <button className="toolbar-button" onClick={onValidate} disabled={loading}>
            <Shield size={16} />
            Validar
          </button>
          <button className="toolbar-button" onClick={onRefresh}>
            <RefreshCw size={16} />
            Recargar contextos
          </button>
        </div>
      </div>
      <div className="file-list">
        {!settings.kubeconfigPaths.length && (
          <div className="file-row muted">
            <span>Agrega un archivo kubeconfig para cargar tus contextos.</span>
          </div>
        )}
        {settings.kubeconfigPaths.map((kubeconfigPath) => {
          const info = infoByPath.get(kubeconfigPath);
          return (
            <div className="file-row file-row-rich" key={kubeconfigPath}>
              <Shield size={17} />
              <div className="file-row-main">
                <code>{kubeconfigPath}</code>
                <div className="file-meta">
                  {loading && !info ? (
                    <span className="resource-badge neutral">Validando</span>
                  ) : info ? (
                    <>
                      <span className={`resource-badge ${info.ok ? "ok" : "bad"}`}>{info.ok ? "OK" : "Error"}</span>
                      <span>{info.exists ? `${info.contexts.length} contextos` : "Archivo no disponible"}</span>
                      {info.error && <span className="file-error">{info.error}</span>}
                    </>
                  ) : (
                    <span className="resource-badge neutral">Sin validar</span>
                  )}
                </div>
                {info?.contexts.length ? (
                  <div className="context-chip-list">
                    {info.contexts.slice(0, 5).map((context) => (
                      <span key={context}>{context}</span>
                    ))}
                    {info.contexts.length > 5 && <span>+{info.contexts.length - 5}</span>}
                  </div>
                ) : null}
              </div>
              <button className="icon-button" title="Abrir ubicacion" onClick={() => onReveal(kubeconfigPath)}>
                <FolderOpen size={16} />
              </button>
              <button className="icon-button danger" title="Quitar" onClick={() => onRemove(kubeconfigPath)}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
