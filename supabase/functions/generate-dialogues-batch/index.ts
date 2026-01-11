import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Accepts both frontend format (number, heading, characters_present) 
// and backend format (scene_number, slugline, characters)
interface Scene {
  scene_number?: number;
  number?: number;
  slugline?: string;
  heading?: string;
  summary?: string;
  action?: string;
  characters?: string[];
  characters_present?: string[];
  mood?: string;
  dialogue?: any[];
  [key: string]: any; // Allow other fields to pass through
}

interface GenerateDialoguesRequest {
  projectId: string;
  scenes: Scene[];
  language?: string;
  tone?: string;
  genre?: string;
}

const SYSTEM_PROMPT = `Eres un guionista profesional experto en escribir diálogos cinematográficos naturales y con subtexto.

TU MISIÓN: Generar diálogos completos para las escenas proporcionadas.

REGLAS DE DIÁLOGO:
1. Mínimo 4-8 líneas de diálogo por escena con personajes hablando
2. Diálogos naturales, no expositivos - show don't tell
3. Cada personaje tiene voz única (vocabulario, ritmo, tics verbales)
4. Subtexto: lo que dicen vs lo que quieren decir
5. Conflicto o tensión en cada intercambio
6. Parentéticos solo cuando son esenciales (tono, acción física)
7. Evitar clichés y frases de IA genéricas
8. Acciones intercaladas entre diálogos para ritmo visual
9. Si una escena NO tiene personajes listados, INFIERE los personajes más probables del contexto narrativo de la escena
10. Si es una escena puramente visual/de transición sin posibilidad de diálogo (ej: paisaje, montaje), devuelve dialogue: [] pero incluye action_beats descriptivos

FORMATO DE SALIDA (JSON):
{
  "scenes": [
    {
      "scene_number": 1,
      "dialogue": [
        {
          "character": "NOMBRE EN MAYÚSCULAS",
          "parenthetical": "(opcional)",
          "line": "El diálogo completo"
        }
      ],
      "action_beats": ["Acción visual entre diálogos"]
    }
  ]
}

NUNCA:
- Resumir diálogos con "continúan hablando..."
- Usar exposición forzada
- Hacer que todos hablen igual
- Ignorar el tono/género de la producción
- Omitir escenas del input (devuelve TODAS, incluso las visuales con dialogue vacío)`;

const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }
  
  console.log('[generate-dialogues-batch] Calling Lovable AI Gateway');
  
  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error('[generate-dialogues-batch] Gateway error:', response.status, errText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded - please try again later');
    }
    if (response.status === 402) {
      throw new Error('Payment required - please add credits');
    }
    throw new Error(`AI Gateway error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJSONFromResponse(text: string): any {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code block
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Continue to next method
      }
    }
    
    // Try to find JSON object
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // Failed
      }
    }
    
    throw new Error('Could not parse JSON from AI response');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Internal JWT validation (gateway JWT disabled)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      console.error('[generate-dialogues-batch] Auth error:', claimsError);
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('[generate-dialogues-batch] Authenticated user:', claimsData.user.id);

    const { projectId, scenes, language = 'es', tone = 'dramático', genre = 'drama' } = await req.json() as GenerateDialoguesRequest;

    if (!projectId || !scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ error: 'projectId and scenes are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Normalize scene fields to handle both frontend and backend formats
    const normalizeScene = (s: Scene) => {
      const sceneNo = s.scene_number ?? s.number ?? 0;
      const slugline = s.slugline ?? s.heading ?? '';
      // Clean characters: filter out garbage like "FIN", numbers, etc.
      const rawCharacters = s.characters ?? s.characters_present ?? [];
      const characters = rawCharacters.filter(c => 
        c && 
        typeof c === 'string' && 
        c.length > 1 && 
        !/^\d+$/.test(c) && 
        !['FIN', 'CONTINUARÁ', 'END'].includes(c.toUpperCase())
      );
      return { sceneNo, slugline, characters, original: s };
    };

    // Filter scenes that need dialogue - ANY scene without dialogue, regardless of characters
    // The LLM will infer characters from context or mark as action-only scene
    const scenesNeedingDialogue = scenes
      .map(normalizeScene)
      .filter(n => {
        const hasDialogue = n.original.dialogue && Array.isArray(n.original.dialogue) && n.original.dialogue.length > 0;
        return !hasDialogue; // Any scene without dialogue
      });

    if (scenesNeedingDialogue.length === 0) {
      console.log('[generate-dialogues-batch] No scenes need dialogue generation');
      // Log why - helps debugging
      const allNormalized = scenes.map(normalizeScene);
      console.log('[generate-dialogues-batch] Scene analysis:', allNormalized.map(n => ({
        sceneNo: n.sceneNo,
        chars: n.characters.length,
        hasDialogue: !!(n.original.dialogue && Array.isArray(n.original.dialogue) && n.original.dialogue.length > 0)
      })));
      return new Response(JSON.stringify({ 
        success: true, 
        scenes: scenes, // Return original scenes unchanged
        generated_count: 0,
        message: 'No scenes needed dialogue generation (all already have dialogues or no characters)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-dialogues-batch] Generating dialogues for ${scenesNeedingDialogue.length} scenes`);

    // Build user prompt with scene details
    const scenesData = scenesNeedingDialogue.map(n => ({
      scene_number: n.sceneNo,
      slugline: n.slugline,
      summary: n.original.summary || n.original.action || '',
      action: n.original.action || '',
      characters: n.characters,
      mood: n.original.mood || '',
    }));

    const userPrompt = `Genera diálogos para las siguientes ${scenesNeedingDialogue.length} escenas.

CONTEXTO:
- Género: ${genre}
- Tono: ${tone}
- Idioma: ${language === 'es' ? 'Español' : 'English'}

ESCENAS:
${JSON.stringify(scenesData, null, 2)}

Para cada escena:
1. Analiza qué personajes están presentes
2. Genera diálogos naturales que avancen la trama
3. Mantén coherencia con el slugline y mood
4. Incluye action_beats para ritmo visual

Devuelve SOLO JSON válido con el formato especificado.`;

    const aiResponse = await callAI(SYSTEM_PROMPT, userPrompt);
    const parsed = parseJSONFromResponse(aiResponse);

    // Merge generated dialogues back into original scenes
    const dialogueMap = new Map<number, { dialogue: any[]; action_beats?: string[] }>();
    if (parsed.scenes && Array.isArray(parsed.scenes)) {
      for (const s of parsed.scenes) {
        if (s.scene_number && s.dialogue) {
          dialogueMap.set(s.scene_number, {
            dialogue: s.dialogue,
            action_beats: s.action_beats || [],
          });
        }
      }
    }

    // Update original scenes with generated dialogues - use normalized scene number
    const updatedScenes = scenes.map(scene => {
      const normalized = normalizeScene(scene);
      const generated = dialogueMap.get(normalized.sceneNo);
      if (generated) {
        return {
          ...scene,
          dialogue: generated.dialogue,
          action_beats: generated.action_beats,
        };
      }
      return scene;
    });

    const generatedCount = dialogueMap.size;
    console.log(`[generate-dialogues-batch] Generated dialogues for ${generatedCount} scenes`);

    return new Response(JSON.stringify({
      success: true,
      scenes: updatedScenes,
      generated_count: generatedCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-dialogues-batch] Error:', error);
    
    const status = error instanceof Error && error.message.includes('Rate limit') ? 429
      : error instanceof Error && error.message.includes('Payment required') ? 402
      : 500;
    
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
