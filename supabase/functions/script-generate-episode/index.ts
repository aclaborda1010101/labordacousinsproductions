import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EpisodeRequest {
  outline: any;
  episodeNumber: number;
  episodeOutline: any;
  characters: any[];
  locations: any[];
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: guionista de Hollywood.

TU MISIÓN: Escribir un EPISODIO COMPLETO con escenas y diálogos.

REGLAS ABSOLUTAS:
1. Escribe TODAS las escenas del episodio (usa el número indicado por episodeOutline.scenes_count).
2. Diálogos COMPLETOS (por escena, aprox. 4-12 líneas totales según importancia).
3. Acción cinematográfica clara (80-150 palabras por escena).
4. Cada escena debe tener conflicto (aunque sea sutil).
5. Devuelve SOLO JSON válido (sin markdown).

FORMATO DE SALIDA (JSON ESTRICTO):
{
  "episode_number": number,
  "title": "string",
  "synopsis": "string (180-250 palabras)",
  "summary": "string (1-2 oraciones)",
  "duration_min": number,
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
      "summary": "string (30-70 palabras)",
      "characters": ["nombres"],
      "action": "string",
      "dialogue": [
        {
          "character": "NOMBRE EN MAYÚSCULAS",
          "parenthetical": "(opcional)",
          "line": "string"
        }
      ],
      "music_cue": "string opcional",
      "sfx_cue": "string opcional",
      "vfx": ["string opcional"],
      "mood": "string",
      "continuity_anchors": {
        "time_of_day": "string",
        "weather": "string",
        "character_states": { "NombrePersonaje": "estado" }
      }
    }
  ],
  "act_structure": {
    "cold_open": "escenas X-Y",
    "act_one": "escenas...",
    "act_two": "escenas...",
    "act_three": "escenas...",
    "tag": "escena final opcional"
  },
  "cliffhanger": "string",
  "total_dialogue_lines": number,
  "total_action_blocks": number
}

NUNCA:
- Resumir con "siguen hablando..."
- Devolver texto fuera del JSON`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, episodeOutline, characters, locations, language }: EpisodeRequest = await req.json();

    if (!outline || !episodeOutline) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline y episodeOutline' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    // Build character reference
    const characterRef = characters.map(c => 
      `- ${c.name} (${c.role}): ${c.description?.substring(0, 200) || 'Sin descripción'}. Voz: ${c.voice_signature || 'estándar'}`
    ).join('\n');

    // Build location reference
    const locationRef = locations.map(l => 
      `- ${l.name} (${l.type}): ${l.description?.substring(0, 150) || 'Sin descripción'}`
    ).join('\n');

    const userPrompt = `ESCRIBE EL EPISODIO ${episodeNumber} COMPLETO CON TODOS LOS DIÁLOGOS:

=== INFORMACIÓN DE LA SERIE ===
Título: ${outline.title}
Género: ${outline.genre}
Tono: ${outline.tone}
Logline: ${outline.logline}

=== EPISODIO ${episodeNumber}: "${episodeOutline.title}" ===
Sinopsis del episodio: ${episodeOutline.synopsis}
Cold Open: ${episodeOutline.cold_open || 'A definir'}
Cliffhanger: ${episodeOutline.cliffhanger || 'A definir'}
Escenas estimadas: ${episodeOutline.scenes_count || 15}

Escenas clave a incluir:
${episodeOutline.key_scenes?.map((s: any) => `- ${s.slugline}: ${s.description}`).join('\n') || 'Desarrollar según sinopsis'}

=== PERSONAJES DISPONIBLES ===
${characterRef}

=== LOCALIZACIONES DISPONIBLES ===
${locationRef}

=== INSTRUCCIONES ===
1. Escribe TODAS las escenas del episodio (usa ${episodeOutline.scenes_count || 12})
2. Diálogos completos (4-12 líneas por escena según importancia)
3. Acción clara (80-150 palabras por escena)
4. Incluye music/sfx cues cuando aplique
5. Mantén continuity anchors útiles para producción

IDIOMA: ${language || 'es-ES'}

Devuelve SOLO el JSON válido con el episodio completo.`;

    console.log(`Generating episode ${episodeNumber} with Claude Sonnet`);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 12000,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      throw new Error('No content from Anthropic API');
    }

    // Parse JSON from response
    let episode;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        episode = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError, 'Content:', content.substring(0, 500));
      throw new Error('Failed to parse episode JSON');
    }

    // Count dialogue lines
    let totalDialogue = 0;
    if (episode.scenes) {
      for (const scene of episode.scenes) {
        totalDialogue += scene.dialogue?.length || 0;
      }
    }
    episode.total_dialogue_lines = totalDialogue;

    console.log(`Episode ${episodeNumber} generated: ${episode.scenes?.length || 0} scenes, ${totalDialogue} dialogue lines`);

    return new Response(
      JSON.stringify({ success: true, episode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-episode:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
