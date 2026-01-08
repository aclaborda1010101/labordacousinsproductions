import { AlertTriangle, RefreshCw, WifiOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackendStatus } from '@/hooks/useBackendStatus';
import { cn } from '@/lib/utils';

interface BackendStatusBannerProps {
  status: BackendStatus;
  lastError: string | null;
  isChecking: boolean;
  onRetry: () => void;
}

export function BackendStatusBanner({ 
  status, 
  lastError, 
  isChecking, 
  onRetry 
}: BackendStatusBannerProps) {
  if (status === 'online') return null;
  
  const isDegraded = status === 'degraded';
  const isOffline = status === 'offline';
  
  return (
    <div 
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2 text-sm border-b",
        isDegraded && "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        isOffline && "bg-destructive/10 text-destructive border-destructive/20"
      )}
    >
      {isOffline ? (
        <WifiOff className="h-4 w-4 flex-shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      )}
      
      <span className="font-medium">
        {isOffline 
          ? 'Sin conexión al servidor' 
          : 'Conexión lenta con el servidor'
        }
      </span>
      
      <span className="text-xs opacity-70 hidden sm:inline">
        — {lastError || 'Los datos pueden no estar actualizados'}
      </span>
      
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetry}
        disabled={isChecking}
        className="ml-2 h-7 px-2 text-xs"
      >
        {isChecking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <>
            <RefreshCw className="h-3 w-3 mr-1" />
            Reintentar
          </>
        )}
      </Button>
    </div>
  );
}
