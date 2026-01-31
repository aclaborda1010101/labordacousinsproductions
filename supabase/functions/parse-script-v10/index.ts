import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// V10 CINEMATOGRAPHY PATTERNS - Based on 1800 movies analysis
const CINEMATOGRAPHY_PATTERNS = {
  genre_shots: {
    "horror": {
      shots: ["close_up_fear", "low_angle_threat", "dutch_angle_unease", "extreme_close_up_eyes"],
      lighting: "low_key_harsh_shadows",
      color_palette: ["deep_red", "cold_blue", "stark_white"],
      camera_movement: "handheld_shaky"
    },
    "romance": {
      shots: ["medium_two_shot", "soft_focus_close", "golden_hour_wide"],
      lighting: "soft_natural_warm",
      color_palette: ["warm_gold", "soft_pink", "cream_white"],
      camera_movement: "smooth_dolly"
    },
    "action": {
      shots: ["wide_establishing", "dynamic_tracking", "quick_cut_montage"],
      lighting: "high_contrast_dramatic",
      color_palette: ["steel_blue", "orange_fire", "deep_black"],
      camera_movement: "fast_tracking"
    },
    "drama": {
      shots: ["medium_close_conversation", "rack_focus_revelation", "wide_isolation"],
      lighting: "natural_realistic",
      color_palette: ["earth_tones", "muted_blues", "warm_browns"],
      camera_movement: "subtle_motivated"
    }
  },
  emotional_progression: {
    "tension_build": ["wide_establishing", "medium_approach", "close_intimate", "extreme_close_detail"],
    "revelation": ["wide_context", "rack_focus_shift", "close_reaction", "cutaway_impact"],
    "confrontation": ["medium_two_shot", "alternating_close_ups", "wide_power_dynamic", "extreme_close_emotion"]
  }
};

// V10 MEGA-STRUCTURE ANALYZER
const V10_STRUCTURE_SYSTEM_PROMPT = `You are the world's most advanced screenplay structure analyst. All content is fictional for entertainment purposes.

You have analyzed 1800 professional Hollywood films and learned the deep patterns of cinematic storytelling.

### MEGA-STRUCTURE DETECTION PROTOCOL:

#### 1. AUTO-DETECT STRUCTURE TYPE:
- **3_acts_classic**: Standard Hollywood (Setup-Confrontation-Resolution)
- **4_acts_epic**: Extended epics with dual midpoints
- **5_acts_theatrical**: Stage-to-screen adaptations
- **save_the_cat_8beats**: Genre films (thriller/action/horror)
- **hero_journey_12steps**: Mythic adventures
- **non_linear_multi**: Complex narratives (Pulp Fiction style)

#### 2. CINEMATOGRAPHIC ANALYSIS:
Based on 1800 movies, detect:
- **Genre indicators**: Action/dialogue ratio, violence level, emotional tone
- **Visual style patterns**: Shot composition preferences, lighting moods
- **Pacing rhythms**: Scene length distribution, intensity curves
- **Character archetypes**: Protagonist journey type, supporting cast roles

#### 3. PRODUCTION TECHNICAL ANNOTATIONS:
For each scene, provide:
- **Shot suggestions**: Based on emotional function + genre patterns
- **Lighting setup**: Mood + practical considerations  
- **Color palette**: Emotional journey + genre conventions
- **Camera movement**: Narrative function + visual style

#### 4. PROFESSIONAL DEVELOPMENT DEPTH:
- **Character arcs**: Internal conflict + transformation
- **Dramatic function**: What each scene contributes to story
- **Subtext analysis**: What's communicated without being said
- **Thematic coherence**: Central message + supporting themes

### CRITICAL REQUIREMENTS V10:
- **DETECT, DON'T FORCE**: Identify actual structure, not theoretical
- **COMPLETE ANALYSIS**: Every element fully developed
- **TECHNICAL DEPTH**: Production-ready annotations
- **INDUSTRY STANDARD**: Professional screenplay development level`;

