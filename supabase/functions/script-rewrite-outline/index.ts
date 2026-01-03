import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Scripts use Claude claude-sonnet-4-20250514 for professional screenplay quality
const SCRIPT_MODEL = "claude-sonnet-4-20250514";

interface RewriteRequest {
  outline: any;
  rewriteInstructions: string;
  targets: any;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_WRITER reescribiendo un outline para cumplir targets.

TU MISIÓN: Corregir el outline siguiendo las instrucciones de reescritura EXACTAMENTE.

REGLAS:
1. Mantén la esencia narrativa del outline original
2. AÑADE los elementos faltantes sin eliminar lo existente
3. Actualiza los counts para reflejar los cambios
4. Devuelve el outline COMPLETO corregido

FORMATO: Mismo JSON que el outline original, con counts actualizados.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, rewriteInstructions, targets }: RewriteRequest = await req.json();

    if (!outline || !rewriteInstructions) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline e instrucciones' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY no está configurada');
    }

    // Truncate outline to avoid exceeding token limits - keep essential structure
    const outlineStr = JSON.stringify(outline, null, 2);
    const truncatedOutline = outlineStr.length > 15000 
      ? outlineStr.substring(0, 15000) + '\n... [truncated for brevity]'
      : outlineStr;

    const userPrompt = `OUTLINE ACTUAL:
${truncatedOutline}

INSTRUCCIONES DE CORRECCIÓN:
${rewriteInstructions}

TARGETS A CUMPLIR:
${JSON.stringify(targets, null, 2)}

Reescribe el outline corrigiendo TODOS los problemas. Devuelve SOLO JSON válido con el outline completo corregido.`;

    console.log('Rewriting outline with Claude, instructions:', rewriteInstructions.substring(0, 200));

    const tools = [
      {
        name: "rewrite_outline",
        description: "Devuelve el outline corregido en formato JSON",
        input_schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            genre: { type: "string" },
            tone: { type: "string" },
            themes: { type: "array", items: { type: "string" } },
            premise: { type: "string" },
            main_characters: { 
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  role: { type: "string" },
                  description: { type: "string" },
                  arc: { type: "string" }
                }
              }
            },
            main_locations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  type: { type: "string" },
                  description: { type: "string" }
                }
              }
            },
            episode_beats: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  episode: { type: "number" },
                  title: { type: "string" },
                  summary: { type: "string" }
                }
              }
            },
            counts: {
              type: "object",
              properties: {
                episodes: { type: "number" },
                characters: { type: "number" },
                locations: { type: "number" }
              }
            }
          },
          required: ["title", "main_characters", "main_locations", "episode_beats", "counts"]
        }
      }
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: SCRIPT_MODEL,
        max_tokens: 8000,
        temperature: 0.3,
        tools,
        tool_choice: { type: "tool", name: "rewrite_outline" },
        messages: [
          { role: "user", content: `${SYSTEM_PROMPT}\n\n${userPrompt}` }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Claude error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit alcanzado. Espera un momento.', retryable: true }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 400 && errorText.toLowerCase().includes('credit')) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes en Claude.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Claude error: ${response.status}`);
    }

    const data = await response.json();
    const toolUse = data?.content?.find(
      (b: any) => b?.type === "tool_use" && b?.name === "rewrite_outline"
    );

    if (!toolUse?.input) {
      console.error('No tool_use response from Claude:', JSON.stringify(data).substring(0, 500));
      throw new Error('No outline in Claude response');
    }

    const improvedOutline = toolUse.input;
    console.log('Outline rewritten:', improvedOutline.title, 'new counts:', JSON.stringify(improvedOutline.counts));

    return new Response(
      JSON.stringify({ success: true, outline: improvedOutline }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-rewrite-outline:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
