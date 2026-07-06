import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ResourceConfig, StreamOwner, TabSession, ViewMode } from "../app/types";
import { configByKey } from "../config/resources";
import {
  formatKubectlCommand,
  isUnsupportedInteractiveCommand,
  kubectlErrorText,
  kubectlSuccessText,
  unknownMessage
} from "../kubectl/format";
import { nameOf } from "../resources/helpers";
import type { KubectlResult } from "../types";

type StopStream = (opts?: { tabId?: string; state?: "idle" | "running" | "done" | "stopped" | "error"; label?: string }) => boolean;

type UseResourceActionsOptions = {
  activeTab: TabSession | undefined;
  selectedName: string;
  selectedConfig: ResourceConfig;
  kubeconfigPaths: string[];
  stopStream: StopStream;
  setViewMode: (mode: ViewMode) => void;
  updateActiveTab: (patch: Partial<TabSession>) => void;
  updateTab: (tabId: string, patch: Partial<TabSession>) => void;
  setTabs: Dispatch<SetStateAction<TabSession[]>>;
  requestConfirm: (message: string) => Promise<boolean>;
  requestInput: (message: string, initial: string) => Promise<string | null>;
  loadResources: (tab: TabSession, options?: { silent?: boolean }) => Promise<void>;
  showAppError: (title: string, error: unknown) => void;
  setCurrentStreamOwner: (owner: StreamOwner | null) => void;
  stopStreamRef: MutableRefObject<(() => void) | null>;
  streamOwnerRef: MutableRefObject<StreamOwner | null>;
};

/**
 * Acciones de kubectl sobre el recurso seleccionado (describe, yaml, delete,
 * scale, restart, edit, apply, terminal...). Incluye el token incremental por
 * pestaña que permite que una accion termine en segundo plano sin que otra la
 * invalide. Extraido de App.tsx para adelgazar el componente contenedor.
 */
export function useResourceActions({
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
}: UseResourceActionsOptions) {
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

  const showOutput = async (mode: ViewMode, args: string[], title: string): Promise<KubectlResult | null> => {
    if (!activeTab) return null;
    const tabId = activeTab.id;
    stopStream({ tabId, state: "stopped", label: "Detenido" });
    const token = nextActionToken(tabId);
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
    if (!isTabActionCurrent(tabId, token)) return null;
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

  const interruptAction = () => {
    if (activeTab) {
      cancelTabAction(activeTab.id);
      stopStream({ tabId: activeTab.id, state: "stopped", label: "Detenido" });
    }
    updateActiveTab({ loading: false, runState: "stopped", runLabel: "Interrumpido" });
    setViewMode("table");
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
      confirmMessage =
        targets.length > 1 ? `Reiniciar ${targets.length} pods seleccionados (${preview}${suffix})?` : `Reiniciar ${targets[0]}?`;
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
    const result = await showOutput(
      "details",
      ["scale", selectedConfig.kubectlName, selectedName, `--replicas=${replicas}`],
      `Escalar ${selectedName}`
    );
    if (result?.ok) await loadResources(tab, { silent: true });
  };

  // "Editar": trae el YAML del recurso a un borrador editable; al guardar hace
  // `kubectl replace` (equivalente no interactivo de `kubectl edit`).
  const editResource = async () => {
    if (!activeTab || !selectedName) return;
    const tabId = activeTab.id;
    stopStream({ tabId, state: "stopped", label: "Detenido" });
    const token = nextActionToken(tabId);
    updateActiveTab({
      loading: true,
      runState: "running",
      runLabel: `Editar ${selectedName}`,
      yamlDraft: "",
      yamlEditMode: true,
      outputTitle: `Editar ${selectedName}`
    });
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
        command: formatKubectlCommand(
          ["get", selectedConfig.kubectlName, selectedName, "-o", "yaml"],
          activeTab.context,
          activeTab.namespace
        )
      };
    }
    if (!isTabActionCurrent(tabId, token)) return;
    if (!result.ok) {
      updateTab(tabId, {
        loading: false,
        runState: "error",
        runLabel: "Error: Editar recurso",
        viewMode: "details",
        outputTitle: "Error: Editar recurso",
        output: kubectlErrorText(result, "No se pudo obtener el YAML."),
        lastCommand: result.command
      });
      return;
    }
    updateTab(tabId, {
      loading: false,
      runState: "done",
      runLabel: "YAML cargado",
      yamlDraft: result.stdout,
      yamlEditMode: true,
      lastCommand: result.command
    });
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
    const next = !(row?.spec as { suspend?: boolean })?.suspend;
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
        terminalOutput: `$ ${command}\n\nEste comando requiere una sesion interactiva o de larga duracion que todavia no esta soportada en esta terminal.\nUsa una terminal externa para exec -it, attach -it o port-forward.`,
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
    const confirmMessage = editMode ? "Guardar cambios del recurso con kubectl replace?" : "Aplicar YAML en el contexto seleccionado?";
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

  return {
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
  };
}