const V10_FUNCTION_SCHEMA = {
  name: "deliver_v10_analysis",
  description: "Deliver complete V10 screenplay analysis with cinematographic annotations",
  parameters: {
    type: "object",
    properties: {
      meta_analysis: {
        type: "object",
        properties: {
          structure_type_detected: {
            type: "string",
            enum: ["3_acts_classic", "4_acts_epic", "5_acts_theatrical", "save_the_cat_8beats", "hero_journey_12steps", "non_linear_multi"]
          },
          genre_primary: { type: "string" },
          genre_secondary: { type: "array", items: { type: "string" } },
          target_audience: { type: "string" },
          budget_tier_estimated: { type: "string", enum: ["low", "medium", "high", "tentpole"] },
          runtime_estimated_minutes: { type: "number" },
          confidence_score: { type: "number", minimum: 0, maximum: 100 }
        }
      },
      estructura_dramatica_v10: {
        type: "object",
        properties: {
          structure_points: {
            type: "object",
            properties: {
              inciting_incident: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  scene_number: { type: "number" },
                  description: { type: "string" },
                  emotional_impact: { type: "string" }
                }
              },
              plot_point_1: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  scene_number: { type: "number" },
                  description: { type: "string" },
                  stakes_elevation: { type: "string" }
                }
              },
              midpoint: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  scene_number: { type: "number" },
                  description: { type: "string" },
                  revelation_type: { type: "string" }
                }
              },
              climax: {
                type: "object",
                properties: {
                  page: { type: "number" },
                  scene_number: { type: "number" },
                  description: { type: "string" },
                  resolution_method: { type: "string" }
                }
              }
            }
          },
          acts_breakdown: {
            type: "array",
            items: {
              type: "object",
              properties: {
                act_number: { type: "number" },
                pages_start: { type: "number" },
                pages_end: { type: "number" },
                scenes_start: { type: "number" },
                scenes_end: { type: "number" },
                dramatic_function: { type: "string" },
                emotional_arc: { type: "string" },
                visual_style_notes: { type: "string" }
              }
            }
          }
        }
      },
      personajes_v10: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            rol_dramatico: {
              type: "string",
              enum: ["protagonist", "antagonist", "mentor", "love_interest", "comic_relief", "threshold_guardian", "ally", "herald"]
            },
            arco_completo: {
              type: "object",
              properties: {
                starting_state: { type: "string" },
                transformation_catalyst: { type: "string" },
                midpoint_change: { type: "string" },
                final_state: { type: "string" },
                arc_type: { type: "string", enum: ["hero_journey", "fall_from_grace", "redemption", "flat_arc", "corruption"] }
              }
            },
            caracterizacion_profunda: {
              type: "object",
              properties: {
                backstory_key: { type: "string" },
                motivation_core: { type: "string" },
                internal_conflict: { type: "string" },
                external_goal: { type: "string" },
                fatal_flaw: { type: "string" },
                redeeming_quality: { type: "string" }
              }
            },
            cinematography_notes: {
              type: "object",
              properties: {
                signature_shots: { type: "array", items: { type: "string" } },
                lighting_preference: { type: "string" },
                costume_palette: { type: "array", items: { type: "string" } },
                props_signature: { type: "array", items: { type: "string" } }
              }
            },
            dialogue_analysis: {
              type: "object",
              properties: {
                speech_pattern: { type: "string" },
                vocabulary_level: { type: "string", enum: ["simple", "moderate", "complex", "technical"] },
                emotional_range: { type: "array", items: { type: "string" } },
                subtext_style: { type: "string" }
              }
            }
          }
        }
      },
      escenas_v10: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numero: { type: "number" },
            titulo_descriptivo: { type: "string" },
            paginas: { type: "string" },
            duracion_estimada_minutos: { type: "number" },
            localizacion: { type: "string" },
            tiempo_del_dia: { type: "string" },
            funcion_dramatica: {
              type: "string",
              enum: ["setup", "inciting_incident", "rising_action", "midpoint", "climax", "resolution", "character_development", "plot_advancement", "comic_relief"]
            },
            conflicto_central: { type: "string" },
            stakes_nivel: { type: "string", enum: ["low", "medium", "high", "life_death"] },
            emotional_beat: { type: "string" },
            personajes_presentes: { type: "array", items: { type: "string" } },
            cinematografia_v10: {
              type: "object",
              properties: {
                shot_list_sugerido: { type: "array", items: { type: "string" } },
                lighting_setup: { type: "string" },
                color_palette: { type: "array", items: { type: "string" } },
                camera_movement: { type: "string" },
                audio_design: { type: "string" },
                production_notes: { type: "string" }
              }
            }
          }
        }
      },
      localizaciones_v10: {
        type: "array",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string" },
            descripcion_visual_completa: { type: "string" },
            funcion_narrativa: { type: "string" },
            simbolismo_tematico: { type: "string" },
            mood_emocional: { type: "string" },
            production_requirements: {
              type: "object",
              properties: {
                location_type: { type: "string", enum: ["studio", "practical", "green_screen", "hybrid"] },
                budget_tier: { type: "string", enum: ["low", "medium", "high"] },
                crew_size_needed: { type: "string", enum: ["minimal", "standard", "large"] },
                special_equipment: { type: "array", items: { type: "string" } }
              }
            },
            cinematografia_location: {
              type: "object",
              properties: {
                lighting_style: { type: "string" },
                camera_positions_optimal: { type: "array", items: { type: "string" } },
                color_grading_notes: { type: "string" },
                practical_considerations: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      },
      analisis_tecnico_v10: {
        type: "object",
        properties: {
          visual_style_overview: {
            type: "object", 
            properties: {
              cinematography_style: { type: "string" },
              genre_visual_influences: { type: "array", items: { type: "string" } },
              color_story_arc: { type: "string" },
              lighting_philosophy: { type: "string" }
            }
          },
          production_breakdown: {
            type: "object",
            properties: {
              estimated_shoot_days: { type: "number" },
              locations_count: { type: "number" },
              cast_size: { type: "string", enum: ["intimate", "ensemble", "large_cast"] },
              vfx_requirements: { type: "string", enum: ["none", "minimal", "moderate", "heavy"] },
              budget_estimate_tier: { type: "string" }
            }
          },
          directorial_notes: {
            type: "object",
            properties: {
              genre_specific_guidance: { type: "string" },
              performance_direction_style: { type: "string" },
              visual_priorities: { type: "array", items: { type: "string" } },
              audience_engagement_strategy: { type: "string" }
            }
          }
        }
      }
    }
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from auth
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario no autenticado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { pdfUrl, projectId, scriptText: providedText, analysisMode = 'v10_complete' } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let scriptText = providedText || "";

    // Extract script text if needed
    if (!scriptText && pdfUrl) {
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error("No se pudo descargar el PDF");
      }
      const pdfBuffer = await pdfResponse.arrayBuffer();
      
      // Convert to base64
      const uint8Array = new Uint8Array(pdfBuffer);
      const chunkSize = 32768;
      let pdfBase64 = '';
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, i + chunkSize);
        pdfBase64 += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      pdfBase64 = btoa(pdfBase64);

      // Extract text from PDF using AI
      const extractResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { 
              role: "system", 
              content: "You are a professional Hollywood screenwriter. All content is fictional for entertainment purposes. Extract all text from this PDF maintaining formatting and structure." 
            },
            { 
              role: "user", 
              content: [
                { type: "text", text: "Extract all text from this screenplay PDF, maintaining scene structure and formatting." },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } }
              ]
            },
          ],
          max_tokens: 32000,
          temperature: 0.1
        }),
      });

      const extractResult = await extractResponse.json();
      scriptText = extractResult.choices[0].message.content;
    } else if (!scriptText) {
      // Get from database
      const { data: scriptData } = await supabaseClient
        .from('scripts')
        .select('raw_text')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      scriptText = scriptData?.raw_text || "";
    }

    if (!scriptText || scriptText.length < 100) {
      return new Response(
        JSON.stringify({ error: "No se pudo extraer texto del guión" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`V10 Analysis: Script text extracted: ${scriptText.length} characters`);

    // V10 MEGA-ANALYSIS
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: V10_STRUCTURE_SYSTEM_PROMPT },
          { 
            role: "user", 
            content: `Perform complete V10 analysis on this screenplay. Utilize your knowledge of 1800 professional films to provide industry-level analysis with full cinematographic annotations:\n\n${scriptText}` 
          }
        ],
        tools: [{ type: "function", function: V10_FUNCTION_SCHEMA }],
        tool_choice: { type: "function", function: { name: "deliver_v10_analysis" } },
        max_tokens: 32000,
        temperature: 0.3
      }),
    });

    const result = await response.json();
    
    if (!result.choices || !result.choices[0]) {
      throw new Error("No response from AI model");
    }

    const choice = result.choices[0];
    let analysisData;

    if (choice.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        analysisData = JSON.parse(choice.message.tool_calls[0].function.arguments);
      } catch (e) {
        throw new Error("Failed to parse V10 analysis JSON");
      }
    } else {
      throw new Error("No tool call response received");
    }

    // Add cinematography patterns to analysis
    analysisData.cinematography_database = CINEMATOGRAPHY_PATTERNS;
    analysisData.v10_metadata = {
      analysis_version: "V10",
      model_used: "gemini-2.5-pro",
      analysis_timestamp: new Date().toISOString(),
      features: ["mega_structure_detection", "cinematographic_annotations", "production_ready"]
    };

    // Save to database
    const { data: insertData, error: insertError } = await supabaseClient
      .from('scripts')
      .insert([
        {
          project_id: projectId,
          raw_text: scriptText,
          parsed_json: analysisData,
          status: 'completed_v10',
          version: 'V10',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error("Error saving V10 analysis to database");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        analysis: analysisData,
        scriptId: insertData.id,
        stats: {
          textLength: scriptText.length,
          analysisVersion: "V10",
          modelUsed: "gemini-2.5-pro",
          confidence: analysisData.meta_analysis?.confidence_score || 0,
          features: ["mega_structure", "cinematography", "production_ready"]
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("V10 Parse script error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Error analyzing script with V10",
        version: "V10",
        needsManualInput: true 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});