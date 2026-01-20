/**
 * GENERATE-OUTLINE-DIRECT V1.0
 * 
 * Simplified single-call outline generation.
 * No chunking, no micro-stages - just one powerful prompt to the LLM.
 * 
 * Philosophy:
 * - 1 call = 1 complete outline
 * - Warnings instead of blockers
 * - Always save result, let user decide
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

const DENSITY_PROFILES: Record<string, DensityProfile> = {
  indie: {
    id: 'indie',
    label: 'Indie / Autor',
    min_characters: 6,
    min_locations: 6,
    min_beats: 18,
    min_scenes: 25,
  },
  standard: {
    id: 'standard',
    label: 'Estándar',
    min_characters: 10,
    min_locations: 10,
    min_beats: 24,
    min_scenes: 35,
  },
  hollywood: {
    id: 'hollywood',
    label: 'Hollywood',
    min_characters: 15,
    min_locations: 15,
    min_beats: 30,
    min_scenes: 45,
  },
};

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
  const durationStr = duration ? `${duration} minutos` : format === 'film' ? '90-120 minutos' : '6-10 episodios de 45 min';
  
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

## REQUISITOS MÍNIMOS (${profile.label})
- Personajes: ${profile.min_characters} mínimo
- Localizaciones: ${profile.min_locations} mínimo
- Beats narrativos: ${profile.min_beats} mínimo
- Escenas estimadas: ${profile.min_scenes} mínimo

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
  },
  
  "setpieces": [
    {
      "name": "Nombre del setpiece",
      "act": "I | II | III",
      "description": "Descripción visual de la escena espectacular"
    }
  ]
}

## INSTRUCCIONES CRÍTICAS

1. Cada beat debe tener TODOS los campos de situation_detail
2. Cada personaje debe tener want, need, flaw y arc
3. Las localizaciones deben ser variadas y visuales
4. El midpoint_reversal debe ser un giro real que cambie la dirección
5. El all_is_lost_moment debe ser el punto más bajo del protagonista
6. Los setpieces deben ser momentos visuales memorables

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

  // Count characters
  const chars = (outline.main_characters || outline.cast || []).length;
  if (chars < profile.min_characters) {
    warnings.push({
      type: 'characters',
      message: `Tienes ${chars} personajes, el perfil ${profile.label} sugiere mínimo ${profile.min_characters}`,
      current: chars,
      required: profile.min_characters,
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
// AI CALL
// ============================================================================

async function callAI(prompt: string, timeout = 120000): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }

  const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

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
        model: 'openai/gpt-5.2',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: 16000,
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

    // Parse JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('AI_TIMEOUT: Request exceeded 120 seconds');
    }
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
    await supabase
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
      });

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

    // Call AI
    let outline: any;
    try {
      outline = await callAI(prompt);
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
