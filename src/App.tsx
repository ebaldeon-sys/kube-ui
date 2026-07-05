import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_TABS } from "./app/constants";
import { createTab } from "./app/createTab";
import type { KubeItem, ResourceKey, ResourceSnapshot, ViewMode } from "./app/types";
import { ConfirmDialog } from "./components/dialogs/ConfirmDialog";
import { DetailDialog } from "./components/dialogs/DetailDialog";
import { InputDialog } from "./components/dialogs/InputDialog";
import { SessionBar } from "./components/layout/SessionBar";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { TabStrip } from "./components/layout/TabStrip";
import { LogsPanel } from "./components/logs/LogsPanel";
import { ApplyPanel, OutputPanel, TerminalPanel } from "./components/output/Panels";
import { ResourceTable } from "./components/resources/ResourceTable";
import { EmptyWorkspace, MissingBridge, SettingsView } from "./components/workspace/WorkspaceStates";
import { configByKey, resourceConfigs } from "./config/resources";
import { useClipboard } from "./hooks/useClipboard";
import { useDialogs } from "./hooks/useDialogs";
import { useLogs } from "./hooks/useLogs";
import { useResourceActions } from "./hooks/useResourceActions";
import { useResources } from "./hooks/useResources";
import { useStream } from "./hooks/useStream";
import { useTabs } from "./hooks/useTabs";
import { kubectlErrorText, kubectlOutput, unknownMessage } from "./kubectl/format";
import { nameOf } from "./resources/helpers";
import { useTheme } from "./theme/useTheme";
import type { KubeconfigInspection, KubectlResult, Settings as AppSettings } from "./types";

export function App() {
  // El puente de preload puede no estar disponible (p. ej. abriendo el HTML
  // fuera de Electron). Esta comprobacion vive en un componente guardian para
  // que AppInner llame siempre a sus hooks de forma incondicional (Rules of Hooks).
  if (!window.kubeui) {
    return <MissingBridge />;
  }
  return <AppInner />;
}

