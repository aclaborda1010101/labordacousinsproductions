import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Clock,
  ArrowRight
} from "lucide-react";

interface EpisodeStatus {
  episode_number: number;
  error?: string;
}

interface ScriptGenerationOverlayProps {
  progress: number;
  currentEpisode: number | null;
  totalEpisodes: number;
  generatedEpisodes: EpisodeStatus[];
  estimatedRemainingMs: number;
  elapsedSeconds: number;
  currentStepLabel?: string;
  onContinueInBackground: () => void;
  onCancel: () => void;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "calculando...";
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function ScriptGenerationOverlay({
  progress,
  currentEpisode,
  totalEpisodes,
  generatedEpisodes,
  estimatedRemainingMs,
  elapsedSeconds,
  currentStepLabel,
  onContinueInBackground,
  onCancel
}: ScriptGenerationOverlayProps) {
  const completedCount = generatedEpisodes.filter(ep => !ep.error).length;
  const errorCount = generatedEpisodes.filter(ep => ep.error).length;
  
  const getPhaseLabel = () => {
    if (progress >= 100) return "Finalizando y guardando...";
    if (progress >= 95) return "Guardando episodios...";
    if (currentEpisode) return `Generando episodio ${currentEpisode} de ${totalEpisodes}...`;
    if (currentStepLabel) return currentStepLabel;
    return "Preparando generación...";
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Animated Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Spinning border */}
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 animate-spin" 
                 style={{ width: '80px', height: '80px', margin: '-4px' }} />
            {/* Icon container */}
            <div className="w-[72px] h-[72px] rounded-full bg-blue-500/20 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />
            </div>
          </div>
          
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold">Generando Guion</h2>
            <p className="text-sm text-muted-foreground">{getPhaseLabel()}</p>
          </div>
        </div>

        {/* Main Progress */}
        <div className="space-y-4">
          <div className="text-center">
            <span className="text-5xl font-bold text-primary">{progress}%</span>
          </div>
          
          <Progress value={progress} className="h-3" />
          
          {/* Time Info */}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Transcurrido: {formatElapsed(elapsedSeconds)}
            </span>
            <span>
              Restante: {formatDuration(estimatedRemainingMs)}
            </span>
          </div>
        </div>

        {/* Episode Pills */}
        {totalEpisodes > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-wide">
              Episodios ({completedCount}/{totalEpisodes})
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {Array.from({ length: totalEpisodes }, (_, i) => {
                const epNum = i + 1;
                const episodeData = generatedEpisodes.find(ep => ep.episode_number === epNum);
                const isCompleted = episodeData && !episodeData.error;
                const hasError = episodeData?.error;
                const isCurrentlyGenerating = currentEpisode === epNum;
                
                return (
                  <div
                    key={i}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                      ${isCompleted ? 'bg-green-500 text-white' : ''}
                      ${hasError ? 'bg-destructive text-destructive-foreground' : ''}
                      ${isCurrentlyGenerating ? 'bg-blue-500 text-white animate-pulse ring-2 ring-blue-300' : ''}
                      ${!isCompleted && !isCurrentlyGenerating && !hasError ? 'bg-muted text-muted-foreground' : ''}
                    `}
                    title={hasError ? `Error: ${episodeData?.error}` : undefined}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isCurrentlyGenerating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : hasError ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      epNum
                    )}
                  </div>
                );
              })}
            </div>
            {errorCount > 0 && (
              <p className="text-xs text-center text-destructive">
                {errorCount} episodio(s) con error
              </p>
            )}
          </div>
        )}

        {/* Background Mode Notice */}
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
            Puedes continuar navegando. La generación seguirá en segundo plano.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="outline"
            onClick={onContinueInBackground}
            className="gap-2"
          >
            Continuar en segundo plano
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onCancel}
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
