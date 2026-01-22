/**
 * RESCUE-BLOCK V1.1
 * 
 * Part of the Writer's Room Hollywood Pipeline (P1: Rescue Pass)
 * Fixes specific drift violations without rewriting the entire block
 * 
 * V1.1: Added provider health fallback - if OpenAI is down, falls back to Gemini 3
 * 
 * Input: Original block + Drift violations + Canon Pack
 * Output: Corrected block with minimal changes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess } from "../_shared/auth.ts";
import { buildTokenLimit, MODEL_CONFIG } from "../_shared/model-config.ts";
import { getProviderHealth, recordProviderResult, getProviderFromModel } from "../_shared/provider-health.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// TYPES
// =============================================================================

interface RescueBlockRequest {
  projectId: string;
  blockId: string;
  originalContent: string;
  driftViolations: Array<{
    type: string;
    description: string;
    expected: string;
    found: string;
  }>;
  canonPack: any;
  previousContinuity?: any;
  sceneCards?: any[];
}

// =============================================================================
// PROMPT
// =============================================================================

function buildRescuePrompt(
  originalContent: string,
  driftViolations: any[],
  canonPack: any,
  previousContinuity?: any,
  sceneCards?: any[]
): string {
  const violationsText = driftViolations.map((v, i) => 
    `${i + 1}. [${v.type.toUpperCase()}] ${v.description}\n   Esperado: ${v.expected}\n   Encontrado: ${v.found}`
  ).join('\n\n');
  
  const prevContext = previousContinuity 
    ? `\n\n## CONTINUITY STATE (ANTERIOR)\n${JSON.stringify(previousContinuity, null, 2)}`
    : '';
    
  const cardsContext = sceneCards?.length
    ? `\n\n## SCENE CARDS (REFERENCIA)\n${JSON.stringify(sceneCards, null, 2)}`
    : '';
  
  return `
# RESCUE PASS - Corrección de Deriva

## PROBLEMAS DETECTADOS
${violationsText}

## CANON PACK (INMUTABLE)
${JSON.stringify(canonPack, null, 2)}
${prevContext}
${cardsContext}

## BLOQUE ORIGINAL (para corregir)
${originalContent}

## INSTRUCCIONES ESTRICTAS

1. **MANTÉN** la trama, eventos y estructura del bloque original
2. **CORRIGE SOLO** las inconsistencias detectadas arriba
3. **NO AÑADAS** elementos nuevos que no estaban en el original
4. **NO ELIMINES** escenas o diálogos importantes
5. **ASEGURA** que el continuity_summary final sea coherente con canon

### CORRECCIONES ESPECÍFICAS:
${driftViolations.map(v => `- ${v.type}: cambiar "${v.found}" por "${v.expected}"`).join('\n')}

## FORMATO DE RESPUESTA JSON

{
  "corrected_content": "[El bloque corregido completo]",
  "corrections_made": [
    {
      "type": "character/timeline/continuity/voice",
      "original": "texto original",
      "corrected": "texto corregido"
    }
  ],
  "continuity_summary": {
    "time_of_day": "...",
    "date": "...",
    "location_current": "...",
    "character_states": {},
    "open_threads": [],
    "props_in_hand": [],
    "next_scene_intent": "..."
  }
}

Responde SOLO con el JSON.
`.trim();
}

// =============================================================================
// AI CALL (uses gpt-5.2 for best quality rescue, fallback to Gemini 3 if unavailable)
// =============================================================================

async function callAI(prompt: string, supabase: any, timeout = 80000): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  
  // V1.1: Check provider health and select model accordingly
  const providerHealth = await getProviderHealth(supabase);
  
  // Rescue prefers GPT-5.2 for quality, but fallback to Gemini 3 if OpenAI is down
  const model = providerHealth.openaiOk 
    ? 'openai/gpt-5.2' 
    : 'google/gemini-3-flash-preview';
  
  console.log(`[rescue-block] Using model: ${model} (openaiOk: ${providerHealth.openaiOk}, geminiOk: ${providerHealth.geminiOk})`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const startTime = Date.now();

  try {
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        ...buildTokenLimit(model, MODEL_CONFIG.LIMITS.OUTPUT_LIMITS.SCRIPT_BLOCK || 4500),
        temperature: 0.5, // Balanced for corrections
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      // Record failure for circuit breaker
      await recordProviderResult(supabase, getProviderFromModel(model), false, errorText, latencyMs, model);
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    // Record success for circuit breaker
    await recordProviderResult(supabase, getProviderFromModel(model), true, undefined, latencyMs, model);
    
    let content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    
    // Record failure for circuit breaker
    await recordProviderResult(supabase, getProviderFromModel(model), false, error.message, latencyMs, model);
    
    if (error.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Request exceeded timeout');
    }
    throw error;
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let authContext;
    try {
      authContext = await requireAuthOrDemo(req);
    } catch (authError: any) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: authError.message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RescueBlockRequest = await req.json();
    const { 
      projectId, 
      blockId,
      originalContent,
      driftViolations,
      canonPack,
      previousContinuity,
      sceneCards
    } = body;

    if (!projectId || !originalContent || !driftViolations?.length || !canonPack) {
      return new Response(
        JSON.stringify({ error: 'MISSING_PARAMS', message: 'projectId, originalContent, driftViolations, and canonPack are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      await requireProjectAccess(authContext.supabase, authContext.userId, projectId);
    } catch (accessError: any) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: accessError.message }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[rescue-block] Rescuing block ${blockId} with ${driftViolations.length} violations`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build prompt and call AI
    const prompt = buildRescuePrompt(
      originalContent,
      driftViolations,
      canonPack,
      previousContinuity,
      sceneCards
    );

    let rescueResult: any;
    try {
      rescueResult = await callAI(prompt, supabase);
    } catch (aiError: any) {
      console.error('[rescue-block] AI error:', aiError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI_RESCUE_FAILED', 
          message: aiError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const correctedContent = rescueResult.corrected_content || rescueResult.correctedContent;
    const correctionsMade = rescueResult.corrections_made || rescueResult.correctionsMade || [];
    const continuitySummary = rescueResult.continuity_summary || rescueResult.continuitySummary;

    if (!correctedContent) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'EMPTY_RESULT', 
          message: 'AI returned no corrected content' 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update block with rescued content
    if (blockId) {
      await supabase
        .from('generation_blocks')
        .update({ 
          status: 'done',
          output_data: { 
            content: correctedContent,
            rescued: true,
            corrections: correctionsMade
          },
          continuity_summary: continuitySummary,
          model_used: 'openai/gpt-5.2',
          model_reason: 'RESCUE_PASS',
          completed_at: new Date().toISOString()
        })
        .eq('id', blockId);
    }

    console.log(`[rescue-block] Block rescued successfully with ${correctionsMade.length} corrections`);

    return new Response(
      JSON.stringify({
        success: true,
        blockId,
        correctedContent,
        correctionsMade,
        continuitySummary,
        originalLength: originalContent.length,
        correctedLength: correctedContent.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[rescue-block] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'INTERNAL_ERROR', 
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
