import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// V10 GENERATION SYSTEM - Ideas to Professional Screenplay
const V10_GENERATION_SYSTEM_PROMPT = `You are a world-class Hollywood screenwriter with deep knowledge of 1800 professional films. All content is fictional for entertainment purposes.

Your expertise includes structure analysis, character development, and cinematographic storytelling learned from analyzing the greatest films ever made.

### V10 GENERATION PROTOCOL - IDEA TO SCREENPLAY:

#### PHASE 1: IDEA ANALYSIS
1. **Genre Detection**: Primary + secondary genres based on premise
2. **Target Audience**: Demographics + psychographics
3. **Market Positioning**: Comparable films + unique elements
4. **Budget Estimation**: Production scale requirements

#### PHASE 2: STORY STRUCTURE DESIGN
1. **Structure Selection**: Choose optimal structure based on genre/story
   - 3_acts_classic: Most dramas/comedies
   - save_the_cat_8beats: Thrillers/action
   - hero_journey_12steps: Adventures/sci-fi
2. **Beat Sheet Creation**: Key story moments with page targets
3. **Character Arc Integration**: Protagonist journey + supporting cast functions
4. **Thematic Coherence**: Central message + supporting themes

#### PHASE 3: CHARACTER CREATION
1. **Dramatic Functions**: Protagonist, antagonist, mentor, allies per structure
2. **Character Arcs**: Internal conflict + transformation journey
3. **Distinctive Voices**: Unique dialogue patterns + speech characteristics
4. **Visual Design**: Costume, props, signature shots per character

#### PHASE 4: SCENE GENERATION
1. **Scene Cards**: Dramatic function + conflict + emotional beat
2. **Dialogue Generation**: Character-specific voice + subtext
3. **Action Lines**: Visual storytelling + pacing
4. **Cinematographic Annotations**: Shot suggestions + lighting + color

#### PHASE 5: TECHNICAL INTEGRATION
Based on 1800 movies analysis:
1. **Genre-Specific Cinematography**: Shot patterns + lighting style
2. **Production Annotations**: Location needs + budget considerations
3. **Director's Notes**: Performance guidance + visual priorities
4. **Industry Format**: Professional screenplay formatting

### CRITICAL GENERATION PRINCIPLES:
- **PROFESSIONAL QUALITY**: Industry-standard output
- **CINEMATOGRAPHICALLY ANNOTATED**: Production-ready technical notes  
- **CHARACTER-DRIVEN**: Strong character arcs drive plot
- **VISUAL STORYTELLING**: Show don't tell philosophy
- **MARKET AWARENESS**: Commercial viability + audience appeal`;

