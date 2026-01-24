/**
 * Showrunner Surgery Dialog
 * 
 * Modal for applying dramatic improvements to Episode 1
 * Applies 5 non-negotiable rules to strengthen dramaturgy
 */

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Scissors, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ShowrunnerSurgeryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  scriptId: string;
  onSurgeryComplete?: (result: SurgeryResult) => void;
}

interface SceneChange {
  scene_number: number;
  change_summary: string;
  change_type: 'consequence' | 'dirty_decision' | 'action_over_reflection' | 'no_return_point' | 'tone_preserved';
  original_excerpt?: string;
  revised_excerpt?: string;
}

interface DramaturgChecklist {
  early_consequence_present: boolean;
  early_consequence_description?: string;
  dirty_decision_present: boolean;
  dirty_decision_description?: string;
  action_over_reflection: boolean;
  pilot_ending_promise: string;
}

interface SurgeryResult {
  sceneChanges: SceneChange[];
  rewrittenScript: any;
  dramaturgChecklist: DramaturgChecklist;
  stats: {
    scenesModified: number;
    dialoguesAdjusted: number;
    consequencesAdded: number;
    durationMs: number;
  };
}

type SurgeryLevel = 'light' | 'standard' | 'aggressive';

const RULES = [
  { id: 1, title: 'Preservar tono y voz', description: 'Mantener estilo de diálogos, subtexto y atmósfera sin simplificar.' },
  { id: 2, title: 'Consecuencia directa temprana', description: 'Primera intervención afecta a un protagonista, no solo a terceros.' },
  { id: 3, title: 'Decisión moralmente sucia', description: 'Un protagonista decide conscientemente algo sabiendo el coste.' },
  { id: 4, title: 'Acción sobre advertencia', description: 'La ventana rompe escenas, no solo es observada o comentada.' },
  { id: 5, title: 'Final con punto de no retorno', description: 'El episodio cierra con una promesa determinante.' }
];

const LEVEL_DESCRIPTIONS: Record<SurgeryLevel, { label: string; description: string }> = {
  light: { label: 'Ligera', description: 'Cambios mínimos. Solo lo estrictamente necesario.' },
  standard: { label: 'Estándar', description: 'Cambios moderados. Reescribe escenas necesarias.' },
  aggressive: { label: 'Agresiva', description: 'Cambios profundos. Reconstruye para máximo impacto.' }
};

const CHANGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  consequence: { label: 'Consecuencia', color: 'bg-red-500' },
  dirty_decision: { label: 'Decisión sucia', color: 'bg-amber-500' },
  action_over_reflection: { label: 'Más acción', color: 'bg-blue-500' },
  no_return_point: { label: 'Sin retorno', color: 'bg-purple-500' },
  tone_preserved: { label: 'Tono', color: 'bg-green-500' }
};

