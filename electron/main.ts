import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, session, shell } from "electron";
import { spawn } from "node:child_process";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type {
  KubeconfigInspection,
  KubectlManualRequest,
  KubectlResult,
  KubectlRunRequest,
  StoredSettings as Settings
} from "../shared/types.js";
import { assertValidArgs, buildKubectlArgs, parseCommandLine, quoteForDisplay } from "./kubectl-args.js";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const currentDir = path.dirname(fileURLToPath(import.meta.url));

// Content Security Policy aplicada por cabecera de respuesta (mas fiable que un
// meta tag para cargas file://). En produccion es estricta; en dev se relaja lo
// justo para el HMR de Vite y el preamble inline de react-refresh.
const CSP_PRODUCTION =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
const CSP_DEVELOPMENT =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: http://127.0.0.1:5173; object-src 'none'";

function applyContentSecurityPolicy() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [isDev ? CSP_DEVELOPMENT : CSP_PRODUCTION]
      }
    });
  });
}

const STREAM_CHANNEL = "kubectl:stream:event";
const activeStreams = new Map<string, ReturnType<typeof spawn>>();
const stoppedStreams = new Set<string>();
const MAX_STOPPED_STREAMS = 1000;

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

// Persistencia del tamaño de la ventana entre sesiones. Guardamos solo el
// tamaño (no la posicion) para evitar que la ventana quede fuera de pantalla
// si cambia la configuracion de monitores.
function windowStatePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowSize(): { width: number; height: number } | null {
  try {
    const parsed = JSON.parse(readFileSync(windowStatePath(), "utf8")) as { width?: unknown; height?: unknown };
    if (typeof parsed.width === "number" && typeof parsed.height === "number") {
      return { width: parsed.width, height: parsed.height };
    }
  } catch {
    // Sin estado previo o archivo invalido: usamos el tamaño por defecto.
  }
  return null;
}

function saveWindowSize(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  try {
    const { width, height } = win.getBounds();
    writeFileSync(windowStatePath(), JSON.stringify({ width, height }));
  } catch {
    // Ignoramos errores de escritura del estado de ventana (no es critico).
  }
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = await readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      kubeconfigPaths: Array.isArray(parsed.kubeconfigPaths)
        ? parsed.kubeconfigPaths.filter((item): item is string => typeof item === "string")
        : []
    };
  } catch {
    return { kubeconfigPaths: [] };
  }
}

async function writeSettings(settings: Settings) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2));
}

function runKubectl(request: KubectlRunRequest): Promise<KubectlResult> {
  assertValidArgs(request.args);
  const args = buildKubectlArgs(request);
  const env = { ...process.env };
  if (request.kubeconfigPaths?.length) {
    env.KUBECONFIG = request.kubeconfigPaths.join(path.delimiter);
  } else {
    // Sin kubeconfig registrado no usamos ningun archivo por defecto (~/.kube/config).
    env.KUBECONFIG = path.join(app.getPath("userData"), "kubeui-no-kubeconfig");
  }

  return new Promise((resolve) => {
    const child = spawn("kubectl", args, {
      env,
      shell: false,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        timedOut = true;
        child.kill();
      }
    }, request.timeoutMs ?? 120_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: error.message,
        command: ["kubectl", ...args].map(quoteForDisplay).join(" ")
      });
    });
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timeout);
      const timeoutMessage = `El comando excedio ${(request.timeoutMs ?? 120_000) / 1000} segundos y fue interrumpido.`;
      resolve({
        ok: code === 0 && !timedOut,
        code,
        stdout,
        stderr: timedOut ? (stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage) : stderr,
        command: ["kubectl", ...args].map(quoteForDisplay).join(" ")
      });
    });

    // stdin puede cerrarse (EPIPE) si el proceso muere antes de leer la entrada.
    // Capturamos el error para no tumbar el proceso principal de Electron.
    child.stdin.on("error", () => undefined);
    if (request.input) {
      child.stdin.write(request.input);
    }
    child.stdin.end();
  });
}

function errorResult(command: string, error: unknown): KubectlResult {
  return {
    ok: false,
    code: null,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
    command
  };
}

