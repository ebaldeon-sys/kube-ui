// Logica pura de construccion/validacion de argumentos de kubectl. Sin
// dependencias de Electron para poder testearla de forma aislada.
import type { KubectlRunRequest } from "../shared/types.js";

export const MAX_ARGS = 256;
export const MAX_ARG_LENGTH = 8192;

export function hasFlag(args: string[], flag: string) {
  return args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
}

export function hasNamespaceFlag(args: string[]) {
  return hasFlag(args, "-n") || hasFlag(args, "--namespace");
}

export function buildKubectlArgs(request: KubectlRunRequest) {
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

export function quoteForDisplay(value: string) {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

// Validacion defensiva de los argumentos que llegan por IPC. Aunque usamos
// spawn con shell:false (sin riesgo de inyeccion de shell), verificamos la
// forma de los datos para fallar rapido y evitar comportamientos inesperados.
export function assertValidArgs(args: unknown): asserts args is string[] {
  if (!Array.isArray(args)) throw new Error("Los argumentos de kubectl deben ser un arreglo.");
  if (args.length > MAX_ARGS) throw new Error(`Demasiados argumentos (maximo ${MAX_ARGS}).`);
  for (const arg of args) {
    if (typeof arg !== "string") throw new Error("Cada argumento de kubectl debe ser una cadena.");
    if (arg.length > MAX_ARG_LENGTH) throw new Error("Un argumento de kubectl excede la longitud maxima permitida.");
  }
}

export function parseCommandLine(command: string) {
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
