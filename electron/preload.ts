import { contextBridge, ipcRenderer } from "electron";

const api = {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  addKubeconfigs: () => ipcRenderer.invoke("settings:addKubeconfigs"),
  removeKubeconfig: (kubeconfigPath: string) => ipcRenderer.invoke("settings:removeKubeconfig", kubeconfigPath),
  resetDefaultKubeconfig: () => ipcRenderer.invoke("settings:resetDefaultKubeconfig"),
  runKubectl: (request: unknown) => ipcRenderer.invoke("kubectl:run", request),
  runManualKubectl: (request: unknown) => ipcRenderer.invoke("kubectl:runManual", request),
  applyYaml: (request: unknown) => ipcRenderer.invoke("kubectl:applyYaml", request),
  pickYamlFile: () => ipcRenderer.invoke("kubectl:pickYamlFile")
};

contextBridge.exposeInMainWorld("kubeui", api);
