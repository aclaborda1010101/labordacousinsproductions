/**
 * Showrunner Surgery Dialog (V2 - Async with Polling)
 * 
 * Modal for applying dramatic improvements to Episode 1
 * Applies 5 non-negotiable rules to strengthen dramaturgy
 * 
 * V2 Changes:
 * - Polls generation_blocks for result instead of waiting on HTTP response
 * - Recovers pending results on dialog open
 * - Calls apply-showrunner-surgery to commit changes
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Scissors, AlertTriangle, CheckCircle2, Loader2, ChevronDown, ChevronUp, Clock, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';

// Polling configuration
const POLL_INTERVAL_MS = 5000;  // 5 seconds
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;  // 5 minutes max

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
  blockId?: string;
}

type SurgeryLevel = 'light' | 'standard' | 'aggressive';
type DialogStep = 'config' | 'analyzing' | 'preview' | 'applying';

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
  const [step, setStep] = useState<DialogStep>('config');
  const [surgeryLevel, setSurgeryLevel] = useState<SurgeryLevel>('standard');
  const [result, setResult] = useState<SurgeryResult | null>(null);
  const [expandedChanges, setExpandedChanges] = useState<Set<number>>(new Set());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [autoApply, setAutoApply] = useState(false);
  
  const pollIntervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const autoApplyRef = useRef(false);
  
  // Keep ref in sync with state for use in async callbacks
  useEffect(() => {
    autoApplyRef.current = autoApply;
  }, [autoApply]);

  // Check for pending surgery on dialog open
  useEffect(() => {
    if (open && projectId && scriptId) {
      checkForPendingSurgery();
    }
    return () => {
      stopPolling();
    };
  }, [open, projectId, scriptId]);

  const checkForPendingSurgery = async () => {
    try {
      // First check directly in DB for pending_approval blocks (faster & more reliable)
      const { data: pendingBlocks, error: dbError } = await supabase
        .from('generation_blocks')
        .select('id, status, output_data, created_at')
        .eq('project_id', projectId)
        .eq('script_id', scriptId)
        .eq('block_type', 'showrunner_surgery')
        .in('status', ['processing', 'pending_approval'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (dbError) {
        console.error('Error checking pending blocks:', dbError);
        return;
      }

      if (pendingBlocks && pendingBlocks.length > 0) {
        const block = pendingBlocks[0];
        setCurrentBlockId(block.id);

        if (block.status === 'processing') {
          // Resume polling for in-progress surgery
          setStep('analyzing');
          startPolling(block.id);
          toast.info('Reanudando análisis en progreso...');
        } else if (block.status === 'pending_approval' && block.output_data) {
          // Show existing pending result directly
          const outputData = block.output_data as any;
          setResult({
            sceneChanges: outputData.scene_changes || [],
            rewrittenScript: outputData.rewritten_script || {},
            dramaturgChecklist: outputData.dramaturgy_checklist || {},
            stats: outputData.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 },
            blockId: block.id
          });
          setStep('preview');
          toast.success('Hay cambios de cirugía pendientes de aprobación', {
            description: 'Revisa los cambios propuestos y aprueba o rechaza.',
            duration: 5000
          });
        }
        return;
      }

      // Fallback to edge function check (for processing status with heartbeat)
      const response = await invokeAuthedFunction('showrunner-surgery', {
        projectId,
        scriptId,
        checkPending: true
      }) as any;

      if (response.ok && response.blockId) {
        setCurrentBlockId(response.blockId);
        
        if (response.status === 'processing') {
          setStep('analyzing');
          startPolling(response.blockId);
        } else if (response.status === 'pending_approval' && response.sceneChanges) {
          setResult({
            sceneChanges: response.sceneChanges || [],
            rewrittenScript: response.rewrittenScript || {},
            dramaturgChecklist: response.dramaturgChecklist || {},
            stats: response.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 },
            blockId: response.blockId
          });
          setStep('preview');
          toast.success('Hay cambios de cirugía pendientes de aprobación');
        }
      }
    } catch (error) {
      console.error('Error checking pending surgery:', error);
    }
  };

  const startPolling = useCallback((blockId: string) => {
    stopPolling();
    pollStartTimeRef.current = Date.now();
    setElapsedSeconds(0);

    // Timer for elapsed time display
    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - pollStartTimeRef.current) / 1000));
    }, 1000);

    // Polling for result
    pollIntervalRef.current = window.setInterval(async () => {
      const elapsed = Date.now() - pollStartTimeRef.current;
      
      if (elapsed > MAX_POLL_DURATION_MS) {
        stopPolling();
        toast.error('Tiempo máximo de espera excedido');
        setStep('config');
        return;
      }

      try {
        const { data: block, error } = await supabase
          .from('generation_blocks')
          .select('id, status, output_data, error_message')
          .eq('id', blockId)
          .single();

        if (error) {
          console.error('Polling error:', error);
          return;
        }

        if (block.status === 'pending_approval' && block.output_data) {
          stopPolling();
          const outputData = block.output_data as any;
          const surgeryResult: SurgeryResult = {
            sceneChanges: outputData.scene_changes || [],
            rewrittenScript: outputData.rewritten_script || {},
            dramaturgChecklist: outputData.dramaturgy_checklist || {},
            stats: outputData.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 },
            blockId: block.id
          };
          
          // Auto-apply if enabled
          if (autoApplyRef.current) {
            setStep('applying');
            try {
              const applyResponse = await invokeAuthedFunction('apply-showrunner-surgery', {
                blockId: block.id,
                action: 'apply'
              }) as any;
              
              if (applyResponse.ok) {
                toast.success(`Cirugía aplicada automáticamente (v${applyResponse.newVersion})`);
                if (onSurgeryComplete) onSurgeryComplete(surgeryResult);
                onOpenChange(false);
                resetDialog();
                return;
              } else {
                // Fallback to preview if auto-apply fails
                setResult(surgeryResult);
                setStep('preview');
                toast.error('Error auto-aplicando, revisa los cambios manualmente');
              }
            } catch (applyErr) {
              console.error('Auto-apply error:', applyErr);
              setResult(surgeryResult);
              setStep('preview');
              toast.error('Error auto-aplicando, revisa los cambios manualmente');
            }
          } else {
            setResult(surgeryResult);
            setStep('preview');
            toast.success('Análisis completado');
          }
        } else if (block.status === 'failed') {
          stopPolling();
          toast.error(block.error_message || 'Error en la cirugía');
          setStep('config');
        }
      } catch (err) {
        console.error('Poll request failed:', err);
      }
    }, POLL_INTERVAL_MS);
  }, [onOpenChange, onSurgeryComplete]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const handleAnalyze = async () => {
    setStep('analyzing');
    setElapsedSeconds(0);
    
    // Start timer immediately for visual feedback
    pollStartTimeRef.current = Date.now();
    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - pollStartTimeRef.current) / 1000));
    }, 1000);
    
    try {
      const response = await invokeAuthedFunction('showrunner-surgery', {
        projectId,
        scriptId,
        episodeNumber: 1,
        surgeryLevel,
        preserveDialogueStyle: true
      }) as any;

      if (!response.ok) {
        throw new Error(response.error || 'Error iniciando la cirugía');
      }

      const blockId = response.blockId;
      setCurrentBlockId(blockId);

      // If result came back immediately (fast response), show it
      if (response.status === 'pending_approval' && response.sceneChanges) {
        stopPolling(); // Stop the timer we started
        setResult({
          sceneChanges: response.sceneChanges || [],
          rewrittenScript: response.rewrittenScript || {},
          dramaturgChecklist: response.dramaturgChecklist || {},
          stats: response.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 },
          blockId
        });
        setStep('preview');
        return;
      }

      // Otherwise, start polling (timer already running, just add poll interval)
      pollIntervalRef.current = window.setInterval(async () => {
        const elapsed = Date.now() - pollStartTimeRef.current;
        
        if (elapsed > MAX_POLL_DURATION_MS) {
          stopPolling();
          toast.error('Tiempo máximo de espera excedido');
          setStep('config');
          return;
        }

        try {
          const { data: block, error } = await supabase
            .from('generation_blocks')
            .select('id, status, output_data, error_message')
            .eq('id', blockId)
            .single();

          if (error) {
            console.error('Polling error:', error);
            return;
          }

          if (block.status === 'pending_approval' && block.output_data) {
            stopPolling();
            const outputData = block.output_data as any;
            const surgeryResult: SurgeryResult = {
              sceneChanges: outputData.scene_changes || [],
              rewrittenScript: outputData.rewritten_script || {},
              dramaturgChecklist: outputData.dramaturgy_checklist || {},
              stats: outputData.stats || { scenesModified: 0, dialoguesAdjusted: 0, consequencesAdded: 0, durationMs: 0 },
              blockId: block.id
            };
            
            // Auto-apply if enabled
            if (autoApplyRef.current) {
              setStep('applying');
              try {
                const applyResponse = await invokeAuthedFunction('apply-showrunner-surgery', {
                  blockId: block.id,
                  action: 'apply'
                }) as any;
                
                if (applyResponse.ok) {
                  toast.success(`Cirugía aplicada automáticamente (v${applyResponse.newVersion})`);
                  if (onSurgeryComplete) onSurgeryComplete(surgeryResult);
                  onOpenChange(false);
                  resetDialog();
                  return;
                } else {
                  setResult(surgeryResult);
                  setStep('preview');
                  toast.error('Error auto-aplicando, revisa los cambios manualmente');
                }
              } catch (applyErr) {
                console.error('Auto-apply error:', applyErr);
                setResult(surgeryResult);
                setStep('preview');
                toast.error('Error auto-aplicando, revisa los cambios manualmente');
              }
            } else {
              setResult(surgeryResult);
              setStep('preview');
              toast.success('Análisis completado');
            }
          } else if (block.status === 'failed') {
            stopPolling();
            toast.error(block.error_message || 'Error en la cirugía');
            setStep('config');
          }
        } catch (err) {
          console.error('Poll request failed:', err);
        }
      }, POLL_INTERVAL_MS);

    } catch (error) {
      console.error('Surgery error:', error);
      stopPolling();
      toast.error('Error al iniciar el análisis del guion');
      setStep('config');
    }
  };

  const handleApply = async () => {
    if (!result?.blockId) {
      toast.error('No hay resultado para aplicar');
      return;
    }

    setStep('applying');
    
    try {
      const response = await invokeAuthedFunction('apply-showrunner-surgery', {
        blockId: result.blockId,
        action: 'apply'
      }) as any;

      if (!response.ok) {
        throw new Error(response.error || 'Error aplicando la cirugía');
      }

      if (onSurgeryComplete) {
        onSurgeryComplete(result);
      }
      
      toast.success(`Cirugía aplicada (v${response.newVersion})`);
      onOpenChange(false);
      resetDialog();
      
    } catch (error) {
      console.error('Apply error:', error);
      toast.error('Error al aplicar la cirugía');
      setStep('preview');
    }
  };

  const handleReject = async () => {
    if (!result?.blockId) {
      onOpenChange(false);
      resetDialog();
      return;
    }

    try {
      await invokeAuthedFunction('apply-showrunner-surgery', {
        blockId: result.blockId,
        action: 'reject'
      });
      toast.info('Cirugía rechazada');
    } catch (error) {
      console.error('Reject error:', error);
    }

    onOpenChange(false);
    resetDialog();
  };

  const resetDialog = () => {
    stopPolling();
    setStep('config');
    setResult(null);
    setExpandedChanges(new Set());
    setElapsedSeconds(0);
    setCurrentBlockId(null);
    setAutoApply(false);
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressInfo = (seconds: number) => {
    const maxSeconds = MAX_POLL_DURATION_MS / 1000; // 300s
    const progress = Math.min((seconds / maxSeconds) * 100, 99);
    
    let message = "Analizando estructura del guion...";
    if (seconds > 60) message = "Aplicando reglas dramatúrgicas...";
    if (seconds > 120) message = "Refinando cambios propuestos...";
    if (seconds > 180) message = "Finalizando análisis...";
    
    return { progress, message };
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) resetDialog();
      onOpenChange(newOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col min-h-0">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5 text-amber-500" />
            Cirugía de Showrunner
          </DialogTitle>
          <DialogDescription>
            Mejora dramatúrgica del Episodio 1 aplicando 5 reglas no negociables.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4">
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

              <Separator />

              {/* Auto-apply option */}
              <div className="flex items-start space-x-3">
                <Checkbox 
                  id="autoApply" 
                  checked={autoApply} 
                  onCheckedChange={(checked) => setAutoApply(checked === true)} 
                  className="mt-0.5"
                />
                <Label htmlFor="autoApply" className="cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">Aplicar cambios automáticamente al finalizar</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Los cambios se aplicarán sin revisión previa. Útil si confías en el sistema.
                  </p>
                </Label>
              </div>

              <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
                <CardContent className="pt-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      Esta operación puede tardar hasta 3 minutos. El resultado se guardará automáticamente.
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
              <p className="text-sm text-muted-foreground mb-4">
                {getProgressInfo(elapsedSeconds).message}
              </p>
              
              {/* Progress bar */}
              <div className="w-full max-w-xs mb-4">
                <Progress 
                  value={getProgressInfo(elapsedSeconds).progress} 
                  className="h-2"
                />
              </div>
              
              {/* Timer */}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-mono">{formatTime(elapsedSeconds)}</span>
                <span className="text-xs">/ 5:00 máx</span>
              </div>
              
              <p className="text-xs text-muted-foreground mt-4 text-center max-w-sm">
                El resultado se guarda automáticamente. Puedes cerrar este diálogo y volver más tarde.
              </p>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="h-12 w-12 animate-spin text-green-500 mb-4" />
              <p className="text-lg font-medium">Aplicando cambios...</p>
              <p className="text-sm text-muted-foreground">Actualizando el guion</p>
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
                                <p className="text-sm bg-red-50 dark:bg-red-950/30 p-2 rounded border-l-2 border-red-300 dark:border-red-700">
                                  {change.original_excerpt}
                                </p>
                              </div>
                            )}
                            {change.revised_excerpt && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Revisado:</p>
                                <p className="text-sm bg-green-50 dark:bg-green-950/30 p-2 rounded border-l-2 border-green-300 dark:border-green-700">
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
          {step === 'analyzing' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar (el análisis continúa)
            </Button>
          )}
          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={handleReject}>
                Rechazar cambios
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
