import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import type { RefObject } from "react";

type Props = {
  inputRef: RefObject<HTMLInputElement>;
  query: string;
  term: string;
  matchCount: number;
  activeMatch: number;
  onQueryChange?: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
};

export function LogsSearchBar({ inputRef, query, term, matchCount, activeMatch, onQueryChange, onPrev, onNext, onClose }: Props) {
  return (
    <div className="logs-search">
      <Search size={15} />
      <input
        ref={inputRef}
        value={query}
        placeholder="Buscar en los logs..."
        spellCheck={false}
        onChange={(event) => onQueryChange?.(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
          } else if (event.key === "Escape") {
            onClose();
          }
        }}
      />
      <span className="logs-search-count">
        {term ? (matchCount ? `${Math.min(activeMatch, matchCount - 1) + 1}/${matchCount}` : "0/0") : ""}
      </span>
      <button className="logs-search-btn" title="Anterior (Shift+Enter)" onClick={onPrev} disabled={!matchCount}>
        <ChevronUp size={16} />
      </button>
      <button className="logs-search-btn" title="Siguiente (Enter)" onClick={onNext} disabled={!matchCount}>
        <ChevronDown size={16} />
      </button>
      <button className="logs-search-btn" title="Cerrar (Esc)" onClick={onClose}>
        <X size={16} />
      </button>
    </div>
  );
}
