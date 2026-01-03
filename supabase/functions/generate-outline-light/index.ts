import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, genre, tone, format, episodesCount, language } = await req.json();

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Idea requerida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no configurada');
    }

    const systemPrompt = `Eres un guionista profesional. Genera un OUTLINE conciso para una serie o película.
Responde SIEMPRE usando la herramienta deliver_outline.
Idioma: ${language || 'es-ES'}`;

    const userPrompt = `Genera un OUTLINE para:

IDEA: ${idea}
GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Realista'}
FORMATO: ${format === 'series' ? `${episodesCount || 6} episodios` : 'Película'}

CONSTRAINTS:
- Personajes principales: MÍNIMO 5
- Localizaciones: MÍNIMO 5
- Si es serie: un beat por episodio

Usa la herramienta deliver_outline para entregar el resultado.`;

    console.log('[OUTLINE] Generating with Claude...');

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
            name: 'deliver_outline',
            description: 'Entrega el outline estructurado.',
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: 'Título atractivo' },
                logline: { type: 'string', description: '1-2 frases que vendan la serie' },
                genre: { type: 'string' },
                tone: { type: 'string' },
                synopsis: { type: 'string', description: '100-200 palabras resumen general' },
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
        tool_choice: { type: 'tool', name: 'deliver_outline' },
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OUTLINE ERROR]', response.status, errorText);
      
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
    const toolUse = data.content?.find((c: any) => c.type === 'tool_use' && c.name === 'deliver_outline');
    let outline = toolUse?.input;

    if (!outline) {
      // Fallback: try to parse JSON from text
      const textBlock = data.content?.find((c: any) => c.type === 'text');
      const content = textBlock?.text ?? '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          outline = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error('No se pudo parsear el outline');
        }
      } else {
        throw new Error('Claude no devolvió outline');
      }
    }

    // Validate episode_beats
    if (!outline.episode_beats || outline.episode_beats.length === 0) {
      outline.episode_beats = Array.from({ length: episodesCount || 1 }, (_, i) => ({
        episode: i + 1,
        title: `Episodio ${i + 1}`,
        summary: 'Por generar'
      }));
    }

    console.log('[OUTLINE] Success:', outline.title, '| Characters:', outline.main_characters?.length, '| Episodes:', outline.episode_beats?.length);

    return new Response(
      JSON.stringify({ success: true, outline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OUTLINE ERROR]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
