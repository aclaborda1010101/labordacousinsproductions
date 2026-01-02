import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EntityBuilderRequest {
  entityType: 'character' | 'location' | 'prop' | 'wardrobe';
  name: string;
  description?: string;
  context?: {
    role?: string;
    characterRole?: string;
    arc?: string;
    characterId?: string;
  };
  projectStyle?: {
    genre?: string;
    tone?: string;
    realism_level?: string;
  };
  uploadedImages?: string[];
  language?: string;
}

// ============================================
// VISUAL DNA SYSTEM PROMPT - Phase 1 Complete
// ============================================
const VISUAL_DNA_SYSTEM_PROMPT = `Eres BIBLE_BUILDER especializado en Visual DNA.

Tu misión es generar un perfil "locked bible" COMPLETO con 80+ campos técnicos para producción de imágenes consistentes.

GENERA UN JSON COMPLETO CON ESTA ESTRUCTURA EXACTA:

{
  "visual_dna": {
    "physical_identity": {
      "age_exact_for_prompt": <number 18-90>,
      "gender_presentation": "masculine" | "feminine" | "androgynous" | "nonbinary",
      "ethnicity": {
        "primary": "caucasian_northern_european" | "caucasian_southern_european" | "caucasian_eastern_european" | "african_west" | "african_east" | "african_southern" | "african_american" | "afro_caribbean" | "east_asian_chinese" | "east_asian_japanese" | "east_asian_korean" | "southeast_asian" | "south_asian_indian" | "south_asian_pakistani" | "middle_eastern_arab" | "middle_eastern_persian" | "latino_hispanic_mestizo" | "latino_hispanic_white" | "latino_hispanic_afro" | "native_american" | "pacific_islander" | "mixed_multiethnic",
        "skin_tone_description": "<descripción detallada: olive with warm undertones, etc.>",
        "skin_tone_hex_approx": "#XXXXXX"
      },
      "height": {
        "cm": <number 150-200>,
        "build_reference": "short" | "average" | "tall" | "very_tall"
      },
      "body_type": {
        "somatotype": "ectomorph_lean_thin" | "mesomorph_athletic_muscular" | "endomorph_stocky_rounded" | "average_balanced",
        "posture": "military_rigid" | "relaxed_natural" | "slouched_tired" | "dancer_graceful",
        "musculature": "undefined_soft" | "toned_visible" | "moderate_fit" | "athletic_defined" | "bodybuilder_extreme",
        "body_fat": "very_low_veins_visible" | "low_defined_abs" | "average_healthy" | "above_average_soft" | "high_round",
        "weight_appearance": "underweight_thin" | "slim_lean" | "average_proportional" | "stocky_solid" | "overweight_heavy"
      }
    },
    
    "face": {
      "shape": "oval_balanced" | "round_full" | "square_angular" | "heart_pointed_chin" | "diamond_narrow_forehead" | "oblong_long" | "triangle_wide_jaw",
      
      "eyes": {
        "color_base": "brown_very_dark_almost_black" | "brown_dark_chocolate" | "brown_medium_chestnut" | "brown_light_amber" | "hazel_brown_green_mix" | "hazel_brown_gold_mix" | "green_deep_forest" | "green_bright_emerald" | "green_light_seafoam" | "blue_dark_navy" | "blue_medium_sky" | "blue_light_ice" | "blue_grey_steel" | "grey_dark_charcoal" | "grey_light_silver" | "grey_green_sage" | "black_very_dark",
        "color_hex_approx": "#XXXXXX",
        "color_description": "<detailed: warm hazel with gold flecks around pupil, darker brown ring at edge>",
        "shape": "almond_balanced" | "round_large" | "hooded_heavy_lid" | "monolid_asian" | "downturned_droopy" | "upturned_cat" | "close_set" | "wide_set" | "deep_set_shadowed" | "protruding_prominent",
        "size": "small_narrow" | "medium_average" | "large_wide",
        "distance": "close_set" | "average_balanced" | "wide_set",
        "eyebrows": {
          "thickness": "thin_sparse" | "medium_natural" | "thick_full" | "very_thick_bushy",
          "shape": "straight_horizontal" | "soft_arch_natural" | "high_arch_dramatic" | "angled_sharp" | "s_shaped_wavy" | "rounded_arch",
          "color": "<color description with hex if different from hair>",
          "grooming": "natural_ungroomed" | "trimmed_neat" | "shaped_groomed" | "microbladed_perfect"
        }
      },
      
      "nose": {
        "bridge": {
          "height": "low_flat" | "medium_moderate" | "high_prominent",
          "width": "narrow_thin" | "medium_average" | "wide_broad",
          "shape": "straight_classic" | "convex_roman_aquiline" | "concave_scooped" | "wavy_bumped"
        },
        "tip": {
          "shape": "rounded_bulbous" | "button_small_round" | "pointed_sharp" | "upturned_ski_slope" | "downturned_hooked",
          "width": "narrow_pinched" | "medium_proportional" | "wide_flared"
        },
        "nostrils": {
          "shape": "narrow_thin" | "round_visible" | "flared_wide",
          "visibility": "hidden_from_front" | "slightly_visible" | "prominently_visible"
        }
      },
      
      "mouth": {
        "lips": {
          "fullness_upper": "thin_narrow" | "medium_balanced" | "full_plump" | "very_full_pouty",
          "fullness_lower": "thin_narrow" | "medium_balanced" | "full_plump" | "very_full_pouty",
          "shape": {
            "cupids_bow": "undefined_straight" | "soft_subtle" | "defined_prominent" | "very_defined_dramatic",
            "corners": "downturned_sad_resting" | "straight_neutral" | "upturned_smile_resting"
          },
          "color_natural": "<natural lip color description>"
        },
        "teeth": {
          "visible_when_smiling": true,
          "condition": "perfect_straight_white" | "natural_slight_imperfections" | "crooked_natural" | "gap_diastema" | "missing_broken"
        }
      },
      
      "jaw_chin": {
        "jawline": {
          "shape": "soft_rounded_feminine" | "moderate_slight_angle" | "angular_defined" | "very_angular_square_masculine",
          "definition": "undefined_soft_fat_covering" | "moderate_visible_bone_structure" | "sharp_very_defined"
        },
        "chin": {
          "projection": "recessed_weak" | "average_aligned_with_lips" | "projected_strong",
          "shape": "rounded_soft" | "square_flat" | "pointed_sharp" | "cleft_dimpled"
        }
      },
      
      "cheekbones": {
        "prominence": "flat_undefined" | "moderate_visible" | "high_prominent" | "very_high_striking",
        "position": "low_wide" | "mid_balanced" | "high_narrow"
      },
      
      "facial_hair": {
        "type": "clean_shaven_smooth" | "shadow_1_day_growth" | "short_stubble_1_3mm" | "medium_stubble_4_6mm" | "heavy_stubble_7_10mm" | "short_beard_1_2cm" | "medium_beard_2_5cm" | "full_beard_long_5cm_plus" | "goatee_chin_only" | "mustache_only" | "soul_patch" | "mutton_chops" | "van_dyke_mustache_goatee",
        "length_mm": <number 0-100>,
        "density": "sparse_patchy" | "moderate_some_patches" | "thick_full_coverage",
        "color": {
          "base": "<color description>",
          "hex_approx": "#XXXXXX",
          "grey_percentage": <number 0-100>
        },
        "grooming": "natural_untrimmed" | "trimmed_neat" | "shaped_styled" | "sculpted_precise"
      },
      
      "distinctive_marks": {
        "scars": [
          {
            "location": "<specific location: left eyebrow, right cheek near ear, etc.>",
            "description": "<detailed: thin 2cm scar from childhood accident>",
            "size_cm": <number>,
            "color": "white_healed_old" | "pink_recent" | "red_fresh" | "dark_keloid",
            "visibility": "always_prominent" | "moderate_visible_closeup" | "faint_only_extreme_closeup"
          }
        ],
        "moles_birthmarks": [
          {
            "location": "<specific location>",
            "type": "flat_mole" | "raised_mole" | "birthmark" | "beauty_mark",
            "size_mm": <number>,
            "color": "brown_dark" | "brown_light" | "black" | "red_pink"
          }
        ],
        "wrinkles_lines": {
          "forehead": {
            "horizontal_lines": "none" | "faint_when_animated" | "moderate_visible_at_rest" | "deep_prominent"
          },
          "eyes": {
            "crows_feet": "none" | "faint_when_smiling" | "moderate_visible_at_rest" | "deep_prominent"
          },
          "nose_to_mouth": {
            "nasolabial_folds": "none_smooth" | "slight_when_smiling" | "moderate_visible_at_rest" | "deep_prominent"
          },
          "mouth": {
            "marionette_lines": "none" | "faint" | "moderate" | "deep"
          }
        }
      }
    },
    
    "hair": {
      "head_hair": {
        "length": {
          "type": "bald_shaved_completely" | "shaved_buzzcut_0_3mm" | "very_short_3_10mm" | "short_1_3cm" | "short_medium_3_8cm" | "medium_8_15cm" | "long_15_30cm" | "very_long_30cm_plus",
          "measurement_cm": <number>
        },
        "texture": {
          "type": "straight_type_1" | "wavy_loose_type_2a" | "wavy_defined_type_2b" | "wavy_coarse_type_2c" | "curly_loose_type_3a" | "curly_springy_type_3b" | "curly_tight_type_3c" | "coily_soft_type_4a" | "coily_springy_type_4b" | "coily_tight_type_4c",
          "pattern_description": "<detailed texture description>"
        },
        "thickness": {
          "strand": "fine_thin" | "medium_normal" | "coarse_thick",
          "density": "thin_sparse_scalp_visible" | "medium_average" | "thick_dense_voluminous"
        },
        "color": {
          "natural_base": "<color: dark brown, jet black, auburn, etc.>",
          "hex_approx_base": "#XXXXXX",
          "highlights_lowlights": "<if any: caramel highlights through mid-lengths>",
          "grey_white": {
            "percentage": <number 0-100>,
            "pattern": "none" | "temples_only" | "temples_spreading" | "scattered_salt_pepper" | "mostly_grey" | "fully_white"
          }
        },
        "hairline": {
          "front": "straight_juvenile" | "widows_peak_v_shaped" | "rounded_curved" | "m_shaped_receding" | "very_receding_high" | "bald_front",
          "temples": "full_no_recession" | "slight_recession" | "moderate_recession" | "severe_recession"
        },
        "style": {
          "overall_shape": "<detailed: side-parted, swept back, messy textured, slicked, natural fall, etc.>",
          "fringe_bangs": "none_forehead_exposed" | "side_swept" | "straight_across" | "curtain_bangs_center_parted",
          "layers": "one_length" | "subtle_layers" | "heavily_layered" | "razored_textured",
          "grooming_level": "unkempt_messy" | "casually_styled" | "neatly_groomed" | "perfectly_styled"
        }
      }
    },
    
    "skin": {
      "texture": {
        "overall": "smooth_poreless_perfect" | "smooth_natural_visible_pores" | "textured_pores_prominent" | "rough_weathered"
      },
      "condition": {
        "clarity": "perfectly_clear" | "occasional_blemish" | "mild_acne_scarring" | "visible_acne" | "heavily_scarred",
        "hydration": "dewy_moisturized" | "normal_balanced" | "matte_dry" | "oily_shiny",
        "hyperpigmentation": {
          "freckles": "none" | "light_sparse" | "moderate_scattered" | "heavy_dense",
          "sunspots": "none" | "few" | "moderate" | "many",
          "melasma": "none" | "light" | "moderate"
        }
      },
      "undertone": {
        "type": "cool_pink_red" | "neutral_balanced" | "warm_yellow_peach" | "olive_green_yellow"
      }
    },
    
    "hands": {
      "size": {
        "overall": "small_delicate" | "medium_average" | "large_robust"
      },
      "fingers": {
        "length": "short_stubby" | "average_proportional" | "long_elegant",
        "width": "thin_slender" | "average" | "thick_broad"
      },
      "nails": {
        "length": "very_short_bitten" | "short_trimmed" | "medium_natural" | "long",
        "condition": "well_manicured" | "natural_clean" | "rough_work_hands"
      },
      "distinctive_features": "<any rings, scars, calluses, tattoos on hands>"
    },
    
    "visual_references": {
      "celebrity_likeness": {
        "primary": {
          "name": "<celebrity name - REQUIRED>",
          "percentage": <number 50-100>,
          "features_borrowed": ["face_structure", "eyes", "nose", "etc."]
        },
        "secondary": {
          "name": "<celebrity name - optional>",
          "percentage": <number 0-50>,
          "features_borrowed": ["specific features"]
        },
        "tertiary": {
          "name": "<celebrity name - optional>",
          "percentage": <number 0-30>,
          "features_borrowed": ["specific features"]
        },
        "combination_description": "<how they combine: Oscar Isaac's face structure with Javier Bardem's intensity>"
      },
      "art_style": {
        "primary": "cinematic_realistic" | "hyperrealistic" | "stylized_realistic",
        "description": "Photorealistic cinematic quality"
      }
    }
  },
  
  "continuity_lock": {
    "never_change": [
      "physical_identity.age_exact_for_prompt",
      "physical_identity.ethnicity.skin_tone_hex_approx",
      "face.eyes.color_base",
      "face.eyes.color_hex_approx",
      "face.shape",
      "face.nose.bridge.shape",
      "physical_identity.height.cm",
      "hair.head_hair.color.natural_base"
    ],
    "must_avoid": [
      "different_eye_color",
      "different_hair_color",
      "different_skin_tone",
      "clean_shaven_if_has_beard",
      "beard_if_clean_shaven",
      "different_face_shape"
    ],
    "allowed_variants": [
      "expression_changes",
      "outfit_changes",
      "lighting_variations",
      "slight_hair_style_variations"
    ],
    "version_notes": "Initial Visual DNA v1.0"
  },
  
  "narrative": {
    "biography": {
      "age": <number matching age_exact_for_prompt>,
      "occupation": "<occupation>",
      "background": "<background story 2-3 sentences>",
      "personality_traits": ["trait1", "trait2", "trait3"]
    },
    "character_arc": {
      "starting_point": "<emotional/situational starting point>",
      "journey": "<what happens during story>",
      "transformation": "<how they change>"
    }
  }
}

REGLAS CRÍTICAS:
1. TODOS los campos son OBLIGATORIOS con valores específicos
2. USA SOLO LOS ENUMS DEFINIDOS - no inventes valores
3. Celebrity likeness primary es OBLIGATORIO
4. TODOS los hex colors deben estar presentes (#XXXXXX)
5. Sé MUY específico en descripciones: no "ojos marrones", sino "brown_medium_chestnut (#6B5B3D) with warm amber flecks around pupil and darker brown ring at iris edge"
6. age_exact_for_prompt DEBE coincidir con narrative.biography.age
7. grey_percentage en pelo/barba debe ser consistente con la edad
8. distinctive_marks: incluye al menos 1-2 marcas para realismo
9. wrinkles: ajusta según edad (45+ debe tener algunas líneas)
10. La respuesta DEBE ser JSON válido y parseable`;

