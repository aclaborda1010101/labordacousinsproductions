import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Clock,
  ArrowRight,
  Zap
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
    <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8 animate-fade-in">
        {/* Animated Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Spinning border - verde lima */}
            <div 
              className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" 
              style={{ width: '88px', height: '88px', margin: '-8px' }} 
            />
            {/* Glow effect */}
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse-glow" 
                 style={{ width: '80px', height: '80px' }} />
            {/* Icon container */}
            <div className="relative w-[72px] h-[72px] rounded-full bg-gradient-to-br from-primary to-[hsl(80,100%,40%)] flex items-center justify-center shadow-glow">
              <Zap className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold text-foreground">Generando Guion</h2>
            <p className="text-sm text-muted-foreground">{getPhaseLabel()}</p>
          </div>
        </div>

        {/* Main Progress */}
        <div className="space-y-4">
          <div className="text-center">
            <span className="text-6xl font-bold text-gradient-lime">{progress}%</span>
          </div>
          
          <div className="relative">
            <Progress value={progress} className="h-3" />
            {/* Shimmer effect on progress bar */}
            <div 
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Time Info */}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {formatElapsed(elapsedSeconds)}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="text-xs uppercase tracking-wide">Restante:</span>
              {formatDuration(estimatedRemainingMs)}
            </span>
          </div>
        </div>

        {/* Episode Pills */}
        {totalEpisodes > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-wider">
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
                      w-11 h-11 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300
                      ${isCompleted ? 'bg-success text-success-foreground shadow-md' : ''}
                      ${hasError ? 'bg-destructive text-destructive-foreground' : ''}
                      ${isCurrentlyGenerating ? 'bg-primary text-primary-foreground animate-pulse ring-2 ring-primary/50 shadow-glow' : ''}
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
              <p className="text-xs text-center text-destructive font-medium">
                {errorCount} episodio(s) con error
              </p>
            )}
          </div>
        )}

        {/* Background Mode Notice */}
        <div className="p-4 bg-primary/10 rounded-xl border border-primary/20">
          <p className="text-sm text-foreground text-center">
            <Sparkles className="w-4 h-4 inline-block mr-1.5 text-primary" />
            Puedes continuar navegando. La generación seguirá en segundo plano.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="lime"
            onClick={onContinueInBackground}
            className="gap-2"
            size="lg"
          >
            Continuar navegando
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={onCancel}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <XCircle className="w-4 h-4 mr-2" />
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}
