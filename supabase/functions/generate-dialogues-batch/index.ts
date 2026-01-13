import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Scene {
  scene_number: number;
  slugline: string;
  summary?: string;
  action?: string;
  characters?: string[];
  characters_present?: string[];
  mood?: string;
  dialogue?: any[];
}

interface GenerateDialoguesRequest {
  projectId: string;
  scenes: Scene[];
  projectCharacters?: string[];
  language?: string;
  tone?: string;
  genre?: string;
}

const SYSTEM_PROMPT = `Eres un guionista cinematográfico profesional experto en escribir diálogos naturales con subtexto.

⚠️ REGLAS OBLIGATORIAS - VIOLACIÓN = RECHAZO COMPLETO:

1. IDIOMA: TODOS los diálogos DEBEN estar en ESPAÑOL (castellano de España/Latinoamérica).
   - NUNCA escribas en inglés bajo ninguna circunstancia.
   - Cualquier línea en inglés invalidará tu respuesta completa.

2. PERSONAJES: Usa ÚNICAMENTE los personajes de la lista proporcionada.
   - NUNCA inventes personajes nuevos (SOFIA, MARÍA, JOHN, etc.).
   - Si un nombre no está en la lista, NO lo uses.
   - Si una escena no tiene personajes listados, devuelve dialogue: [] vacío.

3. ESCENAS SIN PERSONAJES: Para escenas puramente visuales/descriptivas:
   - dialogue: [] (array vacío, SIN excepciones)
   - action_beats: ["Descripción de la acción visual en español"]
   - NUNCA inventes personajes para rellenar.

REGLAS DE CALIDAD:
- Mínimo 4-8 líneas de diálogo por escena CON personajes hablando
- Diálogos naturales, no expositivos - show don't tell
- Cada personaje tiene voz única (vocabulario, ritmo, tics verbales)
- Subtexto: lo que dicen vs lo que quieren decir
- Conflicto o tensión en cada intercambio
- Parentéticos solo cuando son esenciales
- Evitar clichés y frases genéricas

FORMATO DE SALIDA (JSON estricto):
{
  "scenes": [
    {
      "scene_number": 1,
      "dialogue": [
        {
          "character": "NOMBRE_EXACTO_DE_LA_LISTA",
          "parenthetical": "(opcional)",
          "line": "El diálogo en español"
        }
      ],
      "action_beats": ["Acción visual en español"]
    }
  ]
}

RECUERDA: TODO en ESPAÑOL. SOLO personajes de la lista. Escenas sin personajes = dialogue vacío.`;

async function callLovableAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY not configured');
  }
  
  console.log('[generate-dialogues-batch] Calling GPT-5.2 via Lovable Gateway');
  
  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 8000,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    console.error('[generate-dialogues-batch] Gateway error:', response.status, errText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded - please try again later');
    }
    if (response.status === 402) {
      throw new Error('Payment required - add credits to Lovable workspace');
    }
    throw new Error(`AI Gateway error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  
  // OpenAI format: choices[0].message.content
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

// Extract character names from scenes if projectCharacters not provided
function extractCharactersFromScenes(scenes: Scene[]): string[] {
  const charSet = new Set<string>();
  for (const scene of scenes) {
    const chars = scene.characters || scene.characters_present || [];
    for (const c of chars) {
      if (c && typeof c === 'string') {
        charSet.add(c.toUpperCase().trim());
      }
    }
  }
  return Array.from(charSet);
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

    const { 
      projectId, 
      scenes, 
      projectCharacters,
      language = 'es', 
      tone = 'dramático', 
      genre = 'drama' 
    } = await req.json() as GenerateDialoguesRequest;

    if (!projectId || !scenes || scenes.length === 0) {
      return new Response(JSON.stringify({ error: 'projectId and scenes are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get character list - prefer explicit list, fallback to extraction from scenes
    const characterList = projectCharacters && projectCharacters.length > 0
      ? projectCharacters.map(c => c.toUpperCase().trim())
      : extractCharactersFromScenes(scenes);
    
    console.log('[generate-dialogues-batch] Character list:', characterList);

    // Filter scenes that need dialogue (have characters but no dialogue yet)
    // Accept both "characters" and "characters_present" field names
    const scenesNeedingDialogue = scenes.filter(s => {
      const chars = s.characters || s.characters_present || [];
      const hasCharacters = chars.length > 0;
      const hasDialogue = s.dialogue && s.dialogue.length > 0;
      return hasCharacters && !hasDialogue;
    });

    if (scenesNeedingDialogue.length === 0) {
      console.log('[generate-dialogues-batch] No scenes need dialogue generation');
      return new Response(JSON.stringify({ 
        success: true, 
        scenes: scenes,
        generated_count: 0,
        message: 'No scenes needed dialogue generation'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-dialogues-batch] Generating dialogues for ${scenesNeedingDialogue.length} scenes`);

    // Build user prompt with scene details
    const scenesData = scenesNeedingDialogue.map(s => ({
      scene_number: s.scene_number,
      slugline: s.slugline,
      summary: s.summary || '',
      action: s.action || '',
      characters: s.characters || s.characters_present || [],
      mood: s.mood || '',
    }));

    const userPrompt = `⚠️ OBLIGATORIO: Escribe TODO en ESPAÑOL. Cualquier texto en inglés será rechazado.

PERSONAJES DISPONIBLES (usa SOLO estos nombres exactamente, NUNCA inventes otros):
${characterList.length > 0 ? characterList.join(', ') : '(ningún personaje definido - solo action_beats)'}

CONTEXTO DE LA PRODUCCIÓN:
- Género: ${genre}
- Tono: ${tone}
- Idioma obligatorio: ${language === 'es' ? 'ESPAÑOL' : 'Español'}

ESCENAS A PROCESAR (${scenesNeedingDialogue.length} escenas):
${JSON.stringify(scenesData, null, 2)}

INSTRUCCIONES:
1. Analiza qué personajes de la lista están presentes en cada escena
2. Genera diálogos SOLO para personajes que están en la lista de PERSONAJES DISPONIBLES
3. Si una escena no tiene personajes de la lista, devuelve dialogue: [] vacío
4. Incluye action_beats para ritmo visual (también en español)
5. Mantén coherencia con el slugline y mood

Devuelve SOLO JSON válido con el formato especificado. TODO en ESPAÑOL.`;

    const aiResponse = await callLovableAI(SYSTEM_PROMPT, userPrompt);
    const parsed = parseJSONFromResponse(aiResponse);

    // Merge generated dialogues back into original scenes
    const dialogueMap = new Map<number, { dialogue: any[]; action_beats?: string[] }>();
    if (parsed.scenes && Array.isArray(parsed.scenes)) {
      for (const s of parsed.scenes) {
        if (s.scene_number && s.dialogue) {
          // Validate that dialogue uses only allowed characters
          const validatedDialogue = s.dialogue.filter((d: any) => {
            const charName = (d.character || '').toUpperCase().trim();
            const isValid = characterList.some(c => 
              c === charName || 
              c.includes(charName) || 
              charName.includes(c)
            );
            if (!isValid && charName) {
              console.warn(`[generate-dialogues-batch] Filtered out invalid character: ${charName}`);
            }
            return isValid || !charName;
          });
          
          dialogueMap.set(s.scene_number, {
            dialogue: validatedDialogue,
            action_beats: s.action_beats || [],
          });
        }
      }
    }

    // Update original scenes with generated dialogues
    const updatedScenes = scenes.map(scene => {
      const generated = dialogueMap.get(scene.scene_number);
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
