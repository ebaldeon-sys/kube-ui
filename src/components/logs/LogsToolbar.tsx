import { ArrowLeft, ChevronDown, Copy, Maximize2, Minimize2, Pin, Play, RefreshCw, Search, Square } from "lucide-react";
import type { RefObject } from "react";
import { SINCE_OPTIONS } from "../../app/constants";
import type { LogsMode } from "../../app/types";

type Props = {
  title: string;
  onBack?: () => void;
  mode: LogsMode;
  onModeChange?: (mode: LogsMode) => void;
  since?: string;
  onSinceChange?: (value: string) => void;
  searchOpen: boolean;
  onToggleSearch: () => void;
  searchDisabled: boolean;
  pretty: boolean;
  onPrettyChange?: (value: boolean) => void;
  followTail: boolean;
  onToggleFollow: () => void;
  onScrollToBottom: () => void;
  atBottom: boolean;
  hasLines: boolean;
  following?: boolean;
  pinned: boolean;
  onPinnedChange?: (value: boolean) => void;
  output: string;
  onCopy?: (text: string, label?: string) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  streaming?: boolean;
  onStop?: () => void;
  onResume?: () => void;
  searchInputRef: RefObject<HTMLInputElement>;
};

export function LogsToolbar({
  title,
  onBack,
  mode,
  onModeChange,
  since,
  onSinceChange,
  searchOpen,
  onToggleSearch,
  searchDisabled,
  pretty,
  onPrettyChange,
  followTail,
  onToggleFollow,
  onScrollToBottom,
  atBottom,
  hasLines,
  following,
  pinned,
  onPinnedChange,
  output,
  onCopy,
  expanded,
  onToggleExpand,
  streaming,
  onStop,
  onResume
}: Props) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">
        {onBack && (
          <button className="icon-button" title="Volver a la lista" onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
        )}
        <h1>{title || "Logs"}</h1>
      </div>
      <div className="panel-actions">
        {onModeChange && (
          <div className="logs-mode" role="tablist">
            <button className={`logs-mode-btn ${mode === "live" ? "active" : ""}`} onClick={() => onModeChange("live")}>
              En vivo
            </button>
            <button className={`logs-mode-btn ${mode === "query" ? "active" : ""}`} onClick={() => onModeChange("query")}>
              Histórico
            </button>
          </div>
        )}
        {onSinceChange && mode === "live" && (
          <label className="since-control">
            Desde
            <span className="select-wrap">
              <select value={since ?? ""} onChange={(event) => onSinceChange(event.target.value)}>
                {SINCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} />
            </span>
          </label>
        )}
        <button
          className={`toolbar-button ${searchOpen ? "active" : ""}`}
          title={searchDisabled ? "Disponible cuando termine de cargar" : "Buscar (Ctrl+F)"}
          disabled={searchDisabled}
          onClick={onToggleSearch}
        >
          <Search size={16} />
          Buscar
        </button>
        {pretty && (
          <>
            <button
              className={`toolbar-button ${followTail ? "active" : ""}`}
              title={followTail ? "Auto-scroll activo: no detiene kubectl logs" : "Scroll manual: volver al final sin detener logs"}
              disabled={!hasLines}
              onClick={onToggleFollow}
            >
              {followTail ? <ChevronDown size={16} /> : <Play size={16} />}
              {followTail ? "Auto-scroll" : "Scroll manual"}
            </button>
            <button className="toolbar-button" title="Ir al final del log" disabled={!hasLines || atBottom} onClick={onScrollToBottom}>
              <ChevronDown size={16} />
              Ir al final
            </button>
          </>
        )}
        {mode === "live" && following && onPinnedChange && (
          <button
            className={`toolbar-button ${pinned ? "active" : ""}`}
            title={pinned ? "Dejar de mantener en segundo plano" : "Mantener logs en segundo plano"}
            onClick={() => onPinnedChange(!pinned)}
          >
            <Pin size={16} />
            {pinned ? "En 2º plano" : "2º plano"}
          </button>
        )}
        <button className="toolbar-button" onClick={() => onPrettyChange?.(!pretty)}>
          {pretty ? "Ver crudo" : "Ver formateado"}
        </button>
        {output && (
          <button className="toolbar-button" onClick={() => onCopy?.(output, "Logs")}>
            <Copy size={16} />
            Copiar
          </button>
        )}
        {onToggleExpand && (
          <button
            className={`toolbar-button ${expanded ? "active" : ""}`}
            title={expanded ? "Reducir pantalla" : "Ampliar pantalla"}
            onClick={onToggleExpand}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {expanded ? "Reducir" : "Ampliar"}
          </button>
        )}
        {mode === "live" &&
          (streaming && onStop ? (
            <button className="toolbar-button danger" title="Cancelar kubectl logs en ejecucion" onClick={onStop}>
              <Square size={16} />
              Detener logs
            </button>
          ) : (
            onResume && (
              <button className="toolbar-button accent" title="Volver a ejecutar kubectl logs" onClick={onResume}>
                <RefreshCw size={16} />
                Recargar logs
              </button>
            )
          ))}
      </div>
    </div>
  );
}
