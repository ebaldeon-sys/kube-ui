import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  ALL_LOG_CONTAINERS,
  LOG_FLUSH_MS,
  MAX_LIVE_LINES,
  MAX_QUERY_LINES,
  MAX_RANGE_DAYS,
  createDefaultLogsPrefs
} from "../app/constants";
import type { LogsMeta, LogsMode, LogsPrefs, StreamOwner, TabRunState, TabSession, ViewMode } from "../app/types";
import { formatKubectlCommand } from "../kubectl/format";
import { buildLogsArgs, capLines, defaultLogContainer, lineEpoch, podContainerNames, resolveLogContainer, toLocalInputValue } from "../kubectl/logs";
import { nameOf } from "../resources/helpers";

type StopStream = (opts?: { tabId?: string; state?: TabRunState; label?: string }) => boolean;

type UseLogsOptions = {
  activeTab: TabSession | undefined;
  kubeconfigPaths: string[];
  logBufferRef: MutableRefObject<string>;
  logFlushTimerRef: MutableRefObject<number | null>;
  setCurrentStreamOwner: (owner: StreamOwner | null) => void;
  setTabs: Dispatch<SetStateAction<TabSession[]>>;
  setViewMode: (mode: ViewMode) => void;
  stopStream: StopStream;
  stopStreamRef: MutableRefObject<(() => void) | null>;
  streamOwnerRef: MutableRefObject<StreamOwner | null>;
  updateActiveTab: (patch: Partial<TabSession>) => void;
  updateTab: (tabId: string, patch: Partial<TabSession>) => void;
  viewMode: ViewMode;
};

function createLogsMeta(cap = MAX_LIVE_LINES): LogsMeta {
  return {
    cap,
    truncated: false,
    error: "",
    command: "",
    target: ""
  };
}

