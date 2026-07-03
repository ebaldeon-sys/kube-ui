import { FileCode2, SquareTerminal } from "lucide-react";
import type { ResourceKey, ViewMode } from "../../app/types";
import { RESOURCE_CATEGORIES, configByKey } from "../../config/resources";

const RESOURCE_VIEW_MODES: ViewMode[] = ["table", "details", "yaml", "apply"];

type Props = {
  activeResource: ResourceKey | undefined;
  viewMode: ViewMode;
  onSelectResource: (key: ResourceKey) => void;
  onTerminal: () => void;
  onApplyYaml: () => void;
};

export function Sidebar({ activeResource, viewMode, onSelectResource, onTerminal, onApplyYaml }: Props) {
  const resourceActive = RESOURCE_VIEW_MODES.includes(viewMode);
  return (
    <aside className="sidebar">
      <div className="resource-list">
        {RESOURCE_CATEGORIES.map((category) => (
          <div key={category.label} className="resource-group">
            <span className="resource-group-title">{category.label}</span>
            {category.keys.map((key) => {
              const config = configByKey[key];
              return (
                <button
                  key={config.key}
                  className={activeResource === config.key && resourceActive ? "active" : ""}
                  onClick={() => onSelectResource(config.key)}
                >
                  {config.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="side-actions">
        <button className={viewMode === "terminal" ? "active" : ""} onClick={onTerminal}>
          <SquareTerminal size={16} />
          Terminal
        </button>
        <button className={viewMode === "apply" ? "active" : ""} onClick={onApplyYaml}>
          <FileCode2 size={16} />
          Aplicar YAML
        </button>
      </div>
    </aside>
  );
}
