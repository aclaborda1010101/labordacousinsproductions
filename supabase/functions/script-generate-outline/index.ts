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

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: guionista + showrunner + script editor nivel estudio de Hollywood.

TU MISIÓN: Generar un OUTLINE PROFESIONAL EXTENSO Y DETALLADO que cumpla los targets dados SÍ O SÍ.

REGLAS CRÍTICAS:
1. CUMPLE LOS TARGETS EXACTAMENTE. Si el target dice 3 protagonistas, incluye 3 protagonistas.
2. El outline debe ser EXTREMADAMENTE DETALLADO para generar guiones completos.
3. Cada beat debe tener conflicto claro, tensión dramática y arco narrativo.
4. Personajes con arcos definidos, evolución clara y voz única.
5. CADA EPISODIO necesita su propia sinopsis detallada de 400-600 palabras.
6. Genera contenido EXTENSO y PROFESIONAL - no escatimes en detalles.

FORMATO DE SALIDA OBLIGATORIO (JSON ESTRICTO):
{
  "title": "string",
  "logline": "string (2-3 frases gancho poderosas)",
  "synopsis": "string (600-1000 palabras, sinopsis completa de la serie)",
  "genre": "string",
  "tone": "string",
  "themes": ["array de temas principales desarrollados"],
  
  "beat_sheet": [
    {
      "beat": "Opening Image | Theme Stated | Set-Up | Catalyst | Debate | Break Into Two | B Story | Fun and Games | Midpoint | Bad Guys Close In | All Is Lost | Dark Night of the Soul | Break Into Three | Finale | Final Image",
      "description": "string MUY detallado (200+ palabras)",
      "episode": number (para series),
      "scenes": ["sluglines de escenas en este beat"]
    }
  ],
  
  "episode_outlines": [
    {
      "episode_number": number,
      "title": "string creativo",
      "synopsis": "string EXTENSO (400-600 palabras con toda la trama del episodio)",
      "cold_open": "string detallado (100+ palabras)",
      "act_breaks": ["descripción detallada de cada corte de acto"],
      "cliffhanger": "string impactante",
      "scenes_count": number,
      "key_scenes": [
        {
          "slugline": "INT./EXT. LUGAR - MOMENTO",
          "description": "Descripción visual y dramática de la escena clave",
          "characters": ["nombres"],
          "conflict": "string",
          "resolution": "string"
        }
      ],
      "character_development": ["qué aprende/cambia cada personaje en este episodio"],
      "subplot_progress": ["avance de cada subtrama"]
    }
  ],
  
  "character_list": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | extra_with_lines",
      "archetype": "string",
      "description": "string EXTENSO (150+ palabras: física, personalidad, motivaciones)",
      "arc": "string detallado (100+ palabras)",
      "first_appearance": "string",
      "relationships": ["string detalladas"],
      "voice_signature": "cómo habla, muletillas, patrones de diálogo",
      "secret": "string (qué oculta este personaje)"
    }
  ],
  
  "location_list": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT",
      "description": "string visual DETALLADA (100+ palabras)",
      "atmosphere": "string sensorial completa",
      "scenes_estimate": number,
      "time_variants": ["day", "night", "dawn", "dusk"],
      "sound_signature": "qué sonidos caracterizan este lugar"
    }
  ],
  
  "hero_props": [
    {
      "name": "string",
      "importance": "plot_critical | character_defining | symbolic",
      "description": "string visual detallada",
      "first_appearance": "string",
      "narrative_function": "string extenso"
    }
  ],
  
  "setpieces": [
    {
      "name": "string épico",
      "episode": number,
      "description": "string EXTENSO (200+ palabras de acción espectacular)",
      "characters_involved": ["nombres"],
      "location": "string",
      "stakes": "string",
      "choreography": "descripción de la secuencia beat por beat"
    }
  ],
  
  "subplots": [
    {
      "name": "string",
      "description": "string extenso",
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
      "setup": "string (cómo se planta)",
      "payoff": "string (cómo impacta)"
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
- Ser breve o superficial - EXTENSO Y DETALLADO

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const formatDescription = format === 'series' 
      ? `Serie de ${episodesCount || 6} episodios de ${episodeDurationMin || 45} minutos cada uno`
      : `Película de ${filmDurationMin || 100} minutos`;

    // Build reference scripts section if available (truncated for token management)
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `\n\nGUIONES DE REFERENCIA (aprende el estilo, estructura y tono de estos guiones profesionales):\n\n`;
      for (const ref of referenceScripts.slice(0, 2)) {
        const excerpt = ref.content.slice(0, 4000);
        referenceSection += `--- ${ref.title} (${ref.genre || 'N/A'}) ---\n`;
        if (ref.notes) referenceSection += `Notas del usuario: ${ref.notes}\n`;
        referenceSection += `${excerpt}\n${ref.content.length > 4000 ? '[...contenido truncado...]' : ''}\n\n`;
      }
      referenceSection += `IMPORTANTE: Usa estos guiones como inspiración para el estilo narrativo, formato de diálogos y estructura de escenas. NO copies la trama.\n`;
    }

    const userPrompt = `GENERA UN OUTLINE PROFESIONAL EXTENSO Y DETALLADO:

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

IMPORTANTE: Genera un outline EXTENSO y DETALLADO. Cada episodio necesita una sinopsis de 400-600 palabras.
Cada personaje necesita descripción completa de 150+ palabras.
Cada setpiece necesita descripción de 200+ palabras.

Genera el outline cumpliendo TODOS los targets. Devuelve SOLO JSON válido.`;

    console.log('Generating outline with Lovable AI (GPT-5) for:', idea.substring(0, 100));
    console.log('Targets:', JSON.stringify(targets));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.35,
      }),
    });

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
