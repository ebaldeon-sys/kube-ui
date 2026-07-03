import { describe, expect, it } from "vitest";
import type { KubectlResult } from "../types";
import { formatKubectlCommand, isUnsupportedInteractiveCommand, kubectlErrorText, kubectlSuccessText, unknownMessage } from "./format";

const result = (patch: Partial<KubectlResult>): KubectlResult => ({
  ok: true,
  code: 0,
  stdout: "",
  stderr: "",
  command: "",
  ...patch
});

describe("formatKubectlCommand", () => {
  it("antepone context y namespace", () => {
    expect(formatKubectlCommand(["get", "pods"], "dev", "web")).toBe("kubectl --context dev -n web get pods");
  });

  it("no duplica flags presentes", () => {
    expect(formatKubectlCommand(["get", "pods", "-n", "kube-system"], "dev", "web")).toBe("kubectl --context dev get pods -n kube-system");
  });

  it("entrecomilla tokens con espacios", () => {
    expect(formatKubectlCommand(["get", "-l", "app=my app"])).toBe('kubectl get -l "app=my app"');
  });
});

describe("unknownMessage", () => {
  it("extrae message de Error y stringifica el resto", () => {
    expect(unknownMessage(new Error("boom"))).toBe("boom");
    expect(unknownMessage("texto")).toBe("texto");
  });
});

describe("kubectlSuccessText", () => {
  it("devuelve el cuerpo cuando hay salida", () => {
    expect(kubectlSuccessText(result({ stdout: "ok" }))).toBe("ok");
  });

  it("usa el fallback y anexa exit code sin salida", () => {
    expect(kubectlSuccessText(result({ stdout: "", code: 0 }))).toMatch(/Exit code: 0/);
  });
});

describe("kubectlErrorText", () => {
  it("prioriza stderr y adjunta el exit code", () => {
    expect(kubectlErrorText(result({ stderr: "fallo", code: 1 }), "fallback")).toBe("fallo\n\nExit code: 1");
  });
});

describe("isUnsupportedInteractiveCommand", () => {
  it("detecta exec/attach interactivos y port-forward", () => {
    expect(isUnsupportedInteractiveCommand("kubectl exec -it pod -- sh")).toBe(true);
    expect(isUnsupportedInteractiveCommand("kubectl port-forward svc/web 8080:80")).toBe(true);
  });

  it("permite comandos no interactivos", () => {
    expect(isUnsupportedInteractiveCommand("kubectl get pods")).toBe(false);
    expect(isUnsupportedInteractiveCommand("kubectl exec pod -- ls")).toBe(false);
  });
});
