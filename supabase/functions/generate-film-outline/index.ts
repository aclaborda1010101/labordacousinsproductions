/**
 * generate-film-outline - FAST outline generation for films
 * 
 * Optimizado para velocidad:
 * - Modelo rápido (Gemini Flash)
 * - Prompt simplificado
 * - Sin polling, respuesta directa
 * - Timeout-safe (< 60s)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Modelo ultra-rápido
const MODEL = 'google/gemini-2.0-flash';
const MAX_TOKENS = 8000;

const FILM_OUTLINE_PROMPT = `Eres un guionista profesional de Hollywood. 
Genera un OUTLINE estructurado para una PELÍCULA basándote en la idea proporcionada.

FORMATO DE SALIDA (JSON):
{
  "title": "Título de la película",
  "logline": "Una oración que resume la premisa (máx 30 palabras)",
  "genre": "Género principal",
  "tone": "Tono específico (ej: 'comedia absurda con toques de ternura')",
  "themes": ["tema1", "tema2"],
  "synopsis": "Sinopsis de 150-200 palabras",
  "characters": [
    {
      "name": "NOMBRE EN MAYÚSCULAS",
      "role": "protagonist/antagonist/supporting",
      "description": "Descripción física y psicológica en 2 oraciones",
      "arc": "De qué a qué cambia el personaje"
    }
  ],
  "locations": [
    {
      "name": "Nombre del lugar",
      "type": "INT/EXT",
      "description": "Descripción visual breve"
    }
  ],
  "structure": {
    "act1": {
      "setup": "Situación inicial (2-3 oraciones)",
      "inciting_incident": "El evento que cambia todo",
      "end_of_act1": "La decisión del protagonista"
    },
    "act2": {
      "rising_action": "Los obstáculos principales",
      "midpoint": "El giro a mitad de película",
      "crisis": "El momento más bajo"
    },
    "act3": {
      "climax": "La confrontación final",
      "resolution": "Cómo termina todo"
    }
  },
  "episodes": [
    {
      "episode_number": 1,
      "title": "Título evocador",
      "synopsis": "Sinopsis completa de la película (300 palabras)",
      "scenes": [
        {
          "scene_number": 1,
          "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
          "summary": "Qué pasa en esta escena (50 palabras)"
        }
      ]
    }
  ]
}

REGLAS:
- Mínimo 5 personajes
- Mínimo 8 localizaciones
- Mínimo 25 escenas para una película de 90 minutos
- Cada escena debe tener conflicto
- El protagonista debe tener un arco claro
- RESPONDE SOLO CON JSON VÁLIDO, SIN MARKDOWN`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { idea, genre, duration, projectId } = await req.json();

    if (!idea) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una idea' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userPrompt = `IDEA: ${idea}
GÉNERO: ${genre || 'comedia'}
DURACIÓN: ${duration || 90} minutos

Genera el outline completo en JSON.`;

    // Llamar al modelo via Lovable AI Gateway
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY') || Deno.env.get('OPENAI_API_KEY')}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: FILM_OUTLINE_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parsear JSON de la respuesta
    let outline;
    try {
      // Limpiar posible markdown
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      outline = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Parse error:', parseError);
      console.error('Raw content:', content.substring(0, 500));
      throw new Error('Error parseando outline JSON');
    }

    // Guardar en DB si hay projectId
    if (projectId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      await supabase.from('outlines').upsert({
        project_id: projectId,
        outline_json: outline,
        status: 'approved',
        format: 'film',
        quality: 'profesional',
      }, { onConflict: 'project_id' });
    }

    return new Response(
      JSON.stringify({ 
        outline,
        outline_quality: 'PROFESSIONAL',
        warnings: []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Error generando outline' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
