/**
 * ScriptGenerationProgress - Visual progress indicator for script generation phases
 * Shows granular feedback during multi-step generation process
 */

import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  FileText,
  Pen,
  Save,
  Search,
  Sparkles,
  CheckCircle,
  Loader2,
  Clock,
  Info,
} from 'lucide-react';

export interface GenerationPhase {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  progressRange: [number, number]; // [start, end]
}

const GENERATION_PHASES: GenerationPhase[] = [
  {
    id: 'prepare',
    label: 'Preparando',
    description: 'Configurando parámetros creativos',
    icon: Sparkles,
    progressRange: [0, 10],
  },
  {
    id: 'outline',
    label: 'Estructura narrativa',
    description: 'Diseñando arcos de personajes y conflictos',
    icon: FileText,
    progressRange: [10, 30],
  },
  {
    id: 'writing',
    label: 'Escribiendo guion',
    description: 'Diálogos, descripciones y direcciones',
    icon: Pen,
    progressRange: [30, 85],
  },
  {
    id: 'saving',
    label: 'Guardando',
    description: 'Respaldando tu trabajo en la nube',
    icon: Save,
    progressRange: [85, 90],
  },
  {
    id: 'breakdown',
    label: 'Analizando',
    description: 'Extrayendo personajes y locaciones',
    icon: Search,
    progressRange: [90, 95],
  },
  {
    id: 'summary',
    label: 'Finalizando',
    description: 'Generando resumen y diagnóstico',
    icon: Sparkles,
    progressRange: [95, 100],
  },
];

interface ScriptGenerationProgressProps {
  progress: number;
  isActive: boolean;
  startTime?: Date;
  className?: string;
}

export function ScriptGenerationProgress({
  progress,
  isActive,
  startTime,
  className,
}: ScriptGenerationProgressProps) {
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);

  // Calculate estimated time remaining
  useEffect(() => {
    if (!isActive || !startTime || progress < 5) {
      setEstimatedMinutes(null);
      return;
    }

    const elapsed = (Date.now() - startTime.getTime()) / 1000; // seconds
    const rate = progress / elapsed;
    
    if (rate > 0) {
      const remaining = (100 - progress) / rate;
      setEstimatedMinutes(Math.max(1, Math.ceil(remaining / 60)));
    }
  }, [progress, isActive, startTime]);

  // Find current phase
  const getCurrentPhase = () => {
    for (let i = GENERATION_PHASES.length - 1; i >= 0; i--) {
      if (progress >= GENERATION_PHASES[i].progressRange[0]) {
        return i;
      }
    }
    return 0;
  };

  const currentPhaseIndex = getCurrentPhase();

  if (!isActive) return null;

  return (
    <div className={cn("space-y-4 p-4 rounded-lg bg-muted/50 border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
          </div>
          <div>
            <h4 className="font-medium text-sm">Generando tu proyecto</h4>
            <p className="text-xs text-muted-foreground">
              {GENERATION_PHASES[currentPhaseIndex].description}
            </p>
          </div>
        </div>
        
        {estimatedMinutes !== null && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>~{estimatedMinutes} min</span>
          </div>
        )}
      </div>

      {/* Overall Progress */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Progreso total</span>
          <span className="font-medium">{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Phase List */}
      <div className="space-y-1">
        {GENERATION_PHASES.map((phase, index) => {
          const isCompleted = progress >= phase.progressRange[1];
          const isCurrent = index === currentPhaseIndex;
          const isPending = progress < phase.progressRange[0];
          const Icon = phase.icon;

          return (
            <div
              key={phase.id}
              className={cn(
                "flex items-center gap-3 py-2 px-2 rounded-md transition-colors",
                isCurrent && "bg-primary/5",
                isCompleted && "opacity-60"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0",
                  isCompleted && "bg-green-500/20 text-green-600",
                  isCurrent && "bg-primary/20 text-primary",
                  isPending && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle className="w-3.5 h-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-sm truncate",
                    isCurrent && "font-medium text-foreground",
                    isCompleted && "text-muted-foreground",
                    isPending && "text-muted-foreground"
                  )}
                >
                  {phase.label}
                </p>
              </div>

              {isCurrent && (
                <span className="text-xs text-primary font-medium">En curso</span>
              )}
              {isCompleted && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
            </div>
          );
        })}
      </div>

      {/* Background info */}
      <Alert className="bg-blue-500/5 border-blue-500/20">
        <Info className="h-4 w-4 text-blue-500" />
        <AlertDescription className="text-xs">
          <strong>Puedes navegar libremente</strong> — Este proceso continúa en segundo plano. 
          Te notificaremos via 🔔 cuando termine.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Export phases for external use
export { GENERATION_PHASES };
