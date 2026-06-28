import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

type Settings = {
  kubeconfigPaths: string[];
};

type KubectlRunRequest = {
  args: string[];
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
  input?: string;
  timeoutMs?: number;
};

type KubectlManualRequest = {
  command: string;
  kubeconfigPaths?: string[];
  context?: string;
  namespace?: string;
};

type KubectlResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
};

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
const currentDir = path.dirname(fileURLToPath(import.meta.url));

function defaultKubeconfigPath() {
  return path.join(homedir(), ".kube", "config");
}

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
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
    const fallback = defaultKubeconfigPath();
    return { kubeconfigPaths: existsSync(fallback) ? [fallback] : [] };
  }
}

async function writeSettings(settings: Settings) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(settingsPath(), JSON.stringify(settings, null, 2));
}

function buildKubectlArgs(request: KubectlRunRequest) {
  const args: string[] = [];
  if (request.context && !hasFlag(request.args, "--context")) {
    args.push("--context", request.context);
  }
  if (request.namespace && !hasNamespaceFlag(request.args)) {
    args.push("-n", request.namespace);
  }
  args.push(...request.args);
  return args;
}

function hasFlag(args: string[], flag: string) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

function hasNamespaceFlag(args: string[]) {
  return hasFlag(args, "-n") || hasFlag(args, "--namespace");
}

function quoteForDisplay(value: string) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function runKubectl(request: KubectlRunRequest): Promise<KubectlResult> {
  const args = buildKubectlArgs(request);
  const env = { ...process.env };
  if (request.kubeconfigPaths?.length) {
    env.KUBECONFIG = request.kubeconfigPaths.join(path.delimiter);
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
    const timeout = setTimeout(() => {
      if (!settled) {
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
      resolve({
        ok: code === 0,
        code,
        stdout,
        stderr,
        command: ["kubectl", ...args].map(quoteForDisplay).join(" ")
      });
    });

    if (request.input) {
      child.stdin.write(request.input);
    }
    child.stdin.end();
  });
}

function parseCommandLine(command: string) {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let escaping = false;

  for (const char of command.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
      escaping = true;
      continue;
    }
    if ((char === "'" || char === '"') && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (quote) throw new Error("Hay una comilla sin cerrar en el comando.");
  if (escaping) current += "\\";
  if (current) args.push(current);
  if (args[0] === "kubectl") args.shift();
  return args;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    title: "kubeui",
    backgroundColor: "#eef2f7",
    webPreferences: {
      preload: path.join(currentDir, "../electron/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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

app.whenReady().then(() => {
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
    defaultKubeconfigPath: defaultKubeconfigPath(),
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

ipcMain.handle("settings:resetDefaultKubeconfig", async () => {
  const fallback = defaultKubeconfigPath();
  const next = { kubeconfigPaths: existsSync(fallback) ? [fallback] : [] };
  await writeSettings(next);
  return next;
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
  await writeFile(filePath, request.yaml, "utf8");
  try {
    return await runKubectl({
      args: ["apply", "-f", filePath],
      kubeconfigPaths: request.kubeconfigPaths,
      context: request.context,
      namespace: request.namespace,
      timeoutMs: 120_000
    });
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
