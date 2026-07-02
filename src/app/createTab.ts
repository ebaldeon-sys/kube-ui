import { createDefaultLogsPrefs } from "./constants";
import type { TabSession } from "./types";

export function createTab(context: string, namespace?: string): TabSession {
  return {
    id: crypto.randomUUID(),
    title: context || "Sin contexto",
    context,
    namespace: namespace || "default",
    resource: "pods",
    rows: [],
    selectedName: "",
    selectedNames: [],
    tableFilters: {},
    logsPrefs: createDefaultLogsPrefs(),
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
