import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, info);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-neutral-950 p-8">
          <div className="max-w-md text-center">
            <div className="mb-6 text-6xl">⚠️</div>
            <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-neutral-100">
              Algo salió mal
            </h1>
            <p className="mb-6 text-gray-600 dark:text-neutral-400">
              Ocurrió un error inesperado. Por favor intenta de nuevo.
            </p>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200">
                  Detalles del error
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-gray-100 dark:bg-neutral-800 p-3 text-xs text-red-600 dark:text-red-400">
                  {this.state.error.message}
                  {"\n"}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <button
              onClick={this.handleRetry}
              className="rounded-lg bg-accent px-6 py-3 text-white transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/60 focus:ring-offset-2"
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
