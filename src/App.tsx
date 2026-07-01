import {
  ArrowLeft,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCode2,
  FolderPlus,
  FolderOpen,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Pencil,
  Pin,
  Play,
  Plus,
  Maximize2,
  Minimize2,
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
import type { KubeconfigInspection, KubectlResult, Settings as AppSettings } from "./types";

type ResourceKey =
  | "pods"
  | "deployments"
  | "statefulsets"
  | "daemonsets"
  | "replicasets"
  | "cronjobs"
  | "jobs"
  | "services"
  | "ingress"
  | "configmaps"
  | "secrets"
  | "persistentvolumeclaims"
  | "horizontalpodautoscalers"
  | "namespaces"
  | "nodes";
type ViewMode = "table" | "details" | "yaml" | "logs" | "terminal" | "apply" | "settings";

type ResourceConfig = {
  key: ResourceKey;
  label: string;
  kubectlName: string;
  namespaced: boolean;
  editable?: boolean;
  columns: Array<{ key: string; label: string; getter: (item: KubeItem) => string }>;
};

type KubeItem = {
  metadata?: {
    name?: string;
    namespace?: string;
    creationTimestamp?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  status?: Record<string, unknown>;
  spec?: Record<string, unknown>;
  type?: string;
};

// Estado que se persiste por kind dentro de una pestaña, para que al
// volver a un recurso se restaure exactamente donde se quedo el usuario.
type ResourceSnapshot = {
  rows: KubeItem[];
  selectedName: string;
  selectedNames: string[];
  viewMode: ViewMode;
  outputTitle: string;
  output: string;
  lastCommand: string;
};

type TabSession = {
  id: string;
  title: string;
  context: string;
  namespace: string;
  resource: ResourceKey;
  rows: KubeItem[];
  selectedName: string;
  selectedNames: string[];
  viewMode: ViewMode;
  outputTitle: string;
  output: string;
  lastCommand: string;
  terminalCommand: string;
  terminalOutput: string;
  yamlDraft: string;
  // El panel de YAML se abrio para editar un recurso existente (Editar): al
  // guardar se usa `kubectl replace` (estilo edit). Si es false, es un Apply
  // YAML libre (archivo/pegado) y se usa `kubectl apply`.
  yamlEditMode: boolean;
  loading: boolean;
  runState: TabRunState;
  runLabel: string;
  streamPinned: boolean;
  // Cache por kind: guarda el ultimo estado antes de cambiar de recurso.
  resourceCache: Partial<Record<ResourceKey, ResourceSnapshot>>;
};

type DetailDialog = {
  title: string;
  message?: string;
  details?: string;
  command?: string;
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
    key: "statefulsets",
    label: "StatefulSets",
    kubectlName: "statefulsets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "ready", label: "Ready", getter: (item) => `${numberAt(item.status?.readyReplicas)}/${numberAt(item.status?.replicas)}` },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "daemonsets",
    label: "DaemonSets",
    kubectlName: "daemonsets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "desired", label: "Desired", getter: (item) => stringAt(item.status?.desiredNumberScheduled) },
      { key: "current", label: "Current", getter: (item) => stringAt(item.status?.currentNumberScheduled) },
      { key: "ready", label: "Ready", getter: (item) => stringAt(item.status?.numberReady) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "replicasets",
    label: "ReplicaSets",
    kubectlName: "replicasets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "desired", label: "Desired", getter: (item) => stringAt(item.spec?.replicas) },
      { key: "current", label: "Current", getter: (item) => stringAt(item.status?.replicas) },
      { key: "ready", label: "Ready", getter: (item) => stringAt(item.status?.readyReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "cronjobs",
    label: "CronJobs",
    kubectlName: "cronjobs",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "schedule", label: "Schedule", getter: (item) => stringAt(item.spec?.schedule) },
      { key: "suspend", label: "Suspendido", getter: (item) => ((item.spec as { suspend?: boolean })?.suspend ? "Sí" : "No") },
      { key: "active", label: "Activos", getter: (item) => String(((item.status as { active?: unknown[] })?.active ?? []).length) },
      { key: "lastSchedule", label: "Última ejec.", getter: (item) => age((item.status as { lastScheduleTime?: string })?.lastScheduleTime) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "jobs",
    label: "Jobs",
    kubectlName: "jobs",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "completions", label: "Completions", getter: (item) => `${numberAt(item.status?.succeeded)}/${stringAt(item.spec?.completions)}` },
      { key: "active", label: "Activos", getter: (item) => stringAt(item.status?.active) },
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
    key: "persistentvolumeclaims",
    label: "PVCs",
    kubectlName: "persistentvolumeclaims",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
      { key: "volume", label: "Volumen", getter: (item) => stringAt(item.spec?.volumeName) },
      { key: "capacity", label: "Capacidad", getter: (item) => stringAt((item.status as { capacity?: { storage?: string } })?.capacity?.storage) },
      { key: "storageClass", label: "StorageClass", getter: (item) => stringAt(item.spec?.storageClassName) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "horizontalpodautoscalers",
    label: "HPAs",
    kubectlName: "horizontalpodautoscalers",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      {
        key: "reference",
        label: "Referencia",
        getter: (item) => {
          const ref = (item.spec as { scaleTargetRef?: { kind?: string; name?: string } })?.scaleTargetRef;
          return ref?.name ? `${ref.kind}/${ref.name}` : "-";
        }
      },
      { key: "min", label: "Min", getter: (item) => stringAt(item.spec?.minReplicas) },
      { key: "max", label: "Max", getter: (item) => stringAt(item.spec?.maxReplicas) },
      { key: "replicas", label: "Réplicas", getter: (item) => stringAt(item.status?.currentReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "namespaces",
    label: "Namespaces",
    kubectlName: "namespaces",
    namespaced: false,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
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

// Agrupacion de la barra lateral por categoria para no tener una lista plana larga.
const RESOURCE_CATEGORIES: Array<{ label: string; keys: ResourceKey[] }> = [
  { label: "Workloads", keys: ["pods", "deployments", "statefulsets", "daemonsets", "replicasets", "cronjobs", "jobs", "horizontalpodautoscalers"] },
  { label: "Red", keys: ["services", "ingress"] },
  { label: "Configuración", keys: ["configmaps", "secrets"] },
  { label: "Almacenamiento", keys: ["persistentvolumeclaims"] },
  { label: "Cluster", keys: ["namespaces", "nodes"] }
];

type LogsMode = "live" | "query";
type TabRunState = "idle" | "running" | "done" | "stopped" | "error";
type StreamView = "logs" | "terminal";

type StreamOwner = {
  tabId: string;
  view: StreamView;
  live: boolean;
  pinned: boolean;
  autoStopOnLeave: boolean;
};

type LogsMeta = {
  cap: number;
  truncated: boolean;
  error: string;
  command: string;
  target: string;
};

type LogLevelFilter = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "OTHER";

// Modo Live (-f): el log crece para siempre, asi que mantenemos un ring buffer.
const MAX_LIVE_LINES = 5000;
// Modo Consulta (historico): cargamos toda la ventana, con un tope de seguridad.
const MAX_QUERY_LINES = 50000;
// Ancho maximo del rango (Inicio -> Fin) permitido en la consulta historica.
const MAX_RANGE_DAYS = 3;
// Intervalo de agrupacion: en lugar de re-renderizar en cada chunk recibido,
// acumulamos y volcamos rapido para que los logs empiecen a verse antes.
const LOG_FLUSH_MS = 60;
// Virtualizacion: alto fijo de cada fila (px) y filas extra fuera de viewport.
const LOG_ROW_H = 24;
const LOG_OVERSCAN = 12;
const ALL_LOG_CONTAINERS = "__all__";
const MAX_TABS = 12;

// Timestamp que antepone `kubectl logs --timestamps` (RFC3339).
const K8S_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+/;

// Epoch (ms) del timestamp inicial de la linea, o null si no lo trae.
function lineEpoch(line: string): number | null {
  const match = K8S_TS_RE.exec(line);
  if (!match) return null;
  const time = Date.parse(match[1]);
  return Number.isNaN(time) ? null : time;
}

// Conserva solo las ultimas `max` lineas del texto recibido.
function capLines(text: string, max: number): { text: string; truncated: boolean } {
  let newlines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) newlines++;
  }
  if (newlines <= max) return { text, truncated: false };
  const lines = text.split("\n");
  return { text: lines.slice(lines.length - max).join("\n"), truncated: true };
}

// Valor para <input type="datetime-local"> a partir de una fecha (hora local).
function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Construye los argumentos de kubectl segun el modo y el rango elegido.
// Devuelve tambien el epoch de corte final (kubectl no soporta "--until").
function buildLogsArgs(
  name: string,
  opts: { mode: LogsMode; since: string; start: string; end: string; container?: string; allContainers?: boolean; previous?: boolean }
): { args: string[]; startEpoch: number | null; endEpoch: number | null; follow: boolean } {
  const args = ["logs", "--timestamps"];
  if (opts.previous) args.push("--previous");
  if (opts.allContainers) args.push("--all-containers=true");
  else if (opts.container) args.push("-c", opts.container);
  if (opts.mode === "live") {
    if (opts.since) {
      // Preset (1m, 5m, ...): seguimiento continuo en vivo.
      args.push("-f", `--since=${opts.since}`, name);
      return { args, startEpoch: null, endEpoch: null, follow: true };
    }
    // "Todo": volcado completo del log retenido, SIN -f, para fijarlo y poder buscar.
    args.push(name);
    return { args, startEpoch: null, endEpoch: null, follow: false };
  }

  // Consulta historica (sin -f). El limite de dias aplica al ANCHO del rango
  // (Inicio -> Fin), no a que tan atras puede estar el Inicio; eso lo valida
  // runLogsQuery antes de llamar aqui.
  let startEpoch: number | null = null;
  if (opts.start) {
    const startMs = new Date(opts.start).getTime();
    if (!Number.isNaN(startMs)) {
      startEpoch = startMs;
      args.push(`--since-time=${new Date(startMs).toISOString()}`);
    }
  } else if (opts.since) {
    args.push(`--since=${opts.since}`);
  }
  args.push(`--tail=${MAX_QUERY_LINES}`, name);
  const endMs = opts.end ? new Date(opts.end).getTime() : NaN;
  return { args, startEpoch, endEpoch: Number.isNaN(endMs) ? null : endMs, follow: false };
}

// Reconstruye el comando kubectl tal como lo muestra el proceso principal
// (mismo formato que electron/main.ts), para poder mostrarlo de inmediato en la
// barra de sesion sin esperar a que termine el stream (ej. `logs -f`).
function formatKubectlCommand(args: string[], context?: string, namespace?: string): string {
  const hasFlag = (flag: string) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  const full: string[] = [];
  if (context && !hasFlag("--context")) full.push("--context", context);
  if (namespace && !hasFlag("-n") && !hasFlag("--namespace")) full.push("-n", namespace);
  full.push(...args);
  return ["kubectl", ...full]
    .map((value) => (/^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value)))
    .join(" ");
}

function podContainerNames(item?: KubeItem): string[] {
  const spec = item?.spec as
    | {
        containers?: Array<{ name?: string }>;
        initContainers?: Array<{ name?: string }>;
        ephemeralContainers?: Array<{ name?: string }>;
      }
    | undefined;
  const names = [
    ...(spec?.containers ?? []),
    ...(spec?.initContainers ?? []),
    ...(spec?.ephemeralContainers ?? [])
  ]
    .map((container) => container.name)
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
}

function defaultLogContainer(item?: KubeItem): string {
  const names = podContainerNames(item);
  const annotated = item?.metadata?.annotations?.["kubectl.kubernetes.io/default-container"];
  if (annotated && names.includes(annotated)) return annotated;
  const sidecars = new Set(["istio-proxy", "linkerd-proxy", "vault-agent", "envoy", "cloud-sql-proxy", "oauth2-proxy"]);
  return names.find((name) => !sidecars.has(name)) ?? names[0] ?? "";
}

function resolveLogContainer(item: KubeItem | undefined, requested: string) {
  const names = podContainerNames(item);
  if (names.length <= 1) return "";
  if (requested === ALL_LOG_CONTAINERS) return ALL_LOG_CONTAINERS;
  if (requested && names.includes(requested)) return requested;
  return defaultLogContainer(item);
}

function unknownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function kubectlOutput(result: KubectlResult, fallback: string) {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

function kubectlSuccessText(result: KubectlResult, fallback = "Comando ejecutado correctamente sin salida.") {
  const body = result.stdout.trim() || result.stderr.trim();
  if (body) return body;
  const code = result.code === null ? "" : `\n\nExit code: ${result.code}`;
  return `${fallback}${code}`;
}

function kubectlErrorText(result: KubectlResult, fallback: string) {
  const body = kubectlOutput(result, fallback);
  const code = result.code === null ? "" : `\n\nExit code: ${result.code}`;
  return `${body}${code}`;
}

function isUnsupportedInteractiveCommand(command: string) {
  const normalized = command.toLowerCase();
  const hasInteractiveFlag = /(^|\s)-i?t(\s|$)|(^|\s)-t(\s|$)|(^|\s)--tty(\s|$)|(^|\s)--stdin(\s|$)/.test(normalized);
  return (/\b(exec|attach)\b/.test(normalized) && hasInteractiveFlag) || /\bport-forward\b/.test(normalized);
}

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
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [fallbackViewMode, setFallbackViewMode] = useState<ViewMode>("table");
  const [globalMessage, setGlobalMessage] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [namespaceDraft, setNamespaceDraft] = useState("");
  const [streamOwner, setStreamOwner] = useState<StreamOwner | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [logsSince, setLogsSince] = useState("5m");
  const [logsMode, setLogsMode] = useState<LogsMode>("live");
  const [logsStart, setLogsStart] = useState("");
  const [logsEnd, setLogsEnd] = useState("");
  const [logsNotice, setLogsNotice] = useState("");
  const [logsContainer, setLogsContainer] = useState("");
  const [logsPrevious, setLogsPrevious] = useState(false);
  const [logsMeta, setLogsMeta] = useState<LogsMeta>({
    cap: MAX_LIVE_LINES,
    truncated: false,
    error: "",
    command: "",
    target: ""
  });
  // Vista ampliada de logs: oculta tabstrip, sidebar, barra de sesion y statusbar.
  const [logsExpanded, setLogsExpanded] = useState(false);
  // Vista a la que regresar al cerrar la configuracion (kubeconfig).
  const [settingsReturn, setSettingsReturn] = useState<ViewMode>("table");
  const [detailDialog, setDetailDialog] = useState<DetailDialog | null>(null);
  // Dialogos in-app (reemplazan a window.confirm/prompt, que bloquean el
  // renderer de Electron y dejan la ventana "congelada").
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; resolve: (value: boolean) => void } | null>(null);
  const [inputDialog, setInputDialog] = useState<{ message: string; value: string; resolve: (value: string | null) => void } | null>(null);

  const requestConfirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmDialog({ message, resolve })),
    []
  );
  const requestInput = useCallback(
    (message: string, initial: string) => new Promise<string | null>((resolve) => setInputDialog({ message, value: initial, resolve })),
    []
  );
  const stopStreamRef = useRef<(() => void) | null>(null);
  // Token incremental por pestaña/destino para descartar cargas obsoletas sin
  // invalidar las consultas de otras pestañas.
  const loadTokenRef = useRef<Record<string, number>>({});
  // Token incremental por pestaña para acciones puntuales
  // (describe / yaml / editar / delete...). Permite que una pestaña termine
  // en segundo plano sin que otra pestaña invalide su resultado.
  const actionTokenRef = useRef<Record<string, number>>({});
  // Buffer y temporizador para agrupar los chunks de logs antes de pintarlos.
  const logBufferRef = useRef<string>("");
  const logFlushTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const streamOwnerRef = useRef<StreamOwner | null>(null);

  const setCurrentStreamOwner = useCallback((owner: StreamOwner | null) => {
    streamOwnerRef.current = owner;
    setStreamOwner(owner);
  }, []);

  const nextActionToken = useCallback((tabId: string) => {
    const next = (actionTokenRef.current[tabId] ?? 0) + 1;
    actionTokenRef.current[tabId] = next;
    return next;
  }, []);

  const cancelTabAction = useCallback((tabId: string) => {
    actionTokenRef.current[tabId] = (actionTokenRef.current[tabId] ?? 0) + 1;
  }, []);

  const isTabActionCurrent = useCallback((tabId: string, token: number) => actionTokenRef.current[tabId] === token, []);

  const loadTokenKey = useCallback((tab: TabSession, config: ResourceConfig) => {
    const namespacePart = config.namespaced ? tab.namespace : "";
    return `${tab.id}:${tab.resource}:${tab.context}:${namespacePart}`;
  }, []);

  const nextLoadToken = useCallback((tab: TabSession, config: ResourceConfig) => {
    const key = loadTokenKey(tab, config);
    const next = (loadTokenRef.current[key] ?? 0) + 1;
    loadTokenRef.current[key] = next;
    return { key, token: next };
  }, [loadTokenKey]);

  const isLoadCurrent = useCallback((key: string, token: number) => loadTokenRef.current[key] === token, []);

  const stopStream = useCallback((opts?: { tabId?: string; state?: TabRunState; label?: string }) => {
    const owner = streamOwnerRef.current;
    if (opts?.tabId && owner && owner.tabId !== opts.tabId) return false;
    if (logFlushTimerRef.current != null) {
      window.clearTimeout(logFlushTimerRef.current);
      logFlushTimerRef.current = null;
    }
    logBufferRef.current = "";
    // Solo habia un stream real si teniamos una funcion de corte registrada.
    const hadStream = Boolean(stopStreamRef.current);
    if (stopStreamRef.current) {
      stopStreamRef.current();
      stopStreamRef.current = null;
    }
    setCurrentStreamOwner(null);
    // Al cortar el stream manualmente, onEnd no se dispara (el listener se
    // remueve antes de detenerlo), asi que liberamos el "loading" de la pestana
    // que estaba transmitiendo. Si por una carrera quedo el owner pero no el
    // callback de corte, tambien limpiamos ese estado residual.
    const targetTabId = owner?.tabId ?? opts?.tabId;
    if ((hadStream || owner) && targetTabId) {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === targetTabId && tab.loading
            ? { ...tab, loading: false, runState: opts?.state ?? "stopped", runLabel: opts?.label ?? "Detenido" }
            : tab
        )
      );
    }
    return hadStream || Boolean(owner);
  }, [setCurrentStreamOwner]);

  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  const viewMode: ViewMode = activeTab?.viewMode ?? fallbackViewMode;
  const activeStreamOwner = streamOwner?.tabId === activeTabId ? streamOwner : null;
  const streaming = Boolean(activeStreamOwner);
  const kubeconfigPaths = useMemo(() => settings?.kubeconfigPaths ?? [], [settings]);
  const selectedName = activeTab?.selectedName ?? "";
  const selectedConfig = activeTab ? configByKey[activeTab.resource] : resourceConfigs[0];
  const selectedPod = activeTab?.resource === "pods" ? activeTab.rows.find((item) => nameOf(item) === activeTab.selectedName) : undefined;
  const logContainerNames = useMemo(() => podContainerNames(selectedPod), [selectedPod]);
  const logDefaultContainer = useMemo(() => defaultLogContainer(selectedPod), [selectedPod]);

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

  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current != null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimerRef.current = null;
    }, 2200);
  }, []);

  const copyToClipboard = useCallback(async (text: string, label = "Texto") => {
    if (!text.trim()) return;
    try {
      await window.kubeui.writeClipboard(text);
      showToast(`${label} copiado al portapapeles.`);
    } catch (error) {
      setGlobalMessage(`No se pudo copiar: ${unknownMessage(error)}`);
    }
  }, [showToast]);

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

  const loadResources = useCallback(
    async (tab: TabSession, options?: { silent?: boolean }) => {
      if (!tab.context) return;
      const silent = Boolean(options?.silent);
      const config = configByKey[tab.resource];
      // Token de carga por pestaña/destino: si se dispara otra consulta del
      // mismo destino mientras esta sigue en vuelo, descartamos el resultado
      // tardio sin afectar las cargas de otras pestañas.
      const { key: loadKey, token } = nextLoadToken(tab, config);
      // Firma del destino: el resultado solo se aplica si la pestana sigue en
      // el mismo recurso/contexto/namespace. Esto cubre el caso en que el
      // usuario vuelve a un kind que ya tenia datos en cache (no se dispara una
      // nueva carga, asi que el token no cambia) mientras la consulta anterior
      // todavia estaba en vuelo.
      const targetResource = tab.resource;
      const targetContext = tab.context;
      const targetNamespace = config.namespaced ? tab.namespace : undefined;
      const stillTarget = (candidate: TabSession) =>
        candidate.resource === targetResource &&
        candidate.context === targetContext &&
        (!config.namespaced || candidate.namespace === targetNamespace);
      const applyIfCurrent = (patch: Partial<TabSession>) =>
        setTabs((current) =>
          current.map((item) => (item.id === tab.id && stillTarget(item) ? { ...item, ...patch } : item))
        );
      if (!silent) {
        updateTab(tab.id, { loading: true, runState: "running", runLabel: `Cargando ${config.label}`, output: "", outputTitle: "", rows: [], selectedName: "", selectedNames: [] });
      }
      let result: KubectlResult;
      try {
        result = await window.kubeui.runKubectl({
          args: ["get", config.kubectlName, "-o", "json"],
          kubeconfigPaths,
          context: tab.context,
          namespace: config.namespaced ? tab.namespace : undefined
        });
      } catch (error) {
        if (!isLoadCurrent(loadKey, token)) return;
        if (silent) {
          setGlobalMessage(`No se pudo refrescar ${config.label}: ${unknownMessage(error)}`);
          return;
        }
        applyIfCurrent({
          loading: false,
          runState: "error",
          runLabel: `Error: ${config.label}`,
          outputTitle: "Error",
          output: unknownMessage(error),
          lastCommand: formatKubectlCommand(["get", config.kubectlName, "-o", "json"], tab.context, config.namespaced ? tab.namespace : undefined),
          rows: []
        });
        return;
      }
      if (!isLoadCurrent(loadKey, token)) return;
      if (!result.ok) {
        if (silent) {
          setGlobalMessage(`No se pudo refrescar ${config.label}: ${kubectlOutput(result, "Error desconocido.")}`);
          return;
        }
        applyIfCurrent({ loading: false, runState: "error", runLabel: `Error: ${config.label}`, outputTitle: "Error", output: kubectlErrorText(result, "No se pudieron cargar los recursos."), lastCommand: result.command, rows: [] });
        return;
      }
      let items: KubeItem[] = [];
      try {
        items = (JSON.parse(result.stdout) as { items?: KubeItem[] }).items ?? [];
      } catch (error) {
        if (silent) {
          setGlobalMessage(`No se pudo refrescar ${config.label}: kubectl devolvio una respuesta JSON invalida.`);
          return;
        }
        applyIfCurrent({
          loading: false,
          runState: "error",
          runLabel: `Error: ${config.label}`,
          outputTitle: "Error",
          output: `kubectl devolvio una respuesta JSON invalida.\n\n${unknownMessage(error)}`,
          lastCommand: result.command,
          rows: []
        });
        return;
      }
      if (silent) {
        const names = new Set(items.map(nameOf).filter(Boolean));
        applyIfCurrent({
          rows: items,
          selectedName: names.has(tab.selectedName) ? tab.selectedName : "",
          selectedNames: tab.selectedNames.filter((name) => names.has(name))
        });
        return;
      }
      applyIfCurrent({ rows: items, selectedName: "", selectedNames: [], loading: false, runState: "done", runLabel: `${config.label} cargados`, lastCommand: result.command });
    },
    [isLoadCurrent, kubeconfigPaths, nextLoadToken]
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

  useEffect(() => {
    setLogsContainer("");
    setLogsPrevious(false);
    setLogsNotice("");
    setLogsMeta({
      cap: MAX_LIVE_LINES,
      truncated: false,
      error: "",
      command: "",
      target: ""
    });
  }, [activeTab?.id, activeTab?.selectedName]);

  // Detener cualquier streaming activo al cerrar la app.
  useEffect(
    () => () => {
      stopStream();
    },
    [stopStream]
  );

  useEffect(() => () => {
    if (toastTimerRef.current != null) window.clearTimeout(toastTimerRef.current);
  }, []);

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

  const updateActiveTab = (patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  };

  const setViewMode = (mode: ViewMode) => {
    if (activeTab) updateActiveTab({ viewMode: mode });
    else setFallbackViewMode(mode);
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

  const updateTab = (tabId: string, patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
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

  // Carga de logs. Modo "live" usa -f (stream continuo, ring buffer);
  // modo "query" trae una ventana historica acotada y la corta en el cliente.
  const runLogs = (
    override?: Partial<{ mode: LogsMode; since: string; start: string; end: string; container: string; previous: boolean }>
  ) => {
    if (!activeTab || !activeTab.selectedName) return;
    stopStream({ state: "stopped", label: "Reemplazado" });
    const mode = override?.mode ?? logsMode;
    const since = override?.since ?? logsSince;
    const start = override?.start ?? logsStart;
    const end = override?.end ?? logsEnd;
    const selectedPodForRun = activeTab.resource === "pods" ? activeTab.rows.find((item) => nameOf(item) === activeTab.selectedName) : undefined;
    const containerNames = podContainerNames(selectedPodForRun);
    const effectiveContainer = resolveLogContainer(selectedPodForRun, override?.container ?? logsContainer);
    const previous = override?.previous ?? logsPrevious;
    const allContainers = effectiveContainer === ALL_LOG_CONTAINERS;
    const container = allContainers ? "" : effectiveContainer;
    const tabId = activeTab.id;
    const name = activeTab.selectedName;
    const { args, startEpoch, endEpoch, follow } = buildLogsArgs(name, {
      mode,
      since,
      start,
      end,
      container,
      allContainers,
      previous
    });
    // Solo el seguimiento en vivo (preset) usa el ring buffer corto; los
    // volcados completos (Todo / historico) conservan mas para poder buscar.
    const cap = follow ? MAX_LIVE_LINES : MAX_QUERY_LINES;
    const inverted = startEpoch != null && endEpoch != null && endEpoch < startEpoch;
    const command = formatKubectlCommand(args, activeTab.context, activeTab.namespace);
    const target =
      containerNames.length > 1
        ? allContainers
          ? "Todos los contenedores"
          : `Contenedor ${container || defaultLogContainer(selectedPodForRun)}`
        : "";

    if (containerNames.length > 1 && effectiveContainer !== logsContainer) {
      setLogsContainer(effectiveContainer);
    }
    setLogsNotice("");
    setLogsMeta({
      cap,
      truncated: false,
      error: "",
      command,
      target
    });
    updateActiveTab({
      loading: true,
      runState: "running",
      runLabel: follow ? "Logs en vivo" : "Consultando logs",
      outputTitle: `Logs ${name}`,
      output: "",
      lastCommand: command
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
    // Acumulador local del texto recibido en esta carga (para calcular el
    // resultado final sin depender del estado asincrono de setTabs).
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
          // Acumulamos en un buffer y volcamos como mucho cada LOG_FLUSH_MS,
          // en vez de re-renderizar en cada chunk recibido.
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
          // kubectl no tiene "--until": recortamos el fin del rango aqui.
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
              setLogsNotice(
                "Sin registros en el rango. kubectl solo ve lo que el nodo aun retiene (los logs rotan)."
              );
            }
          }
          if (streamOwnerRef.current?.tabId === tabId) setCurrentStreamOwner(null);
          stopStreamRef.current = null;
        }
      }
    );
  };

  // Cambia el preset --since y recarga con el modo actual.
  const changeLogsSince = (value: string) => {
    setLogsSince(value);
    if (activeTab?.selectedName) runLogs({ since: value });
  };

  const changeLogsContainer = (value: string) => {
    setLogsContainer(value);
    if (activeTab?.selectedName && viewMode === "logs") runLogs({ container: value });
  };

  const changeLogsPrevious = (value: boolean) => {
    setLogsPrevious(value);
    if (activeTab?.selectedName && viewMode === "logs") runLogs({ previous: value });
  };

  const changeLogsPinned = (value: boolean) => {
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
  };

  // Cambia entre modo Live e historico. Live recarga al instante; el historico
  // prepara un rango por defecto y espera a que el usuario pulse "Consultar".
  const changeLogsMode = (mode: LogsMode) => {
    setLogsMode(mode);
    if (mode === "live") {
      if (activeTab?.selectedName) runLogs({ mode: "live" });
      return;
    }
    // Al pasar a Historico cargamos de inmediato el rango por defecto
    // (ultimos 30 min) en vez de mantener los logs del modo En vivo.
    const start = logsStart || toLocalInputValue(new Date(Date.now() - 1_800_000));
    const end = logsEnd || toLocalInputValue(new Date());
    setLogsStart(start);
    setLogsEnd(end);
    if (activeTab?.selectedName) runLogs({ mode: "query", start, end });
  };

  // Ejecuta la consulta historica con el rango personalizado actual.
  const runLogsQuery = () => {
    setLogsMode("query");
    // El limite aplica al ANCHO del rango (Inicio -> Fin), no a la antiguedad.
    if (logsStart && logsEnd) {
      const startMs = new Date(logsStart).getTime();
      const endMs = new Date(logsEnd).getTime();
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
          <button
            className="tabstrip-add"
            title={!contexts.length ? "Agrega un kubeconfig con contextos" : tabs.length >= MAX_TABS ? `Límite de ${MAX_TABS} pestañas` : "Nueva pestaña"}
            onClick={addTab}
            disabled={!contexts.length || tabs.length >= MAX_TABS}
          >
            <Plus size={16} />
          </button>
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
              command={activeTab.lastCommand}
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
              following={logsMode === "live" && !!logsSince}
              mode={logsMode}
              onModeChange={changeLogsMode}
              since={logsSince}
              onSinceChange={changeLogsSince}
              start={logsStart}
              end={logsEnd}
              onStartChange={setLogsStart}
              onEndChange={setLogsEnd}
              onQuery={runLogsQuery}
              notice={logsNotice}
              meta={logsMeta}
              containerNames={logContainerNames}
              selectedContainer={logsContainer || logDefaultContainer}
              defaultContainer={logDefaultContainer}
              previous={logsPrevious}
              pinned={activeTab.streamPinned}
              onContainerChange={changeLogsContainer}
              onPreviousChange={changeLogsPrevious}
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

function EmptyWorkspace({
  settingsReady,
  kubeconfigCount,
  onAdd,
  onSettings
}: {
  settingsReady: boolean;
  kubeconfigCount: number;
  onAdd: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="empty-workspace">
      <div>
        <Boxes size={28} />
        <h1>{settingsReady ? "No hay contextos cargados" : "Cargando configuracion"}</h1>
        <p>
          {kubeconfigCount
            ? "No se encontraron contextos disponibles en los kubeconfig registrados."
            : "Agrega un kubeconfig para empezar a explorar tus recursos Kubernetes."}
        </p>
        <div className="button-row">
          <button className="toolbar-button primary" onClick={onAdd}>
            <FolderPlus size={16} />
            Agregar kubeconfig
          </button>
          <button className="toolbar-button" onClick={onSettings}>
            <Settings size={16} />
            Configuracion
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsView({
  settings,
  infos,
  loading,
  onAdd,
  onRemove,
  onRefresh,
  onValidate,
  onReveal,
  onBack
}: {
  settings: AppSettings;
  infos: KubeconfigInspection[];
  loading: boolean;
  onAdd: () => void;
  onRemove: (path: string) => void;
  onValidate: () => void;
  onReveal: (path: string) => void;
  onRefresh: () => void;
  onBack?: () => void;
}) {
  const infoByPath = useMemo(() => new Map(infos.map((info) => [info.path, info])), [infos]);
  return (
    <div className="settings-view">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && (
            <button className="icon-button" title="Regresar" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <h1>Kubeconfig</h1>
            <p>{settings.kubeconfigPaths.length ? "Archivos registrados" : "Sin archivos registrados"}</p>
          </div>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onAdd}>
            <FolderPlus size={16} />
            Agregar
          </button>
          <button className="toolbar-button" onClick={onValidate} disabled={loading}>
            <Shield size={16} />
            Validar
          </button>
          <button className="toolbar-button" onClick={onRefresh}>
            <RefreshCw size={16} />
            Recargar contextos
          </button>
        </div>
      </div>
      <div className="file-list">
        {!settings.kubeconfigPaths.length && (
          <div className="file-row muted">
            <span>Agrega un archivo kubeconfig para cargar tus contextos.</span>
          </div>
        )}
        {settings.kubeconfigPaths.map((kubeconfigPath) => {
          const info = infoByPath.get(kubeconfigPath);
          return (
            <div className="file-row file-row-rich" key={kubeconfigPath}>
              <Shield size={17} />
              <div className="file-row-main">
                <code>{kubeconfigPath}</code>
                <div className="file-meta">
                  {loading && !info ? (
                    <span className="resource-badge neutral">Validando</span>
                  ) : info ? (
                    <>
                      <span className={`resource-badge ${info.ok ? "ok" : "bad"}`}>{info.ok ? "OK" : "Error"}</span>
                      <span>{info.exists ? `${info.contexts.length} contextos` : "Archivo no disponible"}</span>
                      {info.error && <span className="file-error">{info.error}</span>}
                    </>
                  ) : (
                    <span className="resource-badge neutral">Sin validar</span>
                  )}
                </div>
                {info?.contexts.length ? (
                  <div className="context-chip-list">
                    {info.contexts.slice(0, 5).map((context) => (
                      <span key={context}>{context}</span>
                    ))}
                    {info.contexts.length > 5 && <span>+{info.contexts.length - 5}</span>}
                  </div>
                ) : null}
              </div>
              <button className="icon-button" title="Abrir ubicacion" onClick={() => onReveal(kubeconfigPath)}>
                <FolderOpen size={16} />
              </button>
              <button className="icon-button danger" title="Quitar" onClick={() => onRemove(kubeconfigPath)}>
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResourceTable({
  tab,
  config,
  onRefresh,
  onSelect,
  onTogglePodSelection,
  onSetPodSelection,
  onDescribe,
  onYaml,
  onLogs,
  onEdit,
  onDelete,
  onRestart,
  onScale,
  onTrigger,
  onSuspend
}: {
  tab: TabSession;
  config: ResourceConfig;
  onRefresh: () => void;
  onSelect: (name: string) => void;
  onTogglePodSelection: (name: string) => void;
  onSetPodSelection: (names: string[], checked: boolean) => void;
  onDescribe: () => void;
  onYaml: () => void;
  onLogs: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onScale: () => void;
  onTrigger: () => void;
  onSuspend: () => void;
}) {
  const selected = Boolean(tab.selectedName);
  const busy = tab.loading;
  const isPodTable = config.key === "pods";
  const selectedPodSet = useMemo(() => new Set(isPodTable ? tab.selectedNames : []), [isPodTable, tab.selectedNames]);
  const multiPodSelection = isPodTable && selectedPodSet.size > 1;
  const restartEnabled = isPodTable ? selected || selectedPodSet.size > 0 : selected;
  const singleActionEnabled = selected && !multiPodSelection;
  const selectedRow = tab.rows.find((item) => nameOf(item) === tab.selectedName);
  const cronSuspended = Boolean((selectedRow?.spec as { suspend?: boolean })?.suspend);
  const loadError = tab.outputTitle.startsWith("Error") && tab.output.trim();
  const [filter, setFilter] = useState("");
  const selectAllRef = useRef<HTMLInputElement>(null);
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
  const filteredPodNames = useMemo(() => (isPodTable ? filteredRows.map(nameOf).filter(Boolean) : []), [filteredRows, isPodTable]);
  const visibleSelectedCount = filteredPodNames.filter((name) => selectedPodSet.has(name)).length;
  const allVisiblePodsSelected = filteredPodNames.length > 0 && visibleSelectedCount === filteredPodNames.length;
  const someVisiblePodsSelected = visibleSelectedCount > 0 && !allVisiblePodsSelected;
  const countText = needle ? `${filteredRows.length} de ${tab.rows.length} recursos` : `${tab.rows.length} recursos`;
  const selectionText = isPodTable && selectedPodSet.size > 0 ? ` · ${selectedPodSet.size} seleccionados` : "";

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisiblePodsSelected;
  }, [someVisiblePodsSelected]);

  return (
    <div className="table-panel">
      <div className="panel-title">
        <div>
          <h1>{config.label}</h1>
          <p>{countText}{selectionText}</p>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={16} />
            Refrescar
          </button>
          <button className="toolbar-button" onClick={onDescribe} disabled={!singleActionEnabled || busy}>
            <ScrollText size={16} />
            Describir
          </button>
          <button className="toolbar-button" onClick={onYaml} disabled={!singleActionEnabled || busy}>
            <FileCode2 size={16} />
            YAML
          </button>
          {config.key === "pods" && (
            <button className="toolbar-button" onClick={onLogs} disabled={!singleActionEnabled || busy}>
              <SquareTerminal size={16} />
              Logs
            </button>
          )}
          {config.key === "cronjobs" && (
            <button className="toolbar-button" onClick={onTrigger} disabled={!singleActionEnabled || busy}>
              <Play size={16} />
              Ejecutar
            </button>
          )}
          {config.key === "cronjobs" && (
            <button className="toolbar-button" onClick={onSuspend} disabled={!singleActionEnabled || busy}>
              <Pause size={16} />
              {cronSuspended ? "Reanudar" : "Suspender"}
            </button>
          )}
          {(config.key === "pods" || config.key === "deployments" || config.key === "statefulsets" || config.key === "daemonsets") && (
            <button className="toolbar-button" onClick={onRestart} disabled={!restartEnabled || busy}>
              <RotateCcw size={16} />
              {isPodTable && selectedPodSet.size > 1 ? `Reiniciar (${selectedPodSet.size})` : "Reiniciar"}
            </button>
          )}
          {(config.key === "deployments" || config.key === "statefulsets" || config.key === "replicasets") && (
            <button className="toolbar-button" onClick={onScale} disabled={!singleActionEnabled || busy}>
              <Scale3D size={16} />
              Escalar
            </button>
          )}
          {config.editable !== false && (
            <button className="toolbar-button" onClick={onEdit} disabled={!singleActionEnabled || busy}>
              <Pencil size={16} />
              Editar
            </button>
          )}
          <button className="toolbar-button danger" onClick={onDelete} disabled={!singleActionEnabled || busy}>
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
      <div className={`resource-table-body ${selectedRow && !multiPodSelection ? "with-inspector" : ""}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isPodTable && (
                  <th className="selection-cell">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisiblePodsSelected}
                      disabled={busy || !filteredPodNames.length}
                      title="Seleccionar pods visibles"
                      onChange={(event) => onSetPodSelection(filteredPodNames, event.target.checked)}
                    />
                  </th>
                )}
                {config.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const name = nameOf(item);
                const checked = selectedPodSet.has(name);
                return (
                  <tr
                    key={name}
                    className={`${tab.selectedName === name ? "selected" : ""}${checked ? " checked" : ""}`}
                    onClick={() => onSelect(name)}
                  >
                    {isPodTable && (
                      <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          title={`Seleccionar ${name}`}
                          onChange={() => onTogglePodSelection(name)}
                        />
                      </td>
                    )}
                    {config.columns.map((column) => (
                      <td key={column.key}>{renderTableCell(column.key, column.getter(item))}</td>
                    ))}
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={config.columns.length + (isPodTable ? 1 : 0)} className="empty-state">
                    {loadError ? (
                      <div className="table-error">
                        <AlertTriangle size={22} />
                        <strong>No se pudieron cargar {config.label}</strong>
                        <pre>{tab.output}</pre>
                        {tab.lastCommand && <code>{tab.lastCommand}</code>}
                        <button className="toolbar-button" onClick={onRefresh}>
                          <RefreshCw size={16} />
                          Reintentar
                        </button>
                      </div>
                    ) : (
                      <div className="empty-state-box">
                        <span>{tab.loading ? "Cargando..." : needle ? "Sin coincidencias" : `No hay ${config.label} para mostrar.`}</span>
                        {!tab.loading && (
                          <button className="toolbar-button" onClick={onRefresh}>
                            <RefreshCw size={16} />
                            Reintentar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {selectedRow && !multiPodSelection && (
          <ResourceInspector
            item={selectedRow}
            config={config}
            onDescribe={onDescribe}
            onYaml={onYaml}
            onLogs={onLogs}
          />
        )}
      </div>
    </div>
  );
}

function ResourceInspector({
  item,
  config,
  onDescribe,
  onYaml,
  onLogs
}: {
  item: KubeItem;
  config: ResourceConfig;
  onDescribe: () => void;
  onYaml: () => void;
  onLogs: () => void;
}) {
  const labels = Object.entries(item.metadata?.labels ?? {});
  const statusColumn = config.columns.find((column) => column.key === "status");
  const status = statusColumn?.getter(item);
  return (
    <aside className="resource-inspector">
      <div>
        <span className="inspector-eyebrow">{config.label}</span>
        <h2>{nameOf(item)}</h2>
      </div>
      <dl>
        {item.metadata?.namespace && (
          <>
            <dt>Namespace</dt>
            <dd>{item.metadata.namespace}</dd>
          </>
        )}
        {status && (
          <>
            <dt>Estado</dt>
            <dd>{renderTableCell("status", status)}</dd>
          </>
        )}
        <dt>Edad</dt>
        <dd>{age(item.metadata?.creationTimestamp)}</dd>
        <dt>Labels</dt>
        <dd>{labels.length}</dd>
      </dl>
      {labels.length > 0 && (
        <div className="label-chip-list">
          {labels.slice(0, 8).map(([key, value]) => (
            <span key={key}>{key}={value}</span>
          ))}
          {labels.length > 8 && <span>+{labels.length - 8}</span>}
        </div>
      )}
      <div className="inspector-actions">
        <button className="toolbar-button" onClick={onDescribe}>
          <ScrollText size={16} />
          Describir
        </button>
        <button className="toolbar-button" onClick={onYaml}>
          <FileCode2 size={16} />
          YAML
        </button>
        {config.key === "pods" && (
          <button className="toolbar-button" onClick={onLogs}>
            <SquareTerminal size={16} />
            Logs
          </button>
        )}
      </div>
    </aside>
  );
}

function renderTableCell(columnKey: string, value: string) {
  if (columnKey === "status" || columnKey === "suspend") {
    return <span className={`resource-badge ${resourceBadgeClass(value)}`}>{value}</span>;
  }
  return value;
}

function resourceBadgeClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "running" || normalized === "bound" || normalized === "active" || normalized === "no") return "ok";
  if (normalized === "pending" || normalized === "unknown" || normalized === "si" || normalized === "sí") return "warn";
  if (normalized === "failed" || normalized === "error" || normalized === "terminating") return "bad";
  if (normalized === "succeeded" || normalized === "completed") return "done";
  return "neutral";
}

function OutputPanel({
  title,
  output,
  command,
  streaming,
  loading,
  onStop,
  onInterrupt,
  onCopy,
  onBack
}: {
  title: string;
  output: string;
  command?: string;
  streaming?: boolean;
  loading?: boolean;
  onStop?: () => void;
  onInterrupt?: () => void;
  onCopy?: (text: string, label?: string) => void;
  onBack?: () => void;
}) {
  return (
    <div className="output-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && !loading && (
            <button className="icon-button" title="Volver a la lista" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h1>{title || "Salida"}</h1>
        </div>
        <div className="panel-actions">
          {command && !loading && (
            <button className="toolbar-button" onClick={() => onCopy?.(command, "Comando")}>
              <Copy size={16} />
              Comando
            </button>
          )}
          {output && !loading && (
            <button className="toolbar-button" onClick={() => onCopy?.(output, "Salida")}>
              <Copy size={16} />
              Salida
            </button>
          )}
          {loading && onInterrupt && (
            <button className="toolbar-button danger" onClick={onInterrupt}>
              <Square size={16} />
              Interrumpir
            </button>
          )}
          {!loading && streaming && onStop && (
            <button className="toolbar-button danger" onClick={onStop}>
              <Square size={16} />
              Detener
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="loading-state">
          <RefreshCw size={20} className="spin" />
          <span>Ejecutando comando, esperando resultado...</span>
        </div>
      ) : (
        <pre>{output || (streaming ? "Esperando salida..." : "Sin salida")}</pre>
      )}
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

const LOG_LEVEL_FILTERS: Array<{ value: LogLevelFilter; label: string }> = [
  { value: "ERROR", label: "Error" },
  { value: "WARN", label: "Warn" },
  { value: "INFO", label: "Info" },
  { value: "DEBUG", label: "Debug" },
  { value: "TRACE", label: "Trace" },
  { value: "OTHER", label: "Otros" }
];

function emptyLevelCounts(): Record<LogLevelFilter, number> {
  return {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    DEBUG: 0,
    TRACE: 0,
    OTHER: 0
  };
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
  previous = false,
  pinned = false,
  onContainerChange,
  onPreviousChange,
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
  previous?: boolean;
  pinned?: boolean;
  onContainerChange?: (value: string) => void;
  onPreviousChange?: (value: boolean) => void;
  onPinnedChange?: (value: boolean) => void;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onCopy?: (text: string, label?: string) => void;
  onBack?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}) {
  const [pretty, setPretty] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [detailHeight, setDetailHeight] = useState(180);
  const [detailTab, setDetailTab] = useState<"message" | "json" | "raw" | "fields">("message");
  const [activeLevelFilters, setActiveLevelFilters] = useState<LogLevelFilter[]>([]);
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
    if (!activeLevelSet.size) return lines.map((_, index) => index);
    const result: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (activeLevelSet.has(levelBucket(getParsed(lines[i]).level))) result.push(i);
    }
    return result;
  }, [lines, activeLevelSet, getParsed]);

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
      const entry = getParsed(lines[index]);
      const haystack = `${entry.time ?? ""} ${entry.level ?? ""} ${entry.message} ${entry.source ?? ""}`.toLowerCase();
      if (haystack.includes(needle)) result.push(index);
    }
    return result;
  }, [displayIndexes, lines, term, getParsed]);

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
    if (!el || !pretty) return;
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    setViewportH(el.clientHeight);
    return () => observer.disconnect();
  }, [pretty]);

  // Auto-scroll al final mientras llegan logs (si el usuario esta al fondo).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pretty) return;
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
        setPretty(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setQuery("");
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
    setActiveLevelFilters((current) =>
      current.includes(level) ? current.filter((item) => item !== level) : [...current, level]
    );
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
              setPretty(true);
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
          <button className="toolbar-button" onClick={() => setPretty((value) => !value)}>
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
        <label className="logs-check">
          <input type="checkbox" checked={previous} onChange={(event) => onPreviousChange?.(event.target.checked)} disabled={streaming} />
          Anterior
        </label>
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
              setQuery("");
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
        <pre>{output}</pre>
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

function TerminalPanel({
  command,
  output,
  loading,
  streaming,
  onChange,
  onRun,
  onStop,
  onCopy
}: {
  command: string;
  output: string;
  loading: boolean;
  streaming?: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  onStop?: () => void;
  onCopy?: (text: string, label?: string) => void;
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
          <>
            {output.trim() && (
              <button className="toolbar-button" onClick={() => onCopy?.(output, "Terminal")}>
                <Copy size={16} />
                Copiar
              </button>
            )}
            <button className="toolbar-button" disabled={loading} onClick={onRun}>
              <Play size={16} />
              Ejecutar
            </button>
          </>
        )}
      </div>
      <pre>{output || " "}</pre>
    </div>
  );
}

function ApplyPanel({
  yaml,
  loading,
  editMode,
  onChange,
  onPick,
  onApply,
  onInterrupt,
  onBack
}: {
  yaml: string;
  loading: boolean;
  editMode?: boolean;
  onChange: (value: string) => void;
  onPick: () => void;
  onApply: () => void;
  onInterrupt?: () => void;
  onBack?: () => void;
}) {
  // En modo edicion, mientras se trae el YAML del recurso (loading sin texto aun)
  // mostramos un estado de carga con opcion de interrumpir.
  const fetching = Boolean(loading && editMode && !yaml.trim());
  return (
    <div className="apply-panel">
      <div className="panel-title">
        <div className="panel-title-main">
          {onBack && !fetching && (
            <button className="icon-button" title="Volver a la lista" onClick={onBack}>
              <ArrowLeft size={18} />
            </button>
          )}
          <h1>{editMode ? "Editar recurso" : "Aplicar YAML"}</h1>
        </div>
        <div className="button-row">
          {fetching && onInterrupt ? (
            <button className="toolbar-button danger" onClick={onInterrupt}>
              <Square size={16} />
              Interrumpir
            </button>
          ) : (
            <>
              {!editMode && (
                <button className="toolbar-button" onClick={onPick}>
                  <FolderPlus size={16} />
                  Cargar archivo
                </button>
              )}
              <button className="toolbar-button primary" onClick={onApply} disabled={loading || !yaml.trim()}>
                <Play size={16} />
                {editMode ? "Guardar (replace)" : "Aplicar"}
              </button>
            </>
          )}
        </div>
      </div>
      {fetching ? (
        <div className="loading-state">
          <RefreshCw size={20} className="spin" />
          <span>Obteniendo el recurso, esperando resultado...</span>
        </div>
      ) : (
        <textarea value={yaml} onChange={(event) => onChange(event.target.value)} spellCheck={false} />
      )}
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
    selectedNames: [],
    viewMode: "table",
    outputTitle: "",
    output: "",
    lastCommand: "",
    terminalCommand: "kubectl get pods",
    terminalOutput: "",
    yamlDraft: "",
    yamlEditMode: false,
    loading: false,
    runState: "idle",
    runLabel: "",
    streamPinned: false,
    resourceCache: {}
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
