import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EpisodeRequest {
  outline: any;
  episodeNumber: number;
  language?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, language = 'es-ES' }: EpisodeRequest = await req.json();

    if (!outline || !episodeNumber) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline y episodeNumber' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const episodeBeat = outline.episode_beats?.find((e: any) => e.episode === episodeNumber);
    
    const charactersRef = outline.main_characters?.map((c: any) => 
      `• ${c.name} (${c.role}): ${c.description}`
    ).join('\n') || '';

    const locationsRef = outline.main_locations?.map((l: any) => 
      `• ${l.name} (${l.type}): ${l.description}`
    ).join('\n') || '';

    const systemPrompt = `Eres un guionista profesional. Escribes episodios COMPLETOS con diálogo extenso y acción cinematográfica.

REGLAS:
- MÍNIMO 15 escenas por episodio
- MÍNIMO 8 líneas de diálogo por escena con diálogo
- Acción descriptiva de 80-150 palabras por escena
- Cada escena tiene: slugline, acción, diálogos, mood
- Diálogos NATURALES, no expositivos
- Usa los personajes y localizaciones del outline

Idioma: ${language}`;

    const userPrompt = `Escribe el EPISODIO ${episodeNumber} COMPLETO:

=== SERIE ===
Título: "${outline.title}"
Género: ${outline.genre}
Tono: ${outline.tone}
Logline: ${outline.logline}

=== EPISODIO ${episodeNumber}: "${episodeBeat?.title || `Episodio ${episodeNumber}`}" ===
Beat: ${episodeBeat?.summary || 'Desarrollar trama principal'}

=== PERSONAJES DISPONIBLES ===
${charactersRef}

=== LOCALIZACIONES DISPONIBLES ===
${locationsRef}

=== INSTRUCCIONES ===
1. Escribe MÍNIMO 15 escenas completas
2. Cada escena con diálogo debe tener 8-20 líneas
3. Acción descriptiva y cinematográfica (80-150 palabras por escena)
4. Usa sluglines profesionales: INT./EXT. LOCALIZACIÓN - DÍA/NOCHE
5. Incluye mood/atmósfera de cada escena

Usa la herramienta deliver_episode para entregar el episodio.`;

    console.log(`Generating detailed episode ${episodeNumber} for "${outline.title}"`);

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
        temperature: 0.8,
        system: systemPrompt,
        tools: [
          {
            name: 'deliver_episode',
            description: 'Entrega el episodio completo estructurado.',
            input_schema: {
              type: 'object',
              properties: {
                episode_number: { type: 'number' },
                title: { type: 'string' },
                synopsis: { type: 'string', description: 'Resumen del episodio (100-200 palabras)' },
                scenes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      scene_number: { type: 'number' },
                      slugline: { type: 'string', description: 'INT./EXT. LOCATION - TIME' },
                      description: { type: 'string', description: '80-150 palabras de acción visual' },
                      characters_present: { type: 'array', items: { type: 'string' } },
                      dialogue: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            character: { type: 'string' },
                            parenthetical: { type: 'string' },
                            line: { type: 'string' }
                          },
                          required: ['character', 'line']
                        }
                      },
                      mood: { type: 'string' },
                      duration_estimate_sec: { type: 'number' }
                    },
                    required: ['scene_number', 'slugline', 'description', 'characters_present', 'mood']
                  }
                },
                total_duration_min: { type: 'number' },
                total_scenes: { type: 'number' },
                total_dialogue_lines: { type: 'number' }
              },
              required: ['episode_number', 'title', 'synopsis', 'scenes', 'total_duration_min']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'deliver_episode' },
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Límite de tasa alcanzado. Intenta en 1-2 minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en Claude.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: `Error de Claude (${response.status})` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    const toolUse = Array.isArray(data?.content)
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'deliver_episode')
      : null;

    let episode = toolUse?.input;

    if (!episode) {
      // Fallback: try to parse JSON from text
      const textBlock = data?.content?.find((c: any) => c?.type === 'text');
      const content = textBlock?.text ?? '';
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          episode = JSON.parse(content.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
        } catch {
          return new Response(
            JSON.stringify({ error: 'Claude devolvió formato inválido.' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: 'Claude no devolvió episodio.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Calculate stats
    let totalDialogue = 0;
    if (episode.scenes) {
      for (const scene of episode.scenes) {
        totalDialogue += scene.dialogue?.length || 0;
      }
    }
    episode.total_scenes = episode.scenes?.length || 0;
    episode.total_dialogue_lines = totalDialogue;

    console.log(`Episode ${episodeNumber} generated: ${episode.total_scenes} scenes, ${totalDialogue} dialogue lines`);

    return new Response(
      JSON.stringify({ success: true, episode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-episode-detailed:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
