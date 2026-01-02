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

TU MISIÓN: generar un OUTLINE PRODUCIBLE (rápido) y, sobre todo, SEGMENTADO POR EPISODIOS, cumpliendo los targets mínimos.

PRIORIDADES:
1) Segmentación clara por episodios (episode_outlines).
2) Cumplir targets (mínimos) sin inventar conteos.
3) Mantener descripciones compactas para evitar timeouts.

REGLAS CRÍTICAS:
- NUNCA entregues menos elementos que los targets.
- Mantén los textos compactos (orientativo):
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

    const safeIdea = idea?.length > 1800 ? `${idea.slice(0, 1800)}…` : idea;
    const safeReferences = references?.length ? references.slice(0, 600) : references;

    if (!idea || !targets) {
      return new Response(
        JSON.stringify({ error: 'Se requiere idea y targets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const formatDescription = format === 'series' 
      ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos cada uno`
      : `Película de ${filmDurationMin || 100} minutos`;

    // Build reference scripts section - heavily truncated to prevent timeout
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `\n\nGUIONES DE REFERENCIA (estilo y tono):\n`;
      for (const ref of referenceScripts.slice(0, 2)) {
        // Only take first 1500 chars to prevent timeout
        const excerpt = ref.content.slice(0, 1500);
        referenceSection += `• ${ref.title}: ${ref.genre || ''} - ${ref.notes || 'Referencia de estilo'}\n`;
      }
    }

    const userPrompt = `GENERA UN OUTLINE PARA SEGMENTAR EN EPISODIOS (rápido y utilizable):

IDEA (si viene larga, extrae la esencia): ${safeIdea}

FORMATO: ${formatDescription}
GÉNERO: ${genre}
TONO: ${tone}
IDIOMA: ${language}
${safeReferences ? `REFERENCIAS (inspiración, NO copiar): ${safeReferences}` : ''}
${referenceSection}

TARGETS OBLIGATORIOS (DEBES CUMPLIRLOS como mínimos):
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

IMPORTANTE: Prioriza segmentación por episodios y descripciones compactas. Devuelve SOLO JSON válido.`;

    console.log('Generating outline with Gemini Flash for:', idea.substring(0, 100));
    console.log('Targets:', JSON.stringify(targets));

    let response: Response;
    try {
      response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
          ],
          max_completion_tokens: 8000,
        }),
      });
    } catch (e) {
      console.error('Fetch error:', e);
      throw e;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Usage limit reached. Please add credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content from Lovable AI');
    }

    // Parse JSON from response
    let outline;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outline = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError, 'Content:', content.substring(0, 500));
      throw new Error('Failed to parse outline JSON');
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
