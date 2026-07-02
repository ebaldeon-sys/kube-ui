import { ArrowLeft, Copy, FolderPlus, Play, RefreshCw, Square, SquareTerminal } from "lucide-react";
import { useEffect, useRef } from "react";

export function OutputPanel({
  title,
  output,
  streaming,
  loading,
  onStop,
  onInterrupt,
  onCopy,
  onBack
}: {
  title: string;
  output: string;
  streaming?: boolean;
  loading?: boolean;
  onStop?: () => void;
  onInterrupt?: () => void;
  onCopy?: (text: string, label?: string) => void;
  onBack?: () => void;
}) {
  return (
    <div className="output-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && !loading && (
            <button className="icon-button" title="Volver a la lista" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h1>{title || "Salida"}</h1>
        </div>
        <div className="panel-actions">
          {output && !loading && (
            <button className="toolbar-button" onClick={() => onCopy?.(output, "Salida")}>
              <Copy size={16} />
              Salida
            </button>
          )}
          {loading && onInterrupt && (
            <button className="toolbar-button danger" onClick={onInterrupt}>
              <Square size={16} />
              Interrumpir
            </button>
          )}
          {!loading && streaming && onStop && (
            <button className="toolbar-button danger" onClick={onStop}>
              <Square size={16} />
              Detener
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={20} className="spin" />
          <span>Ejecutando comando, esperando resultado...</span>
        </div>
      ) : (
        <pre>{output || (streaming ? "Esperando salida..." : "Sin salida")}</pre>
      )}
    </div>
  );
}

export function TerminalPanel({
  command,
  output,
  loading,
  streaming,
  onChange,
  onRun,
  onStop,
  onCopy
}: {
  command: string;
  output: string;
  loading: boolean;
  streaming?: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onStop?: () => void;
  onCopy?: (text: string, label?: string) => void;
}) {
  const outputRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [output]);

  return (
    <div className="terminal-panel">
      <div className="terminal-input">
        <SquareTerminal size={18} />
        <input
          value={command}
          placeholder="kubectl get pods -o wide"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onRun();
          }}
        />
        {streaming ? (
          <button className="toolbar-button danger" onClick={onStop}>
            <Square size={16} />
            Detener
          </button>
        ) : (
          <>
            {output.trim() && (
              <button className="toolbar-button" onClick={() => onCopy?.(output, "Terminal")}>
                <Copy size={16} />
                Copiar
              </button>
            )}
            <button className="toolbar-button" disabled={loading} onClick={onRun}>
              <Play size={16} />
              Ejecutar
            </button>
          </>
        )}
      </div>
      <pre ref={outputRef} className="terminal-output">{output || " "}</pre>
    </div>
  );
}

export function ApplyPanel({
  yaml,
  loading,
  editMode,
  onChange,
  onPick,
  onApply,
  onInterrupt,
  onBack
}: {
  yaml: string;
  loading: boolean;
  editMode?: boolean;
  onChange: (value: string) => void;
  onPick: () => void;
  onApply: () => void;
  onInterrupt?: () => void;
  onBack?: () => void;
}) {
  const fetching = Boolean(loading && editMode && !yaml.trim());
  return (
    <div className="apply-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && !fetching && (
            <button className="icon-button" title="Volver a la lista" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h1>{editMode ? "Editar recurso" : "Aplicar YAML"}</h1>
        </div>
        <div className="button-row">
          {fetching && onInterrupt ? (
            <button className="toolbar-button danger" onClick={onInterrupt}>
              <Square size={16} />
              Interrumpir
            </button>
          ) : (
            <>
              {!editMode && (
                <button className="toolbar-button" onClick={onPick}>
                  <FolderPlus size={16} />
                  Cargar archivo
                </button>
              )}
              <button className="toolbar-button primary" onClick={onApply} disabled={loading || !yaml.trim()}>
                <Play size={16} />
                {editMode ? "Guardar (replace)" : "Aplicar"}
              </button>
            </>
          )}
        </div>
      </div>
      {fetching ? (
        <div className="loading-state">
          <RefreshCw size={20} className="spin" />
          <span>Obteniendo el recurso, esperando resultado...</span>
        </div>
      ) : (
        <textarea value={yaml} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      )}
    </div>
  );
}
