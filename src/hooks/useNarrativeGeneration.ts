/**
 * useNarrativeGeneration - Hook for the new Narrative System (Phase 4)
 * 
 * Replaces the old batch loop in ScriptImport with:
 * - Backend-driven scene generation via narrative-decide + scene-worker
 * - Realtime subscriptions for progress updates
 * - Persistent state in narrative_state + scene_intent tables
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { toast } from 'sonner';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export interface NarrativeState {
  id: string;
  project_id: string;
  format: 'film' | 'series' | 'ad';
  unit_type: string;
  unit_ref: string;
  current_phase: string;
  narrative_goal: string | null;
  emotional_delta: string | null;
  last_unit_summary: string | null;
  locked_facts: any[];
  forbidden_actions: any[];
  active_threads: any[];
  unresolved_questions: any[];
  open_threads: any[];
  resolved_threads: any[];
  character_arcs: Record<string, any>;
  canon_facts: any[];
  scenes_generated: number;
  pacing_meter: number;
  created_at: string;
  updated_at: string;
}

export interface SceneIntent {
  id: string;
  project_id: string;
  narrative_state_id: string | null;
  scene_number: number;
  episode_number: number;
  intent_summary: string;
  emotional_turn: string | null;
  information_revealed: any[];
  information_hidden: any[];
  characters_involved: any[];
  thread_to_advance: string | null;
  constraints: Record<string, any>;
  status: 'pending' | 'writing' | 'written' | 'validated' | 'failed';
  job_id: string | null;
  scene_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationProgress {
  totalScenes: number;
  completedScenes: number;
  currentScene: number | null;
  currentEpisode: number | null;
  phase: 'idle' | 'planning' | 'generating' | 'completed' | 'failed';
  error: string | null;
}

export interface UseNarrativeGenerationOptions {
  projectId: string;
  onSceneGenerated?: (scene: any) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useNarrativeGeneration({
  projectId,
  onSceneGenerated,
  onComplete,
  onError,
}: UseNarrativeGenerationOptions) {
  // State
  const [narrativeState, setNarrativeState] = useState<NarrativeState | null>(null);
  const [sceneIntents, setSceneIntents] = useState<SceneIntent[]>([]);
  const [progress, setProgress] = useState<GenerationProgress>({
    totalScenes: 0,
    completedScenes: 0,
    currentScene: null,
    currentEpisode: null,
    phase: 'idle',
    error: null,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Refs
  const channelRef = useRef<RealtimeChannel | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // Realtime Subscriptions
  // ============================================================================
  
  const setupRealtimeSubscription = useCallback(() => {
    // Cleanup existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`narrative-generation-${projectId}`)
      // Listen to scene_intent changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scene_intent',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[NarrativeGen] scene_intent change:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newIntent = payload.new as SceneIntent;
            setSceneIntents(prev => [...prev, newIntent]);
            setProgress(prev => ({
              ...prev,
              totalScenes: prev.totalScenes + 1,
              currentScene: newIntent.scene_number,
              currentEpisode: newIntent.episode_number,
            }));
          } else if (payload.eventType === 'UPDATE') {
            const updatedIntent = payload.new as SceneIntent;
            setSceneIntents(prev => 
              prev.map(i => i.id === updatedIntent.id ? updatedIntent : i)
            );
            
            // Update progress based on status
            if (updatedIntent.status === 'written' || updatedIntent.status === 'validated') {
              setProgress(prev => ({
                ...prev,
                completedScenes: prev.completedScenes + 1,
              }));
            }
          }
        }
      )
      // Listen to scenes table for actual scene data
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scenes',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[NarrativeGen] New scene:', payload.new);
          onSceneGenerated?.(payload.new);
        }
      )
      // Listen to narrative_state updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'narrative_state',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[NarrativeGen] narrative_state change:', payload);
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setNarrativeState(payload.new as NarrativeState);
          }
        }
      )
      .subscribe((status) => {
        console.log('[NarrativeGen] Realtime subscription status:', status);
      });

    channelRef.current = channel;
  }, [projectId, onSceneGenerated]);

  // ============================================================================
  // Load Initial State
  // ============================================================================
  
  const loadInitialState = useCallback(async () => {
    try {
      // Load narrative_state
      const { data: nsData } = await supabase
        .from('narrative_state')
        .select('*')
        .eq('project_id', projectId)
        .maybeSingle();
      
      if (nsData) {
        setNarrativeState(nsData as unknown as NarrativeState);
      }

      // Load scene_intents
      const { data: intentsData } = await supabase
        .from('scene_intent')
        .select('*')
        .eq('project_id', projectId)
        .order('episode_number', { ascending: true })
        .order('scene_number', { ascending: true });
      
      if (intentsData) {
        setSceneIntents(intentsData as unknown as SceneIntent[]);
        
        const completed = intentsData.filter(
          i => i.status === 'written' || i.status === 'validated'
        ).length;
        
        setProgress(prev => ({
          ...prev,
          totalScenes: intentsData.length,
          completedScenes: completed,
          phase: completed === intentsData.length && intentsData.length > 0 
            ? 'completed' 
            : prev.phase,
        }));
      }
    } catch (err) {
      console.error('[NarrativeGen] Error loading initial state:', err);
    }
  }, [projectId]);

  // ============================================================================
  // Start Generation
  // ============================================================================
  
  const startGeneration = useCallback(async (params: {
    outline: any;
    episodeNumber?: number;
    language?: string;
    qualityTier?: string;
    format?: 'film' | 'series' | 'ad';
  }) => {
    const { outline, episodeNumber, language = 'es-ES', qualityTier = 'profesional', format = 'series' } = params;

    setIsGenerating(true);
    setProgress(prev => ({ ...prev, phase: 'planning', error: null }));
    
    abortControllerRef.current = new AbortController();

    try {
      // Step 1: Call narrative-decide to plan scenes
      toast.info('Planificando escenas...');
      
      const { data, error } = await invokeAuthedFunction('narrative-decide', {
        projectId,
        outline,
        episodeNumber: episodeNumber || 1,
        language,
        qualityTier,
        format,
      });

      if (error) {
        throw new Error(error.message || 'Error en narrative-decide');
      }

      console.log('[NarrativeGen] narrative-decide result:', data);

      // Update progress
      setProgress(prev => ({
        ...prev,
        phase: 'generating',
        totalScenes: data.scenes_planned || prev.totalScenes,
      }));

      toast.success(`${data.scenes_planned || 0} escenas planificadas`);

      // Step 2: Trigger scene-worker for each pending scene_intent
      // The scene-worker will be triggered via jobs table
      // Frontend observes via Realtime subscriptions
      
      if (data.jobs_created && data.jobs_created.length > 0) {
        toast.info(`Generando ${data.jobs_created.length} escenas...`);
        
        // Process jobs sequentially to avoid overwhelming the backend
        for (const jobId of data.jobs_created) {
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[NarrativeGen] Aborted by user');
            break;
          }

          try {
            const { error: workerError } = await invokeAuthedFunction('scene-worker', {
              job_id: jobId,
            });

            if (workerError) {
              console.error('[NarrativeGen] scene-worker error:', workerError);
              // Continue with next job, don't fail completely
            }
          } catch (jobErr) {
            console.error('[NarrativeGen] Error invoking scene-worker:', jobErr);
          }

          // Small delay between workers to prevent rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Check completion
      await loadInitialState();
      
      const { data: finalIntents } = await supabase
        .from('scene_intent')
        .select('status')
        .eq('project_id', projectId);
      
      const allCompleted = finalIntents?.every(
        i => i.status === 'written' || i.status === 'validated'
      );

      if (allCompleted) {
        setProgress(prev => ({ ...prev, phase: 'completed' }));
        toast.success('¡Generación completada!');
        onComplete?.();
      }

    } catch (err: any) {
      console.error('[NarrativeGen] Generation error:', err);
      const errorMsg = err.message || 'Error desconocido';
      setProgress(prev => ({ ...prev, phase: 'failed', error: errorMsg }));
      toast.error('Error en generación', { description: errorMsg });
      onError?.(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, loadInitialState, onComplete, onError]);

  // ============================================================================
  // Cancel Generation
  // ============================================================================
  
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setProgress(prev => ({ ...prev, phase: 'idle' }));
    toast.info('Generación cancelada');
  }, []);

  // ============================================================================
  // Reset State
  // ============================================================================
  
  const resetNarrativeState = useCallback(async () => {
    try {
      // Delete scene_intents
      await supabase
        .from('scene_intent')
        .delete()
        .eq('project_id', projectId);

      // Delete narrative_state
      await supabase
        .from('narrative_state')
        .delete()
        .eq('project_id', projectId);

      setNarrativeState(null);
      setSceneIntents([]);
      setProgress({
        totalScenes: 0,
        completedScenes: 0,
        currentScene: null,
        currentEpisode: null,
        phase: 'idle',
        error: null,
      });

      toast.success('Estado narrativo reiniciado');
    } catch (err) {
      console.error('[NarrativeGen] Error resetting state:', err);
      toast.error('Error al reiniciar estado');
    }
  }, [projectId]);

  // ============================================================================
  // Effects
  // ============================================================================
  
  // Setup realtime on mount
  useEffect(() => {
    setupRealtimeSubscription();
    loadInitialState();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [setupRealtimeSubscription, loadInitialState]);

  // ============================================================================
  // Computed Values
  // ============================================================================
  
  const progressPercentage = progress.totalScenes > 0
    ? Math.round((progress.completedScenes / progress.totalScenes) * 100)
    : 0;

  // ============================================================================
  // Return
  // ============================================================================
  
  return {
    // State
    narrativeState,
    sceneIntents,
    progress,
    progressPercentage,
    isGenerating,
    
    // Actions
    startGeneration,
    cancelGeneration,
    resetNarrativeState,
    refreshState: loadInitialState,
  };
}
