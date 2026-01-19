import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { generateRun, updateRunStatus, GenerateRunPayload } from '@/lib/generateRun';
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
  CheckCircle2,
  Check,
  RotateCcw,
  Star,
  TrendingUp,
  Layers,
  ExternalLink,
  ZoomIn
} from 'lucide-react';
import SetCanonModal from './SetCanonModal';
import SceneCoverageGenerator from './SceneCoverageGenerator';
import { EditorialAssistantPanel } from '@/components/editorial/EditorialAssistantPanel';
import { useRecommendations } from '@/hooks/useRecommendations';
import { ProjectRecommendationsBar } from './ProjectRecommendationsBar';
import { ENGINES } from '@/lib/recommendations';
import { DeveloperDebugPanel, DebugPanelData } from '@/components/developer/DeveloperDebugPanel';
import { useDeveloperMode } from '@/contexts/DeveloperModeContext';

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
  run_id?: string | null; // Links to generation_runs for telemetry
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
  sceneId?: string;
  sceneSlugline?: string;
  sceneType?: string;
  projectStyle?: { visualStyle?: string; animationType?: string };
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
  sceneId,
  sceneSlugline,
  sceneType,
  projectStyle,
  onKeyframesChange
}: KeyframeManagerProps) {
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null); // keyframe ID or 'new'
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [canonModal, setCanonModal] = useState<{ open: boolean; keyframe: Keyframe | null }>({ open: false, keyframe: null });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [promptPatch, setPromptPatch] = useState<string | null>(null);
  const [debugPrompt, setDebugPrompt] = useState<string>('');
  const [debugNegativePrompt, setDebugNegativePrompt] = useState<string>('');
  const [lastRawResponse, setLastRawResponse] = useState<unknown>(null);
  const [showCoverageGenerator, setShowCoverageGenerator] = useState(false);
  const { isDeveloperMode } = useDeveloperMode();
  
  // Lightbox state for full-size keyframe viewing
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    frameType: string;
    timestampSec: number;
    approved: boolean;
    slotIndex: number;
  } | null>(null);

  const KEYFRAME_PRESETS = ['initial', 'intermediate', 'final'];
  
  // Recommendations v1 - only enable when projectId is available
  const { 
    recommendation, 
    orderedPresets,
    loading: recsLoading, 
    checkOverride, 
    logShown, 
    logOverride,
    logFollowed,
    refresh: refreshRecs
  } = useRecommendations({ 
    projectId: projectId || '', 
    assetType: 'keyframe',
    availablePresets: KEYFRAME_PRESETS,
    phase: 'exploration',
    enabled: !!projectId 
  });

  // Log recommendation shown
  useEffect(() => {
    if (recommendation && !recsLoading && projectId) {
      logShown();
    }
  }, [recommendation, recsLoading, projectId, logShown]);

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

  // Build generation payload for a slot
  const buildGenerationPayload = useCallback((slotIndex: number, projectId: string, parentRunId?: string): GenerateRunPayload | null => {
    const slots = getRequiredSlots();
    const slot = slots[slotIndex];
    if (!slot) return null;

    // Find previous keyframe for continuity
    const previousKeyframe = keyframes
      .filter(kf => kf.timestamp_sec < slot.timestampSec && kf.image_url)
      .sort((a, b) => b.timestamp_sec - a.timestamp_sec)[0];

    return {
      projectId,
      type: 'keyframe',
      phase: 'exploration', // MVP default
      engine: 'nano-banana',
      engineSelectedBy: 'auto',
      engineReason: 'Default keyframe engine',
      prompt: sceneDescription,
      context: `${shotType} shot, ${slot.frameType} frame at ${slot.timestampSec}s`,
      parentRunId, // For regeneration chains
      params: {
        shotId,
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
        previousKeyframeData: previousKeyframe ? {
          promptText: previousKeyframe.prompt_text,
          frameGeometry: previousKeyframe.frame_geometry,
          stagingSnapshot: previousKeyframe.staging_snapshot
        } : undefined,
        stylePack
      }
    };
  }, [getRequiredSlots, keyframes, sceneDescription, shotType, shotId, duration, characters, location, cameraMovement, blocking, shotDetails, stylePack]);

  // Generate a keyframe for a specific slot (or regenerate with parentRunId)
  const generateKeyframe = async (slotIndex: number, parentRunId?: string) => {
    const slots = getRequiredSlots();
    const slot = slots[slotIndex];
    if (!slot) return;

    setGenerating(`slot-${slotIndex}`);
    try {
      // Get project_id from scene (use sceneId prop if available, otherwise fetch from shot)
      let fetchedProjectId: string | null = null;
      
      if (sceneId) {
        // Directly query the scene for project_id
        const { data: sceneData } = await supabase
          .from('scenes')
          .select('project_id')
          .eq('id', sceneId)
          .single();
        fetchedProjectId = sceneData?.project_id || null;
      }
      
      // Fallback: try to get from shot -> scene relationship
      if (!fetchedProjectId) {
        const { data: shotData } = await supabase
          .from('shots')
          .select('scene_id')
          .eq('id', shotId)
          .single();
        
        if (shotData?.scene_id) {
          const { data: sceneData } = await supabase
            .from('scenes')
            .select('project_id')
            .eq('id', shotData.scene_id)
            .single();
          fetchedProjectId = sceneData?.project_id || null;
        }
      }
      
      if (!fetchedProjectId) {
        throw new Error('No se pudo obtener el project_id. Verifica que el shot esté asociado a una escena válida.');
      }
      setProjectId(fetchedProjectId); // Store for canon modal

      const payload = buildGenerationPayload(slotIndex, fetchedProjectId, parentRunId);
      if (!payload) throw new Error('Invalid slot');

      // Check if user is overriding recommendation
      const currentPreset = slot.frameType;
      const isUserOverride = checkOverride('nano-banana', currentPreset);
      if (isUserOverride) {
        logOverride('nano-banana', currentPreset);
      }

      // Add userOverride to payload
      (payload as any).userOverride = isUserOverride;
      (payload as any).presetId = currentPreset;

      // Use unified generateRun gateway
      const result = await generateRun(payload);
      setLastRawResponse(result);

      if (!result.ok) {
        throw new Error(result.error || 'Generation failed');
      }

      // Show auto-retry feedback
      if (result.autoRetried) {
        toast.info('He reintentado automáticamente 1 vez por un error técnico. Si persiste, cambia preset o engine.');
      }

      // Update keyframe with runId for telemetry tracking
      const existing = keyframes.find(
        kf => Math.abs(kf.timestamp_sec - slot.timestampSec) < 0.5
      );

      if (existing && result.runId) {
        await supabase
          .from('keyframes')
          .update({ 
            image_url: result.outputUrl,
            run_id: result.runId 
          })
          .eq('id', existing.id);
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
      refreshRecs(); // Refresh recommendations
      toast.success(`Keyframe ${slot.frameType} generado (runId: ${result.runId?.slice(0, 8)})`);
    } catch (error) {
      console.error('Error generating keyframe:', error);
      toast.error('Error al generar keyframe');
    } finally {
      setGenerating(null);
    }
  };

  // Accept a keyframe - updates generation_runs.status to 'accepted'
  const acceptKeyframe = async (keyframe: Keyframe) => {
    if (!keyframe.run_id) {
      toast.error('Este keyframe no tiene runId asociado');
      return;
    }

    try {
      const success = await updateRunStatus(keyframe.run_id, 'accepted');
      if (success) {
        // Also mark as approved in keyframes table
        await supabase
          .from('keyframes')
          .update({ approved: true })
          .eq('id', keyframe.id);

        setKeyframes(prev => prev.map(kf =>
          kf.id === keyframe.id ? { ...kf, approved: true } : kf
        ));
        toast.success('Keyframe aceptado ✓');
      } else {
        throw new Error('Failed to update run status');
      }
    } catch (error) {
      console.error('Error accepting keyframe:', error);
      toast.error('Error al aceptar keyframe');
    }
  };

  // Regenerate a keyframe - creates NEW run with parent_run_id
  const regenerateKeyframe = async (slotIndex: number, keyframe: Keyframe) => {
    // Pass the current runId as parentRunId to create chain
    await generateKeyframe(slotIndex, keyframe.run_id || undefined);
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

  // Navigate lightbox between keyframes
  const navigateLightbox = (direction: -1 | 1) => {
    if (!lightboxImage) return;
    
    let newIdx = lightboxImage.slotIndex + direction;
    
    // Find next slot with an image
    while (newIdx >= 0 && newIdx < slots.length) {
      const slot = slots[newIdx];
      const kf = keyframes.find(k => Math.abs(k.timestamp_sec - slot.timestampSec) < 0.5);
      
      if (kf?.image_url) {
        setLightboxImage({
          url: kf.image_url,
          frameType: slot.frameType,
          timestampSec: slot.timestampSec,
          approved: kf.approved,
          slotIndex: newIdx,
        });
        setSelectedIndex(newIdx);
        return;
      }
      newIdx += direction;
    }
  };

  // Open lightbox for a keyframe
  const openLightbox = (keyframe: Keyframe, slot: { frameType: string; timestampSec: number }, slotIndex: number) => {
    if (!keyframe.image_url) return;
    setLightboxImage({
      url: keyframe.image_url,
      frameType: slot.frameType,
      timestampSec: slot.timestampSec,
      approved: keyframe.approved,
      slotIndex,
    });
    setLightboxOpen(true);
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
      {/* Style Lock Badge */}
      <div className="flex items-center gap-2 p-2 bg-purple-500/10 border border-purple-500/20 rounded-lg">
        <Lock className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-purple-300">ESTILO: Disney/Pixar 3D</span>
        <Badge variant="outline" className="text-xs border-purple-500/30 text-purple-400">LOCKED</Badge>
        <span className="text-xs text-muted-foreground ml-auto">Keyframes siempre en estilo animado</span>
      </div>

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
        <div className="flex items-center gap-2">
          {/* Coverage Generator Button - only show when there's an approved keyframe */}
          {keyframes.some(kf => kf.approved && kf.image_url) && sceneId && projectId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCoverageGenerator(true)}
              className="text-primary border-primary/50 hover:bg-primary/10"
            >
              <Layers className="w-4 h-4 mr-2" />
              Cobertura IA
            </Button>
          )}
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
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={completionPercent} className="h-2" />
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>{Math.round(completionPercent)}% completado</span>
          <div className="flex items-center gap-2">
            {recommendation && recommendation.confidence !== 'low' && (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30 gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Rec: {recommendation.recommendedPreset}
              </Badge>
            )}
            <span>nano-banana-pro (Gemini 3 Pro)</span>
          </div>
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
                    className="w-full h-full object-cover cursor-zoom-in"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      openLightbox(keyframe, slot, index);
                    }}
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
                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-1 flex-wrap p-1">
                  {/* Zoom / Lightbox button - only for images */}
                  {keyframe?.image_url && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      title="Ver en grande"
                      onClick={(e) => {
                        e.stopPropagation();
                        openLightbox(keyframe, slot, index);
                      }}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {/* Generate / Regenerate button */}
                  {keyframe?.image_url && keyframe?.run_id ? (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      title="Regenerar (crea nuevo run)"
                      onClick={(e) => {
                        e.stopPropagation();
                        regenerateKeyframe(index, keyframe);
                      }}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7"
                      title="Generar keyframe"
                      onClick={(e) => {
                        e.stopPropagation();
                        generateKeyframe(index);
                      }}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}

                  {/* Accept button - only for keyframes with runId that aren't approved */}
                  {keyframe?.image_url && keyframe?.run_id && !keyframe.approved && (
                    <Button
                      size="icon"
                      variant="default"
                      className="h-7 w-7 bg-green-600 hover:bg-green-700"
                      title="Aceptar (actualiza generation_runs.status)"
                      onClick={(e) => {
                        e.stopPropagation();
                        acceptKeyframe(keyframe);
                      }}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  )}

                  {/* Set as Canon button - only for approved keyframes with runId */}
                  {keyframe?.approved && keyframe?.run_id && keyframe?.image_url && (
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-7 w-7 bg-yellow-500/90 hover:bg-yellow-500 text-black"
                      title="Establecer como Aprobado ⭐"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCanonModal({ open: true, keyframe });
                      }}
                    >
                      <Star className="w-3.5 h-3.5" />
                    </Button>
                  )}

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
                      title="Subir imagen"
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

                  {/* Lock/Unlock button (for manually uploaded or legacy keyframes) */}
                  {keyframe && !keyframe.run_id && (
                    <Button
                      size="icon"
                      variant={keyframe.approved ? "default" : "secondary"}
                      className="h-7 w-7"
                      title={keyframe.approved ? "Desbloquear" : "Bloquear"}
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
                      title="Eliminar"
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

      {/* Editorial Assistant Panel */}
      {projectId && keyframes[selectedIndex] && (
        <EditorialAssistantPanel
          projectId={projectId}
          assetType="keyframe"
          currentRunId={keyframes[selectedIndex]?.run_id || undefined}
          phase="exploration"
          presetId={slots[selectedIndex]?.frameType}
          onApplyPromptPatch={(patch) => {
            setPromptPatch(patch);
            toast.success('Patch de canon aplicado');
          }}
          onOpenCanonModal={() => {
            const kf = keyframes[selectedIndex];
            if (kf?.run_id && kf?.image_url) {
              setCanonModal({ open: true, keyframe: kf });
            }
          }}
        />
      )}

      {/* Developer Debug Panel */}
      <DeveloperDebugPanel
        data={{
          prompt: debugPrompt || buildGenerationPayload(selectedIndex, projectId || '', undefined)?.prompt || '',
          negativePrompt: debugNegativePrompt,
          engine: 'nano-banana-pro',
          preset: getRequiredSlots()[selectedIndex]?.frameType || 'initial',
          contextJson: {
            shotId,
            duration,
            sceneDescription,
            shotType,
            cameraMovement,
            blocking,
            characters: characters.map(c => ({ id: c.id, name: c.name })),
            location: location ? { id: location.id, name: location.name } : null,
            shotDetails,
            stylePack,
            recommendation,
          },
          rawResponse: lastRawResponse,
        }}
        onPromptChange={setDebugPrompt}
        onNegativePromptChange={setDebugNegativePrompt}
        onForceRegenerate={() => generateKeyframe(selectedIndex)}
        showEngineSelector={false}
        showPresetSelector={false}
        showSeed={true}
        title="Debug / Advanced (Keyframe)"
      />

      {/* Set Canon Modal */}
      {canonModal.keyframe && projectId && (
        <SetCanonModal
          open={canonModal.open}
          onOpenChange={(open) => setCanonModal({ ...canonModal, open })}
          runId={canonModal.keyframe.run_id!}
          imageUrl={canonModal.keyframe.image_url!}
          projectId={projectId}
          onSuccess={() => {
            toast.success('Asset establecido como versión aprobada');
          }}
        />
      )}

      {/* Scene Coverage Generator Modal */}
      {sceneId && projectId && (
        <SceneCoverageGenerator
          open={showCoverageGenerator}
          onOpenChange={setShowCoverageGenerator}
          referenceKeyframe={{
            id: keyframes.find(kf => kf.approved && kf.image_url)?.id || '',
            image_url: keyframes.find(kf => kf.approved && kf.image_url)?.image_url || '',
            shot_id: shotId,
          }}
          sceneId={sceneId}
          sceneSlugline={sceneSlugline || sceneDescription}
          sceneType={sceneType}
          characters={characters}
          location={location}
          projectId={projectId}
          projectStyle={projectStyle}
          onCoverageGenerated={(keyframeIds) => {
            toast.success(`${keyframeIds.length} keyframes de cobertura generados`);
            // Refresh keyframes list
            supabase
              .from('keyframes')
              .select('*')
              .eq('shot_id', shotId)
              .order('timestamp_sec', { ascending: true })
              .then(({ data }) => {
                if (data) {
                  setKeyframes(data as unknown as Keyframe[]);
                  onKeyframesChange?.(data as unknown as Keyframe[]);
                }
              });
          }}
        />
      )}

      {/* Keyframe Lightbox - Full-size viewer */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-none">
          {lightboxImage && (
            <>
              <div className="relative">
                <img
                  src={lightboxImage.url}
                  alt={`Keyframe ${lightboxImage.frameType}`}
                  className="w-full h-auto max-h-[80vh] object-contain"
                />
                
                {/* Overlay info at bottom */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={
                        lightboxImage.frameType === 'initial' ? 'default' : 
                        lightboxImage.frameType === 'final' ? 'secondary' : 'outline'
                      }>
                        {lightboxImage.frameType === 'initial' ? 'Inicio' : 
                         lightboxImage.frameType === 'final' ? 'Final' : 
                         `${lightboxImage.timestampSec}s`}
                      </Badge>
                      {lightboxImage.approved && (
                        <Badge className="bg-green-600">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Aprobado
                        </Badge>
                      )}
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-white border-white/30 hover:bg-white/20"
                      onClick={() => window.open(lightboxImage.url, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Abrir en nueva pestaña
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* Navigation arrows */}
              <Button 
                size="icon" 
                variant="ghost" 
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-10 w-10"
                onClick={() => navigateLightbox(-1)}
                disabled={lightboxImage.slotIndex === 0}
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 h-10 w-10"
                onClick={() => navigateLightbox(1)}
                disabled={lightboxImage.slotIndex === slots.length - 1}
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
