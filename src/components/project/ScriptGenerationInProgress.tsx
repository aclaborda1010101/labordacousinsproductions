import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Film, 
  Loader2, 
  Clock, 
  Zap,
  XCircle,
  Eye,
  Sparkles
} from 'lucide-react';

interface ScriptGenerationInProgressProps {
  currentEpisode: number | null;
  totalEpisodes: number;
  progress: number;
  elapsedSeconds: number;
  currentBatch?: number;
  totalBatches?: number;
  qualityTier?: 'rapido' | 'profesional' | 'hollywood';
  scenesGenerated?: number;
  onCancel: () => void;
  onViewPartial?: () => void;
  partialScenesCount?: number;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getTierLabel(tier?: string) {
  switch (tier) {
    case 'hollywood': return { emoji: '🎬', label: 'Hollywood', color: 'bg-amber-500/20 text-amber-600 border-amber-500/30' };
    case 'profesional': return { emoji: '🎯', label: 'Profesional', color: 'bg-primary/20 text-primary border-primary/30' };
    case 'rapido': return { emoji: '⚡', label: 'Rápido', color: 'bg-blue-500/20 text-blue-600 border-blue-500/30' };
    default: return { emoji: '🎯', label: 'Profesional', color: 'bg-primary/20 text-primary border-primary/30' };
  }
}

export function ScriptGenerationInProgress({
  currentEpisode,
  totalEpisodes,
  progress,
  elapsedSeconds,
  currentBatch,
  totalBatches,
  qualityTier,
  scenesGenerated,
  onCancel,
  onViewPartial,
  partialScenesCount
}: ScriptGenerationInProgressProps) {
  const tierInfo = getTierLabel(qualityTier);
  
  return (
    <Card className="border-2 border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardContent className="py-12">
        <div className="text-center space-y-8">
          {/* Animated Icon */}
          <div className="relative mx-auto w-24 h-24">
            {/* Outer spinning ring */}
            <div 
              className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-r-primary/30 animate-spin" 
              style={{ animationDuration: '1.5s' }}
            />
            {/* Inner glow */}
            <div className="absolute inset-2 rounded-full bg-primary/20 blur-lg animate-pulse" />
            {/* Icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Film className="w-10 h-10 text-primary" />
            </div>
          </div>

          {/* Title & Status */}
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-foreground">
              Generando Guion
            </h3>
            <p className="text-muted-foreground">
              {currentEpisode 
                ? `Episodio ${currentEpisode} de ${totalEpisodes}` 
                : 'Preparando generación...'}
            </p>
            
            {/* Quality Tier Badge */}
            <div className="flex justify-center">
              <Badge variant="outline" className={tierInfo.color}>
                {tierInfo.emoji} {tierInfo.label}
              </Badge>
            </div>
          </div>

          {/* Progress Section */}
          <div className="max-w-md mx-auto space-y-4">
            {/* Main Progress Bar */}
            <div className="space-y-2">
              <div className="text-4xl font-bold text-primary">
                {progress}%
              </div>
              <div className="relative">
                <Progress value={progress} className="h-3" />
                {/* Shimmer effect */}
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full overflow-hidden"
                  style={{ 
                    width: `${progress}%`,
                    animation: 'shimmer 2s infinite'
                  }}
                />
              </div>
            </div>
            
            {/* Stats Row */}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {formatElapsed(elapsedSeconds)}
              </span>
              {currentBatch && totalBatches && totalBatches > 0 && (
                <span className="flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  Batch {currentBatch}/{totalBatches}
                </span>
              )}
              {scenesGenerated !== undefined && scenesGenerated > 0 && (
                <span className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  {scenesGenerated} escenas
                </span>
              )}
            </div>
          </div>

          {/* Episode Pills (visual indicator) */}
          {totalEpisodes > 0 && totalEpisodes <= 12 && (
            <div className="flex justify-center gap-2 flex-wrap">
              {Array.from({ length: totalEpisodes }, (_, i) => {
                const epNum = i + 1;
                const isCompleted = currentEpisode !== null && epNum < currentEpisode;
                const isCurrent = currentEpisode === epNum;
                
                return (
                  <div
                    key={i}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300
                      ${isCompleted ? 'bg-primary text-primary-foreground' : ''}
                      ${isCurrent ? 'bg-primary text-primary-foreground ring-2 ring-primary/50 ring-offset-2 ring-offset-background animate-pulse' : ''}
                      ${!isCompleted && !isCurrent ? 'bg-muted text-muted-foreground' : ''}
                    `}
                  >
                    {isCompleted ? '✓' : isCurrent ? <Loader2 className="w-4 h-4 animate-spin" /> : epNum}
                  </div>
                );
              })}
            </div>
          )}

          {/* Info Alert */}
          <div className="p-4 bg-primary/10 rounded-xl border border-primary/20 max-w-md mx-auto">
            <p className="text-sm text-foreground">
              <Sparkles className="w-4 h-4 inline-block mr-1.5 text-primary" />
              Puedes navegar a otras secciones. La generación continuará en segundo plano.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-center flex-wrap">
            {onViewPartial && partialScenesCount && partialScenesCount > 0 && (
              <Button
                variant="outline"
                onClick={onViewPartial}
                className="gap-2"
              >
                <Eye className="w-4 h-4" />
                Ver {partialScenesCount} escenas
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={onCancel}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2"
            >
              <XCircle className="w-4 h-4" />
              Cancelar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
