import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Etiqueta opcional para identificar la seccion protegida en el mensaje. */
  label?: string;
  /** Contenido alternativo a renderizar en caso de error. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Evita que un error de render (p. ej. una linea de log malformada) tumbe toda
 * la app a pantalla blanca. Captura el error, lo muestra y permite reintentar.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="error-boundary" role="alert">
        <h2>Algo salio mal</h2>
        <p>{this.props.label ? `Ocurrio un error en ${this.props.label}.` : "Ocurrio un error inesperado."}</p>
        <pre className="error-boundary-detail">{error.message}</pre>
        <button className="toolbar-button primary" onClick={this.reset} type="button">
          Reintentar
        </button>
      </div>
    );
  }
}
