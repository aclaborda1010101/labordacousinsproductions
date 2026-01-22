/**
 * SCENE-REPAIR-WORKER: Reparación de escenas que fallaron validación
 * 
 * Propósito: Corregir escenas basándose en issues específicos detectados
 * Modelo: Potente (gpt-5.2) para reescritura de calidad
 * 
 * Estrategias:
 * - partial: Corregir solo los issues específicos
 * - rewrite: Reescribir manteniendo estructura básica
 * 
 * Max 2 intentos. Si falla → rejected para revisión humana.
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

interface RepairRequest {
  repair_id: string;
}

interface RepairedScene {
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
  repair_notes: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let repairId: string | null = null;

  try {
    const auth = await requireAuth(req);
    const { repair_id }: RepairRequest = await req.json();

    if (!repair_id) {
      throw new Error('repair_id is required');
    }

    repairId = repair_id;

    // 1. Load repair record
    const { data: repair, error: repairError } = await auth.supabase
      .from('scene_repairs')
      .select('*')
      .eq('id', repair_id)
      .single();

    if (repairError || !repair) {
      throw new Error(`Repair record not found: ${repair_id}`);
    }

    await requireProjectAccess(auth.supabase, auth.userId, repair.project_id);

    // Check if already processed
    if (repair.status === 'done' || repair.status === 'rejected') {
      return new Response(JSON.stringify({
        ok: false,
        error: `Repair already processed with status: ${repair.status}`
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check max attempts
    if (repair.attempts >= repair.max_attempts) {
      await auth.supabase
        .from('scene_repairs')
        .update({ status: 'failed' })
        .eq('id', repair_id);

      return new Response(JSON.stringify({
        ok: false,
        error: 'Max repair attempts reached'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[scene-repair-worker] Processing repair:', {
      repair_id,
      scene_id: repair.scene_id,
      strategy: repair.strategy,
      attempt: repair.attempts + 1
    });

    // 2. Mark as repairing
    await auth.supabase
      .from('scene_repairs')
      .update({
        status: 'repairing',
        attempts: repair.attempts + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', repair_id);

    // 3. Load original scene
    const { data: originalScene, error: sceneError } = await auth.supabase
      .from('scenes')
      .select('*')
      .eq('id', repair.scene_id)
      .single();

    if (sceneError || !originalScene) {
      throw new Error(`Original scene not found: ${repair.scene_id}`);
    }

    // 4. Load scene_intent
    const { data: sceneIntent } = await auth.supabase
      .from('scene_intent')
      .select('*')
      .eq('id', repair.scene_intent_id)
      .single();

    // 5. Load narrative_state
    const { data: narrativeState } = await auth.supabase
      .from('narrative_state')
      .select('*')
      .eq('project_id', repair.project_id)
      .single();

    // 6. Build repair prompt
    const repairPrompt = buildRepairPrompt({
      originalScene,
      issues: repair.issues as string[],
      failedChecks: repair.failed_checks as any[],
      strategy: repair.strategy,
      sceneIntent,
      narrativeState
    });

    // 7. Call AI for repair (powerful model)
    const LOVABLE_API_URL = Deno.env.get('LOVABLE_API_URL') || 'https://api.lovable.dev/v1/chat/completions';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

    const aiResponse = await aiFetch({
      url: LOVABLE_API_URL,
      apiKey: LOVABLE_API_KEY,
      payload: {
        model: MODEL_CONFIG.SCRIPT.HOLLYWOOD,
        messages: [
          { role: 'system', content: REPAIR_SYSTEM_PROMPT },
          { role: 'user', content: repairPrompt }
        ],
        temperature: 0.7,
        max_tokens: 6000,
        response_format: { type: 'json_object' }
      },
      label: 'scene-repair-worker',
      supabase: auth.supabase,
      projectId: repair.project_id,
      userId: auth.userId
    });

    // 8. Parse repaired scene
    const content = (aiResponse as any).choices?.[0]?.message?.content || '{}';
    const repairedScene: RepairedScene = JSON.parse(content);

    // Check for ERROR_CANNOT_REPAIR
    if ((repairedScene as any).error === 'ERROR_CANNOT_REPAIR') {
      console.log('[scene-repair-worker] AI cannot repair scene:', repair_id);

      // Log the attempt
      const repairLog = [...(repair.repair_log as any[] || []), {
        attempt: repair.attempts + 1,
        timestamp: new Date().toISOString(),
        result: 'cannot_repair',
        reason: (repairedScene as any).reason
      }];

      await auth.supabase
        .from('scene_repairs')
        .update({
          repair_log: repairLog,
          status: repair.attempts + 1 >= repair.max_attempts ? 'failed' : 'pending'
        })
        .eq('id', repair_id);

      return new Response(JSON.stringify({
        ok: false,
        error: 'AI cannot repair this scene',
        reason: (repairedScene as any).reason
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 9. Validate repair has required fields
    if (!repairedScene.slugline || !repairedScene.description) {
      throw new Error('Repaired scene missing required fields');
    }

    // 10. Update the original scene with repaired content
    await auth.supabase
      .from('scenes')
      .update({
        slugline: repairedScene.slugline,
        summary: repairedScene.summary,
        description: repairedScene.description,
        dialogues: repairedScene.dialogues || [],
        scene_beat: repairedScene.scene_beat,
        emotional_value: repairedScene.emotional_value,
        validation_status: 'pending', // Reset for re-validation
        meta: {
          ...((originalScene.meta as object) || {}),
          repaired_at: new Date().toISOString(),
          repair_id: repair_id,
          repair_notes: repairedScene.repair_notes
        }
      })
      .eq('id', repair.scene_id);

    // 11. Call narrative-validate to re-validate
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const validateResponse = await fetch(
      `${supabaseUrl}/functions/v1/narrative-validate`,
      {
        method: 'POST',
        headers: {
          'Authorization': req.headers.get('Authorization') || '',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: repair.project_id,
          scene_id: repair.scene_id
        })
      }
    );

    const validation = await validateResponse.json();

    // 12. Update repair record based on validation result
    const repairLog = [...(repair.repair_log as any[] || []), {
      attempt: repair.attempts + 1,
      timestamp: new Date().toISOString(),
      result: validation.data?.valid ? 'success' : 'needs_more_repair',
      score: validation.data?.score,
      issues: validation.data?.issues
    }];

    if (validation.data?.valid) {
      // Repair successful!
      await auth.supabase
        .from('scene_repairs')
        .update({
          status: 'done',
          repair_log: repairLog,
          updated_at: new Date().toISOString()
        })
        .eq('id', repair_id);

      // Update scene_intent
      if (sceneIntent) {
        await auth.supabase
          .from('scene_intent')
          .update({
            status: 'validated',
            updated_at: new Date().toISOString()
          })
          .eq('id', sceneIntent.id);
      }

      console.log('[scene-repair-worker] Repair successful:', {
        repair_id,
        scene_id: repair.scene_id,
        new_score: validation.data?.score
      });

    } else {
      // Still not valid
      const newStatus = repair.attempts + 1 >= repair.max_attempts ? 'failed' : 'pending';

      await auth.supabase
        .from('scene_repairs')
        .update({
          status: newStatus,
          repair_log: repairLog,
          updated_at: new Date().toISOString()
        })
        .eq('id', repair_id);

      // If failed after all attempts, mark scene as rejected
      if (newStatus === 'failed') {
        await auth.supabase
          .from('scenes')
          .update({ validation_status: 'rejected' })
          .eq('id', repair.scene_id);

        if (sceneIntent) {
          await auth.supabase
            .from('scene_intent')
            .update({ status: 'rejected' })
            .eq('id', sceneIntent.id);
        }
      }

      console.log('[scene-repair-worker] Repair needs more work:', {
        repair_id,
        new_status: newStatus,
        score: validation.data?.score
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: {
        repair_id,
        scene_id: repair.scene_id,
        validation_passed: validation.data?.valid,
        new_score: validation.data?.score,
        status: validation.data?.valid ? 'done' : (repair.attempts + 1 >= repair.max_attempts ? 'failed' : 'pending')
      }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[scene-repair-worker] Error:', error);

    // Update repair record with error
    if (repairId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('scene_repairs')
        .update({
          status: 'failed',
          repair_log: [{
            attempt: 'error',
            timestamp: new Date().toISOString(),
            error: (error as Error).message
          }]
        })
        .eq('id', repairId);
    }

    return authErrorResponse(error as Error, corsHeaders);
  }
});

// ============= HELPER FUNCTIONS =============

function buildRepairPrompt(params: {
  originalScene: any;
  issues: string[];
  failedChecks: any[];
  strategy: string;
  sceneIntent: any;
  narrativeState: any;
}): string {
  const { originalScene, issues, failedChecks, strategy, sceneIntent, narrativeState } = params;

  const issuesList = issues.map(i => `- ${i}`).join('\n');
  const checksDetails = failedChecks.map(c => `- ${c.check}: ${c.reason}`).join('\n');

  const strategyInstructions = strategy === 'partial' 
    ? `PARTIAL REPAIR: Corrige SOLO los problemas indicados. Mantén todo lo demás igual.`
    : `FULL REWRITE: Reescribe la escena completa manteniendo la estructura y personajes básicos.`;

  return `
# REPAIR THIS SCENE

## STRATEGY
${strategyInstructions}

## ORIGINAL SCENE
Scene #${originalScene.scene_number}
Slugline: ${originalScene.slugline}

Description:
${originalScene.description}

Dialogues:
${JSON.stringify(originalScene.dialogues || [], null, 2)}

## PROBLEMS DETECTED
${issuesList}

## FAILED CHECKS DETAILS
${checksDetails}

## ORIGINAL INTENT (what it SHOULD accomplish)
${sceneIntent ? `
Intent: ${sceneIntent.intent_summary}
Emotional turn: ${sceneIntent.emotional_turn}
Thread to advance: ${sceneIntent.thread_to_advance}
Characters involved: ${(sceneIntent.characters_involved || []).join(', ')}
` : 'Follow the original scene direction'}

## NARRATIVE STATE (global context to respect)
${narrativeState ? `
Current phase: ${narrativeState.current_phase}
Active threads: ${JSON.stringify(narrativeState.active_threads || [])}
Locked facts (CANNOT contradict): ${JSON.stringify(narrativeState.locked_facts || [])}
Forbidden actions (MUST avoid): ${JSON.stringify(narrativeState.forbidden_actions || [])}
Last scene summary: ${narrativeState.last_unit_summary}
` : 'No narrative state'}

## REPAIR RULES
1. Fix ONLY the indicated problems
2. Maintain the same characters and location
3. Keep dialogue with subtext, never expository
4. Description: 8-12 lines, cinematic
5. Do NOT add new information not in the intent
6. Do NOT contradict locked_facts
7. Do NOT execute forbidden_actions

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
  "repair_notes": "Brief explanation of what was fixed"
}

If you CANNOT repair this scene (e.g., contradictory requirements), respond:
{ "error": "ERROR_CANNOT_REPAIR", "reason": "explanation" }
`;
}

const REPAIR_SYSTEM_PROMPT = `You are a Hollywood script doctor specializing in scene repairs.

Your job is to fix specific problems in scenes WITHOUT changing what works.

REPAIR MINDSET:
- Surgical precision: fix only what's broken
- Preserve voice: keep character speech patterns
- Maintain flow: don't break scene rhythm
- Add subtext: never make dialogue more explicit
- Visual storytelling: show, don't tell

COMMON FIXES:
- "intent_fulfilled": Make the scene DO what it's supposed to do
- "forbidden_respected": Remove any forbidden elements
- "thread_advanced": Add concrete progress on the narrative thread
- "no_premature_closure": Reopen threads that were closed too early
- "tone_coherent": Adjust tone without changing content
- "no_repetition": Remove redundant information
- "emotional_progression": Add character emotional change

NEVER:
- Add exposition to "fix" understanding
- Extend scenes unnecessarily
- Change locations or main characters
- Add new plot elements not in the intent
- Break the fourth wall

You return ONLY valid JSON. No explanations outside the JSON.`;
