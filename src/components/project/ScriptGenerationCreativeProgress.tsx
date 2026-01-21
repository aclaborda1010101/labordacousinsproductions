/**
 * ScriptGenerationCreativeProgress - UX-optimized progress for Hollywood pipeline
 * Shows creative progress (episodes/acts/scenes) instead of raw call counts
 * Implements P2: UX Progress + Streaming delivery
 * 
 * P2.1 IMPROVEMENTS:
 * - Scene objectives displayed ("Elena escapes but leaves evidence")
 * - Quality badges (Hollywood vs Standard)
 * - Model tier indicator
 */

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  Film,
  Clapperboard,
  FileText,
  Pen,
  CheckCircle,
  Loader2,
  Clock,
  Zap,
  AlertTriangle,
  Eye,
  BellRing,
  Shield,
  Sparkles,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export interface ActProgress {
  actNumber: number;
  progress: number; // 0-100
  scenesCompleted: number;
  scenesTotal: number;
  currentScene?: string;
}

export interface EpisodeProgress {
  episodeNumber: number;
  title?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  acts: ActProgress[];
  overallProgress: number;
}

export interface CreativeProgressState {
  projectTitle: string;
  format: 'film' | 'series';
  currentEpisode: number;
  totalEpisodes: number;
  episodes: EpisodeProgress[];
  currentScene: string;
  currentSceneObjective?: string; // P2.1: Scene objective
  currentPhase: 'bible' | 'outline' | 'scene_cards' | 'script' | 'polish';
  elapsedSeconds: number;
  estimatedRemainingMinutes: number;
  driftWarnings: number;
  rescuePasses: number;
  streamingContent?: string;
  // P2.1: Quality indicators
  currentModelTier?: 'hollywood' | 'professional' | 'fast';
  currentModelReason?: string;
  qaScore?: number;
}

