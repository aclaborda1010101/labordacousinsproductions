import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Upload, Sparkles, Loader2, CheckCircle, User, Camera, 
  Shirt, RefreshCw, XCircle, Zap, ImagePlus
} from 'lucide-react';

interface CharacterQuickStartProps {
  characterId: string;
  characterName: string;
  projectId: string;
  onComplete?: () => void;
}

interface GeneratedSlot {
  name: string;
  status: 'pending' | 'generating' | 'success' | 'error';
  image_url?: string;
  error?: string;
}

const SLOT_PIPELINE = [
  { type: 'closeup', name: 'Identity Closeup', icon: User },
  { type: 'turnaround', viewAngle: 'front', name: 'Front View', icon: Camera },
  { type: 'turnaround', viewAngle: 'side', name: 'Side View', icon: Camera },
  { type: 'turnaround', viewAngle: 'back', name: 'Back View', icon: Camera },
  { type: 'expression', emotion: 'neutral', name: 'Neutral', icon: User },
  { type: 'expression', emotion: 'happy', name: 'Happy', icon: User },
  { type: 'expression', emotion: 'angry', name: 'Angry', icon: User },
];

export function CharacterQuickStart({ 
  characterId, 
  characterName, 
  projectId,
  onComplete 
}: CharacterQuickStartProps) {
  // Upload state
  const [faceImage, setFaceImage] = useState<File | null>(null);
  const [bodyImage, setBodyImage] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [bodyPreview, setBodyPreview] = useState<string | null>(null);
  const [celebrityMix, setCelebrityMix] = useState('');
  
  // Pipeline state
  const [step, setStep] = useState<'upload' | 'analyzing' | 'generating' | 'complete'>('upload');
  const [analyzing, setAnalyzing] = useState(false);
  const [visualDNA, setVisualDNA] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [completedSlots, setCompletedSlots] = useState<GeneratedSlot[]>([]);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);

  const faceInputRef = useRef<HTMLInputElement>(null);
  const bodyInputRef = useRef<HTMLInputElement>(null);

  const handleFaceUpload = (file: File | null) => {
    if (!file) return;
    setFaceImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setFacePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleBodyUpload = (file: File | null) => {
    if (!file) return;
    setBodyImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setBodyPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadToStorage = async (file: File, path: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('character-references')
      .upload(path, file, { upsert: true });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('character-references')
      .getPublicUrl(data.path);

    return urlData.publicUrl;
  };

  const handleAnalyze = async () => {
    if (!faceImage || !bodyImage) {
      toast.error('Sube ambas imágenes (rostro y cuerpo)');
      return;
    }

    setAnalyzing(true);
    setStep('analyzing');

    try {
      // Upload images to storage
      const timestamp = Date.now();
      const faceUrl = await uploadToStorage(
        faceImage, 
        `${projectId}/${characterId}/reference_face_${timestamp}.jpg`
      );
      const bodyUrl = await uploadToStorage(
        bodyImage, 
        `${projectId}/${characterId}/reference_body_${timestamp}.jpg`
      );

      toast.info('Analizando referencias con IA...');

      // Call analysis function
      const { data, error } = await supabase.functions.invoke('analyze-character-references', {
        body: {
          characterId,
          projectId,
          faceImageUrl: faceUrl,
          bodyImageUrl: bodyUrl,
          celebrityMix: celebrityMix || undefined,
          characterName
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error en análisis');

      setVisualDNA(data.visualDNA);
      toast.success('Visual DNA extraído correctamente');
      
      // Auto-continue to generation
      setStep('generating');
      await generatePackPipeline();

    } catch (err: any) {
      console.error('Analysis error:', err);
      toast.error(err.message || 'Error al analizar referencias');
      setStep('upload');
    } finally {
      setAnalyzing(false);
    }
  };

  const generatePackPipeline = async () => {
    setGenerating(true);
    const controller = new AbortController();
    setCancelController(controller);

    const slots: GeneratedSlot[] = SLOT_PIPELINE.map(s => ({
      name: s.name,
      status: 'pending'
    }));
    setCompletedSlots(slots);

    try {
      for (let i = 0; i < SLOT_PIPELINE.length; i++) {
        if (controller.signal.aborted) {
          toast.info('Generación cancelada');
          break;
        }

        const slotConfig = SLOT_PIPELINE[i];
        setCurrentSlotIndex(i);
        
        // Update status to generating
        setCompletedSlots(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'generating' } : s
        ));

        toast.info(`Generando ${slotConfig.name}...`);

        try {
          const { data, error } = await supabase.functions.invoke('generate-character', {
            body: {
              characterId,
              characterName,
              characterBio: '', // Will use Visual DNA
              slotType: slotConfig.type,
              viewAngle: slotConfig.viewAngle,
              expressionName: slotConfig.emotion,
              useReferenceAnchoring: true,
              referenceWeight: 0.75
            }
          });

          if (error) throw error;

          if (data?.success) {
            setCompletedSlots(prev => prev.map((s, idx) => 
              idx === i ? { 
                ...s, 
                status: 'success', 
                image_url: data.image_url 
              } : s
            ));
            toast.success(`${slotConfig.name} ✓`);
          } else {
            throw new Error(data?.error || 'Generation failed');
          }

        } catch (slotError: any) {
          console.error(`Error generating ${slotConfig.name}:`, slotError);
          setCompletedSlots(prev => prev.map((s, idx) => 
            idx === i ? { 
              ...s, 
              status: 'error', 
              error: slotError.message 
            } : s
          ));
          // Continue with next slot
        }

        // Small delay between generations
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setStep('complete');
      const successCount = completedSlots.filter(s => s.status === 'success').length;
      toast.success(`Pack generado: ${successCount}/${SLOT_PIPELINE.length} slots`);
      
      if (onComplete) onComplete();

    } catch (err: any) {
      console.error('Pipeline error:', err);
      toast.error('Error en el pipeline de generación');
    } finally {
      setGenerating(false);
      setCancelController(null);
    }
  };

  const cancelGeneration = () => {
    if (cancelController) {
      cancelController.abort();
      setCancelController(null);
    }
    setGenerating(false);
    toast.info('Generación cancelada');
  };

  const resetFlow = () => {
    setStep('upload');
    setFaceImage(null);
    setBodyImage(null);
    setFacePreview(null);
    setBodyPreview(null);
    setCelebrityMix('');
    setVisualDNA(null);
    setCompletedSlots([]);
    setCurrentSlotIndex(0);
  };

  const progress = step === 'generating' 
    ? Math.round(((currentSlotIndex + 1) / SLOT_PIPELINE.length) * 100)
    : step === 'complete' ? 100 : 0;

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Quick Character Setup
        </CardTitle>
        <CardDescription>
          Sube 2 imágenes de referencia y generamos el pack completo automáticamente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Face Upload */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Referencia de Rostro
                  <Badge variant="destructive" className="text-xs">Requerido</Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Closeup del rostro, buena iluminación, expresión neutral
                </p>
                
                <div 
                  onClick={() => faceInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
                    transition-colors hover:border-primary/50 hover:bg-primary/5
                    ${facePreview ? 'border-green-500/50' : 'border-muted-foreground/30'}
                  `}
                >
                  {facePreview ? (
                    <img 
                      src={facePreview} 
                      alt="Face preview" 
                      className="w-32 h-32 object-cover rounded-lg mx-auto"
                    />
                  ) : (
                    <div className="py-8 space-y-2">
                      <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click para subir
                      </p>
                    </div>
                  )}
                </div>
                
                <input
                  ref={faceInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFaceUpload(e.target.files?.[0] || null)}
                />
              </div>

              {/* Body Upload */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  Referencia de Cuerpo
                  <Badge variant="destructive" className="text-xs">Requerido</Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Full body, outfit visible, pose de pie
                </p>
                
                <div 
                  onClick={() => bodyInputRef.current?.click()}
                  className={`
                    border-2 border-dashed rounded-lg p-4 text-center cursor-pointer
                    transition-colors hover:border-primary/50 hover:bg-primary/5
                    ${bodyPreview ? 'border-green-500/50' : 'border-muted-foreground/30'}
                  `}
                >
                  {bodyPreview ? (
                    <img 
                      src={bodyPreview} 
                      alt="Body preview" 
                      className="w-32 h-48 object-cover rounded-lg mx-auto"
                    />
                  ) : (
                    <div className="py-8 space-y-2">
                      <ImagePlus className="w-8 h-8 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Click para subir
                      </p>
                    </div>
                  )}
                </div>
                
                <input
                  ref={bodyInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleBodyUpload(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            {/* Celebrity Mix (Optional) */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Celebrity Likeness (Opcional)
              </Label>
              <Input
                placeholder="Ej: 60% Brad Pitt + 40% Idris Elba"
                value={celebrityMix}
                onChange={(e) => setCelebrityMix(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mezcla con características de celebridades para el prompt
              </p>
            </div>

            {/* Generate Button */}
            <Button 
              onClick={handleAnalyze}
              disabled={!faceImage || !bodyImage || analyzing}
              size="lg"
              className="w-full"
            >
              {analyzing ? (
                <>
                  <Loader2 className="animate-spin mr-2" />
                  Analizando referencias...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2" />
                  Generar Character Pack
                </>
              )}
            </Button>
          </>
        )}

        {/* STEP 2: ANALYZING */}
        {step === 'analyzing' && (
          <div className="text-center py-8 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">Analizando referencias con IA...</p>
              <p className="text-sm text-muted-foreground">
                Extrayendo Visual DNA (características físicas, colores, rasgos)
              </p>
            </div>
          </div>
        )}

        {/* STEP 3: GENERATING */}
        {step === 'generating' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                Generando: {SLOT_PIPELINE[currentSlotIndex]?.name || 'Completando...'}
              </span>
              <Badge variant="secondary">
                {currentSlotIndex + 1} / {SLOT_PIPELINE.length}
              </Badge>
            </div>
            
            <Progress value={progress} className="h-3" />
            
            <p className="text-xs text-muted-foreground">
              Usando references con 75% de influencia para máxima consistencia
            </p>

            {/* Completed Slots Grid */}
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              {completedSlots.map((slot, i) => (
                <div 
                  key={i} 
                  className={`
                    aspect-square rounded-lg border-2 flex items-center justify-center
                    ${slot.status === 'success' ? 'border-green-500 bg-green-500/10' : ''}
                    ${slot.status === 'error' ? 'border-red-500 bg-red-500/10' : ''}
                    ${slot.status === 'generating' ? 'border-primary animate-pulse bg-primary/10' : ''}
                    ${slot.status === 'pending' ? 'border-muted-foreground/30 bg-muted/30' : ''}
                  `}
                >
                  {slot.status === 'success' && slot.image_url ? (
                    <img 
                      src={slot.image_url} 
                      alt={slot.name}
                      className="w-full h-full object-cover rounded-md"
                    />
                  ) : slot.status === 'success' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : slot.status === 'error' ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : slot.status === 'generating' ? (
                    <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                  )}
                </div>
              ))}
            </div>

            <Button 
              variant="destructive" 
              size="sm"
              onClick={cancelGeneration}
            >
              <XCircle className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
          </div>
        )}

        {/* STEP 4: COMPLETE */}
        {step === 'complete' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <h3 className="font-bold text-lg">¡Character Pack Generado!</h3>
              <p className="text-sm text-muted-foreground">
                {completedSlots.filter(s => s.status === 'success').length} de {SLOT_PIPELINE.length} slots completados
              </p>
            </div>

            {/* Results Grid */}
            <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
              {completedSlots.map((slot, i) => (
                <div 
                  key={i}
                  className="aspect-square rounded-lg border overflow-hidden"
                  title={slot.name}
                >
                  {slot.status === 'success' && slot.image_url ? (
                    <img 
                      src={slot.image_url} 
                      alt={slot.name}
                      className="w-full h-full object-cover"
                    />
                  ) : slot.status === 'success' ? (
                    <div className="w-full h-full bg-green-500/20 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-red-500/20 flex items-center justify-center">
                      <XCircle className="w-6 h-6 text-red-500" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button onClick={resetFlow} variant="outline" className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" />
                Nuevo Character
              </Button>
              {onComplete && (
                <Button onClick={onComplete} className="flex-1">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Continuar
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
