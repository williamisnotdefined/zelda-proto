import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureReactError } from './errorLogger';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    captureReactError(error, info.componentStack ?? undefined);
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#120f16] px-6 py-6 font-mono text-[#f6f1e8]">
        <div className="max-w-[420px] rounded-[14px] border border-[rgba(255,255,255,0.15)] bg-[rgba(0,0,0,0.35)] p-6 text-center">
          <h1 className="mb-3 text-2xl">Algo deu errado</h1>
          <p className="m-0 leading-6 text-[#d6d0c7]">
            O erro foi registrado. Recarregue o jogo para tentar novamente.
          </p>
        </div>
      </div>
    );
  }
}
