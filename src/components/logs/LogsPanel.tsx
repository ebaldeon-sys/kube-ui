import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ALL_LOG_CONTAINERS, LOG_OVERSCAN, LOG_ROW_H, MAX_RANGE_DAYS } from "../../app/constants";
import type { LogLevelFilter, LogsMeta, LogsMode } from "../../app/types";
import { toLocalInputValue } from "../../kubectl/logs";
import { LogDetail } from "./LogDetail";
import { LogRows } from "./LogRows";
import { LogsRangeBar } from "./LogsRangeBar";
import { LogsSearchBar } from "./LogsSearchBar";
import { LogsTargetBar } from "./LogsTargetBar";
import { LogsToolbar } from "./LogsToolbar";
import { createParseCache, levelBucket } from "./logParsing";
import { useLevelCounts } from "./useLevelCounts";

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

  // Cache de parseo estable (creado una sola vez): cada linea se parsea una vez.
  const getParsedRef = useRef<ReturnType<typeof createParseCache>>();
  if (!getParsedRef.current) getParsedRef.current = createParseCache();
  const getParsed = getParsedRef.current;

  const { levelCounts, levelCountsReady } = useLevelCounts(lines, pretty, getParsed);

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

  // Ref al ultimo onQueryChange para evitar stale closure sin re-suscribir el
  // listener de teclado en cada render.
  const onQueryChangeRef = useRef(onQueryChange);
  onQueryChangeRef.current = onQueryChange;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (searchDisabled) return;
        setSearchOpen(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        onQueryChangeRef.current?.("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen, searchDisabled]);

  useEffect(
    () => () => {
      resizeCleanupRef.current?.();
    },
    []
  );

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
    const next = activeLevelFilters.includes(level) ? activeLevelFilters.filter((item) => item !== level) : [...activeLevelFilters, level];
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

  const toggleSelect = useCallback((index: number) => setSelected((current) => (current === index ? null : index)), []);

  const hasContainerSelector = containerNames.length > 1 && Boolean(onContainerChange);
  const selectedContainerValue =
    selectedContainer === ALL_LOG_CONTAINERS || containerNames.includes(selectedContainer) ? selectedContainer : defaultContainer;
  const lineSummary = activeLevelFilters.length
    ? `${displayIndexes.length.toLocaleString()} de ${lines.length.toLocaleString()} líneas`
    : `${lines.length.toLocaleString()} líneas`;

  return (
    <div className="output-panel logs-panel">
      <LogsToolbar
        title={title}
        onBack={onBack}
        mode={mode}
        onModeChange={onModeChange}
        since={since}
        onSinceChange={onSinceChange}
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((value) => !value);
          window.setTimeout(() => searchInputRef.current?.focus(), 0);
        }}
        searchDisabled={searchDisabled}
        pretty={pretty}
        onPrettyChange={onPrettyChange}
        followTail={followTail}
        onToggleFollow={() => {
          if (followTail) setFollowTail(false);
          else scrollToBottom();
        }}
        onScrollToBottom={scrollToBottom}
        atBottom={atBottom}
        hasLines={lines.length > 0}
        following={following}
        pinned={pinned}
        onPinnedChange={onPinnedChange}
        output={output}
        onCopy={onCopy}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        streaming={streaming}
        onStop={onStop}
        onResume={onResume}
        searchInputRef={searchInputRef}
      />

      <LogsTargetBar
        hasContainerSelector={hasContainerSelector}
        containerNames={containerNames}
        selectedContainerValue={selectedContainerValue}
        defaultContainer={defaultContainer}
        streaming={streaming}
        onContainerChange={onContainerChange}
        pretty={pretty}
        activeLevelSet={activeLevelSet}
        onToggleLevel={toggleLevelFilter}
        levelCounts={levelCounts}
        levelCountsReady={levelCountsReady}
        lineSummary={lineSummary}
        linesLength={lines.length}
        meta={meta}
      />

      {mode === "query" && (
        <LogsRangeBar
          start={start}
          end={end}
          startMin={startMin}
          startMax={startMax}
          endMin={endMin}
          endMax={endMax}
          streaming={streaming}
          onStartChange={onStartChange}
          onEndChange={onEndChange}
          onQuery={onQuery}
        />
      )}

      {searchOpen && (
        <LogsSearchBar
          inputRef={searchInputRef}
          query={query}
          term={term}
          matchCount={matches.length}
          activeMatch={activeMatch}
          onQueryChange={onQueryChange}
          onPrev={goPrev}
          onNext={goNext}
          onClose={() => {
            setSearchOpen(false);
            onQueryChange?.("");
          }}
        />
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
        <div className="logs-empty">{streaming ? (mode === "query" ? "Consultando…" : "Esperando logs…") : "Sin logs"}</div>
      ) : pretty && total === 0 ? (
        <div className="logs-empty">Sin líneas para los filtros activos</div>
      ) : (
        <LogRows
          scrollRef={scrollRef}
          onScroll={onScroll}
          pretty={pretty}
          lines={lines}
          displayIndexes={displayIndexes}
          visible={visible}
          startIndex={startIndex}
          totalHeight={totalHeight}
          getParsed={getParsed}
          term={term}
          matchSet={matchSet}
          currentLine={currentLine}
          selected={selected}
          onToggleSelect={toggleSelect}
        />
      )}

      {selectedEntry && (
        <LogDetail
          entry={selectedEntry}
          rawLine={selectedRawLine}
          height={detailHeight}
          onResizeStart={startDetailResize}
          onCopy={onCopy}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
