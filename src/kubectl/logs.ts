import { ALL_LOG_CONTAINERS, MAX_QUERY_LINES } from "../app/constants";
import type { KubeItem, LogsMode } from "../app/types";

export const K8S_TS_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+/;

export function lineEpoch(line: string): number | null {
  const match = K8S_TS_RE.exec(line);
  if (!match) return null;
  const time = Date.parse(match[1]);
  return Number.isNaN(time) ? null : time;
}

export function capLines(text: string, max: number): { text: string; truncated: boolean } {
  let newlines = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) newlines++;
  }
  if (newlines <= max) return { text, truncated: false };
  const lines = text.split("\n");
  return { text: lines.slice(lines.length - max).join("\n"), truncated: true };
}

export function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function buildLogsArgs(
  name: string,
  opts: { mode: LogsMode; since: string; start: string; end: string; container?: string; allContainers?: boolean }
): { args: string[]; startEpoch: number | null; endEpoch: number | null; follow: boolean } {
  const args = ["logs", "--timestamps"];
  if (opts.allContainers) args.push("--all-containers=true");
  else if (opts.container) args.push("-c", opts.container);
  if (opts.mode === "live") {
    if (opts.since) {
      args.push("-f", `--since=${opts.since}`, name);
      return { args, startEpoch: null, endEpoch: null, follow: true };
    }
    args.push(name);
    return { args, startEpoch: null, endEpoch: null, follow: false };
  }

  let startEpoch: number | null = null;
  if (opts.start) {
    const startMs = new Date(opts.start).getTime();
    if (!Number.isNaN(startMs)) {
      startEpoch = startMs;
      args.push(`--since-time=${new Date(startMs).toISOString()}`);
    }
  } else if (opts.since) {
    args.push(`--since=${opts.since}`);
  }
  args.push(`--tail=${MAX_QUERY_LINES}`, name);
  const endMs = opts.end ? new Date(opts.end).getTime() : NaN;
  return { args, startEpoch, endEpoch: Number.isNaN(endMs) ? null : endMs, follow: false };
}

export function podContainerNames(item?: KubeItem): string[] {
  const spec = item?.spec as
    | {
        containers?: Array<{ name?: string }>;
        initContainers?: Array<{ name?: string }>;
        ephemeralContainers?: Array<{ name?: string }>;
      }
    | undefined;
  const names = [
    ...(spec?.containers ?? []),
    ...(spec?.initContainers ?? []),
    ...(spec?.ephemeralContainers ?? [])
  ]
    .map((container) => container.name)
    .filter((name): name is string => Boolean(name));
  return Array.from(new Set(names));
}

export function defaultLogContainer(item?: KubeItem): string {
  const names = podContainerNames(item);
  const annotated = item?.metadata?.annotations?.["kubectl.kubernetes.io/default-container"];
  if (annotated && names.includes(annotated)) return annotated;
  const sidecars = new Set(["istio-proxy", "linkerd-proxy", "vault-agent", "envoy", "cloud-sql-proxy", "oauth2-proxy"]);
  return names.find((name) => !sidecars.has(name)) ?? names[0] ?? "";
}

export function resolveLogContainer(item: KubeItem | undefined, requested: string) {
  const names = podContainerNames(item);
  if (names.length <= 1) return "";
  if (requested === ALL_LOG_CONTAINERS) return ALL_LOG_CONTAINERS;
  if (requested && names.includes(requested)) return requested;
  return defaultLogContainer(item);
}
