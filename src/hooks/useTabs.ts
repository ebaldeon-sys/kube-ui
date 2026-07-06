import { useCallback, useMemo, useRef, useState } from "react";
import type { TabSession, ViewMode } from "../app/types";

export function useTabs() {
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [fallbackViewMode, setFallbackViewMode] = useState<ViewMode>("table");

  // Espejo del id activo para evitar stale closures: un callback async que
  // comenzo antes de un cambio de pestaña debe actuar sobre la pestaña vigente,
  // no sobre la capturada al crear el closure.
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);
  const viewMode: ViewMode = activeTab?.viewMode ?? fallbackViewMode;

  const updateActiveTab = useCallback((patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabIdRef.current ? { ...tab, ...patch } : tab)));
  }, []);

  const updateTab = useCallback((tabId: string, patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      if (activeTab) updateActiveTab({ viewMode: mode });
      else setFallbackViewMode(mode);
    },
    [activeTab, updateActiveTab]
  );

  return {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    viewMode,
    updateActiveTab,
    updateTab,
    setViewMode
  };
}
