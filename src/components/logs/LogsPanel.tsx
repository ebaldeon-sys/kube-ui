import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Copy, Maximize2, Minimize2, Pin, Play, RefreshCw, Search, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_LOG_CONTAINERS, LOG_LEVEL_FILTERS, LOG_OVERSCAN, LOG_ROW_H, MAX_RANGE_DAYS, SINCE_OPTIONS, emptyLevelCounts } from "../../app/constants";
import type { LogLevelFilter, LogsMeta, LogsMode } from "../../app/types";
import { K8S_TS_RE, toLocalInputValue } from "../../kubectl/logs";

type ParsedLog = {
  time?: string;
  level?: string;
  message: string;
  source?: string;
  json?: Record<string, unknown>;
};

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    let value = obj[key];
    if ((value === undefined || value === null || value === "") && key.includes(".")) {
      value = key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, obj);
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function formatTime(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function parseLogLine(line: string): ParsedLog {
  // `--timestamps` antepone un RFC3339; lo separamos para usarlo como hora real.
  let rest = line;
  let k8sTime: string | undefined;
  const tsMatch = K8S_TS_RE.exec(line);
  if (tsMatch) {
    k8sTime = formatTime(tsMatch[1]);
    rest = line.slice(tsMatch[0].length);
  }
  const trimmed = rest.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { time: k8sTime, message: rest };
  }
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const level = pick(json, ["level", "severity.text", "severity_text", "loglevel", "status", "lvl", "log.level"]);
    const message = pick(json, ["message", "msg", "log", "text"]);
    const source = pick(json, ["logger.name", "logger_name", "service.name", "k8s.container.name", "thread.name"]);
    return {
      time: formatTime(pick(json, ["@timestamp", "timestamp", "time", "ts", "@t"])) ?? k8sTime,
      level: level ? String(level).toUpperCase() : undefined,
      message: message !== undefined ? String(message) : trimmed,
      source: source ? String(source) : undefined,
      json
    };
  } catch {
    return { time: k8sTime, message: rest };
  }
}

function levelClass(level?: string): string {
  if (!level) return "";
  if (level.startsWith("ERR") || level === "FATAL" || level === "SEVERE") return "log-error";
  if (level.startsWith("WARN")) return "log-warn";
  if (level === "INFO") return "log-info";
  if (level === "DEBUG") return "log-debug";
  if (level === "TRACE") return "log-trace";
  return "";
}

function levelBucket(level?: string): LogLevelFilter {
  if (!level) return "OTHER";
  if (level.startsWith("ERR") || level === "FATAL" || level === "SEVERE") return "ERROR";
  if (level.startsWith("WARN")) return "WARN";
  if (level === "INFO") return "INFO";
  if (level === "DEBUG") return "DEBUG";
  if (level === "TRACE") return "TRACE";
  return "OTHER";
}

function highlightText(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const nodes: Array<string | JSX.Element> = [];
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) nodes.push(text.slice(from, index));
    nodes.push(
      <mark key={`${index}-${from}`} className="log-hit">
        {text.slice(index, index + needle.length)}
      </mark>
    );
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  nodes.push(text.slice(from));
  return nodes;
}

