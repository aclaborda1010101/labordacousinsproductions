/**
 * PreScriptWizard - 5-step wizard for preparing and generating script (V77)
 * 
 * Steps:
 * 1. Carne Operativa (Enrich + Materialize)
 * 2. Threads Narrativos (Automatic)
 * 3. Showrunner (Editorial + Visual Context)
 * 4. Aprobar (Confirm readiness)
 * 5. Generar Guion (Integrated narrative generation)
 */

import { useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  Sparkles,
  Users,
  MapPin,
  GitBranch,
  Film,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Square,
  Play,
  Clapperboard,
} from 'lucide-react';
import { usePreScriptWizard, WizardStep } from '@/hooks/usePreScriptWizard';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface PreScriptWizardProps {
  projectId: string;
  outline: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  /** When true, renders inline (no modal dialog) */
  inline?: boolean;
  /** V77: Callback when script is compiled */
  onScriptCompiled?: (scriptData: any) => void;
  /** V77: Generation params */
  language?: string;
  qualityTier?: string;
  format?: 'film' | 'series' | 'ad';
}

// V77: 5-step config
const STEP_CONFIG: Record<WizardStep, { title: string; description: string; icon: any }> = {
  enrich: {
    title: 'Carne Operativa',
    description: 'Enriqueciendo outline y materializando personajes y locaciones',
    icon: Users,
  },
  threads: {
    title: 'Hilos Narrativos',
    description: 'Generando conexiones narrativas entre escenas',
    icon: GitBranch,
  },
  showrunner: {
    title: 'Showrunner',
    description: 'Estableciendo reglas editoriales y contexto visual',
    icon: Film,
  },
  approve: {
    title: 'Confirmar',
    description: 'Revisa y confirma para iniciar la generación',
    icon: Sparkles,
  },
  generate: {
    title: 'Generando Guion',
    description: 'Escribiendo escenas con diálogos y acotaciones',
    icon: Clapperboard,
  },
};

const STEP_ORDER: WizardStep[] = ['enrich', 'threads', 'showrunner', 'approve', 'generate'];

