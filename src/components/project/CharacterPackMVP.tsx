/**
 * CharacterPackMVP - Iceberg Architecture UI
 * Shows 4 MVP slots: hero_front, profile_left, back, expression_neutral
 * Adapts display based on creative mode (ASSISTED/PRO)
 */

import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

// MVP slot types in order
const MVP_SLOTS = ['hero_front', 'profile_left', 'back', 'expression_neutral'] as const;
type MVPSlotType = typeof MVP_SLOTS[number];

const SLOT_LABELS: Record<MVPSlotType, string> = {
  hero_front: 'Frontal (Hero)',
  profile_left: 'Perfil',
  back: 'Espalda',
  expression_neutral: 'Expresión neutral',
};

const SLOT_DESCRIPTIONS: Record<MVPSlotType, string> = {
  hero_front: 'Imagen principal del personaje',
  profile_left: 'Vista lateral izquierda',
  back: 'Vista posterior',
  expression_neutral: 'Expresión facial neutra',
};

interface PackSlot {
  id: string;
  slot_type: MVPSlotType;
  status: 'empty' | 'generating' | 'generated' | 'accepted';
  image_url: string | null;
  current_run_id: string | null;
  accepted_run_id: string | null;
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
  const [generatingSlot, setGeneratingSlot] = useState<string | null>(null);
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [completenessScore, setCompletenessScore] = useState(0);
  const [isReadyForVideo, setIsReadyForVideo] = useState(false);

