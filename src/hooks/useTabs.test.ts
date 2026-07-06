import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTab } from "../app/createTab";
import { useTabs } from "./useTabs";

describe("useTabs", () => {
  it("sin pestañas usa el viewMode de respaldo", () => {
    const { result } = renderHook(() => useTabs());
    expect(result.current.activeTab).toBeUndefined();
    expect(result.current.viewMode).toBe("table");
    act(() => result.current.setViewMode("settings"));
    expect(result.current.viewMode).toBe("settings");
  });

  it("updateActiveTab modifica solo la pestaña activa", () => {
    const { result } = renderHook(() => useTabs());
    const a = createTab("ctx-a", "ns");
    const b = createTab("ctx-b", "ns");
    act(() => {
      result.current.setTabs([a, b]);
      result.current.setActiveTabId(a.id);
    });
    expect(result.current.activeTab?.id).toBe(a.id);
    act(() => result.current.updateActiveTab({ namespace: "otro" }));
    expect(result.current.tabs.find((t) => t.id === a.id)?.namespace).toBe("otro");
    expect(result.current.tabs.find((t) => t.id === b.id)?.namespace).toBe("ns");
  });

  it("setViewMode con pestaña activa actualiza su viewMode", () => {
    const { result } = renderHook(() => useTabs());
    const tab = createTab("ctx");
    act(() => {
      result.current.setTabs([tab]);
      result.current.setActiveTabId(tab.id);
    });
    act(() => result.current.setViewMode("logs"));
    expect(result.current.activeTab?.viewMode).toBe("logs");
    expect(result.current.viewMode).toBe("logs");
  });
});
