// Mock del puente window.kubeui para el harness de preview (navegador, sin
// Electron ni kubectl reales). Enruta las llamadas por sus args y devuelve datos
// falsos deterministas, para poder desarrollar/verificar la UI y tomar capturas.
//
// No se incluye en el bundle de produccion: solo lo carga src/preview.tsx a
// traves de preview.html. Ver README/preview para uso.
import type { KubeItem } from "../app/types";
import type { kubeuiApi } from "../types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

// --- Generadores de recursos -------------------------------------------------

const POD_PHASES = ["Running", "Running", "Running", "Pending", "Failed", "Succeeded"];
const APPS = ["api", "web", "worker", "checkout", "auth", "billing", "search", "notifier", "gateway", "cache"];

function makePods(count: number): KubeItem[] {
  return Array.from({ length: count }, (_, i) => {
    const app = pick(APPS, i);
    const phase = pick(POD_PHASES, i * 3 + 1);
    const ready = phase === "Running";
    const containers = i % 4 === 0 ? ["app", "sidecar"] : ["app"];
    return {
      metadata: {
        name: `${app}-${(7000 + i * 137).toString(36)}-${(i * 31 + 11).toString(36)}`,
        namespace: "default",
        creationTimestamp: ago((i + 1) * 7 * MINUTE),
        labels: { app, tier: i % 2 ? "backend" : "frontend", "pod-template-hash": (i * 997).toString(16) }
      },
      spec: { containers: containers.map((name) => ({ name })) },
      status: {
        phase,
        containerStatuses: containers.map((_, c) => ({
          ready,
          restartCount: (i + c) % 5 === 0 ? (i % 7) + 1 : 0
        }))
      }
    };
  });
}

function makeDeployments(count: number): KubeItem[] {
  return Array.from({ length: count }, (_, i) => {
    const replicas = (i % 4) + 1;
    const ready = i % 6 === 0 ? Math.max(0, replicas - 1) : replicas;
    return {
      metadata: {
        name: `${pick(APPS, i)}-deploy`,
        namespace: "default",
        creationTimestamp: ago((i + 2) * 3 * HOUR),
        labels: { app: pick(APPS, i) }
      },
      spec: { replicas },
      status: { replicas, readyReplicas: ready, updatedReplicas: replicas, availableReplicas: ready }
    };
  });
}

function makeServices(count: number): KubeItem[] {
  const types = ["ClusterIP", "ClusterIP", "NodePort", "LoadBalancer"];
  return Array.from({ length: count }, (_, i) => ({
    metadata: { name: `${pick(APPS, i)}-svc`, namespace: "default", creationTimestamp: ago((i + 1) * 5 * HOUR) },
    spec: {
      type: pick(types, i),
      clusterIP: `10.96.${i}.${(i * 7) % 255}`,
      ports: [{ port: 80, targetPort: 8080, protocol: "TCP" }]
    }
  }));
}

function makeCronJobs(count: number): KubeItem[] {
  return Array.from({ length: count }, (_, i) => ({
    metadata: { name: `${pick(APPS, i)}-cron`, namespace: "default", creationTimestamp: ago((i + 1) * DAY) },
    spec: { schedule: pick(["*/5 * * * *", "0 * * * *", "0 0 * * *"], i), suspend: i % 3 === 0 },
    status: { active: i % 4 === 0 ? [{}] : [], lastScheduleTime: ago((i + 1) * 20 * MINUTE) }
  }));
}

function makeNamespaces(): KubeItem[] {
  return ["default", "kube-system", "kube-public", "monitoring", "ingress-nginx"].map((name, i) => ({
    metadata: { name, creationTimestamp: ago((i + 1) * 12 * DAY) },
    status: { phase: "Active" }
  }));
}

function makeNodes(): KubeItem[] {
  return Array.from({ length: 3 }, (_, i) => ({
    metadata: {
      name: `node-${i + 1}`,
      creationTimestamp: ago((i + 30) * DAY),
      labels: (i === 0 ? { "node-role.kubernetes.io/control-plane": "" } : {}) as Record<string, string>
    },
    status: {
      conditions: [{ type: "Ready", status: "True" }],
      nodeInfo: { kubeletVersion: "v1.29.4" }
    }
  }));
}

function makeGeneric(kind: string, count: number): KubeItem[] {
  return Array.from({ length: count }, (_, i) => ({
    metadata: { name: `${kind}-${i + 1}`, namespace: "default", creationTimestamp: ago((i + 1) * 2 * HOUR) },
    spec: {},
    status: {}
  }));
}

