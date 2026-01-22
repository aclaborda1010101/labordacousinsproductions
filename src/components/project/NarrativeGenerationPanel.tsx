/**
 * NarrativeGenerationPanel - UI component for the new Narrative System
 * 
 * Shows real-time progress of scene generation via the narrative-decide + scene-worker flow.
 * Integrates with useNarrativeGeneration hook.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Sparkles, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Play, 
  Square,
  RefreshCw,
  ChevronDown,
  Zap,
  Brain
} from 'lucide-react';
import { useNarrativeGeneration, SceneIntent } from '@/hooks/useNarrativeGeneration';
import { cn } from '@/lib/utils';

interface NarrativeGenerationPanelProps {
  projectId: string;
  outline: any;
  episodeNumber?: number;
  language?: string;
  qualityTier?: string;
  format?: 'film' | 'series' | 'ad';
  onComplete?: () => void;
}

export function NarrativeGenerationPanel({
  projectId,
  outline,
  episodeNumber = 1,
  language = 'es-ES',
  qualityTier = 'profesional',
  format = 'series',
  onComplete,
}: NarrativeGenerationPanelProps) {
  const [showIntents, setShowIntents] = useState(false);

  const {
    narrativeState,
    sceneIntents,
    progress,
    progressPercentage,
    isGenerating,
    startGeneration,
    cancelGeneration,
    resetNarrativeState,
  } = useNarrativeGeneration({
    projectId,
    onComplete,
    onSceneGenerated: (scene) => {
      console.log('[NarrativePanel] Scene generated:', scene.scene_number);
    },
    onError: (error) => {
      console.error('[NarrativePanel] Error:', error);
    },
  });

  const handleStart = () => {
    startGeneration({
      outline,
      episodeNumber,
      language,
      qualityTier,
      format,
    });
  };

  const getStatusIcon = (status: SceneIntent['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'writing':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'written':
      case 'validated':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: SceneIntent['status']) => {
    const variants: Record<SceneIntent['status'], { className: string; label: string }> = {
      pending: { className: 'bg-muted text-muted-foreground', label: 'Pendiente' },
      planning: { className: 'bg-blue-500/20 text-blue-600', label: 'Planificando' },
      planned: { className: 'bg-blue-500/20 text-blue-600', label: 'Planificada' },
      writing: { className: 'bg-primary/20 text-primary', label: 'Escribiendo' },
      written: { className: 'bg-green-500/20 text-green-600', label: 'Escrita' },
      needs_repair: { className: 'bg-amber-500/20 text-amber-600', label: 'Reparando' },
      repairing: { className: 'bg-amber-500/20 text-amber-600', label: 'Reparando...' },
      validated: { className: 'bg-green-600/20 text-green-700', label: 'Validada ✓' },
      rejected: { className: 'bg-destructive/20 text-destructive', label: 'Rechazada' },
      failed: { className: 'bg-destructive/20 text-destructive', label: 'Error' },
    };
    const v = variants[status];
    return <Badge className={cn('text-xs', v.className)}>{v.label}</Badge>;
  };

  const phaseLabels: Record<string, string> = {
    idle: 'Listo para generar',
    planning: 'Planificando escenas...',
    generating: 'Generando escenas...',
    completed: '¡Completado!',
    failed: 'Error en generación',
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Sistema Narrativo</CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            v70
          </Badge>
        </div>
        <CardDescription>
          Generación inteligente con persistencia y contexto narrativo
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {phaseLabels[progress.phase] || progress.phase}
            </span>
            <span className="font-medium">
              {progress.completedScenes}/{progress.totalScenes} escenas
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {/* Narrative State Summary */}
        {narrativeState && (
          <div className="p-3 bg-muted/50 rounded-lg space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Fase:</span>
              <Badge variant="outline">{narrativeState.current_phase}</Badge>
            </div>
            {narrativeState.narrative_goal && (
              <div className="text-muted-foreground">
                <span className="font-medium">Objetivo: </span>
                {narrativeState.narrative_goal}
              </div>
            )}
            {narrativeState.active_threads?.length > 0 && (
              <div className="text-muted-foreground">
                <span className="font-medium">Hilos activos: </span>
                {narrativeState.active_threads.length}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {progress.error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            {progress.error}
          </div>
        )}

        {/* Scene Intents List */}
        {sceneIntents.length > 0 && (
          <Collapsible open={showIntents} onOpenChange={setShowIntents}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span>Ver intenciones de escena ({sceneIntents.length})</span>
                <ChevronDown className={cn(
                  "h-4 w-4 transition-transform",
                  showIntents && "rotate-180"
                )} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ScrollArea className="h-48 mt-2">
                <div className="space-y-2">
                  {sceneIntents.map((intent) => (
                    <div
                      key={intent.id}
                      className="flex items-start gap-3 p-2 bg-muted/30 rounded text-sm"
                    >
                      {getStatusIcon(intent.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            Ep{intent.episode_number} - Escena {intent.scene_number}
                          </span>
                          {getStatusBadge(intent.status)}
                        </div>
                        <p className="text-muted-foreground truncate">
                          {intent.intent_summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {!isGenerating && progress.phase !== 'completed' && (
            <Button onClick={handleStart} className="flex-1">
              <Sparkles className="h-4 w-4 mr-2" />
              Iniciar Generación
            </Button>
          )}

          {isGenerating && (
            <Button onClick={cancelGeneration} variant="destructive" className="flex-1">
              <Square className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
          )}

          {progress.phase === 'completed' && (
            <Button onClick={handleStart} variant="outline" className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              Generar Más
            </Button>
          )}

          {(progress.phase === 'failed' || sceneIntents.length > 0) && (
            <Button onClick={resetNarrativeState} variant="ghost" size="icon">
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default NarrativeGenerationPanel;
