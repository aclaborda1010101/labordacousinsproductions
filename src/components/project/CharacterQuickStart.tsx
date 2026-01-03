import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Upload, Sparkles, Loader2, CheckCircle, User, Camera, 
  Shirt, RefreshCw, XCircle, Zap, ImagePlus, Edit, Eye, Check
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
  slotId?: string;
}

// 4 mandatory Identity Pack slots
const IDENTITY_PACK_SLOTS = [
  { value: 'face_front', label: 'Rostro Frontal', icon: User, required: true },
  { value: 'face_side', label: 'Rostro Perfil', icon: User, required: true },
  { value: 'body_front', label: 'Cuerpo Frontal', icon: Camera, required: true },
  { value: 'body_side', label: 'Cuerpo Lateral', icon: Camera, required: true },
];

const SLOT_PIPELINE = [
  { type: 'closeup', name: 'Identity Closeup', icon: User, required: true },
  { type: 'turnaround', viewAngle: 'front', name: 'Front View', icon: Camera, required: true },
  { type: 'turnaround', viewAngle: 'side', name: 'Side View', icon: Camera, required: false },
  { type: 'turnaround', viewAngle: 'back', name: 'Back View', icon: Camera, required: false },
  { type: 'expression', emotion: 'neutral', name: 'Neutral', icon: User, required: true },
  { type: 'expression', emotion: 'happy', name: 'Happy', icon: User, required: false },
  { type: 'expression', emotion: 'angry', name: 'Angry', icon: User, required: false },
];

