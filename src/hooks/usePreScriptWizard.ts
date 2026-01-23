/**
 * usePreScriptWizard - Hook for managing the 5-step pre-script wizard (V77)
 * 
 * Steps:
 * 1. Enrich Outline + Materialize Entities ("Carne Operativa")
 * 2. Generate Threads (automatic)
 * 3. Showrunner Decisions (editorial + visual context)
 * 4. Approve and Confirm
 * 5. Generate Script (integrated narrative system)
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeAuthedFunction } from '@/lib/invokeAuthedFunction';
import { toast } from 'sonner';
import { compileScriptFromScenes } from '@/lib/compileScriptFromScenes';

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

// V77: 5-step wizard (added 'generate')
export type WizardStep = 'enrich' | 'threads' | 'showrunner' | 'approve' | 'generate';

export interface StepState {
  status: 'pending' | 'running' | 'done' | 'error';
  result?: any;
  error?: string;
}

// V77: Generation progress for step 5
export interface GenerationProgress {
  totalScenes: number;
  completedScenes: number;
  currentScene: number | null;
  phase: 'idle' | 'planning' | 'generating' | 'completed' | 'failed';
}

export interface SceneIntent {
  id: string;
  scene_number: number;
  episode_number: number;
  intent_summary: string;
  status: string;
}

export interface WizardState {
  currentStep: WizardStep;
  steps: Record<WizardStep, StepState>;
  enrichedOutline: any | null;
  characters: any[];
  locations: any[];
  threads: any[];
  showrunnerDecisions: any | null;
  // V77: Generation state
  generationProgress: GenerationProgress;
  sceneIntents: SceneIntent[];
}

const initialStepState: StepState = { status: 'pending' };

const initialState: WizardState = {
  currentStep: 'enrich',
  steps: {
    enrich: { ...initialStepState },
    threads: { ...initialStepState },
    showrunner: { ...initialStepState },
    approve: { ...initialStepState },
    generate: { ...initialStepState }, // V77: New step
  },
  enrichedOutline: null,
  characters: [],
  locations: [],
  threads: [],
  showrunnerDecisions: null,
  // V77: Initial generation state
  generationProgress: {
    totalScenes: 0,
    completedScenes: 0,
    currentScene: null,
    phase: 'idle',
  },
  sceneIntents: [],
};

export interface UsePreScriptWizardOptions {
  projectId: string;
  outline: any;
  onComplete: () => void;
  // V77: New callback for script compilation
  onScriptCompiled?: (scriptData: any) => void;
  // V77: Generation params
  language?: string;
  qualityTier?: string;
  format?: 'film' | 'series' | 'ad';
}

export function usePreScriptWizard({ 
  projectId, 
  outline, 
  onComplete,
  onScriptCompiled,
  language = 'es-ES',
  qualityTier = 'profesional',
  format = 'series',
}: UsePreScriptWizardOptions) {
  const [state, setState] = useState<WizardState>(initialState);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // V77: Refs for generation control
  const abortControllerRef = useRef<AbortController | null>(null);
  const isGeneratingRef = useRef(false);
  
  // V76: Load wizard state from project_outlines on mount
  useEffect(() => {
    const loadWizardState = async () => {
      if (!projectId) {
        setIsLoading(false);
        return;
      }
      
      try {
        // Check if wizard was already completed or in progress
        const [{ data: chars }, { data: locs }, { data: narrativeState }, { data: sceneIntents }] = await Promise.all([
          supabase.from('characters').select('id, name, role, bio').eq('project_id', projectId).limit(20),
          supabase.from('locations').select('id, name, description').eq('project_id', projectId).limit(20),
          supabase.from('narrative_state').select('id, current_phase, active_threads').eq('project_id', projectId).maybeSingle(),
          supabase.from('scene_intent').select('id, scene_number, episode_number, intent_summary, status').eq('project_id', projectId).order('scene_number'),
        ]);
        
        const hasCharacters = (chars?.length || 0) > 0;
        const hasLocations = (locs?.length || 0) > 0;
        const hasNarrativeState = !!narrativeState;
        const isReadyToGenerate = narrativeState?.current_phase === 'ready_to_generate';
        const hasSceneIntents = (sceneIntents?.length || 0) > 0;
        
        // V77: Check if generation is in progress or completed
        const completedIntents = sceneIntents?.filter(i => i.status === 'written' || i.status === 'validated') || [];
        const pendingIntents = sceneIntents?.filter(i => ['pending', 'planning', 'writing'].includes(i.status)) || [];
        const isGenerationInProgress = pendingIntents.length > 0;
        const isGenerationCompleted = hasSceneIntents && pendingIntents.length === 0 && completedIntents.length > 0;
        
        console.log('[PreScriptWizard] V77: Loading state', {
          hasCharacters, hasLocations, hasNarrativeState, isReadyToGenerate,
          hasSceneIntents, isGenerationInProgress, isGenerationCompleted
        });
        
        // V77: Determine which step we're at based on database state
        if (isGenerationCompleted) {
          // All scenes done - mark wizard as complete
          setState(prev => ({
            ...prev,
            currentStep: 'generate',
            steps: {
              enrich: { status: 'done' },
              threads: { status: 'done' },
              showrunner: { status: 'done' },
              approve: { status: 'done' },
              generate: { status: 'done', result: { scenesCompleted: completedIntents.length } },
            },
            characters: chars || [],
            locations: locs || [],
            threads: (narrativeState?.active_threads as any[]) || [],
            enrichedOutline: outline,
            sceneIntents: sceneIntents || [],
            generationProgress: {
              totalScenes: sceneIntents?.length || 0,
              completedScenes: completedIntents.length,
              currentScene: null,
              phase: 'completed',
            },
          }));
          // Auto-trigger compilation and complete
          setTimeout(async () => {
            try {
              const result = await compileScriptFromScenes({ projectId });
              if (result.success) {
                onScriptCompiled?.({ scriptId: result.scriptId, scenesCompiled: result.scenesCompiled });
              }
              onComplete();
            } catch (e) {
              console.error('[PreScriptWizard] Auto-compile error:', e);
              onComplete();
            }
          }, 100);
        } else if (isGenerationInProgress) {
          // Generation started but not finished - resume at step 5
          setState(prev => ({
            ...prev,
            currentStep: 'generate',
            steps: {
              enrich: { status: 'done' },
              threads: { status: 'done' },
              showrunner: { status: 'done' },
              approve: { status: 'done' },
              generate: { status: 'running' },
            },
            characters: chars || [],
            locations: locs || [],
            threads: (narrativeState?.active_threads as any[]) || [],
            enrichedOutline: outline,
            sceneIntents: sceneIntents || [],
            generationProgress: {
              totalScenes: sceneIntents?.length || 0,
              completedScenes: completedIntents.length,
              currentScene: pendingIntents[0]?.scene_number || null,
              phase: 'generating',
            },
          }));
        } else if (isReadyToGenerate) {
          // Wizard steps 1-4 done, ready for step 5
          setState(prev => ({
            ...prev,
            currentStep: 'generate',
            steps: {
              enrich: { status: 'done' },
              threads: { status: 'done' },
              showrunner: { status: 'done' },
              approve: { status: 'done' },
              generate: { status: 'pending' },
            },
            characters: chars || [],
            locations: locs || [],
            threads: (narrativeState?.active_threads as any[]) || [],
            enrichedOutline: outline,
          }));
        } else if (hasCharacters && hasLocations) {
          // Step 1 was completed - resume from step 2
          setState(prev => ({
            ...prev,
            currentStep: 'threads',
            steps: {
              ...prev.steps,
              enrich: { status: 'done', result: { characters: chars?.length, locations: locs?.length } },
            },
            characters: chars || [],
            locations: locs || [],
            enrichedOutline: outline,
          }));
        }
        // Otherwise start from beginning
        
      } catch (err) {
        console.error('[PreScriptWizard] V77: Error loading state:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadWizardState();
  }, [projectId]);

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
  // Step 4: Approve and Mark Ready for Generation
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
      toast.success('¡Preparación completada! Listo para generar.');

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 4 error:', err);
      updateStep('approve', { status: 'error', error: err.message });
      toast.error('Error al aprobar', { description: err.message });
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, state.threads, state.showrunnerDecisions, updateStep]);

  // ============================================================================
  // Step 5: Generate Script (V77 - Integrated Narrative System)
  // ============================================================================
  const executeStep5 = useCallback(async () => {
    if (isGeneratingRef.current) {
      toast.warning('Ya hay una generación en progreso');
      return;
    }
    
    setIsProcessing(true);
    isGeneratingRef.current = true;
    updateStep('generate', { status: 'running' });
    abortControllerRef.current = new AbortController();

    setState(prev => ({
      ...prev,
      generationProgress: {
        ...prev.generationProgress,
        phase: 'planning',
      },
    }));

    try {
      const currentOutline = state.enrichedOutline || outline;
      
      // Step 5a: Call narrative-decide to plan scenes
      console.log('[PreScriptWizard] Step 5: Planning scenes...');
      toast.info('Planificando escenas...');
      
      const { data, error } = await invokeAuthedFunction('narrative-decide', {
        projectId,
        outline: currentOutline,
        episodeNumber: 1,
        language,
        qualityTier,
        format,
      });

      if (error) {
        throw new Error(error.message || 'Error en narrative-decide');
      }

      console.log('[PreScriptWizard] narrative-decide result:', data);

      const jobsCreated: string[] = Array.isArray(data.jobs_created) ? data.jobs_created : [];
      const scenesPlanned = data.scenes_planned || jobsCreated.length || 0;
      
      toast.success(`${scenesPlanned} escenas planificadas`);

      setState(prev => ({
        ...prev,
        generationProgress: {
          totalScenes: scenesPlanned,
          completedScenes: 0,
          currentScene: 1,
          phase: 'generating',
        },
      }));

      // Step 5b: Process jobs or intents
      if (jobsCreated.length > 0) {
        toast.info(`Generando ${jobsCreated.length} escenas...`);
        
        for (let i = 0; i < jobsCreated.length; i++) {
          const jobIdToProcess = jobsCreated[i];
          
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[PreScriptWizard] Aborted by user');
            break;
          }

          setState(prev => ({
            ...prev,
            generationProgress: {
              ...prev.generationProgress,
              currentScene: i + 1,
            },
          }));

          try {
            const { error: workerError } = await invokeAuthedFunction('scene-worker', {
              job_id: jobIdToProcess,
            });

            if (workerError) {
              console.error('[PreScriptWizard] scene-worker error:', workerError);
            }
          } catch (err) {
            console.error('[PreScriptWizard] Failed to invoke scene-worker:', err);
          }

          // Wait for scene completion
          await waitForSceneCompletion(i);
          
          setState(prev => ({
            ...prev,
            generationProgress: {
              ...prev.generationProgress,
              completedScenes: i + 1,
            },
          }));

          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } else if (scenesPlanned > 0) {
        // Fallback: process intents directly
        const { data: pendingIntents } = await supabase
          .from('scene_intent')
          .select('id, scene_number, episode_number, intent_summary, status')
          .eq('project_id', projectId)
          .eq('status', 'pending')
          .order('scene_number', { ascending: true });
        
        if (pendingIntents && pendingIntents.length > 0) {
          setState(prev => ({ ...prev, sceneIntents: pendingIntents }));
          
          for (let i = 0; i < pendingIntents.length; i++) {
            const intent = pendingIntents[i];
            
            if (abortControllerRef.current?.signal.aborted) break;

            setState(prev => ({
              ...prev,
              generationProgress: {
                ...prev.generationProgress,
                currentScene: intent.scene_number,
              },
            }));

            try {
              const { error: workerError } = await invokeAuthedFunction('scene-worker', {
                sceneIntentId: intent.id,
                projectId,
                sceneNumber: intent.scene_number,
                episodeNumber: intent.episode_number,
              });

              if (workerError) {
                console.error('[PreScriptWizard] scene-worker fallback error:', workerError);
              }
              
              // Wait for completion
              await waitForIntentCompletion(intent.id);
              
              setState(prev => ({
                ...prev,
                generationProgress: {
                  ...prev.generationProgress,
                  completedScenes: i + 1,
                },
              }));
              
            } catch (err) {
              console.error('[PreScriptWizard] Failed to process scene:', err);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      }

      // Step 5c: Check completion and compile
      const { data: finalIntents } = await supabase
        .from('scene_intent')
        .select('status')
        .eq('project_id', projectId);
      
      const allCompleted = finalIntents?.every(
        i => i.status === 'written' || i.status === 'validated'
      );

      if (allCompleted) {
        setState(prev => ({
          ...prev,
          generationProgress: {
            ...prev.generationProgress,
            phase: 'completed',
          },
        }));
        
        toast.success('¡Generación completada!');
        
        // Compile script from scenes
        console.log('[PreScriptWizard] Compiling full script...');
        const compileResult = await compileScriptFromScenes({ projectId });
        
        if (compileResult.success) {
          toast.success(`Guion compilado: ${compileResult.scenesCompiled} escenas`, {
            description: 'Puedes exportar el guion en formato PDF',
          });
          
          updateStep('generate', { 
            status: 'done', 
            result: { 
              scenesCompleted: compileResult.scenesCompiled,
              scriptId: compileResult.scriptId,
            } 
          });
          
          // Load compiled script data for callback
          const { data: scriptData } = await supabase
            .from('scripts')
            .select('id, raw_text, parsed_json, status')
            .eq('id', compileResult.scriptId)
            .single();
          
          onScriptCompiled?.(scriptData);
          onComplete();
        } else {
          throw new Error(compileResult.error || 'Error al compilar guion');
        }
      } else {
        throw new Error('No todas las escenas se completaron correctamente');
      }

    } catch (err: any) {
      console.error('[PreScriptWizard] Step 5 error:', err);
      updateStep('generate', { status: 'error', error: err.message });
      setState(prev => ({
        ...prev,
        generationProgress: {
          ...prev.generationProgress,
          phase: 'failed',
        },
      }));
      toast.error('Error en generación', { description: err.message });
    } finally {
      setIsProcessing(false);
      isGeneratingRef.current = false;
    }
  }, [projectId, outline, state.enrichedOutline, language, qualityTier, format, updateStep, onComplete, onScriptCompiled]);

  // Helper: Wait for scene completion by polling
  const waitForSceneCompletion = async (sceneIndex: number) => {
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      const { data: intents } = await supabase
        .from('scene_intent')
        .select('status')
        .eq('project_id', projectId)
        .order('scene_number', { ascending: true });
      
      if (intents && intents[sceneIndex]) {
        const status = intents[sceneIndex].status;
        if (['written', 'validated', 'failed'].includes(status)) {
          return;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  };

  // Helper: Wait for intent completion
  const waitForIntentCompletion = async (intentId: string) => {
    let attempts = 0;
    const maxAttempts = 60;
    
    while (attempts < maxAttempts) {
      const { data: updatedIntent } = await supabase
        .from('scene_intent')
        .select('status')
        .eq('id', intentId)
        .single();
      
      if (updatedIntent && ['written', 'validated', 'failed'].includes(updatedIntent.status)) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
  };

  // V77: Cancel generation
  const cancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isGeneratingRef.current = false;
    setIsProcessing(false);
    updateStep('generate', { status: 'pending' });
    setState(prev => ({
      ...prev,
      generationProgress: {
        ...prev.generationProgress,
        phase: 'idle',
      },
    }));
    toast.info('Generación cancelada');
  }, [updateStep]);

  // ============================================================================
  // Navigation
  // ============================================================================
  const stepOrder: WizardStep[] = ['enrich', 'threads', 'showrunner', 'approve', 'generate'];

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
      case 'generate':
        await executeStep5();
        break;
    }
  }, [state.currentStep, executeStep1, executeStep2, executeStep3, executeStep4, executeStep5]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    isProcessing,
    isLoading,
    currentStep: state.currentStep,
    currentStepState: state.steps[state.currentStep],
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    goToStep,
    executeCurrentStep,
    reset,
    // V77: Cancel generation
    cancelGeneration,
    // Exposed data for UI
    characters: state.characters,
    locations: state.locations,
    threads: state.threads,
    showrunnerDecisions: state.showrunnerDecisions,
    // V77: Generation data
    generationProgress: state.generationProgress,
    sceneIntents: state.sceneIntents,
  };
}
