/**
 * DETECT-CANON-DRIFT V1.0
 * 
 * Part of the Writer's Room Hollywood Pipeline (P0: Drift Detection)
 * Validates generated content against canon pack to detect inconsistencies
 * 
 * Input: Generated block + Canon Pack + Previous continuity
 * Output: Drift analysis with specific violations
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess } from "../_shared/auth.ts";
import { buildTokenLimit } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// TYPES
// =============================================================================

interface DetectDriftRequest {
  projectId: string;
  blockId: string;
  generatedContent: string;
  canonPack: {
    voice_tone_rules: string[];
    active_cast: Record<string, any>;
    timeline_state: any;
    continuity_locks: string[];
  };
  previousContinuity?: {
    time_of_day: string;
    character_states: Record<string, any>;
    open_threads: string[];
  };
}

interface DriftViolation {
  type: 'character' | 'timeline' | 'continuity' | 'voice';
  severity: 'warn' | 'error';
  description: string;
  expected: string;
  found: string;
}

interface DriftResult {
  hasDrift: boolean;
  driftScore: number; // 0-100, higher = more drift
  violations: DriftViolation[];
  recommendation: 'accept' | 'retry' | 'rescue';
}

// =============================================================================
// PROMPT
// =============================================================================

function buildDriftDetectionPrompt(
  generatedContent: string,
  canonPack: any,
  previousContinuity?: any
): string {
  const prevContext = previousContinuity 
    ? `\n\n## CONTINUITY ANTERIOR\n${JSON.stringify(previousContinuity, null, 2)}`
    : '';
  
  // P0.5: Extract invariants for precise checking
  const invariantsBlock = canonPack.invariants_by_character
    ? `\n\n## INVARIANTS POR PERSONAJE (NUNCA PUEDEN CAMBIAR)\n${JSON.stringify(canonPack.invariants_by_character, null, 2)}`
    : '';
  
  return `
# TAREA: Detectar Canon Drift

## CANON PACK (REFERENCIA INMUTABLE)
${JSON.stringify(canonPack, null, 2)}
${invariantsBlock}
${prevContext}

## CONTENIDO GENERADO A VALIDAR
${generatedContent.slice(0, 6000)}

## INSTRUCCIONES

Analiza el contenido buscando inconsistencias con el Canon Pack.

### CHECKS PRIORITARIOS (P0.5):
1. **INVARIANTS**: Cada personaje debe cumplir sus invariants exactamente
2. **NOMBRES**: Deben coincidir exactamente (María ≠ Maria)
3. **TIMELINE**: Coherencia temporal estricta
4. **RELATIONSHIPS**: Relaciones según canon
5. **CONTINUITY_LOCKS**: Reglas inmutables

### TIPOS DE DRIFT:
- CHARACTER: Actúa fuera de carácter, nombre mal escrito
- TIMELINE: Inconsistencia temporal
- CONTINUITY: Viola continuity_lock
- VOICE: Viola reglas de tono
- INVARIANT: Viola un invariant de personaje

### SCORING:
- 0-20: Aceptable
- 21-50: Retry recomendado
- 51-100: Rescue obligatorio

## FORMATO JSON

{
  "hasDrift": true/false,
  "driftScore": 0-100,
  "violations": [
    {
      "type": "character|timeline|continuity|voice|invariant",
      "severity": "warn|error",
      "description": "Descripción del problema",
      "expected": "Lo que debería ser",
      "found": "Lo encontrado"
    }
  ],
  "recommendation": "accept|retry|rescue"
}

Responde SOLO con el JSON.
`.trim();
}

// =============================================================================
// AI CALL
// =============================================================================

async function callAI(prompt: string, timeout = 45000): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = 'openai/gpt-5-mini'; // Fast model for validation

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

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
        ...buildTokenLimit(model, 1500),
        temperature: 0.3, // Low temp for consistent analysis
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    let content = data.choices?.[0]?.message?.content || '';
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If no JSON, assume no drift
      return {
        hasDrift: false,
        driftScore: 0,
        violations: [],
        recommendation: 'accept'
      };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    clearTimeout(timeoutId);
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

    const body: DetectDriftRequest = await req.json();
    const { 
      projectId, 
      blockId,
      generatedContent,
      canonPack,
      previousContinuity
    } = body;

    if (!projectId || !generatedContent || !canonPack) {
      return new Response(
        JSON.stringify({ error: 'MISSING_PARAMS', message: 'projectId, generatedContent, and canonPack are required' }),
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

    console.log(`[detect-canon-drift] Checking drift for block ${blockId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build prompt and call AI
    const prompt = buildDriftDetectionPrompt(
      generatedContent,
      canonPack,
      previousContinuity
    );

    let driftResult: DriftResult;
    try {
      driftResult = await callAI(prompt);
    } catch (aiError: any) {
      console.error('[detect-canon-drift] AI error:', aiError);
      // On AI error, assume no drift to avoid blocking
      driftResult = {
        hasDrift: false,
        driftScore: 0,
        violations: [],
        recommendation: 'accept'
      };
    }

    // Update block with drift info if blockId provided
    if (blockId && driftResult.hasDrift) {
      await supabase.rpc('increment_drift_warning', { p_block_id: blockId });
    }

    console.log(`[detect-canon-drift] Result: score=${driftResult.driftScore}, recommendation=${driftResult.recommendation}`);

    return new Response(
      JSON.stringify({
        success: true,
        ...driftResult
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[detect-canon-drift] Error:', error);
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