const RESOURCES: Record<string, KubeItem[]> = {
  pods: makePods(64),
  deployments: makeDeployments(9),
  statefulsets: makeGeneric("sts", 4),
  daemonsets: makeGeneric("ds", 3),
  replicasets: makeGeneric("rs", 12),
  cronjobs: makeCronJobs(6),
  jobs: makeGeneric("job", 5),
  services: makeServices(8),
  ingress: makeGeneric("ing", 3),
  configmaps: makeGeneric("cm", 15),
  secrets: makeGeneric("secret", 7),
  persistentvolumeclaims: makeGeneric("pvc", 4),
  horizontalpodautoscalers: makeGeneric("hpa", 3),
  namespaces: makeNamespaces(),
  nodes: makeNodes()
};

// --- Logs de muestra ---------------------------------------------------------

const LOG_LEVELS = ["INFO", "INFO", "INFO", "DEBUG", "WARN", "ERROR", "TRACE"];
const LOG_MESSAGES = [
  "request completed",
  "connection established to upstream",
  "cache miss, fetching from origin",
  "slow query detected",
  "failed to reach downstream service",
  "retrying with backoff",
  "config reloaded",
  "worker picked up job"
];

function makeLogLine(i: number): string {
  const level = pick(LOG_LEVELS, i * 3 + 1);
  const payload = {
    "@timestamp": new Date(Date.now() - (200 - i) * 137).toISOString(),
    level,
    logger: pick(["http", "db", "worker", "cache"], i),
    message: `${pick(LOG_MESSAGES, i)} (#${i})`,
    latency_ms: (i * 13) % 400
  };
  return JSON.stringify(payload);
}

// --- API mock ----------------------------------------------------------------

function ok(stdout: string, command: string) {
  return { ok: true, code: 0, stdout, stderr: "", command };
}

const CONTEXTS = ["docker-desktop", "staging-eks", "prod-gke"];

export function installKubeuiMock(): void {
  const api: kubeuiApi = {
    getSettings: async () => ({ kubeconfigPaths: ["/Users/dev/.kube/config"], pathDelimiter: ":" }),
    addKubeconfigs: async () => ({ kubeconfigPaths: ["/Users/dev/.kube/config"] }),
    removeKubeconfig: async () => ({ kubeconfigPaths: [] }),
    inspectKubeconfigs: async () => [
      { path: "/Users/dev/.kube/config", exists: true, contexts: CONTEXTS, ok: true, command: "kubectl config get-contexts" }
    ],
    revealKubeconfig: async () => true,
    runKubectl: async (request) => {
      const args = request.args ?? [];
      const command = `kubectl ${args.join(" ")}`;
      if (args[0] === "version") return ok("Client Version: v1.29.4\nKustomize Version: v5.0.4", command);
      if (args[0] === "config" && args[1] === "view") {
        const contexts = CONTEXTS.map((name) => ({ name, context: { namespace: "default" } }));
        return ok(JSON.stringify({ contexts }), command);
      }
      if (args[0] === "get") {
        const kind = args[1];
        const items = RESOURCES[kind] ?? [];
        return ok(JSON.stringify({ items }), command);
      }
      return ok("", command);
    },
    runManualKubectl: async (request) => ok(`(mock) salida de: ${request.command}`, request.command),
    applyYaml: async () => ok("configured (mock)", "kubectl apply"),
    replaceYaml: async () => ok("replaced (mock)", "kubectl replace"),
    pickYamlFile: async () => null,
    writeClipboard: async () => true,
    streamKubectl: (_request, handlers) => {
      // Emite un lote inicial de logs y luego "en vivo" cada 700ms hasta detener.
      let i = 0;
      let stopped = false;
      const initial = Array.from({ length: 200 }, (_, k) => makeLogLine(k)).join("\n") + "\n";
      i = 200;
      const boot = window.setTimeout(() => {
        if (stopped) return;
        handlers.onData(initial);
      }, 120);
      const timer = window.setInterval(() => {
        if (stopped) return;
        handlers.onData(makeLogLine(i++) + "\n");
      }, 700);
      return () => {
        stopped = true;
        window.clearTimeout(boot);
        window.clearInterval(timer);
        handlers.onEnd({ code: 0, command: "kubectl logs -f (mock)" });
      };
    }
  };

  (window as unknown as { kubeui: kubeuiApi }).kubeui = api;
}
