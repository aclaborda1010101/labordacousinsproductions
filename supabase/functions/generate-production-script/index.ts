/**
 * PRODUCTION SCRIPT GENERATOR V1.0
 * 
 * Converts a Literary Script into a Production Script.
 * This is a TRANSFORMATION function - it does NOT create new content.
 * 
 * The production script adds technical layers without inventing:
 * - Normalized scene headers
 * - INT/EXT classification
 * - Time of day standardization
 * - Characters present per scene
 * - Props relevant to each scene
 * - Continuity notes
 * - Camera notes (descriptive only, never creative)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse, AuthContext } from "../_shared/auth.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";
import { MODEL_CONFIG } from "../_shared/model-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// PRODUCTION SCRIPT SYSTEM PROMPT - Transformation only, no creation
// =============================================================================
const PRODUCTION_SCRIPT_SYSTEM = `Eres ayudante de dirección y script supervisor profesional.

Tu tarea NO es crear historia.
Tu tarea es convertir un GUION LITERARIO FINALIZADO
en un GUION DE PRODUCCIÓN técnico y accionable.

━━━━━━━━━━━━━━━━━━━━━━━━━━
PROHIBICIONES ABSOLUTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━
- PROHIBIDO inventar escenas
- PROHIBIDO inventar diálogos
- PROHIBIDO inventar acciones
- PROHIBIDO inventar personajes o localizaciones
- PROHIBIDO añadir contenido narrativo

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Cada escena literaria debe tener correspondencia 1:1
- No se puede dividir ni fusionar escenas
- No se puede añadir contenido narrativo

━━━━━━━━━━━━━━━━━━━━━━━━━━
TRANSFORMACIÓN REQUERIDA
━━━━━━━━━━━━━━━━━━━━━━━━━━
Para cada escena:
- encabezado_normalizado: "INT./EXT. LOCATION - TIME"
- localizacion_tipo: "INT" | "EXT" | "INT/EXT"
- momento_del_dia: "DAY" | "NIGHT" | "DAWN" | "DUSK"
- personajes_presentes: Lista de nombres
- accion_tecnica: Resumen técnico de la acción (sin estilo literario)
- props_relevantes: Lista de props que deben estar
- notas_continuidad: Elementos a vigilar entre escenas
- notas_camara: Solo si se infieren del texto (NUNCA inventar)

━━━━━━━━━━━━━━━━━━━━━━━━━━
SI ALGO NO ESTÁ EXPLÍCITO
━━━━━━━━━━━━━━━━━━━━━━━━━━
- NO lo inventes
- Márcalo como "NO_ESPECIFICADO"

Devuelve JSON con array de escenas técnicas.`;

// =============================================================================
// OUTPUT SCHEMA
// =============================================================================
const PRODUCTION_SCRIPT_SCHEMA = {
  name: "generate_production_script",
  description: "Transform literary script into production-ready format",
  parameters: {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_number: { type: "number" },
            encabezado_normalizado: { type: "string" },
            localizacion_tipo: { type: "string", enum: ["INT", "EXT", "INT/EXT"] },
            momento_del_dia: { type: "string", enum: ["DAY", "NIGHT", "DAWN", "DUSK"] },
            personajes_presentes: { 
              type: "array", 
              items: { type: "string" } 
            },
            accion_tecnica: { type: "string" },
            props_relevantes: { 
              type: "array", 
              items: { type: "string" } 
            },
            notas_continuidad: { type: "string" },
            notas_camara: { type: "string" },
            duracion_estimada_segundos: { type: "number" },
            dialogos_count: { type: "number" }
          },
          required: [
            "scene_number", 
            "encabezado_normalizado", 
            "localizacion_tipo", 
            "momento_del_dia",
            "personajes_presentes",
            "accion_tecnica"
          ]
        }
      },
      metadata: {
        type: "object",
        properties: {
          total_scenes: { type: "number" },
          total_duration_estimate_seconds: { type: "number" },
          unique_locations: { type: "number" },
          unique_characters: { type: "number" }
        }
      }
    },
    required: ["scenes"]
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let authContext: AuthContext | null = null;
  try {
    authContext = await requireAuthOrDemo(req);
  } catch (authError: any) {
    return authErrorResponse(authError, corsHeaders);
  }

  try {
    const body = await req.json();
    const { projectId, literaryScript, scriptId } = body;

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: 'projectId requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!literaryScript && !scriptId) {
      return new Response(
        JSON.stringify({ error: 'literaryScript o scriptId requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate project access - simplified check via DB query
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    // Check project exists
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();
    
    if (projectError || !project) {
      return new Response(
        JSON.stringify({ error: 'Proyecto no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get literary script text
    let scriptText = literaryScript;
    
    // If scriptId provided, fetch from DB
    if (scriptId && !scriptText) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.39.3');
      const supabase = createClient(supabaseUrl, serviceRoleKey);
      
      const { data: screenplay } = await supabase
        .from('screenplays')
        .select('raw_text, parsed_json')
        .eq('id', scriptId)
        .single();
      
      if (screenplay?.raw_text) {
        scriptText = screenplay.raw_text;
      } else if (screenplay?.parsed_json?.scenes) {
        // Convert parsed JSON to text
        scriptText = screenplay.parsed_json.scenes.map((s: any) => 
          `${s.slugline}\n${s.raw_content || s.action_summary || ''}`
        ).join('\n\n');
      }
    }

    if (!scriptText || scriptText.length < 500) {
      return new Response(
        JSON.stringify({ error: 'Guion literario demasiado corto o vacío' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-production-script] Processing ${scriptText.length} chars`);

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.SCRIPT.PROFESIONAL, // gpt-5 for production work
        max_completion_tokens: 8000,
        messages: [
          { role: 'system', content: PRODUCTION_SCRIPT_SYSTEM },
          { role: 'user', content: `GUION LITERARIO A TRANSFORMAR:\n\n${scriptText}\n\nTAREA: Genera el GUION DE PRODUCCIÓN técnico. Mantén orden exacto de escenas. Añade SOLO capas técnicas.` }
        ],
        tools: [{
          type: 'function',
          function: PRODUCTION_SCRIPT_SCHEMA
        }],
        tool_choice: { type: 'function', function: { name: PRODUCTION_SCRIPT_SCHEMA.name } }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-production-script] AI error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const toolArgs = toolCall?.function?.arguments;

    if (!toolArgs) {
      throw new Error('No tool response from AI');
    }

    const parseResult = parseJsonSafe(toolArgs, 'production_script');
    if (!parseResult.json) {
      throw new Error('Failed to parse production script');
    }

    const productionScript = parseResult.json;
    
    // Add metadata if not present
    if (!productionScript.metadata) {
      const scenes = productionScript.scenes || [];
      const uniqueLocations = new Set(scenes.map((s: any) => s.encabezado_normalizado?.split(' - ')[0]));
      const uniqueChars = new Set(scenes.flatMap((s: any) => s.personajes_presentes || []));
      
      productionScript.metadata = {
        total_scenes: scenes.length,
        total_duration_estimate_seconds: scenes.reduce((sum: number, s: any) => 
          sum + (s.duracion_estimada_segundos || 60), 0),
        unique_locations: uniqueLocations.size,
        unique_characters: uniqueChars.size
      };
    }

    console.log(`[generate-production-script] Generated ${productionScript.scenes?.length || 0} technical scenes`);

    return new Response(
      JSON.stringify({
        success: true,
        productionScript,
        metadata: productionScript.metadata
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[generate-production-script] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Error generando guion de producción',
        code: 'PRODUCTION_SCRIPT_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
