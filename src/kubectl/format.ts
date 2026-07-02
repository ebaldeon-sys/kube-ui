import type { KubectlResult } from "../types";

export function formatKubectlCommand(args: string[], context?: string, namespace?: string): string {
  const hasFlag = (flag: string) => args.some((arg) => arg === flag || arg.startsWith(`${flag}=`));
  const full: string[] = [];
  if (context && !hasFlag("--context")) full.push("--context", context);
  if (namespace && !hasFlag("-n") && !hasFlag("--namespace")) full.push("-n", namespace);
  full.push(...args);
  return ["kubectl", ...full]
    .map((value) => (/^[A-Za-z0-9_./:=@-]+$/.test(value) ? value : JSON.stringify(value)))
    .join(" ");
}

export function unknownMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function kubectlOutput(result: KubectlResult, fallback: string) {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

export function kubectlSuccessText(result: KubectlResult, fallback = "Comando ejecutado correctamente sin salida.") {
  const body = result.stdout.trim() || result.stderr.trim();
  if (body) return body;
  const code = result.code === null ? "" : `\n\nExit code: ${result.code}`;
  return `${fallback}${code}`;
}

export function kubectlErrorText(result: KubectlResult, fallback: string) {
  const body = kubectlOutput(result, fallback);
  const code = result.code === null ? "" : `\n\nExit code: ${result.code}`;
  return `${body}${code}`;
}

export function isUnsupportedInteractiveCommand(command: string) {
  const normalized = command.toLowerCase();
  const hasInteractiveFlag = /(^|\s)-i?t(\s|$)|(^|\s)-t(\s|$)|(^|\s)--tty(\s|$)|(^|\s)--stdin(\s|$)/.test(normalized);
  return (/\b(exec|attach)\b/.test(normalized) && hasInteractiveFlag) || /\bport-forward\b/.test(normalized);
}
