import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TeaserRequest {
  projectId: string;
  screenplay: {
    title: string;
    logline: string;
    synopsis: string;
    genre?: string;
    tone?: string;
    characters?: any[];
    episodes?: any[];
  };
  language?: string;
}

interface TeaserResult {
  teaser60: {
    duration_sec: 60;
    title: string;
    logline: string;
    scenes: TeaserScene[];
    music_cue: string;
    voiceover_text?: string;
  };
  teaser30: {
    duration_sec: 30;
    title: string;
    logline: string;
    scenes: TeaserScene[];
    music_cue: string;
    voiceover_text?: string;
  };
}

interface TeaserScene {
  shot_type: string;
  duration_sec: number;
  description: string;
  character?: string;
  dialogue_snippet?: string;
  visual_hook: string;
  sound_design: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { projectId, screenplay, language = 'es-ES' } = await req.json() as TeaserRequest;

    if (!screenplay || !screenplay.title) {
      throw new Error('Screenplay data required');
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    console.log(`[TEASERS] Generating for project ${projectId}: ${screenplay.title}`);

    // Extract key moments from episodes for teaser material
    const keyMoments: string[] = [];
    if (screenplay.episodes && Array.isArray(screenplay.episodes)) {
      screenplay.episodes.forEach((ep: any, epIdx: number) => {
        if (ep.scenes && Array.isArray(ep.scenes)) {
          // Get 2-3 most dramatic scenes per episode
          const dramaticScenes = ep.scenes
            .filter((s: any) => s.conflict || s.dialogue?.length > 0)
            .slice(0, 3);
          dramaticScenes.forEach((s: any) => {
            keyMoments.push(`Ep${epIdx + 1} - ${s.slugline}: ${s.summary || s.description || ''}`);
          });
        }
      });
    }

    const characterList = screenplay.characters?.map((c: any) => c.name).join(', ') || '';

    const systemPrompt = `Eres un editor de tráilers profesional de Hollywood. 
Tu trabajo es crear teasers cinematográficos que enganchen al espectador.

REGLAS CRÍTICAS:
- Cada teaser debe tener un ritmo de montaje profesional
- Usa la estructura clásica: Hook → Build → Climax → Title Card
- NO reveles spoilers importantes
- Incluye "beats" visuales y sonoros específicos
- Los tiempos deben sumar EXACTAMENTE la duración indicada

Responde usando la herramienta generate_teasers.`;

    const tools = [{
      name: "generate_teasers",
      description: "Genera dos teasers cinematográficos: uno de 60 segundos y otro de 30 segundos",
      input_schema: {
        type: "object",
        properties: {
          teaser60: {
            type: "object",
            description: "Teaser de 60 segundos",
            properties: {
              title: { type: "string", description: "Título del teaser" },
              logline: { type: "string", description: "Tagline promocional corto" },
              music_cue: { type: "string", description: "Descripción del estilo musical" },
              voiceover_text: { type: "string", description: "Texto de voice-over opcional" },
              scenes: {
                type: "array",
                description: "Secuencia de planos que suman 60 segundos",
                items: {
                  type: "object",
                  properties: {
                    shot_type: { type: "string" },
                    duration_sec: { type: "number" },
                    description: { type: "string" },
                    character: { type: "string" },
                    dialogue_snippet: { type: "string" },
                    visual_hook: { type: "string" },
                    sound_design: { type: "string" }
                  },
                  required: ["shot_type", "duration_sec", "description", "visual_hook", "sound_design"]
                }
              }
            },
            required: ["title", "logline", "music_cue", "scenes"]
          },
          teaser30: {
            type: "object",
            description: "Teaser de 30 segundos (más rápido y punchy)",
            properties: {
              title: { type: "string" },
              logline: { type: "string" },
              music_cue: { type: "string" },
              voiceover_text: { type: "string" },
              scenes: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    shot_type: { type: "string" },
                    duration_sec: { type: "number" },
                    description: { type: "string" },
                    character: { type: "string" },
                    dialogue_snippet: { type: "string" },
                    visual_hook: { type: "string" },
                    sound_design: { type: "string" }
                  },
                  required: ["shot_type", "duration_sec", "description", "visual_hook", "sound_design"]
                }
              }
            },
            required: ["title", "logline", "music_cue", "scenes"]
          }
        },
        required: ["teaser60", "teaser30"]
      }
    }];

    const userPrompt = `Genera dos teasers cinematográficos para esta serie/película:

TÍTULO: ${screenplay.title}
LOGLINE: ${screenplay.logline || 'N/A'}
SINOPSIS: ${screenplay.synopsis || 'N/A'}
GÉNERO: ${screenplay.genre || 'Drama'}
TONO: ${screenplay.tone || 'Cinematográfico'}
PERSONAJES: ${characterList}

MOMENTOS CLAVE DISPONIBLES:
${keyMoments.slice(0, 15).join('\n')}

IDIOMA: ${language}

GENERA:
1. TEASER 60s: Más narrativo, con build-up emocional
2. TEASER 30s: Más punchy, solo los mejores momentos

Los tiempos de cada plano DEBEN sumar exactamente 60s y 30s respectivamente.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools,
        tool_choice: { type: "tool", name: "generate_teasers" },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TEASERS] API error:', response.status, errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const toolUseBlock = data.content?.find((block: any) => block.type === 'tool_use');

    if (!toolUseBlock?.input) {
      throw new Error('No teaser content generated');
    }

    const teasers: TeaserResult = {
      teaser60: {
        duration_sec: 60,
        ...toolUseBlock.input.teaser60
      },
      teaser30: {
        duration_sec: 30,
        ...toolUseBlock.input.teaser30
      }
    };

    console.log(`[TEASERS] Generated: 60s (${teasers.teaser60.scenes.length} shots), 30s (${teasers.teaser30.scenes.length} shots)`);

    return new Response(
      JSON.stringify({ success: true, teasers }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[TEASERS ERROR]', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
