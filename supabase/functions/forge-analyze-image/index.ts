import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuthOrDemo } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAuthOrDemo(req);
    const { imageUrl, imageBase64, analysisType = 'reference', userQuery } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const image = imageBase64 || imageUrl;
    if (!image) {
      throw new Error('Image URL or base64 is required');
    }

    console.log(`[Forge Analyze] Analyzing image for ${analysisType}`);

    // Build analysis prompt based on type
    let systemPrompt = '';
    if (analysisType === 'reference') {
      systemPrompt = `Eres un director de arte experto en producción cinematográfica. 
Analiza esta imagen de referencia y extrae:
1. Paleta de colores dominante (códigos hex)
2. Estilo visual (realista, estilizado, cartoon, etc.)
3. Iluminación (dirección, temperatura, contraste)
4. Composición (reglas, puntos focales)
5. Atmósfera/mood
6. Elementos clave para replicar en producción

Si el usuario tiene una pregunta específica, respóndela en el contexto de producción de video AI.`;
    } else if (analysisType === 'character') {
      systemPrompt = `Eres un diseñador de personajes experto.
Analiza esta imagen y extrae características del personaje:
1. Rasgos físicos (edad, altura, complexión, piel, ojos, cabello)
2. Vestuario y accesorios
3. Expresión y personalidad percibida
4. Estilo artístico
5. Detalles únicos identificadores
6. Recomendaciones para mantener consistencia en AI generation`;
    } else if (analysisType === 'location') {
      systemPrompt = `Eres un diseñador de producción experto.
Analiza esta imagen de locación y extrae:
1. Tipo de espacio (interior/exterior, urbano/natural)
2. Arquitectura y elementos estructurales
3. Iluminación ambiental
4. Props y decoración
5. Atmósfera y mood
6. Consideraciones para recrear en AI video generation`;
    } else if (analysisType === 'style') {
      systemPrompt = `Eres un director creativo experto en estilos visuales.
Analiza esta imagen y define el estilo visual:
1. Nombre del estilo (ej: "Neo-noir cyberpunk")
2. Características definitorias
3. Artistas/películas de referencia similares
4. Técnicas visuales específicas
5. Cómo replicar este estilo en prompts de AI generation`;
    }

    const userMessage = userQuery 
      ? `${systemPrompt}\n\nPregunta del usuario: ${userQuery}`
      : systemPrompt;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: userMessage },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Forge Analyze] API error:', errorText);
      throw new Error(`Image analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '';

    console.log(`[Forge Analyze] Analysis complete: ${analysis.length} characters`);

    return new Response(JSON.stringify({
      analysis,
      analysisType,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error('Unknown error');
    const status =
      err.message.includes('Authorization') ||
      err.message.includes('Access denied') ||
      err.message.includes('token')
        ? 401
        : 500;

    console.error('[Forge Analyze] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
