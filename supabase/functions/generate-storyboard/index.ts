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
  character_refs?: { id: string; name: string; image_url?: string }[];
  location_ref?: { id: string; name: string; image_url?: string; interior_exterior?: string; time_of_day?: string };
  panel_count?: number;
  beats?: { beat_id: string; description: string }[];
  dialogue_blocks?: { line_id: string; speaker_id: string; text: string }[];
}

interface StoryboardPanel {
  panel_id: string;
  panel_no: number;
  intent: string;
  shot_hint: string;
  action_beat_ref?: string;
  characters_present: string[];
  props_present: string[];
  image_prompt: string;
  staging?: {
    location_zone?: string;
    action_beat?: string;
    movement_arrows?: { type: string; target?: string; direction: string; intensity?: string }[];
  };
}

// =============================================================================
// PROFESSIONAL STORYBOARD ARTIST SYSTEM PROMPT
// =============================================================================
// This prompt enforces the MANDATORY visual style: pencil/charcoal sketch,
// black and white only, rough storyboard look with movement arrows.
// NOT concept art, NOT illustration, NOT beautiful renders.
// =============================================================================
const STORYBOARD_ARTIST_SYSTEM_PROMPT = `ROLE: PROFESSIONAL FILM STORYBOARD ARTIST

You are a storyboard artist working in pre-production for a film or TV production.
Your storyboards will be used by the Director and DoP to plan camera setups.

STYLE (MANDATORY - NO EXCEPTIONS):
- Rough pencil / charcoal sketches ONLY
- Black and white / grayscale ONLY
- Loose expressive lines, visible construction marks
- Sketch-like quality, NOT polished illustration
- Hand-drawn aesthetic like real film production storyboards
- No color whatsoever
- No realistic rendering
- No illustration polish
- No cinematic lighting effects in the image
- No text overlays or captions inside the image

VISUAL COMMUNICATION REQUIREMENTS:
- Clear framing and composition
- Camera angle implied by perspective
- Character placement and blocking (positions in frame)
- Movement arrows for camera moves (PAN →, TRACK ↓, DOLLY IN ↗)
- Movement arrows for character actions (walking, gesturing)
- Depth staging (foreground/midground/background)
- Eyelines and screen direction consistency (180° rule)

This is a TECHNICAL STORYBOARD for film production, NOT concept art.
The storyboard is a planning tool, not the final visual product.

OUTPUT FORMAT: JSON array of 6-12 panels.

For each panel, provide:
- panel_id: Sequential identifier (P1, P2, P3...)
- panel_no: Panel number (1, 2, 3...)
- intent: What story/emotional beat this panel captures (1 sentence)
- shot_hint: Camera suggestion (PG = Wide/Establishing, PM = Medium, PMC = Medium Close, PP = Close-up, INSERT, OTS)
- action_beat_ref: Reference to beat_id if applicable
- characters_present: Array of character IDs present in this panel
- props_present: Array of prop IDs visible in this panel
- image_prompt: Detailed visual description for GRAYSCALE PENCIL SKETCH generation (include "rough pencil storyboard sketch, black and white, charcoal lines")
- staging: Object with { location_zone, action_beat, movement_arrows[] }

CRITICAL:
1. ALWAYS maintain character identity from the provided Visual DNA
2. Use the character's age, body type, hair, and recognizable features
3. Simplify to storyboard sketch level but KEEP RECOGNIZABLE
4. Never redesign or reinvent characters
5. Include movement arrows in image_prompt when camera or characters move

Return ONLY a valid JSON array, no explanations.`;

// =============================================================================
// CHARACTER VISUAL DNA INJECTION
// Ensures storyboard respects approved character designs
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
      // Fetch character with visual DNA
      const { data: charData } = await supabaseClient
        .from("characters")
        .select(`
          name,
          bio,
          visual_dna,
          character_role,
          profile_json
        `)
        .eq("id", char.id)
        .single();

      if (charData) {
        const visualDna = charData.visual_dna as Record<string, any> | null;
        const profile = charData.profile_json as Record<string, any> | null;

        // Build detailed character description for storyboard artist
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
          // Fallback to profile_json if no visual_dna
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
      character_refs = [],
      location_ref,
      panel_count = 8,
      beats = [],
      dialogue_blocks = [],
    }: StoryboardRequest = await req.json();

    if (!scene_id || !project_id || !scene_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id, scene_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-storyboard] Generating ${panel_count} panels for scene ${scene_id}`);
    console.log(`[generate-storyboard] Style: ${visual_style} (forcing pencil sketch B&W)`);

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

    // Build dialogue context (first 10 lines)
    const dialogueContext = dialogue_blocks.length > 0
      ? `Key Dialogue:\n${dialogue_blocks.slice(0, 10).map(d => `- ${d.speaker_id}: "${d.text}"`).join("\n")}`
      : "";

    // Build the user prompt with ALL context
    const userPrompt = `Create a ${panel_count}-panel storyboard for this film scene.

SCENE: ${scene_slugline || "Untitled Scene"}
${scene_text}

${characterContext}

${locationContext}

${beatsContext}

${dialogueContext}

MANDATORY STYLE:
- Rough pencil storyboard sketch
- Black and white / grayscale only
- Charcoal/pencil lines, visible construction
- Include movement arrows (→ ↓ ↗) for camera or character movement
- NOT color, NOT realistic, NOT illustrative, NOT polished

Each panel's image_prompt MUST explicitly include:
"Rough pencil storyboard sketch, black and white, charcoal lines on paper, hand-drawn production storyboard style"

Return a JSON array with ${panel_count} panels.`;

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
          { role: "system", content: STORYBOARD_ARTIST_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 12000,
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
    let panels: StoryboardPanel[] = [];
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        panels = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON array found in response");
      }
    } catch (parseError) {
      console.error("[generate-storyboard] Parse error:", parseError, "Content:", content.substring(0, 500));
      throw new Error("Failed to parse storyboard panels from AI response");
    }

    console.log(`[generate-storyboard] Generated ${panels.length} panels structure`);

    // Upsert storyboards wrapper table
    const { data: storyboardRecord, error: storyboardError } = await supabase
      .from("storyboards")
      .upsert({
        project_id,
        scene_id,
        status: "draft",
        style_id: "pencil_storyboard", // Always force pencil style
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
      panel_intent: panel.intent,
      shot_hint: panel.shot_hint,
      image_prompt: panel.image_prompt,
      action_beat_ref: panel.action_beat_ref || null,
      characters_present: panel.characters_present || [],
      props_present: panel.props_present || [],
      staging: panel.staging || {},
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
        // Build the DEFINITIVE pencil sketch prompt
        // This is the professional storyboard look: rough, B&W, with arrows
        const sketchPrompt = `Rough pencil storyboard sketch for film production.
Style: Hand-drawn charcoal/pencil on paper, black and white only, grayscale.
Loose expressive lines, visible construction marks, sketch quality.
Classic Hollywood storyboard aesthetic from pre-production.

Scene content: ${panel.image_prompt}

Include visual movement arrows if the scene involves camera or character movement.
NO color. NO realistic rendering. NO polish. NO text labels.
This is a WORKING storyboard, not concept art.`;
        
        const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-pro-image-preview",
            prompt: sketchPrompt,
            n: 1,
            size: "1536x1024", // 16:9-ish aspect
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
            console.log(`[generate-storyboard] Generated pencil sketch for panel ${panel.panel_no}`);
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
        panels: generatedPanels,
        style: "pencil_storyboard",
        message: `Generated ${generatedPanels.length} storyboard panels in pencil sketch style (B&W)`,
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
