import { Copy, X } from "lucide-react";
import { useEffect, useState, type PointerEvent } from "react";
import type { LogDetailTab, ParsedLog } from "./logParsing";

type Props = {
  entry: ParsedLog;
  rawLine: string;
  height: number;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onCopy?: (text: string, label?: string) => void;
  onClose: () => void;
};

export function LogDetail({ entry, rawLine, height, onResizeStart, onCopy, onClose }: Props) {
  // Al cambiar de linea, arrancar en "Mensaje" si es JSON o "Raw" si no lo es.
  const [detailTab, setDetailTab] = useState<LogDetailTab>(() => (entry.json ? "message" : "raw"));
  useEffect(() => {
    setDetailTab(entry.json ? "message" : "raw");
  }, [entry]);

  const fields = entry.json ? Object.entries(entry.json) : [];
  const content =
    detailTab === "json" && entry.json
      ? JSON.stringify(entry.json, null, 2)
      : detailTab === "fields" && entry.json
        ? fields.map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")
        : detailTab === "message"
          ? entry.message
          : rawLine;

  return (
    <div className="log-detail" style={{ height }}>
      <div className="log-detail-resizer" role="separator" aria-label="Redimensionar detalle de log" onPointerDown={onResizeStart} />
      <div className="log-detail-head">
        <span>Detalle de la línea</span>
        <div className="log-detail-tabs">
          <button className={detailTab === "message" ? "active" : ""} onClick={() => setDetailTab("message")}>
            Mensaje
          </button>
          <button className={detailTab === "json" ? "active" : ""} onClick={() => setDetailTab("json")} disabled={!entry.json}>
            JSON
          </button>
          <button className={detailTab === "fields" ? "active" : ""} onClick={() => setDetailTab("fields")} disabled={!entry.json}>
            Campos
          </button>
          <button className={detailTab === "raw" ? "active" : ""} onClick={() => setDetailTab("raw")}>
            Raw
          </button>
        </div>
        <div className="log-detail-actions">
          <button className="icon-button" title="Copiar línea" onClick={() => onCopy?.(rawLine, "Línea")}>
            <Copy size={16} />
          </button>
          <button className="icon-button" title="Cerrar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      <pre>{content}</pre>
    </div>
  );
}
