/**
 * OutlineStatusPanel - Real-time visibility into outline generation status
 * Shows outline_id, status, stage, substage, progress, heartbeat
 * Provides actions: retry refresh, continue in background, force unlock
 */

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Activity, 
  RefreshCw, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  Unlock,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Server
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { toast } from 'sonner';
import type { PersistedOutline } from '@/hooks/useOutlinePersistence';

interface OutlineStatusPanelProps {
  outline: PersistedOutline | null;
  projectId: string;
  isPolling: boolean;
  isStuck: boolean;
  stuckSince: Date | null;
  onRefresh: () => Promise<any>;
  onContinueInBackground?: () => void;
  onForceUnlockSuccess?: () => void;
  compact?: boolean;
}

export default function OutlineStatusPanel({
  outline,
  projectId,
  isPolling,
  isStuck,
  stuckSince,
  onRefresh,
  onContinueInBackground,
  onForceUnlockSuccess,
  compact = false
}: OutlineStatusPanelProps) {
  const [isOpen, setIsOpen] = useState(!compact);
  const [refreshing, setRefreshing] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
      toast.success('Estado actualizado');
    } catch (e) {
      toast.error('Error al refrescar');
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const handleForceUnlock = useCallback(async () => {
    setUnlocking(true);
    try {
      const { data, error } = await invokeAuthedFunction('force-unlock-project', { projectId });
      
      if (error) {
        toast.error(String(error) || 'Error al desbloquear');
        return;
      }
      
      const result = data as { success?: boolean; unlocked?: boolean; message?: string; error?: string } | null;
      
      if (result?.success && result?.unlocked) {
        toast.success(result.message || 'Proyecto desbloqueado');
        onForceUnlockSuccess?.();
      } else if (result?.success && !result?.unlocked) {
        toast.info(result.message || 'No hay bloqueo que liberar');
      } else {
        toast.error(result?.error || 'Error al desbloquear');
      }
    } catch (e: any) {
      toast.error(e.message || 'Error al desbloquear');
    } finally {
      setUnlocking(false);
    }
  }, [projectId, onForceUnlockSuccess]);

  // Status icon and color
  const getStatusDisplay = () => {
    if (!outline) return { icon: <Server className="h-4 w-4" />, color: 'bg-muted', text: 'Sin datos' };
    
    switch (outline.status) {
      case 'completed':
      case 'approved':
        return { icon: <CheckCircle className="h-4 w-4" />, color: 'bg-green-500/20 text-green-600', text: outline.status };
      case 'generating':
      case 'queued':
        return { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: 'bg-blue-500/20 text-blue-600', text: outline.status };
      case 'error':
      case 'failed':
      case 'timeout':
        return { icon: <XCircle className="h-4 w-4" />, color: 'bg-red-500/20 text-red-600', text: outline.status };
      case 'stalled':
        return { icon: <AlertTriangle className="h-4 w-4" />, color: 'bg-yellow-500/20 text-yellow-600', text: 'stalled' };
      default:
        return { icon: <Activity className="h-4 w-4" />, color: 'bg-muted', text: outline.status };
    }
  };

  const statusDisplay = getStatusDisplay();

  // Calculate heartbeat age
  const getHeartbeatAge = () => {
    if (!outline?.heartbeat_at) return null;
    try {
      return formatDistanceToNow(new Date(outline.heartbeat_at), { addSuffix: true, locale: es });
    } catch {
      return null;
    }
  };

  const heartbeatAge = getHeartbeatAge();

  if (compact) {
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between text-xs">
            <span className="flex items-center gap-2">
              {statusDisplay.icon}
              <span>Estado: {statusDisplay.text}</span>
              {outline?.progress != null && (
                <span className="text-muted-foreground">({outline.progress}%)</span>
              )}
            </span>
            {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pt-2 space-y-2 text-xs">
            {outline && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="text-[10px] bg-muted px-1 rounded">{outline.id.slice(0, 8)}...</code>
                </div>
                {outline.stage && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Etapa:</span>
                    <Badge variant="outline" className="text-[10px]">
                      {outline.stage}{outline.substage ? ` / ${outline.substage}` : ''}
                    </Badge>
                  </div>
                )}
                {heartbeatAge && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Último heartbeat:</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {heartbeatAge}
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-2 pt-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1 h-7 text-xs"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                <span className="ml-1">Refrescar</span>
              </Button>
              {isStuck && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="flex-1 h-7 text-xs"
                  onClick={handleForceUnlock}
                  disabled={unlocking}
                >
                  {unlocking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                  <span className="ml-1">Desbloquear</span>
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Estado del Outline
          </span>
          <Badge className={statusDisplay.color}>
            {statusDisplay.icon}
            <span className="ml-1">{statusDisplay.text}</span>
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {outline ? (
          <>
            {/* Progress bar */}
            {outline.progress != null && outline.status === 'generating' && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Progreso</span>
                  <span>{outline.progress}%</span>
                </div>
                <Progress value={outline.progress} className="h-2" />
              </div>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">ID:</span>
                <code className="ml-1 bg-muted px-1 rounded text-[10px]">{outline.id.slice(0, 12)}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Calidad:</span>
                <span className="ml-1">{outline.quality || '-'}</span>
              </div>
              {outline.stage && (
                <div>
                  <span className="text-muted-foreground">Etapa:</span>
                  <Badge variant="outline" className="ml-1 text-[10px]">{outline.stage}</Badge>
                </div>
              )}
              {outline.substage && (
                <div>
                  <span className="text-muted-foreground">Subetapa:</span>
                  <Badge variant="secondary" className="ml-1 text-[10px]">{outline.substage}</Badge>
                </div>
              )}
            </div>

            {/* Heartbeat */}
            {heartbeatAge && (
              <div className="flex items-center gap-2 text-xs">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Último heartbeat:</span>
                <span className={isStuck ? 'text-yellow-600 font-medium' : ''}>{heartbeatAge}</span>
              </div>
            )}

            {/* Stuck warning */}
            {isStuck && stuckSince && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-xs">
                <div className="flex items-center gap-2 text-yellow-600 font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Proceso posiblemente atascado</span>
                </div>
                <p className="text-muted-foreground mt-1">
                  Sin actividad desde {formatDistanceToNow(stuckSince, { locale: es })}
                </p>
              </div>
            )}

            {/* Error message */}
            {outline.error_message && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-600">
                {outline.error_message}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            No hay outline cargado
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Refrescar</span>
          </Button>
          
          {onContinueInBackground && isPolling && (
            <Button 
              variant="secondary" 
              size="sm" 
              className="flex-1"
              onClick={onContinueInBackground}
            >
              Continuar en segundo plano
            </Button>
          )}
          
          {(isStuck || outline?.status === 'stalled') && (
            <Button 
              variant="destructive" 
              size="sm" 
              className="flex-1"
              onClick={handleForceUnlock}
              disabled={unlocking}
            >
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              <span className="ml-2">Desbloquear</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
