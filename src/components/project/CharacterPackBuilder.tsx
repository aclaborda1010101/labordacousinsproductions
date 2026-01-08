/**
 * CharacterPackBuilder - PRO Mode
 * 14 Essential Model Pack with Guided 4-Phase Flow
 * Phase 1: Upload References (2 slots)
 * Phase 2: Base Visual - Closeups (2 slots: frontal + profile)
 * Phase 3: Turnarounds - Full body views (4 slots)
 * Phase 4: Expressions (6 slots)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, Upload, Sparkles, CheckCircle2, 
  Camera, Palette, RefreshCw, Lock, Play, Trash2,
  Image, Bell, Eye, RotateCcw, Wand2, AlertTriangle, RefreshCcw
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useCharacterPackGeneration, SlotDefinition } from '@/hooks/useCharacterPackGeneration';

// ============================================
// 12 ESSENTIAL MODEL PACK - 4 PHASES
// ============================================

// Phase 1: User uploads (references)
const REFERENCE_SLOTS = [
  { type: 'ref_closeup_front', label: 'Primer Plano Frontal', required: true, viewAngle: 'front' },
  { type: 'ref_profile', label: 'Perfil Lateral', required: false, viewAngle: 'side' },
];

// Phase 2: Base Visual - Closeups (generated)
const BASE_VISUAL_SLOTS = [
  { type: 'closeup_front', label: 'Primer Plano Frontal', viewAngle: 'front' },
  { type: 'closeup_profile', label: 'Primer Plano Perfil', viewAngle: 'side' },
];

// Phase 3: Turnarounds - Full body views (4 poses)
const TURNAROUND_SLOTS = [
  { type: 'turn_front_34', label: 'Frontal 3/4', viewAngle: 'front_34' },
  { type: 'turn_side', label: 'Lateral', viewAngle: 'side' },
  { type: 'turn_back', label: 'Espalda', viewAngle: 'back' },
  { type: 'turn_back_34', label: 'Espalda 3/4', viewAngle: 'back_34' },
];

// Phase 4: Expressions
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
  ...REFERENCE_SLOTS.map(s => s.type),
  ...BASE_VISUAL_SLOTS.map(s => s.type),
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
  qc_issues: string[] | null;
  fix_notes: string | null;
  prompt_text: string | null;
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

// Valid statuses that count as "complete" for phase progression
const COMPLETE_STATUSES = ['approved', 'generated', 'needs_review', 'uploaded'];

// Helper function to map QC issues to human-readable corrections in Spanish
const getCorrectionsForIssues = (issues: string[]): string[] => {
  const corrections: string[] = [];
  const allText = issues.join(' ').toLowerCase();
  
  const correctionMap: Record<string, { patterns: string[], fix: string }> = {
    hair: { 
      patterns: ['hair', 'pelo', 'cabello', 'grey', 'gray', 'canas', 'gris', 'plateado'], 
      fix: 'Preservar color y estilo de pelo exacto (incluyendo canas)' 
    },
    age: { 
      patterns: ['age', 'older', 'younger', 'edad', 'mayor', 'joven', 'niño', 'adulto'], 
      fix: 'Mantener apariencia de edad exacta del personaje' 
    },
    face: { 
      patterns: ['facial', 'face', 'nose', 'mouth', 'nariz', 'boca', 'cara', 'rostro'], 
      fix: 'Preservar estructura facial y proporciones' 
    },
    skin: { 
      patterns: ['skin', 'tone', 'piel', 'tono', 'complexion', 'tez'], 
      fix: 'Mantener tono de piel consistente' 
    },
    eyes: { 
      patterns: ['eyes', 'eye', 'ojos', 'ojo', 'mirada'], 
      fix: 'Preservar forma y color de ojos' 
    },
    texture: { 
      patterns: ['texture', 'stylized', 'cartoon', 'textura', 'estilizado', 'caricatura'], 
      fix: 'Generar con calidad fotorrealista, sin estilización' 
    },
  };
  
  for (const [_, config] of Object.entries(correctionMap)) {
    if (config.patterns.some(p => allText.includes(p))) {
      corrections.push(config.fix);
    }
  }
  
  if (corrections.length === 0) {
    corrections.push('Reforzar parecido general con la referencia');
  }
  
  return corrections;
};

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
  const [previewImage, setPreviewImage] = useState<{ 
    url: string; 
    label: string; 
    slotType: string;
    qcScore?: number | null;
    qcIssues?: string[] | null;
    fixNotes?: string | null;
    slotId?: string;
  } | null>(null);
  const [improvingQC, setImprovingQC] = useState(false);
  const [improveCoherenceMode, setImproveCoherenceMode] = useState(false);
  const [rebuildingFromBase, setRebuildingFromBase] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch or initialize slots - with automatic backfill for missing slots
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
      // Check for missing slots and backfill
      const existingTypes = new Set(data.map(s => s.slot_type));
      const missingTypes = ALL_SLOT_TYPES.filter(t => !existingTypes.has(t));
      
      if (missingTypes.length > 0) {
        console.log('[CharacterPackBuilder] Backfilling missing slots:', missingTypes);
        const slotsToInsert = missingTypes.map(type => {
          const refSlot = REFERENCE_SLOTS.find(s => s.type === type);
          const baseSlot = BASE_VISUAL_SLOTS.find(s => s.type === type);
          const turnSlot = TURNAROUND_SLOTS.find(s => s.type === type);
          const exprSlot = EXPRESSION_SLOTS.find(s => s.type === type);
          
          return {
            character_id: characterId,
            slot_type: type,
            slot_index: 0,
            view_angle: refSlot?.viewAngle || baseSlot?.viewAngle || turnSlot?.viewAngle || 'front',
            expression_name: exprSlot?.expression || null,
            image_url: null,
            status: 'empty',
            qc_score: null,
            required: refSlot?.required ?? true,
          };
        });
        
        const { error: insertError } = await supabase
          .from('character_pack_slots')
          .insert(slotsToInsert);
          
        if (insertError) {
          console.error('Error backfilling slots:', insertError);
        } else {
          // Re-fetch with new slots
          const { data: updatedData } = await supabase
            .from('character_pack_slots')
            .select('*')
            .eq('character_id', characterId)
            .in('slot_type', ALL_SLOT_TYPES)
            .order('slot_type');
            
          if (updatedData) {
            setSlots(updatedData as PackSlot[]);
            calculateCompleteness(updatedData as PackSlot[]);
            setLoading(false);
            return;
          }
        }
      }
      
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

    // Phase 1: Reference slots
    REFERENCE_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: slot.viewAngle,
        expression_name: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        qc_issues: null,
        fix_notes: null,
        prompt_text: null,
        required: slot.required,
      });
    });

    // Phase 2: Base Visual slots
    BASE_VISUAL_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: slot.viewAngle,
        expression_name: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        qc_issues: null,
        fix_notes: null,
        prompt_text: null,
        required: true,
      });
    });

    // Phase 3: Turnaround slots
    TURNAROUND_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: slot.viewAngle,
        expression_name: null,
        image_url: null,
        status: 'empty',
        qc_score: null,
        qc_issues: null,
        fix_notes: null,
        prompt_text: null,
        required: true,
      });
    });

    // Phase 4: Expression slots
    EXPRESSION_SLOTS.forEach((slot, i) => {
      newSlots.push({
        slot_type: slot.type,
        slot_index: i,
        view_angle: 'front',
        expression_name: slot.expression,
        image_url: null,
        status: 'empty',
        qc_score: null,
        qc_issues: null,
        fix_notes: null,
        prompt_text: null,
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
    const completed = slotData.filter(s => COMPLETE_STATUSES.includes(s.status)).length;
    setCompletenessScore(total > 0 ? Math.round((completed / total) * 100) : 0);
  };

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Get slot by type
  const getSlot = (type: string): PackSlot | undefined => slots.find(s => s.slot_type === type);

  // Helper: check if slot is complete
  const isSlotComplete = (slot: PackSlot | undefined) => {
    return slot && slot.image_url && COMPLETE_STATUSES.includes(slot.status);
  };

  // Phase completion checks - NOW using isSlotComplete helper
  const phase1Complete = () => {
    const refSlot = getSlot('ref_closeup_front');
    return isSlotComplete(refSlot);
  };

  const phase2Complete = () => {
    return BASE_VISUAL_SLOTS.every(s => isSlotComplete(getSlot(s.type)));
  };

  const phase3Complete = () => {
    return TURNAROUND_SLOTS.every(s => isSlotComplete(getSlot(s.type)));
  };

  const phase4Complete = () => {
    return EXPRESSION_SLOTS.every(s => isSlotComplete(getSlot(s.type)));
  };

  // Phase counts
  const phase1Count = () => REFERENCE_SLOTS.filter(s => getSlot(s.type)?.image_url).length;
  const phase2Count = () => BASE_VISUAL_SLOTS.filter(s => getSlot(s.type)?.image_url).length;
  const phase3Count = () => TURNAROUND_SLOTS.filter(s => getSlot(s.type)?.image_url).length;
  const phase4Count = () => EXPRESSION_SLOTS.filter(s => getSlot(s.type)?.image_url).length;

  // Analyze reference image to extract Visual DNA
  const analyzeReferenceImage = async (imageUrl: string) => {
    try {
      toast.info('Analizando rasgos faciales...', { duration: 3000 });
      
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-single-reference`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            characterId,
            imageUrl,
            characterName,
          }),
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Reference analysis failed:', response.status, errorData);
        // Don't block - just warn
        toast.warning('No se pudo analizar la referencia automáticamente. El parecido podría variar.');
        return;
      }
      
      const result = await response.json();
      console.log('[CharacterPackBuilder] Visual DNA extracted:', result);
      toast.success('Rasgos faciales analizados ✓', { duration: 2000 });
      
    } catch (error) {
      console.error('Reference analysis error:', error);
      // Don't block the upload flow
      toast.warning('Análisis de referencia no disponible');
    }
  };

  // Upload image handler
  const uploadImage = async (slotType: string, file: File) => {
    const slot = getSlot(slotType);
    if (!slot) return;

    // Reject HEIC format - not supported by browsers
    if (file.name.toLowerCase().endsWith('.heic') || file.type === 'image/heic') {
      toast.error('Formato HEIC no soportado. Por favor convierte la imagen a JPG o PNG.');
      return;
    }
    
    // Validate image type
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen');
      return;
    }

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

      toast.success(`${REFERENCE_SLOTS.find(s => s.type === slotType)?.label} subido`);
      
      // AUTO-ANALYZE: If this is the primary reference, extract Visual DNA
      if (slotType === 'ref_closeup_front') {
        await analyzeReferenceImage(urlData.publicUrl);
      }
      
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
      setPreviewImage(null);
      toast.success('Imagen eliminada');
    } catch (error) {
      toast.error('Error al eliminar');
    }
  };

  // Delete all images from a phase
  const deletePhaseImages = async (slotTypes: string[]) => {
    const slotsToDelete = slots.filter(s => 
      slotTypes.includes(s.slot_type) && s.image_url
    );
    
    if (slotsToDelete.length === 0) {
      toast.info('No hay imágenes para eliminar');
      return;
    }
    
    try {
      for (const slot of slotsToDelete) {
        const urlParts = slot.image_url!.split('/character-packs/');
        if (urlParts.length > 1) {
          await supabase.storage.from('character-packs').remove([urlParts[1]]);
        }
        
        await supabase.from('character_pack_slots').update({
          image_url: null,
          status: 'empty',
          qc_score: null,
        }).eq('id', slot.id);
      }
      
      await fetchSlots();
      toast.success(`${slotsToDelete.length} imágenes eliminadas`);
    } catch (error) {
      toast.error('Error al eliminar imágenes');
    }
  };

  // Use shared hook with Background Tasks
  const { generateSlots, generateSingleSlot } = useCharacterPackGeneration({
    characterId,
    characterName,
    characterBio,
    projectId,
    onSlotComplete: () => fetchSlots(),
    onAllComplete: onPackComplete,
  });

  // Generate single slot (for individual regeneration)
  const generateSlot = async (slotType: string, viewAngle?: string, expressionName?: string) => {
    const slot = getSlot(slotType);
    if (!slot) return;

    setGeneratingSlot(slot.id);
    setPreviewImage(null);

    try {
      const result = await generateSingleSlot(slot.id, slotType, {
        viewAngle: viewAngle || slot.view_angle || undefined,
        expression: expressionName || slot.expression_name || undefined,
      });

      if (result.success) {
        toast.success(`${slotType} generado`);
      } else {
        toast.error(result.error || 'Error al generar');
      }
      
      await fetchSlots();
    } catch (error) {
      console.error('Generate error:', error);
      toast.error('Error al generar');
    } finally {
      setGeneratingSlot(null);
    }
  };

  // Generate Base Visual (Phase 2) with Background Tasks
  const generateBaseVisual = async () => {
    if (!phase1Complete()) {
      toast.error('Sube primero la foto frontal obligatoria');
      return;
    }

    // Check if slots exist - if not, wait for backfill
    const slotsExist = BASE_VISUAL_SLOTS.every(s => getSlot(s.type));
    if (!slotsExist) {
      toast.info('Inicializando slots...');
      await fetchSlots();
      return; // User can click again after backfill
    }

    const toGenerate: SlotDefinition[] = BASE_VISUAL_SLOTS
      .filter(s => !getSlot(s.type)?.image_url)
      .map(s => {
        const slot = getSlot(s.type);
        return {
          id: slot?.id || '',
          type: s.type,
          label: s.label,
          viewAngle: s.viewAngle,
        };
      })
      .filter(s => s.id);

    // Only say "already generated" if both slots have images
    const allHaveImages = BASE_VISUAL_SLOTS.every(s => getSlot(s.type)?.image_url);
    if (toGenerate.length === 0 && allHaveImages) {
      toast.info('Base visual ya generada');
      setActivePhase('phase3');
      return;
    }
    
    if (toGenerate.length === 0) {
      toast.error('Error: no se encontraron slots para generar');
      console.error('[generateBaseVisual] No slots to generate but not all have images');
      return;
    }

    setGeneratingPhase('phase2');
    setPhaseProgress({ current: 0, total: toGenerate.length });

    toast.info(
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        <span>Generando en segundo plano. Puedes navegar a otra página.</span>
      </div>
    );

    const result = await generateSlots(
      toGenerate,
      `Base Visual: ${characterName}`,
      `Generando ${toGenerate.length} vistas frontales`
    );

    setGeneratingPhase(null);
    await fetchSlots();

    if (result.success) {
      toast.success(`Base visual generada (${result.completedCount})`);
      setActivePhase('phase3');
    }
  };

  // Generate Turnarounds (Phase 3) with Background Tasks
  const generateTurnarounds = async () => {
    if (!phase2Complete()) {
      toast.error('Genera primero la base visual');
      return;
    }

    // Check if slots exist
    const slotsExist = TURNAROUND_SLOTS.every(s => getSlot(s.type));
    if (!slotsExist) {
      toast.info('Inicializando slots...');
      await fetchSlots();
      return;
    }

    const toGenerate: SlotDefinition[] = TURNAROUND_SLOTS
      .filter(s => !getSlot(s.type)?.image_url)
      .map(s => {
        const slot = getSlot(s.type);
        return {
          id: slot?.id || '',
          type: s.type,
          label: s.label,
          viewAngle: s.viewAngle,
        };
      })
      .filter(s => s.id);

    const allHaveImages = TURNAROUND_SLOTS.every(s => getSlot(s.type)?.image_url);
    if (toGenerate.length === 0 && allHaveImages) {
      toast.info('Turnarounds ya generados');
      setActivePhase('phase4');
      return;
    }
    
    if (toGenerate.length === 0) {
      toast.error('Error: no se encontraron slots para generar');
      return;
    }

    setGeneratingPhase('phase3');
    setPhaseProgress({ current: 0, total: toGenerate.length });

    toast.info(
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        <span>Generando en segundo plano. Puedes navegar a otra página.</span>
      </div>
    );

    const result = await generateSlots(
      toGenerate,
      `Turnarounds: ${characterName}`,
      `Generando ${toGenerate.length} vistas traseras`
    );

    setGeneratingPhase(null);
    await fetchSlots();

    if (result.success) {
      toast.success(`Turnarounds generados (${result.completedCount})`);
      setActivePhase('phase4');
    }
  };

  // Generate Expressions (Phase 4) with Background Tasks
  const generateExpressions = async () => {
    if (!phase3Complete()) {
      toast.error('Genera primero los turnarounds');
      return;
    }

    // Check if slots exist
    const slotsExist = EXPRESSION_SLOTS.every(s => getSlot(s.type));
    if (!slotsExist) {
      toast.info('Inicializando slots...');
      await fetchSlots();
      return;
    }

    const toGenerate: SlotDefinition[] = EXPRESSION_SLOTS
      .filter(s => !getSlot(s.type)?.image_url)
      .map(s => {
        const slot = getSlot(s.type);
        return {
          id: slot?.id || '',
          type: s.type,
          label: s.label,
          viewAngle: 'front',
          expression: s.expression,
        };
      })
      .filter(s => s.id);

    const allHaveImages = EXPRESSION_SLOTS.every(s => getSlot(s.type)?.image_url);
    if (toGenerate.length === 0 && allHaveImages) {
      toast.info('Todas las expresiones ya están generadas');
      return;
    }
    
    if (toGenerate.length === 0) {
      toast.error('Error: no se encontraron slots para generar');
      return;
    }

    setGeneratingPhase('phase4');
    setPhaseProgress({ current: 0, total: toGenerate.length });

    toast.info(
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        <span>Generando en segundo plano. Puedes navegar a otra página.</span>
      </div>
    );

    const result = await generateSlots(
      toGenerate,
      `Expresiones: ${characterName}`,
      `Generando ${toGenerate.length} expresiones del personaje`
    );

    setGeneratingPhase(null);
    await fetchSlots();

    if (result.success) {
      toast.success(`Expresiones generadas (${result.completedCount})`);
    }
  };

  // Generate full pack with Background Tasks
  const generateFullPack = async () => {
    if (!phase1Complete()) {
      toast.error('Sube primero la foto frontal obligatoria');
      return;
    }

    // Build all slots to generate
    const allToGenerate: SlotDefinition[] = [];

    // Add base visual if not complete
    BASE_VISUAL_SLOTS.forEach(s => {
      const slot = getSlot(s.type);
      if (!slot?.image_url && slot?.id) {
        allToGenerate.push({
          id: slot.id,
          type: s.type,
          label: s.label,
          viewAngle: s.viewAngle,
        });
      }
    });

    // Add turnarounds if not complete
    TURNAROUND_SLOTS.forEach(s => {
      const slot = getSlot(s.type);
      if (!slot?.image_url && slot?.id) {
        allToGenerate.push({
          id: slot.id,
          type: s.type,
          label: s.label,
          viewAngle: s.viewAngle,
        });
      }
    });

    // Add expressions if not complete
    EXPRESSION_SLOTS.forEach(s => {
      const slot = getSlot(s.type);
      if (!slot?.image_url && slot?.id) {
        allToGenerate.push({
          id: slot.id,
          type: s.type,
          label: s.label,
          viewAngle: 'front',
          expression: s.expression,
        });
      }
    });

    if (allToGenerate.length === 0) {
      toast.info('El pack ya está completo');
      return;
    }

    setGeneratingPhase('phase2');

    toast.info(
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4" />
        <span>Generando {allToGenerate.length} imágenes en segundo plano.</span>
      </div>
    );

    const result = await generateSlots(
      allToGenerate,
      `Pack Completo: ${characterName}`,
      `Generando ${allToGenerate.length} modelos del personaje`
    );

    setGeneratingPhase(null);
    await fetchSlots();

    if (result.success) {
      toast.success(`Pack generado (${result.completedCount} imágenes)`);
    }
  };

  // Improve QC - regenerate with enhanced prompt (identity-focused)
  const regenerateWithCoherence = async (slotType: string, slotId: string, qcIssues?: string[], fixNotes?: string) => {
    setImprovingQC(true);
    try {
      // Get enhanced prompt with identity checklist
      const { data: enhanceData, error: enhanceError } = await supabase.functions.invoke('improve-character-qc', {
        body: {
          slotId,
          characterId,
          projectId,
          currentIssues: qcIssues || [],
          fixNotes: fixNotes || '',
          mode: 'coherence' // Request identity-focused improvements
        }
      });

      if (enhanceError) {
        console.error('Error getting enhanced prompt:', enhanceError);
        toast.error('Error al mejorar el prompt');
        setImprovingQC(false);
        return;
      }

      toast.info(
        <div className="space-y-1">
          <p className="font-medium">🔒 Modo Coherencia Activado</p>
          <p className="text-sm text-muted-foreground">
            Checklist: pelo, rasgos, edad, proporciones, vestuario
          </p>
        </div>
      );

      // Regenerate with the enhanced prompt
      const slotDef = [...REFERENCE_SLOTS, ...BASE_VISUAL_SLOTS, ...TURNAROUND_SLOTS, ...EXPRESSION_SLOTS]
        .find(s => s.type === slotType);
      
      if (slotDef) {
        const viewAngle = 'viewAngle' in slotDef ? slotDef.viewAngle : undefined;
        const expression = 'expression' in slotDef ? slotDef.expression : undefined;
        await generateSlot(slotType, viewAngle, expression);
      }

      setPreviewImage(null);
      await fetchSlots();
      toast.success('Imagen regenerada con refuerzo de identidad');
    } catch (error) {
      console.error('Error improving coherence:', error);
      toast.error('Error al mejorar coherencia');
    } finally {
      setImprovingQC(false);
    }
  };

  // Rebuild entire pack from base visual (nuclear option)
  const rebuildFromBase = async () => {
    if (!phase1Complete()) {
      toast.error('Necesitas las referencias primero');
      return;
    }

    setRebuildingFromBase(true);
    
    try {
      // 1. Delete all generated images (keep references)
      const generatedSlotTypes = [
        ...BASE_VISUAL_SLOTS.map(s => s.type),
        ...TURNAROUND_SLOTS.map(s => s.type),
        ...EXPRESSION_SLOTS.map(s => s.type),
      ];
      
      const slotsToReset = slots.filter(s => 
        generatedSlotTypes.includes(s.slot_type) && s.image_url
      );

      toast.info(`Reiniciando ${slotsToReset.length} imágenes...`);

      for (const slot of slotsToReset) {
        if (slot.image_url) {
          const urlParts = slot.image_url.split('/character-packs/');
          if (urlParts.length > 1) {
            await supabase.storage.from('character-packs').remove([urlParts[1]]);
          }
        }
        
        await supabase.from('character_pack_slots').update({
          image_url: null,
          status: 'empty',
          qc_score: null,
          qc_issues: null,
          fix_notes: null,
        }).eq('id', slot.id);
      }

      await fetchSlots();
      
      // 2. Auto-start new base visual generation with coherence mode
      toast.success('Pack reiniciado. Generando nueva base visual...');
      
      // Wait a moment then trigger base visual
      setTimeout(() => {
        generateBaseVisual();
      }, 500);
      
    } catch (error) {
      console.error('Error rebuilding from base:', error);
      toast.error('Error al reiniciar pack');
    } finally {
      setRebuildingFromBase(false);
    }
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
    slotDef: { type: string; label: string; required?: boolean; viewAngle?: string; expression?: string },
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
          <img 
            src={slot.image_url!} 
            alt={slotDef.label} 
            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setPreviewImage({ 
              url: slot.image_url!, 
              label: slotDef.label, 
              slotType: slotDef.type,
              qcScore: slot.qc_score,
              qcIssues: slot.qc_issues,
              fixNotes: slot.fix_notes,
              slotId: slot.id
            })}
          />
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

        {/* Status badge with QC score */}
        {hasImage && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="absolute top-1 right-1">
                  {slot.qc_score !== null && slot.qc_score < 80 ? (
                    <Badge variant="pending" className="text-xs px-1">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />
                      {slot.qc_score}
                    </Badge>
                  ) : slot.qc_score !== null ? (
                    <Badge variant="pass" className="text-xs px-1">
                      <CheckCircle2 className="w-3 h-3 mr-0.5" />
                      {slot.qc_score}
                    </Badge>
                  ) : (
                    <Badge variant="pass" className="text-xs px-1">
                      <CheckCircle2 className="w-3 h-3" />
                    </Badge>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {slot.qc_score !== null ? (
                  slot.qc_score < 80 
                    ? `Coherencia: ${slot.qc_score}% - Click para mejorar` 
                    : `Coherencia: ${slot.qc_score}% - Aprobado`
                ) : 'Sin evaluación de coherencia'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Required badge */}
        {slotDef.required && !hasImage && (
          <div className="absolute top-1 left-1">
            <Badge variant="destructive" className="text-[10px] px-1">REQ</Badge>
          </div>
        )}

        {/* Click to view hint */}
        {hasImage && (
          <div className="absolute top-1 left-1">
            <Badge variant="secondary" className="text-[10px] px-1 bg-black/50 border-0">
              <Eye className="w-2 h-2" />
            </Badge>
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
              onClick={() => generateSlot(slotDef.type, slotDef.viewAngle, slotDef.expression)}
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
                onClick={() => isUpload ? fileInputRefs.current[slotDef.type]?.click() : generateSlot(slotDef.type, slotDef.viewAngle, slotDef.expression)}
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
    <>
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
          {/* Quick Actions Row */}
          <div className="flex gap-2">
            {/* Generate Full Pack */}
            {phase1Complete() && completenessScore < 100 && (
              <Button
                variant="gold"
                className="flex-1"
                onClick={generateFullPack}
                disabled={generatingPhase !== null || rebuildingFromBase}
              >
                {generatingPhase ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Generar Pack ({12 - Math.round(completenessScore * 12 / 100)} restantes)
                  </>
                )}
              </Button>
            )}
            
            {/* Rebuild from Base - Nuclear Option */}
            {phase2Count() > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={rebuildFromBase}
                      disabled={generatingPhase !== null || rebuildingFromBase}
                      className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10 hover:text-orange-400"
                    >
                      {rebuildingFromBase ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">Rehacer desde Base</p>
                    <p className="text-xs text-muted-foreground">
                      Borra todo el pack generado y empieza de nuevo
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

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
                    <p className="font-medium">Paso 1: Referencias</p>
                    <p className="text-xs text-muted-foreground">Sube tus fotos de referencia</p>
                  </div>
                  <Badge variant={phase1Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                    {phase1Count()}/2
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-3">
                  {REFERENCE_SLOTS.map(slot => renderSlotCard(slot, true))}
                </div>
                {phase1Complete() && (
                  <div className="mt-3 flex items-center text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    ¡Listo! Ahora puedes generar la base visual
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 2: Base Visual (Front/Profile) */}
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
                    <p className="font-medium">Paso 2: Base Visual</p>
                    <p className="text-xs text-muted-foreground">Frente 3/4 y lateral</p>
                  </div>
                  <Badge variant={phase2Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                    {phase2Count()}/2
                  </Badge>
                  {!phase1Complete() && <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {!phase1Complete() ? (
                  <p className="text-sm text-muted-foreground">Completa el Paso 1 primero</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {BASE_VISUAL_SLOTS.map(slot => renderSlotCard(slot))}
                    </div>
                    <div className="flex gap-2">
                      {!phase2Complete() && (
                        <Button
                          onClick={(e) => { e.stopPropagation(); generateBaseVisual(); }}
                          disabled={generatingPhase === 'phase2'}
                          className="flex-1"
                        >
                          {generatingPhase === 'phase2' ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Generar 2 Vistas Base
                            </>
                          )}
                        </Button>
                      )}
                      {phase2Count() > 0 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deletePhaseImages(BASE_VISUAL_SLOTS.map(s => s.type)); }}
                          title="Borrar todas las imágenes de esta fase"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 3: Turnarounds (Back views) */}
            <AccordionItem value="phase3" className="border rounded-lg" disabled={!phase2Complete()}>
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    phase3Complete() ? 'bg-green-500 text-white' : 
                    phase2Complete() ? 'bg-primary text-primary-foreground' : 'bg-muted opacity-50'
                  }`}>
                    {phase3Complete() ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Paso 3: Turnarounds</p>
                    <p className="text-xs text-muted-foreground">Vistas traseras</p>
                  </div>
                  <Badge variant={phase3Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                    {phase3Count()}/2
                  </Badge>
                  {!phase2Complete() && <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {!phase2Complete() ? (
                  <p className="text-sm text-muted-foreground">Completa el Paso 2 primero</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      {TURNAROUND_SLOTS.map(slot => renderSlotCard(slot))}
                    </div>
                    <div className="flex gap-2">
                      {!phase3Complete() && (
                        <Button
                          onClick={(e) => { e.stopPropagation(); generateTurnarounds(); }}
                          disabled={generatingPhase === 'phase3'}
                          className="flex-1"
                        >
                          {generatingPhase === 'phase3' ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Generar 4 Turnarounds
                            </>
                          )}
                        </Button>
                      )}
                      {phase3Count() > 0 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deletePhaseImages(TURNAROUND_SLOTS.map(s => s.type)); }}
                          title="Borrar todas las imágenes de esta fase"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Phase 4: Expressions */}
            <AccordionItem value="phase4" className="border rounded-lg" disabled={!phase3Complete()}>
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    phase4Complete() ? 'bg-green-500 text-white' : 
                    phase3Complete() ? 'bg-primary text-primary-foreground' : 'bg-muted opacity-50'
                  }`}>
                    {phase4Complete() ? <CheckCircle2 className="w-4 h-4" /> : <Palette className="w-4 h-4" />}
                  </div>
                  <div className="text-left">
                    <p className="font-medium">Paso 4: Expresiones</p>
                    <p className="text-xs text-muted-foreground">6 emociones básicas</p>
                  </div>
                  <Badge variant={phase4Complete() ? 'pass' : 'secondary'} className="ml-auto mr-2">
                    {phase4Count()}/6
                  </Badge>
                  {!phase3Complete() && <Lock className="w-4 h-4 text-muted-foreground" />}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {!phase3Complete() ? (
                  <p className="text-sm text-muted-foreground">Completa el Paso 3 primero</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                      {EXPRESSION_SLOTS.map(slot => renderSlotCard(slot))}
                    </div>
                    <div className="flex gap-2">
                      {!phase4Complete() && (
                        <Button
                          onClick={(e) => { e.stopPropagation(); generateExpressions(); }}
                          disabled={generatingPhase === 'phase4'}
                          className="flex-1"
                        >
                          {generatingPhase === 'phase4' ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Generando...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Generar 6 Expresiones
                            </>
                          )}
                        </Button>
                      )}
                      {phase4Count() > 0 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={(e) => { e.stopPropagation(); deletePhaseImages(EXPRESSION_SLOTS.map(s => s.type)); }}
                          title="Borrar todas las imágenes de esta fase"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
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

      {/* Preview Modal with Coherence Toggle */}
      <Dialog open={!!previewImage} onOpenChange={(open) => {
        if (!open) {
          setPreviewImage(null);
          setImproveCoherenceMode(false);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              {previewImage?.label}
              {previewImage?.qcScore !== null && previewImage?.qcScore !== undefined && (
                <Badge variant={previewImage.qcScore >= 80 ? 'pass' : 'pending'} className="ml-2">
                  Coherencia: {previewImage.qcScore}%
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Regenerar: pose/fondo/encuadre • Mejorar coherencia: identidad facial/pelo/edad
            </DialogDescription>
          </DialogHeader>
          
          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 min-h-0">
            {/* QC Issues Panel */}
            {previewImage?.qcIssues && previewImage.qcIssues.length > 0 && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  Problemas detectados
                </div>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {previewImage.qcIssues.map((issue, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
                {previewImage.fixNotes && (
                  <div className="pt-2 border-t border-yellow-500/20">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Sugerencia:</span> {previewImage.fixNotes}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Corrections Panel - shows what will be fixed */}
            {previewImage?.qcIssues && previewImage.qcIssues.length > 0 && improveCoherenceMode && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-medium">
                  <Wand2 className="w-4 h-4" />
                  Correcciones que se aplicarán
                </div>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  {getCorrectionsForIssues(previewImage.qcIssues).map((correction, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-purple-500">✓</span>
                      {correction}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground pt-1 border-t border-purple-500/20">
                  Al pulsar "Regenerar con Coherencia", el sistema reforzará estas áreas en el prompt.
                </p>
              </div>
            )}
            
            <div className="relative">
              <img 
                src={previewImage?.url} 
                alt={previewImage?.label}
                className="w-full h-auto rounded-lg max-h-[50vh] object-contain"
              />
            </div>
          </div>
          
          {/* Fixed footer - always visible */}
          <div className="flex-shrink-0 space-y-3 pt-3 border-t border-border">
            {/* Toggle */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-2">
                <Wand2 className={`w-4 h-4 ${improveCoherenceMode ? 'text-purple-500' : 'text-muted-foreground'}`} />
                <div>
                  <Label htmlFor="coherence-mode" className="text-sm font-medium cursor-pointer">
                    Mejorar coherencia
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Refuerza identidad: pelo, rasgos, edad, proporciones
                  </p>
                </div>
              </div>
              <Switch
                id="coherence-mode"
                checked={improveCoherenceMode}
                onCheckedChange={setImproveCoherenceMode}
              />
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => setPreviewImage(null)}>
                Cerrar
              </Button>
              
              <div className="flex gap-2">
                <Button 
                  variant={improveCoherenceMode ? "default" : "secondary"}
                  className={improveCoherenceMode ? "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600" : ""}
                  onClick={async () => {
                    if (!previewImage || isRegenerating) return;
                    setIsRegenerating(true);
                    
                    try {
                      if (improveCoherenceMode && previewImage.slotId) {
                        await regenerateWithCoherence(
                          previewImage.slotType, 
                          previewImage.slotId, 
                          previewImage.qcIssues || undefined, 
                          previewImage.fixNotes || undefined
                        );
                      } else {
                        const slot = [...REFERENCE_SLOTS, ...BASE_VISUAL_SLOTS, ...TURNAROUND_SLOTS, ...EXPRESSION_SLOTS]
                          .find(s => s.type === previewImage.slotType);
                        if (slot) {
                          const viewAngle = 'viewAngle' in slot ? slot.viewAngle : undefined;
                          const expression = 'expression' in slot ? slot.expression : undefined;
                          await generateSlot(slot.type, viewAngle, expression);
                        }
                      }
                    } finally {
                      setIsRegenerating(false);
                    }
                  }}
                  disabled={generatingSlot !== null || improvingQC || isRegenerating}
                >
                  {improvingQC || generatingSlot || isRegenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {improvingQC ? 'Mejorando...' : 'Regenerando...'}
                    </>
                  ) : improveCoherenceMode ? (
                    <>
                      <Wand2 className="w-4 h-4 mr-2" />
                      Regenerar con Coherencia
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Regenerar
                    </>
                  )}
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => previewImage && deleteSlotImage(previewImage.slotType)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
