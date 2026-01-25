/**
 * EXPAND-BEATS-TO-SCENES V1.0
 * 
 * Takes narrative beats from an outline (ACT_I, ACT_II, ACT_III) and expands
 * each beat into 1-3 concrete scenes with unique sluglines and summaries.
 * 
 * This ensures films have proper scene density (25-45 scenes) instead of
 * the sparse 5-8 beats that the outline generates.
 * 
 * Input: projectId + outline with ACT_I/II/III beats
 * Output: episode_beats[0].scenes array with expanded scenes
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonRobust } from "../_shared/parse-json-robust.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// ============================================================================
// SCENE DENSITY CALCULATIONS
// ============================================================================

interface DensityTarget {
  minScenes: number;
  maxScenes: number;
  avgSceneDurationMin: number;
}

function calculateDensityTarget(durationMin: number, profile: string): DensityTarget {
  // Scene duration targets by profile
  const profiles: Record<string, { minDuration: number; maxDuration: number }> = {
    indie: { minDuration: 3.0, maxDuration: 4.5 },
    standard: { minDuration: 2.0, maxDuration: 3.5 },
    hollywood: { minDuration: 1.5, maxDuration: 2.5 },
  };

  const p = profiles[profile] || profiles.standard;
  
  return {
    minScenes: Math.ceil(durationMin / p.maxDuration),
    maxScenes: Math.ceil(durationMin / p.minDuration),
    avgSceneDurationMin: (p.minDuration + p.maxDuration) / 2,
  };
}

// ============================================================================
// BEAT EXTRACTION
// ============================================================================

interface Beat {
  act: 'I' | 'II' | 'III';
  beat_number: number;
  event: string;
  agent?: string;
  consequence?: string;
  location_hint?: string;
  situation_detail?: {
    physical_context?: string;
    action?: string;
    goal?: string;
    obstacle?: string;
    state_change?: string;
  };
}

function extractBeatsFromOutline(outline: any): Beat[] {
  const beats: Beat[] = [];
  
  const acts = [
    { key: 'ACT_I', label: 'I' as const },
    { key: 'ACT_II', label: 'II' as const },
    { key: 'ACT_III', label: 'III' as const },
  ];

  for (const act of acts) {
    const actData = outline[act.key];
    if (!actData) continue;

    const actBeats = actData.beats || actData.detailed_beats || [];
    for (const b of actBeats) {
      beats.push({
        act: act.label,
        beat_number: b.beat_number || beats.length + 1,
        event: b.event || b.description || '',
        agent: b.agent || b.character || '',
        consequence: b.consequence || b.result || '',
        location_hint: b.situation_detail?.physical_context || '',
        situation_detail: b.situation_detail,
      });
    }

    // Also extract special turning points as beats
    if (act.label === 'I') {
      if (actData.inciting_incident) {
        beats.push({
          act: 'I',
          beat_number: 999,
          event: typeof actData.inciting_incident === 'string' 
            ? actData.inciting_incident 
            : actData.inciting_incident.event || 'Incidente incitador',
          agent: actData.inciting_incident.agent || '',
          consequence: actData.inciting_incident.consequence || '',
        });
      }
    }
    
    if (act.label === 'II') {
      if (actData.midpoint_reversal) {
        beats.push({
          act: 'II',
          beat_number: 998,
          event: typeof actData.midpoint_reversal === 'string'
            ? actData.midpoint_reversal
            : actData.midpoint_reversal.event || 'Giro de mitad',
          agent: actData.midpoint_reversal.agent || '',
          consequence: actData.midpoint_reversal.consequence || '',
        });
      }
      if (actData.all_is_lost_moment) {
        beats.push({
          act: 'II',
          beat_number: 997,
          event: typeof actData.all_is_lost_moment === 'string'
            ? actData.all_is_lost_moment
            : actData.all_is_lost_moment.event || 'Todo está perdido',
          agent: actData.all_is_lost_moment.agent || '',
          consequence: actData.all_is_lost_moment.consequence || '',
        });
      }
    }

    if (act.label === 'III') {
      if (actData.climax) {
        beats.push({
          act: 'III',
          beat_number: 996,
          event: typeof actData.climax === 'string' ? actData.climax : 'Clímax',
          agent: '',
          consequence: '',
        });
      }
    }
  }

  // Sort by act then beat number
  const actOrder = { 'I': 1, 'II': 2, 'III': 3 };
  beats.sort((a, b) => {
    if (actOrder[a.act] !== actOrder[b.act]) {
      return actOrder[a.act] - actOrder[b.act];
    }
    return a.beat_number - b.beat_number;
  });

  return beats;
}

// ============================================================================
// AI EXPANSION PROMPT
// ============================================================================

function buildExpansionPrompt(
  beats: Beat[],
  outline: any,
  target: DensityTarget,
  durationMin: number
): string {
  const title = outline.title || 'Sin título';
  const logline = outline.logline || outline.synopsis?.substring(0, 200) || '';
  const genre = outline.genre || 'Drama';
  const tone = outline.tone || 'Cinematográfico';

  const locations = (outline.main_locations || outline.locations || [])
    .map((l: any) => l.name || l)
    .join(', ');

  const characters = (outline.main_characters || outline.characters || outline.cast || [])
    .map((c: any) => `${c.name} (${c.role || 'personaje'})`)
    .join(', ');

  const beatsText = beats.map((b, i) => 
    `[Beat ${i + 1} - Acto ${b.act}]: ${b.event}${b.agent ? ` (${b.agent})` : ''}${b.consequence ? ` → ${b.consequence}` : ''}`
  ).join('\n');

  return `
# TAREA: Expandir ${beats.length} beats narrativos en ${target.minScenes}-${target.maxScenes} escenas

## CONTEXTO DEL PROYECTO
- Título: ${title}
- Logline: ${logline}
- Género: ${genre}
- Tono: ${tone}
- Duración: ${durationMin} minutos
- Locaciones disponibles: ${locations}
- Personajes: ${characters}

## BEATS NARRATIVOS A EXPANDIR
${beatsText}

## REGLAS DE EXPANSIÓN

1. **Cada beat debe generar 1-3 escenas concretas**
   - Un beat simple → 1 escena
   - Un beat con desarrollo → 2 escenas  
   - Un beat épico/clímax → 2-3 escenas

2. **Cada escena debe tener:**
   - \`slugline\`: Formato profesional (INT./EXT. LOCACIÓN - MOMENTO)
   - \`summary\`: 1-2 oraciones describiendo la acción
   - \`characters_present\`: Array de nombres de personajes
   - \`duration_estimate_sec\`: 90-210 segundos típico
   - \`beat_source\`: Número del beat que genera esta escena
   - \`act\`: I, II o III

3. **Variedad de locaciones:**
   - Usa las locaciones del proyecto
   - Evita repetir la misma locación en escenas consecutivas
   - Alterna INT/EXT para variedad visual

4. **Duración total:**
   - Las escenas deben sumar aproximadamente ${durationMin} minutos
   - Promedio: ${Math.round(target.avgSceneDurationMin * 60)} segundos por escena

## FORMATO DE RESPUESTA

Responde ÚNICAMENTE con un JSON válido:

{
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT. SALÓN DE GASPAR - NOCHE",
      "summary": "Gaspar prepara su modesta cena mientras reflexiona sobre su día.",
      "characters_present": ["Gaspar"],
      "duration_estimate_sec": 120,
      "beat_source": 1,
      "act": "I"
    },
    ...
  ],
  "total_duration_sec": 5100,
  "expansion_notes": "Descripción breve de las decisiones de expansión"
}

GENERA EXACTAMENTE ENTRE ${target.minScenes} Y ${target.maxScenes} ESCENAS.
`.trim();
}

// ============================================================================
// AI CALL
// ============================================================================

async function callAI(prompt: string): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    console.log('[expand-beats-to-scenes] Calling AI for scene expansion...');
    
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_completion_tokens: 16000,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    let content = '';
    if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.output_text) {
      content = data.output_text;
    } else {
      content = JSON.stringify(data);
    }

    const parseResult = parseJsonRobust(content, 'expand-beats-to-scenes');
    
    if (!parseResult.ok || !parseResult.json) {
      console.error('[expand-beats-to-scenes] JSON parse failed:', parseResult.error);
      throw new Error(`JSON_PARSE_FAILED: ${parseResult.error}`);
    }
    
    return parseResult.json;
  } catch (error: any) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      projectId, 
      densityProfile = 'standard',
      durationMin = 90,
    } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'MISSING_PROJECT_ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[expand-beats-to-scenes] Starting for project ${projectId}, profile: ${densityProfile}, duration: ${durationMin}min`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current outline
    const { data: outlineData, error: outlineError } = await supabase
      .from('project_outlines')
      .select('id, outline_json, outline_parts')
      .eq('project_id', projectId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (outlineError || !outlineData?.outline_json) {
      return new Response(
        JSON.stringify({ success: false, error: 'NO_OUTLINE_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const outline = outlineData.outline_json;

    // Extract beats
    const beats = extractBeatsFromOutline(outline);
    console.log(`[expand-beats-to-scenes] Extracted ${beats.length} beats from outline`);

    if (beats.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'NO_BEATS_FOUND', message: 'El outline no tiene beats en ACT_I/II/III' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate density target
    const target = calculateDensityTarget(durationMin, densityProfile);
    console.log(`[expand-beats-to-scenes] Target: ${target.minScenes}-${target.maxScenes} scenes`);

    // Build and call AI
    const prompt = buildExpansionPrompt(beats, outline, target, durationMin);
    const aiResult = await callAI(prompt);

    const scenes = aiResult.scenes || [];
    console.log(`[expand-beats-to-scenes] AI generated ${scenes.length} scenes`);

    // Validate scene count
    if (scenes.length < target.minScenes * 0.8) {
      console.warn(`[expand-beats-to-scenes] Scene count ${scenes.length} below target ${target.minScenes}`);
    }

    // Update outline with episode_beats containing scenes
    const episodeBeats = [{
      episode_index: 0,
      title: outline.title || 'Película',
      scenes: scenes.map((s: any, idx: number) => ({
        scene_index: idx,
        scene_number: s.scene_number || idx + 1,
        slugline: s.slugline,
        summary: s.summary,
        characters_present: s.characters_present || [],
        duration_estimate_sec: s.duration_estimate_sec || 120,
        beat_source: s.beat_source,
        act: s.act,
      })),
      turning_points: [], // Will be populated from beats if needed
    }];

    // Save to outline
    const updatedOutline = {
      ...outline,
      episode_beats: episodeBeats,
    };

    const { error: updateError } = await supabase
      .from('project_outlines')
      .update({
        outline_json: updatedOutline,
        outline_parts: {
          ...outlineData.outline_parts,
          scene_expansion: {
            expanded_at: new Date().toISOString(),
            beats_count: beats.length,
            scenes_count: scenes.length,
            duration_min: durationMin,
            profile: densityProfile,
          }
        }
      })
      .eq('id', outlineData.id);

    if (updateError) {
      console.error('[expand-beats-to-scenes] Failed to save:', updateError);
      throw new Error(`DB_UPDATE_FAILED: ${updateError.message}`);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[expand-beats-to-scenes] Complete in ${durationMs}ms. ${beats.length} beats → ${scenes.length} scenes`);

    return new Response(
      JSON.stringify({
        success: true,
        beatsCount: beats.length,
        scenesCount: scenes.length,
        targetRange: `${target.minScenes}-${target.maxScenes}`,
        durationMs,
        expansionNotes: aiResult.expansion_notes,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[expand-beats-to-scenes] Error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'EXPANSION_FAILED', 
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
