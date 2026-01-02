import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptGenerateRequest {
  idea: string;
  genre: string;
  tone: string;
  references?: string[];
  format: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: un guionista profesional de Hollywood con 30 años de experiencia.

TU MISIÓN: Generar guiones cinematográficos COMPLETOS y profesionales con TODOS los diálogos, escenas y detalles de producción.

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "title": "string",
  "logline": "string (1-2 frases que resumen la historia)",
  "synopsis": "string (resumen ejecutivo de 200-500 palabras de toda la historia)",
  "genre": "string",
  "tone": "string",
  "themes": ["array de temas principales"],
  "beat_sheet": [
    {
      "beat": "Opening Image | Theme Stated | Set-Up | Catalyst | Debate | Break Into Two | B Story | Fun and Games | Midpoint | Bad Guys Close In | All Is Lost | Dark Night of the Soul | Break Into Three | Finale | Final Image",
      "description": "string",
      "page_range": "string (ej: 1-10)"
    }
  ],
  "episodes": [
    {
      "episode_number": 1,
      "title": "string",
      "synopsis": "string (resumen detallado del episodio 150-300 palabras)",
      "summary": "string (resumen breve de 2-3 frases)",
      "duration_min": number,
      "scenes": [
        {
          "scene_number": 1,
          "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
          "description": "string (descripción de la escena)",
          "characters": ["nombres de personajes en la escena"],
          "action": "string (descripción de acción detallada)",
          "dialogue": [
            {
              "character": "NOMBRE",
              "parenthetical": "(opcional: tono o acción)",
              "line": "El texto del diálogo"
            }
          ],
          "music_cue": "string (opcional: descripción de música/ambiente)",
          "sfx": ["array de efectos de sonido"],
          "vfx": ["array de efectos visuales si aplica"],
          "mood": "string (atmósfera de la escena)"
        }
      ],
      "screenplay_text": "string (guión formateado completo del episodio)"
    }
  ],
  "characters": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | episodic",
      "description": "string (descripción física detallada: edad, altura, complexión, rasgos distintivos, vestimenta típica)",
      "personality": "string (rasgos de personalidad)",
      "arc": "string (arco del personaje a lo largo de la historia)",
      "first_appearance": "string (escena donde aparece)",
      "relationships": "string (relaciones con otros personajes)",
      "voice_notes": "string (cómo habla, acento, vocabulario)"
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT",
      "description": "string (descripción visual detallada)",
      "atmosphere": "string (atmósfera, iluminación, sonidos)",
      "scenes_count": number,
      "time_variants": ["day", "night", "dawn", "dusk"]
    }
  ],
  "props": [
    {
      "name": "string",
      "importance": "key | recurring | background",
      "description": "string (descripción detallada)",
      "scenes": ["escenas donde aparece"]
    }
  ],
  "music_design": [
    {
      "name": "string (ej: Tema Principal, Tema del Villano)",
      "type": "theme | ambient | action | emotional",
      "description": "string",
      "scenes": ["dónde se usa"]
    }
  ],
  "sfx_design": [
    {
      "category": "string (ambiente, foley, impacto)",
      "description": "string",
      "scenes": ["dónde se usa"]
    }
  ],
  "screenplay": "string (el guion completo formateado - para películas o episodio piloto)"
}

REGLAS DEL GUION:
1. Formato estándar de la industria:
   - SLUGLINES: INT./EXT. LOCALIZACIÓN - DÍA/NOCHE
   - ACCIÓN: Descripción en tiempo presente, visual, cinematográfica
   - DIÁLOGO: Nombre del personaje centrado, diálogo debajo con parentéticos cuando sea necesario
   - TRANSICIONES: CUT TO:, FADE OUT., SMASH CUT TO:, etc.

2. CADA ESCENA DEBE INCLUIR:
   - Diálogos COMPLETOS (no resúmenes)
   - Acciones descriptivas cinematográficas
   - Indicaciones de cámara sugeridas
   - Notas de música/sonido cuando sea relevante

3. Reglas narrativas:
   - Show don't tell: acción visual, no exposición
   - Conflicto en cada escena
   - Diálogos naturales con subtexto
   - Ritmo cinematográfico (no teatral)
   - Arcos de personaje claros

4. Evitar:
   - Clichés de IA
   - Exposición forzada
   - Diálogos explicativos
   - Personajes planos
   - Escenas sin conflicto

5. Violencia: cinematográfica, no gore explícito
6. Sexualidad: sugerida, no explícita

IDIOMA: Responde en el idioma indicado en la solicitud.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptGenerateRequest = await req.json();
    const { idea, genre, tone, references, format, episodesCount, episodeDurationMin, language } = request;

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una idea para generar el guion' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
SOLICITUD DE GUION:

IDEA: ${idea}

GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Cinematográfico realista'}
FORMATO: ${format === 'series' ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos` : 'Largometraje de 90-120 minutos'}
IDIOMA: ${language || 'es-ES'}

${references?.length ? `REFERENCIAS (inspiración, NO copiar): ${references.join(', ')}` : ''}

Genera un guion completo y profesional siguiendo el formato JSON especificado.
Para series, incluye el guion del primer episodio completo y sinopsis de los demás.
Para películas, incluye el guion completo.

IMPORTANTE: El guion debe ser cinematográfico, visual, con conflicto y subtexto. Nada de clichés de IA.`;

    console.log('Generating script for idea:', idea.substring(0, 100));

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
        temperature: 0.8,
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
    let scriptData;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0]);
      } else {
        // If no JSON found, create a structured response
        scriptData = {
          title: 'Untitled Script',
          screenplay: content,
          characters: [],
          locations: [],
          props: [],
          beat_sheet: [],
          episodes: format === 'series' ? [{ episode_number: 1, title: 'Pilot', synopsis: '', duration_min: episodeDurationMin || 45 }] : []
        };
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      scriptData = {
        title: 'Generated Script',
        screenplay: content,
        raw_response: true
      };
    }

    console.log('Script generated successfully:', scriptData.title);

    return new Response(
      JSON.stringify({
        success: true,
        script: scriptData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
