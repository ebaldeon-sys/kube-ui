import { ChevronDown, Copy, RefreshCw } from "lucide-react";

type Props = {
  context: string;
  contexts: string[];
  namespaceDraft: string;
  namespaces: string[];
  sessionLocked: boolean;
  loading: boolean;
  lastCommand: string;
  onContextChange: (context: string) => void;
  onNamespaceInput: (value: string) => void;
  onNamespaceCommit: () => void;
  onRefresh: () => void;
  onCopyCommand: () => void;
};

export function SessionBar({
  context,
  contexts,
  namespaceDraft,
  namespaces,
  sessionLocked,
  loading,
  lastCommand,
  onContextChange,
  onNamespaceInput,
  onNamespaceCommit,
  onRefresh,
  onCopyCommand
}: Props) {
  return (
    <div className={`session-bar ${sessionLocked ? "locked" : ""}`}>
      <label>
        Contexto
        <span className="select-wrap">
          <select
            value={context}
            disabled={sessionLocked}
            title={sessionLocked ? "Disponible solo en la vista de listado" : "Cambiar contexto"}
            onChange={(event) => {
              if (sessionLocked) return;
              onContextChange(event.target.value);
            }}
          >
            {contexts.map((ctx) => (
              <option key={ctx} value={ctx}>
                {ctx}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </span>
      </label>
      <label>
        Namespace
        <span className="select-wrap">
          <input
            list="namespace-options"
            value={namespaceDraft}
            placeholder="default"
            disabled={sessionLocked}
            title={sessionLocked ? "Disponible solo en la vista de listado" : "Cambiar namespace"}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              if (sessionLocked) return;
              onNamespaceInput(event.target.value);
            }}
            onKeyDown={(event) => {
              if (sessionLocked) return;
              if (event.key === "Enter") {
                event.preventDefault();
                onNamespaceCommit();
              }
            }}
            onBlur={() => {
              if (!sessionLocked) onNamespaceCommit();
            }}
          />
          <ChevronDown size={15} />
          <datalist id="namespace-options">
            {namespaces.map((namespace) => (
              <option key={namespace} value={namespace} />
            ))}
          </datalist>
        </span>
      </label>
      <button
        className="toolbar-button"
        title={sessionLocked ? "Disponible solo en la vista de listado" : "Refrescar listado"}
        onClick={onRefresh}
        disabled={loading || sessionLocked}
      >
        <RefreshCw size={16} />
        Refrescar
      </button>
      <code>{lastCommand || "kubectl --context ..."}</code>
      <button className="icon-button" title="Copiar comando" onClick={onCopyCommand} disabled={!lastCommand}>
        <Copy size={16} />
      </button>
    </div>
  );
}
