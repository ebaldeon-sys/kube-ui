// Entry del harness de preview: instala el mock de window.kubeui ANTES de montar
// la app, para poder ejecutar la UI en un navegador sin Electron/kubectl reales.
// Se sirve via preview.html (entry multipagina de Vite). No entra al build de la
// app real (index.html sigue apuntando a src/main.tsx).
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installKubeuiMock } from "./mocks/kubeui.mock";
import { applyStoredTheme } from "./theme/useTheme";
import "./styles/app.css";

installKubeuiMock();
applyStoredTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
