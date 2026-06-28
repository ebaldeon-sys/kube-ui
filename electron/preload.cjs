const { contextBridge, ipcRenderer } = require("electron");

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  addKubeconfigs: () => ipcRenderer.invoke("settings:addKubeconfigs"),
  removeKubeconfig: (kubeconfigPath) => ipcRenderer.invoke("settings:removeKubeconfig", kubeconfigPath),
  resetDefaultKubeconfig: () => ipcRenderer.invoke("settings:resetDefaultKubeconfig"),
  runKubectl: (request) => ipcRenderer.invoke("kubectl:run", request),
  runManualKubectl: (request) => ipcRenderer.invoke("kubectl:runManual", request),
  applyYaml: (request) => ipcRenderer.invoke("kubectl:applyYaml", request),
  pickYamlFile: () => ipcRenderer.invoke("kubectl:pickYamlFile")
};

contextBridge.exposeInMainWorld("kubeui", api);
