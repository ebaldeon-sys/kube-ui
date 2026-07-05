import type { LogLevelFilter, LogsPrefs } from "./types";

// Modo Live (-f): el log crece para siempre, asi que mantenemos un ring buffer.
export const MAX_LIVE_LINES = 5000;
// Modo Consulta (historico): cargamos toda la ventana, con un tope de seguridad.
export const MAX_QUERY_LINES = 50000;
// Ancho maximo del rango (Inicio -> Fin) permitido en la consulta historica.
export const MAX_RANGE_DAYS = 3;
// Intervalo de agrupacion de chunks de logs antes de pintar.
export const LOG_FLUSH_MS = 60;
// Virtualizacion: alto fijo de cada fila (px) y filas extra fuera de viewport.
export const LOG_ROW_H = 24;
export const LOG_OVERSCAN = 12;
// Virtualizacion de la tabla de recursos: alto de fila (coincide con th/td) y overscan.
export const TABLE_ROW_H = 40;
export const TABLE_OVERSCAN = 10;
export const ALL_LOG_CONTAINERS = "__all__";
export const MAX_TABS = 12;

export const LOG_LEVEL_FILTERS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: "ERROR", label: "Error" },
  { value: "WARN", label: "Warn" },
  { value: "INFO", label: "Info" },
  { value: "DEBUG", label: "Debug" },
  { value: "TRACE", label: "Trace" },
  { value: "OTHER", label: "Otros" }
];

export const SINCE_OPTIONS: { label: string; value: string }[] = [
  { label: "Todo", value: "" },
  { label: "1 min", value: "1m" },
  { label: "5 min", value: "5m" },
  { label: "15 min", value: "15m" },
  { label: "30 min", value: "30m" },
  { label: "1 hora", value: "1h" },
  { label: "6 horas", value: "6h" },
  { label: "24 horas", value: "24h" }
];

export function createDefaultLogsPrefs(): LogsPrefs {
  return {
    mode: "live",
    since: "5m",
    start: "",
    end: "",
    container: "",
    pretty: true,
    query: "",
    activeLevelFilters: []
  };
}

export function emptyLevelCounts(): Record<LogLevelFilter, number> {
  return {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    DEBUG: 0,
    TRACE: 0,
    OTHER: 0
  };
}
