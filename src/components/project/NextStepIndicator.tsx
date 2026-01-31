/**
 * NextStepIndicator - Shows the single most important next action
 * Replaces multiple confusing buttons with one clear CTA
 * Adapts to ASSISTED/DIRECTOR/PRO mode
 */

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowRight, 
  Loader2, 
  Check, 
  Sparkles, 
  Play,
  Download,
  Users,
  MapPin,
  Film,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type WorkflowStep = 
  | 'script_needed'
  | 'script_analyzing'
  | 'script_ready'
  | 'entities_needed'
  | 'entities_extracting'
  | 'entities_ready'
  | 'scenes_needed'
  | 'scenes_generating'
  | 'scenes_ready'
  | 'production_ready';

interface NextStepIndicatorProps {
  currentStep: WorkflowStep;
  onAction: () => void;
  isLoading?: boolean;
  className?: string;
  // For showing progress in generation steps
  progress?: number;
  progressLabel?: string;
  // Run in background option
  onRunInBackground?: () => void;
  // Mode affects verbosity
  mode?: 'ASSISTED' | 'PRO';
}

const STEP_CONFIG: Record<WorkflowStep, {
  label: string;
  description: string;
  buttonLabel: string;
  buttonIcon: React.ReactNode;
  isComplete: boolean;
  isGenerating: boolean;
}> = {
  script_needed: {
    label: 'Guion',
    description: 'Crea o sube tu guion para empezar',
    buttonLabel: 'Empezar',
    buttonIcon: <Sparkles className="h-4 w-4" />,
    isComplete: false,
    isGenerating: false,
  },
  script_analyzing: {
    label: 'Analizando guion',
    description: 'Extrayendo personajes, localizaciones y escenas...',
    buttonLabel: 'Analizando...',
    buttonIcon: <Loader2 className="h-4 w-4 animate-spin" />,
    isComplete: false,
    isGenerating: true,
  },
  script_ready: {
    label: 'Guion listo',
    description: 'Tu guion está analizado y listo',
    buttonLabel: 'Continuar',
    buttonIcon: <ArrowRight className="h-4 w-4" />,
    isComplete: true,
    isGenerating: false,
  },
  entities_needed: {
    label: 'Exportar a Biblia',
    description: 'Añade personajes y localizaciones a tu proyecto',
    buttonLabel: 'Exportar',
    buttonIcon: <Download className="h-4 w-4" />,
    isComplete: false,
    isGenerating: false,
  },
  entities_extracting: {
    label: 'Exportando',
    description: 'Guardando elementos en la Biblia...',
    buttonLabel: 'Exportando...',
    buttonIcon: <Loader2 className="h-4 w-4 animate-spin" />,
    isComplete: false,
    isGenerating: true,
  },
  entities_ready: {
    label: 'Biblia lista',
    description: 'Personajes y localizaciones añadidos',
    buttonLabel: 'Siguiente',
    buttonIcon: <ArrowRight className="h-4 w-4" />,
    isComplete: true,
    isGenerating: false,
  },
  scenes_needed: {
    label: 'Continuar a Producción',
    description: 'Tu análisis está listo para comenzar la producción',
    buttonLabel: 'Generar todo',
    buttonIcon: <Sparkles className="h-4 w-4" />,
    isComplete: false,
    isGenerating: false,
  },
  scenes_generating: {
    label: 'Generando escenas',
    description: 'Creando planos, transiciones y configuración...',
    buttonLabel: 'Generando...',
    buttonIcon: <Loader2 className="h-4 w-4 animate-spin" />,
    isComplete: false,
    isGenerating: true,
  },
  scenes_ready: {
    label: 'Escenas listas',
    description: 'Tu proyecto está listo para producción',
    buttonLabel: 'Ir a producción',
    buttonIcon: <Play className="h-4 w-4" />,
    isComplete: true,
    isGenerating: false,
  },
  production_ready: {
    label: '¡Listo!',
    description: 'Tu proyecto está completo',
    buttonLabel: 'Ver producción',
    buttonIcon: <Film className="h-4 w-4" />,
    isComplete: true,
    isGenerating: false,
  },
};

export function NextStepIndicator({
  currentStep,
  onAction,
  isLoading = false,
  className,
  progress,
  progressLabel,
  onRunInBackground,
  mode = 'ASSISTED',
}: NextStepIndicatorProps) {
  const config = STEP_CONFIG[currentStep];
  const isGenerating = config.isGenerating || isLoading;
  
  // In ASSISTED mode, show simplified version
  const showBackgroundOption = mode !== 'ASSISTED' && onRunInBackground && !isGenerating;
  
  return (
    <Card className={cn(
      'border-primary/20 bg-gradient-to-r from-primary/5 to-transparent',
      config.isComplete && 'border-green-500/30 from-green-500/5',
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Step info */}
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              config.isComplete 
                ? 'bg-green-500/20 text-green-500' 
                : isGenerating 
                  ? 'bg-primary/20 text-primary animate-pulse'
                  : 'bg-primary/20 text-primary'
            )}>
              {config.isComplete ? (
                <Check className="h-5 w-5" />
              ) : isGenerating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">{config.label}</p>
                {config.isComplete && (
                  <Badge variant="outline" className="text-xs border-green-500/50 text-green-600">
                    ✓ Completo
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {progressLabel || config.description}
              </p>
              {/* Progress bar for generating states */}
              {isGenerating && progress !== undefined && (
                <div className="mt-1 h-1 w-32 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right: Action button */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {showBackgroundOption && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onRunInBackground}
                className="text-xs text-muted-foreground"
              >
                En segundo plano
              </Button>
            )}
            <Button
              onClick={onAction}
              disabled={isGenerating}
              size="sm"
              variant={config.isComplete ? 'default' : 'gold'}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                config.buttonIcon
              )}
              <span className="hidden sm:inline">{config.buttonLabel}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Determine current workflow step from project state
 */
export function determineWorkflowStep(state: {
  hasScript: boolean;
  isAnalyzing?: boolean;
  hasEntities: boolean;
  isExtractingEntities?: boolean;
  hasScenes: boolean;
  isGeneratingScenes?: boolean;
}): WorkflowStep {
  if (!state.hasScript) {
    return state.isAnalyzing ? 'script_analyzing' : 'script_needed';
  }
  if (!state.hasEntities) {
    return state.isExtractingEntities ? 'entities_extracting' : 'entities_needed';
  }
  if (!state.hasScenes) {
    return state.isGeneratingScenes ? 'scenes_generating' : 'scenes_needed';
  }
  return 'production_ready';
}
