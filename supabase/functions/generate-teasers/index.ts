import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

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

  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    // Internal JWT validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[TEASERS] Auth failed:', authError?.message);
      return new Response(
        JSON.stringify({ code: 401, message: 'Invalid JWT' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[TEASERS][${requestId}] Authenticated user:`, user.id);

    const { projectId, screenplay, language = 'es-ES' } = await req.json() as TeaserRequest;

    // =========================================================================
    // INPUT VALIDATION - Prevent 400 errors from missing data
    // =========================================================================
    const missingFields: string[] = [];
    if (!screenplay) missingFields.push('screenplay');
    if (!screenplay?.title) missingFields.push('screenplay.title');
    if (!screenplay?.logline && !screenplay?.synopsis) {
      missingFields.push('screenplay.logline o screenplay.synopsis');
    }

    if (missingFields.length > 0) {
      console.warn(`[TEASERS][${requestId}] Missing input:`, missingFields);
      return new Response(
        JSON.stringify({
          error: 'MISSING_INPUT',
          missing: missingFields,
          detail: 'Completa el guión antes de generar teasers',
          requestId
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // LOVABLE AI GATEWAY - Migrated from Anthropic
    // =========================================================================
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`[TEASERS][${requestId}] Generating for project ${projectId}: ${screenplay.title}`);

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

    // Tool schema in OpenAI format
    const toolSchema = {
      name: "generate_teasers",
      description: "Genera dos teasers cinematográficos: uno de 60 segundos y otro de 30 segundos",
      parameters: {
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
    };

    console.log(`[TEASERS][${requestId}] Calling Lovable AI Gateway...`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        max_completion_tokens: 4000,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [{ type: 'function', function: toolSchema }],
        tool_choice: { type: 'function', function: { name: 'generate_teasers' } }
      })
    });

    // =========================================================================
    // ERROR HANDLING - Surface actual error messages
    // =========================================================================
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[TEASERS][${requestId}] AI Gateway error:`, response.status, errorText.slice(0, 500));

      if (response.status === 429) {
        return new Response(
          JSON.stringify({
            error: 'RATE_LIMITED',
            detail: 'Demasiadas peticiones, intenta en unos segundos',
            requestId
          }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (response.status === 402) {
        return new Response(
          JSON.stringify({
            error: 'CREDITS_EXHAUSTED',
            detail: 'Añade créditos a tu workspace de Lovable',
            requestId
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          error: 'AI_GATEWAY_ERROR',
          status: response.status,
          detail: errorText.slice(0, 500),
          requestId
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    // =========================================================================
    // PARSE RESPONSE - OpenAI format (from Lovable Gateway)
    // =========================================================================
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error(`[TEASERS][${requestId}] No tool call in response`);
      throw new Error('No teaser content generated');
    }

    let parsedArgs;
    try {
      parsedArgs = JSON.parse(toolCall.function.arguments);
    } catch (parseErr) {
      console.error(`[TEASERS][${requestId}] Failed to parse tool args:`, toolCall.function.arguments.slice(0, 200));
      throw new Error('Failed to parse teaser response');
    }

    const teasers: TeaserResult = {
      teaser60: {
        duration_sec: 60,
        ...parsedArgs.teaser60
      },
      teaser30: {
        duration_sec: 30,
        ...parsedArgs.teaser30
      }
    };

    // Extract token usage from Lovable Gateway response
    const inputTokens = data?.usage?.prompt_tokens || 0;
    const outputTokens = data?.usage?.completion_tokens || 0;

    console.log(`[TEASERS][${requestId}] Generated: 60s (${teasers.teaser60.scenes?.length || 0} shots), 30s (${teasers.teaser30.scenes?.length || 0} shots)`);
    console.log(`[TEASERS][${requestId}] Token usage: ${inputTokens} in / ${outputTokens} out`);

    // Log generation cost
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        projectId,
        slotType: 'teasers',
        engine: 'lovable',
        model: 'google/gemini-3-flash-preview',
        durationMs: Date.now() - startTime,
        success: true,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        category: 'script',
        metadata: {
          teaser60Shots: teasers.teaser60.scenes?.length || 0,
          teaser30Shots: teasers.teaser30.scenes?.length || 0
        }
      });
    }

    return new Response(
      JSON.stringify({ success: true, teasers, tokenUsage: { input: inputTokens, output: outputTokens }, requestId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`[TEASERS][${requestId}] ERROR:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
