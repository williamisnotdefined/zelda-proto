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
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#120f16',
          color: '#f6f1e8',
          padding: 24,
          fontFamily: 'monospace',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 14,
            background: 'rgba(0,0,0,0.35)',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <h1 style={{ margin: '0 0 12px', fontSize: 24 }}>Algo deu errado</h1>
          <p style={{ margin: 0, lineHeight: 1.5, color: '#d6d0c7' }}>
            O erro foi registrado. Recarregue o jogo para tentar novamente.
          </p>
        </div>
      </div>
    );
  }
}
