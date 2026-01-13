import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StoryboardRequest {
  scene_id: string;
  project_id: string;
  scene_text: string;
  scene_slugline?: string;
  visual_style?: string;
  storyboard_style?: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
  character_refs?: { id: string; name: string; image_url?: string }[];
  location_ref?: { id: string; name: string; image_url?: string; interior_exterior?: string; time_of_day?: string };
  panel_count?: number;
  beats?: { beat_id: string; description: string }[];
  dialogue_blocks?: { line_id: string; speaker_id: string; text: string }[];
  show_movement_arrows?: boolean;
  aspect_ratio?: string;
}

interface StoryboardPanel {
  panel_id: string;
  panel_no: number;
  panel_intent: string;
  shot_hint: string;
  action_beat?: string;
  characters_present: Array<{ character_id: string; importance: string }>;
  props_present: Array<{ prop_id: string; importance: string }>;
  movement_arrows?: Array<{ type: string; direction: string; intensity?: string }>;
  spatial_info?: {
    camera_relative_position?: string;
    subject_direction?: string;
    axis_locked?: boolean;
  };
}

// =============================================================================
// STORYBOARD PLAN PROMPT - GPT-5.2 (JSON ONLY)
// =============================================================================
const STORYBOARD_PLAN_PROMPT_GRID = `ROLE: Senior Film Storyboard Director

You are designing a PROFESSIONAL FILM STORYBOARD as STRUCTURED DATA.
You DO NOT generate images.
You DO NOT describe camera lenses or lighting.
You DO NOT invent characters, props, or locations outside the provided list.

STYLE: GRID_SHEET_V1 - Multipanel sheet (6-9 panels) for visual production planning.

HARD RULES:
1. Storyboard panels define WHAT IS SEEN and WHERE it is seen from.
2. Use classic film grammar: PG (Wide), PM (Medium), PMC (Medium-Close), PP (Close-up), OTS, 2SHOT, INSERT, POV.
3. Maintain spatial continuity and 180° axis consistency.
4. Output ONLY valid JSON matching the schema.
5. No prose. No markdown. No commentary.

OUTPUT JSON SCHEMA:
{
  "panels": [
    {
      "panel_id": "P1",
      "panel_no": 1,
      "panel_intent": "Establish scene geography and character entrance",
      "shot_hint": "PG",
      "action_beat": "Description of action in this panel",
      "characters_present": [{"character_id": "id", "importance": "primary|secondary"}],
      "props_present": [{"prop_id": "id", "importance": "primary|secondary"}],
      "movement_arrows": [{"type": "subject|camera", "direction": "left|right|towards|away", "intensity": "low|medium|high"}],
      "spatial_info": {
        "camera_relative_position": "behind|front|left|right|above",
        "subject_direction": "towards_camera|away_from_camera|lateral",
        "axis_locked": true
      }
    }
  ]
}`;

const STORYBOARD_PLAN_PROMPT_TECH = `ROLE: Senior Film Storyboard Director

You are designing a TECHNICAL STORYBOARD PAGE as STRUCTURED DATA.
This style emphasizes shot_label and blocking references over visual storytelling.

STYLE: TECH_PAGE_V1 - Technical page with shot list + blocking diagram (4-6 panels).

HARD RULES:
1. Each panel represents a distinct camera setup.
2. Include blocking_ref for scenes with character movement or multiple subjects.
3. Emphasize shot_label with technical descriptors.
4. Output ONLY valid JSON matching the schema.
5. No prose. No markdown. No commentary.

OUTPUT JSON SCHEMA:
{
  "panels": [
    {
      "panel_id": "P1",
      "panel_no": 1,
      "panel_intent": "Technical description of shot purpose",
      "shot_hint": "PM",
      "shot_label": "PMC lateral driver, weapons foreground",
      "blocking_ref": "B1",
      "action_beat": "Action description",
      "characters_present": [{"character_id": "id", "importance": "primary"}],
      "props_present": [{"prop_id": "id", "importance": "primary"}],
      "spatial_info": {
        "camera_relative_position": "lateral",
        "axis_locked": true
      }
    }
  ]
}`;

