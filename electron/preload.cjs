const { clipboard, contextBridge, ipcRenderer } = require("electron");

const STREAM_CHANNEL = "kubectl:stream:event";
const makeStreamId = () => `stream_${Date.now()}_${Math.random().toString(36).slice(2)}`;

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  addKubeconfigs: () => ipcRenderer.invoke("settings:addKubeconfigs"),
  removeKubeconfig: (kubeconfigPath) => ipcRenderer.invoke("settings:removeKubeconfig", kubeconfigPath),
  inspectKubeconfigs: () => ipcRenderer.invoke("settings:inspectKubeconfigs"),
  revealKubeconfig: (kubeconfigPath) => ipcRenderer.invoke("settings:revealKubeconfig", kubeconfigPath),
  runKubectl: (request) => ipcRenderer.invoke("kubectl:run", request),
  runManualKubectl: (request) => ipcRenderer.invoke("kubectl:runManual", request),
  applyYaml: (request) => ipcRenderer.invoke("kubectl:applyYaml", request),
  replaceYaml: (request) => ipcRenderer.invoke("kubectl:replaceYaml", request),
  pickYamlFile: () => ipcRenderer.invoke("kubectl:pickYamlFile"),
  writeClipboard: (text) => clipboard.writeText(text),
  streamKubectl: (request, handlers) => {
    const streamId = makeStreamId();
    const listener = (_event, payload) => {
      if (!payload || payload.streamId !== streamId) return;
      if (payload.type === "data") {
        handlers.onData(payload.chunk);
      } else if (payload.type === "end") {
        ipcRenderer.removeListener(STREAM_CHANNEL, listener);
        handlers.onEnd({ code: payload.code, error: payload.error, command: payload.command });
      }
    };
    ipcRenderer.on(STREAM_CHANNEL, listener);
    ipcRenderer.invoke("kubectl:stream", { ...request, streamId }).catch((error) => {
      ipcRenderer.removeListener(STREAM_CHANNEL, listener);
      handlers.onEnd({ code: null, error: error instanceof Error ? error.message : String(error), command: "" });
    });
    return () => {
      ipcRenderer.removeListener(STREAM_CHANNEL, listener);
      ipcRenderer.invoke("kubectl:streamStop", streamId);
    };
  }
};

contextBridge.exposeInMainWorld("kubeui", api);
