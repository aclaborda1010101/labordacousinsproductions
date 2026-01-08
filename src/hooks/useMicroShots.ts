/**
 * useMicroShots Hook
 * Manages micro-shots for a given shot, including CRUD operations and video generation
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
  video_engine: 'kling' | 'veo' | 'runway';
  generation_run_id: string | null;
  prompt_text: string | null;
  motion_notes: string | null;
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

interface UseMicroShotsOptions {
  shotId: string;
  enabled?: boolean;
}

interface UseMicroShotsReturn {
  microShots: MicroShot[];
  loading: boolean;
  error: string | null;
  subdivide: (microDuration?: number) => Promise<MicroShot[]>;
  assignKeyframes: () => Promise<void>;
  generateVideo: (microShotId: string, engine?: 'kling' | 'veo') => Promise<void>;
  generateAllVideos: (engine?: 'kling' | 'veo') => Promise<void>;
  updateMicroShot: (id: string, updates: Partial<MicroShot>) => Promise<void>;
  deleteMicroShot: (id: string) => Promise<void>;
  pollVideoStatus: (microShotId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMicroShots({ shotId, enabled = true }: UseMicroShotsOptions): UseMicroShotsReturn {
  const [microShots, setMicroShots] = useState<MicroShot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch micro-shots for this shot
  const fetchMicroShots = useCallback(async () => {
    if (!shotId || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('micro_shots')
        .select('*')
        .eq('shot_id', shotId)
        .order('sequence_no', { ascending: true });

      if (fetchError) throw fetchError;
      
      setMicroShots((data || []) as MicroShot[]);
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

  // Subdivide shot into micro-shots using database function
  const subdivide = useCallback(async (microDuration = 2): Promise<MicroShot[]> => {
    try {
      const { data, error: rpcError } = await supabase
        .rpc('subdivide_shot_into_microshots', {
          p_shot_id: shotId,
          p_micro_duration: microDuration
        });

      if (rpcError) throw rpcError;

      const newMicroShots = (data || []) as MicroShot[];
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
        // Find keyframe closest to start_sec (initial)
        const initialKf = (keyframes || []).find(kf => 
          Math.abs(kf.timestamp_sec - ms.start_sec) < 0.5
        );
        
        // Find keyframe closest to end_sec (final)
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

  // Generate video for a single micro-shot
  const generateVideo = useCallback(async (microShotId: string, engine: 'kling' | 'veo' = 'kling') => {
    try {
      // Update local state optimistically
      setMicroShots(prev => prev.map(ms => 
        ms.id === microShotId ? { ...ms, video_status: 'generating' as const } : ms
      ));

      const { data, error: invokeError } = await supabase.functions.invoke('generate-microshot-video', {
        body: { microShotId, engine }
      });

      if (invokeError) throw invokeError;

      if (!data.ok) {
        throw new Error(data.error || 'Generation failed');
      }

      toast.success(`Generación iniciada con ${engine.toUpperCase()}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error generating video';
      toast.error(message);
      
      // Revert optimistic update
      setMicroShots(prev => prev.map(ms => 
        ms.id === microShotId ? { ...ms, video_status: 'failed' as const } : ms
      ));
      throw err;
    }
  }, []);

  // Generate videos for all micro-shots sequentially
  const generateAllVideos = useCallback(async (engine: 'kling' | 'veo' = 'kling') => {
    const pendingShots = microShots.filter(ms => 
      ms.video_status === 'pending' && ms.keyframe_initial_id
    );

    if (pendingShots.length === 0) {
      toast.info('No hay micro-shots pendientes con keyframes aprobados');
      return;
    }

    toast.info(`Generando ${pendingShots.length} videos...`);

    for (const ms of pendingShots) {
      try {
        await generateVideo(ms.id, engine);
        // Small delay between requests
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[useMicroShots] Failed to generate video for ${ms.id}:`, err);
        // Continue with next
      }
    }
  }, [microShots, generateVideo]);

  // Poll video status for a micro-shot
  const pollVideoStatus = useCallback(async (microShotId: string) => {
    const ms = microShots.find(m => m.id === microShotId);
    if (!ms || !ms.generation_run_id) return;

    try {
      // Determine which poll function to use
      const pollFunction = ms.video_engine === 'veo' ? 'veo_poll' : 'kling_poll';
      
      const { data, error: pollError } = await supabase.functions.invoke(pollFunction, {
        body: { runId: ms.generation_run_id }
      });

      if (pollError) throw pollError;

      if (data?.status === 'completed' && data?.outputUrl) {
        await supabase
          .from('micro_shots')
          .update({
            video_url: data.outputUrl,
            video_status: 'ready'
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
    subdivide,
    assignKeyframes,
    generateVideo,
    generateAllVideos,
    updateMicroShot,
    deleteMicroShot,
    pollVideoStatus,
    refresh: fetchMicroShots
  };
}
