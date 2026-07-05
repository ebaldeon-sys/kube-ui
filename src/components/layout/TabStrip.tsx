import { Layers3, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import { memo, useRef } from "react";
import { MAX_TABS } from "../../app/constants";
import type { StreamOwner, TabRunState, TabSession } from "../../app/types";

function runStateText(state: TabRunState): string {
  if (state === "running") return "Ejecutando";
  if (state === "done") return "Terminado";
  if (state === "stopped") return "Detenido";
  if (state === "error") return "Error";
  return "Sin actividad";
}

type Props = {
  tabs: TabSession[];
  activeTabId: string;
  streamOwner: StreamOwner | null;
  sidebarPinned: boolean;
  hasContexts: boolean;
  onToggleSidebar: () => void;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onAddTab: () => void;
};

export const TabStrip = memo(function TabStrip({
  tabs,
  activeTabId,
  streamOwner,
  sidebarPinned,
  hasContexts,
  onToggleSidebar,
  onSelectTab,
  onCloseTab,
  onAddTab
}: Props) {
  const tabListRef = useRef<HTMLDivElement>(null);

  // Convertir el scroll vertical de la rueda en desplazamiento horizontal de las
  // pestañas (sin scrollbar visible, esto da una forma natural de navegarlas).
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const el = tabListRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) el.scrollLeft += event.deltaY;
  };

  return (
    <div className="tabstrip">
      <button
        className="sidebar-toggle"
        title={sidebarPinned ? "Colapsar el panel a iconos" : "Fijar el panel abierto"}
        aria-pressed={sidebarPinned}
        onClick={onToggleSidebar}
      >
        {sidebarPinned ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
      </button>
      <div className="tabstrip-tabs">
        <div className="tabstrip-tab-list" role="tablist" aria-label="Pestañas" ref={tabListRef} onWheel={onWheel}>
          {tabs.map((tab) => {
            const pinned = streamOwner?.tabId === tab.id && streamOwner.pinned;
            return (
              <div
                key={tab.id}
                className={`chrome-tab ${tab.id === activeTabId ? "active" : ""}`}
                role="tab"
                tabIndex={0}
                aria-selected={tab.id === activeTabId}
                aria-label={`Pestaña ${tab.title}`}
                onClick={() => onSelectTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectTab(tab.id);
                  }
                }}
              >
                <Layers3 size={15} />
                {tab.runState !== "idle" && (
                  <span
                    className={`tab-run-dot ${tab.runState}${pinned ? " pinned" : ""}`}
                    title={`${runStateText(tab.runState)}${tab.runLabel ? `: ${tab.runLabel}` : ""}${pinned ? " · fijado" : ""}`}
                  />
                )}
                <span>{tab.title}</span>
                {tabs.length > 1 && (
                  <X
                    size={14}
                    className="chrome-tab-close"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseTab(tab.id);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {tabs.length < MAX_TABS && (
          <button
            className="tabstrip-add"
            title={!hasContexts ? "Agrega un kubeconfig con contextos" : "Nueva pestaña"}
            onClick={onAddTab}
            disabled={!hasContexts}
          >
            <Plus size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