export function PreScriptWizard({
  projectId,
  outline,
  open,
  onOpenChange,
  onComplete,
  inline = false,
  onScriptCompiled,
  language = 'es-ES',
  qualityTier = 'profesional',
  format = 'series',
}: PreScriptWizardProps) {
  const [confirmChecked, setConfirmChecked] = useState(false);

  const {
    state,
    isProcessing,
    isLoading,
    currentStep,
    currentStepState,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    executeCurrentStep,
    reset,
    cancelGeneration,
    characters,
    locations,
    threads,
    showrunnerDecisions,
    generationProgress,
    sceneIntents,
  } = usePreScriptWizard({
    projectId,
    outline,
    onComplete: () => {
      onComplete();
      onOpenChange(false);
    },
    onScriptCompiled,
    language,
    qualityTier,
    format,
  });

  // Don't reset wizard when loading - state is being restored from DB
  useEffect(() => {
    if (open && !isLoading) {
      const hasProgress = Object.values(state.steps).some(s => s.status !== 'pending');
      if (!hasProgress) {
        setConfirmChecked(false);
      }
    }
  }, [open, isLoading, state.steps]);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const progressPercent = ((currentStepIndex + (currentStepState.status === 'done' ? 1 : 0)) / STEP_ORDER.length) * 100;

  const getStepIcon = (step: WizardStep) => {
    const stepState = state.steps[step];
    const StepIcon = STEP_CONFIG[step].icon;

    if (stepState.status === 'done') {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (stepState.status === 'running') {
      return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
    }
    if (stepState.status === 'error') {
      return <XCircle className="h-5 w-5 text-destructive" />;
    }
    if (step === currentStep) {
      return <StepIcon className="h-5 w-5 text-primary" />;
    }
    return <Circle className="h-5 w-5 text-muted-foreground" />;
  };

  // Show loading state while wizard is initializing from DB
  if (isLoading) {
    if (inline) {
      return (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
              <span className="text-muted-foreground">Cargando estado del wizard...</span>
            </div>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  // V77: Generation progress percentage
  const generationPercent = generationProgress.totalScenes > 0
    ? Math.round((generationProgress.completedScenes / generationProgress.totalScenes) * 100)
    : 0;

  const renderStepContent = () => {
    switch (currentStep) {
      case 'enrich':
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Este paso enriquece tu outline con detalles narrativos y crea los personajes y locaciones en la base de datos.
            </p>

            {currentStepState.status === 'pending' && (
              <Button onClick={executeCurrentStep} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Iniciar Preparación
              </Button>
            )}

            {currentStepState.status === 'running' && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Procesando...</p>
                </div>
              </div>
            )}

            {currentStepState.status === 'done' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium">Personajes</span>
                    </div>
                    <p className="text-2xl font-bold">{characters.length}</p>
                    <ScrollArea className="h-24 mt-2">
                      <div className="space-y-1">
                        {characters.slice(0, 5).map((c: any) => (
                          <p key={c.id} className="text-sm text-muted-foreground truncate">
                            • {c.name} {c.role && `(${c.role})`}
                          </p>
                        ))}
                        {characters.length > 5 && (
                          <p className="text-xs text-muted-foreground">+{characters.length - 5} más</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      <span className="font-medium">Locaciones</span>
                    </div>
                    <p className="text-2xl font-bold">{locations.length}</p>
                    <ScrollArea className="h-24 mt-2">
                      <div className="space-y-1">
                        {locations.slice(0, 5).map((l: any) => (
                          <p key={l.id} className="text-sm text-muted-foreground truncate">
                            • {l.name}
                          </p>
                        ))}
                        {locations.length > 5 && (
                          <p className="text-xs text-muted-foreground">+{locations.length - 5} más</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                <Button onClick={goNext} className="w-full">
                  Continuar <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}

            {currentStepState.status === 'error' && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-destructive text-sm">{currentStepState.error}</p>
                <Button onClick={executeCurrentStep} variant="outline" className="mt-2">
                  Reintentar
                </Button>
              </div>
            )}
          </div>
        );

      case 'threads':
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Generando hilos narrativos que conectan las escenas y mantienen la coherencia del guion.
            </p>

            {currentStepState.status === 'pending' && (
              <Button onClick={executeCurrentStep} className="w-full">
                <GitBranch className="h-4 w-4 mr-2" />
                Generar Hilos
              </Button>
            )}

            {currentStepState.status === 'running' && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">Analizando estructura narrativa...</p>
                </div>
              </div>
            )}

            {currentStepState.status === 'done' && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <span className="font-medium">{threads.length} Hilos Narrativos</span>
                  </div>
                  <ScrollArea className="h-40">
                    <div className="space-y-2">
                      {threads.map((t: any, idx: number) => (
                        <div key={t.id || idx} className="p-2 bg-background rounded border">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {t.type || 'plot'}
                            </Badge>
                            <span className="font-medium text-sm">{t.name}</span>
                          </div>
                          {t.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {t.description}
                            </p>
                          )}
                        </div>
                      ))}
                      {threads.length === 0 && (
                        <p className="text-muted-foreground text-sm text-center py-4">
                          No se detectaron hilos narrativos explícitos. Se generarán durante la escritura.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                <Button onClick={goNext} className="w-full">
                  Continuar <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        );

      case 'showrunner':
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Estableciendo reglas editoriales, validación narrativa y contexto visual para la producción.
            </p>

            {currentStepState.status === 'pending' && (
              <Button onClick={executeCurrentStep} className="w-full">
                <Film className="h-4 w-4 mr-2" />
                Configurar Showrunner
              </Button>
            )}

            {currentStepState.status === 'running' && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                  <p className="text-muted-foreground">El Showrunner está tomando decisiones...</p>
                </div>
              </div>
            )}

            {currentStepState.status === 'done' && showrunnerDecisions && (
              <div className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Film className="h-4 w-4 text-primary" />
                    <span className="font-medium">Decisiones Editoriales</span>
                  </div>

                  <div className="grid gap-2 text-sm">
                    {showrunnerDecisions.visual_style && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Estilo Visual:</span>
                        <span>{showrunnerDecisions.visual_style}</span>
                      </div>
                    )}
                    {showrunnerDecisions.tone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tono:</span>
                        <span>{showrunnerDecisions.tone}</span>
                      </div>
                    )}
                    {showrunnerDecisions.pacing && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ritmo:</span>
                        <span>{showrunnerDecisions.pacing}</span>
                      </div>
                    )}
                  </div>

                  {showrunnerDecisions.restrictions?.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium mb-1">Restricciones:</p>
                      <div className="flex flex-wrap gap-1">
                        {showrunnerDecisions.restrictions.map((r: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {r}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {showrunnerDecisions.error && (
                    <div className="flex items-center gap-2 text-amber-600 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      <span>Usando valores por defecto</span>
                    </div>
                  )}
                </div>

                <Button onClick={goNext} className="w-full">
                  Continuar <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        );

      case 'approve':
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Revisa el resumen y confirma para iniciar la generación del guion completo.
            </p>

            <div className="p-4 bg-muted/50 rounded-lg space-y-3">
              <h4 className="font-medium">Resumen de Preparación</h4>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Personajes:</span>
                  <span className="ml-2 font-medium">{characters.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Locaciones:</span>
                  <span className="ml-2 font-medium">{locations.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Hilos Narrativos:</span>
                  <span className="ml-2 font-medium">{threads.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Episodios:</span>
                  <span className="ml-2 font-medium">{outline?.episode_beats?.length || 1}</span>
                </div>
              </div>

              {showrunnerDecisions && (
                <div className="pt-2 border-t text-sm">
                  <span className="text-muted-foreground">Estilo:</span>
                  <span className="ml-2">{showrunnerDecisions.visual_style || 'Estándar'}</span>
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <Checkbox
                id="confirm"
                checked={confirmChecked}
                onCheckedChange={(c) => setConfirmChecked(!!c)}
              />
              <label htmlFor="confirm" className="text-sm cursor-pointer">
                Confirmo que el outline está listo y quiero generar el guion completo con diálogos y acotaciones.
              </label>
            </div>

            <Button 
              onClick={async () => {
                await executeCurrentStep();
                goNext(); // Auto-advance to generate step
              }} 
              disabled={!confirmChecked || isProcessing}
              className="w-full"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Preparando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Generación
                </>
              )}
            </Button>
          </div>
        );

      // V77: New step 5 - Generate
      case 'generate':
        return (
          <div className="space-y-4">
            <p className="text-muted-foreground">
              El sistema narrativo está generando las escenas con diálogos completos.
            </p>

            {/* Generation Progress */}
            {(currentStepState.status === 'running' || generationProgress.phase === 'generating' || generationProgress.phase === 'planning') && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>
                      {generationProgress.phase === 'planning' ? 'Planificando escenas...' : 
                       `Escena ${generationProgress.currentScene || 1} de ${generationProgress.totalScenes || '?'}`}
                    </span>
                    <span>{generationPercent}%</span>
                  </div>
                  <Progress value={generationPercent} className="h-3" />
                </div>

                {sceneIntents.length > 0 && (
                  <ScrollArea className="h-40 border rounded-lg p-2">
                    <div className="space-y-2">
                      {sceneIntents.map((intent) => (
                        <div key={intent.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                          {intent.status === 'written' || intent.status === 'validated' ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          ) : intent.status === 'writing' ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin flex-shrink-0" />
                          ) : intent.status === 'failed' ? (
                            <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">Escena {intent.scene_number}</span>
                            {intent.intent_summary && (
                              <p className="text-xs text-muted-foreground truncate">
                                {intent.intent_summary}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {intent.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                <Button onClick={cancelGeneration} variant="destructive" className="w-full">
                  <Square className="h-4 w-4 mr-2" />
                  Cancelar Generación
                </Button>
              </div>
            )}

            {/* Pending state - auto-start */}
            {currentStepState.status === 'pending' && generationProgress.phase === 'idle' && (
              <div className="space-y-4">
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Clapperboard className="h-12 w-12 mx-auto mb-4 text-primary/50" />
                    <p className="text-muted-foreground mb-4">Todo listo para generar el guion</p>
                    <Button onClick={executeCurrentStep} className="w-full">
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generar Guion Completo
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Completed */}
            {currentStepState.status === 'done' && (
              <div className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <h4 className="font-medium text-lg mb-2">¡Guion Generado!</h4>
                  <p className="text-muted-foreground text-sm">
                    {currentStepState.result?.scenesCompleted || generationProgress.completedScenes} escenas generadas exitosamente.
                  </p>
                </div>
              </div>
            )}

            {/* Error */}
            {currentStepState.status === 'error' && (
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-destructive text-sm">{currentStepState.error}</p>
                <Button onClick={executeCurrentStep} variant="outline" className="mt-2">
                  Reintentar
                </Button>
              </div>
            )}
          </div>
        );
    }
  };

  // Inline rendering (no modal)
  if (inline) {
    if (!open) return null;
    
    return (
      <div className="space-y-4 p-4 border rounded-lg bg-card">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-lg">Preparación del Guion</h3>
        </div>

        {/* Step Indicator */}
        <div className="space-y-3">
          <Progress value={progressPercent} className="h-2" />
          
          <div className="flex justify-between">
            {STEP_ORDER.map((step, idx) => {
              const config = STEP_CONFIG[step];
              const isActive = step === currentStep;
              const isDone = state.steps[step].status === 'done';

              return (
                <div
                  key={step}
                  className={cn(
                    'flex flex-col items-center gap-1 flex-1',
                    isActive && 'text-primary',
                    !isActive && !isDone && 'text-muted-foreground'
                  )}
                >
                  {getStepIcon(step)}
                  <span className="text-xs font-medium text-center hidden sm:block">
                    {config.title}
                  </span>
                  <span className="text-xs font-medium text-center sm:hidden">
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Step Title */}
        <div>
          <h4 className="font-semibold">
            Paso {currentStepIndex + 1}: {STEP_CONFIG[currentStep].title}
          </h4>
          <p className="text-sm text-muted-foreground">
            {STEP_CONFIG[currentStep].description}
          </p>
        </div>

        {/* Step Content */}
        <div className="min-h-[150px]">
          {renderStepContent()}
        </div>

        {/* Navigation */}
        {currentStepIndex > 0 && currentStepState.status === 'done' && currentStep !== 'generate' && (
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={goPrev}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Modal rendering
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Preparación del Guion
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="space-y-3">
          <Progress value={progressPercent} className="h-2" />
          
          <div className="flex justify-between">
            {STEP_ORDER.map((step, idx) => {
              const config = STEP_CONFIG[step];
              const isActive = step === currentStep;
              const isDone = state.steps[step].status === 'done';

              return (
                <div
                  key={step}
                  className={cn(
                    'flex flex-col items-center gap-1 flex-1',
                    isActive && 'text-primary',
                    !isActive && !isDone && 'text-muted-foreground'
                  )}
                >
                  {getStepIcon(step)}
                  <span className="text-xs font-medium text-center hidden sm:block">
                    {config.title}
                  </span>
                  <span className="text-xs font-medium text-center sm:hidden">
                    {idx + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        {/* Step Title */}
        <div>
          <h3 className="font-semibold text-lg">
            Paso {currentStepIndex + 1}: {STEP_CONFIG[currentStep].title}
          </h3>
          <p className="text-sm text-muted-foreground">
            {STEP_CONFIG[currentStep].description}
          </p>
        </div>

        {/* Step Content */}
        <div className="min-h-[200px]">
          {renderStepContent()}
        </div>

        {/* Navigation (only show back button if not on first step and current step is done) */}
        {currentStepIndex > 0 && currentStepState.status === 'done' && currentStep !== 'generate' && (
          <div className="flex justify-start">
            <Button variant="ghost" size="sm" onClick={goPrev}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default PreScriptWizard;
