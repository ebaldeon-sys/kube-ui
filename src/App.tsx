import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileCode2,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  SquareTerminal,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_TABS } from "./app/constants";
import { createTab } from "./app/createTab";
import type {
  KubeItem,
  ResourceKey,
  ResourceSnapshot,
  TabRunState,
  TabSession,
  ViewMode
} from "./app/types";
import { LogsPanel } from "./components/logs/LogsPanel";
import { ApplyPanel, OutputPanel, TerminalPanel } from "./components/output/Panels";
import { ResourceTable } from "./components/resources/ResourceTable";
import { EmptyWorkspace, MissingBridge, SettingsView } from "./components/workspace/WorkspaceStates";
import { RESOURCE_CATEGORIES, configByKey, resourceConfigs } from "./config/resources";
import { useClipboard } from "./hooks/useClipboard";
import { useDialogs } from "./hooks/useDialogs";
import { useLogs } from "./hooks/useLogs";
import { useResources } from "./hooks/useResources";
import { useStream } from "./hooks/useStream";
import { useTabs } from "./hooks/useTabs";
import { formatKubectlCommand, isUnsupportedInteractiveCommand, kubectlErrorText, kubectlOutput, kubectlSuccessText, unknownMessage } from "./kubectl/format";
import { nameOf } from "./resources/helpers";
import type { KubeconfigInspection, KubectlResult, Settings as AppSettings } from "./types";

function runStateText(state: TabRunState): string {
  if (state === "running") return "Ejecutando";
  if (state === "done") return "Terminado";
  if (state === "stopped") return "Detenido";
  if (state === "error") return "Error";
  return "Sin actividad";
}

