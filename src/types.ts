export type Settings = {
  kubeconfigPaths: string[];
  defaultKubeconfigPath: string;
  pathDelimiter: string;
};

export type KubectlResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
};

export type KubectlRequest = {
  args: string[];
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
  input?: string;
  timeoutMs?: number;
};

export type PickedYamlFile = {
  path: string;
  content: string;
};

export type kubeuiApi = {
  getSettings: () => Promise<Settings>;
  addKubeconfigs: () => Promise<Pick<Settings, "kubeconfigPaths">>;
  removeKubeconfig: (kubeconfigPath: string) => Promise<Pick<Settings, "kubeconfigPaths">>;
  resetDefaultKubeconfig: () => Promise<Pick<Settings, "kubeconfigPaths">>;
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
  pickYamlFile: () => Promise<PickedYamlFile | null>;
};

declare global {
  interface Window {
    kubeui: kubeuiApi;
  }
}
