import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  FolderPlus,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale3D,
  ScrollText,
  Settings,
  Shield,
  SquareTerminal,
  Trash2,
  X,
  XCircle
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [namespacesByContext, setNamespacesByContext] = useState<Record<string, string[]>>({});
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [globalMessage, setGlobalMessage] = useState("");

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const kubeconfigPaths = settings?.kubeconfigPaths ?? [];

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
      args: ["config", "get-contexts", "-o", "name"],
      kubeconfigPaths
    });
    if (!result.ok) {
      setContexts([]);
      setGlobalMessage(result.stderr || "No se pudieron leer los contextos.");
      return;
    }
    const nextContexts = result.stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    setContexts(nextContexts);
    setGlobalMessage("");
    setTabs((current) => {
      if (current.length || !nextContexts[0]) return current;
      const initial = createTab(nextContexts[0]);
      setActiveTabId(initial.id);
      return [initial];
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
      setNamespacesByContext((current) => ({ ...current, [context]: namespaces }));
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

  const updateActiveTab = (patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  };

  const updateTab = (tabId: string, patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  };

  const refreshResources = async () => {
    if (!activeTab) return;
    const config = configByKey[activeTab.resource];
    updateActiveTab({ loading: true, output: "", outputTitle: "" });
    const result = await run(activeTab, ["get", config.kubectlName, "-o", "json"], config.namespaced ? activeTab.namespace : undefined);
    if (!result.ok) {
      updateActiveTab({ loading: false, outputTitle: "Error", output: result.stderr, lastCommand: result.command });
      return;
    }
    const payload = JSON.parse(result.stdout) as { items?: KubeItem[] };
    updateActiveTab({
      rows: payload.items ?? [],
      selectedName: "",
      loading: false,
      lastCommand: result.command
    });
    setViewMode("table");
  };

  const showOutput = async (mode: ViewMode, args: string[], title: string) => {
    if (!activeTab) return;
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

  const selectedName = activeTab?.selectedName ?? "";
  const selectedConfig = activeTab ? configByKey[activeTab.resource] : resourceConfigs[0];

  const addTab = () => {
    const context = contexts[0] ?? "";
    const tab = createTab(context);
    setTabs((current) => [...current, tab]);
    setActiveTabId(tab.id);
    setViewMode("table");
  };

  const closeTab = (tabId: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== tabId);
      if (activeTabId === tabId) setActiveTabId(next[0]?.id ?? "");
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

  const resetDefaultKubeconfig = async () => {
    const next = await window.kubeui.resetDefaultKubeconfig();
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

  const runTerminal = async () => {
    if (!activeTab || !activeTab.terminalCommand.trim()) return;
    updateActiveTab({ loading: true });
    const result = await window.kubeui.runManualKubectl({
      command: activeTab.terminalCommand,
      kubeconfigPaths,
      context: activeTab.context,
      namespace: activeTab.namespace
    });
    updateActiveTab({
      loading: false,
      terminalOutput: `${result.command}\n\n${result.stdout}${result.stderr ? `\n${result.stderr}` : ""}`,
      lastCommand: result.command
    });
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

  const namespaces = activeTab?.context ? namespacesByContext[activeTab.context] ?? ["default"] : ["default"];
  const statusOk = kubectlStatus?.ok;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Boxes size={24} />
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
      </header>

      <main className="workspace">
        <aside className="sidebar">
          <button className="new-tab" onClick={addTab}>
            <Plus size={17} />
            Nueva pestaña
          </button>
          <nav className="tab-list">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-button ${tab.id === activeTabId ? "active" : ""}`}
                onClick={() => {
                  setActiveTabId(tab.id);
                  setViewMode("table");
                }}
              >
                <Layers3 size={16} />
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <X
                    size={14}
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(tab.id);
                    }}
                  />
                )}
              </button>
            ))}
          </nav>
          <div className="resource-list">
            {resourceConfigs.map((config) => (
              <button
                key={config.key}
                className={activeTab?.resource === config.key && viewMode === "table" ? "active" : ""}
                onClick={() => {
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
                      updateActiveTab({ context: event.target.value, namespace: "default", rows: [], selectedName: "", title: event.target.value || "Sin contexto" });
                      refreshNamespaces(event.target.value);
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
                  <select value={activeTab.namespace} onChange={(event) => updateActiveTab({ namespace: event.target.value, rows: [], selectedName: "" })}>
                    {namespaces.map((namespace) => (
                      <option key={namespace} value={namespace}>
                        {namespace}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={15} />
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
              onReset={resetDefaultKubeconfig}
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
              onLogs={() => selectedName && showOutput("logs", ["logs", selectedName], `Logs ${selectedName}`)}
              onDelete={deleteResource}
              onRestart={restartResource}
              onScale={scaleDeployment}
            />
          )}

          {activeTab && (viewMode === "details" || viewMode === "yaml" || viewMode === "logs") && (
            <OutputPanel title={activeTab.outputTitle} output={activeTab.output} />
          )}

          {activeTab && viewMode === "terminal" && (
            <TerminalPanel
              command={activeTab.terminalCommand}
              output={activeTab.terminalOutput}
              loading={activeTab.loading}
              onChange={(terminalCommand) => updateActiveTab({ terminalCommand })}
              onRun={runTerminal}
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
  onReset,
  onRefresh
}: {
  settings: AppSettings;
  onAdd: () => void;
  onRemove: (path: string) => void;
  onReset: () => void;
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
          <button className="toolbar-button" onClick={onReset}>
            <RotateCcw size={16} />
            Default
          </button>
          <button className="toolbar-button" onClick={onRefresh}>
            <RefreshCw size={16} />
            Contextos
          </button>
        </div>
      </div>
      <div className="file-list">
        <div className="file-row muted">
          <span>Default</span>
          <code>{settings.defaultKubeconfigPath}</code>
        </div>
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
  return (
    <div className="table-panel">
      <div className="panel-title">
        <div>
          <h1>{config.label}</h1>
          <p>{tab.rows.length} recursos</p>
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
            {tab.rows.map((item) => {
              const name = nameOf(item);
              return (
                <tr key={name} className={tab.selectedName === name ? "selected" : ""} onClick={() => onSelect(name)}>
                  {config.columns.map((column) => (
                    <td key={column.key}>{column.getter(item)}</td>
                  ))}
                </tr>
              );
            })}
            {!tab.rows.length && (
              <tr>
                <td colSpan={config.columns.length} className="empty-state">
                  {tab.loading ? "Cargando..." : "Sin datos"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutputPanel({ title, output }: { title: string; output: string }) {
  return (
    <div className="output-panel">
      <div className="panel-title">
        <h1>{title || "Salida"}</h1>
      </div>
      <pre>{output || "Sin salida"}</pre>
    </div>
  );
}

function TerminalPanel({
  command,
  output,
  loading,
  onChange,
  onRun
}: {
  command: string;
  output: string;
  loading: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
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
        <button className="toolbar-button" disabled={loading} onClick={onRun}>
          <Play size={16} />
          Ejecutar
        </button>
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

function createTab(context: string): TabSession {
  return {
    id: crypto.randomUUID(),
    title: context || "Sin contexto",
    context,
    namespace: "default",
    resource: "pods",
    rows: [],
    selectedName: "",
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
