// Tipos de IPC compartidos entre el proceso principal de Electron (electron/) y
// el renderer (src/). Es un archivo de declaracion: no se emite ni afecta el
// rootDir de ningun tsconfig, asi que ambos lados pueden importar estos tipos
// sin generar artefactos de runtime ni desplazar la ruta de salida del build.

export type KubectlResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
};

export type KubectlRunRequest = {
  args: string[];
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
  input?: string;
  timeoutMs?: number;
};

export type KubectlManualRequest = {
  command: string;
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
};

export type KubeconfigInspection = {
  path: string;
  exists: boolean;
  contexts: string[];
  ok: boolean;
  error?: string;
  command?: string;
};

export type PickedYamlFile = {
  path: string;
  content: string;
};

// Ajustes tal como se persisten en disco (el renderer recibe ademas pathDelimiter).
export type StoredSettings = {
  kubeconfigPaths: string[];
};
