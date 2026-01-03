import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateScreenplayText(episode: any): string {
  let text = `EPISODIO ${episode.episode_number}: ${episode.title?.toUpperCase() || 'SIN TÍTULO'}\n\n`;
  text += `${episode.synopsis || ''}\n\n`;
  text += `FADE IN:\n\n`;

  for (const scene of (episode.scenes || [])) {
    text += `${scene.scene_number || 0}. ${scene.slugline || 'ESCENA'}\n\n`;
    
    if (scene.description) {
      text += `${scene.description}\n\n`;
    }

    if (scene.dialogue && scene.dialogue.length > 0) {
      for (const line of scene.dialogue) {
        text += `                    ${line.character || 'PERSONAJE'}\n`;
        if (line.parenthetical) {
          text += `              ${line.parenthetical}\n`;
        }
        text += `          ${line.line || ''}\n\n`;
      }
    }
    text += '\n';
  }

  text += `FADE OUT.\n`;
  return text;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, language } = await req.json();

    if (!outline || !episodeNumber) {
      return new Response(
        JSON.stringify({ error: 'Outline y episodeNumber requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
    
    if (!episodeBeat) {
      return new Response(
        JSON.stringify({ error: 'Episode beat not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }

    const charactersRef = outline.main_characters?.map((c: any) => 
      `- ${c.name} (${c.role}): ${c.description}`
    ).join('\n') || '';

    const locationsRef = outline.main_locations?.map((l: any) => 
      `- ${l.name} (${l.type}): ${l.description}`
    ).join('\n') || '';

    const systemPrompt = `Eres un guionista profesional. Escribe el guión COMPLETO de un episodio.
Responde SIEMPRE usando la herramienta deliver_episode.
Idioma: ${language || 'es-ES'}

CRÍTICO:
- MÍNIMO 15 escenas
- Cada escena con diálogo: MÍNIMO 6 intercambios
- NO omitas escenas
- Acción cinematográfica detallada`;

    const userPrompt = `Escribe el guión COMPLETO del episodio:

SERIE: ${outline.title}
EPISODIO ${episodeNumber}: ${episodeBeat.title}
BEAT: ${episodeBeat.summary}

PERSONAJES DISPONIBLES:
${charactersRef}

LOCALIZACIONES DISPONIBLES:
${locationsRef}

ESTRUCTURA:
- Acto 1 (escenas 1-5): Setup
- Acto 2 (escenas 6-12): Complicaciones
- Acto 3 (escenas 13-15): Resolución

Usa la herramienta deliver_episode para entregar el resultado.`;

    console.log(`[EPISODE ${episodeNumber}] Generating with Claude...`);

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
            description: 'Entrega el episodio completo con escenas.',
            input_schema: {
              type: 'object',
              properties: {
                episode_number: { type: 'number' },
                title: { type: 'string' },
                synopsis: { type: 'string', description: '150-300 palabras' },
                scenes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      scene_number: { type: 'number' },
                      slugline: { type: 'string', description: 'INT./EXT. LOCALIZACIÓN - DÍA/NOCHE' },
                      description: { type: 'string', description: '100-200 palabras de acción visual' },
                      characters: { type: 'array', items: { type: 'string' } },
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
                    required: ['scene_number', 'slugline', 'description', 'characters', 'dialogue', 'mood']
                  }
                },
                total_duration_min: { type: 'number' }
              },
              required: ['episode_number', 'title', 'synopsis', 'scenes']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'deliver_episode' },
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[EPISODE ${episodeNumber} ERROR]`, response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit alcanzado. Espera un momento.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en la cuenta de Claude.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Claude API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract tool use result
    const toolUse = data.content?.find((c: any) => c.type === 'tool_use' && c.name === 'deliver_episode');
    let episode = toolUse?.input;

    if (!episode) {
      // Fallback: try to parse JSON from text
      const textBlock = data.content?.find((c: any) => c.type === 'text');
      const content = textBlock?.text ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          episode = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error('No se pudo parsear el episodio');
        }
      } else {
        throw new Error('Claude no devolvió episodio');
      }
    }

    // Validate scenes
    if (!episode.scenes || episode.scenes.length === 0) {
      throw new Error('El episodio no tiene escenas');
    }

    if (episode.scenes.length < 10) {
      console.warn(`[EPISODE ${episodeNumber}] Warning: Only ${episode.scenes.length} scenes (expected 15+)`);
    }

    // Generate screenplay text
    episode.screenplay_text = generateScreenplayText(episode);

    // Calculate total duration
    if (!episode.total_duration_min) {
      episode.total_duration_min = Math.round(
        episode.scenes.reduce((acc: number, s: any) => acc + (s.duration_estimate_sec || 90), 0) / 60
      );
    }

    console.log(`[EPISODE ${episodeNumber}] Success: ${episode.scenes.length} scenes, ${episode.total_duration_min} min`);

    return new Response(
      JSON.stringify({ success: true, episode }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[EPISODE ERROR]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
