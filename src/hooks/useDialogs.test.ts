import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useDialogs } from "./useDialogs";

describe("useDialogs", () => {
  it("requestConfirm abre el dialogo y resuelve con el valor elegido", async () => {
    const { result } = renderHook(() => useDialogs());
    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.requestConfirm("¿Seguro?");
    });
    expect(result.current.confirmDialog?.message).toBe("¿Seguro?");
    act(() => result.current.confirmDialog!.resolve(true));
    await expect(promise).resolves.toBe(true);
  });

  it("requestInput conserva el valor inicial y resuelve el ingresado", async () => {
    const { result } = renderHook(() => useDialogs());
    let promise!: Promise<string | null>;
    act(() => {
      promise = result.current.requestInput("Nombre", "def");
    });
    expect(result.current.inputDialog?.value).toBe("def");
    act(() => result.current.inputDialog!.resolve("abc"));
    await expect(promise).resolves.toBe("abc");
  });
});
