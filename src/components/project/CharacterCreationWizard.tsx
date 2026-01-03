import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Upload, Sparkles, Loader2, CheckCircle, User, Camera, 
  Shirt, RefreshCw, XCircle, Zap, ImagePlus, Edit, Eye, Check,
  ArrowLeft, ArrowRight, Info, AlertCircle
} from 'lucide-react';
import { CharacterRoleSelector } from './CharacterRoleSelector';
import { 
  ROLE_PRESETS, 
  CharacterRoleType, 
  SlotConfig, 
  getSlotPipeline,
  calculateTotalSlots 
} from '@/lib/characterRolePresets';

interface CharacterCreationWizardProps {
  projectId: string;
  onComplete?: (characterId: string) => void;
  onCancel?: () => void;
}

type WizardStep = 'info' | 'role' | 'photos' | 'analyzing' | 'validating' | 'generating' | 'complete';

// 4 mandatory Identity Pack slots
const IDENTITY_PACK_SLOTS = [
  { value: 'face_front', label: 'Rostro Frontal', icon: User, required: true, description: 'Foto clara del rostro de frente' },
  { value: 'face_side', label: 'Rostro Perfil', icon: User, required: true, description: 'Perfil del rostro (90°)' },
  { value: 'body_front', label: 'Cuerpo Frontal', icon: Camera, required: true, description: 'Cuerpo completo de frente' },
  { value: 'body_side', label: 'Cuerpo Lateral', icon: Camera, required: true, description: 'Cuerpo completo de perfil' },
];

interface GeneratedSlot {
  name: string;
  type: string;
  status: 'pending' | 'generating' | 'success' | 'error';
  image_url?: string;
  error?: string;
  slotId?: string;
}

