export type ResourceKey =
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

export type ViewMode = "table" | "details" | "yaml" | "logs" | "terminal" | "apply" | "settings";

export type ResourceConfig = {
  key: ResourceKey;
  label: string;
  kubectlName: string;
  namespaced: boolean;
  editable?: boolean;
  columns: Array<{ key: string; label: string; getter: (item: KubeItem) => string }>;
};

export type KubeItem = {
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

export type LogsMode = "live" | "query";
export type TabRunState = "idle" | "running" | "done" | "stopped" | "error";
export type StreamView = "logs" | "terminal";

export type StreamOwner = {
  tabId: string;
  view: StreamView;
  live: boolean;
  pinned: boolean;
  autoStopOnLeave: boolean;
};

export type LogsMeta = {
  cap: number;
  truncated: boolean;
  error: string;
  command: string;
  target: string;
};

export type LogLevelFilter = "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE" | "OTHER";

export type LogsPrefs = {
  mode: LogsMode;
  since: string;
  start: string;
  end: string;
  container: string;
  pretty: boolean;
  query: string;
  activeLevelFilters: LogLevelFilter[];
};

// Estado que se persiste por kind dentro de una pestaña.
export type ResourceSnapshot = {
  rows: KubeItem[];
  selectedName: string;
  selectedNames: string[];
  viewMode: ViewMode;
  outputTitle: string;
  output: string;
  lastCommand: string;
};

export type TabSession = {
  id: string;
  title: string;
  context: string;
  namespace: string;
  resource: ResourceKey;
  rows: KubeItem[];
  selectedName: string;
  selectedNames: string[];
  tableFilters: Partial<Record<ResourceKey, string>>;
  logsPrefs: LogsPrefs;
  viewMode: ViewMode;
  outputTitle: string;
  output: string;
  lastCommand: string;
  terminalCommand: string;
  terminalOutput: string;
  yamlDraft: string;
  yamlEditMode: boolean;
  loading: boolean;
  runState: TabRunState;
  runLabel: string;
  streamPinned: boolean;
  resourceCache: Partial<Record<ResourceKey, ResourceSnapshot>>;
};

export type DetailDialog = {
  title: string;
  message?: string;
  details?: string;
  command?: string;
};
