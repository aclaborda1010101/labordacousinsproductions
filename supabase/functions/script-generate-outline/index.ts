import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutlineRequest {
  projectId: string;
  idea: string;
  format: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  filmDurationMin?: number;
  genre: string;
  tone: string;
  language: string;
  references?: string;
  referenceScripts?: Array<{
    title: string;
    content: string;
    genre: string | null;
    notes: string | null;
  }>;
  targets: {
    protagonists_min: number;
    supporting_min: number;
    extras_min: number;
    locations_min: number;
    hero_props_min: number;
    setpieces_min: number;
    subplots_min: number;
    twists_min: number;
    scenes_per_episode?: number;
    scenes_target?: number;
    dialogue_action_ratio: string;
  };
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: guionista + showrunner + script editor nivel estudio.

TU MISIÓN: generar un OUTLINE PRODUCIBLE, SEGMENTADO POR EPISODIOS, cumpliendo los targets mínimos.

PRIORIDADES:
1) Segmentación clara por episodios (episode_outlines).
2) Cumplir targets (mínimos) sin inventar conteos.
3) Mantener descripciones compactas.

REGLAS CRÍTICAS:
- NUNCA entregues menos elementos que los targets.
- Mantén los textos compactos:
  - synopsis serie: 250-400 palabras
  - synopsis episodio: 120-200 palabras
  - beat description: 60-120 palabras
  - character description: 60-90 palabras
  - character arc: 40-70 palabras
  - location description: 50-80 palabras
  - setpiece description: 80-120 palabras
- Devuelve SOLO JSON válido, sin markdown, sin texto extra.

FORMATO DE SALIDA OBLIGATORIO (JSON ESTRICTO):
{
  "title": "string",
  "logline": "string (2-3 frases)",
  "synopsis": "string",
  "genre": "string",
  "tone": "string",
  "themes": ["array"],

  "beat_sheet": [
    {
      "beat": "Opening Image | Theme Stated | Set-Up | Catalyst | Debate | Break Into Two | B Story | Fun and Games | Midpoint | Bad Guys Close In | All Is Lost | Dark Night of the Soul | Break Into Three | Finale | Final Image",
      "description": "string",
      "episode": 1,
      "scenes": ["sluglines"]
    }
  ],

  "episode_outlines": [
    {
      "episode_number": 1,
      "title": "string",
      "synopsis": "string",
      "cold_open": "string",
      "act_breaks": ["string"],
      "cliffhanger": "string",
      "scenes_count": 12,
      "key_scenes": [
        {
          "slugline": "INT./EXT. LUGAR - MOMENTO",
          "description": "string",
          "characters": ["nombres"],
          "conflict": "string",
          "resolution": "string"
        }
      ],
      "character_development": ["string"],
      "subplot_progress": ["string"]
    }
  ],

  "character_list": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | extra_with_lines",
      "archetype": "string",
      "description": "string",
      "arc": "string",
      "first_appearance": "string",
      "relationships": ["string"],
      "voice_signature": "string",
      "secret": "string"
    }
  ],

  "location_list": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT",
      "description": "string",
      "atmosphere": "string",
      "scenes_estimate": 5,
      "time_variants": ["day", "night"],
      "sound_signature": "string"
    }
  ],

  "hero_props": [
    {
      "name": "string",
      "importance": "plot_critical | character_defining | symbolic",
      "description": "string",
      "first_appearance": "string",
      "narrative_function": "string"
    }
  ],

  "setpieces": [
    {
      "name": "string",
      "episode": 1,
      "description": "string",
      "characters_involved": ["nombres"],
      "location": "string",
      "stakes": "string",
      "choreography": "string"
    }
  ],

  "subplots": [
    {
      "name": "string",
      "description": "string",
      "characters": ["nombres"],
      "arc_episodes": [1,2],
      "resolution": "string"
    }
  ],

  "twists": [
    {
      "name": "string",
      "episode": 1,
      "scene_approx": 8,
      "description": "string",
      "setup": "string",
      "payoff": "string"
    }
  ],

  "counts": {
    "protagonists": 0,
    "supporting": 0,
    "extras_with_lines": 0,
    "locations": 0,
    "hero_props": 0,
    "setpieces": 0,
    "subplots": 0,
    "twists": 0,
    "total_scenes": 0,
    "scenes_per_episode": 0
  },

  "assumptions": ["string"],
  "missing_info": ["string"]
}

