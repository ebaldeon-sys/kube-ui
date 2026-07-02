import { useCallback, useMemo, useState } from "react";
import type { TabSession, ViewMode } from "../app/types";

export function useTabs() {
  const [tabs, setTabs] = useState<TabSession[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [fallbackViewMode, setFallbackViewMode] = useState<ViewMode>("table");

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [activeTabId, tabs]);
  const viewMode: ViewMode = activeTab?.viewMode ?? fallbackViewMode;

  const updateActiveTab = useCallback((patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)));
  }, [activeTabId]);

  const updateTab = useCallback((tabId: string, patch: Partial<TabSession>) => {
    setTabs((current) => current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab)));
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    if (activeTab) updateActiveTab({ viewMode: mode });
    else setFallbackViewMode(mode);
  }, [activeTab, updateActiveTab]);

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
