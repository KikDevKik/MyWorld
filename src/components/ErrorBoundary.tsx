import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-full w-full
                        text-red-400 bg-black/50 rounded-lg p-4 text-sm">
          ⚠️ Este módulo encontró un error. Recarga la página.
        </div>
      );
    }
    return this.props.children;
  }
}