export function ShowrunnerSurgeryDialog({
  open,
  onOpenChange,
  projectId,
  scriptId,
  onSurgeryComplete
}: ShowrunnerSurgeryDialogProps) {
  const [step, setStep] = useState<'config' | 'analyzing' | 'preview' | 'applying'>('config');
  const [surgeryLevel, setSurgeryLevel] = useState<SurgeryLevel>('standard');
  const [result, setResult] = useState<SurgeryResult | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<Set<number>>(new Set());

  const handleAnalyze = async () => {
    setStep('analyzing');
    try {
      const response = await invokeAuthedFunction('showrunner-surgery', {
        projectId,
        scriptId,
        episodeNumber: 1,
        surgeryLevel,
        preserveDialogueStyle: true
      }) as { ok?: boolean; error?: string; sceneChanges?: SceneChange[]; rewrittenScript?: any; dramaturgChecklist?: DramaturgChecklist; stats?: SurgeryResult['stats'] };

      if (!response.ok) {
        throw new Error(response.error || 'Error en la cirugía');
      }

      setResult({
        sceneChanges: response.sceneChanges || [],
        rewrittenScript: response.rewrittenScript || {},
        dramaturgChecklist: response.dramaturgChecklist || { early_consequence_present: false, dirty_decision_present: false, action_over_reflection: false, pilot_ending_promise: '' },
        stats: response.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 }
      });
      setStep('preview');
    } catch (error) {
      console.error('Surgery error:', error);
      toast.error('Error al analizar el guion');
      setStep('config');
    }
  };

  const handleApply = () => {
    if (result && onSurgeryComplete) {
      onSurgeryComplete(result);
    }
    toast.success('Cirugía aplicada correctamente');
    onOpenChange(false);
    resetDialog();
  };

  const resetDialog = () => {
    setStep('config');
    setResult(null);
    setExpandedChanges(new Set());
  };

  const toggleChange = (sceneNumber: number) => {
    const newExpanded = new Set(expandedChanges);
    if (newExpanded.has(sceneNumber)) {
      newExpanded.delete(sceneNumber);
    } else {
      newExpanded.add(sceneNumber);
    }
    setExpandedChanges(newExpanded);
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) resetDialog();
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-amber-500" />
            Cirugía de Showrunner
          </DialogTitle>
          <DialogDescription>
            Mejora dramatúrgica del Episodio 1 aplicando 5 reglas no negociables.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {step === 'config' && (
            <div className="space-y-6">
              {/* Rules */}
              <div>
                <h4 className="text-sm font-medium mb-3">Reglas que se aplicarán:</h4>
                <div className="space-y-2">
                  {RULES.map((rule) => (
                    <div key={rule.id} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-medium">{rule.title}</span>
                        <span className="text-muted-foreground"> — {rule.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Surgery Level */}
              <div>
                <h4 className="text-sm font-medium mb-3">Nivel de cirugía:</h4>
                <RadioGroup
                  value={surgeryLevel}
                  onValueChange={(v) => setSurgeryLevel(v as SurgeryLevel)}
                  className="space-y-3"
                >
                  {(Object.entries(LEVEL_DESCRIPTIONS) as [SurgeryLevel, { label: string; description: string }][]).map(([level, info]) => (
                    <div key={level} className="flex items-start space-x-3">
                      <RadioGroupItem value={level} id={level} className="mt-1" />
                      <Label htmlFor={level} className="cursor-pointer">
                        <span className="font-medium">{info.label}</span>
                        <p className="text-sm text-muted-foreground">{info.description}</p>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                    <p className="text-sm text-amber-800">
                      Esta operación analizará y reescribirá el guion. El original se conservará en el historial.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-amber-500 mb-4" />
              <p className="text-lg font-medium">Analizando guion...</p>
              <p className="text-sm text-muted-foreground">Aplicando las 5 reglas dramatúrgicas</p>
            </div>
          )}

          {step === 'preview' && result && (
            <div className="space-y-6">
              {/* Checklist */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Verificación Dramatúrgica</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    {result.dramaturgChecklist.early_consequence_present ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-sm">Consecuencia temprana</span>
                    {result.dramaturgChecklist.early_consequence_description && (
                      <span className="text-xs text-muted-foreground">
                        — {result.dramaturgChecklist.early_consequence_description}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {result.dramaturgChecklist.dirty_decision_present ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-sm">Decisión moralmente sucia</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.dramaturgChecklist.action_over_reflection ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="text-sm">Acción sobre reflexión</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Promesa de final:</span>
                    <Badge variant="outline">{result.dramaturgChecklist.pilot_ending_promise}</Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{result.stats.scenesModified}</p>
                    <p className="text-xs text-muted-foreground">Escenas modificadas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{result.stats.consequencesAdded}</p>
                    <p className="text-xs text-muted-foreground">Consecuencias añadidas</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <p className="text-2xl font-bold">{(result.stats.durationMs / 1000).toFixed(1)}s</p>
                    <p className="text-xs text-muted-foreground">Tiempo de análisis</p>
                  </CardContent>
                </Card>
              </div>

              {/* Scene Changes */}
              <div>
                <h4 className="text-sm font-medium mb-3">Cambios por escena:</h4>
                <div className="space-y-2">
                  {result.sceneChanges.map((change) => (
                    <Collapsible
                      key={change.scene_number}
                      open={expandedChanges.has(change.scene_number)}
                      onOpenChange={() => toggleChange(change.scene_number)}
                    >
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardContent className="pt-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge className={CHANGE_TYPE_LABELS[change.change_type]?.color || 'bg-gray-500'}>
                                  Escena {change.scene_number}
                                </Badge>
                                <span className="text-sm">
                                  {CHANGE_TYPE_LABELS[change.change_type]?.label || change.change_type}
                                </span>
                              </div>
                              {expandedChanges.has(change.scene_number) ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-2">{change.change_summary}</p>
                          </CardContent>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0 space-y-3">
                            {change.original_excerpt && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Original:</p>
                                <p className="text-sm bg-red-50 p-2 rounded border-l-2 border-red-300">
                                  {change.original_excerpt}
                                </p>
                              </div>
                            )}
                            {change.revised_excerpt && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Revisado:</p>
                                <p className="text-sm bg-green-50 p-2 rounded border-l-2 border-green-300">
                                  {change.revised_excerpt}
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  ))}
                </div>
              </div>
            </div>
          )}
        </ScrollArea>

        <DialogFooter className="mt-4">
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAnalyze} className="bg-amber-500 hover:bg-amber-600">
                <Scissors className="h-4 w-4 mr-2" />
                Analizar guion
              </Button>
            </>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={() => setStep('config')}>
                Volver a configurar
              </Button>
              <Button onClick={handleApply} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Aplicar cirugía
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
