import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReferenceScript {
  title: string;
  content: string;
  genre?: string;
  notes?: string;
}

interface ScreenplayRequest {
  outline: any;
  targets: any;
  language?: string;
  referenceScripts?: ReferenceScript[];
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER generando un GUION LISTO PARA RODAR desde un outline aprobado.

TU MISIÓN: Convertir el outline en un guion profesional completo con TODOS los diálogos.

FORMATO DE SALIDA OBLIGATORIO (JSON ESTRICTO):
{
  "title": "string",
  "logline": "string",
  "synopsis": "string",
  "genre": "string",
  "tone": "string",
  "themes": ["array"],
  
  "characters": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | extra_with_lines",
      "description": "string (física + personalidad)",
      "arc": "string",
      "voice_notes": "string (cómo habla)"
    }
  ],
  
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT",
      "description": "string visual",
      "atmosphere": "string"
    }
  ],
  
  "props": [
    {
      "name": "string",
      "importance": "key | recurring | background",
      "description": "string"
    }
  ],
  
  "episodes": [
    {
      "episode_number": 1,
      "title": "string",
      "synopsis": "string",
      "summary": "string corto",
      "duration_min": number,
      "scenes": [
        {
          "scene_number": 1,
          "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
          "summary": "string (resumen de la escena)",
          "characters": ["nombres"],
          "action": "string (descripción visual cinematográfica)",
          "dialogue": [
            {
              "character": "NOMBRE",
              "parenthetical": "(opcional)",
              "line": "El diálogo completo"
            }
          ],
          "music_cue": "string opcional",
          "sfx_cue": "string opcional",
          "vfx": ["array opcional"],
          "mood": "string",
          "continuity_anchors": {
            "time_of_day": "string",
            "weather": "string",
            "character_states": {}
          }
        }
      ]
    }
  ],
  
  "music_design": [
    {
      "name": "string",
      "type": "theme | ambient | action | emotional",
      "description": "string",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "sfx_design": [
    {
      "category": "string",
      "description": "string",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "vfx_requirements": [
    {
      "name": "string",
      "type": "CG | composite | practical",
      "description": "string",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "counts": {
    "protagonists": number,
    "supporting": number,
    "extras_with_lines": number,
    "locations": number,
    "hero_props": number,
    "setpieces": number,
    "subplots": number,
    "twists": number,
    "total_scenes": number,
    "total_dialogue_lines": number
  },
  
  "qc_notes": ["observaciones de producción"]
}

REGLAS DEL GUION:
1. CADA ESCENA con diálogos COMPLETOS (no resúmenes)
2. Acciones visuales, cinematográficas, en presente
3. Diálogos naturales con subtexto
4. Parentéticos solo cuando necesarios
5. Music/SFX cues específicos y producibles
6. Continuity anchors para mantener coherencia
7. Show don't tell

NUNCA:
- Resumir diálogos
- Usar "etc" o "continúa..."
- Escenas sin conflicto
- Diálogos expositivos
- Clichés de IA`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, targets, language, referenceScripts }: ScreenplayRequest = await req.json();

    if (!outline) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline aprobado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no está configurada');
    }

    // Build professional screenplay reference section
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `

--- EJEMPLOS DE GUIONES PROFESIONALES ---
Estudia estos extractos de guiones premiados para entender:
- Formato correcto de sluglines (INT./EXT. LOCALIZACIÓN - DÍA/NOCHE)
- Cómo escribir acciones descriptivas cinematográficas
- Formato y ritmo de diálogos profesionales
- Parentéticos usados correctamente

`;
      for (const ref of referenceScripts.slice(0, 2)) {
        const excerpt = ref.content.slice(0, 4000);
        referenceSection += `=== ${ref.title} ===
${excerpt}

`;
      }
      referenceSection += `--- FIN DE EJEMPLOS ---
IMPORTANTE: Tu output debe tener la misma calidad profesional que estos ejemplos.
`;
    }

    const userPrompt = `GENERA EL GUION COMPLETO LISTO PARA RODAR:

OUTLINE APROBADO:
${JSON.stringify(outline, null, 2)}

TARGETS:
${JSON.stringify(targets, null, 2)}

IDIOMA: ${language || 'es-ES'}
${referenceSection}
Genera el guion COMPLETO con TODOS los diálogos. Cada escena debe tener:
- Slugline en formato estándar: INT./EXT. LOCALIZACIÓN - DÍA/NOCHE
- Acción descriptiva cinematográfica (visual, presente, sin adjetivos excesivos)
- Diálogos COMPLETOS de todos los personajes (naturales, con subtexto)
- Parentéticos solo cuando son necesarios
- Cues de música/SFX específicos
- Continuity anchors para producción

Devuelve SOLO JSON válido.`;

    console.log('Generating screenplay from outline:', outline.title);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.35,
        max_tokens: 16000,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content from OpenAI');
    }

    const screenplay = JSON.parse(content);
    console.log('Screenplay generated:', screenplay.title, 'scenes:', screenplay.counts?.total_scenes);

    return new Response(
      JSON.stringify({ success: true, screenplay }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-screenplay:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
