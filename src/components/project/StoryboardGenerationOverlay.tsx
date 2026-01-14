import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, 
  CheckCircle, 
  XCircle, 
  Loader2,
  Clock,
  ArrowRight,
  Film
} from "lucide-react";

interface PanelStatus {
  panel_no: number;
  panel_id?: string;
  status: 'pending' | 'generating' | 'success' | 'error' | 'pending_regen' | 'failed_safe' | 'needs_identity_fix';
  error?: string;
  regenCount?: number;
}

interface StoryboardGenerationOverlayProps {
  totalPanels: number;
  currentPanel: number | null;
  panelStatuses: PanelStatus[];
  currentPhase: 'planning' | 'generating_images' | 'saving';
  progress: number;
  elapsedSeconds: number;
  estimatedRemainingMs: number;
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

export function StoryboardGenerationOverlay({
  totalPanels,
  currentPanel,
  panelStatuses,
  currentPhase,
  progress,
  elapsedSeconds,
  estimatedRemainingMs,
  onContinueInBackground,
  onCancel
}: StoryboardGenerationOverlayProps) {
  const completedCount = panelStatuses.filter(p => p.status === 'success').length;
  const errorCount = panelStatuses.filter(p => p.status === 'error' || p.status === 'failed_safe').length;
  const pendingRegenCount = panelStatuses.filter(p => p.status === 'pending_regen').length;
  
  const getPhaseLabel = () => {
    switch (currentPhase) {
      case 'planning':
        return "Analizando escena y planificando paneles...";
      case 'generating_images':
        if (currentPanel) {
          return `Generando imagen del panel ${currentPanel} de ${totalPanels}...`;
        }
        return "Generando imágenes del storyboard...";
      case 'saving':
        return "Guardando storyboard...";
      default:
        return "Preparando generación...";
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Animated Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Spinning border */}
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" 
                 style={{ width: '80px', height: '80px', margin: '-4px' }} />
            {/* Icon container */}
            <div className="w-[72px] h-[72px] rounded-full bg-primary/20 flex items-center justify-center">
              <Film className="w-8 h-8 text-primary animate-pulse" />
            </div>
          </div>
          
          <div className="text-center space-y-1">
            <h2 className="text-xl font-semibold">Generando Storyboard</h2>
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

        {/* Panel Pills */}
        {totalPanels > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-center text-muted-foreground font-medium uppercase tracking-wide">
              Paneles ({completedCount}/{totalPanels})
            </p>
            <div className="flex justify-center gap-2 flex-wrap">
              {Array.from({ length: totalPanels }, (_, i) => {
                const panelNo = i + 1;
                const panelData = panelStatuses.find(p => p.panel_no === panelNo);
                const isCompleted = panelData?.status === 'success';
                const hasError = panelData?.status === 'error' || panelData?.status === 'failed_safe';
                const isPendingRegen = panelData?.status === 'pending_regen';
                const isCurrentlyGenerating = currentPanel === panelNo || panelData?.status === 'generating';
                
                return (
                  <div
                    key={i}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all
                      ${isCompleted ? 'bg-green-500 text-white' : ''}
                      ${hasError ? 'bg-destructive text-destructive-foreground' : ''}
                      ${isPendingRegen ? 'bg-amber-500 text-white animate-pulse' : ''}
                      ${isCurrentlyGenerating ? 'bg-primary text-primary-foreground animate-pulse ring-2 ring-primary/30' : ''}
                      ${!isCompleted && !isCurrentlyGenerating && !hasError && !isPendingRegen ? 'bg-muted text-muted-foreground' : ''}
                    `}
                    title={hasError ? `Error: ${panelData?.error}` : isPendingRegen ? 'En cola para QC' : undefined}
                  >
                    {isCompleted ? (
                      <CheckCircle className="w-5 h-5" />
                    ) : isCurrentlyGenerating ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : hasError ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      panelNo
                    )}
                  </div>
                );
              })}
            </div>
            {errorCount > 0 && (
              <p className="text-xs text-center text-destructive">
                {errorCount} panel(es) con error
              </p>
            )}
            {pendingRegenCount > 0 && (
              <p className="text-xs text-center text-amber-400">
                {pendingRegenCount} panel(es) en cola de corrección
              </p>
            )}
          </div>
        )}

        {/* Phase indicator */}
        <div className="flex justify-center gap-4 text-xs">
          <div className={`flex items-center gap-1 ${currentPhase === 'planning' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${currentPhase === 'planning' ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
            Planificación
          </div>
          <div className={`flex items-center gap-1 ${currentPhase === 'generating_images' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${currentPhase === 'generating_images' ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
            Imágenes
          </div>
          <div className={`flex items-center gap-1 ${currentPhase === 'saving' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
            <div className={`w-2 h-2 rounded-full ${currentPhase === 'saving' ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
            Guardado
          </div>
        </div>

        {/* Background Mode Notice */}
        <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
          <p className="text-sm text-primary text-center">
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