export function CharacterCreationWizard({ 
  projectId,
  onComplete,
  onCancel 
}: CharacterCreationWizardProps) {
  // Wizard state
  const [step, setStep] = useState<WizardStep>('info');
  
  // Character info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRole, setSelectedRole] = useState<CharacterRoleType | null>(null);
  const [customSlotConfig, setCustomSlotConfig] = useState<SlotConfig>({
    closeups: 1,
    turnarounds: 2,
    expressions: 3,
    outfits: 1,
  });
  
  // Photos
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
  const [uploadedUrls, setUploadedUrls] = useState<{[key: string]: string}>({});
  
  // Analysis & Generation
  const [analyzing, setAnalyzing] = useState(false);
  const [visualDNA, setVisualDNA] = useState<any>(null);
  const [editableVisualDNA, setEditableVisualDNA] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [currentSlotIndex, setCurrentSlotIndex] = useState(0);
  const [completedSlots, setCompletedSlots] = useState<GeneratedSlot[]>([]);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [cancelController, setCancelController] = useState<AbortController | null>(null);
  
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

  const createCharacter = async (): Promise<string> => {
    if (!selectedRole) throw new Error('Role not selected');
    
    // Map role types to database enum values
    const roleMapping: Record<CharacterRoleType, 'protagonist' | 'recurring' | 'episodic' | 'extra'> = {
      lead: 'protagonist',
      supporting: 'recurring',
      recurring: 'episodic',
      background: 'extra',
      custom: 'episodic',
    };
    
    const { data, error } = await supabase
      .from('characters')
      .insert({
        project_id: projectId,
        name: name.trim(),
        bio: description || null,
        character_role: roleMapping[selectedRole],
      })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  };

  const handleAnalyze = async () => {
    if (!allImagesUploaded) {
      toast.error('Sube las 4 imágenes de referencia requeridas');
      return;
    }

    setAnalyzing(true);
    setStep('analyzing');

    try {
      // Create character first
      const charId = await createCharacter();
      setCharacterId(charId);

      // Upload all 4 images to storage
      const timestamp = Date.now();
      const urls: {[key: string]: string} = {};
      
      for (const slot of IDENTITY_PACK_SLOTS) {
        const file = identityImages[slot.value];
        if (file) {
          const url = await uploadToStorage(
            file, 
            `${projectId}/${charId}/${slot.value}_${timestamp}.jpg`
          );
          urls[slot.value] = url;
        }
      }

      setUploadedUrls(urls);

      // Create reference anchors
      const anchorTypes = {
        face_front: 'identity_front',
        face_side: 'identity_side',
        body_front: 'body_front',
        body_side: 'body_side',
      };

      for (const [slotKey, url] of Object.entries(urls)) {
        await supabase.from('reference_anchors').insert({
          character_id: charId,
          anchor_type: anchorTypes[slotKey as keyof typeof anchorTypes],
          image_url: url,
          is_active: true,
          approved: true,
          priority: IDENTITY_PACK_SLOTS.findIndex(s => s.value === slotKey),
        });
      }

      toast.info('Analizando referencias con IA...');

      // Call analysis function with all 4 images
      const { data, error } = await supabase.functions.invoke('analyze-character-references', {
        body: {
          characterId: charId,
          projectId,
          faceImageUrl: urls.face_front,
          faceSideImageUrl: urls.face_side,
          bodyImageUrl: urls.body_front,
          bodySideImageUrl: urls.body_side,
          characterName: name.trim()
        }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error en análisis');

      setVisualDNA(data.visualDNA);
      setEditableVisualDNA(data.visualDNA);
      toast.success('Visual DNA extraído - Revisa y valida los valores');
      
      setStep('validating');

    } catch (err: any) {
      console.error('Analysis error:', err);
      toast.error(err.message || 'Error al analizar referencias');
      setStep('photos');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleValidateAndGenerate = async () => {
    if (!characterId || !selectedRole) return;

    try {
      // Save the validated Visual DNA
      toast.info('Guardando Visual DNA validado...');
      
      await supabase
        .from('character_visual_dna')
        .insert({
          character_id: characterId,
          visual_dna: editableVisualDNA,
          version: 1,
          version_name: 'Initial',
          is_active: true,
          continuity_lock: {
            never_change: [],
            allowed_variants: [],
            must_avoid: [],
            version_notes: 'Generated via Character Creation Wizard'
          }
        });

      toast.success('Visual DNA guardado');
      
      // Start generation
      setStep('generating');
      await generatePackPipeline();

    } catch (err: any) {
      console.error('Validation save error:', err);
      toast.error('Error al guardar Visual DNA');
    }
  };

  const createOrGetSlot = async (slotConfig: any, index: number): Promise<string> => {
    if (!characterId) throw new Error('No character ID');

    // Check if slot already exists
    const { data: existingSlot } = await supabase
      .from('character_pack_slots')
      .select('id')
      .eq('character_id', characterId)
      .eq('slot_type', slotConfig.type)
      .eq('view_angle', slotConfig.viewAngle || null)
      .eq('expression_name', slotConfig.expressionName || null)
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
        expression_name: slotConfig.expressionName || null,
        status: 'pending',
        required: slotConfig.required
      })
      .select('id')
      .single();

    if (error) throw error;
    return newSlot.id;
  };

  const generatePackPipeline = async () => {
    if (!characterId || !selectedRole) return;

    setGenerating(true);
    const controller = new AbortController();
    setCancelController(controller);

    const preset = ROLE_PRESETS[selectedRole];
    const pipeline = getSlotPipeline(preset);

    const slots: GeneratedSlot[] = pipeline.map(s => ({
      name: s.name,
      type: s.type,
      status: 'pending'
    }));
    setCompletedSlots(slots);

    try {
      for (let i = 0; i < pipeline.length; i++) {
        if (controller.signal.aborted) {
          toast.info('Generación cancelada');
          break;
        }

        const slotConfig = pipeline[i];
        setCurrentSlotIndex(i);
        
        // Update status to generating
        setCompletedSlots(prev => prev.map((s, idx) => 
          idx === i ? { ...s, status: 'generating' } : s
        ));

        try {
          // Create or get the slot ID first
          const slotId = await createOrGetSlot(slotConfig, i);
          
          // Call generate-character with slotId
          const { data, error } = await supabase.functions.invoke('generate-character', {
            body: {
              slotId,
              characterId,
              characterName: name,
              characterBio: description || '',
              slotType: slotConfig.type,
              viewAngle: slotConfig.viewAngle,
              expressionName: slotConfig.expressionName,
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
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Update pack completeness
      await supabase.rpc('calculate_pack_completeness', { p_character_id: characterId });

      setStep('complete');
      const successCount = completedSlots.filter(s => s.status === 'success').length;
      toast.success(`Pack generado: ${successCount}/${pipeline.length} slots`);

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

  const handleComplete = () => {
    if (characterId && onComplete) {
      onComplete(characterId);
    }
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

  const canProceed = () => {
    switch (step) {
      case 'info': return name.trim().length > 0;
      case 'role': return selectedRole !== null;
      case 'photos': return allImagesUploaded;
      case 'validating': return editableVisualDNA !== null;
      default: return false;
    }
  };

  const handleNext = () => {
    switch (step) {
      case 'info': setStep('role'); break;
      case 'role': setStep('photos'); break;
      case 'photos': handleAnalyze(); break;
      case 'validating': handleValidateAndGenerate(); break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'role': setStep('info'); break;
      case 'photos': setStep('role'); break;
      case 'validating': setStep('photos'); break;
    }
  };

  const progress = () => {
    const steps: WizardStep[] = ['info', 'role', 'photos', 'analyzing', 'validating', 'generating', 'complete'];
    return ((steps.indexOf(step) + 1) / steps.length) * 100;
  };

  // Editable field helper
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
    <Card className="border-2 border-primary/20 max-w-4xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Crear Personaje
            </CardTitle>
            <CardDescription>
              {step === 'info' && 'Paso 1: Información básica'}
              {step === 'role' && 'Paso 2: Selecciona el rol del personaje'}
              {step === 'photos' && 'Paso 3: Sube las 4 fotos de referencia'}
              {step === 'analyzing' && 'Analizando referencias...'}
              {step === 'validating' && 'Paso 4: Valida el Visual DNA extraído'}
              {step === 'generating' && 'Generando pack de personaje...'}
              {step === 'complete' && '¡Personaje creado!'}
            </CardDescription>
          </div>
          {onCancel && step !== 'generating' && step !== 'complete' && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              <XCircle className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          )}
        </div>
        <Progress value={progress()} className="mt-4" />
      </CardHeader>

      <CardContent className="space-y-6">
        {/* STEP 1: INFO */}
        {step === 'info' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del personaje *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Elena García"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción (opcional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descripción del personaje..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* STEP 2: ROLE */}
        {step === 'role' && (
          <CharacterRoleSelector
            selectedRole={selectedRole}
            onSelectRole={setSelectedRole}
          />
        )}

        {/* STEP 3: PHOTOS */}
        {step === 'photos' && (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>4 fotos de referencia requeridas</AlertTitle>
              <AlertDescription>
                Estas fotos serán analizadas para extraer el Visual DNA y usadas como referencia para generar todas las variaciones.
              </AlertDescription>
            </Alert>

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
                    <p className="text-xs text-muted-foreground">{slot.description}</p>
                    
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
                        transition-colors hover:border-primary/50 hover:bg-primary/5 h-40
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
                          <ImagePlus className="w-8 h-8 text-muted-foreground" />
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
          </div>
        )}

        {/* STEP: ANALYZING */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Analizando referencias con IA...</p>
            <p className="text-sm text-muted-foreground">
              Extrayendo Visual DNA de las fotos subidas
            </p>
          </div>
        )}

        {/* STEP 4: VALIDATING */}
        {step === 'validating' && editableVisualDNA && (
          <div className="space-y-4">
            <Alert>
              <Eye className="h-4 w-4" />
              <AlertTitle>Revisa y valida el Visual DNA</AlertTitle>
              <AlertDescription>
                Estos valores se usarán para mantener consistencia en todas las generaciones.
              </AlertDescription>
            </Alert>

            <Tabs defaultValue="physical" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="physical">Físico</TabsTrigger>
                <TabsTrigger value="face">Rostro</TabsTrigger>
                <TabsTrigger value="hair">Cabello</TabsTrigger>
                <TabsTrigger value="celebrity">Likeness</TabsTrigger>
              </TabsList>
              
              <ScrollArea className="h-[300px] mt-4">
                <TabsContent value="physical" className="space-y-3 p-2">
                  <EditableField label="Edad" path={['physical_identity', 'age_exact_for_prompt']} type="number" />
                  <EditableField label="Género" path={['physical_identity', 'gender_presentation']} />
                  <EditableField label="Etnia" path={['physical_identity', 'ethnicity', 'primary']} />
                  <EditableField label="Tono de piel" path={['physical_identity', 'ethnicity', 'skin_tone_description']} />
                  <EditableField label="Altura (cm)" path={['physical_identity', 'height', 'cm']} type="number" />
                  <EditableField label="Peso (kg)" path={['physical_identity', 'weight_kg']} type="number" />
                  <EditableField label="Tipo de cuerpo" path={['physical_identity', 'body_type', 'somatotype']} />
                </TabsContent>
                
                <TabsContent value="face" className="space-y-3 p-2">
                  <EditableField label="Forma de cara" path={['face', 'shape']} />
                  <EditableField label="Color de ojos" path={['face', 'eyes', 'color_base']} />
                  <EditableField label="Forma de ojos" path={['face', 'eyes', 'shape']} />
                  <EditableField label="Vello facial" path={['face', 'facial_hair', 'type']} />
                  <EditableField label="Densidad vello" path={['face', 'facial_hair', 'density']} />
                </TabsContent>
                
                <TabsContent value="hair" className="space-y-3 p-2">
                  <EditableField label="Color base" path={['hair', 'head_hair', 'color', 'natural_base']} />
                  <EditableField label="% Gris/Blanco" path={['hair', 'head_hair', 'color', 'grey_white', 'percentage']} type="number" />
                  <EditableField label="Longitud" path={['hair', 'head_hair', 'length', 'type']} />
                  <EditableField label="Textura" path={['hair', 'head_hair', 'texture', 'type']} />
                  <EditableField label="Estilo" path={['hair', 'head_hair', 'style', 'overall_shape']} />
                </TabsContent>
                
                <TabsContent value="celebrity" className="space-y-3 p-2">
                  <EditableField label="Parecido principal" path={['visual_references', 'celebrity_likeness', 'primary', 'name']} />
                  <EditableField label="% Parecido" path={['visual_references', 'celebrity_likeness', 'primary', 'percentage']} type="number" />
                  <EditableField label="Parecido secundario" path={['visual_references', 'celebrity_likeness', 'secondary', 'name']} />
                  <EditableField label="% Secundario" path={['visual_references', 'celebrity_likeness', 'secondary', 'percentage']} type="number" />
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        )}

        {/* STEP: GENERATING */}
        {step === 'generating' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Generando pack de personaje...</p>
                <p className="text-sm text-muted-foreground">
                  {currentSlotIndex + 1} de {completedSlots.length} slots
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={cancelGeneration}>
                <XCircle className="h-4 w-4 mr-1" />
                Cancelar
              </Button>
            </div>
            
            <Progress value={((currentSlotIndex + 1) / completedSlots.length) * 100} />

            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-3 gap-2">
                {completedSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className={`
                      p-2 rounded-lg border text-center text-xs
                      ${slot.status === 'pending' ? 'bg-muted/50 text-muted-foreground' : ''}
                      ${slot.status === 'generating' ? 'bg-primary/10 border-primary animate-pulse' : ''}
                      ${slot.status === 'success' ? 'bg-green-500/10 border-green-500/50' : ''}
                      ${slot.status === 'error' ? 'bg-destructive/10 border-destructive/50' : ''}
                    `}
                  >
                    {slot.status === 'generating' && <Loader2 className="h-4 w-4 mx-auto mb-1 animate-spin" />}
                    {slot.status === 'success' && slot.image_url && (
                      <img src={slot.image_url} alt={slot.name} className="w-full h-16 object-cover rounded mb-1" />
                    )}
                    {slot.status === 'success' && !slot.image_url && <CheckCircle className="h-4 w-4 mx-auto mb-1 text-green-500" />}
                    {slot.status === 'error' && <XCircle className="h-4 w-4 mx-auto mb-1 text-destructive" />}
                    <p className="truncate">{slot.name}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* STEP: COMPLETE */}
        {step === 'complete' && (
          <div className="text-center space-y-4 py-8">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500" />
            <h3 className="text-xl font-semibold">¡Personaje creado!</h3>
            <p className="text-muted-foreground">
              {completedSlots.filter(s => s.status === 'success').length} de {completedSlots.length} slots generados correctamente.
            </p>
            
            {selectedRole && ROLE_PRESETS[selectedRole].loraRecommended && (
              <Alert className="text-left mt-4">
                <Sparkles className="h-4 w-4" />
                <AlertTitle>LoRA Training recomendado</AlertTitle>
                <AlertDescription>
                  Para este rol de personaje, se recomienda entrenar un modelo LoRA para obtener consistencia del 95%+ en todas las generaciones futuras.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex justify-between pt-4 border-t">
          {step !== 'info' && step !== 'analyzing' && step !== 'generating' && step !== 'complete' && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Atrás
            </Button>
          )}
          {step === 'info' && <div />}

          {step !== 'analyzing' && step !== 'generating' && step !== 'complete' && (
            <Button onClick={handleNext} disabled={!canProceed()}>
              {step === 'photos' && analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Analizando...
                </>
              ) : step === 'validating' ? (
                <>
                  <Sparkles className="h-4 w-4 mr-1" />
                  Generar Pack
                </>
              ) : (
                <>
                  Siguiente
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}

          {step === 'complete' && (
            <Button onClick={handleComplete} className="ml-auto">
              <CheckCircle className="h-4 w-4 mr-1" />
              Finalizar
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
