import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EPISODE_SYSTEM_PROMPT = `Eres un guionista profesional. Escribe el guión COMPLETO de un episodio.

Responde SOLO JSON válido con esta estructura EXACTA:
{
  "episode_number": number,
  "title": "string",
  "synopsis": "string (150-300 palabras)",
  "scenes": [
    {
      "scene_number": number,
      "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
      "description": "string (100-200 palabras de acción visual)",
      "characters": ["NOMBRE1", "NOMBRE2"],
      "dialogue": [
        {
          "character": "NOMBRE",
          "parenthetical": "(opcional)",
          "line": "Diálogo completo"
        }
      ],
      "mood": "string",
      "duration_estimate_sec": number
    }
  ],
  "total_duration_min": number
}

CRÍTICO:
- MÍNIMO 15 escenas
- Cada escena con diálogo debe tener MÍNIMO 6 intercambios
- NO omitas escenas
- NO uses "FADE IN/FADE OUT" genéricos`;

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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no configurada');
    }

    const charactersRef = outline.main_characters?.map((c: any) => 
      `- ${c.name} (${c.role}): ${c.description}`
    ).join('\n') || '';

    const locationsRef = outline.main_locations?.map((l: any) => 
      `- ${l.name} (${l.type}): ${l.description}`
    ).join('\n') || '';

    const userPrompt = `Escribe el guión COMPLETO del episodio:

SERIE: ${outline.title}
EPISODIO ${episodeNumber}: ${episodeBeat.title}
BEAT: ${episodeBeat.summary}

PERSONAJES DISPONIBLES:
${charactersRef}

LOCALIZACIONES DISPONIBLES:
${locationsRef}

IDIOMA: ${language || 'es-ES'}

CONSTRAINTS OBLIGATORIOS:
- MÍNIMO 15 escenas
- Cada escena con diálogo: MÍNIMO 6 intercambios
- USA los personajes del outline
- USA las localizaciones del outline
- Acción cinematográfica (100-200 palabras por escena)
- Conflicto en CADA escena

ESTRUCTURA:
- Acto 1 (escenas 1-5): Setup
- Acto 2 (escenas 6-12): Complicaciones
- Acto 3 (escenas 13-15): Resolución

Responde SOLO el JSON completo.`;

    console.log(`[EPISODE ${episodeNumber}] Generating with Gemini Pro...`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: EPISODE_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 10000
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
    let episode;
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
        episode = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error(`[EPISODE ${episodeNumber} PARSE ERROR]`, parseError);
      console.error('[RAW CONTENT]', content.substring(0, 1000));
      throw new Error('Failed to parse episode JSON');
    }

    // Validate scenes
    if (!episode.scenes || episode.scenes.length === 0) {
      throw new Error('Episode has no scenes');
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

    console.log(`[EPISODE ${episodeNumber}] Success: ${episode.scenes.length} scenes`);

    return new Response(
      JSON.stringify({
        success: true,
        episode
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[EPISODE ERROR]', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
