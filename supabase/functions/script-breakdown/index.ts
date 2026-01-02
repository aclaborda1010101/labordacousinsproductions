import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptBreakdownRequest {
  scriptText: string;
  projectId: string;
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_BREAKDOWN: el departamento de desglose de producción de un estudio de Hollywood.

TU MISIÓN: Analizar guiones y extraer TODAS las entidades de producción necesarias para la preproducción.

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "scenes": [
    {
      "scene_number": number,
      "slugline": "string (INT./EXT. LOCALIZACIÓN - DÍA/NOCHE)",
      "location_name": "string",
      "location_type": "INT | EXT | INT/EXT",
      "time_of_day": "DAY | NIGHT | DAWN | DUSK | CONTINUOUS",
      "summary": "string (resumen de 1-2 frases)",
      "objective": "string (qué debe lograr esta escena narrativamente)",
      "mood": "string (atmósfera emocional)",
      "page_range": "string (ej: 1-3)",
      "estimated_duration_sec": number,
      "characters_present": ["array de nombres"],
      "props_used": ["array de props"],
      "wardrobe_notes": "string (cambios de vestuario si aplica)",
      "vfx_sfx_needed": ["array de efectos"],
      "sound_notes": "string (ambiente, música diegética, etc.)",
      "continuity_notes": "string (estado físico, hora del día, clima)",
      "priority": "P0 | P1 | P2",
      "complexity": "low | medium | high"
    }
  ],
  "characters": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | episodic | extra",
      "description": "string (descripción física detallada)",
      "personality": "string",
      "arc": "string",
      "scenes": [number array de scene_numbers],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "continuity_risk": "low | medium | high",
      "wardrobe_changes": number,
      "notes": "string"
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT",
      "description": "string (descripción visual detallada)",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "time_variants": ["DAY", "NIGHT", etc.],
      "weather_variants": ["CLEAR", "RAIN", etc.],
      "set_dressing_notes": "string",
      "lighting_notes": "string",
      "sound_profile": "string (ambiente base)",
      "continuity_risk": "low | medium | high"
    }
  ],
  "props": [
    {
      "name": "string",
      "type": "phone | laptop | weapon | document | vehicle | food | drink | furniture | other",
      "description": "string",
      "importance": "key | recurring | background",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "interaction_notes": "string (cómo se usa)",
      "continuity_risk": "low | medium | high",
      "special_requirements": "string"
    }
  ],
  "wardrobe": [
    {
      "character_name": "string",
      "outfit_name": "string",
      "description": "string (detalle completo)",
      "scenes": [number array],
      "condition_changes": ["clean", "dirty", "torn", etc.],
      "continuity_notes": "string"
    }
  ],
  "set_pieces": [
    {
      "name": "string (ej: 'Car Chase Downtown')",
      "type": "action | chase | fight | stunt | dance | crowd",
      "description": "string",
      "scenes": [number array],
      "duration_estimate_sec": number,
      "complexity": "low | medium | high | extreme",
      "safety_notes": "string",
      "vfx_requirements": ["array"],
      "stunt_requirements": ["array"]
    }
  ],
  "vfx_sfx": [
    {
      "name": "string",
      "type": "vfx | sfx | practical",
      "category": "explosion | fire | smoke | weather | magic | destruction | blood | other",
      "description": "string",
      "scenes": [number array],
      "trigger_cue": "string",
      "intensity": "subtle | medium | heavy",
      "integration_notes": "string"
    }
  ],
  "sound_music": [
    {
      "name": "string",
      "type": "ambience | foley | source_music | score_cue | sfx",
      "description": "string",
      "scenes": [number array],
      "location_tied": "string (nombre de localización si aplica)",
      "mood": "string",
      "notes": "string"
    }
  ],
  "continuity_anchors": [
    {
      "name": "string (ej: 'John's black eye')",
      "type": "physical_state | emotional_state | time_of_day | weather | prop_state",
      "description": "string",
      "applies_from_scene": number,
      "applies_to_scene": number (or null if ongoing),
      "character_tied": "string (nombre si aplica)",
      "notes": "string"
    }
  ],
  "summary": {
    "total_scenes": number,
    "total_characters": number,
    "total_locations": number,
    "total_props": number,
    "total_set_pieces": number,
    "total_vfx_sfx": number,
    "estimated_runtime_min": number,
    "complexity_score": "low | medium | high",
    "continuity_risk_areas": ["array de áreas de alto riesgo"],
    "production_notes": "string"
  }
}

REGLAS DE EXTRACCIÓN:
1. ESCENAS: Detecta por sluglines (INT./EXT.). Si no hay sluglines claros, infiere estructura.
2. PERSONAJES: Cualquier nombre que hable o tenga acción importante.
3. LOCALIZACIONES: Agrupa variantes del mismo lugar (ej: "JOHN'S APARTMENT - LIVING ROOM" y "JOHN'S APARTMENT - BEDROOM" son la misma localización con diferentes zonas).
4. PROPS: Cualquier objeto que se mencione en acción o diálogo y sea importante.
5. VESTUARIO: Detecta cambios de ropa, estados (mojado, sucio, roto).
6. SET PIECES: Secuencias complejas que requieren coreografía.
7. VFX/SFX: Cualquier efecto mencionado o implícito.
8. SONIDO: Ambientes, música diegética, efectos sonoros clave.
9. CONTINUIDAD: Detecta estados que deben mantenerse entre escenas.

PRIORIDADES:
- P0: Imprescindible para la historia (protagonistas, localizaciones principales)
- P1: Importante (personajes secundarios, props clave)
- P2: Complementario (extras, props de fondo)

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, language } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
DESGLOSE DE PRODUCCIÓN SOLICITADO:

PROJECT ID: ${projectId}
IDIOMA DE RESPUESTA: ${language || 'es-ES'}

GUION A DESGLOSAR:
---
${scriptText}
---

Realiza un desglose EXHAUSTIVO de este guion. Extrae TODAS las entidades de producción siguiendo el formato JSON especificado.

IMPORTANTE:
- Sé exhaustivo: no dejes ningún personaje, prop o localización sin detectar
- Mantén consistencia en los nombres (mismo personaje = mismo nombre exacto)
- Detecta variantes de localizaciones y agrúpalas
- Identifica riesgos de continuidad
- Asigna prioridades realistas
- Incluye notas de producción útiles`;

    console.log('Breaking down script, length:', scriptText.length, 'projectId:', projectId);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Parse JSON from response
    let breakdownData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        breakdownData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return a structured fallback with basic parsing
      breakdownData = {
        scenes: [],
        characters: [],
        locations: [],
        props: [],
        wardrobe: [],
        set_pieces: [],
        vfx_sfx: [],
        sound_music: [],
        continuity_anchors: [],
        summary: {
          total_scenes: 0,
          total_characters: 0,
          total_locations: 0,
          total_props: 0,
          production_notes: 'Failed to parse breakdown. Please try again.'
        },
        raw_response: content
      };
    }

    console.log('Script breakdown complete:', {
      scenes: breakdownData.scenes?.length || 0,
      characters: breakdownData.characters?.length || 0,
      locations: breakdownData.locations?.length || 0,
      props: breakdownData.props?.length || 0
    });

    return new Response(
      JSON.stringify({
        success: true,
        breakdown: breakdownData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-breakdown:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