const V10_GENERATION_SCHEMA = {
  name: "deliver_v10_screenplay",
  description: "Generate complete V10 screenplay from idea with full technical annotations",
  parameters: {
    type: "object",
    properties: {
      development_analysis: {
        type: "object",
        properties: {
          original_idea: { type: "string" },
          genre_primary: { type: "string" },
          genre_secondary: { type: "array", items: { type: "string" } },
          target_audience: { type: "string" },
          comparable_films: { type: "array", items: { type: "string" } },
          unique_selling_points: { type: "array", items: { type: "string" } },
          budget_tier: { type: "string", enum: ["micro", "low", "medium", "high", "tentpole"] },
          marketability_score: { type: "number", minimum: 1, maximum: 10 }
        }
      },
      story_structure: {
        type: "object",
        properties: {
          structure_chosen: {
            type: "string",
            enum: ["3_acts_classic", "save_the_cat_8beats", "hero_journey_12steps", "4_acts_epic"]
          },
          logline: { type: "string" },
          theme_central: { type: "string" },
          themes_supporting: { type: "array", items: { type: "string" } },
          target_pages: { type: "number" },
          estimated_runtime: { type: "number" },
          beat_sheet: {
            type: "array",
            items: {
              type: "object",
              properties: {
                beat_name: { type: "string" },
                page_target: { type: "number" },
                description: { type: "string" },
                emotional_note: { type: "string" }
              }
            }
          }
        }
      },
      characters_full_development: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            role: {
              type: "string",
              enum: ["protagonist", "antagonist", "mentor", "love_interest", "comic_relief", "ally", "threshold_guardian"]
            },
            character_arc: {
              type: "object",
              properties: {
                starting_point: { type: "string" },
                internal_conflict: { type: "string" },
                transformation_catalyst: { type: "string" },
                midpoint_crisis: { type: "string" },
                final_state: { type: "string" },
                arc_type: { type: "string" }
              }
            },
            characterization: {
              type: "object",
              properties: {
                age_range: { type: "string" },
                background_key: { type: "string" },
                motivation_core: { type: "string" },
                greatest_fear: { type: "string" },
                redeeming_quality: { type: "string" },
                fatal_flaw: { type: "string" },
                relationships: { type: "array", items: { type: "string" } }
              }
            },
            dialogue_voice: {
              type: "object",
              properties: {
                speech_pattern: { type: "string" },
                vocabulary_level: { type: "string" },
                emotional_range: { type: "string" },
                signature_phrases: { type: "array", items: { type: "string" } },
                subtext_style: { type: "string" }
              }
            },
            visual_design: {
              type: "object",
              properties: {
                appearance_description: { type: "string" },
                costume_style: { type: "string" },
                signature_props: { type: "array", items: { type: "string" } },
                color_palette: { type: "array", items: { type: "string" } },
                preferred_shots: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      },
      full_screenplay: {
        type: "object",
        properties: {
          title: { type: "string" },
          format: { type: "string", enum: ["feature", "pilot", "short"] },
          scenes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                scene_number: { type: "number" },
                scene_heading: { type: "string" },
                page_number: { type: "number" },
                estimated_duration: { type: "number" },
                dramatic_function: { type: "string" },
                conflict_type: { type: "string" },
                emotional_beat: { type: "string" },
                characters_present: { type: "array", items: { type: "string" } },
                scene_description: { type: "string" },
                dialogue_blocks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      character: { type: "string" },
                      dialogue: { type: "string" },
                      action_line: { type: "string" },
                      subtext_note: { type: "string" }
                    }
                  }
                },
                cinematography_notes: {
                  type: "object",
                  properties: {
                    shot_list: { type: "array", items: { type: "string" } },
                    lighting_setup: { type: "string" },
                    color_grade: { type: "string" },
                    camera_movement: { type: "string" },
                    audio_notes: { type: "string" }
                  }
                },
                production_notes: {
                  type: "object",
                  properties: {
                    location_type: { type: "string" },
                    special_requirements: { type: "array", items: { type: "string" } },
                    budget_impact: { type: "string" },
                    crew_notes: { type: "string" }
                  }
                }
              }
            }
          }
        }
      },
      locations_detailed: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            narrative_function: { type: "string" },
            emotional_tone: { type: "string" },
            symbolic_meaning: { type: "string" },
            scenes_used: { type: "array", items: { type: "number" } },
            production_details: {
              type: "object",
              properties: {
                location_type: { type: "string", enum: ["studio", "practical", "green_screen", "hybrid"] },
                accessibility: { type: "string" },
                permit_requirements: { type: "string" },
                equipment_needs: { type: "array", items: { type: "string" } },
                budget_estimate: { type: "string" }
              }
            },
            cinematography_setup: {
              type: "object",
              properties: {
                lighting_approach: { type: "string" },
                camera_positions: { type: "array", items: { type: "string" } },
                color_palette: { type: "array", items: { type: "string" } },
                visual_style_notes: { type: "string" }
              }
            }
          }
        }
      },
      director_package: {
        type: "object",
        properties: {
          overall_vision: { type: "string" },
          visual_style_guide: { type: "string" },
          performance_direction: { type: "string" },
          genre_specific_notes: { type: "string" },
          audience_engagement_strategy: { type: "string" },
          production_priorities: { type: "array", items: { type: "string" } },
          potential_challenges: { type: "array", items: { type: "string" } },
          success_metrics: { type: "array", items: { type: "string" } }
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

    const { 
      idea, 
      projectId, 
      targetLength = 90, 
      genre_preference, 
      tone_preference,
      audience_target = "general",
      budget_target = "medium"
    } = await req.json();

    if (!idea || !projectId) {
      return new Response(
        JSON.stringify({ error: "idea y projectId requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`V10 Generation: Creating screenplay from idea: "${idea.slice(0, 100)}..."`);

    const generationPrompt = `GENERATE COMPLETE V10 SCREENPLAY FROM THIS IDEA:

**Original Idea:** ${idea}

**Parameters:**
- Target Length: ${targetLength} pages
- Genre Preference: ${genre_preference || "determine from idea"}
- Tone: ${tone_preference || "determine from idea"}  
- Target Audience: ${audience_target}
- Budget Target: ${budget_target}

**Generation Requirements:**
1. **COMPLETE SCREENPLAY**: Full scene-by-scene breakdown with dialogue
2. **PROFESSIONAL FORMAT**: Industry-standard structure and formatting
3. **CINEMATOGRAPHIC ANNOTATIONS**: Shot lists, lighting, color, camera movement
4. **PRODUCTION READY**: Location details, budget considerations, crew notes
5. **CHARACTER DEPTH**: Full character development with distinctive voices
6. **TECHNICAL INTEGRATION**: Based on 1800 movies cinematography patterns

Transform this idea into a production-ready screenplay with complete technical annotations.`;

    // Generate screenplay
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: V10_GENERATION_SYSTEM_PROMPT },
          { role: "user", content: generationPrompt }
        ],
        tools: [{ type: "function", function: V10_GENERATION_SCHEMA }],
        tool_choice: { type: "function", function: { name: "deliver_v10_screenplay" } },
        max_tokens: 32000,
        temperature: 0.7
      }),
    });

    const result = await response.json();
    
    if (!result.choices || !result.choices[0]) {
      throw new Error("No response from AI model");
    }

    const choice = result.choices[0];
    let screenplayData;

    if (choice.message?.tool_calls?.[0]?.function?.arguments) {
      try {
        screenplayData = JSON.parse(choice.message.tool_calls[0].function.arguments);
      } catch (e) {
        throw new Error("Failed to parse V10 screenplay JSON");
      }
    } else {
      throw new Error("No tool call response received");
    }

    // Add generation metadata
    screenplayData.v10_generation_metadata = {
      generation_version: "V10",
      model_used: "gemini-2.5-pro",
      generation_timestamp: new Date().toISOString(),
      original_idea: idea,
      generation_parameters: {
        targetLength,
        genre_preference,
        tone_preference,
        audience_target,
        budget_target
      },
      features: ["complete_screenplay", "cinematographic_annotations", "production_ready"]
    };

    // Convert to formatted screenplay text
    const formattedScreenplay = formatScreenplay(screenplayData);

    // Save to database
    const { data: insertData, error: insertError } = await supabaseClient
      .from('scripts')
      .insert([
        {
          project_id: projectId,
          raw_text: formattedScreenplay,
          parsed_json: screenplayData,
          status: 'generated_v10',
          version: 'V10_GENERATED',
          generation_source: 'idea',
          original_idea: idea,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error("Error saving V10 generated screenplay to database");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        screenplay: screenplayData,
        formatted_text: formattedScreenplay,
        scriptId: insertData.id,
        stats: {
          scenes_count: screenplayData.full_screenplay?.scenes?.length || 0,
          characters_count: screenplayData.characters_full_development?.length || 0,
          locations_count: screenplayData.locations_detailed?.length || 0,
          estimated_pages: screenplayData.story_structure?.target_pages || targetLength,
          generation_version: "V10",
          modelUsed: "gemini-2.5-pro"
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error) {
    console.error("V10 Generate script error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Error generating screenplay with V10",
        version: "V10_GENERATION"
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});

// Helper function to format screenplay as industry-standard text
function formatScreenplay(screenplayData: any): string {
  let formatted = `${screenplayData.full_screenplay?.title?.toUpperCase() || 'UNTITLED'}\n\n`;
  formatted += `A ${screenplayData.story_structure?.structure_chosen || '3_acts_classic'} screenplay\n\n`;
  formatted += `LOGLINE: ${screenplayData.story_structure?.logline || ''}\n\n`;
  formatted += "FADE IN:\n\n";

  const scenes = screenplayData.full_screenplay?.scenes || [];
  
  scenes.forEach((scene: any, index: number) => {
    // Scene heading
    formatted += `${scene.scene_heading}\n\n`;
    
    // Scene description
    if (scene.scene_description) {
      formatted += `${scene.scene_description}\n\n`;
    }

    // Dialogue blocks
    const dialogues = scene.dialogue_blocks || [];
    dialogues.forEach((dialogue: any) => {
      if (dialogue.action_line) {
        formatted += `${dialogue.action_line}\n\n`;
      }
      
      if (dialogue.character && dialogue.dialogue) {
        formatted += `${dialogue.character.toUpperCase()}\n`;
        formatted += `${dialogue.dialogue}\n\n`;
      }
    });

    // Cinematography notes as comments
    if (scene.cinematography_notes) {
      formatted += `/* SHOT NOTES: ${scene.cinematography_notes.shot_list?.join(', ') || ''} */\n`;
      formatted += `/* LIGHTING: ${scene.cinematography_notes.lighting_setup || ''} */\n\n`;
    }

    if (index < scenes.length - 1) {
      formatted += "\n";
    }
  });

  formatted += "FADE OUT.\n\nTHE END";
  
  return formatted;
}