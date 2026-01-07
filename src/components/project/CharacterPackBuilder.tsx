/**
 * CharacterPackBuilder - PRO Mode
 * 12 Essential Model Pack with Guided Phases
 * Phase 1: Upload References (1 required, 1 optional)
 * Phase 2: Auto-generate Turnarounds (4 slots)
 * Phase 3: Auto-generate Expressions (6 slots)
 */

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Upload, Sparkles, CheckCircle2, XCircle, 
  User, Camera, Palette, RefreshCw, Lock, Play, Trash2,
  Image, ChevronRight
} from 'lucide-react';

// ============================================
// 12 ESSENTIAL MODEL PACK
// ============================================

// Phase 1: User uploads (references)
const UPLOAD_SLOTS = [
  { type: 'ref_closeup_front', label: 'Primer Plano Frontal', required: true, viewAngle: 'front' },
  { type: 'ref_profile', label: 'Perfil Lateral', required: false, viewAngle: 'side' },
];

// Phase 2: Auto-generated turnarounds
const TURNAROUND_SLOTS = [
  { type: 'turn_front_34', label: 'Frontal 3/4', viewAngle: 'front_34' },
  { type: 'turn_side', label: 'Lateral', viewAngle: 'side' },
  { type: 'turn_back', label: 'Espalda', viewAngle: 'back' },
  { type: 'turn_back_34', label: 'Espalda 3/4', viewAngle: 'back_34' },
];

// Phase 3: Auto-generated expressions
const EXPRESSION_SLOTS = [
  { type: 'expr_neutral', label: 'Neutral', expression: 'neutral' },
  { type: 'expr_happy', label: 'Alegre', expression: 'happy' },
  { type: 'expr_sad', label: 'Triste', expression: 'sad' },
  { type: 'expr_angry', label: 'Enojado', expression: 'angry' },
  { type: 'expr_surprised', label: 'Sorprendido', expression: 'surprised' },
  { type: 'expr_fear', label: 'Miedo', expression: 'fear' },
];

// All slot types for the 12-model pack
const ALL_SLOT_TYPES = [
  ...UPLOAD_SLOTS.map(s => s.type),
  ...TURNAROUND_SLOTS.map(s => s.type),
  ...EXPRESSION_SLOTS.map(s => s.type),
];

interface PackSlot {
  id: string;
  slot_type: string;
  slot_index: number;
  view_angle: string | null;
  expression_name: string | null;
  image_url: string | null;
  status: string;
  qc_score: number | null;
  required: boolean;
}

interface CharacterPackBuilderProps {
  characterId: string;
  characterName: string;
  characterBio: string;
  characterRole: 'protagonist' | 'recurring' | 'episodic' | 'extra';
  styleToken?: string;
  projectId?: string;
  onPackComplete?: () => void;
}