  // Fetch or initialize slots
  const fetchSlots = useCallback(async () => {
    const { data: existing } = await supabase
      .from('character_pack_slots')
      .select('id, slot_type, status, image_url, current_run_id, accepted_run_id')
      .eq('character_id', characterId)
      .in('slot_type', MVP_SLOTS);

    // Create missing slots
    const existingTypes = new Set(existing?.map(s => s.slot_type) || []);
    const missingSlots = MVP_SLOTS.filter(t => !existingTypes.has(t));

    if (missingSlots.length > 0) {
      const toInsert = missingSlots.map(slot_type => ({
        character_id: characterId,
        slot_type,
        status: 'empty',
        required: true,
      }));
      
      await supabase.from('character_pack_slots').insert(toInsert);
      
      // Refetch
      const { data: updated } = await supabase
        .from('character_pack_slots')
        .select('id, slot_type, status, image_url, current_run_id, accepted_run_id')
        .eq('character_id', characterId)
        .in('slot_type', MVP_SLOTS);
      
      setSlots((updated || []) as PackSlot[]);
    } else {
      setSlots((existing || []) as PackSlot[]);
    }

    // Fetch character pack state
    const { data: char } = await supabase
      .from('characters')
      .select('pack_completeness_score, is_ready_for_video')
      .eq('id', characterId)
      .single();

    if (char) {
      setCompletenessScore(char.pack_completeness_score || 0);
      setIsReadyForVideo(char.is_ready_for_video || false);
    }

    setLoading(false);
  }, [characterId]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Generate a single slot
  const generateSlot = async (slotType: MVPSlotType) => {
    const slot = slots.find(s => s.slot_type === slotType);
    if (!slot) return;

    setGeneratingSlot(slot.id);
    
    try {
      // Update slot to generating
      await supabase
        .from('character_pack_slots')
        .update({ status: 'generating' })
        .eq('id', slot.id);

      // Build prompt
      const prompt = [characterName, characterBio || ''].filter(Boolean).join('. ');

      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: {
          projectId,
          type: 'character',
          phase: 'exploration',
          engine: 'fal-ai/nano-banana-pro',
          engineSelectedBy: 'auto',
          prompt,
          context: `Character: ${characterName}, Slot: ${SLOT_LABELS[slotType]}`,
          params: {
            characterId,
            characterName,
            slotId: slot.id,
            slotType,
            viewAngle: slotType === 'profile_left' ? 'side' : slotType === 'back' ? 'back' : 'front',
            expressionName: slotType === 'expression_neutral' ? 'neutral' : undefined,
            allowTextToImage: true,
          },
        },
      });

      if (error) throw error;

      // Update slot with result
      await supabase
        .from('character_pack_slots')
        .update({
          status: 'generated',
          image_url: data?.outputUrl || null,
          current_run_id: data?.runId || null,
        })
        .eq('id', slot.id);

      toast.success(`${SLOT_LABELS[slotType]} generado`);
      fetchSlots();
    } catch (err) {
      console.error('Generation error:', err);
      await supabase
        .from('character_pack_slots')
        .update({ status: 'empty' })
        .eq('id', slot.id);
      toast.error('Error al generar');
    } finally {
      setGeneratingSlot(null);
    }
  };

  // Accept a slot
  const acceptSlot = async (slotType: MVPSlotType) => {
    const slot = slots.find(s => s.slot_type === slotType);
    if (!slot || !slot.current_run_id) return;

    try {
      await supabase
        .from('character_pack_slots')
        .update({
          status: 'accepted',
          accepted_run_id: slot.current_run_id,
        })
        .eq('id', slot.id);

      await supabase
        .from('generation_runs')
        .update({ verdict: 'approved' })
        .eq('id', slot.current_run_id);

      toast.success(`${SLOT_LABELS[slotType]} aceptado`);
      
      // For ASSISTED mode: auto-generate remaining slots after hero_front is accepted
      if (!isPro && slotType === 'hero_front') {
        autoGenerateRemainingSlots();
      }
      
      fetchSlots();
    } catch (err) {
      toast.error('Error al aceptar');
    }
  };

  // Auto-generate remaining slots (ASSISTED mode)
  const autoGenerateRemainingSlots = async () => {
    const remainingSlots = MVP_SLOTS.filter(t => t !== 'hero_front');
    setAutoGenerating(true);

    // Create background task
    const taskId = addTask({
      title: `Preparando ${characterName} para video`,
      description: 'Generando vistas adicionales del personaje',
      type: 'character_generation',
      projectId,
      entityId: characterId,
    });

    let completed = 0;
    const total = remainingSlots.length;

    try {
      for (const slotType of remainingSlots) {
        updateTask(taskId, { progress: Math.round((completed / total) * 100) });
        
        const slot = slots.find(s => s.slot_type === slotType);
        if (!slot || slot.status === 'accepted') {
          completed++;
          continue;
        }

        // Generate
        await generateSlot(slotType);
        
        // Refetch to get the updated slot
        const { data: updatedSlot } = await supabase
          .from('character_pack_slots')
          .select('id, current_run_id')
          .eq('character_id', characterId)
          .eq('slot_type', slotType)
          .single();

        // Auto-accept in ASSISTED mode
        if (updatedSlot?.current_run_id) {
          await supabase
            .from('character_pack_slots')
            .update({
              status: 'accepted',
              accepted_run_id: updatedSlot.current_run_id,
            })
            .eq('id', updatedSlot.id);

          await supabase
            .from('generation_runs')
            .update({ verdict: 'approved' })
            .eq('id', updatedSlot.current_run_id);
        }

        completed++;
      }

      // Log telemetry
      await supabase.from('editorial_events').insert({
        project_id: projectId,
        event_type: 'character_pack_autogen_completed',
        asset_type: 'character',
        payload: { characterId, characterName, slotsGenerated: completed },
      });

      completeTask(taskId, { slotsGenerated: completed });
      toast.success('Personaje listo para video');
      onPackComplete?.();
    } catch (err) {
      console.error('Auto-generate error:', err);
      failTask(taskId, 'Error al generar pack automáticamente');
    } finally {
      setAutoGenerating(false);
      fetchSlots();
    }
  };

  // Get slot by type
  const getSlot = (type: MVPSlotType): PackSlot | undefined => slots.find(s => s.slot_type === type);

  // Get accepted count
  const acceptedCount = slots.filter(s => s.status === 'accepted').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const heroSlot = getSlot('hero_front');

  // ASSISTED MODE: Simple progress view
  if (!isPro) {
    return (
      <div className="space-y-4">
        {/* Hero image and action */}
        <div className="flex gap-4 items-start">
          <div className="relative w-32 h-32 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {heroSlot?.image_url ? (
              <img src={heroSlot.image_url} alt={characterName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-8 h-8 text-muted-foreground" />
            )}
            {generatingSlot === heroSlot?.id && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <h4 className="font-medium">{characterName}</h4>
            
            {heroSlot?.status === 'empty' && (
              <Button 
                size="sm" 
                onClick={() => generateSlot('hero_front')}
                disabled={!!generatingSlot}
              >
                {generatingSlot ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Image className="w-4 h-4 mr-2" />}
                Generar imagen
              </Button>
            )}
            
            {heroSlot?.status === 'generated' && (
              <Button 
                size="sm" 
                variant="gold"
                onClick={() => acceptSlot('hero_front')}
              >
                <Check className="w-4 h-4 mr-2" />
                Aceptar
              </Button>
            )}
            
            {heroSlot?.status === 'accepted' && !autoGenerating && acceptedCount < 4 && (
              <Badge variant="secondary" className="animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                Preparando para video...
              </Badge>
            )}
          </div>
        </div>

        {/* Progress bar for pack completion */}
        {heroSlot?.status === 'accepted' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Preparación del personaje</span>
              <span className="font-medium">{completenessScore}%</span>
            </div>
            <Progress value={completenessScore} className="h-2" />
            
            {isReadyForVideo && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Video className="w-4 h-4" />
                <span>Listo para video</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // PRO MODE: Full grid with all slots
  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={isReadyForVideo ? 'pass' : 'secondary'}>
            {isReadyForVideo ? (
              <>
                <Video className="w-3 h-3 mr-1" />
                Listo para video
              </>
            ) : (
              `Pack: ${completenessScore}%`
            )}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {acceptedCount}/4 slots aceptados
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showDetails ? 'Ocultar' : 'Ver slots'}
        </Button>
      </div>

      {/* Slots grid */}
      {showDetails && (
        <div className="grid grid-cols-2 gap-3">
          {MVP_SLOTS.map(slotType => {
            const slot = getSlot(slotType);
            const isGenerating = generatingSlot === slot?.id;
            
            return (
              <Card key={slotType} className="overflow-hidden">
                <CardContent className="p-3 space-y-2">
                  {/* Thumbnail */}
                  <div className="relative aspect-square bg-muted rounded overflow-hidden flex items-center justify-center">
                    {slot?.image_url ? (
                      <img src={slot.image_url} alt={SLOT_LABELS[slotType]} className="w-full h-full object-cover" />
                    ) : (
                      <Image className="w-6 h-6 text-muted-foreground" />
                    )}
                    {isGenerating && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-white" />
                      </div>
                    )}
                    {slot?.status === 'accepted' && (
                      <div className="absolute top-1 right-1">
                        <Badge variant="pass" className="text-xs px-1">
                          <Check className="w-3 h-3" />
                        </Badge>
                      </div>
                    )}
                  </div>

                  {/* Label and status */}
                  <div>
                    <p className="text-sm font-medium truncate">{SLOT_LABELS[slotType]}</p>
                    <p className="text-xs text-muted-foreground truncate">{SLOT_DESCRIPTIONS[slotType]}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {slot?.status === 'empty' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => generateSlot(slotType)}
                        disabled={!!generatingSlot}
                      >
                        Generar
                      </Button>
                    )}
                    
                    {slot?.status === 'generated' && (
                      <>
                        <Button 
                          size="sm" 
                          variant="gold"
                          className="flex-1"
                          onClick={() => acceptSlot(slotType)}
                        >
                          Aceptar
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => generateSlot(slotType)}
                          disabled={!!generatingSlot}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                    
                    {slot?.status === 'accepted' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="flex-1"
                        onClick={() => generateSlot(slotType)}
                        disabled={!!generatingSlot}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Regenerar
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
