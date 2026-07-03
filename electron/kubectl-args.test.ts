import { describe, expect, it } from "vitest";
import { assertValidArgs, buildKubectlArgs, hasFlag, parseCommandLine, quoteForDisplay } from "./kubectl-args.js";

describe("parseCommandLine", () => {
  it("divide por espacios y descarta el prefijo kubectl", () => {
    expect(parseCommandLine("kubectl get pods")).toEqual(["get", "pods"]);
  });

  it("respeta comillas dobles y simples", () => {
    expect(parseCommandLine(`get pods -l "app=my api"`)).toEqual(["get", "pods", "-l", "app=my api"]);
    expect(parseCommandLine("get pods -l 'app=web'")).toEqual(["get", "pods", "-l", "app=web"]);
  });

  it("respeta escapes fuera de comillas simples", () => {
    expect(parseCommandLine("echo a\\ b")).toEqual(["echo", "a b"]);
  });

  it("lanza error ante comillas sin cerrar", () => {
    expect(() => parseCommandLine('get "pods')).toThrow(/comilla sin cerrar/i);
  });

  it("colapsa espacios multiples y bordes", () => {
    expect(parseCommandLine("  get    pods   ")).toEqual(["get", "pods"]);
  });
});

describe("buildKubectlArgs", () => {
  it("antepone --context y -n cuando no estan presentes", () => {
    expect(buildKubectlArgs({ args: ["get", "pods"], context: "dev", namespace: "web" })).toEqual([
      "--context",
      "dev",
      "-n",
      "web",
      "get",
      "pods"
    ]);
  });

  it("no duplica flags ya presentes en los args", () => {
    expect(buildKubectlArgs({ args: ["get", "pods", "-n", "kube-system"], context: "dev", namespace: "web" })).toEqual([
      "--context",
      "dev",
      "get",
      "pods",
      "-n",
      "kube-system"
    ]);
  });

  it("omite context/namespace cuando no se pasan", () => {
    expect(buildKubectlArgs({ args: ["version"] })).toEqual(["version"]);
  });
});

describe("hasFlag", () => {
  it("detecta forma separada y con igual", () => {
    expect(hasFlag(["--context", "dev"], "--context")).toBe(true);
    expect(hasFlag(["--context=dev"], "--context")).toBe(true);
    expect(hasFlag(["get"], "--context")).toBe(false);
  });
});

describe("quoteForDisplay", () => {
  it("no toca tokens seguros", () => {
    expect(quoteForDisplay("get")).toBe("get");
    expect(quoteForDisplay("app=web-1.2")).toBe("app=web-1.2");
  });

  it("entrecomilla valores con espacios o caracteres especiales", () => {
    expect(quoteForDisplay("a b")).toBe('"a b"');
  });
});

describe("assertValidArgs", () => {
  it("acepta un arreglo de strings", () => {
    expect(() => assertValidArgs(["get", "pods"])).not.toThrow();
  });

  it("rechaza no-arreglos y elementos no-string", () => {
    expect(() => assertValidArgs("get pods")).toThrow();
    expect(() => assertValidArgs([1, 2])).toThrow();
  });

  it("rechaza demasiados argumentos", () => {
    expect(() => assertValidArgs(new Array(1000).fill("x"))).toThrow(/Demasiados/);
  });
});