// =============================================================================
// IMAGE GENERATION PROMPTS - NanoBanana Pro 3
// =============================================================================
const GRID_SHEET_IMAGE_PROMPT = `Generate a PROFESSIONAL BLACK AND WHITE STORYBOARD SHEET.

STYLE (MANDATORY - NO EXCEPTIONS):
- White paper background with clean margins
- Crisp black ink linework with soft graphite shading (grey pencil)
- NO color at all - strictly B&W/grayscale
- NO painterly strokes, NO comic style
- NO photorealism, NO CGI render look
- Clean rectangular panels with uniform black borders
- Film storyboard aesthetic (European cinema production)
- Scanned storyboard sheet look

LAYOUT:
- Multi-panel grid (exactly {{N_PANELS}} panels)
- 16:9 frames inside each panel
- Panel labels P1, P2, P3... in bottom-right corner
- Title area top-left: {{PROJECT_TITLE}} - Sec. {{SCENE_CODE}}

CHARACTER CONSISTENCY:
Use the provided character references EXACTLY.
No variation in face, hair, clothing, or proportions.
Simplify to sketch level but KEEP RECOGNIZABLE.

CONTENT:
{{PANEL_DESCRIPTIONS}}

NEGATIVE PROMPT:
color, CGI, 3D render, anime, comic book, messy sketch, exaggerated style, UI overlay, photographs, digital art, concept art, illustration`;

const TECH_PAGE_IMAGE_PROMPT = `Generate a FILM SHOOTING TECH STORYBOARD PAGE in Spanish.

STYLE (MANDATORY):
- White paper background
- Clean typed black text (sans-serif font)
- ONE storyboard frame (ink + pencil sketch) in top-right
- Numbered shot list on the left side (01, 02, 03...)
- Top-view blocking diagram at bottom with:
  - Circles with initials for characters
  - Blue arrows for movement
  - Camera position triangles
- Professional shooting plan aesthetic
- Clean, minimal, technical

LAYOUT:
Header line: {{SEC_CODE}}    {{LOCATION_CODE}}    {{SET_CODE}}    {{TIME_CONTEXT}}
Subheader: {{SCENE_LOGLINE}}
Shot list: {{SHOT_LIST}}
Blocking diagram: {{BLOCKING_SPEC}}

NEGATIVE PROMPT:
illustration art, comic style, colors except blue arrows, decorative fonts, cinematic lighting effects, photographs, 3D render`;

