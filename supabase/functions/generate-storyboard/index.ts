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
  visual_style?: string;
  character_refs?: { id: string; name: string; image_url?: string }[];
  location_ref?: { id: string; name: string; image_url?: string };
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
}

// DIRECTOR (IA 2) PROMPT - Official from pipeline spec
const DIRECTOR_SYSTEM_PROMPT = `ROLE: DIRECTOR

You create professional storyboards for film production. Your storyboard will guide the DoP and keyframe generation.

STYLE: Pencil sketch, grayscale, rough storyboard look, like film storyboard sheets. Classic Hollywood pre-production aesthetic.

OUTPUT FORMAT: JSON array of 6-12 panels.

For each panel, provide:
- panel_id: Sequential identifier (P1, P2, P3...)
- panel_no: Panel number (1, 2, 3...)
- intent: What story/emotional beat this panel captures (1 sentence)
- shot_hint: Camera suggestion (PG = Plan General/Wide, PM = Plano Medio/Medium, PP = Primer Plano/Close-up, INSERT, OTS)
- action_beat_ref: Reference to beat_id if applicable
- characters_present: Array of character IDs present in this panel
- props_present: Array of prop IDs visible in this panel
- image_prompt: Detailed visual description for grayscale pencil sketch generation

CRITICAL RULES:
1. Maintain strict continuity: same characters, same props, same time of day across all panels
2. Cover the full emotional arc: establishing shot at start, key dialogue moments, reactions, closing beat
3. Be specific about screen direction (left/right) for characters
4. Include character positions, blocking, eyelines
5. NO lens/lighting/focus technical specs - that's for the DoP in Paso 3
6. The image_prompt MUST describe a GRAYSCALE PENCIL SKETCH, not a photorealistic image

Return ONLY a valid JSON array, no explanations.`;

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
      visual_style = "pencil_storyboard_grayscale",
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

    // Build context from characters and location
    const characterContext = character_refs.length > 0
      ? `Characters in scene:\n${character_refs.map(c => `- ${c.name} (ID: ${c.id})${c.image_url ? ' [reference available]' : ''}`).join('\n')}`
      : 'No characters specified';

    const locationContext = location_ref
      ? `Location: ${location_ref.name} (ID: ${location_ref.id})${location_ref.image_url ? ' [reference available]' : ''}`
      : 'Location not specified';

    const beatsContext = beats.length > 0
      ? `Scene beats:\n${beats.map(b => `- ${b.beat_id}: ${b.description}`).join('\n')}`
      : '';

    const dialogueContext = dialogue_blocks.length > 0
      ? `Key dialogue:\n${dialogue_blocks.slice(0, 10).map(d => `- ${d.speaker_id}: "${d.text}"`).join('\n')}`
      : '';

    const userPrompt = `Create a ${panel_count}-panel storyboard for this scene:

SCENE TEXT:
${scene_text}

${characterContext}

${locationContext}

${beatsContext}

${dialogueContext}

STYLE: Pencil storyboard grayscale - rough sketch look like classic film storyboard sheets.

Return a JSON array with ${panel_count} panels. Each panel must include:
- panel_id (P1, P2...)
- panel_no (1, 2...)
- intent (what this moment conveys)
- shot_hint (PG/PM/PP/INSERT/OTS)
- action_beat_ref (reference to beat if applicable)
- characters_present (array of character IDs)
- props_present (array of prop IDs)
- image_prompt (detailed description for pencil sketch image generation - MUST describe grayscale pencil sketch aesthetic)`;

    // Call Lovable AI for panel generation (using gemini for reasoning)
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: DIRECTOR_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 8000,
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
      console.error("[generate-storyboard] Parse error:", parseError, "Content:", content);
      throw new Error("Failed to parse storyboard panels from AI response");
    }

    console.log(`[generate-storyboard] Generated ${panels.length} panels`);

    // Upsert storyboards wrapper table (status management)
    const { data: storyboardRecord, error: storyboardError } = await supabase
      .from("storyboards")
      .upsert({
        project_id,
        scene_id,
        status: "draft",
        style_id: visual_style,
        version: 1,
      }, { onConflict: "project_id,scene_id" })
      .select()
      .single();

    if (storyboardError) {
      console.error("[generate-storyboard] Storyboard upsert error:", storyboardError);
      // Continue even if wrapper fails - panels are more important
    }

    // Delete existing panels for this scene
    await supabase
      .from("storyboard_panels")
      .delete()
      .eq("scene_id", scene_id);

    // Insert new panels with all new fields
    const panelsToInsert = panels.map((panel, idx) => ({
      scene_id,
      project_id,
      panel_no: panel.panel_no || idx + 1,
      panel_intent: panel.intent,
      shot_hint: panel.shot_hint,
      image_prompt: panel.image_prompt,
      action_beat_ref: panel.action_beat_ref || null,
      characters_present: panel.characters_present || [],
      props_present: panel.props_present || [],
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

    // Generate grayscale pencil sketch images for each panel using NanoBanana Pro 3
    const generatedPanels = [];
    for (const panel of insertedPanels || []) {
      try {
        // Enhance prompt for grayscale pencil sketch style
        const sketchPrompt = `Grayscale pencil sketch storyboard panel. Film production storyboard style. Rough sketch lines, hand-drawn aesthetic. ${panel.image_prompt}. Pencil on paper texture, black and white, no color, cinematic framing.`;
        
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
            size: "1536x1024",
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          const imageUrl = imageData.data?.[0]?.url;
          
          if (imageUrl) {
            // Update panel with image
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
          console.error(`[generate-storyboard] Image generation failed for panel ${panel.panel_no}`);
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
        message: `Generated ${generatedPanels.length} storyboard panels with pencil sketch style`,
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
