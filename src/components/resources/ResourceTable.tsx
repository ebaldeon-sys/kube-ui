import {
  AlertTriangle,
  FileCode2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Scale3D,
  ScrollText,
  Search,
  SquareTerminal,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TABLE_OVERSCAN, TABLE_ROW_H } from "../../app/constants";
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

  // Virtualizacion vertical: solo montamos las filas visibles del scroll, con
  // filas espaciadoras arriba/abajo que reservan el alto del resto. table-layout
  // fijo (ver colgroup) mantiene las columnas estables aunque cambie la ventana.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(600);
  const total = filteredRows.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / TABLE_ROW_H) - TABLE_OVERSCAN);
  const endIndex = Math.min(total, Math.ceil((scrollTop + viewportH) / TABLE_ROW_H) + TABLE_OVERSCAN);
  const topPad = startIndex * TABLE_ROW_H;
  const bottomPad = Math.max(0, (total - endIndex) * TABLE_ROW_H);
  const windowRows = filteredRows.slice(startIndex, endIndex);
  const columnCount = config.columns.length + (isPodTable ? 1 : 0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportH(el.clientHeight));
    observer.observe(el);
    setViewportH(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  // Al cambiar el filtro o el kind, volvemos arriba para no quedar en un scroll
  // fuera de rango del nuevo conjunto de filas.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [needle, config.key, tab.id]);

  return (
    <div className="table-panel">
      <div className="panel-title">
        <div>
          <h1>{config.label}</h1>
          <p>
            {countText}
            {selectionText}
          </p>
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
        <div className="table-wrap" ref={scrollRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
          <table className="virtual-table">
            <colgroup>
              {isPodTable && <col className="col-selection" />}
              {config.columns.map((column, index) => (
                <col key={column.key} className={index === 0 ? "col-primary" : undefined} />
              ))}
            </colgroup>
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
              {total > 0 && topPad > 0 && (
                <tr className="v-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: topPad }} />
                </tr>
              )}
              {windowRows.map((item) => {
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
                    {config.columns.map((column) => {
                      const value = column.getter(item);
                      const isBadge = column.key === "status" || column.key === "suspend";
                      return (
                        <td key={column.key} className={isBadge ? "cell-badge" : undefined} title={cellTitle(column.key, value)}>
                          {renderTableCell(column.key, value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {total > 0 && bottomPad > 0 && (
                <tr className="v-spacer" aria-hidden="true">
                  <td colSpan={columnCount} style={{ height: bottomPad }} />
                </tr>
              )}
              {!filteredRows.length && (
                <tr>
                  <td colSpan={columnCount} className="empty-state">
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
          <ResourceInspector item={selectedRow} config={config} onDescribe={onDescribe} onYaml={onYaml} onLogs={onLogs} />
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
            <span key={key}>
              {key}={value}
            </span>
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

// Tooltip para celdas de texto que pueden truncarse (las de estado son badges cortas).
function cellTitle(columnKey: string, value: string): string | undefined {
  if (columnKey === "status" || columnKey === "suspend") return undefined;
  return value || undefined;
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