function AppInner() {
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
  const { streamOwner, streamOwnerRef, stopStreamRef, logBufferRef, logFlushTimerRef, setCurrentStreamOwner, stopStream } =
    useStream(setTabs);
  // Sidebar fijado (ancho completo, empuja el contenido) vs riel de iconos que se
  // expande al pasar el mouse. Se recuerda la preferencia entre sesiones.
  const [sidebarPinned, setSidebarPinned] = useState(() => {
    try {
      return localStorage.getItem("kubeui-sidebar-pinned") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("kubeui-sidebar-pinned", sidebarPinned ? "1" : "0");
    } catch {
      // Ignorar fallos de persistencia (modo privado, etc.).
    }
  }, [sidebarPinned]);
  // Vista ampliada de logs: oculta tabstrip, sidebar, barra de sesion y statusbar.
  const [logsExpanded, setLogsExpanded] = useState(false);
  // Vista a la que regresar al cerrar la configuracion (kubeconfig).
  const [settingsReturn, setSettingsReturn] = useState<ViewMode>("table");
  const { detailDialog, setDetailDialog, confirmDialog, setConfirmDialog, inputDialog, setInputDialog, requestConfirm, requestInput } =
    useDialogs();
  const { theme, toggleTheme } = useTheme();

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

  const showAppError = useCallback((title: string, error: unknown) => {
    setGlobalMessage(`${title}: ${unknownMessage(error)}`);
  }, []);

  const {
    showOutput,
    interruptAction,
    deleteResource,
    restartResource,
    scaleDeployment,
    editResource,
    triggerCronJob,
    toggleCronSuspend,
    runTerminal,
    pickYaml,
    applyYaml
  } = useResourceActions({
    activeTab,
    selectedName,
    selectedConfig,
    kubeconfigPaths,
    stopStream,
    setViewMode,
    updateActiveTab,
    updateTab,
    setTabs,
    requestConfirm,
    requestInput,
    loadResources,
    showAppError,
    setCurrentStreamOwner,
    stopStreamRef,
    streamOwnerRef
  });

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
    const entries = (parsed.contexts ?? []).filter((entry): entry is { name: string; context?: { namespace?: string } } =>
      Boolean(entry?.name)
    );
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
          : {
              ...tab,
              context: nextContexts[0],
              title: nextContexts[0],
              namespace: nsMap[nextContexts[0]] ?? "default",
              rows: [],
              selectedName: "",
              selectedNames: []
            }
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
    window.kubeui
      .getSettings()
      .then(setSettings)
      .catch((error) => showAppError("No se pudo leer la configuracion", error));
  }, [showAppError]);

  useEffect(() => {
    if (!settings) return;
    window.kubeui
      .runKubectl({ args: ["version", "--client"], kubeconfigPaths })
      .then(setKubectlStatus)
      .catch((error) =>
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
      updateActiveTab({
        namespace: next,
        rows: [],
        selectedName: "",
        selectedNames: [],
        runState: stopped ? "stopped" : "idle",
        runLabel: stopped ? "Detenido por cambio de namespace" : ""
      });
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

  // Cambia el kind de recurso: guarda el snapshot del kind actual y restaura el
  // cacheado del nuevo. La vista "apply" es transitoria y no se persiste.
  const selectResource = (key: ResourceKey) => {
    if (!activeTab) return;
    const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de recurso" });
    if (activeTab.resource === key) {
      setViewMode("table");
      return;
    }
    const snapshot: ResourceSnapshot = {
      rows: activeTab.rows,
      selectedName: activeTab.selectedName,
      selectedNames: activeTab.selectedNames,
      viewMode: activeTab.viewMode === "apply" ? "table" : activeTab.viewMode,
      outputTitle: activeTab.outputTitle,
      output: activeTab.output,
      lastCommand: activeTab.lastCommand
    };
    const cached = activeTab.resourceCache[key];
    const restoredViewMode = cached?.viewMode && cached.viewMode !== "apply" ? cached.viewMode : "table";
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== activeTab.id) return tab;
        return {
          ...tab,
          resource: key,
          resourceCache: { ...tab.resourceCache, [activeTab.resource]: snapshot },
          rows: cached?.rows ?? [],
          selectedName: cached?.selectedName ?? "",
          selectedNames: cached?.selectedNames ?? [],
          viewMode: restoredViewMode,
          outputTitle: cached?.outputTitle ?? "",
          output: cached?.output ?? "",
          lastCommand: cached?.lastCommand ?? "",
          yamlDraft: "",
          yamlEditMode: false,
          loading: false,
          runState: stopped ? "stopped" : "idle",
          runLabel: stopped ? "Detenido por cambio de recurso" : ""
        };
      })
    );
  };

  const changeContext = (nextContext: string) => {
    if (!activeTab) return;
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
  };

  const handleNamespaceInput = (value: string) => {
    if (!activeTab) return;
    setNamespaceDraft(value);
    // Auto-confirmar si el valor coincide con una sugerencia (seleccion del datalist).
    if (namespaces.includes(value) && value !== activeTab.namespace) {
      const stopped = stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido por cambio de namespace" });
      updateActiveTab({
        namespace: value,
        rows: [],
        selectedName: "",
        selectedNames: [],
        runState: stopped ? "stopped" : "idle",
        runLabel: stopped ? "Detenido por cambio de namespace" : ""
      });
    }
  };

  const showStatusDetail = () => {
    setDetailDialog({
      title: statusOk ? "kubectl listo" : "kubectl no disponible",
      message: statusOk ? "La app puede ejecutar kubectl desde el PATH actual." : "No se pudo ejecutar kubectl correctamente.",
      details: kubectlStatus ? kubectlOutput(kubectlStatus, "Sin detalle disponible.") : "Aun no se ejecuto la verificacion.",
      command: kubectlStatus?.command
    });
  };

  const openSettings = () => {
    // Recordar la vista actual para poder regresar al mismo kind/accion.
    if (viewMode !== "settings") setSettingsReturn(viewMode);
    setViewMode("settings");
  };

  return (
    <div className={`app-shell ${logsExpanded ? "logs-expanded" : ""}`}>
      <TabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        streamOwner={streamOwner}
        sidebarPinned={sidebarPinned}
        hasContexts={contexts.length > 0}
        onToggleSidebar={() => setSidebarPinned((value) => !value)}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onAddTab={addTab}
      />

      <main className={`workspace ${logsExpanded ? "collapsed" : sidebarPinned ? "" : "rail"}`}>
        {!logsExpanded && (
          <Sidebar
            activeResource={activeTab?.resource}
            viewMode={viewMode}
            onSelectResource={selectResource}
            onTerminal={() => setViewMode("terminal")}
            onApplyYaml={() => {
              updateActiveTab({ yamlEditMode: false });
              setViewMode("apply");
            }}
          />
        )}

        <section className="content">
          {globalMessage && <div className="banner">{globalMessage}</div>}
          {activeTab && viewMode !== "settings" && !logsExpanded && (
            <SessionBar
              context={activeTab.context}
              contexts={contexts}
              namespaceDraft={namespaceDraft}
              namespaces={namespaces}
              sessionLocked={sessionLocked}
              loading={activeTab.loading}
              lastCommand={activeTab.lastCommand}
              onContextChange={changeContext}
              onNamespaceInput={handleNamespaceInput}
              onNamespaceCommit={commitNamespace}
              onRefresh={refreshResources}
              onCopyCommand={() => copyToClipboard(activeTab.lastCommand, "Comando")}
            />
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
              onDescribe={() =>
                selectedName && showOutput("details", ["describe", selectedConfig.kubectlName, selectedName], `Describe ${selectedName}`)
              }
              onYaml={() =>
                selectedName && showOutput("yaml", ["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"], `YAML ${selectedName}`)
              }
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
        <StatusBar
          kubeconfigCount={kubeconfigPaths.length}
          statusOk={statusOk}
          theme={theme}
          onToggleTheme={toggleTheme}
          onShowStatus={showStatusDetail}
          onOpenSettings={openSettings}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          dialog={confirmDialog}
          onClose={(value) => {
            confirmDialog.resolve(value);
            setConfirmDialog(null);
          }}
        />
      )}

      {inputDialog && (
        <InputDialog
          dialog={inputDialog}
          onChange={(value) => setInputDialog((state) => (state ? { ...state, value } : state))}
          onClose={(value) => {
            inputDialog.resolve(value);
            setInputDialog(null);
          }}
        />
      )}

      {toastMessage && <div className="toast-notice">{toastMessage}</div>}

      {detailDialog && <DetailDialog dialog={detailDialog} onClose={() => setDetailDialog(null)} onCopy={copyToClipboard} />}
    </div>
  );
}
