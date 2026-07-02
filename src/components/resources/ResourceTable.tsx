import { AlertTriangle, FileCode2, Pause, Pencil, Play, RefreshCw, RotateCcw, Scale3D, ScrollText, Search, SquareTerminal, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { KubeItem, ResourceConfig, TabSession } from "../../app/types";
import { age, nameOf } from "../../resources/helpers";

export function ResourceTable({
  tab,
  config,
  filter,
  onFilterChange,
  onRefresh,
  onSelect,
  onTogglePodSelection,
  onSetPodSelection,
  onDescribe,
  onYaml,
  onLogs,
  onEdit,
  onDelete,
  onRestart,
  onScale,
  onTrigger,
  onSuspend
}: {
  tab: TabSession;
  config: ResourceConfig;
  filter: string;
  onFilterChange: (value: string) => void;
  onRefresh: () => void;
  onSelect: (name: string) => void;
  onTogglePodSelection: (name: string) => void;
  onSetPodSelection: (names: string[], checked: boolean) => void;
  onDescribe: () => void;
  onYaml: () => void;
  onLogs: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestart: () => void;
  onScale: () => void;
  onTrigger: () => void;
  onSuspend: () => void;
}) {
  const selected = Boolean(tab.selectedName);
  const busy = tab.loading;
  const isPodTable = config.key === "pods";
  const selectedPodSet = useMemo(() => new Set(isPodTable ? tab.selectedNames : []), [isPodTable, tab.selectedNames]);
  const multiPodSelection = isPodTable && selectedPodSet.size > 1;
  const restartEnabled = isPodTable ? selected || selectedPodSet.size > 0 : selected;
  const singleActionEnabled = selected && !multiPodSelection;
  const selectedRow = tab.rows.find((item) => nameOf(item) === tab.selectedName);
  const cronSuspended = Boolean((selectedRow?.spec as { suspend?: boolean })?.suspend);
  const loadError = tab.outputTitle.startsWith("Error") && tab.output.trim();
  const selectAllRef = useRef<HTMLInputElement>(null);
  const needle = filter.trim().toLowerCase();
  const filteredRows = useMemo(() => {
    if (!needle) return tab.rows;
    return tab.rows.filter((item) => {
      const haystack = [
        nameOf(item),
        ...config.columns.map((column) => {
          const value = column.getter(item);
          return typeof value === "string" || typeof value === "number" ? String(value) : "";
        })
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [tab.rows, config.columns, needle]);
  const filteredPodNames = useMemo(() => (isPodTable ? filteredRows.map(nameOf).filter(Boolean) : []), [filteredRows, isPodTable]);
  const visibleSelectedCount = filteredPodNames.filter((name) => selectedPodSet.has(name)).length;
  const allVisiblePodsSelected = filteredPodNames.length > 0 && visibleSelectedCount === filteredPodNames.length;
  const someVisiblePodsSelected = visibleSelectedCount > 0 && !allVisiblePodsSelected;
  const countText = needle ? `${filteredRows.length} de ${tab.rows.length} recursos` : `${tab.rows.length} recursos`;
  const selectionText = isPodTable && selectedPodSet.size > 0 ? ` · ${selectedPodSet.size} seleccionados` : "";

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someVisiblePodsSelected;
  }, [someVisiblePodsSelected]);

  return (
    <div className="table-panel">
      <div className="panel-title">
        <div>
          <h1>{config.label}</h1>
          <p>{countText}{selectionText}</p>
        </div>
        <div className="button-row">
          <button className="toolbar-button" onClick={onRefresh} disabled={busy}>
            <RefreshCw size={16} />
            Refrescar
          </button>
          <button className="toolbar-button" onClick={onDescribe} disabled={!singleActionEnabled || busy}>
            <ScrollText size={16} />
            Describir
          </button>
          <button className="toolbar-button" onClick={onYaml} disabled={!singleActionEnabled || busy}>
            <FileCode2 size={16} />
            YAML
          </button>
          {config.key === "pods" && (
            <button className="toolbar-button" onClick={onLogs} disabled={!singleActionEnabled || busy}>
              <SquareTerminal size={16} />
              Logs
            </button>
          )}
          {config.key === "cronjobs" && (
            <button className="toolbar-button" onClick={onTrigger} disabled={!singleActionEnabled || busy}>
              <Play size={16} />
              Ejecutar
            </button>
          )}
          {config.key === "cronjobs" && (
            <button className="toolbar-button" onClick={onSuspend} disabled={!singleActionEnabled || busy}>
              <Pause size={16} />
              {cronSuspended ? "Reanudar" : "Suspender"}
            </button>
          )}
          {(config.key === "pods" || config.key === "deployments" || config.key === "statefulsets" || config.key === "daemonsets") && (
            <button className="toolbar-button" onClick={onRestart} disabled={!restartEnabled || busy}>
              <RotateCcw size={16} />
              {isPodTable && selectedPodSet.size > 1 ? `Reiniciar (${selectedPodSet.size})` : "Reiniciar"}
            </button>
          )}
          {(config.key === "deployments" || config.key === "statefulsets" || config.key === "replicasets") && (
            <button className="toolbar-button" onClick={onScale} disabled={!singleActionEnabled || busy}>
              <Scale3D size={16} />
              Escalar
            </button>
          )}
          {config.editable !== false && (
            <button className="toolbar-button" onClick={onEdit} disabled={!singleActionEnabled || busy}>
              <Pencil size={16} />
              Editar
            </button>
          )}
          <button className="toolbar-button danger" onClick={onDelete} disabled={!singleActionEnabled || busy}>
            <Trash2 size={16} />
            Eliminar
          </button>
        </div>
      </div>
      <div className="table-filter">
        <Search size={15} />
        <input
          type="text"
          value={filter}
          placeholder={`Filtrar ${config.label.toLowerCase()}...`}
          onChange={(event) => onFilterChange(event.target.value)}
        />
        {filter && (
          <button className="table-filter-clear" title="Limpiar" onClick={() => onFilterChange("")}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className={`resource-table-body ${selectedRow && !multiPodSelection ? "with-inspector" : ""}`}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isPodTable && (
                  <th className="selection-cell">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisiblePodsSelected}
                      disabled={busy || !filteredPodNames.length}
                      title="Seleccionar pods visibles"
                      onChange={(event) => onSetPodSelection(filteredPodNames, event.target.checked)}
                    />
                  </th>
                )}
                {config.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => {
                const name = nameOf(item);
                const checked = selectedPodSet.has(name);
                return (
                  <tr
                    key={name}
                    className={`${tab.selectedName === name ? "selected" : ""}${checked ? " checked" : ""}`}
                    onClick={() => onSelect(name)}
                  >
                    {isPodTable && (
                      <td className="selection-cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={busy}
                          title={`Seleccionar ${name}`}
                          onChange={() => onTogglePodSelection(name)}
                        />
                      </td>
                    )}
                    {config.columns.map((column) => (
                      <td key={column.key}>{renderTableCell(column.key, column.getter(item))}</td>
                    ))}
                  </tr>
                );
              })}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={config.columns.length + (isPodTable ? 1 : 0)} className="empty-state">
                    {loadError ? (
                      <div className="table-error">
                        <AlertTriangle size={22} />
                        <strong>No se pudieron cargar {config.label}</strong>
                        <pre>{tab.output}</pre>
                        {tab.lastCommand && <code>{tab.lastCommand}</code>}
                        <button className="toolbar-button" onClick={onRefresh}>
                          <RefreshCw size={16} />
                          Reintentar
                        </button>
                      </div>
                    ) : (
                      <div className="empty-state-box">
                        <span>{tab.loading ? "Cargando..." : needle ? "Sin coincidencias" : `No hay ${config.label} para mostrar.`}</span>
                        {!tab.loading && (
                          <button className="toolbar-button" onClick={onRefresh}>
                            <RefreshCw size={16} />
                            Reintentar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {selectedRow && !multiPodSelection && (
          <ResourceInspector
            item={selectedRow}
            config={config}
            onDescribe={onDescribe}
            onYaml={onYaml}
            onLogs={onLogs}
          />
        )}
      </div>
    </div>
  );
}

function ResourceInspector({
  item,
  config,
  onDescribe,
  onYaml,
  onLogs
}: {
  item: KubeItem;
  config: ResourceConfig;
  onDescribe: () => void;
  onYaml: () => void;
  onLogs: () => void;
}) {
  const labels = Object.entries(item.metadata?.labels ?? {});
  const statusColumn = config.columns.find((column) => column.key === "status");
  const status = statusColumn?.getter(item);
  return (
    <aside className="resource-inspector">
      <div>
        <span className="inspector-eyebrow">{config.label}</span>
        <h2>{nameOf(item)}</h2>
      </div>
      <dl>
        {item.metadata?.namespace && (
          <>
            <dt>Namespace</dt>
            <dd>{item.metadata.namespace}</dd>
          </>
        )}
        {status && (
          <>
            <dt>Estado</dt>
            <dd>{renderTableCell("status", status)}</dd>
          </>
        )}
        <dt>Edad</dt>
        <dd>{age(item.metadata?.creationTimestamp)}</dd>
        <dt>Labels</dt>
        <dd>{labels.length}</dd>
      </dl>
      {labels.length > 0 && (
        <div className="label-chip-list">
          {labels.slice(0, 8).map(([key, value]) => (
            <span key={key}>{key}={value}</span>
          ))}
          {labels.length > 8 && <span>+{labels.length - 8}</span>}
        </div>
      )}
      <div className="inspector-actions">
        <button className="toolbar-button" onClick={onDescribe}>
          <ScrollText size={16} />
          Describir
        </button>
        <button className="toolbar-button" onClick={onYaml}>
          <FileCode2 size={16} />
          YAML
        </button>
        {config.key === "pods" && (
          <button className="toolbar-button" onClick={onLogs}>
            <SquareTerminal size={16} />
            Logs
          </button>
        )}
      </div>
    </aside>
  );
}

function renderTableCell(columnKey: string, value: string) {
  if (columnKey === "status" || columnKey === "suspend") {
    return <span className={`resource-badge ${resourceBadgeClass(value)}`}>{value}</span>;
  }
  return value;
}

function resourceBadgeClass(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === "running" || normalized === "bound" || normalized === "active" || normalized === "no") return "ok";
  if (normalized === "pending" || normalized === "unknown" || normalized === "si" || normalized === "sí") return "warn";
  if (normalized === "failed" || normalized === "error" || normalized === "terminating") return "bad";
  if (normalized === "succeeded" || normalized === "completed") return "done";
  return "neutral";
}

