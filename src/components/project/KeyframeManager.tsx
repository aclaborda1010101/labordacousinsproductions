import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  Wand2, 
  Plus, 
  Trash2, 
  Upload, 
  Image as ImageIcon,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Lock,
  Unlock,
  CheckCircle2
} from 'lucide-react';

interface Keyframe {
  id: string;
  shot_id: string;
  image_url: string | null;
  prompt_text: string | null;
  timestamp_sec: number;
  frame_type: 'initial' | 'intermediate' | 'final';
  frame_geometry: unknown;
  staging_snapshot: unknown;
  approved: boolean;
  locks: unknown;
}

interface Character {
  id: string;
  name: string;
  token?: string;
  turnaround_urls?: string[];
}

interface Location {
  id: string;
  name: string;
  token?: string;
  reference_urls?: string[];
}

interface ShotDetails {
  focalMm?: number;
  cameraHeight?: string;
  lightingStyle?: string;
  viewerNotice?: string;
  aiRisk?: string;
  intention?: string;
  dialogueText?: string;
  effectiveMode?: 'CINE' | 'ULTRA';
}

interface KeyframeManagerProps {
  shotId: string;
  duration: number;
  sceneDescription: string;
  shotType: string;
  cameraMovement?: string;
  blocking?: string;
  characters: Character[];
  location?: Location;
  shotDetails?: ShotDetails;
  stylePack?: {
    description?: string;
    colorPalette?: string[];
    lightingRules?: string[];
    aspectRatio?: string;
  };
  onKeyframesChange?: (keyframes: Keyframe[]) => void;
}

