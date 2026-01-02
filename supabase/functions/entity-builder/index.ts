import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EntityBuilderRequest {
  entityType: 'character' | 'location' | 'prop' | 'wardrobe';
  name: string;
  description?: string;
  context?: string;
  projectStyle?: {
    genre?: string;
    tone?: string;
    realism_level?: string;
  };
  uploadedImages?: string[];
  language?: string;
}

const SYSTEM_PROMPT = `Eres BIBLE_BUILDER: el departamento de producción de un estudio de Hollywood.

Para CHARACTER: Casting + Wardrobe + H/MU + Script Supervisor
Para LOCATION: Location Scout + Production Design + DOP + Gaffer
Para PROP: Props Master + Continuity + Safety/Legal
Para WARDROBE: Wardrobe Department + Continuity

TU MISIÓN: Generar un perfil "locked bible" completo, consistente y reproducible para generación de imágenes.

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "profile": {
    // Campos específicos según entity_type (ver abajo)
  },
  "continuity_lock": {
    "never_change": ["array de atributos que NUNCA deben cambiar"],
    "must_avoid": ["array de cosas a evitar siempre"],
    "allowed_variants": ["variaciones permitidas"],
    "scene_invariants": ["invariantes por escena si aplica"]
  },
  "generation_plan": {
    "required_slots": ["array de slots de referencia requeridos"],
    "slot_prompts": [
      {
        "slot": "nombre del slot",
        "prompt": "prompt para generar esta imagen",
        "negative_prompt": ["array de negativos, mínimo 8"],
        "acceptance_criteria": ["criterios para aprobar la imagen"]
      }
    ]
  },
  "risk_controls": {
    "ai_risks": ["Identity_Drift", "Hand_Deform", etc.],
    "mitigations": ["acciones para mitigar riesgos"]
  },
  "assumptions": ["asunciones hechas por falta de información"],
  "qc_checklist": {
    "passes": true,
    "issues": []
  }
}

PERFILES POR TIPO:

CHARACTER PROFILE:
{
  "name": "",
  "gender_presentation": "Masculine|Feminine|Androgynous",
  "age_range": "18-24|25-34|35-44|45-54|55-65",
  "body_type": "Slim|Average|Athletic|Stocky",
  "height_range_cm": "150-160|161-170|171-180|181-190|191-200",
  "skin_tone": "Very_Fair|Fair|Light|Medium|Olive|Tan|Dark|Deep",
  "eye_color": "Brown|Hazel|Green|Blue|Grey",
  "hair_length": "Buzz|Short|Medium|Long",
  "hair_style": "Neat_SidePart|Textured_Crop|Swept_Back|Curly_Natural|Wavy_Messy|Ponytail|Bun|Bald",
  "hair_color": "color preciso",
  "facial_hair": "CleanShaven|Stubble|ShortBeard|FullBeard",
  "distinctive_features": ["5-10 rasgos distintivos específicos"],
  "wardrobe": {
    "formality": "Casual|SmartCasual|Business|Formal",
    "palette": "paleta de colores",
    "principal_outfit": {
      "top": {"item":"","material":"","color":"","fit":""},
      "bottom": {"item":"","material":"","color":"","fit":""},
      "shoes": {"type":"","color":"","condition":""},
      "accessories": [{"type":"","details":""}]
    }
  },
  "performance_baseline": "Calm_Controlled|Focused_Thinking|Subtle_Anxiety|Friendly_Open|Cold_Distant",
  "voice_style": "Warm_Low|Neutral_Professional|Fast_Nervous|Calm_Authoritative",
  "movement_style": "Minimal_Efficient|Expressive_Hands|Restless_MicroMoves|Slow_Deliberate"
}

LOCATION PROFILE:
{
  "name": "",
  "location_type": "Office_Modern|Apartment_Modern|Street_Urban|Warehouse|Restaurant|Hotel_Lobby",
  "arch_style": "Minimal_Modern|Corporate_Glass|Industrial_Loft|Brutalist|Classic_European",
  "time_of_day": "Morning|Afternoon|GoldenHour|Night",
  "weather": "Clear|Overcast|Rain|Windy",
  "layout_map_text": "descripción espacial: puertas/ventanas/muebles",
  "materials": ["5-10 materiales presentes"],
  "color_palette": "paleta de colores",
  "set_dressing_fixed": ["8-20 items fijos de decoración"],
  "lighting_logic": {
    "motivation": "Window_Daylight|Practical_Lamps|Fluorescent_Office|Neon_Signage",
    "key_source": "de dónde viene la luz principal",
    "fill_behavior": "cómo se comporta el relleno",
    "practicals": ["fuentes prácticas de luz"],
    "shadow_behavior": "comportamiento de sombras"
  },
  "ambient_sound": {
    "room_tone": "tono de sala",
    "ambience_layers": ["3-8 capas de ambiente"],
    "forbidden_noises": ["ruidos prohibidos"]
  }
}

PROP PROFILE:
{
  "name": "",
  "prop_type": "Phone|Laptop|Watch|Car|Keycard|Folder_Document|CoffeeCup|DeskItem|Bag",
  "materials": ["materiales del prop"],
  "condition": "BrandNew|LightlyUsed|Worn|Weathered",
  "color_finish": "Black_Matte|Silver_Brushed|Grey_Matte|Brown_Leather",
  "dimensions_approx": "small/medium/large + escala relativa",
  "design_language": "detalles de forma, bordes, marcas de uso",
  "interaction_rules": "cómo evitar errores de manos/deformación",
  "placement_rules": "dónde se coloca, orientación, reglas de consistencia"
}

WARDROBE PROFILE:
{
  "name": "",
  "character_name": "",
  "outfit_type": "Casual|Formal|Action|Sleepwear|Uniform",
  "top": {"item":"","material":"","color":"","fit":"","details":""},
  "bottom": {"item":"","material":"","color":"","fit":"","details":""},
  "shoes": {"type":"","color":"","condition":"","details":""},
  "accessories": [{"type":"","details":""}],
  "condition": "Clean|Dirty|Torn|Wet|Bloody",
  "continuity_notes": "notas de continuidad",
  "layering": "capas si aplica"
}

REGLAS:
1. Sé ESPECÍFICO: nada vago, todo medible/verificable
2. Incluye distinctive_features >= 5 para personajes
3. Incluye set_dressing_fixed >= 8 para localizaciones
4. negative_prompt >= 8 items incluyendo: no text, no watermark, avoid jitter, avoid morphing
5. never_change >= 3 items en continuity_lock
6. NO incluyas texto visible, logos o watermarks en ningún prompt

IDIOMA: Responde en el idioma indicado.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: EntityBuilderRequest = await req.json();
    const { entityType, name, description, context, projectStyle, uploadedImages, language } = request;

    if (!entityType || !name) {
      return new Response(
        JSON.stringify({ error: 'Se requiere entityType y name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
SOLICITUD DE PERFIL DE ENTIDAD:

TIPO: ${entityType}
NOMBRE: ${name}
DESCRIPCIÓN: ${description || 'No proporcionada - genera una descripción profesional apropiada'}
CONTEXTO DE USO: ${context || 'Producción cinematográfica profesional'}

${projectStyle ? `STYLE BIBLE DEL PROYECTO:
- Género: ${projectStyle.genre || 'Drama'}
- Tono: ${projectStyle.tone || 'Cinematográfico realista'}
- Nivel de realismo: ${projectStyle.realism_level || 'Cinematic_Real'}
` : ''}

${uploadedImages?.length ? `IMÁGENES DE REFERENCIA SUBIDAS: ${uploadedImages.length} imágenes disponibles. Analiza y extrae atributos de ellas.` : ''}

IDIOMA DE RESPUESTA: ${language || 'es-ES'}

Genera un perfil COMPLETO y PROFESIONAL siguiendo el formato JSON especificado para este tipo de entidad.
Incluye todos los campos requeridos con valores específicos y medibles.
Genera prompts de imagen detallados para cada slot de referencia requerido.`;

    console.log('Building entity:', entityType, name);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
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
    let entityData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        entityData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      entityData = {
        profile: { name },
        continuity_lock: { never_change: [], must_avoid: [], allowed_variants: [] },
        generation_plan: { required_slots: [], slot_prompts: [] },
        risk_controls: { ai_risks: [], mitigations: [] },
        raw_response: content
      };
    }

    console.log('Entity built successfully:', name);

    return new Response(
      JSON.stringify({
        success: true,
        entity: entityData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in entity-builder:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
