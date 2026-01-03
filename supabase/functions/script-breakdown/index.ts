import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptBreakdownRequest {
  scriptText: string;
  projectId: string;
  language?: string;
}

const SYSTEM_PROMPT = `Eres BLOCKBUSTER_FORGE_BREAKDOWN: un analizador narrativo de alto nivel (story bible + guion), NO un extractor superficial de sinopsis.

TU MISIÓN: Analizar guiones y biblias narrativas para extraer TODAS las entidades de producción con profundidad estructural, reconociendo la complejidad de narrativas épicas, filosóficas, de ciencia ficción, o con escalas temporales amplias.

═══════════════════════════════════════════════════════════════════
REGLAS CRÍTICAS DE ANÁLISIS NARRATIVO:
═══════════════════════════════════════════════════════════════════

1. NO REDUCCIONISMO NARRATIVO:
   - NO reduzcas historias complejas a thrillers de conspiraciones
   - NO inventes "fuerzas ocultas", "juegos peligrosos" ni clichés genéricos que no estén explícitos
   - RESPETA el tono original: si es épico-filosófico, mantenlo así

2. PERSONAJES - DEFINICIÓN AMPLIADA:
   Reconoce como PERSONAJES no solo individuos humanos, sino también:
   - Entidades civilizatorias con agencia narrativa (ej: "La Civilización Atlante")
   - Figuras no humanas con consciencia y decisiones (ej: "Aelion", IAs, entidades cósmicas)
   - Colectivos que toman decisiones históricas (ej: "Los Atlantes Subterráneos", "La Humanidad")
   - Linajes que evolucionan y cargan consecuencias generacionales
   - Entidades abstractas con rol narrativo (ej: "El Consejo Estelar", "La Federación")

3. CLASIFICACIÓN DE PERSONAJES:
   - protagonist: Individuos O entidades que sostienen el arco central
   - antagonist: Fuerzas opositoras (pueden ser individuos, grupos, o fuerzas abstractas)
   - supporting: Individuos o grupos con función narrativa relevante
   - recurring: Aparecen en múltiples episodios/capítulos con rol menor
   - episodic: Aparecen en un solo episodio/capítulo
   - extra_with_line: Intervenciones puntuales, consejos, testigos (tienen diálogo pero rol mínimo)
   - collective_entity: Civilizaciones, razas, grupos con agencia colectiva
   - cosmic_entity: Entidades de escala planetaria/cósmica/dimensional

4. LOCALIZACIONES - DEFINICIÓN AMPLIADA:
   Reconoce tanto lugares físicos contemporáneos como:
   - Localizaciones históricas (ciudades antiguas, imperios caídos)
   - Continentes desaparecidos o míticos (Atlántida, Lemuria, etc.)
   - Capitales de civilizaciones (actuales o extintas)
   - Localizaciones planetarias (lunas, planetas, sistemas estelares)
   - Bases subterráneas, orbitales, o dimensionales
   - Espacios abstractos narrativamente relevantes (planos astrales, dimensiones)
   
   NO requieras formato INT./EXT. para localizaciones cósmicas/históricas.
   Genera sluglines apropiados: "EXT. ATLÁNTIDA - TEMPLO CENTRAL - DAWN (10.000 AC)"

5. ESCALAS TEMPORALES:
   - Reconoce narrativas que abarcan miles o millones de años
   - Marca épocas/eras en las localizaciones cuando sea relevante
   - Identifica "flashbacks civilizatorios" vs escenas contemporáneas

6. PROPS Y TECNOLOGÍAS ESPECIALES:
   Tipos adicionales para narrativas épicas/sci-fi:
   - artifact: Objetos de poder, reliquias antiguas
   - technology: Sistemas tecnológicos avanzados
   - material: Materiales especiales (cristales, aleaciones, sustancias)
   - construct: Estructuras/construcciones significativas
   - vessel: Naves, vehículos interdimensionales
   - weapon_system: Sistemas de armamento avanzado
   - consciousness_tech: Tecnología de consciencia/mente

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "scenes": [
    {
      "scene_number": number,
      "slugline": "string (INT./EXT. LOCALIZACIÓN - DÍA/NOCHE o descripción para escenas cósmicas/históricas)",
      "location_name": "string",
      "location_type": "INT | EXT | INT/EXT | COSMIC | HISTORICAL | DIMENSIONAL",
      "time_of_day": "DAY | NIGHT | DAWN | DUSK | CONTINUOUS | TIMELESS",
      "era": "string (opcional: '10.000 AC', 'Año 3042', 'Época Atlante', etc.)",
      "summary": "string (resumen de 1-2 frases)",
      "objective": "string (qué debe lograr esta escena narrativamente)",
      "mood": "string (atmósfera emocional)",
      "page_range": "string (ej: 1-3)",
      "estimated_duration_sec": number,
      "characters_present": ["array de nombres - incluye entidades colectivas si tienen agencia en la escena"],
      "props_used": ["array de props - incluye tecnologías y artefactos"],
      "wardrobe_notes": "string (cambios de vestuario si aplica)",
      "vfx_sfx_needed": ["array de efectos"],
      "sound_notes": "string (ambiente, música diegética, etc.)",
      "continuity_notes": "string (estado físico, hora del día, clima, era temporal)",
      "priority": "P0 | P1 | P2",
      "complexity": "low | medium | high | epic"
    }
  ],
  "characters": [
    {
      "name": "string",
      "entity_type": "individual | collective | civilization | cosmic | lineage | ai | hybrid",
      "role": "protagonist | antagonist | supporting | recurring | episodic | extra_with_line | collective_entity | cosmic_entity",
      "description": "string (descripción física para individuos, descripción conceptual para entidades)",
      "personality": "string (o 'colectivo' / 'abstracto' para entidades no individuales)",
      "arc": "string (arco narrativo - puede abarcar eras para civilizaciones)",
      "scale": "personal | generational | civilizational | cosmic",
      "scenes": [number array de scene_numbers],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "continuity_risk": "low | medium | high",
      "wardrobe_changes": number,
      "notes": "string"
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT | INT/EXT | PLANETARY | ORBITAL | SUBTERRANEAN | DIMENSIONAL | HISTORICAL",
      "scale": "room | building | city | continent | planetary | stellar | cosmic",
      "era": "string (opcional: época/era si es localización histórica)",
      "description": "string (descripción visual detallada)",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "time_variants": ["DAY", "NIGHT", "ERA_ANCIENT", "ERA_MODERN", etc.],
      "weather_variants": ["CLEAR", "RAIN", "COSMIC_STORM", etc.],
      "set_dressing_notes": "string",
      "lighting_notes": "string",
      "sound_profile": "string (ambiente base)",
      "continuity_risk": "low | medium | high"
    }
  ],
  "props": [
    {
      "name": "string",
      "type": "phone | laptop | weapon | document | vehicle | food | drink | furniture | artifact | technology | material | construct | vessel | weapon_system | consciousness_tech | other",
      "description": "string",
      "importance": "key | recurring | background | mythical",
      "scenes": [number array],
      "scenes_count": number,
      "priority": "P0 | P1 | P2",
      "interaction_notes": "string (cómo se usa)",
      "continuity_risk": "low | medium | high",
      "special_requirements": "string"
    }
  ],
  "wardrobe": [
    {
      "character_name": "string",
      "outfit_name": "string",
      "description": "string (detalle completo)",
      "scenes": [number array],
      "condition_changes": ["clean", "dirty", "torn", "ceremonial", "battle-worn", etc.],
      "continuity_notes": "string"
    }
  ],
  "set_pieces": [
    {
      "name": "string (ej: 'Hundimiento de Atlántida', 'Batalla Estelar de Orión')",
      "type": "action | chase | fight | stunt | dance | crowd | cataclysm | cosmic_event | ritual | transformation",
      "description": "string",
      "scenes": [number array],
      "duration_estimate_sec": number,
      "complexity": "low | medium | high | extreme | epic",
      "safety_notes": "string",
      "vfx_requirements": ["array"],
      "stunt_requirements": ["array"]
    }
  ],
  "subplots": [
    {
      "name": "string",
      "description": "string",
      "characters_involved": ["array de nombres"],
      "scenes": [number array],
      "arc_type": "redemption | betrayal | romance | discovery | evolution | decay | transcendence",
      "resolution": "string (cómo termina o queda abierta)"
    }
  ],
  "plot_twists": [
    {
      "name": "string",
      "scene": number,
      "description": "string",
      "impact": "minor | major | paradigm_shift",
      "foreshadowing_scenes": [number array]
    }
  ],
  "vfx_sfx": [
    {
      "name": "string",
      "type": "vfx | sfx | practical | cosmic",
      "category": "explosion | fire | smoke | weather | magic | destruction | blood | cosmic | dimensional | transformation | other",
      "description": "string",
      "scenes": [number array],
      "trigger_cue": "string",
      "intensity": "subtle | medium | heavy | cataclysmic",
      "integration_notes": "string"
    }
  ],
  "sound_music": [
    {
      "name": "string",
      "type": "ambience | foley | source_music | score_cue | sfx | cosmic_ambience",
      "description": "string",
      "scenes": [number array],
      "location_tied": "string (nombre de localización si aplica)",
      "mood": "string",
      "notes": "string"
    }
  ],
  "continuity_anchors": [
    {
      "name": "string (ej: 'Caída de la Atlántida', 'Despertar de Leonardo')",
      "type": "physical_state | emotional_state | time_of_day | weather | prop_state | civilizational_state | cosmic_event",
      "description": "string",
      "applies_from_scene": number,
      "applies_to_scene": number (or null if ongoing),
      "character_tied": "string (nombre si aplica - puede ser entidad colectiva)",
      "notes": "string"
    }
  ],
  "summary": {
    "total_scenes": number,
    "total_characters": number,
    "protagonists": number,
    "supporting_characters": number,
    "extras_with_lines": number,
    "collective_entities": number,
    "total_locations": number,
    "total_props": number,
    "total_set_pieces": number,
    "total_subplots": number,
    "total_plot_twists": number,
    "total_vfx_sfx": number,
    "estimated_runtime_min": number,
    "narrative_scope": "personal | generational | civilizational | cosmic",
    "temporal_span": "string (ej: 'contemporáneo', '10.000 años', 'múltiples eras')",
    "complexity_score": "low | medium | high | epic",
    "continuity_risk_areas": ["array de áreas de alto riesgo"],
    "production_notes": "string"
  }
}

REGLAS DE EXTRACCIÓN:
1. ESCENAS: Detecta por sluglines (INT./EXT.). Si no hay sluglines claros, infiere estructura narrativa.
2. PERSONAJES: Cualquier entidad (individual o colectiva) que tenga agencia, decisiones, o diálogo.
3. LOCALIZACIONES: Agrupa variantes del mismo lugar. Incluye localizaciones históricas/cósmicas sin requerir formato guion técnico.
4. PROPS: Cualquier objeto, tecnología, material o artefacto mencionado que sea narrativamente relevante.
5. VESTUARIO: Detecta cambios de ropa, estados, estilos de época.
6. SET PIECES: Secuencias complejas - desde persecuciones hasta cataclismos civilizatorios.
7. SUBPLOTS: Tramas secundarias que corren paralelas al arco principal.
8. PLOT TWISTS: Giros narrativos mayores que cambian la dirección de la historia.
9. VFX/SFX: Cualquier efecto, desde prácticos hasta cósmicos.
10. SONIDO: Ambientes de todas las escalas, desde habitaciones hasta planetas.
11. CONTINUIDAD: Detecta estados que deben mantenerse - incluye eventos civilizatorios.

PRIORIDADES:
- P0: Imprescindible para la historia (protagonistas, localizaciones principales, artefactos clave)
- P1: Importante (personajes secundarios, localizaciones recurrentes, props clave)
- P2: Complementario (extras, localizaciones de una escena, props de fondo)

TONO DEL ANÁLISIS: Serio, estructural, propio de una biblia de serie o dossier de producción profesional.

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, language } = request;

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
