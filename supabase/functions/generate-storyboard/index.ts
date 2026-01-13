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
  character_refs?: { name: string; image_url?: string }[];
  location_ref?: { name: string; image_url?: string };
  panel_count?: number;
}

interface StoryboardPanel {
  panel_no: number;
  panel_intent: string;
  shot_hint: string;
  image_prompt: string;
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
      visual_style = "cinematic realism",
      character_refs = [],
      location_ref,
      panel_count = 8
    }: StoryboardRequest = await req.json();

    if (!scene_id || !project_id || !scene_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id, scene_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-storyboard] Generating ${panel_count} panels for scene ${scene_id}`);

    // Build character context
    const characterContext = character_refs.length > 0
      ? `Characters in scene:\n${character_refs.map(c => `- ${c.name}${c.image_url ? ' (reference available)' : ''}`).join('\n')}`
      : '';

    // Build location context
    const locationContext = location_ref
      ? `Location: ${location_ref.name}${location_ref.image_url ? ' (reference available)' : ''}`
      : '';

    // Director prompt for storyboard generation
    const systemPrompt = `You are a professional storyboard artist and film director. Your task is to break down a scene into ${panel_count} storyboard panels that will guide keyframe generation for AI video production.

For each panel, provide:
1. panel_intent: What story/emotional beat this panel captures (1 sentence)
2. shot_hint: Camera suggestion (e.g., "WIDE establishing", "OTS A favoring character", "INSERT on object", "CU reaction")
3. image_prompt: A detailed visual description for image generation (include: framing, composition, character positions, lighting mood, key props)

Visual Style: ${visual_style}
${characterContext}
${locationContext}

IMPORTANT:
- Distribute panels to cover the full emotional arc of the scene
- Include establishing shot at start, key dialogue moments, reactions, and a closing beat
- Be specific about screen direction (left/right) for characters
- Include lighting and mood descriptions
- Reference specific props or set elements that should be visible`;

    const userPrompt = `Create a ${panel_count}-panel storyboard for this scene:

${scene_text}

Return ONLY a JSON array of panels with this exact structure:
[
  {
    "panel_no": 1,
    "panel_intent": "Establish the space and tension",
    "shot_hint": "WIDE master shot",
    "image_prompt": "Wide shot of dimly lit kitchen, two figures standing at opposite ends of a wooden table, warm practical light from ceiling lamp, tension in their body language, ${visual_style}"
  }
]`;

    // Call Lovable AI for panel generation
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
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
      // Extract JSON array from response
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

    // Delete existing panels for this scene
    await supabase
      .from("storyboard_panels")
      .delete()
      .eq("scene_id", scene_id);

    // Insert new panels
    const panelsToInsert = panels.map((panel, idx) => ({
      scene_id,
      project_id,
      panel_no: panel.panel_no || idx + 1,
      panel_intent: panel.panel_intent,
      shot_hint: panel.shot_hint,
      image_prompt: panel.image_prompt,
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

    // Optionally generate images for each panel (can be done async)
    // For now, return panels without images - images can be generated separately

    return new Response(
      JSON.stringify({
        success: true,
        panels: insertedPanels,
        message: `Generated ${insertedPanels?.length} storyboard panels`,
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
