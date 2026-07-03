import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { KubeItem, ResourceConfig, TabSession } from "../app/types";
import { configByKey } from "../config/resources";
import { formatKubectlCommand, kubectlErrorText, kubectlOutput, unknownMessage } from "../kubectl/format";
import { nameOf } from "../resources/helpers";
import type { KubectlResult } from "../types";

type UseResourcesOptions = {
  kubeconfigPaths: string[];
  setGlobalMessage: (message: string) => void;
  setTabs: Dispatch<SetStateAction<TabSession[]>>;
  updateTab: (tabId: string, patch: Partial<TabSession>) => void;
};

export function useResources({ kubeconfigPaths, setGlobalMessage, setTabs, updateTab }: UseResourcesOptions) {
  const loadTokenRef = useRef<Record<string, number>>({});

  const loadTokenKey = useCallback((tab: TabSession, config: ResourceConfig) => {
    const namespacePart = config.namespaced ? tab.namespace : "";
    return `${tab.id}:${tab.resource}:${tab.context}:${namespacePart}`;
  }, []);

  const nextLoadToken = useCallback(
    (tab: TabSession, config: ResourceConfig) => {
      const key = loadTokenKey(tab, config);
      const next = (loadTokenRef.current[key] ?? 0) + 1;
      loadTokenRef.current[key] = next;
      return { key, token: next };
    },
    [loadTokenKey]
  );

  const isLoadCurrent = useCallback((key: string, token: number) => loadTokenRef.current[key] === token, []);

  const loadResources = useCallback(
    async (tab: TabSession, options?: { silent?: boolean }) => {
      if (!tab.context) return;
      const silent = Boolean(options?.silent);
      const config = configByKey[tab.resource];
      const { key: loadKey, token } = nextLoadToken(tab, config);
      const targetResource = tab.resource;
      const targetContext = tab.context;
      const targetNamespace = config.namespaced ? tab.namespace : undefined;
      const stillTarget = (candidate: TabSession) =>
        candidate.resource === targetResource &&
        candidate.context === targetContext &&
        (!config.namespaced || candidate.namespace === targetNamespace);
      const applyIfCurrent = (patch: Partial<TabSession>) =>
        setTabs((current) => current.map((item) => (item.id === tab.id && stillTarget(item) ? { ...item, ...patch } : item)));

      if (!silent) {
        updateTab(tab.id, {
          loading: true,
          runState: "running",
          runLabel: `Cargando ${config.label}`,
          output: "",
          outputTitle: "",
          rows: [],
          selectedName: "",
          selectedNames: []
        });
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
          lastCommand: formatKubectlCommand(
            ["get", config.kubectlName, "-o", "json"],
            tab.context,
            config.namespaced ? tab.namespace : undefined
          ),
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
        applyIfCurrent({
          loading: false,
          runState: "error",
          runLabel: `Error: ${config.label}`,
          outputTitle: "Error",
          output: kubectlErrorText(result, "No se pudieron cargar los recursos."),
          lastCommand: result.command,
          rows: []
        });
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

      applyIfCurrent({
        rows: items,
        selectedName: "",
        selectedNames: [],
        loading: false,
        runState: "done",
        runLabel: `${config.label} cargados`,
        lastCommand: result.command
      });
    },
    [isLoadCurrent, kubeconfigPaths, nextLoadToken, setGlobalMessage, setTabs, updateTab]
  );

  return { loadResources };
}