export function App() {
  if (!window.kubeui) {
    return <MissingBridge />;
  }

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [kubeconfigInfos, setKubeconfigInfos] = useState<KubeconfigInspection[]>([]);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [kubectlStatus, setKubectlStatus] = useState<KubectlResult | null>(null);
  const [contexts, setContexts] = useState<string[]>([]);
  const [contextNamespaces, setContextNamespaces] = useState<Record<string, string>>({});
  const [namespacesByContext, setNamespacesByContext] = useState<Record<string, string[]>>({});
  const { tabs, setTabs, activeTabId, setActiveTabId, activeTab, viewMode, updateActiveTab, updateTab, setViewMode } = useTabs();
  const [globalMessage, setGlobalMessage] = useState("");
  const { toastMessage, copyToClipboard } = useClipboard(setGlobalMessage);
  const [namespaceDraft, setNamespaceDraft] = useState("");
  const { streamOwner, streamOwnerRef, stopStreamRef, logBufferRef, logFlushTimerRef, setCurrentStreamOwner, stopStream } = useStream(setTabs);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Vista ampliada de logs: oculta tabstrip, sidebar, barra de sesion y statusbar.
  const [logsExpanded, setLogsExpanded] = useState(false);
  // Vista a la que regresar al cerrar la configuracion (kubeconfig).
  const [settingsReturn, setSettingsReturn] = useState<ViewMode>("table");
  const { detailDialog, setDetailDialog, confirmDialog, setConfirmDialog, inputDialog, setInputDialog, requestConfirm, requestInput } = useDialogs();
  // Token incremental por pestaña para acciones puntuales
  // (describe / yaml / editar / delete...). Permite que una pestaña termine
  // en segundo plano sin que otra pestaña invalide su resultado.
  const actionTokenRef = useRef<Record<string, number>>({});
  const nextActionToken = useCallback((tabId: string) => {
    const next = (actionTokenRef.current[tabId] ?? 0) + 1;
    actionTokenRef.current[tabId] = next;
    return next;
  }, []);

  const cancelTabAction = useCallback((tabId: string) => {
    actionTokenRef.current[tabId] = (actionTokenRef.current[tabId] ?? 0) + 1;
  }, []);

  const isTabActionCurrent = useCallback((tabId: string, token: number) => actionTokenRef.current[tabId] === token, []);

  const activeStreamOwner = streamOwner?.tabId === activeTabId ? streamOwner : null;
  const streaming = Boolean(activeStreamOwner);
  const kubeconfigPaths = useMemo(() => settings?.kubeconfigPaths ?? [], [settings]);
  const { loadResources } = useResources({ kubeconfigPaths, setGlobalMessage, setTabs, updateTab });
  const {
    activeLogsPrefs,
    changeLogsContainer,
    changeLogsMode,
    changeLogsPinned,
    changeLogsSince,
    logContainerNames,
    logDefaultContainer,
    logsMeta,
    logsNotice,
    runLogs,
    runLogsQuery,
    updateLogsPrefs
  } = useLogs({
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
  });
  const selectedName = activeTab?.selectedName ?? "";
  const selectedConfig = activeTab ? configByKey[activeTab.resource] : resourceConfigs[0];

  const run = useCallback(
    (tab: TabSession | undefined, args: string[], namespaceOverride?: string) =>
      window.kubeui.runKubectl({
        args,
        kubeconfigPaths,
        context: tab?.context,
        namespace: namespaceOverride ?? (tab && configByKey[tab.resource].namespaced ? tab.namespace : undefined)
      }),
    [kubeconfigPaths]
  );

  const showAppError = useCallback((title: string, error: unknown) => {
    setGlobalMessage(`${title}: ${unknownMessage(error)}`);
  }, []);

  const refreshKubeconfigInfos = useCallback(async () => {
    if (!settings) return;
    setSettingsBusy(true);
    try {
      const infos = await window.kubeui.inspectKubeconfigs();
      setKubeconfigInfos(infos);
    } catch (error) {
      showAppError("No se pudieron validar los kubeconfig", error);
    } finally {
      setSettingsBusy(false);
    }
  }, [settings, showAppError]);

  const refreshContexts = useCallback(async () => {
    let result: KubectlResult;
    try {
      result = await window.kubeui.runKubectl({
        args: ["config", "view", "-o", "json"],
        kubeconfigPaths
      });
    } catch (error) {
      setContexts([]);
      setContextNamespaces({});
      showAppError("No se pudieron leer los contextos", error);
      return;
    }
    if (!result.ok) {
      setContexts([]);
      setContextNamespaces({});
      setGlobalMessage(kubectlErrorText(result, "No se pudieron leer los contextos."));
      return;
    }
    let parsed: { contexts?: { name?: string; context?: { namespace?: string } }[] } = {};
    try {
      parsed = JSON.parse(result.stdout) as typeof parsed;
    } catch {
      parsed = {};
    }
    const entries = (parsed.contexts ?? []).filter((entry): entry is { name: string; context?: { namespace?: string } } => Boolean(entry?.name));
    const nextContexts = entries.map((entry) => entry.name);
    // El kubeconfig define un namespace por contexto: lo leemos aunque el cluster no permita listar namespaces.
    const nsMap: Record<string, string> = {};
    for (const entry of entries) {
      const ns = entry.context?.namespace;
      if (ns) nsMap[entry.name] = ns;
    }
    setContexts(nextContexts);
    setContextNamespaces(nsMap);
    setGlobalMessage(nextContexts.length || !kubeconfigPaths.length ? "" : "No se encontraron contextos en los kubeconfig registrados.");
    setTabs((current) => {
      if (!nextContexts.length) return current;
      if (!current.length) {
        const initial = createTab(nextContexts[0], nsMap[nextContexts[0]]);
        setActiveTabId(initial.id);
        return [initial];
      }
      // Mantener cada pestaña apuntando a un contexto valido del kubeconfig actual.
      return current.map((tab) =>
        nextContexts.includes(tab.context)
          ? tab
          : { ...tab, context: nextContexts[0], title: nextContexts[0], namespace: nsMap[nextContexts[0]] ?? "default", rows: [], selectedName: "", selectedNames: [] }
      );
    });
  }, [kubeconfigPaths, showAppError]);

  const refreshNamespaces = useCallback(
    async (context: string) => {
      if (!context) return;
      let result: KubectlResult;
      try {
        result = await window.kubeui.runKubectl({
          args: ["get", "namespaces", "-o", "json"],
          kubeconfigPaths,
          context
        });
      } catch {
        return;
      }
      if (!result.ok) return;
      let payload: { items?: KubeItem[] };
      try {
        payload = JSON.parse(result.stdout) as { items?: KubeItem[] };
      } catch {
        return;
      }
      const namespaces = (payload.items ?? []).map(nameOf).filter(Boolean);
      setNamespacesByContext((current) => ({
        ...current,
        [context]: Array.from(new Set([...(current[context] ?? []), ...namespaces]))
      }));
    },
    [kubeconfigPaths]
  );

  useEffect(() => {
    window.kubeui.getSettings().then(setSettings).catch((error) => showAppError("No se pudo leer la configuracion", error));
  }, [showAppError]);

  useEffect(() => {
    if (!settings) return;
    window.kubeui.runKubectl({ args: ["version", "--client"], kubeconfigPaths }).then(setKubectlStatus).catch((error) =>
      setKubectlStatus({
        ok: false,
        code: null,
        stdout: "",
        stderr: unknownMessage(error),
        command: "kubectl version --client"
      })
    );
    refreshContexts();
  }, [settings, kubeconfigPaths, refreshContexts]);

  useEffect(() => {
    if (viewMode === "settings" && settings) {
      refreshKubeconfigInfos();
    }
  }, [viewMode, settings, refreshKubeconfigInfos]);

  useEffect(() => {
    if (activeTab?.context && !namespacesByContext[activeTab.context]) {
      refreshNamespaces(activeTab.context);
    }
  }, [activeTab?.context, namespacesByContext, refreshNamespaces]);

  // Mantener el campo editable de namespace en sincronia con la pestana activa.
  useEffect(() => {
    setNamespaceDraft(activeTab?.namespace ?? "");
  }, [activeTab?.id, activeTab?.namespace]);

  // Detener cualquier streaming activo al cerrar la app.
  useEffect(
    () => () => {
      stopStream();
    },
    [stopStream]
  );

  // Al cambiar de pestaña solo detenemos streams vivos no fijados. Los comandos
  // finitos pueden terminar en segundo plano y actualizar su propia pestaña.
  useEffect(() => {
    const owner = streamOwnerRef.current;
    if (owner?.tabId !== activeTabId && owner?.autoStopOnLeave) {
      stopStream({ tabId: owner.tabId, state: "stopped", label: "Detenido al cambiar de pestaña" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // Al salir de logs/terminal, los streams vivos no fijados se detienen; los
  // fijados o finitos pueden seguir y conservar su salida en la pestaña.
  useEffect(() => {
    const owner = streamOwnerRef.current;
    if (owner?.tabId === activeTabId && owner.autoStopOnLeave && viewMode !== owner.view) {
      stopStream({ tabId: owner.tabId, state: "stopped", label: "Detenido al cambiar de vista" });
    }
  }, [activeTabId, viewMode, stopStream]);

  // Al salir de la vista de logs, salir tambien del modo ampliado.
  useEffect(() => {
    if (viewMode !== "logs") setLogsExpanded(false);
  }, [viewMode]);

  // Carga automatica de recursos al cambiar de pestana, contexto, namespace o tipo de recurso.
  // Si el kind ya tiene datos en cache (el usuario ya lo vio antes) no recarga automaticamente;
  // el usuario puede pulsar Refrescar explicitamente.
  useEffect(() => {
    if (!activeTab || !activeTab.context) return;
    if (viewMode !== "table") return;
    // Solo cargar si no hay datos. Si el cache ya los trajo al cambiar de kind,
    // o si la tab ya tenia filas, no hace falta una nueva consulta.
    if (activeTab.rows.length > 0) return;
    loadResources(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.context, activeTab?.namespace, activeTab?.resource, viewMode, loadResources]);

  const updateTableFilter = (resource: ResourceKey, value: string) => {
    if (!activeTab) return;
    updateActiveTab({ tableFilters: { ...(activeTab.tableFilters ?? {}), [resource]: value } });
  };

  const commitNamespace = () => {
    if (!activeTab) return;
    const next = namespaceDraft.trim() || "default";
    if (next !== activeTab.namespace) {
      const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de namespace" });
      updateActiveTab({ namespace: next, rows: [], selectedName: "", selectedNames: [], runState: stopped ? "stopped" : "idle", runLabel: stopped ? "Detenido por cambio de namespace" : "" });
    } else if (next !== namespaceDraft) {
      setNamespaceDraft(next);
    }
  };

  const refreshResources = async () => {
    if (!activeTab) return;
    stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido al refrescar" });
    setViewMode("table");
    await loadResources(activeTab);
  };

  const togglePodSelection = (name: string) => {
    if (!activeTab || activeTab.resource !== "pods") return;
    const selected = new Set(activeTab.selectedNames);
    if (selected.has(name)) selected.delete(name);
    else selected.add(name);
    updateActiveTab({ selectedNames: Array.from(selected) });
  };

  const setPodSelection = (names: string[], checked: boolean) => {
    if (!activeTab || activeTab.resource !== "pods") return;
    const selected = new Set(activeTab.selectedNames);
    for (const name of names) {
      if (checked) selected.add(name);
      else selected.delete(name);
    }
    updateActiveTab({ selectedNames: Array.from(selected) });
  };

  // Interrumpe la accion en curso: descarta el resultado en vuelo (via token),
  // libera el "loading" y vuelve a la lista para desbloquear las acciones.
  const interruptAction = () => {
    if (activeTab) {
      cancelTabAction(activeTab.id);
      stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido" });
    }
    updateActiveTab({ loading: false, runState: "stopped", runLabel: "Interrumpido" });
    setViewMode("table");
  };

  const showOutput = async (mode: ViewMode, args: string[], title: string): Promise<KubectlResult | null> => {
    if (!activeTab) return null;
    const tabId = activeTab.id;
    stopStream({ tabId, state: "stopped", label: "Detenido" });
    const token = nextActionToken(tabId);
    // Cambiamos de vista de inmediato y mostramos el estado de carga: el usuario
    // ve que el comando se lanzo y puede interrumpirlo mientras espera.
    updateActiveTab({ loading: true, outputTitle: title, output: "", runState: "running", runLabel: title });
    setViewMode(mode);
    let result: KubectlResult;
    try {
      result = await run(activeTab, args);
    } catch (error) {
      result = {
        ok: false,
        code: null,
        stdout: "",
        stderr: unknownMessage(error),
        command: formatKubectlCommand(args, activeTab.context, configByKey[activeTab.resource].namespaced ? activeTab.namespace : undefined)
      };
    }
    if (!isTabActionCurrent(tabId, token)) return null; // interrumpido o reemplazado
    updateTab(tabId, {
      loading: false,
      runState: result.ok ? "done" : "error",
      runLabel: result.ok ? title : `Error: ${title}`,
      outputTitle: result.ok ? title : `Error: ${title}`,
      output: result.ok ? kubectlSuccessText(result) : kubectlErrorText(result, "El comando fallo."),
      lastCommand: result.command
    });
    return result;
  };

  const addTab = () => {
    if (tabs.length >= MAX_TABS) {
      setGlobalMessage(`Puedes abrir hasta ${MAX_TABS} pestañas. Cierra una pestaña antes de crear otra.`);
      return;
    }
    const context = contexts[0] ?? "";
    if (!context) return;
    const tab = createTab(context, contextNamespaces[context]);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    stopStream({ tabId, state: "stopped", label: "Detenido al cerrar pestaña" });
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(next[0]?.id ?? "");
      }
      return next;
    });
  };

  const addKubeconfigs = async () => {
    try {
      const next = await window.kubeui.addKubeconfigs();
      setSettings((current) => (current ? { ...current, kubeconfigPaths: next.kubeconfigPaths } : null));
      setGlobalMessage("");
    } catch (error) {
      showAppError("No se pudo agregar el kubeconfig", error);
    }
  };

  const removeKubeconfig = async (kubeconfigPath: string) => {
    try {
      const next = await window.kubeui.removeKubeconfig(kubeconfigPath);
      setSettings((current) => (current ? { ...current, kubeconfigPaths: next.kubeconfigPaths } : null));
      setKubeconfigInfos((current) => current.filter((info) => info.path !== kubeconfigPath));
      setGlobalMessage("");
    } catch (error) {
      showAppError("No se pudo quitar el kubeconfig", error);
    }
  };

  const revealKubeconfig = async (kubeconfigPath: string) => {
    try {
      await window.kubeui.revealKubeconfig(kubeconfigPath);
    } catch (error) {
      showAppError("No se pudo abrir la ubicacion del kubeconfig", error);
    }
  };

  const deleteResource = async () => {
    if (!activeTab || !selectedName) return;
    const tab = activeTab;
    if (!(await requestConfirm(`Eliminar ${selectedConfig.label}: ${selectedName}?`))) return;
    const result = await showOutput("details", ["delete", selectedConfig.kubectlName, selectedName], `Eliminar ${selectedName}`);
    if (result?.ok) await loadResources(tab, { silent: true });
  };

  const restartResource = async () => {
    if (!activeTab) return;
    const tab = activeTab;
    const kind = activeTab.resource;
    let args: string[];
    let title: string;
    let confirmMessage: string;
    if (kind === "pods") {
      const rowNames = new Set(activeTab.rows.map(nameOf).filter(Boolean));
      const selectedPods = activeTab.selectedNames.filter((name) => rowNames.has(name));
      const targets = selectedPods.length ? selectedPods : selectedName ? [selectedName] : [];
      if (!targets.length) return;
      args = ["delete", "pod", ...targets];
      title = targets.length > 1 ? `Reiniciar ${targets.length} pods` : `Reiniciar ${targets[0]}`;
      const preview = targets.slice(0, 5).join(", ");
      const suffix = targets.length > 5 ? ` y ${targets.length - 5} más` : "";
      confirmMessage = targets.length > 1 ? `Reiniciar ${targets.length} pods seleccionados (${preview}${suffix})?` : `Reiniciar ${targets[0]}?`;
    } else if (kind === "deployments" || kind === "statefulsets" || kind === "daemonsets") {
      if (!selectedName) return;
      args = ["rollout", "restart", selectedConfig.kubectlName, selectedName];
      title = `Reiniciar ${selectedName}`;
      confirmMessage = `Reiniciar ${selectedName}?`;
    } else {
      return;
    }
    if (!(await requestConfirm(confirmMessage))) return;
    const result = await showOutput("details", args, title);
    if (result?.ok) await loadResources(tab, { silent: true });
  };

  const scaleDeployment = async () => {
    if (!activeTab || !selectedName) return;
    const tab = activeTab;
    if (!["deployments", "statefulsets", "replicasets"].includes(activeTab.resource)) return;
    const replicas = await requestInput("Réplicas", "1");
    if (!replicas || !/^\d+$/.test(replicas)) return;
    const result = await showOutput("details", ["scale", selectedConfig.kubectlName, selectedName, `--replicas=${replicas}`], `Escalar ${selectedName}`);
    if (result?.ok) await loadResources(tab, { silent: true });
  };

  // "Editar": traemos el YAML del recurso a un borrador editable y abrimos el
  // panel. Al guardar se hace `kubectl replace` (equivalente no interactivo de
  // `kubectl edit`: actualiza el objeto vivo directamente).
  const editResource = async () => {
    if (!activeTab || !selectedName) return;
    const tabId = activeTab.id;
    stopStream({ tabId, state: "stopped", label: "Detenido" });
    const token = nextActionToken(tabId);
    // Abrimos el panel de edicion de inmediato en estado de carga (mientras se
    // trae el YAML del recurso). El usuario puede interrumpir si demora.
    updateActiveTab({ loading: true, runState: "running", runLabel: `Editar ${selectedName}`, yamlDraft: "", yamlEditMode: true, outputTitle: `Editar ${selectedName}` });
    setViewMode("apply");
    let result: KubectlResult;
    try {
      result = await run(activeTab, ["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"]);
    } catch (error) {
      result = {
        ok: false,
        code: null,
        stdout: "",
        stderr: unknownMessage(error),
        command: formatKubectlCommand(["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"], activeTab.context, activeTab.namespace)
      };
    }
    if (!isTabActionCurrent(tabId, token)) return; // interrumpido o reemplazado
    if (!result.ok) {
      updateTab(tabId, { loading: false, runState: "error", runLabel: "Error: Editar recurso", viewMode: "details", outputTitle: "Error: Editar recurso", output: kubectlErrorText(result, "No se pudo obtener el YAML."), lastCommand: result.command });
      return;
    }
    updateTab(tabId, { loading: false, runState: "done", runLabel: "YAML cargado", yamlDraft: result.stdout, yamlEditMode: true, lastCommand: result.command });
  };

  const triggerCronJob = async () => {
    if (!activeTab || activeTab.resource !== "cronjobs" || !selectedName) return;
    const jobName = `${selectedName}-manual-${Date.now().toString().slice(-6)}`;
    if (!(await requestConfirm(`Ejecutar ahora el CronJob ${selectedName}?`))) return;
    await showOutput("details", ["create", "job", jobName, `--from=cronjob/${selectedName}`], `Ejecutar ${selectedName}`);
  };

  const toggleCronSuspend = async () => {
    if (!activeTab || activeTab.resource !== "cronjobs" || !selectedName) return;
    const tab = activeTab;
    const row = activeTab.rows.find((item) => nameOf(item) === selectedName);
    const next = !Boolean((row?.spec as { suspend?: boolean })?.suspend);
    const result = await showOutput(
      "details",
      ["patch", "cronjob", selectedName, "-p", JSON.stringify({ spec: { suspend: next } })],
      `${next ? "Suspender" : "Reanudar"} ${selectedName}`
    );
    if (result?.ok) await loadResources(tab, { silent: true });
  };

  const runTerminal = () => {
    if (!activeTab || !activeTab.terminalCommand.trim()) return;
    stopStream({ state: "stopped", label: "Reemplazado" });
    const tabId = activeTab.id;
    const command = activeTab.terminalCommand;
    if (isUnsupportedInteractiveCommand(command)) {
      updateActiveTab({
        terminalOutput:
          `$ ${command}\n\nEste comando requiere una sesion interactiva o de larga duracion que todavia no esta soportada en esta terminal.\nUsa una terminal externa para exec -it, attach -it o port-forward.`,
        lastCommand: command,
        runState: "error",
        runLabel: "Comando no soportado"
      });
      return;
    }
    updateActiveTab({ loading: true, runState: "running", runLabel: "Terminal", terminalOutput: `$ ${command}\n\n` });
    setCurrentStreamOwner({
      tabId,
      view: "terminal",
      live: false,
      pinned: false,
      autoStopOnLeave: false
    });
    stopStreamRef.current = window.kubeui.streamKubectl(
      {
        command,
        kubeconfigPaths,
        context: activeTab.context,
        namespace: activeTab.namespace
      },
      {
        onData: (chunk) => {
          setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, terminalOutput: tab.terminalOutput + chunk } : tab)));
        },
        onEnd: ({ command: resolved, error, code }) => {
          const hasError = Boolean(error) || (code !== null && code !== 0);
          setTabs((current) =>
            current.map((tab) =>
              tab.id === tabId
                ? {
                    ...tab,
                    loading: false,
                    runState: hasError ? "error" : "done",
                    runLabel: hasError ? "Error en terminal" : "Terminal finalizada",
                    lastCommand: resolved || tab.lastCommand,
                    terminalOutput: error ? `${tab.terminalOutput}\n${error}` : tab.terminalOutput
                  }
                : tab
            )
          );
          if (streamOwnerRef.current?.tabId === tabId) setCurrentStreamOwner(null);
          stopStreamRef.current = null;
        }
      }
    );
  };

  const pickYaml = async () => {
    try {
      const file = await window.kubeui.pickYamlFile();
      // Cargar un archivo es un Apply libre, no la edicion de un recurso vivo.
      if (file) updateActiveTab({ yamlDraft: file.content, yamlEditMode: false });
    } catch (error) {
      showAppError("No se pudo abrir el archivo YAML", error);
    }
  };

  const applyYaml = async () => {
    if (!activeTab || !activeTab.yamlDraft.trim()) return;
    const tabId = activeTab.id;
    stopStream({ tabId, state: "stopped", label: "Detenido" });
    const editMode = activeTab.yamlEditMode;
    const confirmMessage = editMode
      ? "Guardar cambios del recurso con kubectl replace?"
      : "Aplicar YAML en el contexto seleccionado?";
    if (!(await requestConfirm(confirmMessage))) return;
    const token = nextActionToken(tabId);
    updateActiveTab({ loading: true, runState: "running", runLabel: editMode ? "Editando recurso" : "Aplicando YAML" });
    const payload = {
      yaml: activeTab.yamlDraft,
      kubeconfigPaths,
      context: activeTab.context,
      namespace: activeTab.namespace
    };
    let result: KubectlResult;
    try {
      result = editMode ? await window.kubeui.replaceYaml(payload) : await window.kubeui.applyYaml(payload);
    } catch (error) {
      result = {
        ok: false,
        code: null,
        stdout: "",
        stderr: unknownMessage(error),
        command: editMode ? "kubectl replace -f <tempfile>" : "kubectl apply -f <tempfile>"
      };
    }
    if (!isTabActionCurrent(tabId, token)) return;
    updateTab(tabId, {
      loading: false,
      viewMode: "details",
      runState: result.ok ? "done" : "error",
      runLabel: result.ok ? (editMode ? "Recurso editado" : "YAML aplicado") : `Error: ${editMode ? "Editar recurso" : "Aplicar YAML"}`,
      outputTitle: result.ok ? (editMode ? "Editar recurso" : "Aplicar YAML") : `Error: ${editMode ? "Editar recurso" : "Aplicar YAML"}`,
      output: result.ok ? kubectlSuccessText(result) : kubectlErrorText(result, "No se pudo aplicar el YAML."),
      lastCommand: result.command
    });
  };

  // Sugerencias de namespace: combinamos el del kubeconfig, los listados en vivo (si el cluster lo permite) y el actual.
  const namespaces = useMemo(() => {
    const context = activeTab?.context;
    const set = new Set<string>();
    if (context && contextNamespaces[context]) set.add(contextNamespaces[context]);
    if (context) for (const ns of namespacesByContext[context] ?? []) set.add(ns);
    if (activeTab?.namespace) set.add(activeTab.namespace);
    set.add("default");
    return Array.from(set);
  }, [activeTab?.context, activeTab?.namespace, contextNamespaces, namespacesByContext]);
  const statusOk = kubectlStatus?.ok;
  const sessionLocked = viewMode !== "table";

  return (
    <div className={`app-shell ${logsExpanded ? "logs-expanded" : ""}`}>
      <div className="tabstrip">
        <button
          className="sidebar-toggle"
          title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div className="tabstrip-tabs">
          <div className="tabstrip-tab-list">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`chrome-tab ${tab.id === activeTabId ? "active" : ""}`}
                onClick={() => {
                  setActiveTabId(tab.id);
                }}
              >
                <Layers3 size={15} />
                {tab.runState !== "idle" && (
                  <span
                    className={`tab-run-dot ${tab.runState}${streamOwner?.tabId === tab.id && streamOwner.pinned ? " pinned" : ""}`}
                    title={`${runStateText(tab.runState)}${tab.runLabel ? `: ${tab.runLabel}` : ""}${streamOwner?.tabId === tab.id && streamOwner.pinned ? " · fijado" : ""}`}
                  />
                )}
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <X
                    size={14}
                    className="chrome-tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {tabs.length < MAX_TABS && (
            <button
              className="tabstrip-add"
              title={!contexts.length ? "Agrega un kubeconfig con contextos" : "Nueva pestaña"}
              onClick={addTab}
              disabled={!contexts.length}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
      </div>

      <main className={`workspace ${sidebarOpen && !logsExpanded ? "" : "collapsed"}`}>
        {sidebarOpen && !logsExpanded && (
          <aside className="sidebar">
            <div className="resource-list">
              {RESOURCE_CATEGORIES.map((category) => (
                <div key={category.label} className="resource-group">
                  <span className="resource-group-title">{category.label}</span>
                  {category.keys.map((key) => {
                    const config = configByKey[key];
                    return (
                      <button
                        key={config.key}
                        className={activeTab?.resource === config.key && (viewMode === "table" || viewMode === "details" || viewMode === "yaml" || viewMode === "apply") ? "active" : ""}
                        onClick={() => {
                          if (!activeTab) return;
                          const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de recurso" });
                          if (activeTab.resource === config.key) {
                            // Mismo kind: si estamos en una accion, volver a la tabla.
                            setViewMode("table");
                            return;
                          }
                          // Guardar snapshot del kind actual y restaurar el del nuevo.
                          // La vista de edicion ("apply") es transitoria: su
                          // contenido (yamlDraft) no se cachea por kind, asi que
                          // no la persistimos (se guardaria como "table") para
                          // evitar que reaparezca pegada al volver a este kind.
                          const snapshot: ResourceSnapshot = {
                            rows: activeTab.rows,
                            selectedName: activeTab.selectedName,
                            selectedNames: activeTab.selectedNames,
                            viewMode: activeTab.viewMode === "apply" ? "table" : activeTab.viewMode,
                            outputTitle: activeTab.outputTitle,
                            output: activeTab.output,
                            lastCommand: activeTab.lastCommand
                          };
                          const cached = activeTab.resourceCache[config.key];
                          const restoredViewMode = cached?.viewMode && cached.viewMode !== "apply" ? cached.viewMode : "table";
                          setTabs((current) => current.map((tab) => {
                            if (tab.id !== activeTab.id) return tab;
                            return {
                              ...tab,
                              resource: config.key,
                              resourceCache: { ...tab.resourceCache, [activeTab.resource]: snapshot },
                              rows: cached?.rows ?? [],
                              selectedName: cached?.selectedName ?? "",
                              selectedNames: cached?.selectedNames ?? [],
                              viewMode: restoredViewMode,
                              outputTitle: cached?.outputTitle ?? "",
                              output: cached?.output ?? "",
                              lastCommand: cached?.lastCommand ?? "",
                              // Limpiar el borrador de edicion para que no se
                              // arrastre entre kinds.
                              yamlDraft: "",
                              yamlEditMode: false,
                              loading: false,
                              runState: stopped ? "stopped" : "idle",
                              runLabel: stopped ? "Detenido por cambio de recurso" : ""
                            };
                          }));
                        }}
                      >
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="side-actions">
              <button className={viewMode === "terminal" ? "active" : ""} onClick={() => setViewMode("terminal")}>
                <SquareTerminal size={16} />
                Terminal
              </button>
              <button className={viewMode === "apply" ? "active" : ""} onClick={() => { updateActiveTab({ yamlEditMode: false }); setViewMode("apply"); }}>
                <FileCode2 size={16} />
                Aplicar YAML
              </button>
            </div>
          </aside>
        )}

        <section className="content">
          {globalMessage && <div className="banner">{globalMessage}</div>}
          {activeTab && viewMode !== "settings" && !logsExpanded && (
            <div className={`session-bar ${sessionLocked ? "locked" : ""}`}>
              <label>
                Contexto
                <span className="select-wrap">
                  <select
                    value={activeTab.context}
                    disabled={sessionLocked}
                    title={sessionLocked ? "Disponible solo en la vista de listado" : "Cambiar contexto"}
                    onChange={(event) => {
                      if (sessionLocked) return;
                      const nextContext = event.target.value;
                      const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de contexto" });
                      updateActiveTab({
                        context: nextContext,
                        namespace: contextNamespaces[nextContext] ?? "default",
                        rows: [],
                        selectedName: "",
                        selectedNames: [],
                        title: nextContext || "Sin contexto",
                        runState: stopped ? "stopped" : "idle",
                        runLabel: stopped ? "Detenido por cambio de contexto" : ""
                      });
                      refreshNamespaces(nextContext);
                    }}
                  >
                    {contexts.map((context) => (
                      <option key={context} value={context}>
                        {context}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
                </span>
              </label>
              <label>
                Namespace
                <span className="select-wrap">
                  <input
                    list="namespace-options"
                    value={namespaceDraft}
                    placeholder="default"
                    disabled={sessionLocked}
                    title={sessionLocked ? "Disponible solo en la vista de listado" : "Cambiar namespace"}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      if (sessionLocked) return;
                      const value = event.target.value;
                      setNamespaceDraft(value);
                      if (namespaces.includes(value) && value !== activeTab.namespace) {
                        const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de namespace" });
                        updateActiveTab({ namespace: value, rows: [], selectedName: "", selectedNames: [], runState: stopped ? "stopped" : "idle", runLabel: stopped ? "Detenido por cambio de namespace" : "" });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (sessionLocked) return;
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitNamespace();
                      }
                    }}
                    onBlur={() => {
                      if (!sessionLocked) commitNamespace();
                    }}
                  />
                  <ChevronDown size={15} />
                  <datalist id="namespace-options">
                    {namespaces.map((namespace) => (
                      <option key={namespace} value={namespace} />
                    ))}
                  </datalist>
                </span>
              </label>
              <button
                className="toolbar-button"
                title={sessionLocked ? "Disponible solo en la vista de listado" : "Refrescar listado"}
                onClick={refreshResources}
                disabled={activeTab.loading || sessionLocked}
              >
                <RefreshCw size={16} />
                Refrescar
              </button>
              <code>{activeTab.lastCommand || "kubectl --context ..."}</code>
              <button className="icon-button" title="Copiar comando" onClick={() => copyToClipboard(activeTab.lastCommand, "Comando")} disabled={!activeTab.lastCommand}>
                <Copy size={16} />
              </button>
            </div>
          )}

          {viewMode === "settings" && settings && (
            <SettingsView
              settings={settings}
              infos={kubeconfigInfos}
              loading={settingsBusy}
              onAdd={addKubeconfigs}
              onRemove={removeKubeconfig}
              onRefresh={refreshContexts}
              onValidate={refreshKubeconfigInfos}
              onReveal={revealKubeconfig}
              onBack={() => setViewMode(settingsReturn)}
            />
          )}

          {!activeTab && viewMode !== "settings" && (
            <EmptyWorkspace
              settingsReady={Boolean(settings)}
              kubeconfigCount={kubeconfigPaths.length}
              onAdd={addKubeconfigs}
              onSettings={() => {
                setSettingsReturn("table");
                setViewMode("settings");
              }}
            />
          )}

          {activeTab && viewMode === "table" && (
            <ResourceTable
              tab={activeTab}
              config={selectedConfig}
              filter={activeTab.tableFilters?.[selectedConfig.key] ?? ""}
              onFilterChange={(value) => updateTableFilter(selectedConfig.key, value)}
              onRefresh={refreshResources}
              onSelect={(name) => updateActiveTab({ selectedName: name })}
              onTogglePodSelection={togglePodSelection}
              onSetPodSelection={setPodSelection}
              onDescribe={() => selectedName && showOutput("details", ["describe", selectedConfig.kubectlName, selectedName], `Describe ${selectedName}`)}
              onYaml={() => selectedName && showOutput("yaml", ["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"], `YAML ${selectedName}`)}
              onLogs={() => selectedName && runLogs()}
              onEdit={editResource}
              onDelete={deleteResource}
              onRestart={restartResource}
              onScale={scaleDeployment}
              onTrigger={triggerCronJob}
              onSuspend={toggleCronSuspend}
            />
          )}

          {activeTab && (viewMode === "details" || viewMode === "yaml") && (
            <OutputPanel
              title={activeTab.outputTitle}
              output={activeTab.output}
              loading={activeTab.loading}
              onInterrupt={interruptAction}
              onCopy={copyToClipboard}
              onBack={() => setViewMode("table")}
            />
          )}

          {activeTab && viewMode === "logs" && (
            <LogsPanel
              title={activeTab.outputTitle}
              output={activeTab.output}
              streaming={streaming}
              following={activeLogsPrefs.mode === "live" && !!activeLogsPrefs.since}
              mode={activeLogsPrefs.mode}
              onModeChange={changeLogsMode}
              since={activeLogsPrefs.since}
              onSinceChange={changeLogsSince}
              start={activeLogsPrefs.start}
              end={activeLogsPrefs.end}
              onStartChange={(value) => updateLogsPrefs({ start: value })}
              onEndChange={(value) => updateLogsPrefs({ end: value })}
              onQuery={runLogsQuery}
              notice={logsNotice}
              meta={logsMeta}
              containerNames={logContainerNames}
              selectedContainer={activeLogsPrefs.container || logDefaultContainer}
              defaultContainer={logDefaultContainer}
              pinned={activeTab.streamPinned}
              pretty={activeLogsPrefs.pretty}
              onPrettyChange={(value) => updateLogsPrefs({ pretty: value })}
              query={activeLogsPrefs.query}
              onQueryChange={(value) => updateLogsPrefs({ query: value })}
              activeLevelFilters={activeLogsPrefs.activeLevelFilters}
              onActiveLevelFiltersChange={(value) => updateLogsPrefs({ activeLevelFilters: value })}
              onContainerChange={changeLogsContainer}
              onPinnedChange={changeLogsPinned}
              expanded={logsExpanded}
              onToggleExpand={() => setLogsExpanded((value) => !value)}
              onCopy={copyToClipboard}
              onBack={() => {
                const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Logs detenidos al volver" });
                if (!stopped && activeTab.loading) {
                  updateActiveTab({ loading: false, runState: "stopped", runLabel: "Logs detenidos al volver" });
                }
                setViewMode("table");
              }}
              onResume={() => runLogs()}
              onStop={() => stopStream({ tabId: activeTab.id, state: "stopped", label: "Logs detenidos" })}
            />
          )}

          {activeTab && viewMode === "terminal" && (
            <TerminalPanel
              command={activeTab.terminalCommand}
              output={activeTab.terminalOutput}
              loading={activeTab.loading}
              streaming={streaming}
              onChange={(terminalCommand) => updateActiveTab({ terminalCommand })}
              onRun={runTerminal}
              onStop={() => stopStream({ tabId: activeTab.id, state: "stopped", label: "Terminal detenida" })}
              onCopy={copyToClipboard}
            />
          )}

          {activeTab && viewMode === "apply" && (
            <ApplyPanel
              yaml={activeTab.yamlDraft}
              loading={activeTab.loading}
              editMode={activeTab.yamlEditMode}
              onChange={(yamlDraft) => updateActiveTab({ yamlDraft })}
              onPick={pickYaml}
              onApply={applyYaml}
              onInterrupt={interruptAction}
              onBack={() => setViewMode("table")}
            />
          )}
        </section>
      </main>

      {!logsExpanded && (
        <footer className="statusbar">
          <div className="brand">
            <Boxes size={20} />
            <div>
              <strong>kubeui</strong>
              <span>{kubeconfigPaths.length ? `${kubeconfigPaths.length} kubeconfig` : "sin kubeconfig"}</span>
            </div>
          </div>
          <button
            className={`status-pill ${statusOk ? "ok" : "bad"}`}
            title="Ver detalle de kubectl"
            onClick={() => setDetailDialog({
              title: statusOk ? "kubectl listo" : "kubectl no disponible",
              message: statusOk ? "La app puede ejecutar kubectl desde el PATH actual." : "No se pudo ejecutar kubectl correctamente.",
              details: kubectlStatus ? kubectlOutput(kubectlStatus, "Sin detalle disponible.") : "Aun no se ejecuto la verificacion.",
              command: kubectlStatus?.command
            })}
          >
            {statusOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            <span>{statusOk ? "kubectl listo" : "kubectl no disponible"}</span>
          </button>
          <button
            className="icon-button"
            title="Configurar kubeconfig"
            onClick={() => {
              // Recordar la vista actual para poder regresar al mismo kind/accion.
              if (viewMode !== "settings") setSettingsReturn(viewMode);
              setViewMode("settings");
            }}
          >
            <Settings size={18} />
          </button>
        </footer>
      )}

      {confirmDialog && (
        <div
          className="modal-backdrop"
          onClick={() => {
            confirmDialog.resolve(false);
            setConfirmDialog(null);
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-message">{confirmDialog.message}</p>
            <div className="modal-actions">
              <button
                className="toolbar-button"
                onClick={() => {
                  confirmDialog.resolve(false);
                  setConfirmDialog(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="toolbar-button primary"
                onClick={() => {
                  confirmDialog.resolve(true);
                  setConfirmDialog(null);
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {inputDialog && (
        <div
          className="modal-backdrop"
          onClick={() => {
            inputDialog.resolve(null);
            setInputDialog(null);
          }}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <p className="modal-message">{inputDialog.message}</p>
            <input
              className="modal-input"
              autoFocus
              value={inputDialog.value}
              onChange={(event) => setInputDialog((state) => (state ? { ...state, value: event.target.value } : state))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  inputDialog.resolve(inputDialog.value);
                  setInputDialog(null);
                } else if (event.key === "Escape") {
                  inputDialog.resolve(null);
                  setInputDialog(null);
                }
              }}
            />
            <div className="modal-actions">
              <button
                className="toolbar-button"
                onClick={() => {
                  inputDialog.resolve(null);
                  setInputDialog(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="toolbar-button primary"
                onClick={() => {
                  inputDialog.resolve(inputDialog.value);
                  setInputDialog(null);
                }}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="toast-notice">{toastMessage}</div>}

      {detailDialog && (
        <div className="modal-backdrop" onClick={() => setDetailDialog(null)}>
          <div className="modal detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-heading">
              <AlertTriangle size={18} />
              <strong>{detailDialog.title}</strong>
            </div>
            {detailDialog.message && <p className="modal-message">{detailDialog.message}</p>}
            {detailDialog.command && (
              <div className="command-box">
                <code>{detailDialog.command}</code>
                <button className="icon-button" title="Copiar comando" onClick={() => copyToClipboard(detailDialog.command ?? "", "Comando")}>
                  <Copy size={15} />
                </button>
              </div>
            )}
            {detailDialog.details && <pre className="modal-pre">{detailDialog.details}</pre>}
            <div className="modal-actions">
              {detailDialog.details && (
                <button className="toolbar-button" onClick={() => copyToClipboard(detailDialog.details ?? "", "Detalle")}>
                  <Copy size={16} />
                  Copiar
                </button>
              )}
              <button className="toolbar-button primary" onClick={() => setDetailDialog(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
