import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileCode2,
  FolderPlus,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale3D,
  ScrollText,
  Search,
  Settings,
  Shield,
  Square,
  SquareTerminal,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KubectlResult, Settings as AppSettings } from "./types";

type ResourceKey = "pods" | "deployments" | "services" | "configmaps" | "secrets" | "ingress" | "nodes";
type ViewMode = "table" | "details" | "yaml" | "logs" | "terminal" | "apply" | "settings";

type ResourceConfig = {
  key: ResourceKey;
  label: string;
  kubectlName: string;
  namespaced: boolean;
  columns: Array<{ key: string; label: string; getter: (item: KubeItem) => string }>;
};

type KubeItem = {
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
  };
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  type?: string;
};

type TabSession = {
  id: string;
  title: string;
  context: string;
  namespace: string;
  resource: ResourceKey;
  rows: KubeItem[];
  selectedName: string;
  viewMode: ViewMode;
  outputTitle: string;
  output: string;
  lastCommand: string;
  terminalCommand: string;
  terminalOutput: string;
  yamlDraft: string;
  loading: boolean;
};

const resourceConfigs: ResourceConfig[] = [
  {
    key: "pods",
    label: "Pods",
    kubectlName: "pods",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
      { key: "ready", label: "Ready", getter: (item) => readyContainers(item) },
      { key: "restarts", label: "Restarts", getter: (item) => restartCount(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "deployments",
    label: "Deployments",
    kubectlName: "deployments",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "ready", label: "Ready", getter: (item) => `${numberAt(item.status?.readyReplicas)}/${numberAt(item.status?.replicas)}` },
      { key: "updated", label: "Updated", getter: (item) => stringAt(item.status?.updatedReplicas) },
      { key: "available", label: "Available", getter: (item) => stringAt(item.status?.availableReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "services",
    label: "Services",
    kubectlName: "services",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "type", label: "Tipo", getter: (item) => stringAt(item.spec?.type) },
      { key: "clusterIp", label: "Cluster IP", getter: (item) => stringAt(item.spec?.clusterIP) },
      { key: "ports", label: "Puertos", getter: (item) => ports(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "configmaps",
    label: "ConfigMaps",
    kubectlName: "configmaps",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "keys", label: "Keys", getter: (item) => String(Object.keys((item as { data?: object }).data ?? {}).length) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "secrets",
    label: "Secrets",
    kubectlName: "secrets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "type", label: "Tipo", getter: (item) => stringAt(item.type) },
      { key: "keys", label: "Keys", getter: (item) => String(Object.keys((item as { data?: object }).data ?? {}).length) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "ingress",
    label: "Ingress",
    kubectlName: "ingress",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "class", label: "Clase", getter: (item) => stringAt(item.spec?.ingressClassName) },
      { key: "hosts", label: "Hosts", getter: (item) => ingressHosts(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "nodes",
    label: "Nodes",
    kubectlName: "nodes",
    namespaced: false,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => nodeReady(item) },
      { key: "role", label: "Rol", getter: (item) => nodeRoles(item) },
      { key: "version", label: "Versión", getter: (item) => stringAt((item.status as { nodeInfo?: { kubeletVersion?: string } })?.nodeInfo?.kubeletVersion) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  }
];

const configByKey = Object.fromEntries(resourceConfigs.map((config) => [config.key, config])) as Record<ResourceKey, ResourceConfig>;

export function App() {
  if (!window.kubeui) {
    return <MissingBridge />;
  }

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [kubectlStatus, setKubectlStatus] = useState<KubectlResult | null>(null);
  const [contexts, setContexts] = useState<string[]>([]);
  const [contextNamespaces, setContextNamespaces] = useState<Record<string, string>>({});
  const [namespacesByContext, setNamespacesByContext] = useState<Record<string, string[]>>({});
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [globalMessage, setGlobalMessage] = useState("");
  const [namespaceDraft, setNamespaceDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logsSince, setLogsSince] = useState("");
  const stopStreamRef = useRef<(() => void) | null>(null);

  const stopStream = useCallback(() => {
    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
    }
    setStreaming(false);
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const viewMode: ViewMode = activeTab?.viewMode ?? "table";
  const kubeconfigPaths = useMemo(() => settings?.kubeconfigPaths ?? [], [settings]);

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

  const refreshContexts = useCallback(async () => {
    const result = await window.kubeui.runKubectl({
      args: ["config", "view", "-o", "json"],
      kubeconfigPaths
    });
    if (!result.ok) {
      setContexts([]);
      setContextNamespaces({});
      setGlobalMessage(result.stderr || "No se pudieron leer los contextos.");
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
    setGlobalMessage("");
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
          : { ...tab, context: nextContexts[0], title: nextContexts[0], namespace: nsMap[nextContexts[0]] ?? "default", rows: [], selectedName: "" }
      );
    });
  }, [kubeconfigPaths]);

  const refreshNamespaces = useCallback(
    async (context: string) => {
      if (!context) return;
      const result = await window.kubeui.runKubectl({
        args: ["get", "namespaces", "-o", "json"],
        kubeconfigPaths,
        context
      });
      if (!result.ok) return;
      const payload = JSON.parse(result.stdout) as { items?: KubeItem[] };
      const namespaces = (payload.items ?? []).map(nameOf).filter(Boolean);
      setNamespacesByContext((current) => ({
        ...current,
        [context]: Array.from(new Set([...(current[context] ?? []), ...namespaces]))
      }));
    },
    [kubeconfigPaths]
  );

  const loadResources = useCallback(
    async (tab: TabSession) => {
      if (!tab.context) return;
      const config = configByKey[tab.resource];
      updateTab(tab.id, { loading: true, output: "", outputTitle: "" });
      const result = await window.kubeui.runKubectl({
        args: ["get", config.kubectlName, "-o", "json"],
        kubeconfigPaths,
        context: tab.context,
        namespace: config.namespaced ? tab.namespace : undefined
      });
      if (!result.ok) {
        updateTab(tab.id, { loading: false, outputTitle: "Error", output: result.stderr, lastCommand: result.command, rows: [] });
        return;
      }
      let items: KubeItem[] = [];
      try {
        items = (JSON.parse(result.stdout) as { items?: KubeItem[] }).items ?? [];
      } catch {
        items = [];
      }
      updateTab(tab.id, { rows: items, selectedName: "", loading: false, lastCommand: result.command });
    },
    [kubeconfigPaths]
  );

  useEffect(() => {
    window.kubeui.getSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (!settings) return;
    window.kubeui.runKubectl({ args: ["version", "--client"], kubeconfigPaths }).then(setKubectlStatus);
    refreshContexts();
  }, [settings, kubeconfigPaths, refreshContexts]);

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
  useEffect(() => () => stopStream(), [stopStream]);

  // Carga automatica de recursos al cambiar de pestana, contexto, namespace o tipo de recurso.
  useEffect(() => {
    if (!activeTab || !activeTab.context) return;
    if (viewMode !== "table") return;
    loadResources(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id, activeTab?.context, activeTab?.namespace, activeTab?.resource, viewMode, loadResources]);

  const updateActiveTab = (patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  };

  const setViewMode = (mode: ViewMode) => updateActiveTab({ viewMode: mode });

  const commitNamespace = () => {
    if (!activeTab) return;
    const next = namespaceDraft.trim() || "default";
    if (next !== activeTab.namespace) {
      updateActiveTab({ namespace: next, rows: [], selectedName: "" });
    } else if (next !== namespaceDraft) {
      setNamespaceDraft(next);
    }
  };

  const updateTab = (tabId: string, patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  };

  const refreshResources = async () => {
    if (!activeTab) return;
    setViewMode("table");
    await loadResources(activeTab);
  };

  const showOutput = async (mode: ViewMode, args: string[], title: string) => {
    if (!activeTab) return;
    stopStream();
    updateActiveTab({ loading: true });
    const result = await run(activeTab, args);
    updateActiveTab({
      loading: false,
      outputTitle: title,
      output: result.ok ? result.stdout : result.stderr,
      lastCommand: result.command
    });
    setViewMode(mode);
  };

  // Logs en tiempo real: usamos -f y vamos anexando cada linea conforme llega.
  const streamLogs = (since = logsSince) => {
    if (!activeTab || !activeTab.selectedName) return;
    stopStream();
    const tabId = activeTab.id;
    const name = activeTab.selectedName;
    updateActiveTab({ loading: true, outputTitle: `Logs ${name}`, output: "" });
    setViewMode("logs");
    setStreaming(true);
    stopStreamRef.current = window.kubeui.streamKubectl(
      {
        args: ["logs", "-f", ...(since ? [`--since=${since}`] : []), name],
        kubeconfigPaths,
        context: activeTab.context,
        namespace: activeTab.namespace
      },
      {
        onData: (chunk) => {
          setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, output: tab.output + chunk } : tab)));
        },
        onEnd: ({ command, error }) => {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === tabId
                ? { ...tab, loading: false, lastCommand: command || tab.lastCommand, output: error ? `${tab.output}\n${error}` : tab.output }
                : tab
            )
          );
          setStreaming(false);
          stopStreamRef.current = null;
        }
      }
    );
  };

  // Cambia el rango --since y reinicia el seguimiento de logs.
  const changeLogsSince = (value: string) => {
    setLogsSince(value);
    if (activeTab?.selectedName) streamLogs(value);
  };

  const selectedName = activeTab?.selectedName ?? "";
  const selectedConfig = activeTab ? configByKey[activeTab.resource] : resourceConfigs[0];

  const addTab = () => {
    const context = contexts[0] ?? "";
    const tab = createTab(context, contextNamespaces[context]);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) {
        stopStream();
        setActiveTabId(next[0]?.id ?? "");
      }
      return next;
    });
  };

  const addKubeconfigs = async () => {
    const next = await window.kubeui.addKubeconfigs();
    setSettings((current) => (current ? { ...current, kubeconfigPaths: next.kubeconfigPaths } : null));
  };

  const removeKubeconfig = async (kubeconfigPath: string) => {
    const next = await window.kubeui.removeKubeconfig(kubeconfigPath);
    setSettings((current) => (current ? { ...current, kubeconfigPaths: next.kubeconfigPaths } : null));
  };

  const deleteResource = async () => {
    if (!activeTab || !selectedName) return;
    if (!confirm(`Eliminar ${selectedConfig.label}: ${selectedName}?`)) return;
    await showOutput("details", ["delete", selectedConfig.kubectlName, selectedName], `Eliminar ${selectedName}`);
    await refreshResources();
  };

  const restartResource = async () => {
    if (!activeTab || !selectedName) return;
    const args =
      activeTab.resource === "pods"
        ? ["delete", "pod", selectedName]
        : ["rollout", "restart", "deployment", selectedName];
    if (!confirm(`Reiniciar ${selectedName}?`)) return;
    await showOutput("details", args, `Reiniciar ${selectedName}`);
    await refreshResources();
  };

  const scaleDeployment = async () => {
    if (!activeTab || activeTab.resource !== "deployments" || !selectedName) return;
    const replicas = prompt("Réplicas", "1");
    if (!replicas || !/^\d+$/.test(replicas)) return;
    await showOutput("details", ["scale", "deployment", selectedName, `--replicas=${replicas}`], `Escalar ${selectedName}`);
    await refreshResources();
  };

  const runTerminal = () => {
    if (!activeTab || !activeTab.terminalCommand.trim()) return;
    stopStream();
    const tabId = activeTab.id;
    const command = activeTab.terminalCommand;
    updateActiveTab({ loading: true, terminalOutput: `$ ${command}\n\n` });
    setStreaming(true);
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
        onEnd: ({ command: resolved, error }) => {
          setTabs((current) =>
            current.map((tab) =>
              tab.id === tabId
                ? { ...tab, loading: false, lastCommand: resolved || tab.lastCommand, terminalOutput: error ? `${tab.terminalOutput}\n${error}` : tab.terminalOutput }
                : tab
            )
          );
          setStreaming(false);
          stopStreamRef.current = null;
        }
      }
    );
  };

  const pickYaml = async () => {
    const file = await window.kubeui.pickYamlFile();
    if (file) updateActiveTab({ yamlDraft: file.content });
  };

  const applyYaml = async () => {
    if (!activeTab || !activeTab.yamlDraft.trim()) return;
    if (!confirm("Aplicar YAML en el contexto seleccionado?")) return;
    updateActiveTab({ loading: true });
    const result = await window.kubeui.applyYaml({
      yaml: activeTab.yamlDraft,
      kubeconfigPaths,
      context: activeTab.context,
      namespace: activeTab.namespace
    });
    updateActiveTab({
      loading: false,
      outputTitle: "Apply YAML",
      output: result.ok ? result.stdout : result.stderr,
      lastCommand: result.command
    });
    setViewMode("details");
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

  return (
    <div className="app-shell">
      <div className="tabstrip">
        <button
          className="sidebar-toggle"
          title={sidebarOpen ? "Ocultar panel" : "Mostrar panel"}
          onClick={() => setSidebarOpen((value) => !value)}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div className="tabstrip-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`chrome-tab ${tab.id === activeTabId ? "active" : ""}`}
              onClick={() => {
                stopStream();
                setActiveTabId(tab.id);
              }}
            >
              <Layers3 size={15} />
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
          <button className="tabstrip-add" title="Nueva pestaña" onClick={addTab}>
            <Plus size={16} />
          </button>
        </div>
      </div>

      <main className={`workspace ${sidebarOpen ? "" : "collapsed"}`}>
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="resource-list">
              {resourceConfigs.map((config) => (
                <button
                  key={config.key}
                  className={activeTab?.resource === config.key && viewMode === "table" ? "active" : ""}
                  onClick={() => {
                    stopStream();
                    updateActiveTab({ resource: config.key, rows: [], selectedName: "" });
                    setViewMode("table");
                  }}
                >
                  {config.label}
                </button>
              ))}
            </div>
            <div className="side-actions">
              <button className={viewMode === "terminal" ? "active" : ""} onClick={() => setViewMode("terminal")}>
                <SquareTerminal size={16} />
                Terminal
              </button>
              <button className={viewMode === "apply" ? "active" : ""} onClick={() => setViewMode("apply")}>
                <FileCode2 size={16} />
                Apply YAML
              </button>
            </div>
          </aside>
        )}

        <section className="content">
          {globalMessage && <div className="banner">{globalMessage}</div>}
          {activeTab && viewMode !== "settings" && (
            <div className="session-bar">
              <label>
                Contexto
                <span className="select-wrap">
                  <select
                    value={activeTab.context}
                    onChange={(event) => {
                      const nextContext = event.target.value;
                      stopStream();
                      updateActiveTab({ context: nextContext, namespace: contextNamespaces[nextContext] ?? "default", rows: [], selectedName: "", title: nextContext || "Sin contexto" });
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
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => {
                      const value = event.target.value;
                      setNamespaceDraft(value);
                      if (namespaces.includes(value) && value !== activeTab.namespace) {
                        updateActiveTab({ namespace: value, rows: [], selectedName: "" });
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitNamespace();
                      }
                    }}
                    onBlur={commitNamespace}
                  />
                  <ChevronDown size={15} />
                  <datalist id="namespace-options">
                    {namespaces.map((namespace) => (
                      <option key={namespace} value={namespace} />
                    ))}
                  </datalist>
                </span>
              </label>
              <button className="toolbar-button" onClick={refreshResources} disabled={activeTab.loading}>
                <RefreshCw size={16} />
                Refrescar
              </button>
              <code>{activeTab.lastCommand || "kubectl --context ..."}</code>
            </div>
          )}

          {viewMode === "settings" && settings && (
            <SettingsView
              settings={settings}
              onAdd={addKubeconfigs}
              onRemove={removeKubeconfig}
              onRefresh={refreshContexts}
            />
          )}

          {activeTab && viewMode === "table" && (
            <ResourceTable
              tab={activeTab}
              config={selectedConfig}
              onRefresh={refreshResources}
              onSelect={(name) => updateActiveTab({ selectedName: name })}
              onDescribe={() => selectedName && showOutput("details", ["describe", selectedConfig.kubectlName, selectedName], `Describe ${selectedName}`)}
              onYaml={() => selectedName && showOutput("yaml", ["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"], `YAML ${selectedName}`)}
              onLogs={() => selectedName && streamLogs()}
              onDelete={deleteResource}
              onRestart={restartResource}
              onScale={scaleDeployment}
            />
          )}

          {activeTab && (viewMode === "details" || viewMode === "yaml") && (
            <OutputPanel title={activeTab.outputTitle} output={activeTab.output} />
          )}

          {activeTab && viewMode === "logs" && (
            <LogsPanel
              title={activeTab.outputTitle}
              output={activeTab.output}
              streaming={streaming}
              since={logsSince}
              onSinceChange={changeLogsSince}
              onBack={() => {
                stopStream();
                setViewMode("table");
              }}
              onResume={() => streamLogs()}
              onStop={stopStream}
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
              onStop={stopStream}
            />
          )}

          {activeTab && viewMode === "apply" && (
            <ApplyPanel
              yaml={activeTab.yamlDraft}
              loading={activeTab.loading}
              onChange={(yamlDraft) => updateActiveTab({ yamlDraft })}
              onPick={pickYaml}
              onApply={applyYaml}
            />
          )}
        </section>
      </main>

      <footer className="statusbar">
        <div className="brand">
          <Boxes size={20} />
          <div>
            <strong>kubeui</strong>
            <span>{kubeconfigPaths.length ? `${kubeconfigPaths.length} kubeconfig` : "sin kubeconfig"}</span>
          </div>
        </div>
        <div className={`status-pill ${statusOk ? "ok" : "bad"}`}>
          {statusOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          <span>{statusOk ? "kubectl listo" : "kubectl no disponible"}</span>
        </div>
        <button className="icon-button" title="Configurar kubeconfig" onClick={() => setViewMode("settings")}>
          <Settings size={18} />
        </button>
      </footer>
    </div>
  );
}

