import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY no está configurada');
    }

    const userPrompt = `OUTLINE ACTUAL:
${JSON.stringify(outline, null, 2)}

INSTRUCCIONES DE CORRECCIÓN:
${rewriteInstructions}

TARGETS A CUMPLIR:
${JSON.stringify(targets, null, 2)}

Reescribe el outline corrigiendo TODOS los problemas. Devuelve SOLO JSON válido con el outline completo corregido.`;

    console.log('Rewriting outline with instructions:', rewriteInstructions.substring(0, 200));

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.25,
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI error:', response.status, errorText);
      throw new Error(`OpenAI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content from OpenAI');
    }

    const improvedOutline = JSON.parse(content);
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
