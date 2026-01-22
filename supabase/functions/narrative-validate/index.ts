/**
 * NARRATIVE-VALIDATE: Validador de calidad de escenas (FASE CIERRE)
 * 
 * Propósito: Decidir si una escena se acepta, repara o rechaza
 * Modelo: Rápido (gpt-5-mini) para evaluación
 * 
 * Los 7 Checks Obligatorios:
 * 1. intent_fulfilled - ¿Cumple intent_summary?
 * 2. forbidden_respected - ¿Respeta forbidden_actions?
 * 3. thread_advanced - ¿Avanza thread_to_advance?
 * 4. no_premature_closure - ¿No cierra hilos antes de tiempo?
 * 5. tone_coherent - ¿Tono coherente con el proyecto?
 * 6. no_repetition - ¿No repite información de last_unit_summary?
 * 7. emotional_progression - ¿Tiene progresión emocional real?
 * 
 * Scoring:
 * - >= 85: accept
 * - 60-84: partial repair
 * - 40-59: full rewrite
 * - < 40: reject (human review)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { requireAuth, requireProjectAccess, authErrorResponse } from "../_shared/auth.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateRequest {
  project_id: string;
  scene_id: string;
}

interface CheckResult {
  passed: boolean;
  reason?: string;
  details?: any;
}

interface ValidationResult {
  valid: boolean;
  score: number;
  checks: {
    intent_fulfilled: CheckResult;
    forbidden_respected: CheckResult;
    thread_advanced: CheckResult;
    no_premature_closure: CheckResult;
    tone_coherent: CheckResult;
    no_repetition: CheckResult;
    emotional_progression: CheckResult;
  };
  issues: string[];
  repair_strategy: 'accept' | 'rewrite' | 'partial' | 'reject';
}

// Check weights for scoring
const CHECK_WEIGHTS = {
  intent_fulfilled: 20,
  forbidden_respected: 15,
  thread_advanced: 15,
  no_premature_closure: 15,
  tone_coherent: 10,
  no_repetition: 10,
  emotional_progression: 15,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    const { project_id, scene_id }: ValidateRequest = await req.json();

    if (!project_id || !scene_id) {
      throw new Error('project_id and scene_id are required');
    }

    await requireProjectAccess(auth.supabase, auth.userId, project_id);

    console.log('[narrative-validate] Validating scene:', { project_id, scene_id });

    // 1. Load scene
    const { data: scene, error: sceneError } = await auth.supabase
      .from('scenes')
      .select('*')
      .eq('id', scene_id)
      .single();

    if (sceneError || !scene) {
      throw new Error(`Scene not found: ${scene_id}`);
    }

    // 2. Load scene_intent
    const { data: sceneIntent } = await auth.supabase
      .from('scene_intent')
      .select('*')
      .eq('project_id', project_id)
      .eq('scene_number', scene.scene_number)
      .single();

    // 3. Load narrative_state
    const { data: narrativeState } = await auth.supabase
      .from('narrative_state')
      .select('*')
      .eq('project_id', project_id)
      .single();

    // 4. Build validation prompt
    const validationPrompt = buildValidationPrompt(scene, sceneIntent, narrativeState);

    // 5. Call AI for validation (fast model)
    const LOVABLE_API_URL = Deno.env.get('LOVABLE_API_URL') || 'https://api.lovable.dev/v1/chat/completions';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY') || '';

    const aiResponse = await aiFetch({
      url: LOVABLE_API_URL,
      apiKey: LOVABLE_API_KEY,
      payload: {
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: VALIDATOR_SYSTEM_PROMPT },
          { role: 'user', content: validationPrompt }
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      },
      label: 'narrative-validate',
      supabase: auth.supabase,
      projectId: project_id,
      userId: auth.userId
    });

    // 6. Parse validation result
    const content = (aiResponse as any).choices?.[0]?.message?.content || '{}';
    const aiChecks = JSON.parse(content);

    // 7. Calculate score and determine strategy
    const validation = calculateValidation(aiChecks);

    console.log('[narrative-validate] Result:', {
      scene_id,
      score: validation.score,
      valid: validation.valid,
      strategy: validation.repair_strategy,
      issues: validation.issues.length
    });

    // 8. Update scene with validation results
    await auth.supabase
      .from('scenes')
      .update({
        validation_score: validation.score,
        validation_status: validation.valid ? 'valid' : 'needs_repair',
        meta: {
          ...((scene.meta as object) || {}),
          validation_checks: validation.checks,
          validation_issues: validation.issues,
          validated_at: new Date().toISOString()
        }
      })
      .eq('id', scene_id);

    // 9. Update scene_intent status
    if (sceneIntent) {
      await auth.supabase
        .from('scene_intent')
        .update({
          status: validation.valid ? 'validated' : 'needs_repair',
          updated_at: new Date().toISOString()
        })
        .eq('id', sceneIntent.id);
    }

    // 10. If not valid, create repair record
    if (!validation.valid && validation.repair_strategy !== 'reject') {
      await auth.supabase
        .from('scene_repairs')
        .insert({
          scene_id,
          scene_intent_id: sceneIntent?.id,
          project_id,
          scene_number: scene.scene_number,
          episode_number: scene.episode_number || 1,
          issues: validation.issues,
          failed_checks: Object.entries(validation.checks)
            .filter(([_, v]) => !v.passed)
            .map(([k, v]) => ({ check: k, reason: v.reason })),
          validation_score: validation.score,
          strategy: validation.repair_strategy === 'partial' ? 'partial' : 'rewrite',
          status: 'pending'
        });

      console.log('[narrative-validate] Created repair record for scene:', scene_id);
    }

    // 11. If rejected, mark for human review
    if (validation.repair_strategy === 'reject') {
      await auth.supabase
        .from('scenes')
        .update({ validation_status: 'rejected' })
        .eq('id', scene_id);

      if (sceneIntent) {
        await auth.supabase
          .from('scene_intent')
          .update({ status: 'rejected' })
          .eq('id', sceneIntent.id);
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      data: validation
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[narrative-validate] Error:', error);
    return authErrorResponse(error as Error, corsHeaders);
  }
});

// ============= HELPER FUNCTIONS =============

function buildValidationPrompt(scene: any, sceneIntent: any, narrativeState: any): string {
  return `
# VALIDATE THIS SCENE

## SCENE TO VALIDATE
Scene #${scene.scene_number}
Slugline: ${scene.slugline || 'N/A'}
Summary: ${scene.summary || 'N/A'}

Description:
${scene.description || 'No description'}

Dialogues:
${JSON.stringify(scene.dialogues || [], null, 2)}

## ORIGINAL INTENT (what it SHOULD accomplish)
${sceneIntent ? `
Intent: ${sceneIntent.intent_summary || 'N/A'}
Emotional turn: ${sceneIntent.emotional_turn || 'N/A'}
Thread to advance: ${sceneIntent.thread_to_advance || 'N/A'}
Information to reveal: ${JSON.stringify(sceneIntent.information_revealed || [])}
Information to hide: ${JSON.stringify(sceneIntent.information_hidden || [])}
` : 'No scene intent available'}

## NARRATIVE STATE (global context)
${narrativeState ? `
Current phase: ${narrativeState.current_phase || 'unknown'}
Active threads: ${JSON.stringify(narrativeState.active_threads || [])}
Locked facts (CANNOT contradict): ${JSON.stringify(narrativeState.locked_facts || [])}
Forbidden actions: ${JSON.stringify(narrativeState.forbidden_actions || [])}
Last scene summary: ${narrativeState.last_unit_summary || 'N/A'}
` : 'No narrative state available'}

## YOUR TASK
Evaluate this scene against the 7 mandatory checks.
For each check, determine if it PASSED or FAILED with a specific reason.

Respond with JSON:
{
  "intent_fulfilled": { "passed": true/false, "reason": "..." },
  "forbidden_respected": { "passed": true/false, "reason": "...", "violations": [] },
  "thread_advanced": { "passed": true/false, "reason": "...", "thread_id": "..." },
  "no_premature_closure": { "passed": true/false, "reason": "...", "closed_threads": [] },
  "tone_coherent": { "passed": true/false, "reason": "...", "deviation": "..." },
  "no_repetition": { "passed": true/false, "reason": "...", "repeated_info": [] },
  "emotional_progression": { "passed": true/false, "reason": "...", "emotional_arc": "..." }
}
`;
}

function calculateValidation(aiChecks: any): ValidationResult {
  const checks = {
    intent_fulfilled: aiChecks.intent_fulfilled || { passed: true },
    forbidden_respected: aiChecks.forbidden_respected || { passed: true },
    thread_advanced: aiChecks.thread_advanced || { passed: true },
    no_premature_closure: aiChecks.no_premature_closure || { passed: true },
    tone_coherent: aiChecks.tone_coherent || { passed: true },
    no_repetition: aiChecks.no_repetition || { passed: true },
    emotional_progression: aiChecks.emotional_progression || { passed: true },
  };

  // Calculate weighted score
  let totalWeight = 0;
  let earnedWeight = 0;

  for (const [check, weight] of Object.entries(CHECK_WEIGHTS)) {
    totalWeight += weight;
    if (checks[check as keyof typeof checks].passed) {
      earnedWeight += weight;
    }
  }

  const score = Math.round((earnedWeight / totalWeight) * 100);

  // Collect issues
  const issues: string[] = [];
  for (const [check, result] of Object.entries(checks)) {
    if (!result.passed && result.reason) {
      issues.push(`${check}: ${result.reason}`);
    }
  }

  // Determine strategy based on score
  let repair_strategy: 'accept' | 'rewrite' | 'partial' | 'reject';
  if (score >= 85) {
    repair_strategy = 'accept';
  } else if (score >= 60) {
    repair_strategy = 'partial';
  } else if (score >= 40) {
    repair_strategy = 'rewrite';
  } else {
    repair_strategy = 'reject';
  }

  // Count passed checks
  const passedChecks = Object.values(checks).filter(c => c.passed).length;
  const valid = passedChecks >= 6 && score >= 85;

  return {
    valid,
    score,
    checks,
    issues,
    repair_strategy
  };
}

const VALIDATOR_SYSTEM_PROMPT = `You are a Hollywood script doctor evaluating scene quality.

Your job is to determine if a scene fulfills its narrative purpose.
Be STRICT but FAIR. A scene can be imperfect but functional.

THE 7 MANDATORY CHECKS:

1. INTENT_FULFILLED: Does the scene accomplish what it was meant to do?
   - Check if the core action/emotion matches the intent_summary
   
2. FORBIDDEN_RESPECTED: Does the scene avoid forbidden actions?
   - Check against the forbidden_actions list
   - Any violation is an automatic fail
   
3. THREAD_ADVANCED: Does the scene advance the specified narrative thread?
   - Check if thread_to_advance is meaningfully progressed
   
4. NO_PREMATURE_CLOSURE: Does the scene avoid closing threads too early?
   - Check if any major plot threads are resolved before their time
   
5. TONE_COHERENT: Is the tone consistent with the project?
   - Check for tonal whiplash or inappropriate style shifts
   
6. NO_REPETITION: Does the scene avoid repeating known information?
   - Compare against last_unit_summary
   - Exposition dumps fail this check
   
7. EMOTIONAL_PROGRESSION: Does the scene have real emotional movement?
   - Characters should end emotionally different than they started
   - Static scenes with no change fail this check

SCORING MINDSET:
- Be generous with "passed" if the intent is mostly met
- Be strict with forbidden_respected (safety-critical)
- Consider subtext and implication, not just explicit text

Respond ONLY with valid JSON.`;
