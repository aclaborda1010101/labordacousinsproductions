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
    },
    "thriller": {
      shots: ["tight_close_up", "over_shoulder_paranoid", "surveillance_wide"],
      lighting: "high_contrast_shadows",
      color_palette: ["cold_blue", "stark_white", "deep_black"],
      camera_movement: "slow_push_in"
    },
    "comedy": {
      shots: ["wide_comedy", "reaction_close", "timing_medium"],
      lighting: "bright_even",
      color_palette: ["warm_saturated", "bright_primary", "soft_pastels"],
      camera_movement: "steady_static"
    }
  }
};

// V10 Professional Breakdown System Prompt
const BREAKDOWN_PRO_SYSTEM_PROMPT = `You are a professional Hollywood script supervisor and production analyst. All content is fictional for entertainment purposes.

You have studied 1800+ professional screenplays and understand deep patterns of cinematic storytelling.

### BREAKDOWN PRO PROTOCOL (V10):

#### 1. STRUCTURE ANALYSIS
Identify the exact dramatic structure:
- Structure type (3-act, 5-act, hero's journey, etc.)
- Key turning points with page/scene numbers
- Act breaks and their dramatic function

#### 2. CHARACTER BREAKDOWN
For each character:
- Role (protagonist, antagonist, supporting, etc.)
- Complete character arc
- Relationships and dynamics
- Dialogue patterns and voice
- Screen time estimation

#### 3. SCENE ANALYSIS
For each scene:
- Dramatic function
- Characters present
- Location requirements
- Emotional beat
- Stakes level
- Suggested cinematography (shots, lighting, color)

#### 4. PRODUCTION REQUIREMENTS
- Locations list with INT/EXT and complexity
- Props and special items
- VFX/SFX requirements
- Estimated budget tier
- Shooting schedule notes

#### 5. THEMATIC ANALYSIS
- Core themes
- Visual motifs
- Symbolic elements

Respond in JSON format with these sections.`;