NUNCA:
- Inventar conteos falsos
- Devolver texto fuera del JSON

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: OutlineRequest = await req.json();
    const { idea, format, episodesCount, episodeDurationMin, filmDurationMin, genre, tone, language, references, referenceScripts, targets } = request;

    const safeIdea = idea?.length > 2000 ? `${idea.slice(0, 2000)}…` : idea;
    const safeReferences = references?.length ? references.slice(0, 800) : references;

    if (!idea || !targets) {
      return new Response(
        JSON.stringify({ error: 'Se requiere idea y targets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const formatDescription = format === 'series' 
      ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos cada uno`
      : `Película de ${filmDurationMin || 100} minutos`;

    // Build reference scripts section
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `\n\nGUIONES DE REFERENCIA (estilo y tono):\n`;
      for (const ref of referenceScripts.slice(0, 2)) {
        const excerpt = ref.content.slice(0, 1500);
        referenceSection += `• ${ref.title}: ${ref.genre || ''} - ${ref.notes || 'Referencia de estilo'}\n`;
      }
    }

    const userPrompt = `GENERA UN OUTLINE SEGMENTADO POR EPISODIOS:

IDEA: ${safeIdea}

FORMATO: ${formatDescription}
GÉNERO: ${genre}
TONO: ${tone}
IDIOMA: ${language}
${safeReferences ? `REFERENCIAS (inspiración): ${safeReferences}` : ''}
${referenceSection}

TARGETS OBLIGATORIOS (mínimos):
- Protagonistas: ${targets.protagonists_min}
- Personajes secundarios: ${targets.supporting_min}
- Extras con frase: ${targets.extras_min}
- Localizaciones: ${targets.locations_min}
- Props clave: ${targets.hero_props_min}
- Setpieces: ${targets.setpieces_min}
- Subtramas: ${targets.subplots_min}
- Giros: ${targets.twists_min}
${format === 'series' ? `- Escenas por episodio: ${targets.scenes_per_episode}` : `- Escenas totales: ${targets.scenes_target}`}
- Ratio diálogo/acción: ${targets.dialogue_action_ratio}

Devuelve SOLO el JSON válido del outline.`;

    console.log('Generating outline with Claude Sonnet for:', idea.substring(0, 100));
    console.log('Targets:', JSON.stringify(targets));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
        tools: [
          {
            name: 'deliver_outline',
            description: 'Return the outline as a structured object.',
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                logline: { type: 'string' },
                synopsis: { type: 'string' },
                genre: { type: 'string' },
                tone: { type: 'string' },
                themes: { type: 'array', items: { type: 'string' } },
                beat_sheet: { type: 'array', items: { type: 'object', additionalProperties: true } },
                episode_outlines: { type: 'array', items: { type: 'object', additionalProperties: true } },
                character_list: { type: 'array', items: { type: 'object', additionalProperties: true } },
                location_list: { type: 'array', items: { type: 'object', additionalProperties: true } },
                hero_props: { type: 'array', items: { type: 'object', additionalProperties: true } },
                setpieces: { type: 'array', items: { type: 'object', additionalProperties: true } },
                subplots: { type: 'array', items: { type: 'object', additionalProperties: true } },
                twists: { type: 'array', items: { type: 'object', additionalProperties: true } },
                counts: { type: 'object', additionalProperties: true },
                assumptions: { type: 'array', items: { type: 'string' } },
                missing_info: { type: 'array', items: { type: 'string' } },
              },
              required: [
                'title',
                'logline',
                'synopsis',
                'genre',
                'tone',
                'themes',
                'episode_outlines',
                'character_list',
                'location_list',
                'hero_props',
                'setpieces',
                'subplots',
                'twists',
                'counts',
                'assumptions',
                'missing_info',
              ],
              additionalProperties: true,
            },
          },
        ],
        tool_choice: { type: 'tool', name: 'deliver_outline' },
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);

      const lower = errorText.toLowerCase();

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Claude: límite de tasa alcanzado. Intenta de nuevo en 1-2 minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 400 && lower.includes('credit balance is too low')) {
        return new Response(
          JSON.stringify({ error: 'Claude: créditos insuficientes en tu cuenta. Cambia la API key por una con saldo o recarga créditos en Anthropic.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 401 || response.status === 403) {
        return new Response(
          JSON.stringify({ error: 'Claude: API key inválida o sin permisos.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Claude API error (${response.status}): ${errorText}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'deliver_outline')
      : null;

    let outline: any = toolUse?.input;

    // Fallback: si el modelo no devuelve tool_use, intenta extraer JSON del texto
    if (!outline) {
      const textBlock = Array.isArray(data?.content)
        ? data.content.find((c: any) => c?.type === 'text')
        : null;

      const content = textBlock?.text ?? data?.content?.[0]?.text;

      if (!content) {
        return new Response(
          JSON.stringify({ error: 'Claude no devolvió contenido.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      const candidateRaw =
        fenceMatch?.[1]?.trim() ??
        (() => {
          const start = content.indexOf('{');
          const end = content.lastIndexOf('}');
          if (start === -1 || end === -1 || end <= start) return null;
          return content.slice(start, end + 1);
        })();

      if (!candidateRaw) {
        return new Response(
          JSON.stringify({ error: 'Claude devolvió una respuesta sin JSON.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reparación mínima: elimina comas finales comunes
      const candidate = candidateRaw.replace(/,\s*([}\]])/g, '$1');

      try {
        outline = JSON.parse(candidate);
      } catch (parseError) {
        console.error('Parse error:', parseError, 'Content:', content.substring(0, 700));
        return new Response(
          JSON.stringify({ error: 'Claude devolvió un JSON inválido. Intenta generar de nuevo.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Outline generated:', outline.title, 'counts:', JSON.stringify(outline.counts));

    return new Response(
      JSON.stringify({ success: true, outline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-outline:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
