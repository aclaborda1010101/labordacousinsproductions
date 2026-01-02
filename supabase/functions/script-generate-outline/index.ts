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

TU MISIÓN: Generar un OUTLINE profesional que cumpla los targets dados SÍ O SÍ.

REGLAS CRÍTICAS:
1. CUMPLE LOS TARGETS EXACTAMENTE. Si el target dice 3 protagonistas, incluye 3 protagonistas.
2. El outline debe ser lo suficientemente detallado para generar un guion completo.
3. Cada beat debe tener conflicto claro y arco narrativo.
4. Personajes con arcos definidos desde el inicio.

FORMATO DE SALIDA OBLIGATORIO (JSON ESTRICTO):
{
  "title": "string",
  "logline": "string (1-2 frases gancho)",
  "synopsis": "string (300-500 palabras)",
  "genre": "string",
  "tone": "string",
  "themes": ["array de temas principales"],
  
  "beat_sheet": [
    {
      "beat": "Opening Image | Theme Stated | Set-Up | Catalyst | Debate | Break Into Two | B Story | Fun and Games | Midpoint | Bad Guys Close In | All Is Lost | Dark Night of the Soul | Break Into Three | Finale | Final Image",
      "description": "string detallado",
      "episode": number (para series),
      "scenes": ["sluglines de escenas en este beat"]
    }
  ],
  
  "episode_outlines": [
    {
      "episode_number": number,
      "title": "string",
      "synopsis": "string (150-300 palabras)",
      "cold_open": "string (descripción del teaser)",
      "act_breaks": ["descripción de cada corte de acto"],
      "cliffhanger": "string",
      "scenes_count": number
    }
  ],
  
  "character_list": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | extra_with_lines",
      "archetype": "string",
      "description": "string (física y personalidad)",
      "arc": "string",
      "first_appearance": "string",
      "relationships": ["string"]
    }
  ],
  
  "location_list": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT",
      "description": "string visual detallada",
      "atmosphere": "string",
      "scenes_estimate": number,
      "time_variants": ["day", "night", "dawn", "dusk"]
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
      "episode": number,
      "description": "string (acción espectacular detallada)",
      "characters_involved": ["nombres"],
      "location": "string",
      "stakes": "string"
    }
  ],
  
  "subplots": [
    {
      "name": "string",
      "description": "string",
      "characters": ["nombres"],
      "arc_episodes": [numbers],
      "resolution": "string"
    }
  ],
  
  "twists": [
    {
      "name": "string",
      "episode": number,
      "scene_approx": number,
      "description": "string",
      "setup": "string",
      "payoff": "string"
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
    "scenes_per_episode": number
  },
  
  "assumptions": ["array de decisiones creativas tomadas"],
  "missing_info": ["array de info que podría mejorar el outline"]
}

NUNCA:
- Inventar conteos falsos
- Incluir menos elementos que los targets
- Usar clichés de IA
- Escribir personajes planos

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: OutlineRequest = await req.json();
    const { idea, format, episodesCount, episodeDurationMin, filmDurationMin, genre, tone, language, references, referenceScripts, targets } = request;

    if (!idea || !targets) {
      return new Response(
        JSON.stringify({ error: 'Se requiere idea y targets' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no está configurada');
    }

    const formatDescription = format === 'series' 
      ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos cada uno`
      : `Película de ${filmDurationMin || 100} minutos`;

    // Build reference scripts section if available
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `\n\nGUIONES DE REFERENCIA (aprende el estilo, estructura y tono de estos guiones profesionales):\n\n`;
      for (const ref of referenceScripts.slice(0, 3)) { // Max 3 references to avoid token limits
        const excerpt = ref.content.slice(0, 8000); // First 8000 chars of each
        referenceSection += `--- ${ref.title} (${ref.genre || 'N/A'}) ---\n`;
        if (ref.notes) referenceSection += `Notas del usuario: ${ref.notes}\n`;
        referenceSection += `${excerpt}\n${ref.content.length > 8000 ? '[...contenido truncado...]' : ''}\n\n`;
      }
      referenceSection += `IMPORTANTE: Usa estos guiones como inspiración para el estilo narrativo, formato de diálogos y estructura de escenas. NO copies la trama.\n`;
    }

    const userPrompt = `GENERA UN OUTLINE PROFESIONAL:

IDEA: ${idea}

FORMATO: ${formatDescription}
GÉNERO: ${genre}
TONO: ${tone}
IDIOMA: ${language}
${references ? `REFERENCIAS (inspiración, NO copiar): ${references}` : ''}
${referenceSection}
TARGETS OBLIGATORIOS (DEBES CUMPLIRLOS):
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

Genera el outline cumpliendo TODOS los targets. Devuelve SOLO JSON válido.`;

    console.log('Generating outline with OpenAI for:', idea.substring(0, 100));
    console.log('Targets:', JSON.stringify(targets));

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
        temperature: 0.3,
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

    const outline = JSON.parse(content);
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