export function LogsPanel({
  title,
  output,
  streaming,
  following,
  mode = "live",
  onModeChange,
  since,
  onSinceChange,
  start = "",
  end = "",
  onStartChange,
  onEndChange,
  onQuery,
  notice,
  meta,
  containerNames = [],
  selectedContainer = "",
  defaultContainer = "",
  pinned = false,
  pretty = true,
  onPrettyChange,
  query = "",
  onQueryChange,
  activeLevelFilters = [],
  onActiveLevelFiltersChange,
  onContainerChange,
  onPinnedChange,
  expanded,
  onToggleExpand,
  onCopy,
  onBack,
  onResume,
  onStop
}: {
  title: string;
  output: string;
  streaming?: boolean;
  following?: boolean;
  mode?: LogsMode;
  onModeChange?: (mode: LogsMode) => void;
  since?: string;
  onSinceChange?: (value: string) => void;
  start?: string;
  end?: string;
  onStartChange?: (value: string) => void;
  onEndChange?: (value: string) => void;
  onQuery?: () => void;
  notice?: string;
  meta?: LogsMeta;
  containerNames?: string[];
  selectedContainer?: string;
  defaultContainer?: string;
  pinned?: boolean;
  pretty?: boolean;
  onPrettyChange?: (value: boolean) => void;
  query?: string;
  onQueryChange?: (value: string) => void;
  activeLevelFilters?: LogLevelFilter[];
  onActiveLevelFiltersChange?: (value: LogLevelFilter[]) => void;
  onContainerChange?: (value: string) => void;
  onPinnedChange?: (value: boolean) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCopy?: (text: string, label?: string) => void;
  onBack?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailHeight, setDetailHeight] = useState(180);
  const [detailTab, setDetailTab] = useState<"message" | "json" | "raw" | "fields">("message");
  const [levelCounts, setLevelCounts] = useState<Record<LogLevelFilter, number>>(() => emptyLevelCounts());
  const [levelCountsReady, setLevelCountsReady] = useState(true);
  const [followTail, setFollowTail] = useState(true);
  const [atBottom, setAtBottom] = useState(true);

  // Virtualizacion: solo renderizamos las filas visibles del scroll.
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const lines = useMemo(() => output.split("\n").filter((line) => line.trim().length > 0), [output]);

  // Cache de parseo: cada linea se parsea una sola vez (no en cada render).
  const parseCache = useRef<Map<string, ParsedLog>>(new Map());
  const levelCountRef = useRef<{
    length: number;
    first: string;
    last: string;
    counts: Record<LogLevelFilter, number>;
  } | null>(null);
  const getParsed = useCallback((line: string) => {
    const cache = parseCache.current;
    let entry = cache.get(line);
    if (!entry) {
      if (cache.size > 200_000) cache.clear();
      entry = parseLogLine(line);
      cache.set(line, entry);
    }
    return entry;
  }, []);

  const term = query.trim();
  // La busqueda se habilita solo cuando el log esta fijo (no en streaming).
  // En seguimiento en vivo (preset) se permite; en "Todo"/historico se espera al fin.
  const searchDisabled = Boolean(streaming && !following);

  // Restricciones del selector de rango: el ancho Inicio->Fin no puede superar
  // MAX_RANGE_DAYS, y ninguno puede estar en el futuro.
  const nowLocal = toLocalInputValue(new Date());
  const rangeMs = MAX_RANGE_DAYS * 86_400_000;
  const minLocal = (a: string, b: string) => (a < b ? a : b);
  const startMax = end ? minLocal(end, nowLocal) : nowLocal;
  const startMin = end ? toLocalInputValue(new Date(new Date(end).getTime() - rangeMs)) : undefined;
  const endMin = start || undefined;
  const endMax = start ? minLocal(toLocalInputValue(new Date(new Date(start).getTime() + rangeMs)), nowLocal) : nowLocal;

  const activeLevelSet = useMemo(() => new Set(activeLevelFilters), [activeLevelFilters]);
  const displayIndexes = useMemo(() => {
    if (!pretty || !activeLevelSet.size) return lines.map((_, index) => index);
    const result: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (activeLevelSet.has(levelBucket(getParsed(lines[i]).level))) result.push(i);
    }
    return result;
  }, [lines, pretty, activeLevelSet, getParsed]);

  useEffect(() => {
    if (!pretty) {
      setLevelCounts(emptyLevelCounts());
      setLevelCountsReady(true);
      levelCountRef.current = null;
      return;
    }

    let cancelled = false;
    const previous = levelCountRef.current;
    const canContinue =
      previous &&
      previous.length > 0 &&
      previous.length <= lines.length &&
      lines[0] === previous.first &&
      lines[previous.length - 1] === previous.last;
    const counts = canContinue ? { ...previous.counts } : emptyLevelCounts();
    const first = lines[0] ?? "";
    let index = 0;
    let timer = 0;

    if (canContinue) index = previous.length;
    setLevelCounts({ ...counts });
    setLevelCountsReady(index >= lines.length);

    const step = () => {
      const limit = Math.min(lines.length, index + 1200);
      for (; index < limit; index++) {
        counts[levelBucket(getParsed(lines[index]).level)]++;
      }
      if (cancelled) return;

      levelCountRef.current = {
        length: index,
        first,
        last: lines[index - 1] ?? "",
        counts: { ...counts }
      };
      setLevelCounts({ ...counts });
      if (index < lines.length) {
        timer = window.setTimeout(step, 0);
      } else {
        setLevelCountsReady(true);
      }
    };

    timer = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lines, pretty, getParsed]);

  const matches = useMemo(() => {
    const needle = term.toLowerCase();
    if (!needle) return [] as number[];
    const result: number[] = [];
    for (const index of displayIndexes) {
      const haystack = pretty
        ? (() => {
            const entry = getParsed(lines[index]);
            return `${entry.time ?? ""} ${entry.level ?? ""} ${entry.message} ${entry.source ?? ""}`.toLowerCase();
          })()
        : lines[index].toLowerCase();
      if (haystack.includes(needle)) result.push(index);
    }
    return result;
  }, [displayIndexes, lines, pretty, term, getParsed]);

  const matchSet = useMemo(() => new Set(matches), [matches]);
  const currentLine = matches.length ? matches[Math.min(activeMatch, matches.length - 1)] : -1;

  const total = displayIndexes.length;
  const totalHeight = total * LOG_ROW_H;
  const startIndex = Math.max(0, Math.floor(scrollTop / LOG_ROW_H) - LOG_OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportH) / LOG_ROW_H) + LOG_OVERSCAN);
  const visible: number[] = [];
  for (let i = startIndex; i < endIndex; i++) visible.push(i);

  useEffect(() => {
    setActiveMatch(0);
  }, [query]);

  // Medir alto del viewport del scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    setViewportH(el.clientHeight);
    return () => observer.disconnect();
  }, [pretty]);

  // Auto-scroll al final mientras llegan logs (si el usuario esta al fondo).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (followTail) {
      el.scrollTop = el.scrollHeight;
      setScrollTop(el.scrollTop);
      setAtBottom(true);
    }
  }, [total, pretty, followTail]);

  // Llevar la fila de la coincidencia activa al centro del viewport.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || currentLine < 0) return;
    stickRef.current = false;
    setFollowTail(false);
    el.scrollTop = Math.max(0, currentLine * LOG_ROW_H - el.clientHeight / 2);
    setScrollTop(el.scrollTop);
  }, [currentLine]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (searchDisabled) return;
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        onQueryChange?.("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, searchDisabled]);

  useEffect(() => () => {
    resizeCleanupRef.current?.();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const nextAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < LOG_ROW_H * 2;
    stickRef.current = nextAtBottom;
    setAtBottom(nextAtBottom);
    if (!nextAtBottom && followTail) setFollowTail(false);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setScrollTop(el.scrollTop);
    setAtBottom(true);
    setFollowTail(true);
    stickRef.current = true;
  };

  const toggleLevelFilter = (level: LogLevelFilter) => {
    const next = activeLevelFilters.includes(level)
      ? activeLevelFilters.filter((item) => item !== level)
      : [...activeLevelFilters, level];
    onActiveLevelFiltersChange?.(next);
  };

  const goNext = () => {
    if (matches.length) setActiveMatch((current) => (current + 1) % matches.length);
  };
  const goPrev = () => {
    if (matches.length) setActiveMatch((current) => (current - 1 + matches.length) % matches.length);
  };

  const selectedRawLine = selected != null && lines[selected] ? lines[selected] : "";
  const selectedEntry = selectedRawLine ? getParsed(selectedRawLine) : null;

  useEffect(() => {
    if (!selectedEntry) return;
    setDetailTab(selectedEntry.json ? "message" : "raw");
  }, [selectedEntry]);

  const startDetailResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();
    const startY = event.clientY;
    const startHeight = detailHeight;
    const maxHeight = Math.max(180, window.innerHeight - 260);

    const onMove = (moveEvent: PointerEvent) => {
      const next = startHeight + startY - moveEvent.clientY;
      setDetailHeight(Math.min(Math.max(next, 110), maxHeight));
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", cleanup);
      resizeCleanupRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", cleanup, { once: true });
    resizeCleanupRef.current = cleanup;
  };

  const hasContainerSelector = containerNames.length > 1 && Boolean(onContainerChange);
  const selectedContainerValue =
    selectedContainer === ALL_LOG_CONTAINERS || containerNames.includes(selectedContainer)
      ? selectedContainer
      : defaultContainer;
  const lineSummary = activeLevelFilters.length
    ? `${displayIndexes.length.toLocaleString()} de ${lines.length.toLocaleString()} líneas`
    : `${lines.length.toLocaleString()} líneas`;
  const detailFields = selectedEntry?.json ? Object.entries(selectedEntry.json) : [];
  const detailContent =
    detailTab === "json" && selectedEntry?.json
      ? JSON.stringify(selectedEntry.json, null, 2)
      : detailTab === "fields" && selectedEntry?.json
        ? detailFields.map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join("\n")
        : detailTab === "message" && selectedEntry
          ? selectedEntry.message
          : selectedRawLine;

  return (
    <div className="output-panel logs-panel">
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
              <button
                className={`logs-mode-btn ${mode === "live" ? "active" : ""}`}
                onClick={() => onModeChange("live")}
              >
                En vivo
              </button>
              <button
                className={`logs-mode-btn ${mode === "query" ? "active" : ""}`}
                onClick={() => onModeChange("query")}
              >
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
            onClick={() => {
              setSearchOpen((value) => !value);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <Search size={16} />
            Buscar
          </button>
          {pretty && (
            <>
              <button
                className={`toolbar-button ${followTail ? "active" : ""}`}
                title={followTail ? "Auto-scroll activo: no detiene kubectl logs" : "Scroll manual: volver al final sin detener logs"}
                disabled={!lines.length}
                onClick={() => {
                  if (followTail) setFollowTail(false);
                  else scrollToBottom();
                }}
              >
                {followTail ? <ChevronDown size={16} /> : <Play size={16} />}
                {followTail ? "Auto-scroll" : "Scroll manual"}
              </button>
              <button className="toolbar-button" title="Ir al final del log" disabled={!lines.length || atBottom} onClick={scrollToBottom}>
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
                onClick={() => toggleLevelFilter(filter.value)}
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
          {pretty && !levelCountsReady && lines.length > 0 && <span>Analizando niveles...</span>}
          {meta?.target && <span>{meta.target}</span>}
          {meta?.truncated && <strong>Truncado a {meta.cap.toLocaleString()}</strong>}
        </div>
      </div>

      {mode === "query" && (
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
            <input
              type="datetime-local"
              value={end}
              min={endMin}
              max={endMax}
              onChange={(event) => onEndChange?.(event.target.value)}
            />
          </label>
          <button className="toolbar-button accent" onClick={() => onQuery?.()} disabled={streaming}>
            <Search size={16} />
            Consultar
          </button>
          <span className="logs-range-hint">Rango máximo {MAX_RANGE_DAYS} días entre Inicio y Fin · sujeto a la retención del nodo</span>
        </div>
      )}

      {searchOpen && (
        <div className="logs-search">
          <Search size={15} />
          <input
            ref={searchInputRef}
            value={query}
            placeholder="Buscar en los logs..."
            spellCheck={false}
            onChange={(event) => onQueryChange?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) goPrev();
                else goNext();
              } else if (event.key === "Escape") {
                setSearchOpen(false);
                onQueryChange?.("");
              }
            }}
          />
          <span className="logs-search-count">
            {term ? (matches.length ? `${Math.min(activeMatch, matches.length - 1) + 1}/${matches.length}` : "0/0") : ""}
          </span>
          <button className="logs-search-btn" title="Anterior (Shift+Enter)" onClick={goPrev} disabled={!matches.length}>
            <ChevronUp size={16} />
          </button>
          <button className="logs-search-btn" title="Siguiente (Enter)" onClick={goNext} disabled={!matches.length}>
            <ChevronDown size={16} />
          </button>
          <button
            className="logs-search-btn"
            title="Cerrar (Esc)"
            onClick={() => {
              setSearchOpen(false);
              onQueryChange?.("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {notice && <div className="logs-notice">{notice}</div>}
      {meta?.error && (
        <div className="logs-error">
          <AlertTriangle size={17} />
          <div>
            <strong>Error al ejecutar kubectl logs</strong>
            {meta.command && <code>{meta.command}</code>}
            <pre>{meta.error}</pre>
          </div>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="logs-empty">
          {streaming ? (mode === "query" ? "Consultando…" : "Esperando logs…") : "Sin logs"}
        </div>
      ) : pretty && total === 0 ? (
        <div className="logs-empty">Sin líneas para los filtros activos</div>
      ) : pretty ? (
        <div className="logs-vscroll" ref={scrollRef} onScroll={onScroll}>
          <div className="logs-vspace" style={{ height: totalHeight }}>
            <div className="logs-vrows" style={{ transform: `translateY(${startIndex * LOG_ROW_H}px)` }}>
              {visible.map((position) => {
                const index = displayIndexes[position];
                const entry = getParsed(lines[index]);
                const isJson = Boolean(entry.json);
                const isMatch = matchSet.has(index);
                const isCurrent = index === currentLine;
                return (
                  <div
                    key={index}
                    className={`log-vrow ${levelClass(entry.level)}${isMatch ? " is-match" : ""}${isCurrent ? " is-current" : ""}${selected === index ? " is-selected" : ""}${isJson ? " clickable" : ""}`}
                    style={{ height: LOG_ROW_H }}
                    onClick={() => setSelected((current) => (current === index ? null : index))}
                  >
                    {entry.time && <span className="log-time">{entry.time}</span>}
                    {entry.level && <span className={`log-level ${levelClass(entry.level)}`}>{entry.level}</span>}
                    <span className="log-message">{term ? highlightText(entry.message, term) : entry.message}</span>
                    {entry.source && <span className="log-source">{entry.source}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="logs-vscroll logs-raw-scroll" ref={scrollRef} onScroll={onScroll}>
          <div className="logs-vspace" style={{ height: totalHeight }}>
            <div className="logs-vrows" style={{ transform: `translateY(${startIndex * LOG_ROW_H}px)` }}>
              {visible.map((position) => {
                const index = displayIndexes[position];
                const line = lines[index];
                const isMatch = matchSet.has(index);
                const isCurrent = index === currentLine;
                return (
                  <div
                    key={index}
                    className={`log-vrow log-raw-row${isMatch ? " is-match" : ""}${isCurrent ? " is-current" : ""}${selected === index ? " is-selected" : ""}`}
                    style={{ height: LOG_ROW_H }}
                    onClick={() => setSelected((current) => (current === index ? null : index))}
                  >
                    <span className="log-raw-message">{term ? highlightText(line, term) : line}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {selectedEntry && (
        <div className="log-detail" style={{ height: detailHeight }}>
          <div
            className="log-detail-resizer"
            role="separator"
            aria-label="Redimensionar detalle de log"
            onPointerDown={startDetailResize}
          />
          <div className="log-detail-head">
            <span>Detalle de la línea</span>
            <div className="log-detail-tabs">
              <button className={detailTab === "message" ? "active" : ""} onClick={() => setDetailTab("message")}>
                Mensaje
              </button>
              <button className={detailTab === "json" ? "active" : ""} onClick={() => setDetailTab("json")} disabled={!selectedEntry.json}>
                JSON
              </button>
              <button className={detailTab === "fields" ? "active" : ""} onClick={() => setDetailTab("fields")} disabled={!selectedEntry.json}>
                Campos
              </button>
              <button className={detailTab === "raw" ? "active" : ""} onClick={() => setDetailTab("raw")}>
                Raw
              </button>
            </div>
            <div className="log-detail-actions">
              <button className="icon-button" title="Copiar línea" onClick={() => onCopy?.(selectedRawLine, "Línea")}>
                <Copy size={16} />
              </button>
              <button className="icon-button" title="Cerrar" onClick={() => setSelected(null)}>
                <X size={16} />
              </button>
            </div>
          </div>
          <pre>{detailContent}</pre>
        </div>
      )}
    </div>
  );
}

