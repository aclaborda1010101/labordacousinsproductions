import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  HOLLYWOOD_SYSTEM_PROMPT, 
  EPISODIC_ADDITIONS,
  getGenreRules,
  getExamplesBlock 
} from "../_shared/hollywood-writing-dna.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReferenceScript {
  title: string;
  content: string;
  genre?: string;
  notes?: string;
}

interface ScreenplayRequest {
  outline: any;
  targets: any;
  language?: string;
  referenceScripts?: ReferenceScript[];
  genre?: string;
}

// Build the complete system prompt with Hollywood DNA
function buildSystemPrompt(genre?: string): string {
  return `${HOLLYWOOD_SYSTEM_PROMPT}

${EPISODIC_ADDITIONS}

${genre ? getGenreRules(genre) : ''}

═══════════════════════════════════════════════════════════════════════════════
FORMATO DE SALIDA (JSON ESTRUCTURADO)
═══════════════════════════════════════════════════════════════════════════════

Devuelve un objeto JSON con la siguiente estructura:

{
  "title": "string",
  "logline": "string (máximo 2 oraciones, gancho + conflicto + stakes)",
  "synopsis": "string (150-300 palabras, cinematográfico)",
  "genre": "string",
  "tone": "string (específico: 'thriller noir con toques de dark comedy')",
  "themes": ["array de temas"],
  
  "characters": [
    {
      "name": "string (MAYÚSCULAS)",
      "role": "protagonist | antagonist | supporting | recurring | extra_with_lines",
      "description": "string (física + psicológica en 2-3 oraciones VISUALES)",
      "arc": "string (de qué a qué cambia)",
      "voice_notes": "string (vocabulario, ritmo, tics verbales)",
      "secret": "string (algo que oculta, opcional)",
      "flaw": "string (debilidad explotable)"
    }
  ],
  
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT",
      "description": "string visual (luz, textura, sonido ambiental)",
      "atmosphere": "string (emoción que evoca)",
      "story_function": "string (qué representa narrativamente)"
    }
  ],
  
  "props": [
    {
      "name": "string",
      "importance": "key | recurring | background",
      "description": "string visual",
      "story_function": "string (por qué importa)"
    }
  ],
  
  "episodes": [
    {
      "episode_number": 1,
      "title": "string (evocador, no descriptivo)",
      "synopsis": "string (100-150 palabras)",
      "summary": "string (2-3 oraciones)",
      "duration_min": number,
      "cold_open": "string (descripción del hook inicial)",
      "cliffhanger": "string (cómo termina el episodio)",
      "scenes": [
        {
          "scene_number": 1,
          "slugline": "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
          "summary": "string (50-80 palabras, conflicto claro)",
          "characters": ["NOMBRES EN MAYÚSCULAS"],
          
          "action": "string (120-200 palabras, visual, presente, específico)",
          
          "dialogue": [
            {
              "character": "NOMBRE",
              "parenthetical": "(beat) | (off) | (V.O.) | (CONT'D) | null",
              "line": "El diálogo con subtexto"
            }
          ],
          
          "subtext": "string (qué quieren realmente los personajes)",
          "scene_turn": "string (qué cambia durante la escena)",
          "hook_to_next": "string (última imagen o línea que conecta)",
          
          "music_cue": "string | null",
          "sfx_cue": "string | null",
          "vfx": ["array | null"],
          
          "mood": "string",
          "pacing": "frenético | tenso | contemplativo | explosivo",
          
          "continuity_anchors": {
            "time_of_day": "string",
            "weather": "string | null",
            "character_states": { "NOMBRE": "estado emocional" },
            "props_in_scene": ["array"]
          }
        }
      ]
    }
  ],
  
  "music_design": [
    {
      "name": "string (nombre del tema)",
      "type": "theme | ambient | action | emotional | diegetic",
      "description": "string (instrumentación, mood)",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "sfx_design": [
    {
      "category": "string",
      "description": "string específico",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "vfx_requirements": [
    {
      "name": "string",
      "type": "CG | composite | practical | hybrid",
      "description": "string",
      "complexity": "simple | medium | complex",
      "scenes": ["dónde se usa"]
    }
  ],
  
  "counts": {
    "protagonists": number,
    "supporting": number,
    "extras_with_lines": number,
    "locations": number,
    "hero_props": number,
    "setpieces": number,
    "subplots": number,
    "twists": number,
    "total_scenes": number,
    "total_dialogue_lines": number
  },
  
  "writing_notes": {
    "tone_reference": "string (película o serie de referencia tonal)",
    "visual_style": "string (descripción del look)",
    "pacing_philosophy": "string (cómo fluye el ritmo)",
    "thematic_throughline": "string (qué conecta todo)"
  },
  
  "qc_notes": ["observaciones de producción"]
}

REGLAS CRÍTICAS DEL GUION:

1. DIÁLOGOS COMPLETOS: Cada escena con TODAS las líneas escritas. NUNCA resumir.

2. VOCES DISTINTIVAS: Cada personaje debe tener vocabulario, ritmo y tics únicos.
   - El CEO habla diferente que el conserje
   - El adolescente diferente del anciano
   - El nervioso diferente del seguro

3. SUBTEXTO OBLIGATORIO: Los personajes NUNCA dicen lo que quieren directamente.
   - Quieren dinero → hablan de "seguridad"
   - Quieren poder → hablan de "responsabilidad"
   - Quieren amor → hablan de "tiempo juntos"

4. ACCIONES CINEMATOGRÁFICAS: Describe lo que VEO y OIGO, no lo que pienso.
   ❌ "Se siente nervioso"
   ✅ "Sus dedos tamborilean la mesa. Mira la puerta."

5. HOOKS CONSTANTES: Cada escena termina en tensión o pregunta.
   ❌ "Buenas noches. —Buenas noches."
   ✅ "Buenas noches. —(beat) Te mentí sobre algo."

6. COLD OPENS IMPACTANTES: Primera escena = gancho que engancha antes de títulos.

7. SHOW DON'T TELL: Información a través de conflicto, no explicación.

ANTI-PATRONES PROHIBIDOS:
- "Sus ojos reflejan..." → INFILMABLE
- "Hay algo en su mirada..." → VAGO
- "La tensión era palpable..." → ABSTRACTO  
- "Como sabes, Juan..." → EXPOSICIÓN TORPE
- "De alguna manera supo..." → TELEPATÍA
- Todos hablan igual → SIN VOCES
- Escenas sin conflicto → ABURRIDO`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, targets, language, referenceScripts, genre }: ScreenplayRequest = await req.json();

    if (!outline) {
      return new Response(
        JSON.stringify({ error: 'Se requiere outline aprobado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Lovable AI Gateway
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    // Build system prompt with Hollywood DNA
    const detectedGenre = genre || outline.genre || 'drama';
    const systemPrompt = buildSystemPrompt(detectedGenre);

    // Build professional screenplay reference section
    let referenceSection = '';
    if (referenceScripts && referenceScripts.length > 0) {
      referenceSection = `
═══════════════════════════════════════════════════════════════════════════════
GUIONES DE REFERENCIA DEL USUARIO
═══════════════════════════════════════════════════════════════════════════════

Estudia estos extractos para entender el TONO y ESTILO que el usuario busca:

`;
      for (const ref of referenceScripts.slice(0, 2)) {
        const excerpt = ref.content.slice(0, 4000);
        referenceSection += `=== ${ref.title} ${ref.genre ? `(${ref.genre})` : ''} ===
${ref.notes ? `Notas del usuario: ${ref.notes}\n` : ''}
${excerpt}

`;
      }
      referenceSection += `═══════════════════════════════════════════════════════════════════════════════
`;
    }

    // Add Hollywood examples
    const hollywoodExamples = getExamplesBlock();

    const userPrompt = `GENERA EL GUION COMPLETO CON CALIDAD HOLLYWOOD:

═══════════════════════════════════════════════════════════════════════════════
OUTLINE APROBADO
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(outline, null, 2)}

═══════════════════════════════════════════════════════════════════════════════
TARGETS DE PRODUCCIÓN
═══════════════════════════════════════════════════════════════════════════════

${JSON.stringify(targets, null, 2)}

${hollywoodExamples}
${referenceSection}

═══════════════════════════════════════════════════════════════════════════════
INSTRUCCIONES FINALES
═══════════════════════════════════════════════════════════════════════════════

IDIOMA: ${language || 'es-ES'}
GÉNERO: ${detectedGenre}

EJECUTA:
1. Lee el outline completo y entiende la historia
2. Desarrolla cada escena con diálogos COMPLETOS y acción CINEMATOGRÁFICA
3. Asegúrate de que cada personaje tenga VOZ DISTINTIVA
4. Incluye SUBTEXTO en cada intercambio de diálogo
5. Termina cada escena con HOOK hacia la siguiente
6. El Cold Open debe ENGANCHAR en las primeras 3 líneas

CALIDAD ESPERADA: Nivel HBO/Netflix/A24. No un primer borrador, un shooting script.

Devuelve SOLO JSON válido sin comentarios ni markdown.`;

    console.log('Generating Hollywood-tier screenplay from outline:', outline.title);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_completion_tokens: 32000
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Lovable AI error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required - add credits to Lovable AI' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content from Lovable AI');
    }

    // Parse JSON from response (handle markdown code blocks)
    let screenplay;
    try {
      // Try direct parse
      screenplay = JSON.parse(content);
    } catch {
      // Try extracting from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        screenplay = JSON.parse(jsonMatch[1]);
      } else {
        // Try finding JSON object
        const start = content.indexOf('{');
        const end = content.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          screenplay = JSON.parse(content.slice(start, end + 1));
        } else {
          throw new Error('Could not parse screenplay JSON');
        }
      }
    }

    console.log('Hollywood-tier screenplay generated:', screenplay.title, 'scenes:', screenplay.counts?.total_scenes);

    return new Response(
      JSON.stringify({ success: true, screenplay }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-generate-screenplay:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
