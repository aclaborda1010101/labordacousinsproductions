import React, { Suspense, ComponentType } from 'react';

interface LazyLoaderProps {
  children: React.ReactNode;
  fallback?: React.ComponentType;
  className?: string;
}

const DefaultFallback = () => (
  <div className="flex items-center justify-center p-8">
    <div className="flex flex-col items-center space-y-2">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-muted-foreground">Cargando componente...</span>
    </div>
  </div>
);

export const LazyLoader: React.FC<LazyLoaderProps> = ({ 
  children, 
  fallback: Fallback = DefaultFallback,
  className = ''
}) => {
  return (
    <div className={className}>
      <Suspense fallback={<Fallback />}>
        {children}
      </Suspense>
    </div>
  );
};

// Higher Order Component para crear lazy components con mejor UX
export const createLazyComponent = <T extends Record<string, any>>(
  importFn: () => Promise<{ default: ComponentType<T> }>,
  displayName?: string
) => {
  const LazyComponent = React.lazy(importFn);
  LazyComponent.displayName = displayName || 'LazyComponent';
  
  return React.forwardRef<any, T>((props, ref) => (
    <LazyLoader>
      <LazyComponent {...props} ref={ref} />
    </LazyLoader>
  ));
};

// Hook para preload de rutas
export const useRoutePreloader = () => {
  const preloadRoute = React.useCallback((routeImport: () => Promise<any>) => {
    // Preload en idle time
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        routeImport().catch(() => {
          // Silently handle preload errors
        });
      });
    } else {
      // Fallback para browsers sin requestIdleCallback
      setTimeout(() => {
        routeImport().catch(() => {
          // Silently handle preload errors
        });
      }, 100);
    }
  }, []);

  return { preloadRoute };
};