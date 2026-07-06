import { describe, expect, it } from "vitest";
import { age, nameOf, nodeReady, nodeRoles, ports, readyContainers, restartCount } from "./helpers";

describe("nameOf", () => {
  it("devuelve el nombre o cadena vacia", () => {
    expect(nameOf({ metadata: { name: "pod-1" } })).toBe("pod-1");
    expect(nameOf({})).toBe("");
  });
});

describe("readyContainers", () => {
  it("cuenta contenedores listos sobre el total", () => {
    expect(readyContainers({ status: { containerStatuses: [{ ready: true }, { ready: false }] } })).toBe("1/2");
    expect(readyContainers({})).toBe("0/0");
  });
});

describe("restartCount", () => {
  it("suma los reinicios de todos los contenedores", () => {
    expect(restartCount({ status: { containerStatuses: [{ restartCount: 2 }, { restartCount: 3 }] } })).toBe("5");
  });
});

describe("ports", () => {
  it("formatea puertos de servicio", () => {
    expect(ports({ spec: { ports: [{ port: 80, targetPort: 8080, protocol: "TCP" }] } })).toBe("80:8080/TCP");
    expect(ports({})).toBe("-");
  });
});

describe("nodeReady / nodeRoles", () => {
  it("interpreta condicion Ready", () => {
    expect(nodeReady({ status: { conditions: [{ type: "Ready", status: "True" }] } })).toBe("Ready");
    expect(nodeReady({ status: { conditions: [{ type: "Ready", status: "False" }] } })).toBe("NotReady");
  });

  it("extrae roles de las labels o cae en worker", () => {
    expect(nodeRoles({ metadata: { labels: { "node-role.kubernetes.io/control-plane": "" } } })).toBe("control-plane");
    expect(nodeRoles({ metadata: { labels: {} } })).toBe("worker");
  });
});

describe("age", () => {
  it("devuelve guion sin timestamp", () => {
    expect(age(undefined)).toBe("-");
  });

  it("formatea minutos, horas y dias", () => {
    const now = Date.now();
    expect(age(new Date(now - 5 * 60_000).toISOString())).toBe("5m");
    expect(age(new Date(now - 3 * 3_600_000).toISOString())).toBe("3h");
    expect(age(new Date(now - 5 * 86_400_000).toISOString())).toBe("5d");
  });
});
