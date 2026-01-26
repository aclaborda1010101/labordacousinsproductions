/**
 * NARRATIVE-DECIDE: Decisión Narrativa (FASE 1 del nuevo flujo)
 * 
 * Propósito: Decidir qué escenas generar y crear scene_intents
 * Modelo: Rápido (gpt-5-mini) para lotes pequeños, gpt-5 para lotes grandes
 * 
 * Input: projectId, episodeNumber, outline
 * Output: scene_intents creados, narrative_state actualizado
 * 
 * V71: Procesamiento por lotes para evitar timeouts de tokens
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAuth, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";

const BATCH_SIZE = 8; // Process scenes in batches of 8

// Service role client for system operations (bypasses RLS)
function getServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, serviceKey);
}

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

interface BatchPlanParams {
  narrativeState: any;
  outline: Record<string, unknown>;
  threads: Array<{ id: string; name: string; question?: string }>;
  characters: string[];
  episodes: any;
  lastSceneSummary: string;
  startScene: number;
  endScene: number;
  scenesInBatch: number;
  format: string;
  previousBatchSummary?: string;
  supabase: any;
  projectId: string;
  userId: string;
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
      hasOutline: !!outline,
      batchSize: BATCH_SIZE
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

    // 3b. Check for existing queued jobs that need processing (retry scenario)
    const { data: existingQueuedJobs } = await auth.supabase
      .from('jobs')
      .select('id, payload')
      .eq('project_id', projectId)
      .eq('type', 'scene_generation')
      .eq('status', 'queued');

    // If there are existing queued jobs, return them instead of creating new ones
    if (existingQueuedJobs && existingQueuedJobs.length > 0) {
      const existingJobIds = existingQueuedJobs.map(j => j.id);
      
      console.log('[narrative-decide] Found existing queued jobs to resume:', existingJobIds.length);
      
      const durationMs = Date.now() - startTime;
      return new Response(JSON.stringify({
        ok: true,
        data: {
          scenes_planned: existingJobIds.length,
          jobs_created: existingJobIds,
          reusing_existing_jobs: true,
          narrative_state_id: narrativeState.id,
          duration_ms: durationMs
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

    // 6. Process scenes in batches to avoid token limits
    const allSceneIntents: SceneIntent[] = [];
    const totalBatches = Math.ceil(scenesToPlan / BATCH_SIZE);
    let previousBatchSummary = '';

    console.log('[narrative-decide] Processing in batches:', {
      scenesToPlan,
      batchSize: BATCH_SIZE,
      totalBatches
    });

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startScene = lastSceneNumber + 1 + (batchIndex * BATCH_SIZE);
      const scenesInBatch = Math.min(BATCH_SIZE, scenesToPlan - (batchIndex * BATCH_SIZE));
      const endScene = startScene + scenesInBatch - 1;

      console.log(`[narrative-decide] Processing batch ${batchIndex + 1}/${totalBatches}:`, {
        startScene,
        endScene,
        scenesInBatch
      });

      const batchIntents = await planScenesBatch({
        narrativeState,
        outline: safeOutline,
        threads,
        characters,
        episodes,
        lastSceneSummary: allSceneIntents.length > 0 
          ? allSceneIntents[allSceneIntents.length - 1].intent_summary 
          : lastSceneSummary,
        startScene,
        endScene,
        scenesInBatch,
        format,
        previousBatchSummary,
        supabase: auth.supabase,
        projectId,
        userId: auth.userId
      });

      allSceneIntents.push(...batchIntents.scenes);
      previousBatchSummary = batchIntents.batchSummary || '';

      console.log(`[narrative-decide] Batch ${batchIndex + 1} completed:`, {
        scenesPlanned: batchIntents.scenes.length,
        totalSoFar: allSceneIntents.length
      });
    }

    // 7. Insert scene_intents into DB
    const intentsToInsert = allSceneIntents
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

    // Use service role client for system operations to bypass RLS
    const serviceClient = getServiceClient();
    
    if (intentsToInsert.length > 0) {
      const { error: insertError } = await serviceClient
        .from('scene_intent')
        .insert(intentsToInsert);

      if (insertError) {
        console.error('[narrative-decide] Failed to insert intents:', insertError);
        throw new Error(`Failed to insert scene intents: ${insertError.message}`);
      }
    }

    // 8. Update narrative_state with new goals
    const nextGoal = allSceneIntents[0]?.intent_summary || '';
    const newActiveThreads = threads.slice(0, 3).map(t => t.id || t.name);

    await serviceClient
      .from('narrative_state')
      .update({
        narrative_goal: nextGoal,
        active_threads: newActiveThreads,
        last_unit_summary: lastSceneSummary,
        scenes_generated: completedScenes,
        updated_at: new Date().toISOString()
      })
      .eq('id', narrativeState.id);

    // 9. Create jobs for scene-worker
    const { data: insertedIntents } = await serviceClient
      .from('scene_intent')
      .select('id, scene_number')
      .eq('project_id', projectId)
      .eq('episode_number', episodeNumber)
      .in('scene_number', intentsToInsert.map(i => i.scene_number));

    const intentIdMap = new Map(
      (insertedIntents || []).map(i => [i.scene_number, i.id])
    );

    const jobIds: string[] = [];
    const jobsToInsert = intentsToInsert.map((intent) => {
      const jobId = crypto.randomUUID();
      jobIds.push(jobId);
      return {
        id: jobId,
        project_id: projectId,
        type: 'scene_generation',
        status: 'queued',
        payload: {
          scene_intent_id: intentIdMap.get(intent.scene_number) || null,
          scene_number: intent.scene_number,
          episode_number: episodeNumber,
          narrative_state_id: narrativeState.id
        },
        created_at: new Date().toISOString()
      };
    });

    if (jobsToInsert.length > 0) {
      console.log('[narrative-decide] Inserting jobs:', {
        count: jobsToInsert.length,
        jobIds: jobIds.slice(0, 3),
        samplePayload: jobsToInsert[0]?.payload
      });
      
      const { error: jobsError } = await serviceClient
        .from('jobs')
        .insert(jobsToInsert);

      if (jobsError) {
        console.error('[narrative-decide] Failed to insert jobs:', jobsError);
      } else {
        console.log('[narrative-decide] Jobs inserted successfully:', jobIds.length);
      }
    }

    const durationMs = Date.now() - startTime;

    console.log('[narrative-decide] Completed:', {
      projectId,
      episodeNumber,
      scenesPlanned: intentsToInsert.length,
      batchesProcessed: totalBatches,
      durationMs
    });

    return new Response(JSON.stringify({
      ok: true,
      data: {
        scenes_planned: intentsToInsert.length,
        next_narrative_goal: nextGoal,
        active_threads: newActiveThreads,
        jobs_created: jobIds,
        narrative_state_id: narrativeState.id,
        batches_processed: totalBatches,
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

// ============= BATCH PLANNING FUNCTION =============

async function planScenesBatch(params: BatchPlanParams): Promise<{ scenes: SceneIntent[]; batchSummary: string }> {
  const {
    narrativeState,
    outline,
    threads,
    characters,
    episodes,
    lastSceneSummary,
    startScene,
    endScene,
    scenesInBatch,
    format,
    previousBatchSummary,
    supabase,
    projectId,
    userId
  } = params;

  // Use more capable model for larger batches
  const modelToUse = scenesInBatch > 5 ? 'openai/gpt-5' : MODEL_CONFIG.SCRIPT.RAPIDO;

  const decisionPrompt = buildDecisionPrompt({
    narrativeState,
    outline,
    threads,
    characters,
    episodes,
    lastSceneSummary,
    startScene,
    endScene,
    scenesInBatch,
    format,
    previousBatchSummary
  });

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

  const aiResponse = await aiFetch({
    url: AI_GATEWAY_URL,
    apiKey: LOVABLE_API_KEY,
    payload: {
      model: modelToUse,
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
      max_tokens: 8000, // Increased from 4000
      response_format: { type: 'json_object' }
    },
    label: 'narrative-decide-batch',
    supabase,
    projectId,
    userId
  });

  // Parse AI response with validation
  const content = (aiResponse as any).choices?.[0]?.message?.content || '';
  const finishReason = (aiResponse as any).choices?.[0]?.finish_reason;

  // Validate response is not empty or truncated
  if (!content || content === '{}' || content.trim() === '') {
    console.error('[narrative-decide] Empty AI response:', { 
      finishReason,
      modelUsed: modelToUse,
      scenesInBatch
    });
    
    if (finishReason === 'length') {
      throw new Error(`AI response truncated for batch ${startScene}-${endScene}. Token limit exceeded.`);
    }
    throw new Error('AI returned empty response for scene planning');
  }

  let decision;
  try {
    decision = JSON.parse(content);
  } catch (parseError) {
    console.error('[narrative-decide] Failed to parse AI response:', content.slice(0, 500));
    throw new Error('AI returned invalid JSON for scene planning');
  }

  const sceneIntents: SceneIntent[] = (decision.scenes || []).map((scene: any, idx: number) => ({
    ...scene,
    scene_number: scene.scene_number || (startScene + idx),
    episode_number: params.narrativeState?.unit_ref ? parseInt(params.narrativeState.unit_ref) : 1
  }));

  return {
    scenes: sceneIntents,
    batchSummary: decision.batch_summary || decision.next_narrative_goal || ''
  };
}

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
  startScene: number;
  endScene: number;
  scenesInBatch: number;
  format: string;
  previousBatchSummary?: string;
}): string {
  const { 
    narrativeState, outline, threads, characters, episodes, 
    lastSceneSummary, startScene, endScene, scenesInBatch, format,
    previousBatchSummary
  } = params;

  const batchContext = previousBatchSummary 
    ? `\n## PREVIOUS BATCH SUMMARY\n${previousBatchSummary}\n` 
    : '';

  return `
# TASK: Plan scenes ${startScene} to ${endScene} (${scenesInBatch} scenes)

## CURRENT NARRATIVE STATE
- Phase: ${narrativeState.current_phase}
- Scenes generated: ${narrativeState.scenes_generated}
- Last scene summary: ${lastSceneSummary || 'None yet'}
- Active threads: ${JSON.stringify(narrativeState.active_threads)}
- Locked facts (DO NOT CONTRADICT): ${JSON.stringify(narrativeState.locked_facts)}
${batchContext}
## OUTLINE CONTEXT
Format: ${format}
${episodes?.title ? `Episode: ${episodes.title}` : ''}
${episodes?.summary ? `Episode summary: ${episodes.summary}` : ''}

## AVAILABLE THREADS
${threads.map(t => `- [${t.id}] ${t.name}: ${t.question || ''}`).join('\n')}

## CHARACTERS
${characters.slice(0, 10).join(', ')}

## INSTRUCTIONS
Plan exactly ${scenesInBatch} scenes starting from scene #${startScene}.

For each scene, decide:
1. scene_number: The scene number (${startScene} to ${endScene})
2. intent_summary: What MUST happen (not prose, just intention)
3. emotional_turn: How the audience's emotion should shift
4. information_revealed: Facts the audience learns
5. information_hidden: Facts deliberately withheld
6. characters_involved: Who appears
7. thread_to_advance: Which thread ID to progress
8. constraints: Any technical limitations

Also provide:
- batch_summary: A brief summary of what happens in this batch (for continuity)

## RESPONSE FORMAT (JSON)
{
  "scenes": [
    {
      "scene_number": ${startScene},
      "intent_summary": "...",
      "emotional_turn": "...",
      "information_revealed": ["..."],
      "information_hidden": ["..."],
      "characters_involved": ["..."],
      "thread_to_advance": "thread_id",
      "constraints": {}
    }
  ],
  "batch_summary": "Brief summary of this batch for continuity..."
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

You return ONLY valid JSON. No explanations. Be concise in your summaries.`;
