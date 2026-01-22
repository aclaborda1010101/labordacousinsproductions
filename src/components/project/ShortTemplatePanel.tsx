/**
 * ShortTemplatePanel - Template structure panel for short format projects
 * Shows recommended structure, step progress, and actions
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LayoutTemplate,
  ChevronDown,
  ChevronUp,
  Check,
  Circle,
  PlayCircle,
  ArrowRight,
  Sparkles,
  X,
  Settings2,
  AlertTriangle,
} from 'lucide-react';
import { ShortTemplate, TemplateStep, TemplateQAWarning } from '@/lib/shortTemplates';
import { UserLevel } from '@/lib/editorialKnowledgeBase';

interface ShortTemplatePanelProps {
  userLevel: UserLevel;
  template: ShortTemplate | null;
  availableTemplates: ShortTemplate[];
  currentStepIndex: number;
  totalSteps: number;
  progress: number;
  isComplete: boolean;
  currentStep: TemplateStep | null;
  warnings: TemplateQAWarning[];
  loading: boolean;
  onApplyTemplate: (templateId: string) => void;
  onAdvanceStep: () => void;
  onGoToStep: (index: number) => void;
  onClearTemplate: () => void;
  onGenerateForStep: () => void;
}

export function ShortTemplatePanel({
  userLevel,
  template,
  availableTemplates,
  currentStepIndex,
  totalSteps,
  progress,
  isComplete,
  currentStep,
  warnings,
  loading,
  onApplyTemplate,
  onAdvanceStep,
  onGoToStep,
  onClearTemplate,
  onGenerateForStep,
}: ShortTemplatePanelProps) {
  const [expanded, setExpanded] = React.useState(false); // Collapsed by default
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<string>('');

  const isPro = userLevel === 'pro';

  // No template selected yet
  if (!template) {
    return (
      <Card className="border-dashed border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            Estructura Recomendada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Usa un template para guiar la estructura de tu cortometraje.
          </p>

          {availableTemplates.length > 0 ? (
            <div className="space-y-3">
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un template..." />
                </SelectTrigger>
                <SelectContent>
                  {availableTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex flex-col">
                        <span>{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.steps.length} pasos • {t.duration_range}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={() => onApplyTemplate(selectedTemplateId)}
                disabled={!selectedTemplateId || loading}
                className="w-full"
              >
                <LayoutTemplate className="h-4 w-4 mr-2" />
                Aplicar Template
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No hay templates disponibles para este estilo.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Template active - Normal mode: simplified view
  if (!isPro) {
    return (
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutTemplate className="h-4 w-4 text-primary" />
              {template.name}
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {currentStepIndex + 1}/{totalSteps}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Progress bar */}
          <Progress value={progress} className="h-2" />

          {/* Current step */}
          {currentStep && !isComplete && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
              <div className="flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{currentStep.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{currentStep.notes}</p>
              <Badge variant="outline" className="text-xs">
                {currentStep.shotType === 'character' ? '👤 Personaje' : 
                 currentStep.shotType === 'location' ? '🏠 Locación' : '🎬 Keyframe'}
              </Badge>
            </div>
          )}

          {/* Complete message */}
          {isComplete && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">¡Template completado!</span>
            </div>
          )}

          {/* Action buttons */}
          {!isComplete && (
            <Button onClick={onGenerateForStep} className="w-full" variant="lime">
              <Sparkles className="h-4 w-4 mr-2" />
              Generar: {currentStep?.label}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Template active - Pro mode: full control
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className="border-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 p-0 h-auto">
                <LayoutTemplate className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">{template.name}</span>
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {currentStepIndex + 1}/{totalSteps}
              </Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClearTemplate}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <Progress value={progress} className="h-1 mt-2" />
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-3 pt-2">
            {/* Template info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Ritmo: {template.pacing}</span>
              <span>•</span>
              <span>{template.duration_range}</span>
            </div>

            {/* QA Warnings */}
            {warnings.length > 0 && (
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-xs">
                    <AlertTriangle className="h-3 w-3 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-amber-700">{w.message}</p>
                      <p className="text-muted-foreground">{w.suggestion}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Steps list */}
            <div className="space-y-2">
              {template.steps.map((step, index) => {
                const isPast = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                const isFuture = index > currentStepIndex;

                return (
                  <div
                    key={step.stepKey}
                    className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                      isCurrent ? 'bg-primary/10 border border-primary/30' :
                      isPast ? 'bg-muted/50' : 'hover:bg-muted/30'
                    }`}
                    onClick={() => onGoToStep(index)}
                  >
                    {/* Status icon */}
                    {isPast && <Check className="h-4 w-4 text-green-600 mt-0.5" />}
                    {isCurrent && <PlayCircle className="h-4 w-4 text-primary mt-0.5" />}
                    {isFuture && <Circle className="h-4 w-4 text-muted-foreground mt-0.5" />}

                    {/* Step content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${isCurrent ? 'font-medium' : ''} ${isPast ? 'text-muted-foreground' : ''}`}>
                          {step.label}
                        </span>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {step.shotType}
                        </Badge>
                      </div>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground mt-1">{step.notes}</p>
                      )}
                      {isCurrent && step.recommendedPresetIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {step.recommendedPresetIds.slice(0, 3).map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px]">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              {!isComplete && (
                <>
                  <Button onClick={onGenerateForStep} className="flex-1" variant="gold" size="sm">
                    <Sparkles className="h-4 w-4 mr-1" />
                    Generar paso
                  </Button>
                  <Button onClick={onAdvanceStep} variant="outline" size="sm">
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}
              {isComplete && (
                <Button variant="outline" className="w-full" size="sm" onClick={onClearTemplate}>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Completado - Limpiar
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
