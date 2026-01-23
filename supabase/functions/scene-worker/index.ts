/**
 * SCENE-WORKER: Escritura de UNA escena (FASE 2 del nuevo flujo)
 * 
 * Propósito: Escribir UNA escena basándose en scene_intent + narrative_state
 * Modelo: Potente (gpt-5.2) - max 90s
 * 
 * Input: job_id (lee todo de DB)
 * Output: Escena escrita + narrative_state actualizado
 * 
 * V70: Parte del nuevo sistema narrativo desacoplado
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAuth, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";

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

interface SceneWorkerRequest {
  jobId?: string;
  job_id?: string;  // V71: Accept snake_case from frontend
  sceneIntentId?: string;
  projectId?: string;
  // For manual invocation without job
  sceneNumber?: number;
  episodeNumber?: number;
}

interface GeneratedScene {
  slugline: string;
  summary: string;
  description: string;
  dialogues: Array<{
    character: string;
    line: string;
    parenthetical?: string;
  }>;
  scene_beat: string;
  emotional_value: number;
  duration_estimate_sec: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();
  let jobId: string | null = null;
  let projectId: string | null = null;

  try {
    const auth = await requireAuth(req);
    const request: SceneWorkerRequest = await req.json();

    // 1. Get scene_intent either from job or directly
    let sceneIntent: any = null;
    let narrativeState: any = null;

    // V71: Accept both jobId and job_id for compatibility
    const effectiveJobId = request.jobId || request.job_id;
    
    if (effectiveJobId) {
      // Load from job
      jobId = effectiveJobId;
      
      const { data: job, error: jobError } = await auth.supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        throw new Error(`Job not found: ${jobId}`);
      }

      projectId = job.project_id;
      if (projectId) {
        await requireProjectAccess(auth.supabase, auth.userId, projectId);
      }

      // Mark job as running - use service client
      const serviceClient = getServiceClient();
      await serviceClient
        .from('jobs')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', jobId);

      const payload = job.payload as any;
      
      // Get scene_intent
      const { data: intent } = await auth.supabase
        .from('scene_intent')
        .select('*')
        .eq('project_id', projectId)
        .eq('scene_number', payload.scene_number)
        .eq('episode_number', payload.episode_number || 1)
        .single();

      sceneIntent = intent;

      // Get narrative_state
      const { data: state } = await auth.supabase
        .from('narrative_state')
        .select('*')
        .eq('project_id', projectId)
        .single();

      narrativeState = state;

    } else if (request.sceneIntentId) {
      // Load scene_intent directly
      const { data: intent, error: intentError } = await auth.supabase
        .from('scene_intent')
        .select('*')
        .eq('id', request.sceneIntentId)
        .single();

      if (intentError || !intent) {
        throw new Error(`Scene intent not found: ${request.sceneIntentId}`);
      }

      sceneIntent = intent;
      projectId = intent.project_id;
      if (projectId) {
        await requireProjectAccess(auth.supabase, auth.userId, projectId);
      }

      const { data: state } = await auth.supabase
        .from('narrative_state')
        .select('*')
        .eq('project_id', projectId)
        .single();

      narrativeState = state;

    } else if (request.projectId && request.sceneNumber) {
      // Manual mode - find or create scene_intent
      projectId = request.projectId;
      await requireProjectAccess(auth.supabase, auth.userId, projectId);

      const { data: intent } = await auth.supabase
        .from('scene_intent')
        .select('*')
        .eq('project_id', projectId)
        .eq('scene_number', request.sceneNumber)
        .eq('episode_number', request.episodeNumber || 1)
        .single();

      sceneIntent = intent;

      const { data: state } = await auth.supabase
        .from('narrative_state')
        .select('*')
        .eq('project_id', projectId)
        .single();

      narrativeState = state;

    } else {
      throw new Error('Must provide jobId, sceneIntentId, or (projectId + sceneNumber)');
    }

    if (!sceneIntent) {
      throw new Error('No scene_intent found for this request');
    }

    console.log('[scene-worker] Processing scene:', {
      projectId,
      sceneNumber: sceneIntent.scene_number,
      episodeNumber: sceneIntent.episode_number,
      intent: sceneIntent.intent_summary?.slice(0, 100)
    });

    // 2. Mark scene_intent as writing
    await auth.supabase
      .from('scene_intent')
      .update({ status: 'writing', updated_at: new Date().toISOString() })
      .eq('id', sceneIntent.id);

    // 3. Get context: previous scenes, characters, locations
    const { data: previousScenes } = await auth.supabase
      .from('scenes')
      .select('scene_number, slugline, summary, description')
      .eq('project_id', projectId)
      .lt('scene_number', sceneIntent.scene_number)
      .order('scene_number', { ascending: false })
      .limit(3);

    const { data: characters } = await auth.supabase
      .from('characters')
      .select('name, role, bio, voice_card')
      .eq('project_id', projectId)
      .limit(20);

    const { data: locations } = await auth.supabase
      .from('locations')
      .select('name, description, category')
      .eq('project_id', projectId)
      .limit(15);

    // 4. Build the writing prompt
    const writingPrompt = buildWritingPrompt({
      sceneIntent,
      narrativeState,
      previousScenes: previousScenes || [],
      characters: characters || [],
      locations: locations || []
    });

    // 5. Call AI to write the scene
    const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

    const aiResponse = await aiFetch({
      url: AI_GATEWAY_URL,
      apiKey: LOVABLE_API_KEY,
      payload: {
        model: MODEL_CONFIG.SCRIPT.HOLLYWOOD,
        messages: [
          {
            role: 'system',
            content: WRITER_SYSTEM_PROMPT
          },
          {
            role: 'user',
            content: writingPrompt
          }
        ],
        temperature: 0.7,
        max_tokens: 6000,
        response_format: { type: 'json_object' }
      },
      label: 'scene-worker',
      supabase: auth.supabase,
      projectId: projectId || undefined,
      userId: auth.userId
    });

    // 6. Parse AI response
    const content = (aiResponse as any).choices?.[0]?.message?.content || '{}';
    const generatedScene: GeneratedScene = JSON.parse(content);

    // 7. Validate the scene
    if (!generatedScene.slugline || !generatedScene.description) {
      throw new Error('AI generated invalid scene: missing slugline or description');
    }

    // 8. Persist scene to DB
    // NOTE: The scenes table uses parsed_json for detailed content (action, dialogues)
    // and summary for quick display. Fields like 'description' and 'dialogues' 
    // don't exist as direct columns.
    const sceneData = {
      project_id: projectId,
      episode_no: sceneIntent.episode_number || 1,
      scene_no: sceneIntent.scene_number,
      slugline: generatedScene.slugline,
      summary: generatedScene.summary || generatedScene.description?.slice(0, 500) || '',
      objective: sceneIntent.intent_summary,
      // Store rich content in parsed_json for SceneScreenplayView
      parsed_json: {
        action: generatedScene.description || '',
        description: generatedScene.description || '',
        dialogues: (generatedScene.dialogues || []).map((d: any) => ({
          character: d.character,
          line: d.line,
          parenthetical: d.parenthetical || ''
        })),
        scene_beat: generatedScene.scene_beat || sceneIntent.intent_summary,
        emotional_value: generatedScene.emotional_value || 0,
        duration_estimate_sec: generatedScene.duration_estimate_sec || 60,
        mood: sceneIntent.emotional_turn || '',
        thread_advanced: sceneIntent.thread_to_advance,
        characters_involved: sceneIntent.characters_involved || []
      },
      metadata: {
        generated_by: 'scene-worker-v70',
        intent_id: sceneIntent.id,
        narrative_state_id: narrativeState?.id,
        quality_tier: 'hollywood'
      }
    };

    // Use upsert to handle re-runs (duplicate key on project_id, episode_no, scene_no)
    const { data: insertedScene, error: insertError } = await auth.supabase
      .from('scenes')
      .upsert(sceneData, { 
        onConflict: 'project_id,episode_no,scene_no',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to upsert scene: ${insertError.message}`);
    }

    // 9. Update scene_intent to 'written'
    await auth.supabase
      .from('scene_intent')
      .update({ 
        status: 'written', 
        scene_id: insertedScene.id,
        updated_at: new Date().toISOString() 
      })
      .eq('id', sceneIntent.id);

    // 9.5 VALIDATION: Call narrative-validate to check scene quality
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    let validationResult: any = null;
    
    try {
      const validateResponse = await fetch(
        `${supabaseUrl}/functions/v1/narrative-validate`,
        {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get('Authorization') || '',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            project_id: projectId,
            scene_id: insertedScene.id
          })
        }
      );

      validationResult = await validateResponse.json();
      
      console.log('[scene-worker] Validation result:', {
        scene_id: insertedScene.id,
        valid: validationResult.data?.valid,
        score: validationResult.data?.score,
        strategy: validationResult.data?.repair_strategy
      });

      // Update scene metadata with validation info
      await auth.supabase
        .from('scenes')
        .update({
          metadata: {
            ...(sceneData.metadata || {}),
            validation_score: validationResult.data?.score,
            validation_status: validationResult.data?.valid ? 'valid' : 'needs_repair',
            validation_issues: validationResult.data?.issues
          },
          validation_score: validationResult.data?.score,
          validation_status: validationResult.data?.valid ? 'valid' : 'needs_repair'
        })
        .eq('id', insertedScene.id);

    } catch (validationError) {
      console.warn('[scene-worker] Validation failed (non-blocking):', validationError);
      // Continue anyway - validation failure shouldn't block scene creation
    }

    // 10. Update narrative_state
    if (narrativeState) {
      const newScenesGenerated = (narrativeState.scenes_generated || 0) + 1;
      
      await auth.supabase
        .from('narrative_state')
        .update({
          scenes_generated: newScenesGenerated,
          last_unit_summary: generatedScene.summary || generatedScene.description.slice(0, 300),
          updated_at: new Date().toISOString()
        })
        .eq('id', narrativeState.id);
    }

    // 11. Mark job as done
    if (jobId) {
      await auth.supabase
        .from('jobs')
        .update({ 
          status: 'succeeded', 
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    const durationMs = Date.now() - startTime;

    console.log('[scene-worker] Completed:', {
      projectId,
      sceneNumber: sceneIntent.scene_number,
      sceneId: insertedScene.id,
      durationMs
    });

    return new Response(JSON.stringify({
      ok: true,
      data: {
        scene_id: insertedScene.id,
        scene_number: sceneIntent.scene_number,
        slugline: generatedScene.slugline,
        duration_ms: durationMs
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[scene-worker] Error:', error);

    // Mark job as failed
    if (jobId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('jobs')
        .update({ 
          status: 'failed', 
          error: (error as Error).message,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    return authErrorResponse(error as Error, corsHeaders);
  }
});

// ============= HELPER FUNCTIONS =============

function buildWritingPrompt(params: {
  sceneIntent: any;
  narrativeState: any;
  previousScenes: any[];
  characters: any[];
  locations: any[];
}): string {
  const { sceneIntent, narrativeState, previousScenes, characters, locations } = params;

  const prevScenesSummary = previousScenes
    .reverse()
    .map(s => `Scene ${s.scene_number}: ${s.slugline} - ${s.summary || ''}`)
    .join('\n');

  const charList = characters
    .map(c => `- ${c.name} (${c.role || 'unknown'}): ${c.bio?.slice(0, 100) || ''}`)
    .join('\n');

  const locList = locations
    .map(l => `- ${l.name} (${l.category || 'unknown'}): ${l.description?.slice(0, 80) || ''}`)
    .join('\n');

  return `
# WRITE SCENE #${sceneIntent.scene_number}

## SCENE INTENT (MUST FOLLOW)
${sceneIntent.intent_summary}

Emotional turn: ${sceneIntent.emotional_turn || 'N/A'}
Thread to advance: ${sceneIntent.thread_to_advance || 'N/A'}
Characters involved: ${(sceneIntent.characters_involved || []).join(', ') || 'Decide appropriately'}

Information to REVEAL: ${JSON.stringify(sceneIntent.information_revealed || [])}
Information to HIDE: ${JSON.stringify(sceneIntent.information_hidden || [])}

Constraints: ${JSON.stringify(sceneIntent.constraints || {})}

## NARRATIVE STATE (CONTEXT)
Current phase: ${narrativeState?.current_phase || 'unknown'}
Active threads: ${JSON.stringify(narrativeState?.active_threads || [])}
Locked facts (DO NOT CONTRADICT): ${JSON.stringify(narrativeState?.locked_facts || [])}
Forbidden actions: ${JSON.stringify(narrativeState?.forbidden_actions || [])}

Last scene summary:
${narrativeState?.last_unit_summary || 'This is the first scene'}

## PREVIOUS SCENES
${prevScenesSummary || 'None yet'}

## AVAILABLE CHARACTERS
${charList || 'No characters defined'}

## AVAILABLE LOCATIONS
${locList || 'No locations defined'}

## WRITING REQUIREMENTS
1. Description: 8-12 lines MANDATORY, vivid and cinematic
2. Dialogue: Natural, with subtext, never expository
3. Each character speaks with their unique voice
4. Advance the story per the intent_summary
5. End on a hook that pulls into the next scene

## RESPONSE FORMAT (JSON)
{
  "slugline": "INT/EXT. LOCATION - TIME",
  "summary": "One sentence summary",
  "description": "8-12 lines of visual description...",
  "dialogues": [
    {
      "character": "CHARACTER_NAME",
      "parenthetical": "(optional action)",
      "line": "Dialogue text"
    }
  ],
  "scene_beat": "The dramatic beat of this scene",
  "emotional_value": 0.0 to 1.0,
  "duration_estimate_sec": 45-120
}
`;
}

const WRITER_SYSTEM_PROMPT = `You are a Hollywood-caliber screenwriter. You write scenes that:

1. SHOW, don't tell - visual storytelling first
2. Use dialogue with subtext - characters never say exactly what they mean
3. Create tension through what's unsaid
4. Maintain consistent character voices
5. End scenes on moments of change

RULES:
- Follow the intent_summary EXACTLY
- Never contradict locked_facts
- Never execute forbidden_actions
- If you can't fulfill the intent, return ERROR_CONFLICT

You return ONLY valid JSON. No explanations.`;