export function CharacterQuickStart({ 
  characterId, 
  characterName, 
  projectId,
  onComplete 
}: CharacterQuickStartProps) {
  // Upload state - 4 mandatory images
  const [identityImages, setIdentityImages] = useState<{[key: string]: File | null}>({
    face_front: null,
    face_side: null,
    body_front: null,
    body_side: null
  });
  const [identityPreviews, setIdentityPreviews] = useState<{[key: string]: string | null}>({
    face_front: null,
    face_side: null,
    body_front: null,
    body_side: null
  });
  const [celebrityMix, setCelebrityMix] = useState('');
  
  // Pipeline state
  const [step, setStep] = useState<'upload' | 'analyzing' | 'validating' | 'generating' | 'complete'>('upload');
  const [analyzing, setAnalyzing] = useState(false);
  const [visualDNA, setVisualDNA] = useState<any>(null);
  const [editableVisualDNA, setEditableVisualDNA] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [completedSlots, setCompletedSlots] = useState<GeneratedSlot[]>([]);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  const [uploadedUrls, setUploadedUrls] = useState<{[key: string]: string}>({});

  const fileInputRefs = useRef<{[key: string]: HTMLInputElement | null}>({});

  const handleImageUpload = (file: File | null, slotKey: string) => {
    if (!file) return;
    setIdentityImages(prev => ({ ...prev, [slotKey]: file }));
    const reader = new FileReader();
    reader.onloadend = () => setIdentityPreviews(prev => ({ ...prev, [slotKey]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const allImagesUploaded = IDENTITY_PACK_SLOTS.every(slot => identityImages[slot.value] !== null);

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
    if (!allImagesUploaded) {
      toast.error('Sube las 4 imágenes de referencia requeridas');
      return;
    }

    setAnalyzing(true);
    setStep('analyzing');

    try {
      // Upload all 4 images to storage
      const timestamp = Date.now();
      const urls: {[key: string]: string} = {};
      
      for (const slot of IDENTITY_PACK_SLOTS) {
        const file = identityImages[slot.value];
        if (file) {
          const url = await uploadToStorage(
            file, 
            `${projectId}/${characterId}/${slot.value}_${timestamp}.jpg`
          );
          urls[slot.value] = url;
        }
      }

      setUploadedUrls(urls);

      toast.info('Analizando referencias con IA...');

      // Call analysis function with all 4 images
      const { data, error } = await supabase.functions.invoke('analyze-character-references', {
        body: {
          characterId,
          projectId,
          faceImageUrl: urls.face_front,
          faceSideImageUrl: urls.face_side,
          bodyImageUrl: urls.body_front,
          bodySideImageUrl: urls.body_side,
          celebrityMix: celebrityMix || undefined,
          characterName
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error en análisis');

      setVisualDNA(data.visualDNA);
      setEditableVisualDNA(data.visualDNA);
      toast.success('Visual DNA extraído - Revisa y valida los valores');
      
      // Go to validation step instead of auto-generating
      setStep('validating');

    } catch (err: any) {
      console.error('Analysis error:', err);
      toast.error(err.message || 'Error al analizar referencias');
      setStep('upload');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleValidateAndGenerate = async () => {
    try {
      // Save the validated Visual DNA
      toast.info('Guardando Visual DNA validado...');
      
      const { error: saveError } = await supabase
        .from('character_visual_dna')
        .upsert({
          character_id: characterId,
          visual_dna: editableVisualDNA,
          version: 1,
          version_name: 'Quick Start',
          is_active: true,
          continuity_lock: {
            never_change: [],
            allowed_variants: [],
            must_avoid: [],
            version_notes: 'Generated via Quick Start'
          }
        }, { 
          onConflict: 'character_id,version',
          ignoreDuplicates: false 
        });

      if (saveError) {
        console.error('Save DNA error:', saveError);
        // Try insert without upsert
        await supabase
          .from('character_visual_dna')
          .insert({
            character_id: characterId,
            visual_dna: editableVisualDNA,
            version: 1,
            version_name: 'Quick Start',
            is_active: true,
            continuity_lock: {
              never_change: [],
              allowed_variants: [],
              must_avoid: [],
              version_notes: 'Generated via Quick Start'
            }
          });
      }

      toast.success('Visual DNA guardado');
      
      // Now start generation
      setStep('generating');
      await generatePackPipeline();

    } catch (err: any) {
      console.error('Validation save error:', err);
      toast.error('Error al guardar Visual DNA');
    }
  };

  const createOrGetSlot = async (slotConfig: typeof SLOT_PIPELINE[0], index: number): Promise<string> => {
    // Check if slot already exists
    const { data: existingSlot } = await supabase
      .from('character_pack_slots')
      .select('id')
      .eq('character_id', characterId)
      .eq('slot_type', slotConfig.type)
      .eq('view_angle', slotConfig.viewAngle || null)
      .eq('expression_name', slotConfig.emotion || null)
      .single();

    if (existingSlot) {
      return existingSlot.id;
    }

    // Create new slot
    const { data: newSlot, error } = await supabase
      .from('character_pack_slots')
      .insert({
        character_id: characterId,
        slot_type: slotConfig.type,
        slot_index: index,
        view_angle: slotConfig.viewAngle || null,
        expression_name: slotConfig.emotion || null,
        status: 'pending',
        required: slotConfig.required
      })
      .select('id')
      .single();

    if (error) throw error;
    return newSlot.id;
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
          // Create or get the slot ID first
          const slotId = await createOrGetSlot(slotConfig, i);
          
          // Call generate-character with slotId to use proper slot flow
          const { data, error } = await supabase.functions.invoke('generate-character', {
            body: {
              slotId,
              characterId,
              characterName,
              characterBio: '',
              slotType: slotConfig.type,
              viewAngle: slotConfig.viewAngle,
              expressionName: slotConfig.emotion,
              useReferenceAnchoring: true,
              referenceWeight: 0.75
            }
          });

          if (error) throw error;

          if (data?.success || data?.imageUrl) {
            const imageUrl = data.imageUrl || data.image_url;
            setCompletedSlots(prev => prev.map((s, idx) => 
              idx === i ? { 
                ...s, 
                status: 'success', 
                image_url: imageUrl,
                slotId 
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
    setIdentityImages({
      face_front: null,
      face_side: null,
      body_front: null,
      body_side: null
    });
    setIdentityPreviews({
      face_front: null,
      face_side: null,
      body_front: null,
      body_side: null
    });
    setCelebrityMix('');
    setVisualDNA(null);
    setEditableVisualDNA(null);
    setCompletedSlots([]);
    setCurrentSlotIndex(0);
    setUploadedUrls({});
  };

  const updateDNAField = (path: string[], value: any) => {
    setEditableVisualDNA((prev: any) => {
      const newDNA = JSON.parse(JSON.stringify(prev));
      let current = newDNA;
      for (let i = 0; i < path.length - 1; i++) {
        if (!current[path[i]]) current[path[i]] = {};
        current = current[path[i]];
      }
      current[path[path.length - 1]] = value;
      return newDNA;
    });
  };

  const progress = step === 'generating' 
    ? Math.round(((currentSlotIndex + 1) / SLOT_PIPELINE.length) * 100)
    : step === 'complete' ? 100 : 0;

  // Helper to render editable field
  const EditableField = ({ label, path, type = 'text' }: { label: string; path: string[]; type?: 'text' | 'number' }) => {
    let value = editableVisualDNA;
    for (const key of path) {
      value = value?.[key];
    }
    
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <Input
          value={value || ''}
          onChange={(e) => updateDNAField(path, type === 'number' ? Number(e.target.value) : e.target.value)}
          type={type}
          className="h-8 text-sm"
        />
      </div>
    );
  };

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Quick Character Setup
        </CardTitle>
        <CardDescription>
          Sube las 4 imágenes de referencia requeridas y generamos el pack completo automáticamente
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <>
            {/* 4 Identity Pack Images - 2x2 Grid */}
            <div className="grid grid-cols-2 gap-4">
              {IDENTITY_PACK_SLOTS.map((slot) => {
                const SlotIcon = slot.icon;
                const preview = identityPreviews[slot.value];
                return (
                  <div key={slot.value} className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <SlotIcon className="w-4 h-4" />
                      {slot.label}
                      <Badge variant="destructive" className="text-xs">Requerido</Badge>
                    </Label>
                    
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[slot.value] = el; }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, slot.value);
                        e.target.value = '';
                      }}
                    />
                    
                    <div 
                      onClick={() => fileInputRefs.current[slot.value]?.click()}
                      className={`
                        border-2 border-dashed rounded-lg p-2 text-center cursor-pointer
                        transition-colors hover:border-primary/50 hover:bg-primary/5 h-32
                        ${preview ? 'border-green-500/50' : 'border-muted-foreground/30'}
                      `}
                    >
                      {preview ? (
                        <img 
                          src={preview} 
                          alt={slot.label} 
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center gap-1">
                          <ImagePlus className="w-6 h-6 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">
                            Click para subir
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
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
              disabled={!allImagesUploaded || analyzing}
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
                  Analizar Referencias
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

        {/* STEP 3: VALIDATING VISUAL DNA */}
        {step === 'validating' && editableVisualDNA && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Revisa el Visual DNA Extraído
                </h3>
                <p className="text-sm text-muted-foreground">
                  Valida o modifica los valores antes de generar el pack
                </p>
              </div>
              <div className="flex gap-2">
                {identityPreviews.face_front && (
                  <img src={identityPreviews.face_front} alt="Face" className="w-12 h-12 rounded-lg object-cover" />
                )}
                {identityPreviews.body_front && (
                  <img src={identityPreviews.body_front} alt="Body" className="w-12 h-12 rounded-lg object-cover" />
                )}
              </div>
            </div>

            <Tabs defaultValue="physical" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="physical">Físico</TabsTrigger>
                <TabsTrigger value="face">Rostro</TabsTrigger>
                <TabsTrigger value="hair">Cabello</TabsTrigger>
                <TabsTrigger value="celebrity">Likeness</TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[300px] mt-4">
                <TabsContent value="physical" className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableField label="Edad" path={['physical_identity', 'age_exact_for_prompt']} type="number" />
                    <EditableField label="Género" path={['physical_identity', 'gender_presentation']} />
                    <EditableField label="Etnia" path={['physical_identity', 'ethnicity', 'primary']} />
                    <EditableField label="Tono de Piel" path={['physical_identity', 'ethnicity', 'skin_tone_description']} />
                    <EditableField label="Altura (cm)" path={['physical_identity', 'height', 'cm']} type="number" />
                    <EditableField label="Tipo de Cuerpo" path={['physical_identity', 'body_type', 'somatotype']} />
                  </div>
                </TabsContent>

                <TabsContent value="face" className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableField label="Forma de Cara" path={['face', 'shape']} />
                    <EditableField label="Color de Ojos" path={['face', 'eyes', 'color_base']} />
                    <EditableField label="Forma de Ojos" path={['face', 'eyes', 'shape']} />
                    <EditableField label="Cejas" path={['face', 'eyes', 'eyebrows', 'shape']} />
                    <EditableField label="Forma de Nariz" path={['face', 'nose', 'bridge', 'shape']} />
                    <EditableField label="Labios" path={['face', 'mouth', 'lips', 'fullness_upper']} />
                    <EditableField label="Mandíbula" path={['face', 'jaw_chin', 'jawline', 'shape']} />
                    <EditableField label="Pómulos" path={['face', 'cheekbones', 'prominence']} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Barba/Vello Facial</Label>
                    <EditableField label="" path={['face', 'facial_hair', 'type']} />
                  </div>
                </TabsContent>

                <TabsContent value="hair" className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableField label="Longitud" path={['hair', 'head_hair', 'length', 'type']} />
                    <EditableField label="Textura" path={['hair', 'head_hair', 'texture', 'type']} />
                    <EditableField label="Color Base" path={['hair', 'head_hair', 'color', 'natural_base']} />
                    <EditableField label="Estilo" path={['hair', 'head_hair', 'style', 'overall_shape']} />
                    <EditableField label="Línea del Cabello" path={['hair', 'head_hair', 'hairline', 'front']} />
                    <EditableField label="% Canas" path={['hair', 'head_hair', 'color', 'grey_white', 'percentage']} type="number" />
                  </div>
                </TabsContent>

                <TabsContent value="celebrity" className="space-y-4 pr-4">
                  <div className="grid grid-cols-2 gap-3">
                    <EditableField label="Celebridad Principal" path={['visual_references', 'celebrity_likeness', 'primary', 'name']} />
                    <EditableField label="% Parecido" path={['visual_references', 'celebrity_likeness', 'primary', 'percentage']} type="number" />
                    <EditableField label="Celebridad Secundaria" path={['visual_references', 'celebrity_likeness', 'secondary', 'name']} />
                    <EditableField label="% Parecido" path={['visual_references', 'celebrity_likeness', 'secondary', 'percentage']} type="number" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Descripción de la Combinación</Label>
                    <Textarea
                      value={editableVisualDNA?.visual_references?.celebrity_likeness?.combination_description || ''}
                      onChange={(e) => updateDNAField(['visual_references', 'celebrity_likeness', 'combination_description'], e.target.value)}
                      rows={3}
                      className="text-sm"
                    />
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>

            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" />
                Volver
              </Button>
              <Button onClick={handleValidateAndGenerate} className="flex-1">
                <Check className="w-4 h-4 mr-2" />
                Validar y Generar Pack
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: GENERATING */}
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

        {/* STEP 5: COMPLETE */}
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
