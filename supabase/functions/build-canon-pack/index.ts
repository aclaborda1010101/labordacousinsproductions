/**
 * BUILD-CANON-PACK V1.0
 * 
 * Part of the Writer's Room Hollywood Pipeline (P0: Canon Lock)
 * Generates a 1-2k token context pack for consistent episode generation
 * 
 * Input: Bible + Episode Outline + Character states
 * Output: Compact canon pack with voice rules, cast, timeline, continuity locks
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthOrDemo, requireProjectAccess } from "../_shared/auth.ts";
import { buildTokenLimit, MODEL_CONFIG } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// TYPES
// =============================================================================

interface BuildCanonPackRequest {
  projectId: string;
  episodeNumber?: number;
  packType: 'season' | 'episode' | 'act';
  bibleSummary: string;
  outlineSummary: string;
  characterStates?: Record<string, any>;
  previousPack?: any;
}

interface CanonPack {
  voice_tone_rules: string[];
  active_cast: Record<string, {
    role: string;
    traits: string[];
    current_goal: string;
    relationships: Record<string, string>;
  }>;
  timeline_state: {
    current_date: string;
    time_of_day: string;
    story_day: number;
    emotional_temperature: string;
  };
  active_props_locs: string[];
  continuity_locks: string[];
}

// =============================================================================
// PROMPT
// =============================================================================

function buildCanonPackPrompt(
  bibleSummary: string,
  outlineSummary: string,
  packType: string,
  characterStates?: Record<string, any>
): string {
  const charStatesBlock = characterStates 
    ? `\n## ESTADOS ACTUALES DE PERSONAJES\n${JSON.stringify(characterStates, null, 2)}`
    : '';

  return `
# TAREA: Generar Canon Pack Compacto (máx 1500 tokens)

## BIBLE SUMMARY
${bibleSummary}

## OUTLINE SUMMARY  
${outlineSummary}
${charStatesBlock}

## TIPO DE PACK: ${packType.toUpperCase()}

## INSTRUCCIONES

Genera un pack canónico COMPACTO que contenga SOLO lo esencial para mantener coherencia narrativa.
Este pack será inyectado en cada bloque de generación de guion.

REGLAS:
1. Máximo 1500 tokens total
2. Solo información CRÍTICA para continuidad
3. Reglas concretas, no descripciones
4. Personajes solo con traits activos para este ${packType}
5. invariants_by_character: 3-6 bullets INMUTABLES por personaje principal

## FORMATO JSON OBLIGATORIO

{
  "voice_tone_rules": [
    "Diálogos cortos, máximo 3 líneas",
    "Descripciones visuales, no explicativas",
    "Subtexto > texto literal",
    "Ritmo: escenas de 2-3 páginas máximo",
    "Tono: [específico del proyecto]"
  ],
  "active_cast": {
    "NOMBRE_PERSONAJE": {
      "role": "protagonista|antagonista|soporte",
      "traits": ["trait1", "trait2"],
      "current_goal": "objetivo actual específico",
      "relationships": {
        "otro_personaje": "tipo de relación"
      }
    }
  },
  "timeline_state": {
    "current_date": "Día X de la historia",
    "time_of_day": "DAY|NIGHT|DAWN|DUSK",
    "story_day": 1,
    "emotional_temperature": "tenso|esperanzador|desesperado|etc"
  },
  "active_props_locs": [
    "PROP: descripción breve",
    "LOC: descripción breve"
  ],
  "continuity_locks": [
    "NO puede morir X hasta episodio Y",
    "X NO sabe que Y es su hermano",
    "El secreto Z no se revela aún"
  ],
  "invariants_by_character": {
    "PERSONAJE_1": [
      "Siempre lleva el anillo de su madre",
      "Cojea de la pierna izquierda",
      "Nunca dice malas palabras",
      "Tiene 35 años exactos",
      "Es médica, no enfermera",
      "Pelo negro corto, nunca rubio"
    ],
    "PERSONAJE_2": [
      "Cicatriz en la mejilla derecha",
      "Acento del norte",
      "Zurdo"
    ]
  },
  "locked_fields": [
    "character_names",
    "character_ages", 
    "timeline_base",
    "key_relationships",
    "death_schedule"
  ]
}

Responde SOLO con el JSON.
`.trim();
}

// =============================================================================
// AI CALL
// =============================================================================

async function callAI(prompt: string, timeout = 60000): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
  const model = 'openai/gpt-5-mini'; // Fast model for pack generation

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
        ...buildTokenLimit(model, 2000),
        temperature: 0.5,
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
      throw new Error('No valid JSON found in AI response');
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

    const body: BuildCanonPackRequest = await req.json();
    const { 
      projectId, 
      episodeNumber,
      packType,
      bibleSummary, 
      outlineSummary,
      characterStates,
      previousPack
    } = body;

    if (!projectId || !bibleSummary || !outlineSummary || !packType) {
      return new Response(
        JSON.stringify({ error: 'MISSING_PARAMS', message: 'projectId, packType, bibleSummary, and outlineSummary are required' }),
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

    console.log(`[build-canon-pack] Building ${packType} pack for project ${projectId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build prompt and call AI
    const prompt = buildCanonPackPrompt(
      bibleSummary,
      outlineSummary,
      packType,
      characterStates
    );

    let canonPack: CanonPack;
    try {
      canonPack = await callAI(prompt);
    } catch (aiError: any) {
      console.error('[build-canon-pack] AI error:', aiError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI_GENERATION_FAILED', 
          message: aiError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Estimate tokens (rough: 4 chars per token)
    const packJson = JSON.stringify(canonPack);
    const tokenEstimate = Math.ceil(packJson.length / 4);

    // Upsert canon pack to database
    const { data: savedPack, error: saveError } = await supabase
      .from('canon_packs')
      .upsert({
        project_id: projectId,
        pack_type: packType,
        episode_number: episodeNumber,
        voice_tone_rules: canonPack.voice_tone_rules,
        active_cast: canonPack.active_cast,
        timeline_state: canonPack.timeline_state,
        active_props_locs: canonPack.active_props_locs,
        continuity_locks: canonPack.continuity_locks,
        token_estimate: tokenEstimate,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'project_id,pack_type,episode_number,act_number'
      })
      .select()
      .single();

    if (saveError) {
      console.error('[build-canon-pack] Save error:', saveError);
      // Still return the pack even if save fails
    }

    console.log(`[build-canon-pack] Pack generated: ${tokenEstimate} tokens estimated`);

    return new Response(
      JSON.stringify({
        success: true,
        packId: savedPack?.id,
        canonPack,
        tokenEstimate,
        packType,
        episodeNumber
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[build-canon-pack] Error:', error);
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