const BREAKDOWN_PRO_FUNCTION_SCHEMA = {
  name: "deliver_breakdown_pro",
  description: "Deliver professional V10 screenplay breakdown",
  parameters: {
    type: "object",
    properties: {
      meta: {
        type: "object",
        properties: {
          title: { type: "string" },
          genre: { type: "string" },
          genre_secondary: { type: "array", items: { type: "string" } },
          tone: { type: "string" },
          structure_type: { type: "string" },
          estimated_runtime_minutes: { type: "number" },
          target_audience: { type: "string" },
          budget_tier: { type: "string", enum: ["low", "medium", "high", "tentpole"] }
        }
      },
      structure: {
        type: "object",
        properties: {
          acts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number: { type: "number" },
                name: { type: "string" },
                start_scene: { type: "number" },
                end_scene: { type: "number" },
                dramatic_function: { type: "string" },
                emotional_arc: { type: "string" }
              }
            }
          },
          turning_points: {
            type: "object",
            properties: {
              inciting_incident: { type: "object", properties: { scene: { type: "number" }, description: { type: "string" } } },
              plot_point_1: { type: "object", properties: { scene: { type: "number" }, description: { type: "string" } } },
              midpoint: { type: "object", properties: { scene: { type: "number" }, description: { type: "string" } } },
              plot_point_2: { type: "object", properties: { scene: { type: "number" }, description: { type: "string" } } },
              climax: { type: "object", properties: { scene: { type: "number" }, description: { type: "string" } } }
            }
          }
        }
      },
      characters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: { type: "string", enum: ["protagonist", "antagonist", "mentor", "love_interest", "ally", "comic_relief", "supporting", "minor"] },
            arc_summary: { type: "string" },
            motivation: { type: "string" },
            internal_conflict: { type: "string" },
            scenes_present: { type: "array", items: { type: "number" } },
            dialogue_style: { type: "string" },
            relationships: { type: "array", items: { type: "object", properties: { character: { type: "string" }, relationship: { type: "string" } } } }
          }
        }
      },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            number: { type: "number" },
            slugline: { type: "string" },
            location: { type: "string" },
            int_ext: { type: "string" },
            time_of_day: { type: "string" },
            characters: { type: "array", items: { type: "string" } },
            dramatic_function: { type: "string" },
            emotional_beat: { type: "string" },
            stakes: { type: "string", enum: ["low", "medium", "high", "life_death"] },
            estimated_duration_minutes: { type: "number" },
            cinematography: {
              type: "object",
              properties: {
                suggested_shots: { type: "array", items: { type: "string" } },
                lighting: { type: "string" },
                color_palette: { type: "array", items: { type: "string" } },
                camera_movement: { type: "string" }
              }
            },
            production_notes: { type: "string" }
          }
        }
      },
      locations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            int_ext: { type: "string" },
            scenes: { type: "array", items: { type: "number" } },
            complexity: { type: "string", enum: ["simple", "medium", "complex"] },
            requirements: { type: "array", items: { type: "string" } },
            mood: { type: "string" }
          }
        }
      },
      production: {
        type: "object",
        properties: {
          props: { type: "array", items: { type: "object", properties: { name: { type: "string" }, scenes: { type: "array", items: { type: "number" } }, importance: { type: "string" } } } },
          vfx_requirements: { type: "array", items: { type: "object", properties: { description: { type: "string" }, scenes: { type: "array", items: { type: "number" } }, complexity: { type: "string" } } } },
          sfx_requirements: { type: "array", items: { type: "object", properties: { description: { type: "string" }, scenes: { type: "array", items: { type: "number" } } } } },
          wardrobe_notes: { type: "array", items: { type: "object", properties: { character: { type: "string" }, description: { type: "string" }, scenes: { type: "array", items: { type: "number" } } } } },
          estimated_shoot_days: { type: "number" },
          cast_size: { type: "string" },
          locations_count: { type: "number" }
        }
      },
      themes: {
        type: "object",
        properties: {
          primary_theme: { type: "string" },
          secondary_themes: { type: "array", items: { type: "string" } },
          visual_motifs: { type: "array", items: { type: "string" } },
          symbolic_elements: { type: "array", items: { type: "object", properties: { symbol: { type: "string" }, meaning: { type: "string" } } } }
        }
      }
    },
    required: ["meta", "structure", "characters", "scenes", "locations", "production", "themes"]
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get request body
    const { projectId, scriptText, scriptId, language = 'es' } = await req.json();

    if (!projectId) {
      return new Response(
        JSON.stringify({ error: "projectId es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!scriptText || scriptText.length < 100) {
      return new Response(
        JSON.stringify({ error: "scriptText es requerido (mínimo 100 caracteres)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || Deno.env.get("OPENAI_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key no configurada" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[script-breakdown-pro] Starting V10 analysis for project ${projectId}`);
    console.log(`[script-breakdown-pro] Script length: ${scriptText.length} characters`);

    // V10 MEGA-ANALYSIS with Gemini
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: BREAKDOWN_PRO_SYSTEM_PROMPT + (language === 'es' ? '\n\nRespond with Spanish text in descriptions.' : '') 
          },
          { 
            role: "user", 
            content: `Perform a complete professional breakdown (V10 level) of this screenplay. Analyze every element for production:\n\n${scriptText.slice(0, 80000)}` 
          }
        ],
        tools: [{ type: "function", function: BREAKDOWN_PRO_FUNCTION_SCHEMA }],
        tool_choice: { type: "function", function: { name: "deliver_breakdown_pro" } },
        max_tokens: 32000,
        temperature: 0.2
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[script-breakdown-pro] AI API error: ${response.status}`, errText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.choices || !result.choices[0]) {
      throw new Error("No response from AI model");
    }

    const choice = result.choices[0];
    let breakdownData;

    if (choice.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        breakdownData = JSON.parse(choice.message.tool_calls[0].function.arguments);
      } catch (e) {
        console.error("[script-breakdown-pro] JSON parse error:", e);
        throw new Error("Failed to parse breakdown JSON");
      }
    } else if (choice.message?.content) {
      // Fallback: try to extract JSON from content
      try {
        const jsonMatch = choice.message.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          breakdownData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        throw new Error("No structured response received");
      }
    }

    if (!breakdownData) {
      throw new Error("No breakdown data extracted");
    }

    // Add metadata
    breakdownData.cinematography_patterns = CINEMATOGRAPHY_PATTERNS;
    breakdownData.v10_metadata = {
      version: "V10_PRO",
      model: "gemini-2.5-pro",
      analyzed_at: new Date().toISOString(),
      script_length: scriptText.length,
      language
    };

    console.log(`[script-breakdown-pro] Analysis complete. Scenes: ${breakdownData.scenes?.length || 0}, Characters: ${breakdownData.characters?.length || 0}`);

    // Update script record if scriptId provided
    if (scriptId) {
      const { error: updateError } = await supabaseClient
        .from('scripts')
        .update({
          parsed_json: breakdownData,
          status: 'breakdown_complete',
          updated_at: new Date().toISOString()
        })
        .eq('id', scriptId);

      if (updateError) {
        console.error("[script-breakdown-pro] DB update error:", updateError);
      }
    }

    // Return breakdown
    return new Response(
      JSON.stringify({ 
        success: true, 
        breakdown: breakdownData,
        stats: {
          scenes_count: breakdownData.scenes?.length || 0,
          characters_count: breakdownData.characters?.length || 0,
          locations_count: breakdownData.locations?.length || 0,
          analysis_version: "V10_PRO"
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("[script-breakdown-pro] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Error generating breakdown",
        breakdown: null
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
