/**
 * OUTLINE PATCH EDGE FUNCTION
 * 
 * Auto-repairs an outline to meet density requirements.
 * Takes required_fixes[] from density-precheck and expands the outline.
 * 
 * Uses GPT-5.2 for creative expansion with strict constraints.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonSafe } from "../_shared/llmJson.ts";
import { 
  validateDensity, 
  getDensityProfile,
  type RequiredFix,
  type DensityProfile 
} from "../_shared/density-validator.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PATCH_SYSTEM_PROMPT = `Eres un Showrunner Editor. Tu misión es EXPANDIR outlines para cumplir mínimos de densidad narrativa.

REGLAS ABSOLUTAS:
1. MANTENER el concepto original, tono y tesis
2. PRESERVAR personajes principales y sus arcos existentes
3. AÑADIR lo MÍNIMO necesario para cumplir mínimos
4. Cada nuevo elemento debe tener FUNCIÓN NARRATIVA clara
5. NO cambiar turning points existentes
6. NO eliminar contenido - solo AÑADIR

FORMATO DE SALIDA: JSON válido con el outline expandido.`;

interface PatchRequest {
  projectId: string;
  requiredFixes: RequiredFix[];
  densityOverrides?: Partial<DensityProfile>;
  formatProfile?: string;
  maxIterations?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { 
      projectId, 
      requiredFixes, 
      densityOverrides, 
      formatProfile = 'serie_drama',
      maxIterations = 2
    }: PatchRequest = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'projectId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!requiredFixes || requiredFixes.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'NO_FIXES_NEEDED',
          message: 'No se proporcionaron fixes requeridos'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[outline-patch] Starting for project:', projectId, 'with', requiredFixes.length, 'fixes');

    // Fetch current outline
    const { data: outlineData, error: outlineError } = await supabase
      .from('project_outlines')
      .select('id, outline_json, version')
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (outlineError || !outlineData?.outline_json) {
      return new Response(
        JSON.stringify({ error: 'NO_OUTLINE_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const originalOutline = outlineData.outline_json as Record<string, unknown>;
    const profile = getDensityProfile(formatProfile, densityOverrides);

    // Build the patch prompt
    const fixesDescription = requiredFixes.map(fix => 
      `- ${fix.type}: ${fix.title}\n  Razón: ${fix.why_needed}\n  Dónde: ${fix.where_to_apply}`
    ).join('\n');

    const userPrompt = `
OUTLINE ACTUAL:
${JSON.stringify(originalOutline, null, 2)}

═══════════════════════════════════════════════════════════════
FIXES REQUERIDOS (${requiredFixes.length}):
═══════════════════════════════════════════════════════════════
${fixesDescription}

═══════════════════════════════════════════════════════════════
MÍNIMOS A CUMPLIR:
═══════════════════════════════════════════════════════════════
- Personajes totales: ≥ ${profile.min_characters_total}
- Personajes secundarios: ≥ ${profile.min_supporting_characters}
- Antagonistas: ≥ ${profile.min_antagonists}
- Localizaciones: ≥ ${profile.min_locations}
- Tramas totales: ≥ ${profile.min_threads_total}
- Tramas secundarias: ≥ ${profile.min_secondary_threads}
- Escenas por episodio (estimadas): ≥ ${profile.min_scenes_per_episode}

═══════════════════════════════════════════════════════════════
INSTRUCCIONES:
═══════════════════════════════════════════════════════════════
1. Implementa TODOS los fixes requeridos
2. Para cada nuevo personaje: nombre, rol, función narrativa, relación con protagonista
3. Para cada nueva localización: nombre, descripción visual, función dramática
4. Para cada nueva trama: nombre, premisa, conexión con trama principal
5. Si añades turning points, deben tener: agent, event, consequence
6. Devuelve el OUTLINE COMPLETO expandido en JSON válido

IMPORTANTE: Devuelve SOLO el JSON del outline expandido, sin explicaciones.`;

    // Call LLM to patch
    let patchedOutline = originalOutline;
    let iteration = 0;
    let finalStatus: 'PASS' | 'FAIL' = 'FAIL';
    let lastCheckScore = 0;

    while (iteration < maxIterations && finalStatus === 'FAIL') {
      iteration++;
      console.log(`[outline-patch] Iteration ${iteration}/${maxIterations}`);

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: 'openai/gpt-5.2',
          max_completion_tokens: 8000,
          messages: [
            { role: "system", content: PATCH_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[outline-patch] LLM error:', response.status, errorText);
        throw new Error(`LLM error: ${response.status}`);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content || '';

      // Parse the response
      const parseResult = parseJsonSafe(content, 'outline-patch');
      
      if (parseResult.ok && parseResult.json) {
        patchedOutline = parseResult.json as Record<string, unknown>;
        
        // Re-validate density
        const checkResult = validateDensity(patchedOutline, profile);
        finalStatus = checkResult.status;
        lastCheckScore = checkResult.score;
        
        console.log(`[outline-patch] Iteration ${iteration} result:`, {
          status: finalStatus,
          score: lastCheckScore,
          remainingFixes: checkResult.required_fixes.length
        });
        
        if (finalStatus === 'PASS') {
          break;
        }
      } else {
        console.error('[outline-patch] Parse failed:', parseResult.warnings);
        // Continue with original on parse failure
        break;
      }
    }

    if (finalStatus === 'FAIL') {
      console.log('[outline-patch] Could not achieve PASS after', iteration, 'iterations');
      return new Response(
        JSON.stringify({
          success: false,
          message: `No se logró cumplir la densidad después de ${iteration} iteraciones`,
          score: lastCheckScore,
          outline: patchedOutline // Return best effort
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save the patched outline
    const newVersion = (outlineData.version || 1) + 1;
    
    const { error: insertError } = await supabase
      .from('project_outlines')
      .insert({
        project_id: projectId,
        outline_json: patchedOutline,
        version: newVersion,
        status: 'completed',
        generation_model: 'openai/gpt-5.2',
        generation_stage: 'density_patched'
      });

    if (insertError) {
      console.error('[outline-patch] Insert error:', insertError);
      // Don't fail - return the patched outline anyway
    }

    // Log the patch event (fire and forget)
    try {
      await supabase.from('editorial_events').insert({
        project_id: projectId,
        event_type: 'outline_patched',
        asset_type: 'outline',
        payload: {
          fixes_applied: requiredFixes.length,
          iterations: iteration,
          final_score: lastCheckScore,
          new_version: newVersion,
          timestamp: new Date().toISOString()
        }
      });
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Outline expandido exitosamente (v${newVersion})`,
        score: lastCheckScore,
        iterations: iteration,
        outline: patchedOutline
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[outline-patch] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal error',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
