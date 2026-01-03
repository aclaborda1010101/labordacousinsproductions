import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const OUTLINE_SYSTEM_PROMPT = `Eres un guionista profesional. Genera un OUTLINE conciso para una serie o película.

Responde SOLO JSON válido con esta estructura EXACTA:
{
  "title": "string",
  "logline": "string (1 frase que vende)",
  "synopsis": "string (100-200 palabras)",
  "genre": "string",
  "tone": "string",
  "main_characters": [
    {
      "name": "string",
      "role": "protagonist|antagonist|support",
      "description": "string (1 línea física + personalidad)"
    }
  ],
  "main_locations": [
    {
      "name": "string",
      "type": "INT|EXT",
      "description": "string (1 línea)"
    }
  ],
  "episode_beats": [
    {
      "episode": number,
      "title": "string",
      "summary": "string (2-3 frases de qué pasa)"
    }
  ]
}`;

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no configurada');
    }
    
    const userPrompt = `Genera un OUTLINE para:

IDEA: ${idea}
GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Realista'}
FORMATO: ${format === 'series' ? `${episodesCount || 6} episodios` : 'Película'}
IDIOMA: ${language || 'es-ES'}

CONSTRAINTS:
- Personajes principales: MÍNIMO 5
- Localizaciones: MÍNIMO 5
- Si es serie: un beat por episodio

Responde SOLO el JSON sin explicaciones.`;

    console.log('[OUTLINE] Generating...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: OUTLINE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 3000
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
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos agotados.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received');
    }

    // Parse JSON - handle markdown code blocks
    let outline;
    try {
      let jsonStr = content;
      
      // Remove markdown code blocks if present
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      
      // Find JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        outline = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[OUTLINE PARSE ERROR]', parseError);
      console.error('[RAW CONTENT]', content.substring(0, 500));
      throw new Error('Failed to parse outline JSON');
    }

    // Validate and ensure episode_beats
    if (!outline.episode_beats || outline.episode_beats.length === 0) {
      outline.episode_beats = Array.from({ length: episodesCount || 1 }, (_, i) => ({
        episode: i + 1,
        title: `Episodio ${i + 1}`,
        summary: 'Por generar'
      }));
    }

    console.log('[OUTLINE] Success:', outline.title, '| Characters:', outline.main_characters?.length, '| Episodes:', outline.episode_beats?.length);

    return new Response(
      JSON.stringify({
        success: true,
        outline
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[OUTLINE ERROR]', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
