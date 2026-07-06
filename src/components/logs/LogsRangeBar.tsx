import { Search } from "lucide-react";
import { MAX_RANGE_DAYS } from "../../app/constants";

type Props = {
  start: string;
  end: string;
  startMin?: string;
  startMax: string;
  endMin?: string;
  endMax: string;
  streaming?: boolean;
  onStartChange?: (value: string) => void;
  onEndChange?: (value: string) => void;
  onQuery?: () => void;
};

export function LogsRangeBar({ start, end, startMin, startMax, endMin, endMax, streaming, onStartChange, onEndChange, onQuery }: Props) {
  return (
    <div className="logs-rangebar">
      <label>
        Inicio
        <input
          type="datetime-local"
          value={start}
          min={startMin}
          max={startMax}
          onChange={(event) => onStartChange?.(event.target.value)}
        />
      </label>
      <label>
        Fin
        <input type="datetime-local" value={end} min={endMin} max={endMax} onChange={(event) => onEndChange?.(event.target.value)} />
      </label>
      <button className="toolbar-button accent" onClick={() => onQuery?.()} disabled={streaming}>
        <Search size={16} />
        Consultar
      </button>
      <span className="logs-range-hint">Rango máximo {MAX_RANGE_DAYS} días entre Inicio y Fin · sujeto a la retención del nodo</span>
    </div>
  );
}
