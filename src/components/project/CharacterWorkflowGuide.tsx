/**
 * CharacterWorkflowGuide - Visual stepper for character progression
 * Shows current step and guides user through the workflow
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  UserPlus,
  FileText,
  Image,
  CheckCircle2,
  Star,
  ArrowRight,
} from 'lucide-react';

export type WorkflowStep = 'created' | 'has_bio' | 'has_image' | 'accepted' | 'canon';

interface CharacterWorkflowGuideProps {
  currentStep: WorkflowStep;
  isPro?: boolean;
  compact?: boolean;
  className?: string;
}

interface StepConfig {
  id: WorkflowStep;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  description: string;
}

const WORKFLOW_STEPS: StepConfig[] = [
  {
    id: 'created',
    label: 'Creado',
    shortLabel: 'Crear',
    icon: <UserPlus className="w-4 h-4" />,
    description: 'Nombre y rol definidos',
  },
  {
    id: 'has_bio',
    label: 'Descripción',
    shortLabel: 'Bio',
    icon: <FileText className="w-4 h-4" />,
    description: 'Añade biografía y detalles',
  },
  {
    id: 'has_image',
    label: 'Imagen',
    shortLabel: 'Imagen',
    icon: <Image className="w-4 h-4" />,
    description: 'Genera o sube referencia visual',
  },
  {
    id: 'accepted',
    label: 'Aceptado',
    shortLabel: 'Aceptar',
    icon: <CheckCircle2 className="w-4 h-4" />,
    description: 'Aprueba la imagen generada',
  },
  {
    id: 'canon',
    label: 'Canon',
    shortLabel: 'Canon',
    icon: <Star className="w-4 h-4" />,
    description: 'Referencia oficial del proyecto',
  },
];

const STEP_ORDER: Record<WorkflowStep, number> = {
  created: 0,
  has_bio: 1,
  has_image: 2,
  accepted: 3,
  canon: 4,
};

export function getWorkflowStep(params: {
  hasBio?: boolean;
  hasImage?: boolean;
  isAccepted?: boolean;
  isCanon?: boolean;
}): WorkflowStep {
  if (params.isCanon) return 'canon';
  if (params.isAccepted) return 'accepted';
  if (params.hasImage) return 'has_image';
  if (params.hasBio) return 'has_bio';
  return 'created';
}

export function getNextAction(currentStep: WorkflowStep): {
  label: string;
  actionKey: 'add_bio' | 'generate' | 'accept' | 'set_canon' | 'done';
} {
  switch (currentStep) {
    case 'created':
      return { label: 'Añadir descripción', actionKey: 'add_bio' };
    case 'has_bio':
      return { label: 'Generar imagen', actionKey: 'generate' };
    case 'has_image':
      return { label: 'Aceptar imagen', actionKey: 'accept' };
    case 'accepted':
      return { label: 'Fijar como Canon', actionKey: 'set_canon' };
    case 'canon':
      return { label: 'Completado', actionKey: 'done' };
  }
}

export function CharacterWorkflowGuide({
  currentStep,
  isPro = false,
  compact = false,
  className,
}: CharacterWorkflowGuideProps) {
  const currentIndex = STEP_ORDER[currentStep];
  const nextAction = getNextAction(currentStep);

  if (compact) {
    // Compact mode: just show progress badge with tooltip
    const completedSteps = currentIndex + 1;
    const totalSteps = WORKFLOW_STEPS.length;
    
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant={currentStep === 'canon' ? 'default' : 'outline'}
              className={cn(
                'gap-1 text-xs cursor-help',
                currentStep === 'canon' && 'bg-amber-500'
              )}
            >
              {WORKFLOW_STEPS[currentIndex].icon}
              {completedSteps}/{totalSteps}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[200px]">
            <p className="font-medium text-sm">{WORKFLOW_STEPS[currentIndex].label}</p>
            <p className="text-xs text-muted-foreground">{WORKFLOW_STEPS[currentIndex].description}</p>
            {currentStep !== 'canon' && (
              <p className="text-xs text-primary mt-1">→ Siguiente: {nextAction.label}</p>
            )}
          </TooltipContent>
        </Tooltip>
        {currentStep !== 'canon' && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <ArrowRight className="w-3 h-3" />
            {nextAction.label}
          </span>
        )}
      </div>
    );
  }

  // Full mode: show all steps with progress
  return (
    <div className={cn('space-y-3', className)}>
      {/* Step indicators */}
      <div className="flex items-center justify-between">
        {WORKFLOW_STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div key={step.id} className="flex items-center">
              {/* Step circle */}
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary/20 text-primary ring-2 ring-primary',
                  isPending && 'bg-muted text-muted-foreground'
                )}
              >
                {step.icon}
              </div>

              {/* Connector line */}
              {index < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={cn(
                    'w-8 sm:w-12 h-0.5 mx-1',
                    index < currentIndex ? 'bg-primary' : 'bg-muted'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current step label */}
      <div className="text-center">
        <p className="text-sm font-medium">
          {WORKFLOW_STEPS[currentIndex].label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {WORKFLOW_STEPS[currentIndex].description}
        </p>
        {currentStep !== 'canon' && (
          <p className="text-xs text-primary mt-2 flex items-center justify-center gap-1">
            <ArrowRight className="w-3 h-3" />
            Siguiente: {nextAction.label}
          </p>
        )}
      </div>
    </div>
  );
}

export default CharacterWorkflowGuide;