export function CharacterPackBuilder({
  characterId,
  characterName,
  characterBio,
  characterRole,
  styleToken,
  projectId,
  onPackComplete,
}: CharacterPackBuilderProps) {
  const [slots, setSlots] = useState<PackSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPhase, setGeneratingPhase] = useState<string | null>(null);
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [completenessScore, setCompletenessScore] = useState(0);
  const [activePhase, setActivePhase] = useState<string>('phase1');
  const [phaseProgress, setPhaseProgress] = useState({ current: 0, total: 0 });
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch or initialize slots
  const fetchSlots = useCallback(async () => {
    const { data, error } = await supabase
      .from('character_pack_slots')
      .select('*')
      .eq('character_id', characterId)
      .in('slot_type', ALL_SLOT_TYPES)
      .order('slot_type');

    if (error) {
      console.error('Error fetching slots:', error);
      setLoading(false);
      return;
    }

    if (data && data.length > 0) {
      setSlots(data as PackSlot[]);
      calculateCompleteness(data as PackSlot[]);
    } else {
      await initializeSlots();
    }
    setLoading(false);
  }, [characterId]);

  // Initialize 12 essential slots
  const initializeSlots = async () => {
    const newSlots: Omit<PackSlot, 'id'>[] = [];

    // Phase 1: Upload slots
    UPLOAD_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: slot.viewAngle,
        expression_name: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        required: slot.required,
      });
    });

    // Phase 2: Turnaround slots
    TURNAROUND_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: slot.viewAngle,
        expression_name: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        required: true,
      });
    });

    // Phase 3: Expression slots
    EXPRESSION_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: 'front',
        expression_name: slot.expression,
        image_url: null,
        status: 'empty',
        qc_score: null,
        required: true,
      });
    });

    const { data, error } = await supabase
      .from('character_pack_slots')
      .insert(newSlots.map(s => ({ ...s, character_id: characterId })))
      .select();

    if (error) {
      console.error('Error creating slots:', error);
      toast.error('Error al crear slots del pack');
      return;
    }

    setSlots(data as PackSlot[]);
    calculateCompleteness(data as PackSlot[]);
  };

  const calculateCompleteness = (slotData: PackSlot[]) => {
    const total = slotData.length;
    const completed = slotData.filter(s => s.status === 'approved' || s.status === 'generated' || s.status === 'uploaded').length;
    setCompletenessScore(total > 0 ? Math.round((completed / total) * 100) : 0);
  };

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Get slot by type
  const getSlot = (type: string): PackSlot | undefined => slots.find(s => s.slot_type === type);

  // Phase completion checks
  const phase1Complete = () => {
    const refSlot = getSlot('ref_closeup_front');
    return refSlot && refSlot.image_url && (refSlot.status === 'approved' || refSlot.status === 'uploaded');
  };

  const phase2Complete = () => {
    const turnaroundSlots = TURNAROUND_SLOTS.map(s => getSlot(s.type));
    return turnaroundSlots.every(s => s && s.image_url && (s.status === 'approved' || s.status === 'generated'));
  };

  const phase3Complete = () => {
    const expressionSlots = EXPRESSION_SLOTS.map(s => getSlot(s.type));
    return expressionSlots.every(s => s && s.image_url && (s.status === 'approved' || s.status === 'generated'));
  };

  // Phase counts
  const phase1Count = () => UPLOAD_SLOTS.filter(s => {
    const slot = getSlot(s.type);
    return slot && slot.image_url;
  }).length;

  const phase2Count = () => TURNAROUND_SLOTS.filter(s => {
    const slot = getSlot(s.type);
    return slot && slot.image_url;
  }).length;

  const phase3Count = () => EXPRESSION_SLOTS.filter(s => {
    const slot = getSlot(s.type);
    return slot && slot.image_url;
  }).length;

  // Upload image handler
  const uploadImage = async (slotType: string, file: File) => {
    const slot = getSlot(slotType);
    if (!slot) return;

    setUploading(slot.id);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${characterId}/${slotType}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('character-packs')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('character-packs')
        .getPublicUrl(fileName);

      await supabase.from('character_pack_slots').update({
        image_url: urlData.publicUrl,
        status: 'uploaded',
      }).eq('id', slot.id);

      toast.success(`${UPLOAD_SLOTS.find(s => s.type === slotType)?.label} subido`);
      await fetchSlots();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir imagen');
    } finally {
      setUploading(null);
    }
  };

  // Delete image from slot
  const deleteSlotImage = async (slotType: string) => {
    const slot = getSlot(slotType);
    if (!slot || !slot.image_url) return;

    try {
      const urlParts = slot.image_url.split('/character-packs/');
      if (urlParts.length > 1) {
        await supabase.storage.from('character-packs').remove([urlParts[1]]);
      }

      await supabase.from('character_pack_slots').update({
        image_url: null,
        status: 'empty',
        qc_score: null,
      }).eq('id', slot.id);

      await fetchSlots();
      toast.success('Imagen eliminada');
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  // Generate single slot
  const generateSlot = async (slotType: string, viewAngle?: string, expressionName?: string) => {
    const slot = getSlot(slotType);
    if (!slot) return;

    setGeneratingSlot(slot.id);

    try {
      const response = await supabase.functions.invoke('generate-character', {
        body: {
          slotId: slot.id,
          characterId,
          characterName,
          characterBio,
          slotType,
          viewAngle: viewAngle || slot.view_angle,
          expressionName: expressionName || slot.expression_name,
          styleToken,
          projectId,
        },
      });

      if (response.error) throw new Error(response.error.message);

      if (response.data?.success) {
        toast.success(`${slotType} generado`);
      } else {
        toast.warning('Generación completada con advertencias');
      }
      
      await fetchSlots();
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Error al generar');
    } finally {
      setGeneratingSlot(null);
    }
  };

  // Generate all turnarounds (Phase 2)
  const generateAllTurnarounds = async () => {
    if (!phase1Complete()) {
      toast.error('Sube primero la foto frontal obligatoria');
      return;
    }

    setGeneratingPhase('phase2');
    const toGenerate = TURNAROUND_SLOTS.filter(s => {
      const slot = getSlot(s.type);
      return !slot?.image_url;
    });

    setPhaseProgress({ current: 0, total: toGenerate.length });

    for (let i = 0; i < toGenerate.length; i++) {
      const slotDef = toGenerate[i];
      setPhaseProgress({ current: i + 1, total: toGenerate.length });
      await generateSlot(slotDef.type, slotDef.viewAngle);
    }

    setGeneratingPhase(null);
    toast.success('Turnarounds generados');
    setActivePhase('phase3');
  };

  // Generate all expressions (Phase 3)
  const generateAllExpressions = async () => {
    if (!phase2Complete()) {
      toast.error('Genera primero todos los turnarounds');
      return;
    }

    setGeneratingPhase('phase3');
    const toGenerate = EXPRESSION_SLOTS.filter(s => {
      const slot = getSlot(s.type);
      return !slot?.image_url;
    });

    setPhaseProgress({ current: 0, total: toGenerate.length });

    for (let i = 0; i < toGenerate.length; i++) {
      const slotDef = toGenerate[i];
      setPhaseProgress({ current: i + 1, total: toGenerate.length });
      await generateSlot(slotDef.type, 'front', slotDef.expression);
    }

    setGeneratingPhase(null);
    toast.success('Expresiones generadas');
    
    if (onPackComplete) onPackComplete();
  };

  // Generate full pack
  const generateFullPack = async () => {
    if (!phase1Complete()) {
      toast.error('Sube primero la foto frontal obligatoria');
      return;
    }

    await generateAllTurnarounds();
    await generateAllExpressions();
  };

  // File input handler
  const handleFileChange = (slotType: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Solo se permiten imágenes');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('Máximo 10MB');
        return;
      }
      uploadImage(slotType, file);
    }
    e.target.value = '';
  };

  // Render slot card
  const renderSlotCard = (
    slotDef: { type: string; label: string; required?: boolean },
    isUpload: boolean = false
  ) => {
    const slot = getSlot(slotDef.type);
    const isGenerating = generatingSlot === slot?.id;
    const isUploading = uploading === slot?.id;
    const hasImage = slot?.image_url;

    return (
      <div
        key={slotDef.type}
        className={`relative aspect-square rounded-lg border-2 overflow-hidden transition-all ${
          hasImage ? 'border-green-500/50' : 'border-dashed border-muted-foreground/30'
        }`}
      >
        {/* Image or placeholder */}
        {hasImage ? (
          <img src={slot.image_url!} alt={slotDef.label} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 text-muted-foreground p-2">
            {isUpload ? <Upload className="w-6 h-6 mb-1" /> : <Image className="w-6 h-6 mb-1" />}
            <span className="text-xs text-center">{slotDef.label}</span>
          </div>
        )}

        {/* Loading overlay */}
        {(isGenerating || isUploading) && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
        )}

        {/* Status badge */}
        {hasImage && (
          <div className="absolute top-1 right-1">
            <Badge variant="pass" className="text-xs px-1">
              <CheckCircle2 className="w-3 h-3" />
            </Badge>
          </div>
        )}

        {/* Required badge */}
        {slotDef.required && !hasImage && (
          <div className="absolute top-1 left-1">
            <Badge variant="destructive" className="text-[10px] px-1">REQ</Badge>
          </div>
        )}

        {/* Action buttons */}
        <div className="absolute bottom-1 left-1 right-1 flex gap-1">
          {isUpload && !hasImage && (
            <>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1 h-7 text-xs"
                onClick={() => fileInputRefs.current[slotDef.type]?.click()}
                disabled={isUploading}
              >
                <Upload className="w-3 h-3 mr-1" />
                Subir
              </Button>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={el => fileInputRefs.current[slotDef.type] = el}
                onChange={(e) => handleFileChange(slotDef.type, e)}
              />
            </>
          )}
          
          {!isUpload && !hasImage && (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1 h-7 text-xs"
              onClick={() => generateSlot(slotDef.type)}
              disabled={isGenerating || !phase1Complete()}
            >
              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
              Generar
            </Button>
          )}

          {hasImage && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => isUpload ? fileInputRefs.current[slotDef.type]?.click() : generateSlot(slotDef.type)}
              >
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive"
                onClick={() => deleteSlotImage(slotDef.type)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              Pack de 12 Modelos
            </CardTitle>
            <CardDescription>
              {characterName} - {characterRole}
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{completenessScore}%</div>
            <div className="text-xs text-muted-foreground">Completado</div>
            {completenessScore === 100 && (
              <Badge variant="pass" className="mt-1">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Listo
              </Badge>
            )}
          </div>
        </div>
        <Progress value={completenessScore} className="h-2 mt-2" />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Generate Button */}
        {phase1Complete() && completenessScore < 100 && (
          <Button
            variant="gold"
            className="w-full"
            onClick={generateFullPack}
            disabled={generatingPhase !== null}
          >
            {generatingPhase ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generando {generatingPhase === 'phase2' ? 'Turnarounds' : 'Expresiones'} ({phaseProgress.current}/{phaseProgress.total})
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Generar Pack Completo ({12 - Math.round(completenessScore * 12 / 100)} restantes)
              </>
            )}
          </Button>
        )}

        {/* Accordion Phases */}
        <Accordion type="single" value={activePhase} onValueChange={setActivePhase} className="space-y-2">
          {/* Phase 1: Upload References */}
          <AccordionItem value="phase1" className="border rounded-lg">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  phase1Complete() ? 'bg-green-500 text-white' : 'bg-muted'
                }`}>
                  {phase1Complete() ? <CheckCircle2 className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">Paso 1: Sube tus Referencias</p>
                  <p className="text-xs text-muted-foreground">1 obligatoria, 1 opcional</p>
                </div>
                <Badge variant={phase1Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                  {phase1Count()}/2
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                {UPLOAD_SLOTS.map(slot => renderSlotCard(slot, true))}
              </div>
              {phase1Complete() && (
                <div className="mt-3 flex items-center text-sm text-green-600">
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  ¡Listo! Ahora puedes generar los turnarounds
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Phase 2: Turnarounds */}
          <AccordionItem value="phase2" className="border rounded-lg" disabled={!phase1Complete()}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  phase2Complete() ? 'bg-green-500 text-white' : 
                  phase1Complete() ? 'bg-primary text-primary-foreground' : 'bg-muted opacity-50'
                }`}>
                  {phase2Complete() ? <CheckCircle2 className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">Paso 2: Turnarounds</p>
                  <p className="text-xs text-muted-foreground">4 vistas del personaje</p>
                </div>
                <Badge variant={phase2Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                  {phase2Count()}/4
                </Badge>
                {!phase1Complete() && <Lock className="w-4 h-4 text-muted-foreground" />}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {!phase1Complete() ? (
                <p className="text-sm text-muted-foreground">Completa el Paso 1 primero</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                    {TURNAROUND_SLOTS.map(slot => renderSlotCard(slot))}
                  </div>
                  {!phase2Complete() && (
                    <Button
                      onClick={generateAllTurnarounds}
                      disabled={generatingPhase === 'phase2'}
                      className="w-full"
                    >
                      {generatingPhase === 'phase2' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generando ({phaseProgress.current}/{phaseProgress.total})
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generar 4 Turnarounds
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Phase 3: Expressions */}
          <AccordionItem value="phase3" className="border rounded-lg" disabled={!phase2Complete()}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  phase3Complete() ? 'bg-green-500 text-white' : 
                  phase2Complete() ? 'bg-primary text-primary-foreground' : 'bg-muted opacity-50'
                }`}>
                  {phase3Complete() ? <CheckCircle2 className="w-4 h-4" /> : <Palette className="w-4 h-4" />}
                </div>
                <div className="text-left">
                  <p className="font-medium">Paso 3: Expresiones</p>
                  <p className="text-xs text-muted-foreground">6 emociones básicas</p>
                </div>
                <Badge variant={phase3Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                  {phase3Count()}/6
                </Badge>
                {!phase2Complete() && <Lock className="w-4 h-4 text-muted-foreground" />}
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {!phase2Complete() ? (
                <p className="text-sm text-muted-foreground">Completa el Paso 2 primero</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                    {EXPRESSION_SLOTS.map(slot => renderSlotCard(slot))}
                  </div>
                  {!phase3Complete() && (
                    <Button
                      onClick={generateAllExpressions}
                      disabled={generatingPhase === 'phase3'}
                      className="w-full"
                    >
                      {generatingPhase === 'phase3' ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generando ({phaseProgress.current}/{phaseProgress.total})
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generar 6 Expresiones
                        </>
                      )}
                    </Button>
                  )}
                </>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Completion message */}
        {completenessScore === 100 && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="font-medium text-green-700 dark:text-green-400">¡Pack Completo!</p>
            <p className="text-sm text-muted-foreground">
              12 modelos listos para producción de video
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