// =============================================================================
// CHARACTER VISUAL DNA INJECTION
// =============================================================================
async function buildCharacterDNAContext(
  supabaseClient: any,
  characterRefs: { id: string; name: string; image_url?: string }[]
): Promise<string> {
  if (!characterRefs || characterRefs.length === 0) {
    return "No characters specified for this scene.";
  }

  const characterContextParts: string[] = [];

  for (const char of characterRefs) {
    try {
      const { data: charData } = await supabaseClient
        .from("characters")
        .select(`name, bio, visual_dna, character_role, profile_json`)
        .eq("id", char.id)
        .single();

      if (charData) {
        const visualDna = charData.visual_dna as Record<string, any> | null;
        const profile = charData.profile_json as Record<string, any> | null;

        let description = `${charData.name} (ID: ${char.id})`;

        if (visualDna) {
          const physical = visualDna.physical_identity || {};
          const hair = visualDna.hair?.head_hair || {};
          const face = visualDna.face || {};

          description += `\n  - Age: ${physical.age_exact_for_prompt || physical.age_range || "unspecified"}`;
          description += `\n  - Build: ${physical.body_type?.somatotype || "average"}, height ${physical.height || "medium"}`;
          description += `\n  - Hair: ${hair.color?.natural_base || "unspecified"} ${hair.length?.type || "medium"} hair`;
          description += `\n  - Face: ${face.shape || "oval"} face shape`;
          
          if (face.distinctive_features) {
            description += `\n  - Distinctive features: ${face.distinctive_features.join(", ")}`;
          }
        } else if (profile) {
          description += `\n  - Profile: ${profile.appearance || charData.bio || "No detailed profile"}`;
        } else if (charData.bio) {
          description += `\n  - Bio: ${charData.bio}`;
        }

        description += "\n  MAINTAIN THESE TRAITS IN SIMPLIFIED SKETCH FORM - DO NOT REDESIGN";
        
        characterContextParts.push(description);
      } else {
        characterContextParts.push(`${char.name} (ID: ${char.id}): Use reference if available`);
      }
    } catch (err) {
      console.log(`[generate-storyboard] Could not fetch DNA for ${char.name}:`, err);
      characterContextParts.push(`${char.name} (ID: ${char.id}): Use reference if available`);
    }
  }

  return `CHARACTER VISUAL REFERENCES (MANDATORY - MAINTAIN IDENTITY):
${characterContextParts.join("\n\n")}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { 
      scene_id, 
      project_id, 
      scene_text,
      scene_slugline = "",
      visual_style = "pencil_storyboard",
      storyboard_style = "GRID_SHEET_V1",
      character_refs = [],
      location_ref,
      panel_count,
      beats = [],
      dialogue_blocks = [],
      show_movement_arrows = true,
      aspect_ratio = "16:9",
    }: StoryboardRequest = await req.json();

    if (!scene_id || !project_id || !scene_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id, scene_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine panel count based on style
    const defaultPanelCount = storyboard_style === 'GRID_SHEET_V1' ? 8 : 5;
    const targetPanelCount = panel_count || defaultPanelCount;

    console.log(`[generate-storyboard] Style: ${storyboard_style}, Panels: ${targetPanelCount}`);

    // Build character context WITH Visual DNA
    const characterContext = await buildCharacterDNAContext(supabase, character_refs);

    // Build location context
    const locationContext = location_ref
      ? `Location: ${location_ref.name}
  - Interior/Exterior: ${location_ref.interior_exterior || "unspecified"}
  - Time of Day: ${location_ref.time_of_day || "unspecified"}
  ${location_ref.image_url ? "- Reference image available" : ""}`
      : "Location not specified";

    // Build beats context
    const beatsContext = beats.length > 0
      ? `Scene Beats:\n${beats.map(b => `- ${b.beat_id}: ${b.description}`).join("\n")}`
      : "";

    // Build dialogue context
    const dialogueContext = dialogue_blocks.length > 0
      ? `Key Dialogue:\n${dialogue_blocks.slice(0, 10).map(d => `- ${d.speaker_id}: "${d.text}"`).join("\n")}`
      : "";

    // Select appropriate system prompt based on style
    const systemPrompt = storyboard_style === 'GRID_SHEET_V1' 
      ? STORYBOARD_PLAN_PROMPT_GRID 
      : STORYBOARD_PLAN_PROMPT_TECH;

    const userPrompt = `Create a ${targetPanelCount}-panel storyboard for this film scene.

SCENE: ${scene_slugline || "Untitled Scene"}
${scene_text}

${characterContext}

${locationContext}

${beatsContext}

${dialogueContext}

${show_movement_arrows ? "Include movement_arrows for camera and subject movement." : ""}

Return a JSON object with a "panels" array containing ${targetPanelCount} panels.`;

    // Call Lovable AI for panel structure generation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 12000,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[generate-storyboard] AI error:", errorText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let panelsData: { panels: StoryboardPanel[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        panelsData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (parseError) {
      console.error("[generate-storyboard] Parse error:", parseError, "Content:", content.substring(0, 500));
      throw new Error("Failed to parse storyboard panels from AI response");
    }

    const panels = panelsData.panels || [];
    console.log(`[generate-storyboard] Generated ${panels.length} panels structure`);

    // Upsert storyboards wrapper table
    const { data: storyboardRecord, error: storyboardError } = await supabase
      .from("storyboards")
      .upsert({
        project_id,
        scene_id,
        status: "draft",
        style_id: storyboard_style,
        version: 1,
      }, { onConflict: "project_id,scene_id" })
      .select()
      .single();

    if (storyboardError) {
      console.error("[generate-storyboard] Storyboard upsert error:", storyboardError);
    }

    // Delete existing panels for this scene
    await supabase
      .from("storyboard_panels")
      .delete()
      .eq("scene_id", scene_id);

    // Insert new panels with staging and continuity
    const panelsToInsert = panels.map((panel, idx) => ({
      scene_id,
      project_id,
      panel_no: panel.panel_no || idx + 1,
      panel_code: panel.panel_id || `P${idx + 1}`,
      panel_intent: panel.panel_intent,
      shot_hint: panel.shot_hint,
      image_prompt: buildImagePrompt(panel, storyboard_style, character_refs),
      action_beat_ref: panel.action_beat || null,
      characters_present: panel.characters_present?.map(c => c.character_id) || [],
      props_present: panel.props_present?.map(p => p.prop_id) || [],
      staging: {
        movement_arrows: panel.movement_arrows || [],
        spatial_info: panel.spatial_info || {},
      },
      continuity: {
        visual_dna_lock_ids: character_refs.map(c => c.id),
        must_match_previous: idx > 0,
      },
      image_url: null,
      approved: false,
    }));

    const { data: insertedPanels, error: insertError } = await supabase
      .from("storyboard_panels")
      .insert(panelsToInsert)
      .select();

    if (insertError) {
      console.error("[generate-storyboard] Insert error:", insertError);
      throw insertError;
    }

    console.log(`[generate-storyboard] Inserted ${insertedPanels?.length} panels`);

    // Generate grayscale pencil sketch images for each panel
    const generatedPanels = [];
    for (const panel of insertedPanels || []) {
      try {
        const imagePrompt = storyboard_style === 'GRID_SHEET_V1'
          ? buildGridSheetImagePrompt(panel)
          : buildTechPageImagePrompt(panel);
        
        const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            prompt: imagePrompt,
            n: 1,
            size: "1536x1024",
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageUrl = imageData.data?.[0]?.url;
          
          if (imageUrl) {
            await supabase
              .from("storyboard_panels")
              .update({ image_url: imageUrl })
              .eq("id", panel.id);
            
            generatedPanels.push({ ...panel, image_url: imageUrl });
            console.log(`[generate-storyboard] Generated image for panel ${panel.panel_no}`);
          } else {
            generatedPanels.push(panel);
          }
        } else {
          const errText = await imageResponse.text();
          console.error(`[generate-storyboard] Image generation failed for panel ${panel.panel_no}:`, errText);
          generatedPanels.push(panel);
        }
      } catch (imgError) {
        console.error(`[generate-storyboard] Image error for panel ${panel.panel_no}:`, imgError);
        generatedPanels.push(panel);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        storyboard_id: storyboardRecord?.id,
        storyboard_style,
        panels: generatedPanels,
        message: `Generated ${generatedPanels.length} storyboard panels (${storyboard_style})`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-storyboard] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildImagePrompt(
  panel: StoryboardPanel,
  style: string,
  characterRefs: { id: string; name: string; image_url?: string }[]
): string {
  const charNames = characterRefs.map(c => c.name).join(", ");
  const arrows = panel.movement_arrows?.map(a => `${a.type} movement ${a.direction}`).join(", ") || "";
  
  return `${panel.panel_intent}. Shot: ${panel.shot_hint}. Characters: ${charNames || "none"}. ${arrows ? `Movement: ${arrows}.` : ""}`;
}

function buildGridSheetImagePrompt(panel: any): string {
  const staging = panel.staging as Record<string, any> || {};
  const arrows = staging.movement_arrows || [];
  const arrowsText = arrows.length > 0 
    ? `Include visual movement arrows: ${arrows.map((a: any) => `${a.type} ${a.direction}`).join(", ")}.`
    : "";

  return `Rough pencil storyboard sketch for film production.
Style: Hand-drawn charcoal/pencil on paper, black and white only, grayscale.
Loose expressive lines, visible construction marks, sketch quality.
Classic Hollywood storyboard aesthetic from pre-production.

Panel ${panel.panel_no}: ${panel.shot_hint} shot.
${panel.panel_intent}

${arrowsText}

NO color. NO realistic rendering. NO polish. NO text labels.
This is a WORKING storyboard, not concept art.`;
}

function buildTechPageImagePrompt(panel: any): string {
  return `Technical storyboard frame for film production shooting plan.
Style: Clean pencil sketch with technical precision, black and white, grayscale.
One single frame showing the camera angle and composition.

Shot ${panel.panel_no}: ${panel.shot_hint}
${panel.panel_intent}

Simple, professional, production-ready storyboard frame.
NO color. NO decorative elements.`;
}
