/**
 * NextStepNavigator - Guided Workflow Navigation Component
 * Shows current step completion and next action in the production pipeline
 * Pipeline: Estilo → Guion → Personajes → Localizaciones → Escenas
 */

import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  ArrowRight, 
  Palette, 
  FileText, 
  Users, 
  MapPin, 
  Film 
} from 'lucide-react';

export type WorkflowStep = 'style' | 'script' | 'characters' | 'locations' | 'scenes';

interface StepConfig {
  key: WorkflowStep;
  label: string;
  icon: React.ReactNode;
  path: string;
}

const STEPS: StepConfig[] = [
  { key: 'style', label: 'Estilo Visual', icon: <Palette className="w-4 h-4" />, path: 'style' },
  { key: 'script', label: 'Guion', icon: <FileText className="w-4 h-4" />, path: 'script' },
  { key: 'characters', label: 'Personajes', icon: <Users className="w-4 h-4" />, path: 'characters' },
  { key: 'locations', label: 'Localizaciones', icon: <MapPin className="w-4 h-4" />, path: 'locations' },
  { key: 'scenes', label: 'Secuencias', icon: <Film className="w-4 h-4" />, path: 'scenes' },
];

interface NextStepNavigatorProps {
  projectId: string;
  currentStep: WorkflowStep;
  /** Optional message to show above the next step button */
  completionMessage?: string;
  /** Stats to show (e.g., "11 personajes importados") */
  stats?: string;
}

export default function NextStepNavigator({ 
  projectId, 
  currentStep,
  completionMessage,
  stats 
}: NextStepNavigatorProps) {
  const navigate = useNavigate();
  
  const currentIndex = STEPS.findIndex(s => s.key === currentStep);
  const nextStep = STEPS[currentIndex + 1];
  
  if (!nextStep) {
    // At final step - show completion
    return (
      <Card className="border-green-500/30 bg-green-500/5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-green-700 dark:text-green-400">
                ¡Pipeline Completo!
              </p>
              <p className="text-sm text-muted-foreground">
                Tu proyecto está listo para producción
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleNavigate = () => {
    navigate(`/projects/${projectId}/${nextStep.path}`);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Current step completion */}
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <Check className="w-5 h-5 text-primary" />
            </div>
            <div>
              {completionMessage && (
                <p className="font-semibold text-primary">{completionMessage}</p>
              )}
              {stats && (
                <Badge variant="outline" className="text-xs">
                  {stats}
                </Badge>
              )}
            </div>
          </div>

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground">
            {STEPS.map((step, idx) => (
              <div key={step.key} className="flex items-center">
                <div className={`w-2 h-2 rounded-full ${
                  idx <= currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                }`} />
                {idx < STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 ${
                    idx < currentIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`} />
                )}
              </div>
            ))}
            <span className="ml-2">{currentIndex + 1}/{STEPS.length}</span>
          </div>

          {/* Next step action */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Siguiente paso</p>
              <p className="font-medium flex items-center gap-1.5">
                {nextStep.icon}
                {nextStep.label}
              </p>
            </div>
            <Button variant="lime" onClick={handleNavigate}>
              <span className="sm:hidden">{nextStep.label}</span>
              <span className="hidden sm:inline">Continuar</span>
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
