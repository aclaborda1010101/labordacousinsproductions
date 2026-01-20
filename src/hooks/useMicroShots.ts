/**
 * useMicroShots Hook v2
 * Manages micro-shots for a given shot, including CRUD operations and video generation
 * 
 * Features:
 * - Automatic chaining: end_frame of previous microshot → start of next
 * - Inter-shot continuity: continuity_anchor_image_url from previous shot
 * - A→B mode support with engine auto-selection
 * - Realtime updates via Supabase subscription
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  selectVideoProvider, 
  VideoEngine,
  generateShotSeed 
} from '@/lib/videoProviderSelector';

export interface MicroShot {
  id: string;
  shot_id: string;
  project_id: string;
  sequence_no: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  keyframe_initial_id: string | null;
  keyframe_final_id: string | null;
  video_url: string | null;
  video_status: 'pending' | 'generating' | 'ready' | 'failed' | 'approved';
  video_engine: VideoEngine;
  generation_run_id: string | null;
  prompt_text: string | null;
  motion_notes: string | null;
  negative_prompt: string | null;
  seed: number | null;
  end_frame_image_url: string | null;
  quality_score: number | null;
  qc_issues: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Keyframe {
  id: string;
  image_url: string | null;
  prompt_text: string | null;
  timestamp_sec: number;
  approved: boolean;
}

export interface ShotContext {
  provider_preference: 'auto' | VideoEngine;
  continuity_anchor_image_url: string | null;
  style_lock: Record<string, unknown>;
}

interface UseMicroShotsOptions {
  shotId: string;
  enabled?: boolean;
}

interface UseMicroShotsReturn {
  microShots: MicroShot[];
  loading: boolean;
  error: string | null;
  shotContext: ShotContext | null;
  subdivide: (microDuration?: number) => Promise<MicroShot[]>;
  assignKeyframes: () => Promise<void>;
  generateVideo: (microShotId: string, engine?: VideoEngine | 'auto') => Promise<void>;
  generateAllVideos: (engine?: VideoEngine | 'auto') => Promise<void>;
  updateMicroShot: (id: string, updates: Partial<MicroShot>) => Promise<void>;
  deleteMicroShot: (id: string) => Promise<void>;
  pollVideoStatus: (microShotId: string) => Promise<void>;
  refresh: () => Promise<void>;
  getChainedKeyframeUrl: (microShotId: string) => string | null;
}

export function useMicroShots({ shotId, enabled = true }: UseMicroShotsOptions): UseMicroShotsReturn {
  const [microShots, setMicroShots] = useState<MicroShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shotContext, setShotContext] = useState<ShotContext | null>(null);
  const [keyframesMap, setKeyframesMap] = useState<Record<string, Keyframe>>({});

  // Fetch micro-shots for this shot
  const fetchMicroShots = useCallback(async () => {
    if (!shotId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      // Fetch shot context for provider preference and continuity anchor
      const { data: shotData } = await supabase
        .from('shots')
        .select('provider_preference, continuity_anchor_image_url, style_lock')
        .eq('id', shotId)
        .single();

      if (shotData) {
        setShotContext({
          provider_preference: (shotData.provider_preference || 'auto') as 'auto' | VideoEngine,
          continuity_anchor_image_url: shotData.continuity_anchor_image_url,
          style_lock: (shotData.style_lock || {}) as Record<string, unknown>
        });
      }

      // Fetch micro-shots
      const { data, error: fetchError } = await supabase
        .from('micro_shots')
        .select('*')
        .eq('shot_id', shotId)
        .order('sequence_no', { ascending: true });

      if (fetchError) throw fetchError;
      
      const typedData = (data || []) as unknown as MicroShot[];
      setMicroShots(typedData);

      // Load keyframes for display
      const keyframeIds = new Set<string>();
      typedData.forEach((ms) => {
        if (ms.keyframe_initial_id) keyframeIds.add(ms.keyframe_initial_id);
        if (ms.keyframe_final_id) keyframeIds.add(ms.keyframe_final_id);
      });

      if (keyframeIds.size > 0) {
        const { data: kfData } = await supabase
          .from('keyframes')
          .select('*')
          .in('id', Array.from(keyframeIds));

        if (kfData) {
          const map: Record<string, Keyframe> = {};
          kfData.forEach((kf: unknown) => { 
            const keyframe = kf as Keyframe;
            map[keyframe.id] = keyframe; 
          });
          setKeyframesMap(map);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error loading micro-shots';
      setError(message);
      console.error('[useMicroShots] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [shotId, enabled]);

  // Initial load
  useEffect(() => {
    fetchMicroShots();
  }, [fetchMicroShots]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!shotId || !enabled) return;

    const channel = supabase
      .channel(`micro_shots:${shotId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'micro_shots',
          filter: `shot_id=eq.${shotId}`
        },
        (payload) => {
          console.log('[useMicroShots] Realtime update:', payload);
          
          if (payload.eventType === 'INSERT') {
            setMicroShots(prev => [...prev, payload.new as MicroShot].sort((a, b) => a.sequence_no - b.sequence_no));
          } else if (payload.eventType === 'UPDATE') {
            setMicroShots(prev => prev.map(ms => ms.id === payload.new.id ? payload.new as MicroShot : ms));
          } else if (payload.eventType === 'DELETE') {
            setMicroShots(prev => prev.filter(ms => ms.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shotId, enabled]);

  /**
   * Get the chained keyframe URL for a microshot
   * Uses: previous microshot's end_frame_image_url OR shot's continuity_anchor
   */
  const getChainedKeyframeUrl = useCallback((microShotId: string): string | null => {
    const msIndex = microShots.findIndex(m => m.id === microShotId);
    if (msIndex < 0) return null;

    const ms = microShots[msIndex];

    // First microshot: use continuity anchor from previous shot
    if (msIndex === 0) {
      if (shotContext?.continuity_anchor_image_url) {
        return shotContext.continuity_anchor_image_url;
      }
      // Fallback to assigned keyframe
      if (ms.keyframe_initial_id && keyframesMap[ms.keyframe_initial_id]?.image_url) {
        return keyframesMap[ms.keyframe_initial_id].image_url;
      }
      return null;
    }

    // Subsequent microshots: use end_frame from previous
    const prevMs = microShots[msIndex - 1];
    if (prevMs.end_frame_image_url) {
      return prevMs.end_frame_image_url;
    }

    // Fallback to assigned keyframe
    if (ms.keyframe_initial_id && keyframesMap[ms.keyframe_initial_id]?.image_url) {
      return keyframesMap[ms.keyframe_initial_id].image_url;
    }

    return null;
  }, [microShots, shotContext, keyframesMap]);

  // Subdivide shot into micro-shots using database function
  const subdivide = useCallback(async (microDuration = 0.5): Promise<MicroShot[]> => { // Hollywood Standard: 0.5s default
    try {
      const { data, error: rpcError } = await supabase
        .rpc('subdivide_shot_into_microshots', {
          p_shot_id: shotId,
          p_micro_duration: microDuration
        });

      if (rpcError) throw rpcError;

      const newMicroShots = (data || []) as MicroShot[];
      
      // Generate a consistent seed for all microshots in this shot
      const shotSeed = generateShotSeed(shotId);
      
      // Update all microshots with the same seed
      for (const ms of newMicroShots) {
        await supabase
          .from('micro_shots')
          .update({ seed: shotSeed })
          .eq('id', ms.id);
      }

      setMicroShots(newMicroShots);
      toast.success(`Shot subdividido en ${newMicroShots.length} micro-shots`);
      return newMicroShots;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error subdividing shot';
      toast.error(message);
      throw err;
    }
  }, [shotId]);

  // Assign keyframes to micro-shots (chaining logic)
  const assignKeyframes = useCallback(async () => {
    try {
      // Fetch all keyframes for this shot
      const { data: keyframes, error: kfError } = await supabase
        .from('keyframes')
        .select('*')
        .eq('shot_id', shotId)
        .order('timestamp_sec', { ascending: true });

      if (kfError) throw kfError;

      // Assign keyframes to each micro-shot based on timing
      for (const ms of microShots) {
        const initialKf = (keyframes || []).find(kf => 
          Math.abs(kf.timestamp_sec - ms.start_sec) < 0.5
        );
        
        const finalKf = (keyframes || []).find(kf => 
          Math.abs(kf.timestamp_sec - ms.end_sec) < 0.5
        );

        if (initialKf || finalKf) {
          await supabase
            .from('micro_shots')
            .update({
              keyframe_initial_id: initialKf?.id || null,
              keyframe_final_id: finalKf?.id || null
            })
            .eq('id', ms.id);
        }
      }

      // Chain keyframes using database function
      await supabase.rpc('chain_microshot_keyframes', { p_shot_id: shotId });

      await fetchMicroShots();
      toast.success('Keyframes asignados y encadenados');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error assigning keyframes';
      toast.error(message);
      throw err;
    }
  }, [shotId, microShots, fetchMicroShots]);

  // Generate video for a single micro-shot with chaining support
  const generateVideo = useCallback(async (microShotId: string, engine: VideoEngine | 'auto' = 'auto') => {
    try {
      const ms = microShots.find(m => m.id === microShotId);
      if (!ms) throw new Error('MicroShot not found');

      // Update local state optimistically
      setMicroShots(prev => prev.map(m => 
        m.id === microShotId ? { ...m, video_status: 'generating' as const } : m
      ));

      // Get chained keyframe URL (from previous microshot or continuity anchor)
      const chainedKeyframeUrl = getChainedKeyframeUrl(microShotId);

      // Get tail keyframe URL for A→B (if available and approved)
      let keyframeTailUrl: string | undefined;
      if (ms.keyframe_final_id && keyframesMap[ms.keyframe_final_id]?.approved) {
        keyframeTailUrl = keyframesMap[ms.keyframe_final_id].image_url || undefined;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('generate-microshot-video', {
        body: { 
          microShotId, 
          engine,
          keyframeUrlOverride: chainedKeyframeUrl || undefined,
          keyframeTailUrlOverride: keyframeTailUrl
        }
      });

      if (invokeError) throw invokeError;

      if (!data.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      const engineUsed = data.engine?.toUpperCase() || engine.toUpperCase();
      const modeInfo = data.hasAtoB ? 'A→B' : 'chaining';
      toast.success(`Generación iniciada con ${engineUsed} (${modeInfo})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generating video';
      toast.error(message);
      
      // Revert optimistic update
      setMicroShots(prev => prev.map(m => 
        m.id === microShotId ? { ...m, video_status: 'failed' as const } : m
      ));
      throw err;
    }
  }, [microShots, getChainedKeyframeUrl, keyframesMap]);

  // Generate videos for all micro-shots sequentially (maintains chaining)
  const generateAllVideos = useCallback(async (engine: VideoEngine | 'auto' = 'auto') => {
    const pendingShots = microShots.filter(ms => 
      ms.video_status === 'pending' && 
      (ms.keyframe_initial_id || shotContext?.continuity_anchor_image_url)
    );

    if (pendingShots.length === 0) {
      toast.info('No hay micro-shots pendientes con keyframes disponibles');
      return;
    }

    toast.info(`Generando ${pendingShots.length} videos en secuencia...`);

    // Sequential generation to maintain chaining
    for (const ms of pendingShots) {
      try {
        await generateVideo(ms.id, engine);
        // Wait for previous video to complete before starting next (for chaining)
        // In practice, this is handled by polling in the UI
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.error(`[useMicroShots] Failed to generate video for ${ms.id}:`, err);
        // Continue with next but note the chaining will be broken
      }
    }
  }, [microShots, shotContext, generateVideo]);

  // Poll video status for a micro-shot
  const pollVideoStatus = useCallback(async (microShotId: string) => {
    const ms = microShots.find(m => m.id === microShotId);
    if (!ms || !ms.generation_run_id) return;

    try {
      // Determine which poll function to use
      let pollFunction = 'kling_poll';
      if (ms.video_engine === 'veo') pollFunction = 'veo_poll';
      if (ms.video_engine === 'runway') pollFunction = 'runway_poll';
      
      const { data, error: pollError } = await supabase.functions.invoke(pollFunction, {
        body: { 
          runId: ms.generation_run_id,
          taskId: ms.generation_run_id
        }
      });

      if (pollError) throw pollError;

      if (data?.status === 'completed' && data?.outputUrl) {
        await supabase
          .from('micro_shots')
          .update({
            video_url: data.outputUrl,
            video_status: 'ready'
            // Note: end_frame_image_url will be set by extract-end-frame function
          })
          .eq('id', microShotId);

        toast.success(`Video listo para micro-shot ${ms.sequence_no}`);
      }
    } catch (err) {
      console.error('[useMicroShots] Poll error:', err);
    }
  }, [microShots]);

  // Update a micro-shot
  const updateMicroShot = useCallback(async (id: string, updates: Partial<MicroShot>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateError } = await supabase
        .from('micro_shots')
        .update(updates as any)
        .eq('id', id);

      if (updateError) throw updateError;

      setMicroShots(prev => prev.map(ms =>
        ms.id === id ? { ...ms, ...updates } : ms
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error updating micro-shot';
      toast.error(message);
      throw err;
    }
  }, []);

  // Delete a micro-shot
  const deleteMicroShot = useCallback(async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('micro_shots')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      setMicroShots(prev => prev.filter(ms => ms.id !== id));
      toast.success('Micro-shot eliminado');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error deleting micro-shot';
      toast.error(message);
      throw err;
    }
  }, []);

  return {
    microShots,
    loading,
    error,
    shotContext,
    subdivide,
    assignKeyframes,
    generateVideo,
    generateAllVideos,
    updateMicroShot,
    deleteMicroShot,
    pollVideoStatus,
    refresh: fetchMicroShots,
    getChainedKeyframeUrl
  };
}