// Legacy system prompt for non-character entities
const LEGACY_SYSTEM_PROMPT = `Eres BIBLE_BUILDER: el departamento de producción de un estudio de Hollywood.

Para LOCATION: Location Scout + Production Design + DOP + Gaffer
Para PROP: Props Master + Continuity + Safety/Legal
Para WARDROBE: Wardrobe Department + Continuity

TU MISIÓN: Generar un perfil "locked bible" completo, consistente y reproducible para generación de imágenes.

FORMATO DE SALIDA OBLIGATORIO (JSON):
{
  "profile": {
    // Campos específicos según entity_type
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
  }
}

LOCATION PROFILE:
{
  "name": "",
  "location_type": "Office_Modern|Apartment_Modern|Street_Urban|Warehouse|Restaurant|Hotel_Lobby",
  "arch_style": "Minimal_Modern|Corporate_Glass|Industrial_Loft|Brutalist|Classic_European",
  "time_of_day": "Morning|Afternoon|GoldenHour|Night",
  "weather": "Clear|Overcast|Rain|Windy",
  "layout_map_text": "descripción espacial",
  "materials": ["5-10 materiales presentes"],
  "color_palette": "paleta de colores",
  "set_dressing_fixed": ["8-20 items fijos de decoración"],
  "lighting_logic": {
    "motivation": "Window_Daylight|Practical_Lamps|Fluorescent_Office|Neon_Signage",
    "key_source": "de dónde viene la luz principal",
    "fill_behavior": "cómo se comporta el relleno",
    "practicals": ["fuentes prácticas de luz"],
    "shadow_behavior": "comportamiento de sombras"
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
  "continuity_notes": "notas de continuidad"
}

REGLAS:
1. Sé ESPECÍFICO: nada vago, todo medible/verificable
2. set_dressing_fixed >= 8 para localizaciones
3. negative_prompt >= 8 items incluyendo: no text, no watermark
4. never_change >= 3 items en continuity_lock`;

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

    // Use Visual DNA prompt for characters, legacy for others
    const systemPrompt = entityType === 'character' ? VISUAL_DNA_SYSTEM_PROMPT : LEGACY_SYSTEM_PROMPT;

    const userPrompt = entityType === 'character' 
      ? `GENERAR VISUAL DNA COMPLETO PARA PERSONAJE:

NOMBRE: ${name}
DESCRIPCIÓN NARRATIVA: ${description || 'Genera una descripción apropiada basada en el nombre y contexto'}
${context?.role ? `ROL EN HISTORIA: ${context.role}` : ''}
${context?.characterRole ? `TIPO DE PERSONAJE: ${context.characterRole}` : ''}
${context?.arc ? `ARCO DE PERSONAJE: ${context.arc}` : ''}

${projectStyle ? `ESTILO DEL PROYECTO:
- Género: ${projectStyle.genre || 'Drama'}
- Tono: ${projectStyle.tone || 'Cinematográfico realista'}
- Nivel de realismo: ${projectStyle.realism_level || 'Photorealistic'}
` : ''}

${uploadedImages?.length ? `IMÁGENES DE REFERENCIA: ${uploadedImages.length} imágenes disponibles. Analiza y extrae atributos físicos de ellas.` : ''}

IDIOMA DE RESPUESTA: ${language || 'es'}

Genera el Visual DNA COMPLETO con TODOS los campos especificados. 
El celebrity_likeness.primary es OBLIGATORIO.
Todos los hex colors deben estar presentes.
La edad debe ser un número específico, no un rango.`
      : `SOLICITUD DE PERFIL DE ENTIDAD:

TIPO: ${entityType}
NOMBRE: ${name}
DESCRIPCIÓN: ${description || 'No proporcionada - genera una descripción profesional apropiada'}
CONTEXTO DE USO: ${JSON.stringify(context || {})}

${projectStyle ? `STYLE BIBLE DEL PROYECTO:
- Género: ${projectStyle.genre || 'Drama'}
- Tono: ${projectStyle.tone || 'Cinematográfico realista'}
` : ''}

IDIOMA DE RESPUESTA: ${language || 'es'}

Genera un perfil COMPLETO siguiendo el formato JSON especificado.`;

    console.log('Building entity:', entityType, name);
    console.log('Using Visual DNA prompt:', entityType === 'character');

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
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
      console.error('Raw content:', content.substring(0, 500));
      entityData = {
        profile: { name },
        continuity_lock: { never_change: [], must_avoid: [], allowed_variants: [] },
        raw_response: content
      };
    }

    console.log('Entity built successfully:', name);

    // For characters, save Visual DNA to database if characterId provided
    if (entityType === 'character' && context?.characterId && entityData.visual_dna) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      console.log('Saving Visual DNA to database for character:', context.characterId);

      // Deactivate any existing active Visual DNA
      await supabase
        .from('character_visual_dna')
        .update({ is_active: false })
        .eq('character_id', context.characterId)
        .eq('is_active', true);

      // Insert new Visual DNA
      const { data: visualDNARecord, error: vdnaError } = await supabase
        .from('character_visual_dna')
        .insert({
          character_id: context.characterId,
          version: 1,
          version_name: 'AI Generated',
          is_active: true,
          visual_dna: entityData.visual_dna,
          continuity_lock: entityData.continuity_lock || {
            never_change: [],
            must_avoid: [],
            allowed_variants: []
          },
          approved: false
        })
        .select()
        .single();

      if (vdnaError) {
        console.error('Error saving Visual DNA:', vdnaError);
      } else {
        console.log('Visual DNA saved with ID:', visualDNARecord.id);

        // Update character with active_visual_dna_id
        await supabase
          .from('characters')
          .update({ 
            active_visual_dna_id: visualDNARecord.id,
            bio: entityData.narrative?.biography?.background || undefined
          })
          .eq('id', context.characterId);

        // Save narrative if present
        if (entityData.narrative) {
          await supabase
            .from('character_narrative')
            .upsert({
              character_id: context.characterId,
              biography: entityData.narrative.biography || {},
              character_arc: entityData.narrative.character_arc || {},
              relationships: [],
              voice_performance: {}
            }, {
              onConflict: 'character_id'
            });
        }
      }
    }

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
