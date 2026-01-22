/**
 * NARRATIVE-DECIDE: Decisión Narrativa (FASE 1 del nuevo flujo)
 * 
 * Propósito: Decidir qué escenas generar y crear scene_intents
 * Modelo: Rápido (gpt-5-mini) - max 30s
 * 
 * Input: projectId, episodeNumber, outline
 * Output: scene_intents creados, narrative_state actualizado
 * 
 * V70: Parte del nuevo sistema narrativo desacoplado
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAuth, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NarrativeDecideRequest {
  projectId: string;
  episodeNumber?: number;
  outline?: Record<string, unknown>;
  scenesToPlan?: number;
  format?: 'film' | 'series' | 'ad';
}

interface SceneIntent {
  scene_number: number;
  episode_number: number;
  intent_summary: string;
  emotional_turn: string;
  information_revealed: string[];
  information_hidden: string[];
  characters_involved: string[];
  thread_to_advance: string;
  constraints: Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const auth = await requireAuth(req);
    const request: NarrativeDecideRequest = await req.json();
    
    const { 
      projectId, 
      episodeNumber = 1, 
      outline,
      scenesToPlan = 5,
      format = 'film'
    } = request;

    if (!projectId) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: 'projectId is required' 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    await requireProjectAccess(auth.supabase, auth.userId, projectId);

    console.log('[narrative-decide] Starting decision for project:', projectId, {
      episodeNumber,
      scenesToPlan,
      format,
      hasOutline: !!outline
    });

    // 1. Get or create narrative_state
    let narrativeState = await getOrCreateNarrativeState(
      auth.supabase, 
      projectId, 
      format, 
      episodeNumber
    );

    // 2. Get outline from DB if not provided
    let effectiveOutline = outline;
    if (!effectiveOutline) {
      const { data: dbOutline } = await auth.supabase
        .from('project_outlines')
        .select('outline_json, outline_parts')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      effectiveOutline = dbOutline?.outline_json || dbOutline?.outline_parts || {};
    }

    // 3. Get existing scene_intents to know what's already planned
    const { data: existingIntents } = await auth.supabase
      .from('scene_intent')
      .select('scene_number, status')
      .eq('project_id', projectId)
      .eq('episode_number', episodeNumber);

    const existingSceneNumbers = new Set(existingIntents?.map(s => s.scene_number) || []);
    const completedScenes = existingIntents?.filter(s => s.status === 'written').length || 0;

    // 4. Get existing scenes to continue from
    const { data: existingScenes } = await auth.supabase
      .from('scenes')
      .select('scene_number, slugline, summary')
      .eq('project_id', projectId)
      .order('scene_number', { ascending: false })
      .limit(3);

    const lastSceneNumber = existingScenes?.[0]?.scene_number || 0;
    const lastSceneSummary = existingScenes?.[0]?.summary || '';

    // 5. Extract threads and characters from outline
    const safeOutline = effectiveOutline || {};
    const threads = extractThreads(safeOutline);
    const characters = extractCharacters(safeOutline);
    const episodes = extractEpisodes(safeOutline, episodeNumber);

    // 6. Call AI to decide next scenes
    const decisionPrompt = buildDecisionPrompt({
      narrativeState,
      outline: safeOutline,
      threads,
      characters,
      episodes,
      lastSceneSummary,
      lastSceneNumber,
      scenesToPlan,
      format
    });

    const LOVABLE_API_URL = Deno.env.get('LOVABLE_API_URL') || 'https://api.lovable.dev/v1/chat/completions';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

    const aiResponse = await aiFetch({
      url: LOVABLE_API_URL,
      apiKey: LOVABLE_API_KEY,
      payload: {
        model: MODEL_CONFIG.SCRIPT.RAPIDO,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: decisionPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: 'json_object' }
      },
      label: 'narrative-decide',
      supabase: auth.supabase,
      projectId,
      userId: auth.userId
    });

    // 7. Parse AI response
    const content = (aiResponse as any).choices?.[0]?.message?.content || '{}';
    const decision = JSON.parse(content);

    const sceneIntents: SceneIntent[] = decision.scenes || [];

    // 8. Insert scene_intents into DB
    const intentsToInsert = sceneIntents
      .filter(intent => !existingSceneNumbers.has(intent.scene_number))
      .map(intent => ({
        project_id: projectId,
        narrative_state_id: narrativeState.id,
        scene_number: intent.scene_number,
        episode_number: episodeNumber,
        intent_summary: intent.intent_summary,
        emotional_turn: intent.emotional_turn || '',
        information_revealed: intent.information_revealed || [],
        information_hidden: intent.information_hidden || [],
        characters_involved: intent.characters_involved || [],
        thread_to_advance: intent.thread_to_advance || '',
        constraints: intent.constraints || {},
        status: 'pending'
      }));

    if (intentsToInsert.length > 0) {
      const { error: insertError } = await auth.supabase
        .from('scene_intent')
        .insert(intentsToInsert);

      if (insertError) {
        console.error('[narrative-decide] Failed to insert intents:', insertError);
        throw new Error(`Failed to insert scene intents: ${insertError.message}`);
      }
    }

    // 9. Update narrative_state with new goals
    const nextGoal = decision.next_narrative_goal || sceneIntents[0]?.intent_summary || '';
    const newActiveThreads = decision.active_threads || threads.slice(0, 3).map(t => t.id || t.name);
    const newForbiddenActions = decision.forbidden_actions || [];

    await auth.supabase
      .from('narrative_state')
      .update({
        narrative_goal: nextGoal,
        emotional_delta: decision.emotional_arc || '',
        active_threads: newActiveThreads,
        forbidden_actions: newForbiddenActions,
        last_unit_summary: lastSceneSummary,
        scenes_generated: completedScenes,
        updated_at: new Date().toISOString()
      })
      .eq('id', narrativeState.id);

    // 10. Create jobs for scene-worker (using existing jobs table)
    const jobsToInsert = intentsToInsert.map((intent, idx) => ({
      id: crypto.randomUUID(),
      project_id: projectId,
      type: 'scene_generation',
      status: 'pending',
      payload: {
        scene_intent_id: null, // Will be updated after insert
        scene_number: intent.scene_number,
        episode_number: episodeNumber,
        narrative_state_id: narrativeState.id
      },
      created_at: new Date().toISOString()
    }));

    if (jobsToInsert.length > 0) {
      await auth.supabase.from('jobs').insert(jobsToInsert);
    }

    const durationMs = Date.now() - startTime;

    console.log('[narrative-decide] Completed:', {
      projectId,
      episodeNumber,
      scenesPlanned: intentsToInsert.length,
      durationMs
    });

    return new Response(JSON.stringify({
      ok: true,
      data: {
        scenes_planned: intentsToInsert.length,
        next_narrative_goal: nextGoal,
        active_threads: newActiveThreads,
        jobs_created: jobsToInsert.length,
        narrative_state_id: narrativeState.id,
        duration_ms: durationMs
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[narrative-decide] Error:', error);
    return authErrorResponse(error as Error, corsHeaders);
  }
});

// ============= HELPER FUNCTIONS =============

async function getOrCreateNarrativeState(
  supabase: any,
  projectId: string,
  format: string,
  episodeNumber: number
) {
  const { data: existing } = await supabase
    .from('narrative_state')
    .select('*')
    .eq('project_id', projectId)
    .single();

  if (existing) {
    return existing;
  }

  // Create new narrative_state
  const newState = {
    project_id: projectId,
    format,
    unit_type: format === 'series' ? 'episode' : 'film',
    unit_ref: String(episodeNumber),
    current_phase: 'setup',
    locked_facts: [],
    forbidden_actions: [],
    active_threads: [],
    unresolved_questions: [],
    open_threads: [],
    resolved_threads: [],
    character_arcs: {},
    canon_facts: [],
    scenes_generated: 0,
    pacing_meter: 0.5
  };

  const { data: created, error } = await supabase
    .from('narrative_state')
    .insert(newState)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create narrative_state: ${error.message}`);
  }

  return created;
}

function extractThreads(outline: Record<string, unknown>): Array<{ id: string; name: string; question?: string }> {
  const threads: Array<{ id: string; name: string; question?: string }> = [];
  
  // Try various outline structures
  const threadSources = [
    outline?.threads,
    outline?.narrative_threads,
    (outline as any)?.series_bible?.threads,
    (outline as any)?.structure?.threads
  ];

  for (const source of threadSources) {
    if (Array.isArray(source)) {
      for (const t of source) {
        threads.push({
          id: t.id || t.thread_id || `thread_${threads.length}`,
          name: t.name || t.title || t.thread || 'Unnamed thread',
          question: t.question || t.dramatic_question || ''
        });
      }
      break;
    }
  }

  return threads;
}

function extractCharacters(outline: Record<string, unknown>): string[] {
  const chars: string[] = [];
  
  const charSources = [
    outline?.characters,
    (outline as any)?.series_bible?.characters,
    (outline as any)?.entities?.characters
  ];

  for (const source of charSources) {
    if (Array.isArray(source)) {
      for (const c of source) {
        const name = c.name || c.character_name || '';
        if (name) chars.push(name);
      }
      break;
    }
  }

  return chars;
}

function extractEpisodes(outline: Record<string, unknown>, targetEpisode: number): any {
  const episodes = (outline as any)?.episodes || [];
  return episodes.find((e: any) => e.episode_number === targetEpisode || e.number === targetEpisode) || {};
}

function buildDecisionPrompt(params: {
  narrativeState: any;
  outline: Record<string, unknown>;
  threads: Array<{ id: string; name: string; question?: string }>;
  characters: string[];
  episodes: any;
  lastSceneSummary: string;
  lastSceneNumber: number;
  scenesToPlan: number;
  format: string;
}): string {
  const { narrativeState, outline, threads, characters, episodes, lastSceneSummary, lastSceneNumber, scenesToPlan, format } = params;

  return `
# TASK: Plan the next ${scenesToPlan} scenes

## CURRENT NARRATIVE STATE
- Phase: ${narrativeState.current_phase}
- Scenes generated: ${narrativeState.scenes_generated}
- Last scene (#${lastSceneNumber}): ${lastSceneSummary || 'None yet'}
- Active threads: ${JSON.stringify(narrativeState.active_threads)}
- Locked facts (DO NOT CONTRADICT): ${JSON.stringify(narrativeState.locked_facts)}

## OUTLINE CONTEXT
Format: ${format}
${episodes?.title ? `Episode: ${episodes.title}` : ''}
${episodes?.summary ? `Episode summary: ${episodes.summary}` : ''}

## AVAILABLE THREADS
${threads.map(t => `- [${t.id}] ${t.name}: ${t.question || ''}`).join('\n')}

## CHARACTERS
${characters.slice(0, 10).join(', ')}

## INSTRUCTIONS
Plan exactly ${scenesToPlan} scenes starting from scene #${lastSceneNumber + 1}.

For each scene, decide:
1. intent_summary: What MUST happen (not prose, just intention)
2. emotional_turn: How the audience's emotion should shift
3. information_revealed: Facts the audience learns
4. information_hidden: Facts deliberately withheld
5. characters_involved: Who appears
6. thread_to_advance: Which thread ID to progress
7. constraints: Any technical limitations

Also provide:
- next_narrative_goal: The overall direction for this batch
- active_threads: Which 2-3 threads should be active now
- forbidden_actions: Things that CANNOT happen yet (arcs not ready to close)
- emotional_arc: The emotional journey across these scenes

## RESPONSE FORMAT (JSON)
{
  "scenes": [
    {
      "scene_number": ${lastSceneNumber + 1},
      "intent_summary": "...",
      "emotional_turn": "...",
      "information_revealed": ["..."],
      "information_hidden": ["..."],
      "characters_involved": ["..."],
      "thread_to_advance": "thread_id",
      "constraints": {}
    }
  ],
  "next_narrative_goal": "...",
  "active_threads": ["thread_id_1", "thread_id_2"],
  "forbidden_actions": ["..."],
  "emotional_arc": "..."
}
`;
}

const SYSTEM_PROMPT = `You are a professional Hollywood story planner. Your job is to plan scenes with clear narrative intent, NOT to write them.

KEY PRINCIPLES:
1. Each scene must have ONE clear dramatic purpose
2. Never close arcs prematurely - build tension
3. Information should be revealed strategically
4. Every scene should shift the audience's emotional state
5. Characters must act according to their established arcs

You return ONLY valid JSON. No explanations.`;
