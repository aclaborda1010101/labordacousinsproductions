/**
 * CharacterPackMVP - ASSISTED Mode (Expanded to 12 slots)
 * Simple upload-first flow with automatic generation
 * Phase 1: User uploads frontal photo (required)
 * Phase 2: System auto-generates remaining 11 slots
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useBackgroundTasks } from '@/contexts/BackgroundTasksContext';
import {
  Loader2,
  Check,
  RefreshCw,
  Image,
  User,
  Video,
  ChevronDown,
  ChevronUp,
  Upload,
  Sparkles,
  Camera,
  Palette,
} from 'lucide-react';

// ============================================
// 12 ESSENTIAL MODEL PACK (Same as PRO)
// ============================================

const UPLOAD_SLOTS = [
  { type: 'ref_closeup_front', label: 'Primer Plano Frontal', required: true },
];

const TURNAROUND_SLOTS = [
  { type: 'turn_front_34', label: 'Frontal 3/4', viewAngle: 'front_34' },
  { type: 'turn_side', label: 'Lateral', viewAngle: 'side' },
  { type: 'turn_back', label: 'Espalda', viewAngle: 'back' },
  { type: 'turn_back_34', label: 'Espalda 3/4', viewAngle: 'back_34' },
];

const EXPRESSION_SLOTS = [
  { type: 'expr_neutral', label: 'Neutral', expression: 'neutral' },
  { type: 'expr_happy', label: 'Alegre', expression: 'happy' },
  { type: 'expr_sad', label: 'Triste', expression: 'sad' },
  { type: 'expr_angry', label: 'Enojado', expression: 'angry' },
  { type: 'expr_surprised', label: 'Sorprendido', expression: 'surprised' },
  { type: 'expr_fear', label: 'Miedo', expression: 'fear' },
];

const ALL_SLOT_TYPES = [
  ...UPLOAD_SLOTS.map(s => s.type),
  ...TURNAROUND_SLOTS.map(s => s.type),
  ...EXPRESSION_SLOTS.map(s => s.type),
];

interface PackSlot {
  id: string;
  slot_type: string;
  status: string;
  image_url: string | null;
  view_angle?: string | null;
  expression_name?: string | null;
}

interface CharacterPackMVPProps {
  characterId: string;
  characterName: string;
  characterBio?: string | null;
  projectId: string;
  isPro: boolean;
  onPackComplete?: () => void;
}

export default function CharacterPackMVP({
  characterId,
  characterName,
  characterBio,
  projectId,
  isPro,
  onPackComplete,
}: CharacterPackMVPProps) {
  const { addTask, updateTask, completeTask, failTask } = useBackgroundTasks();
  
  const [slots, setSlots] = useState<PackSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 11, phase: '' });
  const [completenessScore, setCompletenessScore] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch or initialize slots
  const fetchSlots = useCallback(async () => {
    const { data: existing } = await supabase
      .from('character_pack_slots')
      .select('id, slot_type, status, image_url, view_angle, expression_name')
      .eq('character_id', characterId)
      .in('slot_type', ALL_SLOT_TYPES);

    // Create missing slots
    const existingTypes = new Set(existing?.map(s => s.slot_type) || []);
    const missingSlots = ALL_SLOT_TYPES.filter(t => !existingTypes.has(t));

    if (missingSlots.length > 0) {
      const toInsert = missingSlots.map(slot_type => {
        const turnaround = TURNAROUND_SLOTS.find(s => s.type === slot_type);
        const expression = EXPRESSION_SLOTS.find(s => s.type === slot_type);
        
        return {
          character_id: characterId,
          slot_type,
          status: 'empty',
          required: true,
          view_angle: turnaround?.viewAngle || (expression ? 'front' : null),
          expression_name: expression?.expression || null,
        };
      });
      
      await supabase.from('character_pack_slots').insert(toInsert);
      
      // Refetch
      const { data: updated } = await supabase
        .from('character_pack_slots')
        .select('id, slot_type, status, image_url, view_angle, expression_name')
        .eq('character_id', characterId)
        .in('slot_type', ALL_SLOT_TYPES);
      
      setSlots((updated || []) as PackSlot[]);
    } else {
      setSlots((existing || []) as PackSlot[]);
    }

    // Calculate completeness
    const allSlots = existing || [];
    const completed = allSlots.filter(s => s.image_url).length;
    setCompletenessScore(Math.round((completed / 12) * 100));

    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Get slot by type
  const getSlot = (type: string): PackSlot | undefined => slots.find(s => s.slot_type === type);

  // Check if reference is uploaded
  const hasReference = () => {
    const ref = getSlot('ref_closeup_front');
    return ref && ref.image_url;
  };

  // Upload reference photo
  const uploadReference = async (file: File) => {
    const slot = getSlot('ref_closeup_front');
    if (!slot) return;

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${characterId}/ref_closeup_front_${Date.now()}.${fileExt}`;

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

      toast.success('Foto subida');
      await fetchSlots();
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Error al subir');
    } finally {
      setUploading(false);
    }
  };

  // Auto-generate remaining 11 slots
  const autoGenerateFullPack = async () => {
    if (!hasReference()) {
      toast.error('Sube primero la foto frontal');
      return;
    }

    setAutoGenerating(true);

    // Create background task
    const taskId = addTask({
      title: `Creando pack de ${characterName}`,
      description: 'Generando 11 imágenes automáticamente',
      type: 'character_generation',
      projectId,
      entityId: characterId,
    });

    const allToGenerate = [
      ...TURNAROUND_SLOTS,
      ...EXPRESSION_SLOTS,
    ];

    let completed = 0;
    const total = allToGenerate.length;

    try {
      for (const slotDef of allToGenerate) {
        const slot = getSlot(slotDef.type);
        if (!slot || slot.image_url) {
          completed++;
          continue;
        }

        setProgress({ 
          current: completed + 1, 
          total, 
          phase: 'viewAngle' in slotDef ? 'Turnarounds' : 'Expresiones' 
        });
        updateTask(taskId, { progress: Math.round((completed / total) * 100) });

        // Generate using edge function
        try {
          const response = await supabase.functions.invoke('generate-character', {
            body: {
              slotId: slot.id,
              characterId,
              characterName,
              characterBio,
              slotType: slotDef.type,
              viewAngle: 'viewAngle' in slotDef ? slotDef.viewAngle : 'front',
              expressionName: 'expression' in slotDef ? slotDef.expression : null,
              projectId,
            },
          });

          if (response.error) {
            console.error('Generation error:', response.error);
          }
        } catch (err) {
          console.error('Slot generation failed:', err);
        }

        completed++;
      }

      // Log telemetry
      await supabase.from('editorial_events').insert({
        project_id: projectId,
        event_type: 'character_pack_full_autogen',
        asset_type: 'character',
        payload: { characterId, characterName, slotsGenerated: completed },
      });

      completeTask(taskId, { slotsGenerated: completed });
      toast.success('¡Pack de 12 modelos creado!');
      onPackComplete?.();
    } catch (err) {
      console.error('Auto-generate error:', err);
      failTask(taskId, 'Error al generar pack');
    } finally {
      setAutoGenerating(false);
      fetchSlots();
    }
  };

  // Handle file input
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      uploadReference(file);
    }
    e.target.value = '';
  };

  // Get counts by phase
  const turnaroundCount = TURNAROUND_SLOTS.filter(s => getSlot(s.type)?.image_url).length;
  const expressionCount = EXPRESSION_SLOTS.filter(s => getSlot(s.type)?.image_url).length;
  const isComplete = completenessScore === 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const refSlot = getSlot('ref_closeup_front');

  // ASSISTED MODE: Simple guided view
  if (!isPro) {
    return (
      <div className="space-y-4">
        {/* Main card with photo and action */}
        <div className="flex gap-4 items-start">
          {/* Photo thumbnail */}
          <div 
            className={`relative w-28 h-28 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer transition-all ${
              refSlot?.image_url 
                ? 'border-2 border-green-500/50' 
                : 'border-2 border-dashed border-muted-foreground/40 hover:border-primary/60 bg-muted/30'
            }`}
            onClick={() => !refSlot?.image_url && fileInputRef.current?.click()}
          >
            {refSlot?.image_url ? (
              <img src={refSlot.image_url} alt={characterName} className="w-full h-full object-cover" />
            ) : (
              <div className="text-center p-2">
                <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Subir foto</span>
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-white" />
              </div>
            )}
            {refSlot?.image_url && (
              <div className="absolute top-1 right-1">
                <Badge variant="pass" className="text-xs px-1">
                  <Check className="w-3 h-3" />
                </Badge>
              </div>
            )}
          </div>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {/* Info and action */}
          <div className="flex-1 space-y-3">
            <div>
              <h4 className="font-medium">{characterName}</h4>
              <p className="text-xs text-muted-foreground">Pack de 12 modelos</p>
            </div>

            {/* State-based UI */}
            {!hasReference() && (
              <Button 
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                Subir foto frontal
              </Button>
            )}

            {hasReference() && !autoGenerating && completenessScore < 100 && (
              <Button 
                size="sm"
                variant="gold"
                onClick={autoGenerateFullPack}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Crear Pack Completo
              </Button>
            )}

            {autoGenerating && (
              <Badge variant="secondary" className="animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                {progress.phase} ({progress.current}/{progress.total})
              </Badge>
            )}

            {isComplete && (
              <Badge variant="pass">
                <Video className="w-3 h-3 mr-1" />
                Listo para video
              </Badge>
            )}
          </div>
        </div>

        {/* Progress section */}
        {hasReference() && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Pack de personaje</span>
              <span className="font-medium">{completenessScore}%</span>
            </div>
            <Progress value={completenessScore} className="h-2" />
            
            {/* Mini phase indicators */}
            <div className="flex gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Camera className="w-3 h-3" />
                <span>{turnaroundCount}/4</span>
              </div>
              <div className="flex items-center gap-1">
                <Palette className="w-3 h-3" />
                <span>{expressionCount}/6</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // PRO MODE: Detailed grid view
  return (
    <div className="space-y-4">
      {/* Header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isComplete ? 'pass' : 'secondary'}>
            {isComplete ? (
              <>
                <Video className="w-3 h-3 mr-1" />
                Listo
              </>
            ) : (
              `${completenessScore}%`
            )}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {slots.filter(s => s.image_url).length}/12 slots
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDetails ? 'Ocultar' : 'Ver todo'}
        </Button>
      </div>

      {/* Quick action */}
      {hasReference() && !isComplete && !autoGenerating && (
        <Button variant="gold" className="w-full" onClick={autoGenerateFullPack}>
          <Sparkles className="w-4 h-4 mr-2" />
          Completar Pack ({12 - slots.filter(s => s.image_url).length} restantes)
        </Button>
      )}

      {autoGenerating && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>{progress.phase}</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2" />
        </div>
      )}

      {/* Detailed slots grid */}
      {showDetails && (
        <div className="space-y-4">
          {/* Reference */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Upload className="w-4 h-4" /> Referencia
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {UPLOAD_SLOTS.map(slotDef => {
                const slot = getSlot(slotDef.type);
                return (
                  <div 
                    key={slotDef.type}
                    className={`aspect-square rounded-lg border overflow-hidden ${
                      slot?.image_url ? 'border-green-500/50' : 'border-dashed border-muted'
                    }`}
                    onClick={() => !slot?.image_url && fileInputRef.current?.click()}
                  >
                    {slot?.image_url ? (
                      <img src={slot.image_url} alt={slotDef.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted/30">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Turnarounds */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Camera className="w-4 h-4" /> Turnarounds ({turnaroundCount}/4)
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {TURNAROUND_SLOTS.map(slotDef => {
                const slot = getSlot(slotDef.type);
                return (
                  <div 
                    key={slotDef.type}
                    className={`aspect-square rounded-lg border overflow-hidden ${
                      slot?.image_url ? 'border-green-500/50' : 'border-dashed border-muted'
                    }`}
                  >
                    {slot?.image_url ? (
                      <img src={slot.image_url} alt={slotDef.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 text-muted-foreground p-1">
                        <Image className="w-4 h-4 mb-0.5" />
                        <span className="text-[10px] text-center">{slotDef.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Expressions */}
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4" /> Expresiones ({expressionCount}/6)
            </h4>
            <div className="grid grid-cols-6 gap-2">
              {EXPRESSION_SLOTS.map(slotDef => {
                const slot = getSlot(slotDef.type);
                return (
                  <div 
                    key={slotDef.type}
                    className={`aspect-square rounded-lg border overflow-hidden ${
                      slot?.image_url ? 'border-green-500/50' : 'border-dashed border-muted'
                    }`}
                  >
                    {slot?.image_url ? (
                      <img src={slot.image_url} alt={slotDef.label} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 text-muted-foreground p-0.5">
                        <span className="text-[8px] text-center">{slotDef.label}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
