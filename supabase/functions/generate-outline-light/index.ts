import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LightOutlineRequest {
  idea: string;
  episodesCount?: number;
  format?: 'film' | 'series';
  genre?: string;
  tone?: string;
  language?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, episodesCount = 6, format = 'series', genre = 'drama', tone = 'Cinematográfico realista', language = 'es-ES' }: LightOutlineRequest = await req.json();

    if (!idea?.trim()) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una idea' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    const safeIdea = idea.length > 2000 ? idea.slice(0, 2000) : idea;

    const systemPrompt = `Eres un guionista experto. Genera outlines CONCISOS pero evocadores.
Tu trabajo: transformar ideas en estructuras narrativas claras y emocionantes.
Responde siempre usando la herramienta provide_outline.
Idioma: ${language}`;

    const userPrompt = `Genera un outline BÁSICO para esta idea:

IDEA: ${safeIdea}

FORMATO: ${format === 'series' ? `Serie de ${episodesCount} episodios` : 'Película'}
GÉNERO: ${genre}
TONO: ${tone}

Crea un outline atractivo con:
- Título memorable
- Logline que enganche (1-2 frases)
- Synopsis breve (100-150 palabras)
- 3-6 personajes principales con descripción corta
- 3-6 localizaciones clave
- Beats de cada episodio (título + resumen de 2-3 frases)

Usa la herramienta provide_outline para entregar el resultado.`;

    console.log('Generating light outline for:', safeIdea.substring(0, 80));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        temperature: 0.7,
        system: systemPrompt,
        tools: [
          {
            name: 'provide_outline',
            description: 'Entrega el outline básico estructurado.',
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título atractivo' },
                logline: { type: 'string', description: '1-2 frases que vendan la serie' },
                genre: { type: 'string' },
                tone: { type: 'string' },
                synopsis: { type: 'string', description: '100-150 palabras resumen general' },
                main_characters: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      role: { type: 'string', enum: ['protagonist', 'antagonist', 'supporting'] },
                      description: { type: 'string', description: '1-2 líneas: físico + personalidad' }
                    },
                    required: ['name', 'role', 'description']
                  }
                },
                main_locations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      type: { type: 'string', enum: ['INT', 'EXT', 'INT/EXT'] },
                      description: { type: 'string', description: '1-2 líneas' }
                    },
                    required: ['name', 'type', 'description']
                  }
                },
                episode_beats: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      episode: { type: 'number' },
                      title: { type: 'string' },
                      summary: { type: 'string', description: '2-3 frases de qué pasa' }
                    },
                    required: ['episode', 'title', 'summary']
                  }
                }
              },
              required: ['title', 'logline', 'genre', 'tone', 'synopsis', 'main_characters', 'main_locations', 'episode_beats']
            }
          }
        ],
        tool_choice: { type: 'tool', name: 'provide_outline' },
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
          JSON.stringify({ error: 'Créditos insuficientes en la cuenta de Claude.' }),
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
      ? data.content.find((c: any) => c?.type === 'tool_use' && c?.name === 'provide_outline')
      : null;

    let outline = toolUse?.input;

    if (!outline) {
      // Fallback: try to parse JSON from text
      const textBlock = data?.content?.find((c: any) => c?.type === 'text');
      const content = textBlock?.text ?? '';
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          outline = JSON.parse(content.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1'));
        } catch {
          return new Response(
            JSON.stringify({ error: 'Claude devolvió formato inválido.' }),
            { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: 'Claude no devolvió outline.' }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Light outline generated:', outline.title, '|', outline.main_characters?.length, 'chars,', outline.episode_beats?.length, 'episodes');

    return new Response(
      JSON.stringify({ success: true, outline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-outline-light:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
