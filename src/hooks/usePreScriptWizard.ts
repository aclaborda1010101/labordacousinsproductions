/**
 * usePreScriptWizard - Hook for managing the 4-step pre-script wizard
 * 
 * Steps:
 * 1. Enrich Outline + Materialize Entities ("Carne Operativa")
 * 2. Generate Threads (automatic)
 * 3. Showrunner Decisions (editorial + visual context)
 * 4. Approve and Generate Script
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { toast } from 'sonner';

export type WizardStep = 'enrich' | 'threads' | 'showrunner' | 'approve';

export interface StepState {
  status: 'pending' | 'running' | 'done' | 'error';
  result?: any;
  error?: string;
}

export interface WizardState {
  currentStep: WizardStep;
  steps: Record<WizardStep, StepState>;
  enrichedOutline: any | null;
  characters: any[];
  locations: any[];
  threads: any[];
  showrunnerDecisions: any | null;
}

const initialStepState: StepState = { status: 'pending' };

const initialState: WizardState = {
  currentStep: 'enrich',
  steps: {
    enrich: { ...initialStepState },
    threads: { ...initialStepState },
    showrunner: { ...initialStepState },
    approve: { ...initialStepState },
  },
  enrichedOutline: null,
  characters: [],
  locations: [],
  threads: [],
  showrunnerDecisions: null,
};

export interface UsePreScriptWizardOptions {
  projectId: string;
  outline: any;
  onComplete: () => void;
}

export function usePreScriptWizard({ projectId, outline, onComplete }: UsePreScriptWizardOptions) {
  const [state, setState] = useState<WizardState>(initialState);
  const [isProcessing, setIsProcessing] = useState(false);

  const updateStep = useCallback((step: WizardStep, update: Partial<StepState>) => {
    setState(prev => ({
      ...prev,
      steps: {
        ...prev.steps,
        [step]: { ...prev.steps[step], ...update },
      },
    }));
  }, []);

  const goToStep = useCallback((step: WizardStep) => {
    setState(prev => ({ ...prev, currentStep: step }));
  }, []);

  // ============================================================================
  // Step 1: Enrich Outline + Materialize Entities
  // ============================================================================
  const executeStep1 = useCallback(async () => {
    setIsProcessing(true);
    updateStep('enrich', { status: 'running' });

    try {
      // Step 1a: Enrich outline if not already enriched
      const isEnriched = outline?.enriched || outline?.characters?.length > 0;
      
      if (!isEnriched) {
        console.log('[PreScriptWizard] Enriching outline...');
        const { data: enrichData, error: enrichError } = await invokeAuthedFunction('outline-enrich', {
          project_id: projectId,
          outline_id: outline?.id,
        });

        if (enrichError) {
          throw new Error(`Error enriqueciendo outline: ${enrichError.message || enrichError}`);
        }

        setState(prev => ({ ...prev, enrichedOutline: enrichData?.outline || outline }));
      } else {
        setState(prev => ({ ...prev, enrichedOutline: outline }));
      }

      // Step 1b: Materialize entities
      console.log('[PreScriptWizard] Materializing entities...');
      const { data: materializeData, error: materializeError } = await invokeAuthedFunction('materialize-entities', {
        projectId: projectId,
        source: 'outline',
      });

      if (materializeError) {
        console.warn('[PreScriptWizard] Materialize warning:', materializeError);
        // Continue anyway - entities might already exist
      }

      // Fetch created entities from database
      const [{ data: chars }, { data: locs }] = await Promise.all([
        supabase.from('characters').select('id, name, role, bio').eq('project_id', projectId).limit(20),
        supabase.from('locations').select('id, name, description').eq('project_id', projectId).limit(20),
      ]);

      setState(prev => ({
        ...prev,
        characters: chars || [],
        locations: locs || [],
      }));

      updateStep('enrich', { 
        status: 'done', 
        result: { 
          characters: chars?.length || 0, 
          locations: locs?.length || 0,
          enriched: true,
        } 
      });

      toast.success(`Paso 1 completado: ${chars?.length || 0} personajes, ${locs?.length || 0} locaciones`);

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 1 error:', err);
      updateStep('enrich', { status: 'error', error: err.message });
      toast.error('Error en paso 1', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, outline, updateStep]);

  // ============================================================================
  // Step 2: Generate Threads (Automatic)
  // ============================================================================
  const executeStep2 = useCallback(async () => {
    setIsProcessing(true);
    updateStep('threads', { status: 'running' });

    try {
      // Extract threads from enriched outline or generate them
      const enrichedOutline = state.enrichedOutline || outline;
      
      // Threads might already exist in the outline
      let threads = enrichedOutline?.threads || 
                    enrichedOutline?.narrative_threads || 
                    enrichedOutline?.active_threads || [];

      // If no threads, extract from episode beats
      if (threads.length === 0 && enrichedOutline?.episode_beats) {
        const episodeBeats = enrichedOutline.episode_beats;
        
        // Create threads from turning points and character arcs
        const extractedThreads: any[] = [];
        
        episodeBeats.forEach((ep: any, idx: number) => {
          if (ep.turning_point) {
            extractedThreads.push({
              id: `thread-tp-${idx}`,
              name: `Giro Ep${idx + 1}`,
              type: 'plot',
              description: ep.turning_point,
              episodes: [idx + 1],
            });
          }
          if (ep.emotional_arc) {
            extractedThreads.push({
              id: `thread-arc-${idx}`,
              name: `Arco Emocional Ep${idx + 1}`,
              type: 'emotional',
              description: ep.emotional_arc,
              episodes: [idx + 1],
            });
          }
        });

        threads = extractedThreads;
      }

      // Also check narrative_state for existing threads
      const { data: narrativeState } = await supabase
        .from('narrative_state')
        .select('active_threads, open_threads')
        .eq('project_id', projectId)
        .maybeSingle();

      if (narrativeState?.active_threads && Array.isArray(narrativeState.active_threads) && narrativeState.active_threads.length > 0) {
        threads = [...threads, ...(narrativeState.active_threads as any[])];
      }

      // Deduplicate by name
      const uniqueThreads = threads.filter((t: any, i: number, arr: any[]) => 
        arr.findIndex((x: any) => x.name === t.name || x.description === t.description) === i
      );

      setState(prev => ({ ...prev, threads: uniqueThreads }));

      updateStep('threads', { 
        status: 'done', 
        result: { count: uniqueThreads.length, threads: uniqueThreads } 
      });

      toast.success(`Paso 2 completado: ${uniqueThreads.length} hilos narrativos`);

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 2 error:', err);
      updateStep('threads', { status: 'error', error: err.message });
      toast.error('Error en paso 2', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, outline, state.enrichedOutline, updateStep]);

  // ============================================================================
  // Step 3: Showrunner Decisions
  // ============================================================================
  const executeStep3 = useCallback(async () => {
    setIsProcessing(true);
    updateStep('showrunner', { status: 'running' });

    try {
      console.log('[PreScriptWizard] Generating showrunner decisions...');
      
      const { data: showrunnerData, error: showrunnerError } = await invokeAuthedFunction('showrunner-decide', {
        projectId,
        outline: state.enrichedOutline || outline,
        characters: state.characters,
        locations: state.locations,
        threads: state.threads,
        mode: 'pre_script', // Indicates this is the initial setup
      });

      if (showrunnerError) {
        throw new Error(`Error en showrunner: ${showrunnerError.message || showrunnerError}`);
      }

      const decisions = showrunnerData?.decisions || showrunnerData || {
        visual_style: 'Cinematográfico realista',
        tone: 'Drama íntimo con momentos de tensión',
        pacing: 'Moderado con builds graduales',
        restrictions: [],
        approved: true,
      };

      setState(prev => ({ ...prev, showrunnerDecisions: decisions }));

      updateStep('showrunner', { 
        status: 'done', 
        result: decisions 
      });

      toast.success('Paso 3 completado: Decisiones del Showrunner establecidas');

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 3 error:', err);
      // Don't block on showrunner error - use defaults
      const defaultDecisions = {
        visual_style: 'Cinematográfico',
        tone: 'Drama',
        pacing: 'Estándar',
        restrictions: [],
        approved: true,
        error: err.message,
      };
      
      setState(prev => ({ ...prev, showrunnerDecisions: defaultDecisions }));
      updateStep('showrunner', { status: 'done', result: defaultDecisions });
      toast.warning('Showrunner usó valores por defecto', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, outline, state.enrichedOutline, state.characters, state.locations, state.threads, updateStep]);

  // ============================================================================
  // Step 4: Approve and Trigger Generation
  // ============================================================================
  const executeStep4 = useCallback(async () => {
    setIsProcessing(true);
    updateStep('approve', { status: 'running' });

    try {
      // Save showrunner decisions to narrative_state or project
      // First check if narrative_state exists
      const { data: existingState } = await supabase
        .from('narrative_state')
        .select('id')
        .eq('project_id', projectId)
        .maybeSingle();
      
      if (existingState) {
        // Update existing
        const { error: saveError } = await supabase
          .from('narrative_state')
          .update({
            current_phase: 'ready_to_generate',
            active_threads: state.threads as any,
            locked_facts: (state.showrunnerDecisions?.restrictions || []) as any,
            updated_at: new Date().toISOString(),
          })
          .eq('project_id', projectId);

        if (saveError) {
          console.warn('[PreScriptWizard] Error updating state:', saveError);
        }
      }
      // If no narrative_state exists, it will be created during generation

      updateStep('approve', { status: 'done' });
      toast.success('¡Preparación completada! Iniciando generación de guion...');
      
      // Trigger the actual script generation
      onComplete();

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 4 error:', err);
      updateStep('approve', { status: 'error', error: err.message });
      toast.error('Error al aprobar', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, state.threads, state.showrunnerDecisions, updateStep, onComplete]);

  // ============================================================================
  // Navigation
  // ============================================================================
  const stepOrder: WizardStep[] = ['enrich', 'threads', 'showrunner', 'approve'];

  const canGoNext = useCallback(() => {
    const currentIdx = stepOrder.indexOf(state.currentStep);
    const currentStepState = state.steps[state.currentStep];
    return currentStepState.status === 'done' && currentIdx < stepOrder.length - 1;
  }, [state.currentStep, state.steps]);

  const canGoPrev = useCallback(() => {
    return stepOrder.indexOf(state.currentStep) > 0;
  }, [state.currentStep]);

  const goNext = useCallback(() => {
    const currentIdx = stepOrder.indexOf(state.currentStep);
    if (currentIdx < stepOrder.length - 1) {
      goToStep(stepOrder[currentIdx + 1]);
    }
  }, [state.currentStep, goToStep]);

  const goPrev = useCallback(() => {
    const currentIdx = stepOrder.indexOf(state.currentStep);
    if (currentIdx > 0) {
      goToStep(stepOrder[currentIdx - 1]);
    }
  }, [state.currentStep, goToStep]);

  const executeCurrentStep = useCallback(async () => {
    switch (state.currentStep) {
      case 'enrich':
        await executeStep1();
        break;
      case 'threads':
        await executeStep2();
        break;
      case 'showrunner':
        await executeStep3();
        break;
      case 'approve':
        await executeStep4();
        break;
    }
  }, [state.currentStep, executeStep1, executeStep2, executeStep3, executeStep4]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    isProcessing,
    currentStep: state.currentStep,
    currentStepState: state.steps[state.currentStep],
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    goToStep,
    executeCurrentStep,
    reset,
    // Exposed data for UI
    characters: state.characters,
    locations: state.locations,
    threads: state.threads,
    showrunnerDecisions: state.showrunnerDecisions,
  };
}