export interface ScriptGenerationCreativeProgressProps {
  state: CreativeProgressState;
  isActive: boolean;
  onContinueBackground: () => void;
  onCancel: () => void;
  onViewContent?: () => void;
  showStreaming?: boolean;
  className?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatElapsed(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getPhaseLabel(phase: CreativeProgressState['currentPhase']): string {
  switch (phase) {
    case 'bible': return 'Construyendo universo';
    case 'outline': return 'Diseñando estructura';
    case 'scene_cards': return 'Planificando escenas';
    case 'script': return 'Escribiendo guion';
    case 'polish': return 'Puliendo estilo';
    default: return 'Procesando';
  }
}

function getPhaseIcon(phase: CreativeProgressState['currentPhase']) {
  switch (phase) {
    case 'bible': return Film;
    case 'outline': return Clapperboard;
    case 'scene_cards': return FileText;
    case 'script': return Pen;
    case 'polish': return Zap;
    default: return Loader2;
  }
}

function getModelTierBadge(tier?: CreativeProgressState['currentModelTier'], reason?: string) {
  if (!tier) return null;
  
  switch (tier) {
    case 'hollywood':
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1">
          <Sparkles className="w-3 h-3" />
          Hollywood
          {reason && <span className="text-xs opacity-70">({reason})</span>}
        </Badge>
      );
    case 'professional':
      return (
        <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 gap-1">
          <Shield className="w-3 h-3" />
          Pro
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
          Standard
        </Badge>
      );
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ScriptGenerationCreativeProgress({
  state,
  isActive,
  onContinueBackground,
  onCancel,
  onViewContent,
  showStreaming = false,
  className
}: ScriptGenerationCreativeProgressProps) {
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(state.currentEpisode);

  useEffect(() => {
    setExpandedEpisode(state.currentEpisode);
  }, [state.currentEpisode]);

  if (!isActive) return null;

  const PhaseIcon = getPhaseIcon(state.currentPhase);
  const overallProgress = state.episodes.reduce((sum, ep) => sum + ep.overallProgress, 0) / state.totalEpisodes;

  return (
    <div className={cn(
      "rounded-xl border bg-card shadow-lg overflow-hidden",
      className
    )}>
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <PhaseIcon className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{state.projectTitle}</h3>
              <p className="text-sm text-muted-foreground">
                {getPhaseLabel(state.currentPhase)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* P2.1: Model tier badge */}
            {getModelTierBadge(state.currentModelTier, state.currentModelReason)}
            
            {/* QA Score indicator */}
            {state.qaScore !== undefined && (
              <Badge 
                variant="outline" 
                className={cn(
                  "gap-1",
                  state.qaScore >= 80 && "bg-green-500/10 text-green-600 border-green-500/30",
                  state.qaScore >= 60 && state.qaScore < 80 && "bg-amber-500/10 text-amber-600 border-amber-500/30",
                  state.qaScore < 60 && "bg-red-500/10 text-red-600 border-red-500/30"
                )}
              >
                QA: {state.qaScore}%
              </Badge>
            )}
            
            {state.driftWarnings > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {state.driftWarnings} correcciones
              </Badge>
            )}
            
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>{formatElapsed(state.elapsedSeconds)}</span>
              {state.estimatedRemainingMinutes > 0 && (
                <span className="text-xs">• ~{state.estimatedRemainingMinutes} min</span>
              )}
            </div>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">
              {state.format === 'series' 
                ? `Episodio ${state.currentEpisode} de ${state.totalEpisodes}`
                : `Progreso general`
              }
            </span>
            <span className="font-medium">{Math.round(overallProgress)}%</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
        </div>
      </div>

      {/* P2.1: Enhanced Current Scene Indicator with Objective */}
      {(state.currentScene || state.currentSceneObjective) && (
        <div className="px-4 py-3 bg-primary/5 border-b">
          <div className="flex items-start gap-2">
            <Pen className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm">
                <span className="text-muted-foreground">Escribiendo:</span>{' '}
                <span className="font-medium">{state.currentScene}</span>
              </div>
              {state.currentSceneObjective && (
                <div className="text-xs text-muted-foreground mt-0.5 italic">
                  "{state.currentSceneObjective}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Episodes/Acts Grid */}
      <div className="p-4 max-h-64 overflow-y-auto">
        {state.format === 'series' ? (
          <div className="space-y-3">
            {state.episodes.map((episode) => (
              <div 
                key={episode.episodeNumber}
                className={cn(
                  "rounded-lg border p-3 transition-all cursor-pointer hover:border-primary/30",
                  episode.status === 'generating' && "border-primary/50 bg-primary/5",
                  episode.status === 'completed' && "border-green-500/30 bg-green-500/5",
                  episode.status === 'failed' && "border-red-500/30 bg-red-500/5"
                )}
                onClick={() => setExpandedEpisode(
                  expandedEpisode === episode.episodeNumber ? null : episode.episodeNumber
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {episode.status === 'completed' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : episode.status === 'generating' ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin" />
                    ) : episode.status === 'failed' ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span className="font-medium text-sm">
                      Episodio {episode.episodeNumber}
                      {episode.title && `: ${episode.title}`}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(episode.overallProgress)}%
                  </span>
                </div>

                {expandedEpisode === episode.episodeNumber && episode.acts.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {episode.acts.map((act) => (
                      <div key={act.actNumber} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-12">
                          Acto {act.actNumber}
                        </span>
                        <Progress value={act.progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground w-16 text-right">
                          {act.scenesCompleted}/{act.scenesTotal}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // Film: Show 3 acts
          <div className="grid grid-cols-3 gap-3">
            {state.episodes[0]?.acts.map((act) => (
              <div 
                key={act.actNumber}
                className={cn(
                  "rounded-lg border p-3 text-center transition-all",
                  act.progress === 100 && "border-green-500/30 bg-green-500/5",
                  act.progress > 0 && act.progress < 100 && "border-primary/50 bg-primary/5"
                )}
              >
                <div className="text-xs text-muted-foreground mb-1">Acto {act.actNumber}</div>
                <div className="font-semibold text-lg">{Math.round(act.progress)}%</div>
                <Progress value={act.progress} className="h-1 mt-2" />
                <div className="text-xs text-muted-foreground mt-1">
                  {act.scenesCompleted}/{act.scenesTotal} escenas
                </div>
                {act.currentScene && (
                  <div className="text-xs text-primary mt-1 truncate">
                    {act.currentScene}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Streaming Preview */}
      {showStreaming && state.streamingContent && (
        <div className="px-4 pb-4">
          <div className="rounded-lg border bg-muted/30 p-3 max-h-40 overflow-y-auto font-mono text-xs whitespace-pre-wrap">
            {state.streamingContent}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t bg-muted/20 flex items-center justify-between gap-4">
        <Alert className="flex-1 bg-blue-500/5 border-blue-500/20 py-2">
          <BellRing className="h-4 w-4 text-blue-500" />
          <AlertDescription className="text-xs">
            Puedes navegar libremente — Te notificaremos cuando termine.
          </AlertDescription>
        </Alert>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onViewContent && (
            <Button variant="outline" size="sm" onClick={onViewContent}>
              <Eye className="w-4 h-4 mr-1" />
              Ver avance
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onContinueBackground}>
            Segundo plano
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// HOOK FOR STATE MANAGEMENT
// =============================================================================

export function useCreativeProgressState(
  format: 'film' | 'series',
  totalEpisodes: number,
  projectTitle: string
): [CreativeProgressState, (updates: Partial<CreativeProgressState>) => void] {
  const initialEpisodes: EpisodeProgress[] = Array.from({ length: totalEpisodes }, (_, i) => ({
    episodeNumber: i + 1,
    status: 'pending',
    acts: [
      { actNumber: 1, progress: 0, scenesCompleted: 0, scenesTotal: 0 },
      { actNumber: 2, progress: 0, scenesCompleted: 0, scenesTotal: 0 },
      { actNumber: 3, progress: 0, scenesCompleted: 0, scenesTotal: 0 },
    ],
    overallProgress: 0
  }));

  const [state, setState] = useState<CreativeProgressState>({
    projectTitle,
    format,
    currentEpisode: 1,
    totalEpisodes,
    episodes: initialEpisodes,
    currentScene: '',
    currentSceneObjective: undefined,
    currentPhase: 'bible',
    elapsedSeconds: 0,
    estimatedRemainingMinutes: 0,
    driftWarnings: 0,
    rescuePasses: 0,
    currentModelTier: undefined,
    currentModelReason: undefined,
    qaScore: undefined
  });

  const updateState = (updates: Partial<CreativeProgressState>) => {
    setState(prev => ({ ...prev, ...updates }));
  };

  return [state, updateState];
}
