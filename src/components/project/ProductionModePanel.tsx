import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Zap, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Sparkles,
  Camera,
  Smile,
  Image,
  HelpCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ProductionModePanelProps {
  characterId: string;
  characterName: string;
  loraTrainingStatus: 'none' | 'ready_to_train' | 'training' | 'completed' | 'failed';
  loraTriggerWord?: string;
  approvedSlotsCount: number;
  onTrainingComplete?: () => void;
}

export function ProductionModePanel({
  characterId,
  characterName,
  loraTrainingStatus,
  loraTriggerWord,
  approvedSlotsCount,
  onTrainingComplete
}: ProductionModePanelProps) {
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [showInfo, setShowInfo] = useState(false);

  const canTrainLora = approvedSlotsCount >= 6 && loraTrainingStatus === 'none';
  const isCompleted = loraTrainingStatus === 'completed';
  const isCurrentlyTraining = loraTrainingStatus === 'training' || isTraining;
  const hasFailed = loraTrainingStatus === 'failed';

  // Poll for training progress
  useEffect(() => {
    if (!isCurrentlyTraining) return;

    const pollInterval = setInterval(async () => {
      const { data: log } = await supabase
        .from('lora_training_logs')
        .select('progress_percentage, status')
        .eq('character_id', characterId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (log) {
        setTrainingProgress(log.progress_percentage || 0);

        if (log.status === 'completed') {
          clearInterval(pollInterval);
          setIsTraining(false);
          toast.success('¡Entrenamiento LoRA completado!');
          onTrainingComplete?.();
        } else if (log.status === 'failed') {
          clearInterval(pollInterval);
          setIsTraining(false);
          toast.error('El entrenamiento LoRA falló');
        }
      }
    }, 5000);

    // Cleanup after 1 hour
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      setIsTraining(false);
    }, 3600000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [isCurrentlyTraining, characterId, onTrainingComplete]);

  const handleTrainLora = async () => {
    if (!canTrainLora) return;

    const confirm = window.confirm(
      `¿Entrenar modelo LoRA para ${characterName}?\n\n` +
      `Costo: $5 (único pago)\n` +
      `Tiempo: ~20-30 minutos\n\n` +
      `Esto habilitará consistencia del 95%+ para todas las generaciones futuras.`
    );

    if (!confirm) return;

    setIsTraining(true);
    setTrainingProgress(0);

    try {
      const { data, error } = await supabase.functions.invoke('train-character-lora', {
        body: { characterId }
      });

      if (error) throw error;

      toast.success('¡Entrenamiento LoRA iniciado!', {
        description: `Tiempo estimado: 20-30 minutos. Te notificaremos cuando termine.`
      });

    } catch (error: any) {
      console.error('LoRA training error:', error);
      toast.error(error.message || 'Error al iniciar entrenamiento LoRA');
      setIsTraining(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Production Mode
          {isCompleted && (
            <Badge className="ml-2 bg-green-500/20 text-green-600 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Activo
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCompleted ? (
          // LoRA COMPLETED
          <Alert className="bg-green-500/10 border-green-500/30">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-600">¡Listo para producción!</AlertTitle>
            <AlertDescription className="text-green-600/80">
              Modelo LoRA entrenado. Genera variaciones ilimitadas con 95%+ de consistencia.
              <div className="mt-2">
                <Badge variant="outline">
                  Trigger: {loraTriggerWord}
                </Badge>
              </div>
            </AlertDescription>
          </Alert>
        ) : isCurrentlyTraining ? (
          // TRAINING IN PROGRESS
          <div className="space-y-4">
            <Alert className="bg-primary/10 border-primary/30">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertTitle>Entrenando modelo LoRA...</AlertTitle>
              <AlertDescription>
                Esto puede tardar 20-30 minutos. Puedes cerrar esta página - te notificaremos cuando termine.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progreso</span>
                <span>{trainingProgress}%</span>
              </div>
              <Progress value={trainingProgress} />
            </div>
          </div>
        ) : hasFailed ? (
          // TRAINING FAILED
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Entrenamiento fallido</AlertTitle>
            <AlertDescription>
              Por favor contacta soporte o intenta de nuevo más tarde.
            </AlertDescription>
          </Alert>
        ) : canTrainLora ? (
          // READY TO TRAIN
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Entrena un modelo LoRA dedicado para {characterName} para desbloquear:
            </p>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                95%+ consistencia facial
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Poses ilimitadas
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Keyframes perfectos
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                Cualquier contexto
              </div>
            </div>
            
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-sm font-medium">Inversión única</p>
                <p className="text-xs text-muted-foreground">
                  Tiempo: ~20-30 minutos
                </p>
              </div>
              <span className="text-2xl font-bold">$5</span>
            </div>

            <Button onClick={handleTrainLora} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              Entrenar modelo LoRA
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              <AlertCircle className="h-3 w-3 inline mr-1" />
              Importante: Solo entrena cuando el diseño del personaje sea final.
              Cualquier cambio después requerirá re-entrenar ($5).
            </p>
          </div>
        ) : (
          // NOT READY YET
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Requisitos no cumplidos</AlertTitle>
            <AlertDescription>
              Necesitas al menos 6 slots aprobados antes de entrenar.
              <div className="mt-2">
                <Progress value={(approvedSlotsCount / 6) * 100} className="h-2" />
                <p className="text-xs mt-1">
                  Actual: {approvedSlotsCount}/6 slots aprobados
                </p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Info collapsible */}
        <Collapsible open={showInfo} onOpenChange={setShowInfo}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full text-xs">
              <HelpCircle className="h-3 w-3 mr-1" />
              ¿Cómo funciona esto?
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="text-xs text-muted-foreground space-y-2 p-3 bg-muted/30 rounded-lg">
              <p>
                <strong>Sin Production Mode:</strong> Las imágenes se generan usando tus fotos de referencia (~75% consistencia). Bueno para desarrollo inicial del personaje.
              </p>
              <p>
                <strong>Con Production Mode:</strong> Entrenamos un modelo LoRA personalizado específicamente con tus imágenes aprobadas. Este modelo aprende las características faciales exactas, proporciones y características (~95% consistencia). Perfecto para trabajo de producción con muchos shots.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
