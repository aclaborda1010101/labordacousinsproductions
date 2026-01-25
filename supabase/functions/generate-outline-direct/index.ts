/**
 * GENERATE-OUTLINE-DIRECT V1.1
 * 
 * Simplified single-call outline generation.
 * No chunking, no micro-stages - just one powerful prompt to the LLM.
 * 
 * Philosophy:
 * - 1 call = 1 complete outline
 * - Warnings instead of blockers
 * - Always save result, let user decide
 * 
 * V1.1: Added robust JSON parsing to handle malformed AI responses
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonRobust } from "../_shared/parse-json-robust.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// DENSITY PROFILES - Flexible, user-selectable
// ============================================================================

interface DensityProfile {
  id: string;
  label: string;
  min_characters: number;
  min_locations: number;
  min_beats: number;
  min_scenes: number;
  min_setpieces: number;
  min_sequences: number;
}

const DENSITY_PROFILES: Record<string, DensityProfile> = {
  indie: {
    id: 'indie',
    label: 'Indie / Autor',
    min_characters: 6,
    min_locations: 6,
    min_beats: 18,
    min_scenes: 25,
    min_setpieces: 5,
    min_sequences: 4,
  },
  standard: {
    id: 'standard',
    label: 'Estándar',
    min_characters: 10,
    min_locations: 10,
    min_beats: 24,
    min_scenes: 35,
    min_setpieces: 8,
    min_sequences: 6,
  },
  hollywood: {
    id: 'hollywood',
    label: 'Hollywood',
    min_characters: 15,
    min_locations: 15,
    min_beats: 30,
    min_scenes: 45,
    min_setpieces: 12,
    min_sequences: 8,
  },
};

// Film duration-based scene targets
function getFilmSceneTarget(durationMin: number, profile: DensityProfile): { min: number; max: number } {
  // Average scene duration by profile
  const avgSceneDuration: Record<string, number> = {
    indie: 3.5,    // 3.5 min/scene average
    standard: 2.5, // 2.5 min/scene average
    hollywood: 2.0 // 2 min/scene average
  };
  
  const avgDuration = avgSceneDuration[profile.id] || 2.5;
  const targetScenes = Math.ceil(durationMin / avgDuration);
  
  return {
    min: Math.max(profile.min_scenes, Math.floor(targetScenes * 0.8)),
    max: Math.ceil(targetScenes * 1.2),
  };
}

// ============================================================================
// OUTLINE GENERATION PROMPT
// ============================================================================

function buildOutlinePrompt(
  idea: string,
  format: 'film' | 'series',
  profile: DensityProfile,
  genre?: string,
  tone?: string,
  duration?: number
): string {
  const formatLabel = format === 'film' ? 'PELÍCULA' : 'SERIE';
  const durationMin = duration || (format === 'film' ? 90 : 45);
  const durationStr = duration ? `${duration} minutos` : format === 'film' ? '90-120 minutos' : '6-10 episodios de 45 min';
  
  // Calculate scene targets for films
  const sceneTarget = format === 'film' ? getFilmSceneTarget(durationMin, profile) : null;
  const sceneInstruction = sceneTarget 
    ? `\n\n## CRÍTICO: DENSIDAD DE ESCENAS PARA ${durationMin} MINUTOS
Esta película de ${durationMin} minutos requiere entre ${sceneTarget.min} y ${sceneTarget.max} escenas.
- Promedio por escena: ~${Math.round(durationMin / ((sceneTarget.min + sceneTarget.max) / 2) * 10) / 10} minutos
- Cada beat del outline DEBE poder expandirse en 1-3 escenas concretas
- Los beats deben ser suficientemente detallados para generar escenas con sluglines únicos
- NO generes solo 5-8 beats generales; necesitas ${profile.min_beats}+ beats con location hints`
    : '';
  
  return `
# TAREA: Generar un outline cinematográfico profesional

## IDEA DEL USUARIO
${idea}

## CONFIGURACIÓN
- Formato: ${formatLabel}
- Duración objetivo: ${durationStr}
- Género: ${genre || 'Drama'}
- Tono: ${tone || 'Cinematográfico realista'}
- Perfil de complejidad: ${profile.label}
${sceneInstruction}

## REQUISITOS MÍNIMOS (${profile.label})
- Personajes: ${profile.min_characters} mínimo
- Localizaciones: ${profile.min_locations} mínimo
- Beats narrativos: ${profile.min_beats} mínimo (CON situation_detail.physical_context)
- Escenas estimadas: ${sceneTarget ? `${sceneTarget.min}-${sceneTarget.max}` : profile.min_scenes} escenas
- SET PIECES: ${profile.min_setpieces} mínimo (momentos visuales espectaculares)
- SEQUENCES: ${profile.min_sequences} mínimo (agrupaciones dramáticas de escenas)

## REQUISITOS OBLIGATORIOS DE PERSONAJES

CRÍTICO: El reparto DEBE incluir al menos:
- 1 personaje con role: "protagonist" 
- 1 personaje con role: "antagonist" (fuerza opositora principal)
- 2+ personajes con role: "supporting"

El ANTAGONISTA puede ser:
- Una persona individual (villano clásico)
- Una institución/sistema representada por un personaje (el jefe corrupto, el oficial injusto)
- Una fuerza abstracta encarnada en un personaje (el vecino que representa el prejuicio social)

Pero DEBE estar representado por al menos UN personaje concreto con role="antagonist".

## ESTRUCTURA REQUERIDA

Genera un JSON con la siguiente estructura:

{
  "title": "Título del proyecto",
  "logline": "Una línea que capture la esencia (máx 30 palabras)",
  "synopsis": "Sinopsis extendida de 200-400 palabras con el arco completo",
  "genre": "${genre || 'Drama'}",
  "tone": "${tone || 'Cinematográfico realista'}",
  "format": "${format}",
  
  "main_characters": [
    {
      "name": "Nombre",
      "role": "protagonist | antagonist | supporting",
      "description": "Descripción visual y de personalidad (50-100 palabras)",
      "want": "Qué quiere conseguir externamente",
      "need": "Qué necesita aprender internamente",
      "flaw": "Defecto fatal que debe superar",
      "arc": "Cómo cambia a lo largo de la historia"
    }
  ],
  
  "main_locations": [
    {
      "name": "Nombre de la localización",
      "description": "Descripción visual atmosférica (30-50 palabras)",
      "function": "Qué rol narrativo cumple este lugar"
    }
  ],
  
  "threads": [
    {
      "name": "Nombre de la trama",
      "type": "primary | secondary",
      "description": "De qué trata esta línea narrativa"
    }
  ],
  
  "sequences": [
    {
      "name": "Nombre de la secuencia",
      "act": "I | II | III",
      "scenes_range": "1-4",
      "dramatic_goal": "Objetivo emocional de la secuencia",
      "tone_shift": "Cómo cambia el tono al final de la secuencia"
    }
  ],
  
  "setpieces": [
    {
      "name": "Nombre del setpiece",
      "act": "I | II | III",
      "protagonist_focus": "Nombre del protagonista que LIDERA este momento (OBLIGATORIO para películas coral)",
      "featured_characters": ["Lista de personajes presentes en la escena"],
      "description": "Descripción visual de la escena espectacular (50-100 palabras)",
      "stakes": "Qué está en juego en este momento"
    }
  ],
  
  "ACT_I": {
    "title": "Acto I - Planteamiento",
    "summary": "Resumen del acto (50-100 palabras)",
    "beats": [
      {
        "beat_number": 1,
        "event": "Qué ocurre (acción física)",
        "agent": "Quién actúa",
        "consequence": "Qué cambia como resultado",
        "situation_detail": {
          "physical_context": "Dónde y cómo",
          "action": "Acción principal",
          "goal": "Objetivo inmediato",
          "obstacle": "Qué lo dificulta",
          "state_change": "Cómo cambia la situación"
        }
      }
    ]
  },
  
  "ACT_II": {
    "title": "Acto II - Confrontación",
    "summary": "Resumen del acto",
    "midpoint_reversal": {
      "event": "El giro de mitad de película",
      "consequence": "Cómo cambia todo"
    },
    "all_is_lost_moment": {
      "event": "El momento más oscuro",
      "consequence": "Qué parece perdido"
    },
    "beats": [...]
  },
  
  "ACT_III": {
    "title": "Acto III - Resolución",
    "summary": "Resumen del acto",
    "climax": "Descripción del clímax",
    "resolution": "Cómo termina la historia",
    "beats": [...]
  }
}

## REQUISITOS DE SETPIECES Y SEQUENCES (CRÍTICO)

### SETPIECES (Momentos Visuales de Alto Impacto)
- OBLIGATORIO: Mínimo ${profile.min_setpieces} setpieces
- Cada setpiece es un momento ESPECTACULAR que define la película visualmente
- Distribuir equitativamente entre los 3 actos (Acto II debe tener más)
- Cada uno DEBE incluir: name, act, protagonist_focus, featured_characters, description (50+ palabras), stakes
- Ejemplos: persecuciones, confrontaciones, revelaciones dramáticas, momentos mágicos
- NO pueden ser escenas genéricas - deben ser los PICOS visuales y emocionales

### DISTRIBUCIÓN DE SETPIECES PARA PELÍCULAS CORAL/ENSEMBLE (CRÍTICO)
IMPORTANTE para películas con múltiples protagonistas (role="protagonist"):
1. CONTAR cuántos personajes tienen role="protagonist"
2. DISTRIBUIR los setpieces EQUITATIVAMENTE entre todos ellos
3. Cada protagonista DEBE liderar (protagonist_focus) al menos ⌊setpieces_totales / num_protagonistas⌋ setpieces
4. El campo "protagonist_focus" indica QUIÉN PROTAGONIZA ese momento específico
5. El campo "featured_characters" lista TODOS los personajes presentes en la escena

Ejemplo para 3 protagonistas (Baltasar, Gaspar, Melchor) con 12 setpieces:
- Baltasar lidera: 4 setpieces (setpieces 1, 4, 7, 10)
- Gaspar lidera: 4 setpieces (setpieces 2, 5, 8, 11)  
- Melchor lidera: 4 setpieces (setpieces 3, 6, 9, 12)

Esto asegura que CADA protagonista tenga su momento cinematográfico destacado.

### SEQUENCES (Agrupaciones Dramáticas)
- OBLIGATORIO: Mínimo ${profile.min_sequences} secuencias
- Cada secuencia agrupa 2-5 escenas bajo UN objetivo dramático común
- Ejemplos: "La Transformación", "La Noche de Milagros", "El Enfrentamiento Final"
- Cada secuencia tiene un tono_shift que indica cómo cambia el estado emocional

## INSTRUCCIONES CRÍTICAS

1. Cada beat debe tener TODOS los campos de situation_detail
2. Cada personaje debe tener want, need, flaw y arc
3. OBLIGATORIO: Al menos 1 personaje con role="antagonist" - sin antagonista el conflicto no funciona
4. Las localizaciones deben ser variadas y visuales
5. El midpoint_reversal debe ser un giro real que cambie la dirección
6. El all_is_lost_moment debe ser el punto más bajo del protagonista
7. CRÍTICO: Los setpieces (${profile.min_setpieces} mínimo) deben ser momentos CINEMATOGRÁFICOS únicos
8. CRÍTICO: Las sequences (${profile.min_sequences} mínimo) deben agrupar los beats en unidades dramáticas claras

RESPONDE ÚNICAMENTE CON EL JSON. Sin markdown, sin explicaciones.
`.trim();
}

// ============================================================================
// SOFT VALIDATION (Warnings, not blockers)
// ============================================================================

interface ValidationWarning {
  type: 'characters' | 'locations' | 'beats' | 'structure';
  message: string;
  current: number;
  required: number;
}

function softValidate(outline: any, profile: DensityProfile): { warnings: ValidationWarning[]; score: number } {
  const warnings: ValidationWarning[] = [];
  let score = 100;

  // Get character array
  const chars = outline.main_characters || outline.cast || [];
  const charCount = chars.length;
  
  // Check character count
  if (charCount < profile.min_characters) {
    warnings.push({
      type: 'characters',
      message: `Tienes ${charCount} personajes, el perfil ${profile.label} sugiere mínimo ${profile.min_characters}`,
      current: charCount,
      required: profile.min_characters,
    });
    score -= 15;
  }

  // Check for antagonist presence
  const hasAntagonist = chars.some((c: any) => {
    const role = (c.role || '').toLowerCase();
    return role.includes('antag') || role.includes('villain') || role === 'antagonist';
  });
  
  if (!hasAntagonist) {
    warnings.push({
      type: 'characters',
      message: 'Falta un antagonista explícito (role="antagonist") - el conflicto puede ser débil',
      current: 0,
      required: 1,
    });
    score -= 15;
  }

  // Count locations
  const locs = (outline.main_locations || outline.locations || []).length;
  if (locs < profile.min_locations) {
    warnings.push({
      type: 'locations',
      message: `Tienes ${locs} localizaciones, el perfil ${profile.label} sugiere mínimo ${profile.min_locations}`,
      current: locs,
      required: profile.min_locations,
    });
    score -= 15;
  }

  // Count beats
  const beatsI = outline.ACT_I?.beats?.length || 0;
  const beatsII = outline.ACT_II?.beats?.length || 0;
  const beatsIII = outline.ACT_III?.beats?.length || 0;
  const totalBeats = beatsI + beatsII + beatsIII;
  
  if (totalBeats < profile.min_beats) {
    warnings.push({
      type: 'beats',
      message: `Tienes ${totalBeats} beats, el perfil ${profile.label} sugiere mínimo ${profile.min_beats}`,
      current: totalBeats,
      required: profile.min_beats,
    });
    score -= 20;
  }

  // Check setpieces count
  const setpieces = outline.setpieces || [];
  if (setpieces.length < profile.min_setpieces) {
    warnings.push({
      type: 'structure',
      message: `Tienes ${setpieces.length} setpieces, el perfil ${profile.label} requiere mínimo ${profile.min_setpieces}`,
      current: setpieces.length,
      required: profile.min_setpieces,
    });
    score -= 15;
  }

  // Check setpiece distribution for ensemble films (multiple protagonists)
  const protagonists = chars.filter((c: any) => 
    (c.role || '').toLowerCase() === 'protagonist'
  );

  if (protagonists.length > 1 && setpieces.length > 0) {
    const minPerProtagonist = Math.floor(setpieces.length / protagonists.length);
    
    // Count setpieces per protagonist
    const setpiecesByProtag: Record<string, number> = {};
    protagonists.forEach((p: any) => { setpiecesByProtag[p.name] = 0; });
    
    setpieces.forEach((sp: any) => {
      const focus = sp.protagonist_focus;
      if (focus && setpiecesByProtag.hasOwnProperty(focus)) {
        setpiecesByProtag[focus]++;
      }
    });
    
    // Warn if any protagonist has fewer than minimum
    for (const [name, count] of Object.entries(setpiecesByProtag)) {
      if (count < minPerProtagonist) {
        warnings.push({
          type: 'structure',
          message: `${name} solo tiene ${count} setpieces, debería tener mínimo ${minPerProtagonist} (distribución equitativa en película coral)`,
          current: count as number,
          required: minPerProtagonist,
        });
        score -= 5;
      }
    }
  }

  // Check sequences count
  const sequences = outline.sequences || [];
  if (sequences.length < profile.min_sequences) {
    warnings.push({
      type: 'structure',
      message: `Tienes ${sequences.length} secuencias, el perfil ${profile.label} requiere mínimo ${profile.min_sequences}`,
      current: sequences.length,
      required: profile.min_sequences,
    });
    score -= 10;
  }

  // Check structure
  if (!outline.ACT_II?.midpoint_reversal?.event) {
    warnings.push({
      type: 'structure',
      message: 'Falta el midpoint_reversal en el Acto II',
      current: 0,
      required: 1,
    });
    score -= 10;
  }

  if (!outline.ACT_II?.all_is_lost_moment?.event) {
    warnings.push({
      type: 'structure',
      message: 'Falta el all_is_lost_moment en el Acto II',
      current: 0,
      required: 1,
    });
    score -= 10;
  }

  return { warnings, score: Math.max(0, score) };
}

// ============================================================================
// AI CALL - With retry on timeout using faster model
// ============================================================================

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Model fallback chain: fast → faster
const MODEL_CHAIN = [
  { model: 'google/gemini-2.5-flash', timeout: 150000, maxTokens: 16000 },
  { model: 'google/gemini-2.5-flash-lite', timeout: 120000, maxTokens: 12000 },
];

async function callAIWithModel(
  prompt: string, 
  model: string, 
  timeout: number, 
  maxTokens: number
): Promise<{ outline: any; model: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    console.log(`[generate-outline-direct] Calling ${model} with ${timeout}ms timeout`);
    
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
        max_completion_tokens: maxTokens,
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
    
    // Extract content from various response formats
    let content = '';
    if (data.choices?.[0]?.message?.content) {
      content = data.choices[0].message.content;
    } else if (data.output_text) {
      content = data.output_text;
    } else if (typeof data === 'string') {
      content = data;
    } else {
      content = JSON.stringify(data);
    }

    // Parse JSON with robust parser
    const parseResult = parseJsonRobust(content, 'generate-outline-direct');
    
    if (!parseResult.ok || !parseResult.json) {
      console.error(`[generate-outline-direct] JSON parse failed: strategy=${parseResult.strategy}, error=${parseResult.error}`);
      throw new Error(`JSON_PARSE_FAILED: ${parseResult.error || 'Unknown parse error'}`);
    }
    
    if (parseResult.warnings.length > 0) {
      console.warn(`[generate-outline-direct] Parse warnings: ${parseResult.warnings.join(', ')}`);
    }
    
    console.log(`[generate-outline-direct] JSON parsed successfully with strategy: ${parseResult.strategy}`);
    return { outline: parseResult.json, model };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`TIMEOUT_${model}`);
    }
    throw error;
  }
}

async function callAI(prompt: string): Promise<{ outline: any; model: string }> {
  let lastError: Error | null = null;

  for (const config of MODEL_CHAIN) {
    try {
      return await callAIWithModel(prompt, config.model, config.timeout, config.maxTokens);
    } catch (error: any) {
      console.warn(`[generate-outline-direct] ${config.model} failed:`, error.message);
      lastError = error;
      
      // If it's a timeout, try next model
      if (error.message?.startsWith('TIMEOUT_')) {
        console.log(`[generate-outline-direct] Retrying with next model in chain...`);
        continue;
      }
      
      // For other errors, throw immediately
      throw error;
    }
  }

  throw new Error(`AI_TIMEOUT: All models timed out. Last error: ${lastError?.message}`);
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
      idea, 
      format = 'film',
      densityProfile = 'standard',
      genre,
      tone,
      duration,
      bypassQC = false 
    } = await req.json();

    if (!projectId || !idea) {
      return new Response(
        JSON.stringify({ success: false, error: 'MISSING_PARAMS', message: 'projectId and idea are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get density profile
    const profile = DENSITY_PROFILES[densityProfile] || DENSITY_PROFILES.standard;

    console.log(`[generate-outline-direct] Starting for project ${projectId} with profile ${profile.id}`);

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check for existing lock
    const { data: existingOutline } = await supabase
      .from('project_outlines')
      .select('id, status')
      .eq('project_id', projectId)
      .eq('status', 'generating')
      .single();

    if (existingOutline) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'PROJECT_BUSY', 
          message: 'Ya hay una generación en curso para este proyecto' 
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create outline record
    const outlineId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('project_outlines')
      .insert({
        id: outlineId,
        project_id: projectId,
        status: 'generating',
        stage: 'direct_generation',
        substage: 'calling_ai',
        progress: 10,
        quality: 'direct',
        heartbeat_at: new Date().toISOString(),
        outline_json: {}, // Required NOT NULL field - will be populated after AI generation
      });

    if (insertError) {
      console.error('[generate-outline-direct] Failed to create outline record:', insertError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'INSERT_FAILED', 
          message: insertError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update progress: Building prompt
    await supabase
      .from('project_outlines')
      .update({ 
        progress: 20, 
        substage: 'building_prompt',
        heartbeat_at: new Date().toISOString() 
      })
      .eq('id', outlineId);

    // Build prompt
    const prompt = buildOutlinePrompt(idea, format, profile, genre, tone, duration);

    // Update progress: Calling AI
    await supabase
      .from('project_outlines')
      .update({ 
        progress: 30, 
        substage: 'generating_with_ai',
        heartbeat_at: new Date().toISOString() 
      })
      .eq('id', outlineId);

    // Call AI with model fallback
    let outline: any;
    let usedModel: string = 'unknown';
    try {
      const result = await callAI(prompt);
      outline = result.outline;
      usedModel = result.model;
      console.log(`[generate-outline-direct] Success with model: ${usedModel}`);
    } catch (aiError: any) {
      console.error('[generate-outline-direct] AI error:', aiError);
      
      await supabase
        .from('project_outlines')
        .update({ 
          status: 'failed',
          error_message: aiError.message,
          error_code: aiError.message?.includes('TIMEOUT') ? 'AI_TIMEOUT' : 'AI_ERROR',
          progress: 30,
        })
        .eq('id', outlineId);

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI_GENERATION_FAILED', 
          message: aiError.message 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update progress: Validating
    await supabase
      .from('project_outlines')
      .update({ 
        progress: 80, 
        substage: 'validating',
        heartbeat_at: new Date().toISOString() 
      })
      .eq('id', outlineId);

    // Soft validate (warnings, not blockers)
    const validation = softValidate(outline, profile);

    // Update progress: Saving
    await supabase
      .from('project_outlines')
      .update({ 
        progress: 90, 
        substage: 'saving',
        heartbeat_at: new Date().toISOString() 
      })
      .eq('id', outlineId);

    // Determine final status
    const finalStatus = bypassQC || validation.warnings.length === 0 ? 'completed' : 'completed';
    
    // Save outline
    await supabase
      .from('project_outlines')
      .update({
        status: finalStatus,
        stage: 'done',
        substage: 'saved',
        progress: 100,
        outline_json: outline,
        heartbeat_at: new Date().toISOString(),
        // Store validation in a metadata field
        outline_parts: {
          direct_generation: {
            profile: profile.id,
            validation: validation,
            generated_at: new Date().toISOString(),
            duration_ms: Date.now() - startTime,
          }
        }
      })
      .eq('id', outlineId);

    // Update project with outline info
    await supabase
      .from('projects')
      .update({
        logline: outline.logline || outline.synopsis?.substring(0, 200),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    const durationMs = Date.now() - startTime;
    console.log(`[generate-outline-direct] Completed in ${durationMs}ms with ${validation.warnings.length} warnings`);

    return new Response(
      JSON.stringify({
        success: true,
        outlineId,
        outline,
        warnings: validation.warnings,
        score: validation.score,
        profile: profile.id,
        duration_ms: durationMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[generate-outline-direct] Unexpected error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'UNEXPECTED_ERROR', 
        message: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
