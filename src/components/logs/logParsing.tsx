// Parsing y utilidades puras del panel de logs. Extraido de LogsPanel para que el
// componente se centre en estado/render. Sin dependencias de React salvo el JSX de
// resaltado (highlightText).
import type { JSX } from "react";
import type { LogLevelFilter } from "../../app/types";
import { K8S_TS_RE } from "../../kubectl/logs";

export type ParsedLog = {
  time?: string;
  level?: string;
  message: string;
  source?: string;
  json?: Record<string, unknown>;
};

export type LogDetailTab = "message" | "json" | "raw" | "fields";

// Tope del cache LRU de parsing. Acota la memoria (~pocas MB) sin el patron de
// "cliff-edge" que vaciaba el cache entero al superar el limite.
const PARSE_CACHE_MAX = 20_000;

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    let value = obj[key];
    if ((value === undefined || value === null || value === "") && key.includes(".")) {
      value = key.split(".").reduce<unknown>((current, part) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[part];
      }, obj);
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function formatTime(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number, size = 2) => String(n).padStart(size, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

export function parseLogLine(line: string): ParsedLog {
  // `--timestamps` antepone un RFC3339; lo separamos para usarlo como hora real.
  let rest = line;
  let k8sTime: string | undefined;
  const tsMatch = K8S_TS_RE.exec(line);
  if (tsMatch) {
    k8sTime = formatTime(tsMatch[1]);
    rest = line.slice(tsMatch[0].length);
  }
  const trimmed = rest.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { time: k8sTime, message: rest };
  }
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>;
    const level = pick(json, ["level", "severity.text", "severity_text", "loglevel", "status", "lvl", "log.level"]);
    const message = pick(json, ["message", "msg", "log", "text"]);
    const source = pick(json, ["logger.name", "logger_name", "service.name", "k8s.container.name", "thread.name"]);
    return {
      time: formatTime(pick(json, ["@timestamp", "timestamp", "time", "ts", "@t"])) ?? k8sTime,
      level: level ? String(level).toUpperCase() : undefined,
      message: message !== undefined ? String(message) : trimmed,
      source: source ? String(source) : undefined,
      json
    };
  } catch {
    return { time: k8sTime, message: rest };
  }
}

export function levelClass(level?: string): string {
  if (!level) return "";
  if (level.startsWith("ERR") || level === "FATAL" || level === "SEVERE") return "log-error";
  if (level.startsWith("WARN")) return "log-warn";
  if (level === "INFO") return "log-info";
  if (level === "DEBUG") return "log-debug";
  if (level === "TRACE") return "log-trace";
  return "";
}

export function levelBucket(level?: string): LogLevelFilter {
  if (!level) return "OTHER";
  if (level.startsWith("ERR") || level === "FATAL" || level === "SEVERE") return "ERROR";
  if (level.startsWith("WARN")) return "WARN";
  if (level === "INFO") return "INFO";
  if (level === "DEBUG") return "DEBUG";
  if (level === "TRACE") return "TRACE";
  return "OTHER";
}

export function highlightText(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const nodes: Array<string | JSX.Element> = [];
  let from = 0;
  let index = lower.indexOf(needle, from);
  while (index !== -1) {
    if (index > from) nodes.push(text.slice(from, index));
    nodes.push(
      <mark key={`${index}-${from}`} className="log-hit">
        {text.slice(index, index + needle.length)}
      </mark>
    );
    from = index + needle.length;
    index = lower.indexOf(needle, from);
  }
  nodes.push(text.slice(from));
  return nodes;
}

// Cache LRU de parseo: cada linea se parsea una sola vez. Se guarda en un ref del
// componente para no reparsear en cada render ni crecer sin limite.
export function createParseCache(): (line: string) => ParsedLog {
  const cache = new Map<string, ParsedLog>();
  return (line: string) => {
    const existing = cache.get(line);
    if (existing) {
      // Marcar como reciente moviendola al final del Map.
      cache.delete(line);
      cache.set(line, existing);
      return existing;
    }
    const entry = parseLogLine(line);
    if (cache.size >= PARSE_CACHE_MAX) {
      // Descartar la entrada menos usada recientemente (la primera del Map).
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(line, entry);
    return entry;
  };
}
