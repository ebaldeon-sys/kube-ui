import { describe, expect, it } from "vitest";
import { buildLogsArgs, capLines, lineEpoch, podContainerNames, resolveLogContainer } from "./logs";

describe("capLines", () => {
  it("no trunca cuando hay menos lineas que el tope", () => {
    expect(capLines("a\nb\nc", 5)).toEqual({ text: "a\nb\nc", truncated: false });
  });

  it("conserva las ultimas N lineas al truncar", () => {
    const result = capLines("a\nb\nc\nd", 2);
    expect(result.truncated).toBe(true);
    expect(result.text).toBe("c\nd");
  });
});

describe("lineEpoch", () => {
  it("extrae el timestamp RFC3339 al inicio de la linea", () => {
    const epoch = lineEpoch("2024-01-02T03:04:05Z hola mundo");
    expect(epoch).toBe(Date.parse("2024-01-02T03:04:05Z"));
  });

  it("devuelve null cuando no hay timestamp", () => {
    expect(lineEpoch("linea sin fecha")).toBeNull();
  });
});

describe("buildLogsArgs", () => {
  it("modo live con since usa -f y --since", () => {
    const { args, follow } = buildLogsArgs("pod-1", { mode: "live", since: "5m", start: "", end: "" });
    expect(follow).toBe(true);
    expect(args).toContain("-f");
    expect(args).toContain("--since=5m");
    expect(args[args.length - 1]).toBe("pod-1");
  });

  it("modo live sin since no hace follow", () => {
    const { args, follow } = buildLogsArgs("pod-1", { mode: "live", since: "", start: "", end: "" });
    expect(follow).toBe(false);
    expect(args).not.toContain("-f");
  });

  it("modo query aplica --tail y no hace follow", () => {
    const { args, follow } = buildLogsArgs("pod-1", { mode: "query", since: "1h", start: "", end: "" });
    expect(follow).toBe(false);
    expect(args.some((a) => a.startsWith("--tail="))).toBe(true);
    expect(args).toContain("--since=1h");
  });

  it("usa -c cuando se pide un contenedor concreto", () => {
    const { args } = buildLogsArgs("pod-1", { mode: "live", since: "", start: "", end: "", container: "app" });
    expect(args).toContain("-c");
    expect(args).toContain("app");
  });
});

describe("podContainerNames", () => {
  it("junta containers, init y ephemeral sin duplicar", () => {
    const names = podContainerNames({
      spec: {
        containers: [{ name: "app" }, { name: "app" }],
        initContainers: [{ name: "init" }]
      }
    });
    expect(names).toEqual(["app", "init"]);
  });
});

describe("resolveLogContainer", () => {
  it("devuelve cadena vacia con un solo contenedor", () => {
    expect(resolveLogContainer({ spec: { containers: [{ name: "app" }] } }, "app")).toBe("");
  });

  it("respeta el contenedor pedido si existe", () => {
    const item = { spec: { containers: [{ name: "app" }, { name: "sidecar" }] } };
    expect(resolveLogContainer(item, "sidecar")).toBe("sidecar");
  });
});
