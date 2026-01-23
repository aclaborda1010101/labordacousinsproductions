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

// Helper functions for deriving editorial context from outline
function deriveVisualStyle(genre: string, tone: string): string {
  const genreLower = genre?.toLowerCase() || '';
  if (genreLower.includes('comedy') || genreLower.includes('comedia')) {
    return 'Cinematográfico dinámico con encuadres expresivos';
  }
  if (genreLower.includes('drama')) {
    return 'Cinematográfico íntimo con iluminación naturalista';
  }
  if (genreLower.includes('thriller') || genreLower.includes('suspense')) {
    return 'Cinematográfico tenso con claroscuros marcados';
  }
  if (genreLower.includes('horror') || genreLower.includes('terror')) {
    return 'Cinematográfico atmosférico con sombras pronunciadas';
  }
  return `Cinematográfico ${tone || 'estándar'}`;
}

function derivePacing(outline: any): string {
  const beatCount = outline?.ACT_I?.beats?.length || 0;
  const actCount = outline?.acts?.length || 3;
  
  if (beatCount > 10) {
    return 'Ritmo ágil con escenas cortas';
  }
  if (beatCount < 5) {
    return 'Ritmo pausado con escenas contemplativas';
  }
  return 'Ritmo moderado con builds graduales';
}
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
      console.log('[PreScriptWizard] Step 2 - Extracting threads from outline:', enrichedOutline);
      
      // Threads might already exist in the outline
      let threads = enrichedOutline?.threads || 
                    enrichedOutline?.narrative_threads || 
                    enrichedOutline?.active_threads || [];

      const extractedThreads: any[] = [];

      // Extract from episode beats (series format)
      if (threads.length === 0 && enrichedOutline?.episode_beats) {
        const episodeBeats = enrichedOutline.episode_beats;
        
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
      }

      // Extract from ACT structure (film format)
      const acts = ['ACT_I', 'ACT_II', 'ACT_III'];
      const uniqueAgents = new Set<string>();
      
      acts.forEach((actKey, actIdx) => {
        const act = enrichedOutline?.[actKey];
        if (act) {
          // Extract from scenes/beats within acts
          const scenes = act.scenes || act.beats || [];
          scenes.forEach((scene: any, sceneIdx: number) => {
            // Extract beat events as plot threads
            if (scene.event || scene.conflict || scene.dramatic_question) {
              extractedThreads.push({
                id: `thread-${actKey}-beat-${sceneIdx}`,
                name: scene.agent || scene.title || `Beat ${actIdx + 1}.${scene.beat_number || sceneIdx + 1}`,
                type: 'plot',
                description: scene.event || scene.conflict || scene.dramatic_question || scene.consequence || '',
                act: actIdx + 1,
              });
            }
            
            // Collect unique agents/characters for character threads
            if (scene.agent && typeof scene.agent === 'string') {
              scene.agent.split(',').forEach((a: string) => uniqueAgents.add(a.trim()));
            }
          });
          
          // Extract act-level turning points/climax
          if (act.turning_point || act.climax) {
            extractedThreads.push({
              id: `thread-act${actIdx + 1}-climax`,
              name: `Clímax Acto ${actIdx + 1}`,
              type: 'structural',
              description: act.turning_point || act.climax,
              act: actIdx + 1,
            });
          }
          
          // Extract act resolution
          if (act.resolution) {
            extractedThreads.push({
              id: `thread-act${actIdx + 1}-resolution`,
              name: `Resolución Acto ${actIdx + 1}`,
              type: 'structural',
              description: act.resolution,
              act: actIdx + 1,
            });
          }
        }
      });
      
      // Create character threads from collected agents
      Array.from(uniqueAgents).forEach((agent, idx) => {
        extractedThreads.push({
          id: `thread-agent-${idx}`,
          name: agent,
          type: 'character',
          description: `Hilo de personaje: ${agent}`,
        });
      });

      // Extract from character arcs
      const characterArcs = enrichedOutline?.character_arcs || enrichedOutline?.arcos_personajes || [];
      characterArcs.forEach((arc: any, idx: number) => {
        extractedThreads.push({
          id: `thread-arc-char-${idx}`,
          name: arc.character || arc.nombre || `Arco Personaje ${idx + 1}`,
          type: 'character',
          description: arc.arc || arc.transformation || arc.descripcion || '',
        });
      });

      // Extract from themes/thematic_threads
      const themes = enrichedOutline?.themes || enrichedOutline?.thematic_threads || [];
      themes.forEach((theme: any, idx: number) => {
        const themeName = typeof theme === 'string' ? theme : (theme.name || theme.tema);
        const themeDesc = typeof theme === 'string' ? theme : (theme.description || theme.descripcion || '');
        extractedThreads.push({
          id: `thread-theme-${idx}`,
          name: themeName,
          type: 'thematic',
          description: themeDesc,
        });
      });

      // Extract main conflict as primary thread
      if (enrichedOutline?.central_conflict || enrichedOutline?.conflicto_central) {
        extractedThreads.unshift({
          id: 'thread-main-conflict',
          name: 'Conflicto Central',
          type: 'main',
          description: enrichedOutline.central_conflict || enrichedOutline.conflicto_central,
        });
      }

      // Use extracted if we found any
      if (extractedThreads.length > 0) {
        threads = extractedThreads;
      }

      // Fallback: create basic threads from synopsis/logline
      if (threads.length === 0) {
        threads = [{
          id: 'thread-main',
          name: 'Trama Principal',
          type: 'main',
          description: enrichedOutline?.logline || enrichedOutline?.synopsis || 'Hilo narrativo principal',
        }];
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
      console.log('[PreScriptWizard] Extracting editorial context from outline...');
      
      // Extract editorial decisions from outline instead of calling per-scene showrunner
      const currentOutline = state.enrichedOutline || outline;
      
      // Derive visual style from genre/tone
      const genre = currentOutline?.genre || 'drama';
      const tone = currentOutline?.tone || 'Cinematográfico';
      
      // Build editorial context from outline structure
      const decisions = {
        visual_style: deriveVisualStyle(genre, tone),
        tone: tone,
        pacing: derivePacing(currentOutline),
        genre: genre,
        act_structure: currentOutline?.acts || [],
        character_count: state.characters?.length || 0,
        location_count: state.locations?.length || 0,
        thread_count: state.threads?.length || 0,
        restrictions: [],
        approved: true,
        source: 'outline_derived',
      };

      setState(prev => ({ ...prev, showrunnerDecisions: decisions }));

      updateStep('showrunner', { 
        status: 'done', 
        result: decisions 
      });

      toast.success('Paso 3 completado: Contexto editorial establecido');

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
