/**
 * WorkflowGuide - Guía paso a paso para modo ASSISTED
 * Muestra progreso claro y siguiente acción recomendada
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Book, 
  FileText, 
  Clapperboard, 
  Play, 
  CheckCircle, 
  Clock, 
  Lock, 
  ArrowRight,
  Lightbulb,
  HelpCircle 
} from 'lucide-react';
import { useCreativeModeOptional } from '@/contexts/CreativeModeContext';
import { supabase } from '@/integrations/supabase/client';

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  icon: any;
  status: 'locked' | 'available' | 'in_progress' | 'complete';
  progress?: number;
  helpText?: string;
  nextAction?: string;
  route?: string;
}

interface WorkflowGuideProps {
  projectId: string;
  currentRoute: string;
  onNavigate: (route: string) => void;
}

export function WorkflowGuide({ projectId, currentRoute, onNavigate }: WorkflowGuideProps) {
  const creativeModeContext = useCreativeModeOptional();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectStats, setProjectStats] = useState<any>(null);

  // Solo mostrar en modo ASSISTED
  if (creativeModeContext?.effectiveMode !== 'ASSISTED') {
    return null;
  }

  useEffect(() => {
    loadProjectProgress();
  }, [projectId]);

  const loadProjectProgress = async () => {
    try {
      setLoading(true);

      // Cargar estadísticas del proyecto
      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      const { data: scenes } = await supabase
        .from('scenes')
        .select('id, approved')
        .eq('project_id', projectId);

      const { data: characters } = await supabase
        .from('characters')
        .select('id')
        .eq('project_id', projectId);

      const { data: locations } = await supabase
        .from('locations')
        .select('id')
        .eq('project_id', projectId);

      setProjectStats({
        bibleScore: project?.bible_completeness_score || 0,
        scenesCount: scenes?.length || 0,
        scenesApproved: scenes?.filter(s => s.approved).length || 0,
        charactersCount: characters?.length || 0,
        locationsCount: locations?.length || 0,
        hasScript: project?.has_script || false,
      });

      updateStepsStatus({
        bibleScore: project?.bible_completeness_score || 0,
        scenesCount: scenes?.length || 0,
        scenesApproved: scenes?.filter(s => s.approved).length || 0,
        hasScript: project?.has_script || false,
      });

    } catch (error) {
      console.error('Error loading project progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStepsStatus = (stats: any) => {
    const newSteps: WorkflowStep[] = [
      {
        id: 'bible',
        title: 'Biblia del Proyecto',
        description: 'Define el universo, personajes y localizaciones',
        icon: Book,
        status: stats.bibleScore >= 85 ? 'complete' : 'in_progress',
        progress: stats.bibleScore,
        helpText: stats.bibleScore < 85 ? 
          'Completa personajes y localizaciones para desbloquear escenas' : 
          'Biblia completa. ¡Excelente trabajo!',
        nextAction: stats.bibleScore < 85 ? 'Completar biblia' : null,
        route: '/bible'
      },
      {
        id: 'script',
        title: 'Guión',
        description: 'Genera o importa tu guión',
        icon: FileText,
        status: stats.hasScript ? 'complete' : 
                stats.bibleScore >= 50 ? 'available' : 'locked',
        helpText: !stats.hasScript ? 
          'Genera un guión desde una idea o importa uno existente' :
          'Guión listo para producción',
        nextAction: !stats.hasScript ? 'Crear o importar guión' : null,
        route: '/script'
      },
      {
        id: 'scenes',
        title: 'Escenas y Planos',
        description: 'Planifica cada escena en detalle',
        icon: Clapperboard,
        status: stats.scenesApproved > 0 ? 'complete' :
                stats.scenesCount > 0 ? 'in_progress' :
                stats.bibleScore >= 85 && stats.hasScript ? 'available' : 'locked',
        progress: stats.scenesCount > 0 ? (stats.scenesApproved / stats.scenesCount) * 100 : 0,
        helpText: stats.scenesCount === 0 ? 
          'Genera el breakdown de escenas desde tu guión' :
          `${stats.scenesApproved}/${stats.scenesCount} escenas aprobadas`,
        nextAction: stats.scenesCount === 0 ? 'Generar escenas' : 'Revisar escenas',
        route: '/scenes'
      },
      {
        id: 'dailies',
        title: 'Dailies',
        description: 'Genera videos de tus escenas',
        icon: Play,
        status: stats.scenesApproved > 0 ? 'available' : 'locked',
        helpText: stats.scenesApproved > 0 ? 
          'Genera videos para visualizar tu proyecto' :
          'Aprueba escenas primero',
        nextAction: stats.scenesApproved > 0 ? 'Generar dailies' : null,
        route: '/renders'
      }
    ];

    setSteps(newSteps);
  };

  const getCurrentStep = () => {
    return steps.find(step => {
      if (step.status === 'in_progress') return true;
      if (step.status === 'available') return true;
      return false;
    });
  };

  const getOverallProgress = () => {
    const completedSteps = steps.filter(s => s.status === 'complete').length;
    return (completedSteps / steps.length) * 100;
  };

  const currentStep = getCurrentStep();

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="p-4">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 rounded-full bg-primary/20 animate-pulse" />
            <div className="text-sm text-muted-foreground">Cargando progreso...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-primary" />
            Guía del Proyecto
          </CardTitle>
          <Badge variant="outline">
            {Math.round(getOverallProgress())}% completo
          </Badge>
        </div>
        <Progress value={getOverallProgress()} className="mt-2" />
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* Paso actual destacado */}
        {currentStep && (
          <Alert className="mb-4 border-primary/20 bg-primary/5">
            <currentStep.icon className="w-4 h-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <div>
                  <strong>Siguiente paso:</strong> {currentStep.title}
                  <br />
                  <span className="text-sm text-muted-foreground">
                    {currentStep.helpText}
                  </span>
                </div>
                {currentStep.route && (
                  <Button 
                    size="sm" 
                    onClick={() => onNavigate(currentStep.route!)}
                    className="ml-4"
                  >
                    <ArrowRight className="w-4 h-4 mr-1" />
                    {currentStep.nextAction}
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Lista de pasos */}
        <div className="space-y-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentRoute.includes(step.route?.slice(1) || '');
            
            return (
              <div 
                key={step.id}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
                  isActive ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                } ${step.status === 'locked' ? 'opacity-50' : ''}`}
                onClick={() => step.route && step.status !== 'locked' && onNavigate(step.route)}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  step.status === 'complete' ? 'bg-green-100 text-green-600' :
                  step.status === 'in_progress' ? 'bg-primary/20 text-primary' :
                  step.status === 'available' ? 'bg-blue-100 text-blue-600' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {step.status === 'complete' ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : step.status === 'locked' ? (
                    <Lock className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{step.title}</span>
                    <Badge variant={
                      step.status === 'complete' ? 'default' :
                      step.status === 'in_progress' ? 'secondary' :
                      step.status === 'available' ? 'outline' : 'secondary'
                    } size="sm">
                      {step.status === 'complete' ? 'Completo' :
                       step.status === 'in_progress' ? 'En progreso' :
                       step.status === 'available' ? 'Disponible' : 'Bloqueado'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                  {step.progress !== undefined && step.progress < 100 && (
                    <Progress value={step.progress} className="mt-1 h-1" />
                  )}
                </div>

                {step.status === 'available' && step.nextAction && (
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}