function MissingBridge() {
  return (
    <div className="bridge-error">
      <div>
        <Boxes size={34} />
        <h1>kubeui no pudo cargar la API de escritorio</h1>
        <p>
          Abre la app con <code>start-macos.command</code>, <code>start-windows.bat</code> o <code>npm run dev</code>.
          Si estás viendo esto dentro de Electron, cierra la ventana y vuelve a iniciar.
        </p>
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  onAdd,
  onRemove,
  onRefresh
}: {
  settings: AppSettings;
  onAdd: () => void;
  onRemove: (path: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="settings-view">
      <div className="panel-title">
        <div>
          <h1>Kubeconfig</h1>
          <p>{settings.kubeconfigPaths.length ? "Archivos registrados" : "Sin archivos registrados"}</p>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onAdd}>
            <FolderPlus size={16} />
            Agregar
          </button>
          <button className="toolbar-button" onClick={onRefresh}>
            <RefreshCw size={16} />
            Contextos
          </button>
        </div>
      </div>
      <div className="file-list">
        {!settings.kubeconfigPaths.length && (
          <div className="file-row muted">
            <span>Agrega un archivo kubeconfig para cargar tus contextos.</span>
          </div>
        )}
        {settings.kubeconfigPaths.map((kubeconfigPath) => (
          <div className="file-row" key={kubeconfigPath}>
            <Shield size={17} />
            <code>{kubeconfigPath}</code>
            <button className="icon-button danger" title="Quitar" onClick={() => onRemove(kubeconfigPath)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceTable({
  tab,
  config,
  onRefresh,
  onSelect,
  onDescribe,
  onYaml,
  onLogs,
  onDelete,
  onRestart,
  onScale
}: {
  tab: TabSession;
  config: ResourceConfig;
  onRefresh: () => void;
  onSelect: (name: string) => void;
  onDescribe: () => void;
  onYaml: () => void;
  onLogs: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onScale: () => void;
}) {
  const selected = Boolean(tab.selectedName);
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!needle) return tab.rows;
    return tab.rows.filter((item) => {
      const haystack = [
        nameOf(item),
        ...config.columns.map((column) => {
          const value = column.getter(item);
          return typeof value === "string" || typeof value === "number" ? String(value) : "";
        })
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [tab.rows, config.columns, needle]);
  return (
    <div className="table-panel">
      <div className="panel-title">
        <div>
          <h1>{config.label}</h1>
          <p>{needle ? `${filteredRows.length} de ${tab.rows.length} recursos` : `${tab.rows.length} recursos`}</p>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onRefresh} disabled={tab.loading}>
            <RefreshCw size={16} />
            Refrescar
          </button>
          <button className="toolbar-button" onClick={onDescribe} disabled={!selected}>
            <ScrollText size={16} />
            Describe
          </button>
          <button className="toolbar-button" onClick={onYaml} disabled={!selected}>
            <FileCode2 size={16} />
            YAML
          </button>
          {config.key === "pods" && (
            <button className="toolbar-button" onClick={onLogs} disabled={!selected}>
              <SquareTerminal size={16} />
              Logs
            </button>
          )}
          {(config.key === "pods" || config.key === "deployments") && (
            <button className="toolbar-button" onClick={onRestart} disabled={!selected}>
              <RotateCcw size={16} />
              Reiniciar
            </button>
          )}
          {config.key === "deployments" && (
            <button className="toolbar-button" onClick={onScale} disabled={!selected}>
              <Scale3D size={16} />
              Escalar
            </button>
          )}
          <button className="toolbar-button danger" onClick={onDelete} disabled={!selected}>
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
      <div className="table-filter">
        <Search size={15} />
        <input
          type="text"
          value={filter}
          placeholder={`Filtrar ${config.label.toLowerCase()}...`}
          onChange={(event) => setFilter(event.target.value)}
        />
        {filter && (
          <button className="table-filter-clear" title="Limpiar" onClick={() => setFilter("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {config.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((item) => {
              const name = nameOf(item);
              return (
                <tr key={name} className={tab.selectedName === name ? "selected" : ""} onClick={() => onSelect(name)}>
                  {config.columns.map((column) => (
                    <td key={column.key}>{column.getter(item)}</td>
                  ))}
                </tr>
              );
            })}
            {!filteredRows.length && (
              <tr>
                <td colSpan={config.columns.length} className="empty-state">
                  {tab.loading ? "Cargando..." : needle ? "Sin coincidencias" : "Sin datos"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutputPanel({ title, output, streaming, onStop }: { title: string; output: string; streaming?: boolean; onStop?: () => void }) {
  return (
    <div className="output-panel">
      <div className="panel-title">
        <h1>{title || "Salida"}</h1>
        {streaming && onStop && (
          <button className="toolbar-button danger" onClick={onStop}>
            <Square size={16} />
            Detener
          </button>
        )}
      </div>
      <pre>{output || (streaming ? "Esperando salida..." : "Sin salida")}</pre>
    </div>
  );
}

type ParsedLog = {
  time?: string;
  level?: string;
  message: string;
  source?: string;
  json?: Record<string, unknown>;
};

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
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
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { message: line };
  }
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const level = pick(json, ["level", "severity.text", "severity_text", "loglevel", "status", "lvl", "log.level"]);
    const message = pick(json, ["message", "msg", "log", "text"]);
    const source = pick(json, ["logger.name", "logger_name", "service.name", "k8s.container.name", "thread.name"]);
    return {
      time: formatTime(pick(json, ["@timestamp", "timestamp", "time", "ts", "@t"])),
      level: level ? String(level).toUpperCase() : undefined,
      message: message !== undefined ? String(message) : trimmed,
      source: source ? String(source) : undefined,
      json
    };
  } catch {
    return { message: line };
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

const SINCE_OPTIONS: { label: string; value: string }[] = [
  { label: "Todo", value: "" },
  { label: "1 min", value: "1m" },
  { label: "5 min", value: "5m" },
  { label: "15 min", value: "15m" },
  { label: "30 min", value: "30m" },
  { label: "1 hora", value: "1h" },
  { label: "6 horas", value: "6h" },
  { label: "24 horas", value: "24h" }
];

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

function LogsPanel({
  title,
  output,
  streaming,
  since,
  onSinceChange,
  onBack,
  onResume,
  onStop
}: {
  title: string;
  output: string;
  streaming?: boolean;
  since?: string;
  onSinceChange?: (value: string) => void;
  onBack?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pretty, setPretty] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);

  const lines = useMemo(() => output.split("\n").filter((line) => line.trim().length > 0), [output]);
  const parsed = useMemo(() => lines.map(parseLogLine), [lines]);

  const sinceLabel = (SINCE_OPTIONS.find((option) => option.value === since)?.label ?? since ?? "").toLowerCase();

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [] as number[];
    const result: number[] = [];
    parsed.forEach((entry, i) => {
      const haystack = `${entry.time ?? ""} ${entry.level ?? ""} ${entry.message} ${entry.source ?? ""}`.toLowerCase();
      if (haystack.includes(term)) result.push(i);
    });
    return result;
  }, [parsed, query]);

  const matchSet = useMemo(() => new Set(matches), [matches]);
  const currentLine = matches.length ? matches[Math.min(activeMatch, matches.length - 1)] : -1;

  useEffect(() => {
    setActiveMatch(0);
  }, [query]);

  useEffect(() => {
    if (currentLine >= 0) rowRefs.current[currentLine]?.scrollIntoView({ block: "center" });
  }, [currentLine]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        setPretty(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  const goNext = () => {
    if (matches.length) setActiveMatch((current) => (current + 1) % matches.length);
  };
  const goPrev = () => {
    if (matches.length) setActiveMatch((current) => (current - 1 + matches.length) % matches.length);
  };

  const toggle = (index: number) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

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
          {onSinceChange && (
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
            title="Buscar (Ctrl+F)"
            onClick={() => {
              setPretty(true);
              setSearchOpen((value) => !value);
              window.setTimeout(() => searchInputRef.current?.focus(), 0);
            }}
          >
            <Search size={16} />
            Buscar
          </button>
          <button className="toolbar-button" onClick={() => setPretty((value) => !value)}>
            {pretty ? "Ver crudo" : "Ver formateado"}
          </button>
          {streaming && onStop ? (
            <button className="toolbar-button danger" onClick={onStop}>
              <Square size={16} />
              Detener
            </button>
          ) : (
            onResume && (
              <button className="toolbar-button accent" onClick={onResume}>
                <RefreshCw size={16} />
                Refrescar
              </button>
            )
          )}
        </div>
      </div>

      {searchOpen && (
        <div className="logs-search">
          <Search size={15} />
          <input
            ref={searchInputRef}
            value={query}
            placeholder="Buscar en los logs..."
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.shiftKey) goPrev();
                else goNext();
              } else if (event.key === "Escape") {
                setSearchOpen(false);
                setQuery("");
              }
            }}
          />
          <span className="logs-search-count">
            {query.trim() ? (matches.length ? `${Math.min(activeMatch, matches.length - 1) + 1}/${matches.length}` : "0/0") : ""}
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
              setQuery("");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="logs-empty">
          {streaming
            ? since
              ? `Sin registros en los últimos ${sinceLabel}. Esperando nuevos logs…`
              : "Esperando logs…"
            : "Sin logs"}
        </div>
      ) : pretty ? (
        <div className="logs-view">
          {parsed.map((entry, index) => {
            const isJson = Boolean(entry.json);
            const isOpen = expanded.has(index);
            const isMatch = matchSet.has(index);
            const isCurrent = index === currentLine;
            const term = query.trim();
            return (
              <div
                key={index}
                ref={(element) => (rowRefs.current[index] = element)}
                className={`log-row ${levelClass(entry.level)}${isMatch ? " is-match" : ""}${isCurrent ? " is-current" : ""}`}
              >
                <div
                  className={`log-line${isJson ? " clickable" : ""}`}
                  onClick={isJson ? () => toggle(index) : undefined}
                >
                  {entry.time && <span className="log-time">{entry.time}</span>}
                  {entry.level && <span className={`log-level ${levelClass(entry.level)}`}>{entry.level}</span>}
                  <span className="log-message">{term ? highlightText(entry.message, term) : entry.message}</span>
                  {entry.source && <span className="log-source">{entry.source}</span>}
                </div>
                {isJson && isOpen && <pre className="log-json">{JSON.stringify(entry.json, null, 2)}</pre>}
              </div>
            );
          })}
        </div>
      ) : (
        <pre>{output}</pre>
      )}
    </div>
  );
}

function TerminalPanel({
  command,
  output,
  loading,
  streaming,
  onChange,
  onRun,
  onStop
}: {
  command: string;
  output: string;
  loading: boolean;
  streaming?: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onStop?: () => void;
}) {
  return (
    <div className="terminal-panel">
      <div className="terminal-input">
        <SquareTerminal size={18} />
        <input
          value={command}
          placeholder="kubectl get pods -o wide"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onRun();
          }}
        />
        {streaming ? (
          <button className="toolbar-button danger" onClick={onStop}>
            <Square size={16} />
            Detener
          </button>
        ) : (
          <button className="toolbar-button" disabled={loading} onClick={onRun}>
            <Play size={16} />
            Ejecutar
          </button>
        )}
      </div>
      <pre>{output || " "}</pre>
    </div>
  );
}

function ApplyPanel({
  yaml,
  loading,
  onChange,
  onPick,
  onApply
}: {
  yaml: string;
  loading: boolean;
  onChange: (value: string) => void;
  onPick: () => void;
  onApply: () => void;
}) {
  return (
    <div className="apply-panel">
      <div className="panel-title">
        <h1>Apply YAML</h1>
        <div className="button-row">
          <button className="toolbar-button" onClick={onPick}>
            <FolderPlus size={16} />
            Archivo
          </button>
          <button className="toolbar-button primary" onClick={onApply} disabled={loading || !yaml.trim()}>
            <Play size={16} />
            Aplicar
          </button>
        </div>
      </div>
      <textarea value={yaml} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
    </div>
  );
}

function createTab(context: string, namespace?: string): TabSession {
  return {
    id: crypto.randomUUID(),
    title: context || "Sin contexto",
    context,
    namespace: namespace || "default",
    resource: "pods",
    rows: [],
    selectedName: "",
    viewMode: "table",
    outputTitle: "",
    output: "",
    lastCommand: "",
    terminalCommand: "kubectl get pods",
    terminalOutput: "",
    yamlDraft: "",
    loading: false
  };
}

function nameOf(item: KubeItem) {
  return item.metadata?.name ?? "";
}

function stringAt(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

function numberAt(value: unknown) {
  if (typeof value !== "number") return 0;
  return value;
}

function readyContainers(item: KubeItem) {
  const statuses = (item.status as { containerStatuses?: Array<{ ready?: boolean }> })?.containerStatuses ?? [];
  return `${statuses.filter((status) => status.ready).length}/${statuses.length}`;
}

function restartCount(item: KubeItem) {
  const statuses = (item.status as { containerStatuses?: Array<{ restartCount?: number }> })?.containerStatuses ?? [];
  return String(statuses.reduce((total, status) => total + (status.restartCount ?? 0), 0));
}

function ports(item: KubeItem) {
  const servicePorts = (item.spec as { ports?: Array<{ port?: number; targetPort?: number | string; protocol?: string }> })?.ports ?? [];
  return servicePorts.map((port) => `${port.port}:${port.targetPort ?? "-"}${port.protocol ? `/${port.protocol}` : ""}`).join(", ") || "-";
}

function ingressHosts(item: KubeItem) {
  const rules = (item.spec as { rules?: Array<{ host?: string }> })?.rules ?? [];
  return rules.map((rule) => rule.host).filter(Boolean).join(", ") || "-";
}

function nodeReady(item: KubeItem) {
  const conditions = (item.status as { conditions?: Array<{ type?: string; status?: string }> })?.conditions ?? [];
  return conditions.find((condition) => condition.type === "Ready")?.status === "True" ? "Ready" : "NotReady";
}

function nodeRoles(item: KubeItem) {
  const labels = item.metadata?.labels ?? {};
  const roles = Object.keys(labels)
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.replace("node-role.kubernetes.io/", ""))
    .filter(Boolean);
  return roles.join(", ") || "worker";
}

function age(timestamp?: string) {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