function createWindow() {
  const savedSize = readWindowSize();
  const mainWindow = new BrowserWindow({
    width: savedSize?.width ?? 1320,
    height: savedSize?.height ?? 860,
    minWidth: 860,
    minHeight: 620,
    title: "kubeui",
    backgroundColor: "#eef2f7",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDir, "../electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      // El preload solo usa contextBridge/ipcRenderer, compatibles con sandbox.
      sandbox: true
    }
  });

  // Hardening: la app no debe abrir ventanas nuevas ni navegar a URLs externas.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Los enlaces externos se abren en el navegador del sistema, nunca en la app.
    if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => undefined);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const devUrl = process.env.VITE_DEV_SERVER_URL;
    const allowed = isDev && devUrl ? url.startsWith(devUrl) : url.startsWith("file://");
    if (!allowed) event.preventDefault();
  });

  // Recordar el tamaño de la ventana al cerrarla.
  mainWindow.on("close", () => saveWindowSize(mainWindow));

  if (isDev) {
    mainWindow.webContents.on("console-message", (details) => {
      console.log(`[renderer:${details.level}] ${details.sourceId}:${details.lineNumber} ${details.message}`);
    });
    mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
      console.error(`[renderer] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    });
  }

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(currentDir, "../dist/index.html"));
  }
}

// Menu minimo con roles estandar. Sin el, en macOS no funcionan los atajos de
// portapapeles (Cmd+C/V/X/A) ni Cmd+Q. En Windows/Linux queda oculto
// (autoHideMenuBar) pero mantiene los aceleradores activos.
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template: Parameters<typeof Menu.buildFromTemplate>[0] = [
    ...(isMac ? [{ role: "appMenu" as const }] : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildAppMenu();
  applyContentSecurityPolicy();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("settings:get", async () => {
  const settings = await readSettings();
  return {
    ...settings,
    pathDelimiter: path.delimiter
  };
});

ipcMain.handle("settings:addKubeconfigs", async () => {
  const current = await readSettings();
  const response = await dialog.showOpenDialog({
    title: "Seleccionar kubeconfig",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Kubeconfig/YAML", extensions: ["config", "yaml", "yml", "*"] }]
  });
  if (response.canceled) return current;

  const kubeconfigPaths = Array.from(new Set([...current.kubeconfigPaths, ...response.filePaths]));
  const next = { kubeconfigPaths };
  await writeSettings(next);
  return next;
});

ipcMain.handle("settings:removeKubeconfig", async (_event, kubeconfigPath: string) => {
  const current = await readSettings();
  const next = {
    kubeconfigPaths: current.kubeconfigPaths.filter((item) => item !== kubeconfigPath)
  };
  await writeSettings(next);
  return next;
});

ipcMain.handle("settings:inspectKubeconfigs", async () => {
  const current = await readSettings();
  const inspections: KubeconfigInspection[] = [];

  for (const kubeconfigPath of current.kubeconfigPaths) {
    try {
      await access(kubeconfigPath);
    } catch {
      inspections.push({
        path: kubeconfigPath,
        exists: false,
        contexts: [],
        ok: false,
        error: "El archivo no existe o no se puede leer."
      });
      continue;
    }

    const result = await runKubectl({
      args: ["config", "view", "-o", "json"],
      kubeconfigPaths: [kubeconfigPath],
      timeoutMs: 15_000
    });

    if (!result.ok) {
      inspections.push({
        path: kubeconfigPath,
        exists: true,
        contexts: [],
        ok: false,
        error: result.stderr || "No se pudieron leer los contextos.",
        command: result.command
      });
      continue;
    }

    try {
      const parsed = JSON.parse(result.stdout) as { contexts?: Array<{ name?: string }> };
      inspections.push({
        path: kubeconfigPath,
        exists: true,
        contexts: (parsed.contexts ?? []).map((context) => context.name).filter((name): name is string => Boolean(name)),
        ok: true,
        command: result.command
      });
    } catch (error) {
      inspections.push({
        path: kubeconfigPath,
        exists: true,
        contexts: [],
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        command: result.command
      });
    }
  }

  return inspections;
});

ipcMain.handle("settings:revealKubeconfig", async (_event, kubeconfigPath: string) => {
  shell.showItemInFolder(kubeconfigPath);
  return true;
});

ipcMain.handle("app:writeClipboard", async (_event, text: string) => {
  clipboard.writeText(String(text ?? ""));
  return true;
});

ipcMain.handle("kubectl:run", async (_event, request: KubectlRunRequest) => {
  return runKubectl(request);
});

ipcMain.handle("kubectl:runManual", async (_event, request: KubectlManualRequest) => {
  try {
    const args = parseCommandLine(request.command);
    if (!args.length) throw new Error("Ingresa un comando kubectl.");
    return runKubectl({
      args,
      kubeconfigPaths: request.kubeconfigPaths,
      context: request.context,
      namespace: request.namespace,
      timeoutMs: 120_000
    });
  } catch (error) {
    return {
      ok: false,
      code: null,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      command: request.command
    };
  }
});

ipcMain.handle("kubectl:applyYaml", async (_event, request: Omit<KubectlRunRequest, "args"> & { yaml: string }) => {
  const filePath = path.join(tmpdir(), `kubeui-${randomUUID()}.yaml`);
  try {
    await writeFile(filePath, request.yaml, "utf8");
    return await runKubectl({
      args: ["apply", "-f", filePath],
      kubeconfigPaths: request.kubeconfigPaths,
      context: request.context,
      namespace: request.namespace,
      timeoutMs: 120_000
    });
  } catch (error) {
    return errorResult("kubectl apply -f <tempfile>", error);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
});

// Equivalente no interactivo de `kubectl edit`: reemplaza el objeto vivo con el
// YAML editado (PUT). Respeta el resourceVersion del manifiesto para control de
// concurrencia y no mantiene la anotacion last-applied-configuration.
ipcMain.handle("kubectl:replaceYaml", async (_event, request: Omit<KubectlRunRequest, "args"> & { yaml: string }) => {
  const filePath = path.join(tmpdir(), `kubeui-${randomUUID()}.yaml`);
  try {
    await writeFile(filePath, request.yaml, "utf8");
    return await runKubectl({
      args: ["replace", "-f", filePath],
      kubeconfigPaths: request.kubeconfigPaths,
      context: request.context,
      namespace: request.namespace,
      timeoutMs: 120_000
    });
  } catch (error) {
    return errorResult("kubectl replace -f <tempfile>", error);
  } finally {
    await unlink(filePath).catch(() => undefined);
  }
});

ipcMain.handle("kubectl:pickYamlFile", async () => {
  const response = await dialog.showOpenDialog({
    title: "Seleccionar YAML",
    properties: ["openFile"],
    filters: [{ name: "YAML", extensions: ["yaml", "yml"] }]
  });
  if (response.canceled || !response.filePaths[0]) return null;
  return {
    path: response.filePaths[0],
    content: await readFile(response.filePaths[0], "utf8")
  };
});

type KubectlStreamRequest = {
  streamId: string;
  args?: string[];
  command?: string;
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
};

ipcMain.handle("kubectl:stream", (event, request: KubectlStreamRequest) => {
  const { streamId } = request;
  let args: string[];
  try {
    args = request.command !== undefined ? parseCommandLine(request.command) : (request.args ?? []);
    assertValidArgs(args);
    if (!args.length) throw new Error("Ingresa un comando kubectl.");
  } catch (error) {
    stoppedStreams.delete(streamId);
    event.sender.send(STREAM_CHANNEL, {
      streamId,
      type: "end",
      code: null,
      error: error instanceof Error ? error.message : String(error),
      command: request.command ?? ""
    });
    return { streamId, command: request.command ?? "" };
  }

  const fullArgs = buildKubectlArgs({
    args,
    context: request.context,
    namespace: request.namespace
  });
  const command = ["kubectl", ...fullArgs].map(quoteForDisplay).join(" ");

  if (stoppedStreams.delete(streamId)) {
    event.sender.send(STREAM_CHANNEL, { streamId, type: "end", code: null, command });
    return { streamId, command };
  }

  const env = { ...process.env };
  if (request.kubeconfigPaths?.length) {
    env.KUBECONFIG = request.kubeconfigPaths.join(path.delimiter);
  } else {
    env.KUBECONFIG = path.join(app.getPath("userData"), "kubeui-no-kubeconfig");
  }

  const child = spawn("kubectl", fullArgs, { env, shell: false, windowsHide: true });
  activeStreams.set(streamId, child);

  child.stdout.on("data", (chunk: Buffer) => {
    event.sender.send(STREAM_CHANNEL, { streamId, type: "data", chunk: chunk.toString() });
  });
  child.stderr.on("data", (chunk: Buffer) => {
    event.sender.send(STREAM_CHANNEL, { streamId, type: "data", chunk: chunk.toString() });
  });
  child.on("error", (error) => {
    activeStreams.delete(streamId);
    event.sender.send(STREAM_CHANNEL, { streamId, type: "end", code: null, error: error.message, command });
  });
  child.on("close", (code) => {
    activeStreams.delete(streamId);
    event.sender.send(STREAM_CHANNEL, { streamId, type: "end", code, command });
  });

  return { streamId, command };
});

ipcMain.handle("kubectl:streamStop", (_event, streamId: string) => {
  const child = activeStreams.get(streamId);
  if (child) {
    child.kill();
    activeStreams.delete(streamId);
  } else {
    // Cota superior de seguridad: si por alguna razon se acumulan marcas de
    // stop sin consumir, descartamos la mas antigua (orden de insercion) para
    // que el Set no crezca sin limite.
    if (stoppedStreams.size >= MAX_STOPPED_STREAMS) {
      const oldest = stoppedStreams.values().next().value;
      if (oldest !== undefined) stoppedStreams.delete(oldest);
    }
    stoppedStreams.add(streamId);
    setTimeout(() => stoppedStreams.delete(streamId), 30_000);
  }
  return true;
});

app.on("before-quit", () => {
  for (const child of activeStreams.values()) {
    child.kill();
  }
  activeStreams.clear();
  stoppedStreams.clear();
});
