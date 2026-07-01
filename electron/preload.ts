import { contextBridge, ipcRenderer } from "electron";

const STREAM_CHANNEL = "kubectl:stream:event";
const makeStreamId = () => `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  addKubeconfigs: () => ipcRenderer.invoke("settings:addKubeconfigs"),
  removeKubeconfig: (kubeconfigPath: string) => ipcRenderer.invoke("settings:removeKubeconfig", kubeconfigPath),
  inspectKubeconfigs: () => ipcRenderer.invoke("settings:inspectKubeconfigs"),
  revealKubeconfig: (kubeconfigPath: string) => ipcRenderer.invoke("settings:revealKubeconfig", kubeconfigPath),
  runKubectl: (request: unknown) => ipcRenderer.invoke("kubectl:run", request),
  runManualKubectl: (request: unknown) => ipcRenderer.invoke("kubectl:runManual", request),
  applyYaml: (request: unknown) => ipcRenderer.invoke("kubectl:applyYaml", request),
  replaceYaml: (request: unknown) => ipcRenderer.invoke("kubectl:replaceYaml", request),
  pickYamlFile: () => ipcRenderer.invoke("kubectl:pickYamlFile"),
  writeClipboard: (text: string) => ipcRenderer.invoke("app:writeClipboard", text),
  streamKubectl: (
    request: unknown,
    handlers: { onData: (chunk: string) => void; onEnd: (result: { code: number | null; error?: string; command: string }) => void }
  ) => {
    const streamId = makeStreamId();
    const listener = (_event: unknown, payload: { streamId: string; type: string; chunk?: string; code?: number | null; error?: string; command?: string }) => {
      if (!payload || payload.streamId !== streamId) return;
      if (payload.type === "data") {
        handlers.onData(payload.chunk ?? "");
      } else if (payload.type === "end") {
        ipcRenderer.removeListener(STREAM_CHANNEL, listener);
        handlers.onEnd({ code: payload.code ?? null, error: payload.error, command: payload.command ?? "" });
      }
    };
    ipcRenderer.on(STREAM_CHANNEL, listener);
    ipcRenderer.invoke("kubectl:stream", { ...(request as object), streamId }).catch((error) => {
      ipcRenderer.removeListener(STREAM_CHANNEL, listener);
      handlers.onEnd({ code: null, error: error instanceof Error ? error.message : String(error), command: "" });
    });
    return () => {
      ipcRenderer.removeListener(STREAM_CHANNEL, listener);
      ipcRenderer.invoke("kubectl:streamStop", streamId).catch(() => undefined);
    };
  }
};

contextBridge.exposeInMainWorld("kubeui", api);
