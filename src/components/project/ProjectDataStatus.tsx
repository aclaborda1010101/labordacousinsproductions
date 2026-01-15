/**
 * ProjectDataStatus - Shows the current state of project data (outline, script, entities)
 * Helps users understand what's in the backend and what actions are needed
 */

import { AlertCircle, CheckCircle2, Database, FileText, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ProjectDataStatusProps {
  hasOutline: boolean;
  hasPartialOutline?: boolean; // V5: Has data in outline_parts even if outline_json is empty
  outlineStatus?: string | null;
  outlineProgress?: number | null; // V6: Generation progress (0-100)
  outlineErrorCode?: string | null; // V6: Error code for paused generation
  hasScript: boolean;
  charactersCount: number;
  locationsCount: number;
  isLoading?: boolean;
  onRefresh?: () => void;
  onGenerateOutline?: () => void;
  onResumeGeneration?: () => void; // V5: Resume stalled generation
  onCreateNewAttempt?: () => void; // V6: Create new attempt (for MAX_ATTEMPTS_EXCEEDED)
}

export default function ProjectDataStatus({
  hasOutline,
  hasPartialOutline,
  outlineStatus,
  outlineProgress,
  outlineErrorCode,
  hasScript,
  charactersCount,
  locationsCount,
  isLoading,
  onRefresh,
  onGenerateOutline,
  onResumeGeneration,
  onCreateNewAttempt,
}: ProjectDataStatusProps) {
  const hasEntities = charactersCount > 0 || locationsCount > 0;
  const hasAnyData = hasOutline || hasScript || hasEntities;
  
  // V6: Check if outline has error_code indicating paused generation (even if status is "approved")
  const hasPartialProgress = outlineProgress != null && outlineProgress > 0 && outlineProgress < 100;
  const isPausedWithError = hasPartialProgress && !!outlineErrorCode;
  
  // If everything looks good AND no paused error, don't show status card
  if (hasOutline && (outlineStatus === 'completed' || outlineStatus === 'approved') && !isPausedWithError) {
    return null;
  }

  // Determine the primary message and action
  const getStatusInfo = () => {
    if (isLoading) {
      return {
        icon: RefreshCw,
        iconClass: 'animate-spin text-muted-foreground',
        title: 'Cargando datos del proyecto...',
        description: null,
        action: null,
        variant: 'muted' as const,
      };
    }

    // V6: Handle paused generation with error (even if status is "approved")
    // This catches inconsistent states where status=approved but generation actually failed
    if (isPausedWithError) {
      const isMaxAttempts = outlineErrorCode === 'MAX_ATTEMPTS_EXCEEDED';
      return {
        icon: AlertCircle,
        iconClass: 'text-amber-500',
        title: 'Generación pausada',
        description: `Progreso: ${Math.round(outlineProgress || 0)}%. ${isMaxAttempts ? 'Máximo de intentos alcanzado.' : 'Hay datos parciales disponibles.'}`,
        action: (
          <div className="flex gap-2 flex-wrap">
            {isMaxAttempts && onCreateNewAttempt && (
              <Button size="sm" variant="default" onClick={onCreateNewAttempt}>
                Nuevo intento
              </Button>
            )}
            {!isMaxAttempts && onResumeGeneration && (
              <Button size="sm" variant="default" onClick={onResumeGeneration}>
                Continuar
              </Button>
            )}
            {onGenerateOutline && (
              <Button size="sm" variant="outline" onClick={onGenerateOutline}>
                Reiniciar
              </Button>
            )}
          </div>
        ),
        variant: 'warning' as const,
      };
    }

    // V5: Handle stalled status - show resume option
    if (outlineStatus === 'stalled' || outlineStatus === 'timeout') {
      return {
        icon: AlertCircle,
        iconClass: 'text-amber-500',
        title: 'Generación pausada',
        description: hasPartialOutline 
          ? 'La generación se pausó por timeout. Hay datos parciales disponibles.'
          : 'La generación se pausó. Puedes reintentar.',
        action: (
          <div className="flex gap-2">
            {onResumeGeneration && (
              <Button size="sm" variant="default" onClick={onResumeGeneration}>
                Reanudar
              </Button>
            )}
            {onGenerateOutline && (
              <Button size="sm" variant="outline" onClick={onGenerateOutline}>
                Regenerar
              </Button>
            )}
          </div>
        ),
        variant: 'warning' as const,
      };
    }

    if (!hasOutline && !hasPartialOutline) {
      return {
        icon: AlertCircle,
        iconClass: 'text-amber-500',
        title: 'No hay outline guardado',
        description: 'Genera un outline desde tu idea para comenzar.',
        action: onGenerateOutline ? (
          <Button size="sm" variant="default" onClick={onGenerateOutline}>
            Generar Outline
          </Button>
        ) : null,
        variant: 'warning' as const,
      };
    }

    // V5: Has partial outline but not complete - show partial status
    if (hasPartialOutline && !hasOutline) {
      return {
        icon: FileText,
        iconClass: 'text-amber-500',
        title: 'Outline parcial disponible',
        description: 'Hay datos generados pero el outline no está completo.',
        action: onResumeGeneration ? (
          <Button size="sm" variant="default" onClick={onResumeGeneration}>
            Continuar generación
          </Button>
        ) : onGenerateOutline ? (
          <Button size="sm" variant="default" onClick={onGenerateOutline}>
            Regenerar
          </Button>
        ) : null,
        variant: 'warning' as const,
      };
    }

    if (outlineStatus === 'generating' || outlineStatus === 'queued') {
      return {
        icon: RefreshCw,
        iconClass: 'animate-spin text-primary',
        title: 'Outline en generación...',
        description: 'El outline se está procesando en segundo plano.',
        action: null,
        variant: 'info' as const,
      };
    }

    if (outlineStatus === 'error' || outlineStatus === 'failed') {
      return {
        icon: AlertCircle,
        iconClass: 'text-destructive',
        title: 'Error en la generación',
        description: 'Hubo un problema generando el outline. Intenta de nuevo.',
        action: onGenerateOutline ? (
          <Button size="sm" variant="default" onClick={onGenerateOutline}>
            Reintentar
          </Button>
        ) : null,
        variant: 'error' as const,
      };
    }

    if (outlineStatus === 'draft') {
      return {
        icon: FileText,
        iconClass: 'text-amber-500',
        title: 'Outline en borrador',
        description: 'El outline no se completó. Puedes reintentar la generación.',
        action: onGenerateOutline ? (
          <Button size="sm" variant="default" onClick={onGenerateOutline}>
            Reintentar Generación
          </Button>
        ) : null,
        variant: 'warning' as const,
      };
    }

    return null;
  };

  const status = getStatusInfo();
  if (!status) return null;

  const borderColors = {
    muted: 'border-muted',
    warning: 'border-amber-500/50',
    error: 'border-destructive/50',
    info: 'border-primary/50',
  };

  const bgColors = {
    muted: 'bg-muted/20',
    warning: 'bg-amber-500/5',
    error: 'bg-destructive/5',
    info: 'bg-primary/5',
  };

  return (
    <Card className={`${borderColors[status.variant]} ${bgColors[status.variant]} mb-4`}>
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <status.icon className={`w-5 h-5 mt-0.5 shrink-0 ${status.iconClass}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-medium text-sm">{status.title}</h4>
              {onRefresh && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6" 
                  onClick={onRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
            {status.description && (
              <p className="text-xs text-muted-foreground mt-1">{status.description}</p>
            )}
            
            {/* Data summary badges */}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Badge variant={hasOutline ? 'default' : 'outline'} className="text-xs">
                <FileText className="w-3 h-3 mr-1" />
                Outline: {hasOutline ? (outlineStatus || 'existe') : 'ninguno'}
              </Badge>
              <Badge variant={hasScript ? 'default' : 'outline'} className="text-xs">
                <Database className="w-3 h-3 mr-1" />
                Script: {hasScript ? 'sí' : 'no'}
              </Badge>
              <Badge variant={hasEntities ? 'default' : 'outline'} className="text-xs">
                <Users className="w-3 h-3 mr-1" />
                Personajes: {charactersCount}
              </Badge>
            </div>
          </div>
          
          {status.action && (
            <div className="shrink-0">
              {status.action}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