export default function KeyframeManager({
  shotId,
  duration,
  sceneDescription,
  shotType,
  cameraMovement,
  blocking,
  characters,
  location,
  shotDetails,
  stylePack,
  onKeyframesChange
}: KeyframeManagerProps) {
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // keyframe ID or 'new'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);

  // Calculate required keyframe slots based on duration
  const getRequiredSlots = useCallback(() => {
    const slots: Array<{ timestampSec: number; frameType: 'initial' | 'intermediate' | 'final' }> = [];
    
    // Initial frame (0s)
    slots.push({ timestampSec: 0, frameType: 'initial' });
    
    // Intermediate frames every 2 seconds (or adjust based on duration)
    const intervalSec = duration <= 4 ? 2 : duration <= 8 ? 2 : 3;
    for (let t = intervalSec; t < duration; t += intervalSec) {
      slots.push({ timestampSec: t, frameType: 'intermediate' });
    }
    
    // Final frame
    if (duration > 1) {
      slots.push({ timestampSec: duration, frameType: 'final' });
    }
    
    return slots;
  }, [duration]);

  // Load existing keyframes
  useEffect(() => {
    const loadKeyframes = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('keyframes')
          .select('*')
          .eq('shot_id', shotId)
          .order('timestamp_sec', { ascending: true });

        if (error) throw error;
        
        // Cast data to correct type
        const typedKeyframes = (data || []) as unknown as Array<{
          id: string;
          shot_id: string;
          image_url: string | null;
          prompt_text: string | null;
          timestamp_sec: number;
          frame_type: 'initial' | 'intermediate' | 'final';
          frame_geometry: unknown;
          staging_snapshot: unknown;
          approved: boolean;
          locks: unknown;
        }>;
        
        setKeyframes(typedKeyframes);
        onKeyframesChange?.(typedKeyframes);
      } catch (error) {
        console.error('Error loading keyframes:', error);
        toast.error('Error al cargar keyframes');
      } finally {
        setLoading(false);
      }
    };

    if (shotId) {
      loadKeyframes();
    }
  }, [shotId, onKeyframesChange]);

  // Playback animation
  useEffect(() => {
    if (!isPlaying || keyframes.length < 2) return;

    const interval = setInterval(() => {
      setSelectedIndex(prev => (prev + 1) % keyframes.length);
    }, 1000); // 1 second per frame

    return () => clearInterval(interval);
  }, [isPlaying, keyframes.length]);

  // Generate a keyframe for a specific slot
  const generateKeyframe = async (slotIndex: number) => {
    const slots = getRequiredSlots();
    const slot = slots[slotIndex];
    if (!slot) return;

    setGenerating(`slot-${slotIndex}`);
    try {
      // Find previous keyframe for continuity
      const previousKeyframe = keyframes
        .filter(kf => kf.timestamp_sec < slot.timestampSec && kf.image_url)
        .sort((a, b) => b.timestamp_sec - a.timestamp_sec)[0];

      const response = await supabase.functions.invoke('generate-keyframe', {
        body: {
          shotId,
          sceneDescription,
          shotType,
          duration,
          frameType: slot.frameType,
          timestampSec: slot.timestampSec,
          characters: characters.map(c => ({
            id: c.id,
            name: c.name,
            token: c.token,
            referenceUrl: c.turnaround_urls?.[0]
          })),
          location: location ? {
            id: location.id,
            name: location.name,
            token: location.token,
            referenceUrl: location.reference_urls?.[0]
          } : undefined,
          cameraMovement,
          blocking,
          // NEW: Pass all shot details for coherent generation
          shotDetails: {
            focalMm: shotDetails?.focalMm,
            cameraHeight: shotDetails?.cameraHeight,
            lightingStyle: shotDetails?.lightingStyle,
            viewerNotice: shotDetails?.viewerNotice,
            aiRisk: shotDetails?.aiRisk,
            intention: shotDetails?.intention,
            dialogueText: shotDetails?.dialogueText,
            effectiveMode: shotDetails?.effectiveMode
          },
          previousKeyframeUrl: previousKeyframe?.image_url,
          // NEW: Pass previous keyframe data for continuity
          previousKeyframeData: previousKeyframe ? {
            promptText: previousKeyframe.prompt_text,
            frameGeometry: previousKeyframe.frame_geometry,
            stagingSnapshot: previousKeyframe.staging_snapshot
          } : undefined,
          stylePack
        }
      });

      if (response.error) throw response.error;

      if (response.data?.success) {
        // Refresh keyframes
        const { data: updated } = await supabase
          .from('keyframes')
          .select('*')
          .eq('shot_id', shotId)
          .order('timestamp_sec', { ascending: true });

        const typedKeyframes = (updated || []) as unknown as Keyframe[];

        setKeyframes(typedKeyframes);
        onKeyframesChange?.(typedKeyframes);
        toast.success(`Keyframe ${slot.frameType} generado`);
      } else {
        throw new Error(response.data?.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Error generating keyframe:', error);
      toast.error('Error al generar keyframe');
    } finally {
      setGenerating(null);
    }
  };

  // Generate all missing keyframes
  const generateAllMissing = async () => {
    const slots = getRequiredSlots();
    setGenerating('all');
    
    try {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const existing = keyframes.find(
          kf => Math.abs(kf.timestamp_sec - slot.timestampSec) < 0.5
        );
        
        if (!existing?.image_url) {
          await generateKeyframe(i);
          // Small delay between generations
          await new Promise(r => setTimeout(r, 500));
        }
      }
      toast.success('Todos los keyframes generados');
    } catch (error) {
      console.error('Error generating all keyframes:', error);
    } finally {
      setGenerating(null);
    }
  };

  // Upload a keyframe image manually
  const handleUpload = async (slotIndex: number, file: File) => {
    const slots = getRequiredSlots();
    const slot = slots[slotIndex];
    if (!slot) return;

    setUploadingSlot(slotIndex);
    try {
      const fileName = `keyframes/${shotId}/${slot.frameType}_${slot.timestampSec}s_${Date.now()}.${file.name.split('.').pop()}`;
      
      const { data, error } = await supabase.storage
        .from('renders')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('renders')
        .getPublicUrl(data.path);

      // Check if keyframe exists for this slot
      const existing = keyframes.find(
        kf => Math.abs(kf.timestamp_sec - slot.timestampSec) < 0.5
      );

      if (existing) {
        // Update existing
        await supabase
          .from('keyframes')
          .update({ image_url: urlData.publicUrl })
          .eq('id', existing.id);
      } else {
        // Create new
        await supabase
          .from('keyframes')
          .insert({
            shot_id: shotId,
            image_url: urlData.publicUrl,
            timestamp_sec: slot.timestampSec,
            frame_type: slot.frameType
          });
      }

      // Refresh keyframes
      const { data: updated } = await supabase
        .from('keyframes')
        .select('*')
        .eq('shot_id', shotId)
        .order('timestamp_sec', { ascending: true });

      const typedKeyframes = (updated || []) as unknown as Keyframe[];

      setKeyframes(typedKeyframes);
      onKeyframesChange?.(typedKeyframes);
      toast.success('Imagen subida');
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Error al subir imagen');
    } finally {
      setUploadingSlot(null);
    }
  };

  // Delete a keyframe
  const deleteKeyframe = async (keyframeId: string) => {
    try {
      const { error } = await supabase
        .from('keyframes')
        .delete()
        .eq('id', keyframeId);

      if (error) throw error;

      setKeyframes(prev => prev.filter(kf => kf.id !== keyframeId));
      toast.success('Keyframe eliminado');
    } catch (error) {
      console.error('Error deleting keyframe:', error);
      toast.error('Error al eliminar');
    }
  };

  // Approve/lock a keyframe
  const toggleApproval = async (keyframeId: string, currentApproved: boolean) => {
    try {
      const { error } = await supabase
        .from('keyframes')
        .update({ approved: !currentApproved })
        .eq('id', keyframeId);

      if (error) throw error;

      setKeyframes(prev => prev.map(kf => 
        kf.id === keyframeId ? { ...kf, approved: !currentApproved } : kf
      ));
      
      toast.success(currentApproved ? 'Keyframe desbloqueado' : 'Keyframe aprobado');
    } catch (error) {
      console.error('Error toggling approval:', error);
      toast.error('Error al cambiar estado');
    }
  };

  const slots = getRequiredSlots();
  const completedCount = slots.filter(slot => 
    keyframes.find(kf => Math.abs(kf.timestamp_sec - slot.timestampSec) < 0.5 && kf.image_url)
  ).length;
  const completionPercent = (completedCount / slots.length) * 100;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with progress */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            <span className="font-medium">Keyframes</span>
            <Badge variant="outline" className="text-xs">
              {completedCount}/{slots.length}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {duration}s de duración • {slots.length} frames requeridos
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={generateAllMissing}
          disabled={generating !== null || completedCount === slots.length}
        >
          {generating === 'all' ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Wand2 className="w-4 h-4 mr-2" />
          )}
          Generar Todos
        </Button>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={completionPercent} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{Math.round(completionPercent)}% completado</span>
          <span>nano-banana-pro (Gemini 3 Pro)</span>
        </div>
      </div>

      {/* Keyframe slots grid */}
      <ScrollArea className="h-[280px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 pr-4">
          {slots.map((slot, index) => {
            const keyframe = keyframes.find(
              kf => Math.abs(kf.timestamp_sec - slot.timestampSec) < 0.5
            );
            const isGenerating = generating === `slot-${index}` || generating === 'all';
            const isUploading = uploadingSlot === index;

            return (
              <div
                key={`${slot.frameType}-${slot.timestampSec}`}
                className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all cursor-pointer ${
                  selectedIndex === index ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'
                } ${keyframe?.approved ? 'ring-2 ring-green-500/30' : ''}`}
                onClick={() => setSelectedIndex(index)}
              >
                {/* Background image or placeholder */}
                {keyframe?.image_url ? (
                  <img
                    src={keyframe.image_url}
                    alt={`Keyframe ${slot.frameType}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-muted/50 flex items-center justify-center">
                    {isGenerating || isUploading ? (
                      <Loader2 className="w-6 h-6 animate-spin text-primary" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
                    )}
                  </div>
                )}

                {/* Frame type badge */}
                <div className="absolute top-1 left-1">
                  <Badge 
                    variant={
                      slot.frameType === 'initial' ? 'default' : 
                      slot.frameType === 'final' ? 'secondary' : 'outline'
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {slot.frameType === 'initial' ? 'Inicio' : 
                     slot.frameType === 'final' ? 'Final' : `${slot.timestampSec}s`}
                  </Badge>
                </div>

                {/* Approved badge */}
                {keyframe?.approved && (
                  <div className="absolute top-1 right-1">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                )}

                {/* Actions overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  {/* Generate button */}
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      generateKeyframe(index);
                    }}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : keyframe?.image_url ? (
                      <RefreshCw className="w-3.5 h-3.5" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5" />
                    )}
                  </Button>

                  {/* Upload button */}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(index, file);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      asChild
                    >
                      <span>
                        {isUploading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </Button>
                  </label>

                  {/* Approve/Lock button */}
                  {keyframe && (
                    <Button
                      size="icon"
                      variant={keyframe.approved ? "default" : "secondary"}
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleApproval(keyframe.id, keyframe.approved);
                      }}
                    >
                      {keyframe.approved ? (
                        <Lock className="w-3.5 h-3.5" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}

                  {/* Delete button */}
                  {keyframe && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteKeyframe(keyframe.id);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Playback controls */}
      {keyframes.filter(kf => kf.image_url).length >= 2 && (
        <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setSelectedIndex(Math.max(0, selectedIndex - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          
          <Button
            size="icon"
            variant={isPlaying ? "secondary" : "ghost"}
            className="h-8 w-8"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setSelectedIndex(Math.min(keyframes.length - 1, selectedIndex + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <Slider
            value={[selectedIndex]}
            max={Math.max(0, keyframes.length - 1)}
            step={1}
            className="flex-1"
            onValueChange={([v]) => setSelectedIndex(v)}
          />

          <span className="text-xs text-muted-foreground min-w-[60px] text-right">
            {keyframes[selectedIndex]?.timestamp_sec || 0}s / {duration}s
          </span>
        </div>
      )}

      {/* Selected keyframe details */}
      {keyframes[selectedIndex] && (
        <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Prompt:</span>
            <Badge variant="outline" className="text-[10px]">
              {keyframes[selectedIndex].frame_type}
            </Badge>
          </div>
          <p className="text-muted-foreground line-clamp-2">
            {keyframes[selectedIndex].prompt_text || 'Sin prompt generado'}
          </p>
        </div>
      )}
    </div>
  );
}
