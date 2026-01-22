/**
 * useActiveGeneration - Derives active script generation state from DB
 * 
 * This hook does NOT store state locally - it reconstructs it from:
 * 1. narrative_state.current_phase
 * 2. scene_intent with active statuses (pending, writing, repairing)
 * 3. scene_repairs with active statuses
 * 
 * This makes it impossible to desync.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveGeneration {
  type: 'script';
  projectId: string;
  phase: 'planning' | 'writing' | 'validating' | 'repairing' | 'completed' | 'idle';
  phaseLabel: string;
  progress: number;
  totalScenes: number;
  completedScenes: number;
  currentScene?: string;
  startedAt?: string;
}

interface SceneIntent {
  id: string;
  scene_number: number;
  status: string;
  intent_summary?: string;
}

interface SceneRepair {
  id: string;
  status: string;
}

interface NarrativeState {
  current_phase: string;
  created_at: string;
}

// Map internal phases to human-readable Spanish labels
const PHASE_LABELS: Record<string, string> = {
  idle: 'Listo para generar',
  planning: 'Planificando escenas...',
  writing: 'Escribiendo guion...',
  validating: 'Verificando calidad...',
  repairing: 'Mejorando escenas...',
  completed: '¡Generación completada!',
};

export function useActiveGeneration(projectId: string | undefined): ActiveGeneration | null {
  const [activeGeneration, setActiveGeneration] = useState<ActiveGeneration | null>(null);

  const deriveState = useCallback(async () => {
    if (!projectId) {
      setActiveGeneration(null);
      return;
    }

    try {
      // Fetch all data sources in parallel
      const [intentResult, repairResult, stateResult, scenesResult] = await Promise.all([
        supabase
          .from('scene_intent')
          .select('id, scene_number, status, intent_summary')
          .eq('project_id', projectId)
          .order('scene_number', { ascending: true }),
        supabase
          .from('scene_repairs')
          .select('id, status')
          .eq('project_id', projectId),
        supabase
          .from('narrative_state')
          .select('current_phase, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('scenes')
          .select('id')
          .eq('project_id', projectId),
      ]);

      const intents: SceneIntent[] = (intentResult.data as any[]) || [];
      const repairs: SceneRepair[] = (repairResult.data as any[]) || [];
      const narrativeState: NarrativeState | null = (stateResult.data as any[])?.[0] || null;
      const completedScenes = scenesResult.data?.length || 0;

      // Active statuses for scene_intent
      const activeIntentStatuses = ['pending', 'planning', 'planned', 'writing', 'needs_repair', 'repairing'];
      const activeIntents = intents.filter(i => activeIntentStatuses.includes(i.status));
      
      // Active statuses for scene_repairs
      const activeRepairStatuses = ['pending', 'repairing'];
      const activeRepairs = repairs.filter(r => activeRepairStatuses.includes(r.status));

      // If no active intents and no narrative state, no generation
      if (activeIntents.length === 0 && !narrativeState) {
        setActiveGeneration(null);
        return;
      }

      // Derive phase
      let phase: ActiveGeneration['phase'] = 'idle';
      
      if (activeRepairs.length > 0) {
        phase = 'repairing';
      } else if (activeIntents.some(i => i.status === 'writing')) {
        phase = 'writing';
      } else if (activeIntents.some(i => ['pending', 'planning', 'planned'].includes(i.status))) {
        phase = 'planning';
      } else if (narrativeState?.current_phase === 'validating') {
        phase = 'validating';
      } else if (activeIntents.length === 0 && completedScenes > 0) {
        phase = 'completed';
      }

      // If all scenes are written/validated, it's completed
      const allCompleted = intents.length > 0 && intents.every(i => 
        ['written', 'validated'].includes(i.status)
      );
      if (allCompleted) {
        phase = 'completed';
      }

      // If phase is idle/completed and no active work, return null (no active generation)
      if (phase === 'idle' || (phase === 'completed' && activeIntents.length === 0)) {
        // Only return active generation if there's actual work happening
        if (intents.length === 0 || allCompleted) {
          setActiveGeneration(null);
          return;
        }
      }

      // Find current scene being worked on
      const currentIntent = intents.find(i => 
        ['writing', 'repairing', 'needs_repair'].includes(i.status)
      );

      // Calculate progress
      const totalScenes = intents.length || 0;
      const writtenScenes = intents.filter(i => 
        ['written', 'validated'].includes(i.status)
      ).length;
      const progress = totalScenes > 0 
        ? Math.round((writtenScenes / totalScenes) * 100) 
        : 0;

      setActiveGeneration({
        type: 'script',
        projectId,
        phase,
        phaseLabel: PHASE_LABELS[phase] || phase,
        progress,
        totalScenes,
        completedScenes: writtenScenes,
        currentScene: currentIntent?.intent_summary || `Escena ${currentIntent?.scene_number}`,
        startedAt: narrativeState?.created_at,
      });

    } catch (error) {
      console.error('[useActiveGeneration] Error deriving state:', error);
      setActiveGeneration(null);
    }
  }, [projectId]);

  // Initial load
  useEffect(() => {
    deriveState();
  }, [deriveState]);

  // Set up Realtime subscriptions
  useEffect(() => {
    if (!projectId) return;

    // Subscribe to changes in scene_intent, scene_repairs, and narrative_state
    const channel = supabase
      .channel(`active-gen-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scene_intent',
          filter: `project_id=eq.${projectId}`,
        },
        () => deriveState()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scene_repairs',
          filter: `project_id=eq.${projectId}`,
        },
        () => deriveState()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'narrative_state',
          filter: `project_id=eq.${projectId}`,
        },
        () => deriveState()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scenes',
          filter: `project_id=eq.${projectId}`,
        },
        () => deriveState()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, deriveState]);

  return activeGeneration;
}

export default useActiveGeneration;
