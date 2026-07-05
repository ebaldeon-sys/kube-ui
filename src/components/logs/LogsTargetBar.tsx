import { ChevronDown } from "lucide-react";
import { ALL_LOG_CONTAINERS, LOG_LEVEL_FILTERS } from "../../app/constants";
import type { LogLevelFilter, LogsMeta } from "../../app/types";

type Props = {
  hasContainerSelector: boolean;
  containerNames: string[];
  selectedContainerValue: string;
  defaultContainer: string;
  streaming?: boolean;
  onContainerChange?: (value: string) => void;
  pretty: boolean;
  activeLevelSet: Set<LogLevelFilter>;
  onToggleLevel: (level: LogLevelFilter) => void;
  levelCounts: Record<LogLevelFilter, number>;
  levelCountsReady: boolean;
  lineSummary: string;
  linesLength: number;
  meta?: LogsMeta;
};

export function LogsTargetBar({
  hasContainerSelector,
  containerNames,
  selectedContainerValue,
  defaultContainer,
  streaming,
  onContainerChange,
  pretty,
  activeLevelSet,
  onToggleLevel,
  levelCounts,
  levelCountsReady,
  lineSummary,
  linesLength,
  meta
}: Props) {
  return (
    <div className="logs-targetbar">
      {hasContainerSelector && (
        <label className="logs-target-control">
          Contenedor
          <span className="select-wrap">
            <select value={selectedContainerValue} onChange={(event) => onContainerChange?.(event.target.value)} disabled={streaming}>
              {containerNames.map((name) => (
                <option key={name} value={name}>
                  {name === defaultContainer ? `${name} (principal)` : name}
                </option>
              ))}
              <option value={ALL_LOG_CONTAINERS}>Todos</option>
            </select>
            <ChevronDown size={15} />
          </span>
        </label>
      )}
      {pretty && (
        <div className="logs-level-filters" aria-label="Filtrar por nivel">
          {LOG_LEVEL_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={`logs-filter-chip ${activeLevelSet.has(filter.value) ? "active" : ""}`}
              onClick={() => onToggleLevel(filter.value)}
              disabled={!activeLevelSet.has(filter.value) && (!levelCountsReady || !levelCounts[filter.value])}
              title={levelCountsReady ? `${levelCounts[filter.value].toLocaleString()} líneas` : "Calculando niveles..."}
            >
              {filter.label}
              <span>{levelCounts[filter.value].toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
      <div className="logs-summary">
        <span>{lineSummary}</span>
        {pretty && !levelCountsReady && linesLength > 0 && <span>Analizando niveles...</span>}
        {meta?.target && <span>{meta.target}</span>}
        {meta?.truncated && <strong>Truncado a {meta.cap.toLocaleString()}</strong>}
      </div>
    </div>
  );
}
