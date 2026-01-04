import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptBreakdownRequest {
  scriptText: string;
  projectId: string;
  scriptId?: string;
  language?: string;
}

const SYSTEM_PROMPT = `Eres un ANALIZADOR NARRATIVO PROFESIONAL de alto nivel (showrunner + script editor + story analyst).
NO eres un generador de sinopsis comerciales ni un extractor superficial.

═══════════════════════════════════════════════════════════════════
OBJETIVO:
═══════════════════════════════════════════════════════════════════
Analizar el texto como una obra narrativa completa (guion, novela, biblia de serie o saga), respetando ESTRICTAMENTE lo que está escrito y SIN AÑADIR elementos externos.

═══════════════════════════════════════════════════════════════════
REGLAS FUNDAMENTALES (OBLIGATORIAS - VIOLACIÓN = FALLO CRÍTICO):
═══════════════════════════════════════════════════════════════════

1. PROHIBIDO INVENTAR:
   - NO inventes personajes, antagonistas, aliados, agencias, organizaciones, conflictos, conspiraciones o fuerzas que NO estén EXPLÍCITAMENTE nombradas en el texto.
   - Si un elemento no está en el texto original, NO existe en tu análisis.

2. RESPETAR LA NATURALEZA DEL CONFLICTO:
   - Si el texto NO presenta un antagonista humano clásico, NO lo crees ni lo infieras.
   - El conflicto puede ser: ético, histórico, estructural, civilizatorio, interno, sistémico, filosófico, existencial.
   - Respeta la naturaleza del conflicto TAL COMO está en el texto.

3. PERSONAJES NARRATIVOS VÁLIDOS:
   Reconoce como PERSONAJES a cualquier entidad con agencia, decisiones o impacto narrativo:
   - Individuos humanos
   - Entidades no humanas conscientes
   - Colectivos con agencia (consejos, asambleas, grupos)
   - Civilizaciones como actores narrativos
   - Linajes que evolucionan generacionalmente
   - Sistemas conscientes (IAs, redes, entidades abstractas)

4. CLASIFICACIÓN ESTRICTA DE PERSONAJES (solo basada en el texto):
   CATEGORÍAS OBLIGATORIAS - USA TODAS LAS QUE APLIQUEN:
   - protagonist: Sostiene el arco central de la narrativa (máximo 3-4)
   - antagonist: SOLO si el texto EXPLÍCITAMENTE presenta una fuerza opositora identificable
   - supporting: Función narrativa relevante, apoyo al protagonista (personajes con nombre que aparecen en múltiples escenas)
   - recurring: Aparecen más de una vez pero no tienen arco propio
   - cameo: Aparición breve pero memorable (figuras históricas, celebridades mencionadas)
   - extra_with_line: Intervenciones puntuales con diálogo pero rol mínimo
   - background: Figurantes, grupos de personas sin nombre individual
   - collective_entity: Civilizaciones, grupos, consejos, organizaciones con agencia colectiva
   - cosmic_entity: Entidades de escala planetaria/cósmica/dimensional
   
   IMPORTANTE: 
   - EXTRAE TODOS los personajes mencionados, incluso si solo aparecen una vez.
   - Los grupos (ej: "atlantes estelares", "Consejo de los Diez Reinos") son entidades colectivas válidas.
   - Figuras históricas mencionadas (ej: "Jesús", "Platón") son cameos si se les referencia.
   - NO reduzcas el reparto solo a personajes humanos cotidianos.
   - Prefiere sobredetectar que infradetectar.

5. LOCALIZACIONES AMPLIADAS:
   Reconoce como LOCALIZACIONES válidas:
   - Espacios físicos clásicos (INT / EXT)
   - Lugares históricos (ciudades antiguas, imperios, épocas pasadas)
   - Espacios simbólicos o abstractos narrativamente relevantes
   - Entornos planetarios, subterráneos, orbitales
   - Localizaciones cósmicas o dimensionales
   
   NO requieras formato técnico INT./EXT. para localizaciones no convencionales.

6. ANÁLISIS COMPLETO:
   - NO reduzcas la historia al primer capítulo o bloque inicial.
   - Asume que TODO el texto proporcionado forma parte de una ÚNICA estructura narrativa coherente.
   - Analiza desde el principio hasta el final.

7. NO FORZAR GÉNEROS:
   NO conviertas automáticamente la obra en:
   - Thriller
   - Conspiración
   - Procedural
   - Historia de persecución
   - Acción comercial
   
   A MENOS que el texto lo indique EXPLÍCITAMENTE con esos elementos.

8. EXTRAER SEPARADAMENTE:
   - Sinopsis FIEL (sin clichés añadidos, sin lenguaje promocional)
   - Personajes (por categorías estrictas)
   - Localizaciones (todas las escalas)
   - Props clave (objetos, tecnologías, símbolos relevantes del texto)
   - Set pieces (eventos narrativos mayores que ESTÁN en el texto)
   - Subtramas (solo las que EXISTEN en el texto)
   - Giros narrativos (solo los EXPLÍCITOS)
   - Escalas temporales si existen
   - Tipo de conflicto predominante

9. LENGUAJE PROFESIONAL:
   Tu salida debe ser:
   - Descriptiva y neutral
   - Estructural y analítica
   - Propia de una biblia de serie o análisis de guion profesional
   
   PROHIBIDO:
   - Lenguaje promocional o sensacionalista
   - Frases como "juego peligroso", "fuerzas ocultas", "nada es lo que parece"
   - Clichés de marketing cinematográfico

10. HONESTIDAD ANTE LA INCERTIDUMBRE:
    Si algo NO está claramente definido en el texto:
    - Indícalo como "no especificado" o "no explícito en el texto"
    - NO lo infieras ni lo inventes
    - Es preferible un campo vacío a uno inventado

═══════════════════════════════════════════════════════════════════
FORMATO DE SALIDA OBLIGATORIO (JSON):
═══════════════════════════════════════════════════════════════════

{
  "synopsis": {
    "faithful_summary": "string (resumen fiel al contenido, sin clichés)",
    "conflict_type": "ethical | historical | structural | civilizational | internal | systemic | philosophical | existential | interpersonal | external_threat",
    "narrative_scope": "personal | generational | civilizational | cosmic",
    "temporal_span": "string (ej: 'contemporáneo', '10.000 años', 'múltiples eras')",
    "tone": "string (tono real de la obra, no género forzado)",
    "themes": ["array de temas principales EXPLÍCITOS en el texto"]
  },
  "scenes": [
    {
      "scene_number": number,
      "slugline": "string",
      "location_name": "string",
      "location_type": "INT | EXT | INT/EXT | COSMIC | HISTORICAL | DIMENSIONAL | SYMBOLIC",
      "time_of_day": "DAY | NIGHT | DAWN | DUSK | CONTINUOUS | TIMELESS | NOT_SPECIFIED",
      "era": "string (opcional, solo si está explícito)",
      "summary": "string (resumen fiel de 1-2 frases)",
      "objective": "string (función narrativa de la escena)",
      "mood": "string (atmósfera)",
      "page_range": "string",
      "estimated_duration_sec": number,
      "characters_present": ["array de nombres TAL COMO aparecen en el texto"],
      "props_used": ["array de props MENCIONADOS en el texto"],
      "continuity_notes": "string",
      "priority": "P0 | P1 | P2",
      "complexity": "low | medium | high | epic"
    }
  ],
  "characters": [
    {
      "name": "string (nombre EXACTO del texto)",
      "entity_type": "individual | collective | civilization | cosmic | lineage | ai | hybrid | historical_figure | not_specified",
      "role": "protagonist | antagonist | supporting | recurring | cameo | extra_with_line | background | collective_entity | cosmic_entity",
      "role_detail": "string (descripción específica del rol: ej. 'Guardián del Fuego', 'Mentor del protagonista')",
      "description": "string (SOLO lo que dice el texto)",
      "personality": "string (SOLO si está descrito)",
      "arc": "string (SOLO si es evidente en el texto)",
      "scale": "personal | generational | civilizational | cosmic",
      "first_appearance": "string (escena o momento donde aparece por primera vez)",
      "scenes": [number array],
      "scenes_count": number,
      "dialogue_lines": number,
      "priority": "P0 | P1 | P2",
      "notes": "string",
      "explicitly_described": boolean
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT | PLANETARY | ORBITAL | SUBTERRANEAN | DIMENSIONAL | HISTORICAL | SYMBOLIC",
      "scale": "room | building | city | continent | planetary | stellar | cosmic | abstract",
      "era": "string (solo si está explícito)",
      "description": "string (SOLO lo descrito en el texto)",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "explicitly_described": boolean
    }
  ],
  "props": [
    {
      "name": "string",
      "type": "object | weapon | document | vehicle | artifact | technology | material | symbol | other",
      "description": "string (SOLO lo mencionado)",
      "importance": "key | recurring | background",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "explicitly_mentioned": boolean
    }
  ],
  "set_pieces": [
    {
      "name": "string",
      "type": "action | ritual | transformation | revelation | confrontation | cataclysm | cosmic_event | other",
      "description": "string (descripción fiel)",
      "scenes": [number array],
      "complexity": "low | medium | high | epic",
      "explicitly_in_text": boolean
    }
  ],
  "subplots": [
    {
      "name": "string",
      "description": "string",
      "characters_involved": ["array"],
      "scenes": [number array],
      "resolution": "string | not_resolved | not_specified"
    }
  ],
  "plot_twists": [
    {
      "name": "string",
      "scene": number,
      "description": "string",
      "impact": "minor | major | paradigm_shift",
      "explicitly_in_text": boolean
    }
  ],
  "continuity_anchors": [
    {
      "name": "string",
      "type": "physical_state | emotional_state | temporal | civilizational | cosmic",
      "description": "string",
      "applies_from_scene": number,
      "applies_to_scene": number | null,
      "notes": "string"
    }
  ],
  "summary": {
    "total_scenes": number,
    "total_characters": number,
    "protagonists": number,
    "antagonists": number,
    "supporting_characters": number,
    "recurring_characters": number,
    "cameos": number,
    "extras_with_lines": number,
    "collective_entities": number,
    "total_locations": number,
    "total_props": number,
    "total_set_pieces": number,
    "total_subplots": number,
    "total_plot_twists": number,
    "estimated_runtime_min": number,
    "analysis_confidence": "high | medium | low",
    "elements_not_specified": ["array de elementos que no están claros en el texto"],
    "production_notes": "string"
  }
}

═══════════════════════════════════════════════════════════════════
PRIORIDADES:
═══════════════════════════════════════════════════════════════════
- P0: Imprescindible (protagonistas, localizaciones principales, elementos centrales)
- P1: Importante (personajes secundarios, localizaciones recurrentes)
- P2: Complementario (extras, localizaciones de una escena, elementos de fondo)

═══════════════════════════════════════════════════════════════════
RECORDATORIO FINAL:
═══════════════════════════════════════════════════════════════════
Tu análisis debe ser un DESGLOSE RIGUROSO Y FIEL al contenido original.
- SIN invenciones
- SIN simplificaciones forzadas
- SIN conversión a géneros comerciales
- SIN clichés de marketing

Si dudas sobre algo, indícalo como "no especificado" antes que inventarlo.

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, scriptId, language } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
DESGLOSE DE PRODUCCIÓN SOLICITADO:

PROJECT ID: ${projectId}
IDIOMA DE RESPUESTA: ${language || 'es-ES'}

GUION A DESGLOSAR:
---
${scriptText}
---

Realiza un desglose EXHAUSTIVO de este guion. Extrae TODAS las entidades de producción siguiendo el formato JSON especificado.

IMPORTANTE:
- Sé exhaustivo: no dejes ningún personaje, prop o localización sin detectar
- Mantén consistencia en los nombres (mismo personaje = mismo nombre exacto)
- Detecta variantes de localizaciones y agrúpalas
- Identifica riesgos de continuidad
- Asigna prioridades realistas
- Incluye notas de producción útiles`;

    console.log('Breaking down script, length:', scriptText.length, 'projectId:', projectId);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Parse JSON from response
    let breakdownData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        breakdownData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      // Return a structured fallback with basic parsing
      breakdownData = {
        scenes: [],
        characters: [],
        locations: [],
        props: [],
        wardrobe: [],
        set_pieces: [],
        vfx_sfx: [],
        sound_music: [],
        continuity_anchors: [],
        summary: {
          total_scenes: 0,
          total_characters: 0,
          total_locations: 0,
          total_props: 0,
          production_notes: 'Failed to parse breakdown. Please try again.'
        },
        raw_response: content
      };
    }

    console.log('Script breakdown complete:', {
      scenes: breakdownData.scenes?.length || 0,
      characters: breakdownData.characters?.length || 0,
      locations: breakdownData.locations?.length || 0,
      props: breakdownData.props?.length || 0
    });

    // Save parsed_json directly to the script if scriptId is provided
    if (scriptId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Build parsed_json structure for ScriptSummaryPanel
        const parsedJson = {
          title: breakdownData.synopsis?.faithful_summary?.slice(0, 50) || 'Guion Analizado',
          synopsis: breakdownData.synopsis?.faithful_summary || '',
          episodes: breakdownData.episodes || [{
            episode_number: 1,
            title: 'Episodio 1',
            synopsis: breakdownData.synopsis?.faithful_summary || '',
            scenes: breakdownData.scenes,
            duration_min: breakdownData.summary?.estimated_runtime_min || 10,
          }],
          characters: breakdownData.characters || [],
          locations: breakdownData.locations || [],
          scenes: breakdownData.scenes || [],
          props: breakdownData.props || [],
          subplots: breakdownData.subplots || [],
          plot_twists: breakdownData.plot_twists || [],
          teasers: breakdownData.teasers,
          counts: {
            total_scenes: breakdownData.scenes?.length || 0,
            total_dialogue_lines: 0,
          },
        };

        const { error: updateError } = await supabase
          .from('scripts')
          .update({ 
            parsed_json: parsedJson,
            status: 'analyzed'
          })
          .eq('id', scriptId);

        if (updateError) {
          console.error('Error saving parsed_json to script:', updateError);
        } else {
          console.log('Successfully saved parsed_json to script:', scriptId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        breakdown: breakdownData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-breakdown:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
