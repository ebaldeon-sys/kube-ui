import {
  Box,
  Briefcase,
  Clock,
  Copy,
  Database,
  FileCode2,
  FileCog,
  FolderTree,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  Rocket,
  Server,
  SquareTerminal,
  type LucideIcon
} from "lucide-react";
import { memo } from "react";
import type { ResourceKey, ViewMode } from "../../app/types";
import { RESOURCE_CATEGORIES, configByKey } from "../../config/resources";

const RESOURCE_VIEW_MODES: ViewMode[] = ["table", "details", "yaml", "apply"];

// Icono por tipo de recurso para escanear la navegacion mas rapido.
const RESOURCE_ICONS: Record<ResourceKey, LucideIcon> = {
  pods: Box,
  deployments: Rocket,
  statefulsets: Database,
  daemonsets: Layers,
  replicasets: Copy,
  cronjobs: Clock,
  jobs: Briefcase,
  horizontalpodautoscalers: Gauge,
  services: Network,
  ingress: Globe,
  configmaps: FileCog,
  secrets: KeyRound,
  persistentvolumeclaims: HardDrive,
  namespaces: FolderTree,
  nodes: Server
};

type Props = {
  activeResource: ResourceKey | undefined;
  viewMode: ViewMode;
  onSelectResource: (key: ResourceKey) => void;
  onTerminal: () => void;
  onApplyYaml: () => void;
};

export const Sidebar = memo(function Sidebar({ activeResource, viewMode, onSelectResource, onTerminal, onApplyYaml }: Props) {
  const resourceActive = RESOURCE_VIEW_MODES.includes(viewMode);
  return (
    <aside className="sidebar">
      <div className="resource-list">
        {RESOURCE_CATEGORIES.map((category) => (
          <div key={category.label} className="resource-group">
            <span className="resource-group-title">{category.label}</span>
            {category.keys.map((key) => {
              const config = configByKey[key];
              const Icon = RESOURCE_ICONS[config.key];
              return (
                <button
                  key={config.key}
                  className={activeResource === config.key && resourceActive ? "active" : ""}
                  title={config.label}
                  onClick={() => onSelectResource(config.key)}
                >
                  <Icon size={16} />
                  <span className="nav-label">{config.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="side-actions">
        <button className={viewMode === "terminal" ? "active" : ""} title="Terminal" onClick={onTerminal}>
          <SquareTerminal size={16} />
          <span className="nav-label">Terminal</span>
        </button>
        <button className={viewMode === "apply" ? "active" : ""} title="Aplicar YAML" onClick={onApplyYaml}>
          <FileCode2 size={16} />
          <span className="nav-label">Aplicar YAML</span>
        </button>
      </div>
    </aside>
  );
});
