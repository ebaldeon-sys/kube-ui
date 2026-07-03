import type { KubeconfigInspection, KubectlResult, KubectlRunRequest, PickedYamlFile } from "../shared/types";

// Tipos de IPC compartidos con el proceso principal (fuente unica en shared/).
export type { KubectlResult, KubeconfigInspection, PickedYamlFile } from "../shared/types";

// Alias historico usado en el renderer.
export type KubectlRequest = KubectlRunRequest;

// El renderer recibe los ajustes con el delimitador de PATH ya resuelto por main.
export type Settings = {
  kubeconfigPaths: string[];
  pathDelimiter: string;
};

export type kubeuiApi = {
  getSettings: () => Promise<Settings>;
  addKubeconfigs: () => Promise<Pick<Settings, "kubeconfigPaths">>;
  removeKubeconfig: (kubeconfigPath: string) => Promise<Pick<Settings, "kubeconfigPaths">>;
  inspectKubeconfigs: () => Promise<KubeconfigInspection[]>;
  revealKubeconfig: (kubeconfigPath: string) => Promise<boolean>;
  runKubectl: (request: KubectlRequest) => Promise<KubectlResult>;
  runManualKubectl: (request: {
    command: string;
    kubeconfigPaths?: string[];
    context?: string;
    namespace?: string;
  }) => Promise<KubectlResult>;
  applyYaml: (request: {
    yaml: string;
    kubeconfigPaths?: string[];
    context?: string;
    namespace?: string;
  }) => Promise<KubectlResult>;
  replaceYaml: (request: {
    yaml: string;
    kubeconfigPaths?: string[];
    context?: string;
    namespace?: string;
  }) => Promise<KubectlResult>;
  pickYamlFile: () => Promise<PickedYamlFile | null>;
  writeClipboard: (text: string) => Promise<boolean>;
  streamKubectl: (
    request: {
      args?: string[];
      command?: string;
      kubeconfigPaths?: string[];
      context?: string;
      namespace?: string;
    },
    handlers: {
      onData: (chunk: string) => void;
      onEnd: (result: { code: number | null; error?: string; command: string }) => void;
    }
  ) => () => void;
};

declare global {
  interface Window {
    kubeui: kubeuiApi;
  }
}
