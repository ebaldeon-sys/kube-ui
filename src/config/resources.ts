import type { ResourceConfig, ResourceKey } from "../app/types";
import {
  age,
  ingressHosts,
  nameOf,
  nodeReady,
  nodeRoles,
  numberAt,
  ports,
  readyContainers,
  restartCount,
  stringAt
} from "../resources/helpers";

export const resourceConfigs: ResourceConfig[] = [
  {
    key: "pods",
    label: "Pods",
    kubectlName: "pods",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
      { key: "ready", label: "Ready", getter: (item) => readyContainers(item) },
      { key: "restarts", label: "Restarts", getter: (item) => restartCount(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "deployments",
    label: "Deployments",
    kubectlName: "deployments",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "ready", label: "Ready", getter: (item) => `${numberAt(item.status?.readyReplicas)}/${numberAt(item.status?.replicas)}` },
      { key: "updated", label: "Updated", getter: (item) => stringAt(item.status?.updatedReplicas) },
      { key: "available", label: "Available", getter: (item) => stringAt(item.status?.availableReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "statefulsets",
    label: "StatefulSets",
    kubectlName: "statefulsets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "ready", label: "Ready", getter: (item) => `${numberAt(item.status?.readyReplicas)}/${numberAt(item.status?.replicas)}` },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "daemonsets",
    label: "DaemonSets",
    kubectlName: "daemonsets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "desired", label: "Desired", getter: (item) => stringAt(item.status?.desiredNumberScheduled) },
      { key: "current", label: "Current", getter: (item) => stringAt(item.status?.currentNumberScheduled) },
      { key: "ready", label: "Ready", getter: (item) => stringAt(item.status?.numberReady) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "replicasets",
    label: "ReplicaSets",
    kubectlName: "replicasets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "desired", label: "Desired", getter: (item) => stringAt(item.spec?.replicas) },
      { key: "current", label: "Current", getter: (item) => stringAt(item.status?.replicas) },
      { key: "ready", label: "Ready", getter: (item) => stringAt(item.status?.readyReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "cronjobs",
    label: "CronJobs",
    kubectlName: "cronjobs",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "schedule", label: "Schedule", getter: (item) => stringAt(item.spec?.schedule) },
      { key: "suspend", label: "Suspendido", getter: (item) => ((item.spec as { suspend?: boolean })?.suspend ? "Sí" : "No") },
      { key: "active", label: "Activos", getter: (item) => String(((item.status as { active?: unknown[] })?.active ?? []).length) },
      {
        key: "lastSchedule",
        label: "Última ejec.",
        getter: (item) => age((item.status as { lastScheduleTime?: string })?.lastScheduleTime)
      },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "jobs",
    label: "Jobs",
    kubectlName: "jobs",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      {
        key: "completions",
        label: "Completions",
        getter: (item) => `${numberAt(item.status?.succeeded)}/${stringAt(item.spec?.completions)}`
      },
      { key: "active", label: "Activos", getter: (item) => stringAt(item.status?.active) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "services",
    label: "Services",
    kubectlName: "services",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "type", label: "Tipo", getter: (item) => stringAt(item.spec?.type) },
      { key: "clusterIp", label: "Cluster IP", getter: (item) => stringAt(item.spec?.clusterIP) },
      { key: "ports", label: "Puertos", getter: (item) => ports(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "configmaps",
    label: "ConfigMaps",
    kubectlName: "configmaps",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "keys", label: "Keys", getter: (item) => String(Object.keys((item as { data?: object }).data ?? {}).length) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "secrets",
    label: "Secrets",
    kubectlName: "secrets",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "type", label: "Tipo", getter: (item) => stringAt(item.type) },
      { key: "keys", label: "Keys", getter: (item) => String(Object.keys((item as { data?: object }).data ?? {}).length) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "ingress",
    label: "Ingress",
    kubectlName: "ingress",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "class", label: "Clase", getter: (item) => stringAt(item.spec?.ingressClassName) },
      { key: "hosts", label: "Hosts", getter: (item) => ingressHosts(item) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "persistentvolumeclaims",
    label: "PVCs",
    kubectlName: "persistentvolumeclaims",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
      { key: "volume", label: "Volumen", getter: (item) => stringAt(item.spec?.volumeName) },
      {
        key: "capacity",
        label: "Capacidad",
        getter: (item) => stringAt((item.status as { capacity?: { storage?: string } })?.capacity?.storage)
      },
      { key: "storageClass", label: "StorageClass", getter: (item) => stringAt(item.spec?.storageClassName) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "horizontalpodautoscalers",
    label: "HPAs",
    kubectlName: "horizontalpodautoscalers",
    namespaced: true,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      {
        key: "reference",
        label: "Referencia",
        getter: (item) => {
          const ref = (item.spec as { scaleTargetRef?: { kind?: string; name?: string } })?.scaleTargetRef;
          return ref?.name ? `${ref.kind}/${ref.name}` : "-";
        }
      },
      { key: "min", label: "Min", getter: (item) => stringAt(item.spec?.minReplicas) },
      { key: "max", label: "Max", getter: (item) => stringAt(item.spec?.maxReplicas) },
      { key: "replicas", label: "Réplicas", getter: (item) => stringAt(item.status?.currentReplicas) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "namespaces",
    label: "Namespaces",
    kubectlName: "namespaces",
    namespaced: false,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => stringAt(item.status?.phase) },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  },
  {
    key: "nodes",
    label: "Nodes",
    kubectlName: "nodes",
    namespaced: false,
    columns: [
      { key: "name", label: "Nombre", getter: nameOf },
      { key: "status", label: "Estado", getter: (item) => nodeReady(item) },
      { key: "role", label: "Rol", getter: (item) => nodeRoles(item) },
      {
        key: "version",
        label: "Versión",
        getter: (item) => stringAt((item.status as { nodeInfo?: { kubeletVersion?: string } })?.nodeInfo?.kubeletVersion)
      },
      { key: "age", label: "Edad", getter: (item) => age(item.metadata?.creationTimestamp) }
    ]
  }
];

export const configByKey = Object.fromEntries(resourceConfigs.map((config) => [config.key, config])) as Record<ResourceKey, ResourceConfig>;

export const RESOURCE_CATEGORIES: Array<{ label: string; keys: ResourceKey[] }> = [
  {
    label: "Workloads",
    keys: ["pods", "deployments", "statefulsets", "daemonsets", "replicasets", "cronjobs", "jobs", "horizontalpodautoscalers"]
  },
  { label: "Red", keys: ["services", "ingress"] },
  { label: "Configuración", keys: ["configmaps", "secrets"] },
  { label: "Almacenamiento", keys: ["persistentvolumeclaims"] },
  { label: "Cluster", keys: ["namespaces", "nodes"] }
];
