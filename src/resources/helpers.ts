import type { KubeItem } from "../app/types";

export function nameOf(item: KubeItem) {
  return item.metadata?.name ?? "";
}

export function stringAt(value: unknown) {
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export function numberAt(value: unknown) {
  if (typeof value !== "number") return 0;
  return value;
}

export function readyContainers(item: KubeItem) {
  const statuses = (item.status as { containerStatuses?: Array<{ ready?: boolean }> })?.containerStatuses ?? [];
  return `${statuses.filter((status) => status.ready).length}/${statuses.length}`;
}

export function restartCount(item: KubeItem) {
  const statuses = (item.status as { containerStatuses?: Array<{ restartCount?: number }> })?.containerStatuses ?? [];
  return String(statuses.reduce((total, status) => total + (status.restartCount ?? 0), 0));
}

export function ports(item: KubeItem) {
  const servicePorts = (item.spec as { ports?: Array<{ port?: number; targetPort?: number | string; protocol?: string }> })?.ports ?? [];
  return servicePorts.map((port) => `${port.port}:${port.targetPort ?? "-"}${port.protocol ? `/${port.protocol}` : ""}`).join(", ") || "-";
}

export function ingressHosts(item: KubeItem) {
  const rules = (item.spec as { rules?: Array<{ host?: string }> })?.rules ?? [];
  return (
    rules
      .map((rule) => rule.host)
      .filter(Boolean)
      .join(", ") || "-"
  );
}

export function nodeReady(item: KubeItem) {
  const conditions = (item.status as { conditions?: Array<{ type?: string; status?: string }> })?.conditions ?? [];
  return conditions.find((condition) => condition.type === "Ready")?.status === "True" ? "Ready" : "NotReady";
}

export function nodeRoles(item: KubeItem) {
  const labels = item.metadata?.labels ?? {};
  const roles = Object.keys(labels)
    .filter((key) => key.startsWith("node-role.kubernetes.io/"))
    .map((key) => key.replace("node-role.kubernetes.io/", ""))
    .filter(Boolean);
  return roles.join(", ") || "worker";
}

export function age(timestamp?: string) {
  if (!timestamp) return "-";
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
