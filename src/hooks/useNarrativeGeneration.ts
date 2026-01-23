/**
 * useNarrativeGeneration - Hook for the new Narrative System (Phase 4)
 * 
 * Replaces the old batch loop in ScriptImport with:
 * - Backend-driven scene generation via narrative-decide + scene-worker
 * - Realtime subscriptions for progress updates
 * - Persistent state in narrative_state + scene_intent tables
 * - Auto-compilation of scenes into a full script when completed
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { toast } from 'sonner';
import { RealtimeChannel } from '@supabase/supabase-js';
import { compileScriptFromScenes } from '@/lib/compileScriptFromScenes';

// Helper to derive phase from intent statuses
function derivePhaseFromIntents(intents: { status: string }[]): 'idle' | 'planning' | 'generating' | 'validating' | 'repairing' | 'completed' | 'failed' {
  if (!intents || intents.length === 0) return 'idle';
  
  const statuses = intents.map(i => i.status);
  
  // Any failed → failed
  if (statuses.some(s => s === 'failed')) return 'failed';
  
  // Any writing/needs_repair → generating (active work)
  if (statuses.some(s => s === 'writing' || s === 'needs_repair' || s === 'repairing')) return 'generating';
  
  // Any pending/planning/planned → planning (queue has work)
  if (statuses.some(s => s === 'pending' || s === 'planning' || s === 'planned')) return 'planning';
  
  // All written or validated → completed
  if (statuses.every(s => s === 'written' || s === 'validated')) return 'completed';
  
  return 'idle';
}

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
  status: 'pending' | 'planning' | 'planned' | 'writing' | 'written' | 'needs_repair' | 'repairing' | 'validated' | 'rejected' | 'failed';
  job_id: string | null;
  scene_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SceneRepair {
  id: string;
  scene_id: string;
  scene_intent_id: string | null;
  project_id: string;
  scene_number: number;
  episode_number: number;
  issues: string[];
  failed_checks: any[];
  validation_score: number;
  strategy: 'rewrite' | 'partial' | 'accept_degraded';
  attempts: number;
  max_attempts: number;
  status: 'pending' | 'repairing' | 'done' | 'failed' | 'rejected';
  repair_log: any[];
  created_at: string;
  updated_at: string;
}

export interface GenerationProgress {
  totalScenes: number;
  completedScenes: number;
  validatedScenes: number;
  repairingScenes: number;
  failedScenes: number;
  currentScene: number | null;
  currentEpisode: number | null;
  phase: 'idle' | 'planning' | 'generating' | 'validating' | 'repairing' | 'completed' | 'failed';
  error: string | null;
}

export interface UseNarrativeGenerationOptions {
  projectId: string;
  episodeNumber?: number;
  onSceneGenerated?: (scene: any) => void;
  onComplete?: () => void;
  onScriptCompiled?: (scriptId: string) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useNarrativeGeneration({
  projectId,
  episodeNumber = 1,
  onSceneGenerated,
  onComplete,
  onScriptCompiled,
  onError,
}: UseNarrativeGenerationOptions) {
  // State
  const [narrativeState, setNarrativeState] = useState<NarrativeState | null>(null);
  const [sceneIntents, setSceneIntents] = useState<SceneIntent[]>([]);
  const [sceneRepairs, setSceneRepairs] = useState<SceneRepair[]>([]);
  const [progress, setProgress] = useState<GenerationProgress>({
    totalScenes: 0,
    completedScenes: 0,
    validatedScenes: 0,
    repairingScenes: 0,
    failedScenes: 0,
    currentScene: null,
    currentEpisode: null,
    phase: 'idle',
    error: null,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  // V72: Track when initial state has been loaded (fixes race condition with auto-start)
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Refs
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isGeneratingRef = useRef(false); // Ref to prevent race conditions
  // Callback refs to stabilize realtime subscription (prevent CLOSED spam)
  const onSceneGeneratedRef = useRef(onSceneGenerated);
  const onCompleteRef = useRef(onComplete);
  const onScriptCompiledRef = useRef(onScriptCompiled);
  const onErrorRef = useRef(onError);
  
  // Keep refs updated
  useEffect(() => {
    onSceneGeneratedRef.current = onSceneGenerated;
    onCompleteRef.current = onComplete;
    onScriptCompiledRef.current = onScriptCompiled;
    onErrorRef.current = onError;
  }, [onSceneGenerated, onComplete, onScriptCompiled, onError]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // Auto-compile Script when generation completes
  // ============================================================================
  
  const compileFullScript = useCallback(async () => {
    console.log('[NarrativeGen] Compiling full script from scenes...');
    
    try {
      const result = await compileScriptFromScenes({
        projectId,
        episodeNumber,
      });
      
      if (result.success && result.scriptId) {
        console.log('[NarrativeGen] Script compiled:', result);
        toast.success(`Guion compilado: ${result.scenesCompiled} escenas`, {
          description: 'Puedes exportar el guion en formato PDF',
        });
        onScriptCompiledRef.current?.(result.scriptId);
      } else {
        console.warn('[NarrativeGen] Script compilation failed:', result.error);
      }
    } catch (err) {
      console.error('[NarrativeGen] Script compilation error:', err);
    }
  }, [projectId, episodeNumber]);

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
          onSceneGeneratedRef.current?.(payload.new);
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
      // Listen to scene_repairs for validation system
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scene_repairs',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          console.log('[NarrativeGen] scene_repairs change:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newRepair = payload.new as SceneRepair;
            setSceneRepairs(prev => [...prev, newRepair]);
            setProgress(prev => ({
              ...prev,
              repairingScenes: prev.repairingScenes + 1,
              phase: 'repairing',
            }));
          } else if (payload.eventType === 'UPDATE') {
            const updatedRepair = payload.new as SceneRepair;
            setSceneRepairs(prev =>
              prev.map(r => r.id === updatedRepair.id ? updatedRepair : r)
            );
            
            // Update progress based on repair status
            if (updatedRepair.status === 'done') {
              setProgress(prev => ({
                ...prev,
                repairingScenes: Math.max(0, prev.repairingScenes - 1),
                validatedScenes: prev.validatedScenes + 1,
              }));
            } else if (updatedRepair.status === 'failed' || updatedRepair.status === 'rejected') {
              setProgress(prev => ({
                ...prev,
                repairingScenes: Math.max(0, prev.repairingScenes - 1),
                failedScenes: prev.failedScenes + 1,
              }));
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[NarrativeGen] Realtime subscription status:', status);
      });

    channelRef.current = channel;
  }, [projectId]); // Removed onSceneGenerated - using ref instead

  // ============================================================================
  // Integrity Validation - Auto-cleanup orphaned data
  // ============================================================================
  
  const validateAndCleanupIntegrity = useCallback(async (): Promise<{
    hadOrphans: boolean;
    cleanedJobs: number;
  }> => {
    try {
      // 1. Load scene_intents to get valid IDs
      const { data: intents } = await supabase
        .from('scene_intent')
        .select('id')
        .eq('project_id', projectId);
      
      const validIntentIds = new Set((intents || []).map(i => i.id));

      // 2. Load jobs and check for orphans
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, payload, status')
        .eq('project_id', projectId)
        .eq('type', 'scene_generation')
        .in('status', ['queued', 'running', 'blocked'] as const);

      if (!jobs || jobs.length === 0) {
        return { hadOrphans: false, cleanedJobs: 0 };
      }

      // Find orphaned jobs (those pointing to non-existent intents)
      const orphanedJobIds: string[] = [];
      for (const job of jobs) {
        const payload = job.payload as { scene_intent_id?: string } | null;
        const intentId = payload?.scene_intent_id;
        
        // Job is orphan if:
        // - It has no intent ID but there are no intents at all
        // - It references an intent that doesn't exist
        const isOrphan = !intentId || 
                         (validIntentIds.size === 0) || 
                         (intentId && !validIntentIds.has(intentId));
        
        if (isOrphan) {
          orphanedJobIds.push(job.id);
        }
      }

      if (orphanedJobIds.length > 0) {
        console.log(`[NarrativeGen] Found ${orphanedJobIds.length} orphaned jobs, cleaning up...`);
        
        // Delete orphaned jobs
        const { error } = await supabase
          .from('jobs')
          .delete()
          .in('id', orphanedJobIds);

        if (error) {
          console.error('[NarrativeGen] Error cleaning orphaned jobs:', error);
        } else {
          console.log(`[NarrativeGen] Cleaned ${orphanedJobIds.length} orphaned jobs`);
        }

        return { hadOrphans: true, cleanedJobs: orphanedJobIds.length };
      }

      return { hadOrphans: false, cleanedJobs: 0 };
    } catch (err) {
      console.error('[NarrativeGen] Integrity validation error:', err);
      return { hadOrphans: false, cleanedJobs: 0 };
    }
  }, [projectId]);

  // ============================================================================
  // Load Initial State
  // ============================================================================
  
  const loadInitialState = useCallback(async () => {
    try {
      // Step 0: Run integrity check and cleanup orphans FIRST
      const { hadOrphans, cleanedJobs } = await validateAndCleanupIntegrity();
      if (hadOrphans) {
        console.log(`[NarrativeGen] Auto-cleaned ${cleanedJobs} orphaned jobs on load`);
      }

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
        
        // Derive phase from actual intent statuses (key fix for stuck UI)
        const derivedPhase = derivePhaseFromIntents(intentsData);
        
        setProgress(prev => ({
          ...prev,
          totalScenes: intentsData.length,
          completedScenes: completed,
          phase: derivedPhase,
        }));
      }
    } catch (err) {
      console.error('[NarrativeGen] Error loading initial state:', err);
    } finally {
      // V72: Always mark as loaded (even on error) to unblock auto-start logic
      setIsLoaded(true);
    }
  }, [projectId, validateAndCleanupIntegrity]);

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

    // PROTECTION: Prevent multiple simultaneous generations
    if (isGeneratingRef.current) {
      toast.warning('Ya hay una generación en progreso');
      return;
    }
    
    // Check if there's an ongoing generation in the database
    const { data: existingIntents } = await supabase
      .from('scene_intent')
      .select('id, status')
      .eq('project_id', projectId)
      .in('status', ['pending', 'planning', 'writing', 'repairing'])
      .limit(1);
    
    if (existingIntents && existingIntents.length > 0) {
      toast.info('Hay una generación anterior. Puedes continuar o reiniciar.', {
        duration: 6000,
        action: {
          label: 'Continuar',
          onClick: () => continueGeneration(),
        },
      });
      // Load existing state - will derive the correct phase for UI
      await loadInitialState();
      return;
    }

    isGeneratingRef.current = true;
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

      // V71: Handle jobs_created as array of UUIDs
      const jobsCreated: string[] = Array.isArray(data.jobs_created) 
        ? data.jobs_created 
        : [];
      const scenesPlanned = data.scenes_planned || jobsCreated.length || 0;
      
      toast.success(`${scenesPlanned} escenas planificadas`);

      // Step 2: Trigger scene-worker for each pending scene_intent
      // The scene-worker will be triggered via jobs table
      // Frontend observes via Realtime subscriptions
      
      if (jobsCreated.length > 0) {
        toast.info(`Generando ${jobsCreated.length} escenas...`);
        
        // Process jobs sequentially to avoid overwhelming the backend
        for (const jobIdToProcess of jobsCreated) {
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[NarrativeGen] Aborted by user');
            break;
          }

          try {
            const { error: workerError } = await invokeAuthedFunction('scene-worker', {
              job_id: jobIdToProcess,
            });

            if (workerError) {
              console.error('[NarrativeGen] scene-worker error:', workerError);
            }
          } catch (err) {
            console.error('[NarrativeGen] Failed to invoke scene-worker:', err);
          }

          await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between jobs
        }
      } else if (scenesPlanned > 0) {
        // V71 Fallback: Jobs weren't created but scene_intents exist
        // Invoke scene-worker directly with sceneIntentId
        console.log('[NarrativeGen] No jobs returned, falling back to direct intent processing');
        
        const { data: pendingIntents } = await supabase
          .from('scene_intent')
          .select('id, scene_number, episode_number')
          .eq('project_id', projectId)
          .eq('status', 'pending')
          .order('scene_number', { ascending: true });
        
        if (pendingIntents && pendingIntents.length > 0) {
          toast.info(`Procesando ${pendingIntents.length} escenas directamente...`);
          
          for (const intent of pendingIntents) {
            if (abortControllerRef.current?.signal.aborted) {
              console.log('[NarrativeGen] Aborted by user');
              break;
            }

            // Update current scene in progress
            setProgress(prev => ({
              ...prev,
              currentScene: intent.scene_number,
              currentEpisode: intent.episode_number,
            }));

            try {
              console.log(`[NarrativeGen] Processing scene ${intent.scene_number}...`);
              
              const { error: workerError } = await invokeAuthedFunction('scene-worker', {
                sceneIntentId: intent.id,
                projectId,
                sceneNumber: intent.scene_number,
                episodeNumber: intent.episode_number,
              });

              if (workerError) {
                console.error('[NarrativeGen] scene-worker fallback error:', workerError);
                // Continue to next scene even if one fails
              }
              
              // Wait for the scene to be written (poll for status change)
              let attempts = 0;
              const maxAttempts = 60; // 60 seconds max per scene
              while (attempts < maxAttempts) {
                const { data: updatedIntent } = await supabase
                  .from('scene_intent')
                  .select('status')
                  .eq('id', intent.id)
                  .single();
                
                if (updatedIntent && ['written', 'validated', 'failed'].includes(updatedIntent.status)) {
                  console.log(`[NarrativeGen] Scene ${intent.scene_number} completed with status: ${updatedIntent.status}`);
                  
                  // Update completed count
                  if (updatedIntent.status === 'written' || updatedIntent.status === 'validated') {
                    setProgress(prev => ({
                      ...prev,
                      completedScenes: prev.completedScenes + 1,
                    }));
                  }
                  break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;
              }
              
              if (attempts >= maxAttempts) {
                console.warn(`[NarrativeGen] Scene ${intent.scene_number} timed out`);
              }
              
            } catch (err) {
              console.error('[NarrativeGen] Failed to invoke scene-worker (fallback):', err);
            }
            
            // Small delay before next scene
            await new Promise(resolve => setTimeout(resolve, 500));
          }
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
        
        // V73: Auto-compile script from scenes
        await compileFullScript();
        
        onComplete?.();
      }

    } catch (err: any) {
      console.error('[NarrativeGen] Generation error:', err);
      const errorMsg = err.message || 'Error desconocido';
      setProgress(prev => ({ ...prev, phase: 'failed', error: errorMsg }));
      toast.error('Error en generación', { description: errorMsg });
      onError?.(errorMsg);
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, [projectId, loadInitialState, compileFullScript, onComplete, onError]);

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
  // Continue Generation (Resume pending scenes)
  // ============================================================================
  
  const continueGeneration = useCallback(async () => {
    console.log('[NarrativeGen] continueGeneration called', { 
      isGenerating: isGeneratingRef.current,
      projectId 
    });
    
    if (isGeneratingRef.current) {
      toast.warning('Ya hay una generación en progreso');
      return;
    }

    // Find ALL non-finalized scene_intents (including 'writing' without scene_id)
    const { data: pendingIntents } = await supabase
      .from('scene_intent')
      .select('id, scene_number, episode_number, status, scene_id')
      .eq('project_id', projectId)
      .in('status', ['pending', 'planning', 'planned', 'writing', 'needs_repair', 'repairing'])
      .order('episode_number', { ascending: true })
      .order('scene_number', { ascending: true });
    
    if (!pendingIntents || pendingIntents.length === 0) {
      toast.info('No hay escenas pendientes');
      // Double-check and mark as completed if everything is done
      await loadInitialState();
      return;
    }

    isGeneratingRef.current = true;
    setIsGenerating(true);
    setProgress(prev => ({ ...prev, phase: 'generating', error: null }));
    abortControllerRef.current = new AbortController();

    toast.info(`Continuando generación: ${pendingIntents.length} escenas pendientes...`);

    try {
      for (const intent of pendingIntents) {
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[NarrativeGen] Aborted by user');
          break;
        }

        setProgress(prev => ({
          ...prev,
          currentScene: intent.scene_number,
          currentEpisode: intent.episode_number,
        }));

        try {
          // Skip 'writing' intents that already have a scene_id (likely already processed)
          if (intent.status === 'writing' && (intent as any).scene_id) {
            console.log(`[NarrativeGen] Scene ${intent.scene_number} already has scene_id, marking as written...`);
            // Attempt to mark as written directly (scene-worker already wrote it)
            await supabase
              .from('scene_intent')
              .update({ status: 'written' })
              .eq('id', intent.id);
            setProgress(prev => ({ ...prev, completedScenes: prev.completedScenes + 1 }));
            continue;
          }
          
          console.log(`[NarrativeGen] Continuing scene ${intent.scene_number} (status: ${intent.status})...`);
          
          const { error: workerError } = await invokeAuthedFunction('scene-worker', {
            sceneIntentId: intent.id,
            projectId,
            sceneNumber: intent.scene_number,
            episodeNumber: intent.episode_number,
          });

          if (workerError) {
            console.error('[NarrativeGen] scene-worker error:', workerError);
          }
          
          // Wait for completion
          let attempts = 0;
          const maxAttempts = 60;
          while (attempts < maxAttempts) {
            const { data: updatedIntent } = await supabase
              .from('scene_intent')
              .select('status')
              .eq('id', intent.id)
              .single();
            
            if (updatedIntent && ['written', 'validated', 'failed'].includes(updatedIntent.status)) {
              console.log(`[NarrativeGen] Scene ${intent.scene_number} completed: ${updatedIntent.status}`);
              
              if (updatedIntent.status === 'written' || updatedIntent.status === 'validated') {
                setProgress(prev => ({
                  ...prev,
                  completedScenes: prev.completedScenes + 1,
                }));
              }
              break;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
          }
          
        } catch (err) {
          console.error('[NarrativeGen] Failed to process scene:', err);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Check final state
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
        
        // V73: Auto-compile script from scenes
        await compileFullScript();
        
        onComplete?.();
      }

    } catch (err: any) {
      console.error('[NarrativeGen] Continue generation error:', err);
      const errorMsg = err.message || 'Error desconocido';
      setProgress(prev => ({ ...prev, phase: 'failed', error: errorMsg }));
      toast.error('Error al continuar generación', { description: errorMsg });
      onError?.(errorMsg);
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  }, [projectId, loadInitialState, compileFullScript, onComplete, onError]);


  // ============================================================================
  // Reset State
  // ============================================================================
  
  const resetNarrativeState = useCallback(async () => {
    // V72: Reset isLoaded so auto-start can re-trigger after reset
    setIsLoaded(false);
    try {
      // 1. Delete orphaned jobs first (prevent future issues)
      await supabase
        .from('jobs')
        .delete()
        .eq('project_id', projectId)
        .eq('type', 'scene_generation')
        .in('status', ['queued', 'running', 'blocked']);

      // 2. Delete scene_repairs
      await supabase
        .from('scene_repairs')
        .delete()
        .eq('project_id', projectId);

      // 3. Delete scene_intents
      await supabase
        .from('scene_intent')
        .delete()
        .eq('project_id', projectId);

      // 4. Delete narrative_state
      await supabase
        .from('narrative_state')
        .delete()
        .eq('project_id', projectId);

      setNarrativeState(null);
      setSceneIntents([]);
      setSceneRepairs([]);
      setProgress({
        totalScenes: 0,
        completedScenes: 0,
        validatedScenes: 0,
        repairingScenes: 0,
        failedScenes: 0,
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
    isLoaded, // V72: Exposed for auto-start race condition fix
    
    // Actions
    startGeneration,
    continueGeneration,
    cancelGeneration,
    resetNarrativeState,
    refreshState: loadInitialState,
    compileFullScript, // V73: Manual compilation trigger
  };
}
