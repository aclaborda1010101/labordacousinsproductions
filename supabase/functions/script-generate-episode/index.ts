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

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER: el mejor guionista de Hollywood escribiendo UN EPISODIO COMPLETO.

TU MISIÓN: Escribir TODAS las escenas del episodio con DIÁLOGOS COMPLETOS Y EXTENSOS.

REGLAS ABSOLUTAS:
1. CADA ESCENA tiene mínimo 3-8 líneas de diálogo (según importancia)
2. Diálogos NATURALES con subtexto, no expositivos
3. Acciones visuales cinematográficas (presente, show don't tell)
4. NO resumas diálogos - escríbelos COMPLETOS
5. Mínimo 12-18 escenas por episodio
6. Cada escena tiene conflicto claro

FORMATO DE SALIDA (JSON ESTRICTO):
{
  "episode_number": number,
  "title": "string",
  "synopsis": "string extenso (300+ palabras)",
  "summary": "string corto (1-2 oraciones)",
  "duration_min": number,
  "scenes": [
    {
      "scene_number": 1,
      "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
      "summary": "resumen de la escena (50-100 palabras)",
      "characters": ["nombres de personajes presentes"],
      "action": "descripción visual cinematográfica EXTENSA (100-200 palabras mínimo)",
      "dialogue": [
        {
          "character": "NOMBRE EN MAYÚSCULAS",
          "parenthetical": "(opcional: tono, acción pequeña)",
          "line": "El diálogo COMPLETO del personaje. Debe ser natural, con personalidad, subtexto. Pueden ser varias oraciones."
        }
      ],
      "music_cue": "string opcional - instrucciones musicales específicas",
      "sfx_cue": "string opcional - efectos de sonido necesarios",
      "vfx": ["array opcional de efectos visuales necesarios"],
      "mood": "string - atmósfera emocional de la escena",
      "continuity_anchors": {
        "time_of_day": "string",
        "weather": "string",
        "character_states": {
          "NombrePersonaje": "estado físico/emocional"
        }
      }
    }
  ],
  "act_structure": {
    "cold_open": "escenas 1-2",
    "act_one": "escenas 3-6",
    "act_two": "escenas 7-12",
    "act_three": "escenas 13-16",
    "tag": "escena final opcional"
  },
  "cliffhanger": "descripción del gancho final",
  "total_dialogue_lines": number,
  "total_action_blocks": number
}

GUÍA DE DIÁLOGOS POR TIPO DE ESCENA:
- Escena dramática principal: 8-15 líneas de diálogo
- Escena de transición: 3-5 líneas
- Escena de acción: 2-4 líneas intercaladas con acción
- Escena de confrontación: 10-20 líneas
- Escena emocional: 5-10 líneas con pausas

NUNCA:
- Resumir con "continúan discutiendo..."
- Dejar escenas sin diálogo (excepto secuencias de acción pura)
- Escribir diálogos genéricos o planos
- Usar clichés de IA
- Escenas de menos de 50 palabras de acción`;

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
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
1. Escribe TODAS las escenas del episodio (mínimo ${episodeOutline.scenes_count || 12})
2. CADA escena con diálogos COMPLETOS (no resúmenes)
3. Acciones cinematográficas extensas (100-200 palabras por escena)
4. Diálogos naturales con personalidad única para cada personaje
5. Incluye music/sfx cues específicos
6. Mantén continuity anchors para producción

IDIOMA: ${language || 'es-ES'}

Devuelve SOLO JSON válido con el episodio completo.`;

    console.log(`Generating episode ${episodeNumber} with Lovable AI (Gemini)`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        temperature: 0.7,
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