export function useLogs({
  activeTab,
  kubeconfigPaths,
  logBufferRef,
  logFlushTimerRef,
  setCurrentStreamOwner,
  setTabs,
  setViewMode,
  stopStream,
  stopStreamRef,
  streamOwnerRef,
  updateActiveTab,
  updateTab,
  viewMode
}: UseLogsOptions) {
  const [logsNotice, setLogsNotice] = useState("");
  const [logsMeta, setLogsMeta] = useState<LogsMeta>(() => createLogsMeta());
  const lastLogSelectionRef = useRef<Record<string, string>>({});
  const activeLogsPrefs = activeTab?.logsPrefs ?? createDefaultLogsPrefs();
  const selectedPod = activeTab?.resource === "pods" ? activeTab.rows.find((item) => nameOf(item) === activeTab.selectedName) : undefined;
  const logContainerNames = useMemo(() => podContainerNames(selectedPod), [selectedPod]);
  const logDefaultContainer = useMemo(() => defaultLogContainer(selectedPod), [selectedPod]);

  const updateLogsPrefs = useCallback(
    (patch: Partial<LogsPrefs>) => {
      if (!activeTab) return;
      updateActiveTab({ logsPrefs: { ...(activeTab.logsPrefs ?? createDefaultLogsPrefs()), ...patch } });
    },
    [activeTab, updateActiveTab]
  );

  useEffect(() => {
    if (!activeTab) return;
    const previous = lastLogSelectionRef.current[activeTab.id];
    if (previous === activeTab.selectedName) return;
    lastLogSelectionRef.current[activeTab.id] = activeTab.selectedName;
    updateTab(activeTab.id, { logsPrefs: createDefaultLogsPrefs() });
    setLogsNotice("");
    setLogsMeta(createLogsMeta());
  }, [activeTab?.id, activeTab?.selectedName, updateTab]);

  const runLogs = useCallback(
    (override?: Partial<{ mode: LogsMode; since: string; start: string; end: string; container: string }>) => {
      if (!activeTab || !activeTab.selectedName) return;
      stopStream({ state: "stopped", label: "Reemplazado" });
      const prefs = activeTab.logsPrefs ?? createDefaultLogsPrefs();
      const mode = override?.mode ?? prefs.mode;
      const since = override?.since ?? prefs.since;
      const start = override?.start ?? prefs.start;
      const end = override?.end ?? prefs.end;
      const selectedPodForRun = activeTab.resource === "pods" ? activeTab.rows.find((item) => nameOf(item) === activeTab.selectedName) : undefined;
      const containerNames = podContainerNames(selectedPodForRun);
      const effectiveContainer = resolveLogContainer(selectedPodForRun, override?.container ?? prefs.container);
      const allContainers = effectiveContainer === ALL_LOG_CONTAINERS;
      const container = allContainers ? "" : effectiveContainer;
      const tabId = activeTab.id;
      const name = activeTab.selectedName;
      const nextLogsPrefs: LogsPrefs = { ...prefs, mode, since, start, end, container: effectiveContainer };
      const { args, startEpoch, endEpoch, follow } = buildLogsArgs(name, {
        mode,
        since,
        start,
        end,
        container,
        allContainers
      });
      const cap = follow ? MAX_LIVE_LINES : MAX_QUERY_LINES;
      const inverted = startEpoch != null && endEpoch != null && endEpoch < startEpoch;
      const formattedCommand = formatKubectlCommand(args, activeTab.context, activeTab.namespace);
      const target =
        containerNames.length > 1
          ? allContainers
            ? "Todos los contenedores"
            : `Contenedor ${container || defaultLogContainer(selectedPodForRun)}`
          : "";

      setLogsNotice("");
      setLogsMeta({
        cap,
        truncated: false,
        error: "",
        command: formattedCommand,
        target
      });
      updateActiveTab({
        loading: true,
        runState: "running",
        runLabel: follow ? "Logs en vivo" : "Consultando logs",
        outputTitle: `Logs ${name}`,
        output: "",
        lastCommand: formattedCommand,
        logsPrefs: nextLogsPrefs
      });
      setViewMode("logs");
      setCurrentStreamOwner({
        tabId,
        view: "logs",
        live: follow,
        pinned: activeTab.streamPinned,
        autoStopOnLeave: follow && !activeTab.streamPinned
      });
      logBufferRef.current = "";
      let accum = "";

      const flush = () => {
        const pending = logBufferRef.current;
        logBufferRef.current = "";
        if (!pending) return;
        const capped = capLines(accum + pending, cap);
        accum = capped.text;
        if (capped.truncated) {
          setLogsMeta((current) => (current.truncated ? current : { ...current, truncated: true }));
        }
        setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, output: accum } : tab)));
      };

      stopStreamRef.current = window.kubeui.streamKubectl(
        {
          args,
          kubeconfigPaths,
          context: activeTab.context,
          namespace: activeTab.namespace
        },
        {
          onData: (chunk) => {
            logBufferRef.current += chunk;
            if (logFlushTimerRef.current == null) {
              logFlushTimerRef.current = window.setTimeout(() => {
                logFlushTimerRef.current = null;
                flush();
              }, LOG_FLUSH_MS);
            }
          },
          onEnd: ({ command, error, code }) => {
            if (logFlushTimerRef.current != null) {
              window.clearTimeout(logFlushTimerRef.current);
              logFlushTimerRef.current = null;
            }
            flush();
            let merged = accum;
            if (endEpoch != null) {
              merged = merged
                .split("\n")
                .filter((ln) => {
                  const epoch = lineEpoch(ln);
                  return epoch == null || epoch <= endEpoch;
                })
                .join("\n");
            }
            const commandError = error || (code !== null && code !== 0 ? `kubectl logs terminó con código ${code}. El detalle devuelto por kubectl está en la salida.` : "");
            const finalOut = error ? (merged ? `${merged}\n${error}` : error) : merged;
            setTabs((current) =>
              current.map((tab) =>
                tab.id === tabId
                  ? {
                      ...tab,
                      loading: false,
                      runState: commandError ? "error" : "done",
                      runLabel: commandError ? "Error en logs" : "Logs terminados",
                      lastCommand: command || tab.lastCommand,
                      output: finalOut
                    }
                  : tab
              )
            );
            setLogsMeta((current) => ({
              ...current,
              command: command || current.command,
              error: commandError
            }));

            if (!commandError && mode === "query") {
              if (inverted) {
                setLogsNotice("El Fin es anterior al Inicio: no hay registros en ese rango.");
              } else if (merged.trim() === "") {
                setLogsNotice("Sin registros en el rango. kubectl solo ve lo que el nodo aun retiene (los logs rotan).");
              }
            }
            if (streamOwnerRef.current?.tabId === tabId) setCurrentStreamOwner(null);
            stopStreamRef.current = null;
          }
        }
      );
    },
    [
      activeTab,
      kubeconfigPaths,
      logBufferRef,
      logFlushTimerRef,
      setCurrentStreamOwner,
      setTabs,
      setViewMode,
      stopStream,
      stopStreamRef,
      streamOwnerRef,
      updateActiveTab
    ]
  );

  const changeLogsSince = useCallback(
    (value: string) => {
      updateLogsPrefs({ since: value });
      if (activeTab?.selectedName) runLogs({ since: value });
    },
    [activeTab?.selectedName, runLogs, updateLogsPrefs]
  );

  const changeLogsContainer = useCallback(
    (value: string) => {
      updateLogsPrefs({ container: value });
      if (activeTab?.selectedName && viewMode === "logs") runLogs({ container: value });
    },
    [activeTab?.selectedName, runLogs, updateLogsPrefs, viewMode]
  );

  const changeLogsPinned = useCallback(
    (value: boolean) => {
      if (!activeTab) return;
      updateActiveTab({ streamPinned: value });
      const owner = streamOwnerRef.current;
      if (owner?.tabId === activeTab.id && owner.view === "logs" && owner.live) {
        setCurrentStreamOwner({
          ...owner,
          pinned: value,
          autoStopOnLeave: !value
        });
      }
    },
    [activeTab, setCurrentStreamOwner, streamOwnerRef, updateActiveTab]
  );

  const changeLogsMode = useCallback(
    (mode: LogsMode) => {
      updateLogsPrefs({ mode });
      if (mode === "live") {
        if (activeTab?.selectedName) runLogs({ mode: "live" });
        return;
      }
      const start = activeLogsPrefs.start || toLocalInputValue(new Date(Date.now() - 1_800_000));
      const end = activeLogsPrefs.end || toLocalInputValue(new Date());
      updateLogsPrefs({ mode, start, end });
      if (activeTab?.selectedName) runLogs({ mode: "query", start, end });
    },
    [activeLogsPrefs.end, activeLogsPrefs.start, activeTab?.selectedName, runLogs, updateLogsPrefs]
  );

  const runLogsQuery = useCallback(() => {
    updateLogsPrefs({ mode: "query" });
    if (activeLogsPrefs.start && activeLogsPrefs.end) {
      const startMs = new Date(activeLogsPrefs.start).getTime();
      const endMs = new Date(activeLogsPrefs.end).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        if (endMs < startMs) {
          setLogsNotice("El Fin es anterior al Inicio.");
          return;
        }
        if (endMs - startMs > MAX_RANGE_DAYS * 86_400_000) {
          setLogsNotice(`El rango entre Inicio y Fin no puede superar ${MAX_RANGE_DAYS} días.`);
          return;
        }
      }
    }
    runLogs({ mode: "query" });
  }, [activeLogsPrefs.end, activeLogsPrefs.start, runLogs, updateLogsPrefs]);

  return {
    activeLogsPrefs,
    changeLogsContainer,
    changeLogsMode,
    changeLogsPinned,
    changeLogsSince,
    logsMeta,
    logsNotice,
    logContainerNames,
    logDefaultContainer,
    runLogs,
    runLogsQuery,
    updateLogsPrefs
  };
}
