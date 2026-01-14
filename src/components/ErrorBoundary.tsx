import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home, Bug, Sparkles } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isNoOutlineError: boolean;
}

// Helper to detect NO_OUTLINE_FOUND errors - checks all possible formats
function isNoOutlineFoundError(error: Error | null): boolean {
  if (!error) return false;
  
  const msg = error.message?.toLowerCase() || '';
  const stack = error.stack?.toLowerCase() || '';
  const errorStr = JSON.stringify(error).toLowerCase();
  
  // Check direct message/stack
  if (msg.includes('no_outline_found') || msg.includes('no se encontró un outline')) return true;
  if (stack.includes('no_outline_found')) return true;
  
  // Check suggestedAction property
  if ((error as any)?.suggestedAction === 'generate_outline') return true;
  
  // Check nested context from Supabase function errors
  const context = (error as any)?.context;
  if (context?.status === 404 && context?.bodyJson?.error === 'NO_OUTLINE_FOUND') return true;
  
  // Check if stringified error contains the pattern
  if (errorStr.includes('no_outline_found')) return true;
  
  return false;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    isNoOutlineError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { 
      hasError: true, 
      error, 
      errorInfo: null,
      isNoOutlineError: isNoOutlineFoundError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    
    this.setState({ 
      errorInfo,
      isNoOutlineError: isNoOutlineFoundError(error),
    });
    
    // Call optional error handler
    this.props.onError?.(error, errorInfo);
    
    // Log to console with full stack
    console.error('Component Stack:', errorInfo.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, isNoOutlineError: false });
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  private handleGoToScript = () => {
    // Navigate to current project's script page to generate outline
    const path = window.location.pathname;
    const projectMatch = path.match(/\/projects\/([^/]+)/);
    if (projectMatch) {
      window.location.href = `/projects/${projectMatch[1]}/script`;
    } else {
      window.location.href = '/projects';
    }
  };

  private handleReportBug = () => {
    const { error, errorInfo } = this.state;
    const subject = encodeURIComponent(`Bug Report: ${error?.message || 'Unknown Error'}`);
    const body = encodeURIComponent(`
Error: ${error?.message}

Stack: ${error?.stack}

Component Stack: ${errorInfo?.componentStack}

URL: ${window.location.href}
Time: ${new Date().toISOString()}
    `);
    
    window.open(`mailto:support@example.com?subject=${subject}&body=${body}`);
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Special handling for NO_OUTLINE_FOUND errors
      if (this.state.isNoOutlineError) {
        return (
          <div className="min-h-screen flex items-center justify-center p-4 bg-background">
            <Card className="max-w-lg w-full">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-amber-500" />
                </div>
                <CardTitle>Necesitas un Outline</CardTitle>
                <CardDescription>
                  Para continuar, primero debes generar un outline desde tu idea. 
                  Esto creará la estructura narrativa de tu proyecto.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Action Buttons */}
                <div className="flex flex-col gap-2">
                  <Button onClick={this.handleGoToScript} className="w-full">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Ir a Generar Outline
                  </Button>
                  
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={this.handleRetry}
                      className="flex-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reintentar
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      onClick={this.handleGoHome}
                      className="flex-1"
                    >
                      <Home className="h-4 w-4 mr-2" />
                      Inicio
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-center text-muted-foreground">
                  Escribe tu idea en la pestaña "Guion" y pulsa "Generar Outline".
                </p>
              </CardContent>
            </Card>
          </div>
        );
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                An unexpected error occurred. Don't worry, your work is likely safe.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Error Details (collapsible in dev) */}
              {import.meta.env.DEV && this.state.error && (
                <details className="rounded-lg border p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-muted-foreground">
                    Technical Details
                  </summary>
                  <div className="mt-2 space-y-2">
                    <p className="font-mono text-xs text-destructive break-all">
                      {this.state.error.message}
                    </p>
                    <pre className="text-xs text-muted-foreground overflow-auto max-h-32 p-2 bg-muted rounded">
                      {this.state.error.stack}
                    </pre>
                  </div>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col gap-2">
                <Button onClick={this.handleRetry} className="w-full">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </Button>
                
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={this.handleGoHome}
                    className="flex-1"
                  >
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={this.handleReportBug}
                    className="flex-1"
                  >
                    <Bug className="h-4 w-4 mr-2" />
                    Report
                  </Button>
                </div>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                If this keeps happening, try refreshing the page or clearing your browser cache.
              </p>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to use error boundary
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return React.useCallback((err: Error) => {
    setError(err);
  }, []);
}

// HOC for adding error boundary to any component
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  };
}

export default ErrorBoundary;
