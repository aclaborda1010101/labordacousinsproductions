import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TechnicalDocRequest {
  scene_id: string;
  project_id: string;
  storyboard_panels: {
    id: string;
    panel_no: number;
    panel_intent: string;
    shot_hint: string;
    image_prompt: string;
  }[];
  scene_slugline: string;
  scene_duration_s?: number;
  visual_style?: string;
  characters_in_scene?: string[];
  props_in_scene?: string[];
}

interface CameraSetup {
  camera_id: string;
  role: string;
  sensor: string;
  codec_profile: string;
  lens_default: { focal_mm: number; aperture: number };
}

interface TechnicalShot {
  shot_id: string;
  shot_order: number;
  panel_id: string;
  camera_id: string;
  shot_type: string;
  frame: {
    size: string;
    composition: string;
    headroom: string;
    aspect_ratio: string;
  };
  blocking: {
    subjects: { id: string; screen_pos: string; pose: string; action: string }[];
    props: { id: string; pos: string; state: string }[];
  };
  camera_position: { x: number; y: number; z: number };
  camera_rotation: { pan: number; tilt: number; roll: number };
  camera_path: { type: string; path: any[]; speed: string | null; easing: string | null };
  lighting: {
    look: string;
    key: { dir: string; intensity: number; color_k: number };
    fill: { intensity: number };
    back: { intensity: number };
    practicals: string[];
  };
  focus_config: {
    mode: string;
    base_distance_m: number;
    depth_profile: string;
    events: { t_s: number; target: string; transition_s: number; type: string }[];
  };
  timing_config: {
    start_s: number;
    end_s: number;
    beats: { t_s: number; type: string; ref: string }[];
  };
  constraints: {
    must_keep: string[];
    must_not: string[];
    negatives: string[];
  };
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
      storyboard_panels,
      scene_slugline,
      scene_duration_s = 30,
      visual_style = "cinematic realism",
      characters_in_scene = [],
      props_in_scene = [],
    }: TechnicalDocRequest = await req.json();

    if (!scene_id || !project_id || !storyboard_panels?.length) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-technical-doc] Processing ${storyboard_panels.length} panels for scene ${scene_id}`);

    // Build the DoP prompt
    const systemPrompt = `You are a Director of Photography (DoP) creating a detailed technical document for a scene. Based on storyboard panels, you must specify exact camera, lighting, focus, and timing for each shot.

Scene: ${scene_slugline}
Duration: ~${scene_duration_s}s
Visual Style: ${visual_style}
Characters: ${characters_in_scene.join(', ') || 'TBD'}
Props: ${props_in_scene.join(', ') || 'TBD'}

For the scene setup, define:
1. cameras: Array of camera setups (typically CAM_A for OTS_A, CAM_B for OTS_B, CAM_C for WIDE)
2. continuity_lock: What must remain consistent

For each shot, specify:
- camera_id, shot_type, frame (size, composition)
- blocking (subject positions, props)
- camera_position (x,y,z), camera_rotation (pan,tilt,roll)
- camera_path (type: static/dolly/crane/handheld, speed, easing)
- lighting (look, key/fill/back, practicals)
- focus_config (mode, events for rack focus)
- timing_config (start_s, end_s, beats for dialogue/action)
- constraints (must_keep, must_not, negatives for AI generation)`;

    const panelsSummary = storyboard_panels.map(p => 
      `Panel ${p.panel_no}: ${p.shot_hint} - ${p.panel_intent}`
    ).join('\n');

    const userPrompt = `Create a technical document for these storyboard panels:

${panelsSummary}

Return JSON with this structure:
{
  "cameras": [
    {"camera_id": "CAM_A", "role": "OTS_A", "sensor": "S35", "codec_profile": "internal", "lens_default": {"focal_mm": 50, "aperture": 2.8}}
  ],
  "continuity_lock": {
    "enabled": true,
    "locked_props": [],
    "wardrobe_lock": true,
    "color_lock": true,
    "time_of_day_lock": true
  },
  "shots": [
    {
      "shot_id": "S001",
      "shot_order": 1,
      "panel_id": "${storyboard_panels[0]?.id || 'panel_1'}",
      "camera_id": "CAM_C",
      "shot_type": "WIDE_MASTER",
      "frame": {"size": "PG", "composition": "rule_of_thirds", "headroom": "normal", "aspect_ratio": "2.39:1"},
      "blocking": {"subjects": [], "props": []},
      "camera_position": {"x": 0, "y": 1.5, "z": -4},
      "camera_rotation": {"pan": 0, "tilt": 0, "roll": 0},
      "camera_path": {"type": "static", "path": [], "speed": null, "easing": null},
      "lighting": {"look": "soft_natural", "key": {"dir": "window", "intensity": 0.7, "color_k": 5200}, "fill": {"intensity": 0.3}, "back": {"intensity": 0.2}, "practicals": []},
      "focus_config": {"mode": "follow", "base_distance_m": 4, "depth_profile": "deep", "events": []},
      "timing_config": {"start_s": 0, "end_s": 4, "beats": []},
      "constraints": {"must_keep": [], "must_not": ["change_wardrobe"], "negatives": ["extra_characters", "prop_mutation"]}
    }
  ]
}`;

    // Call Lovable AI
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
        temperature: 0.5,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("[generate-technical-doc] AI error:", errorText);
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let technicalDoc: {
      cameras: CameraSetup[];
      continuity_lock: any;
      shots: TechnicalShot[];
    };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        technicalDoc = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (parseError) {
      console.error("[generate-technical-doc] Parse error:", parseError);
      throw new Error("Failed to parse technical document from AI response");
    }

    console.log(`[generate-technical-doc] Generated doc with ${technicalDoc.shots?.length || 0} shots`);

    // Upsert scene_technical_docs
    const { data: techDoc, error: docError } = await supabase
      .from("scene_technical_docs")
      .upsert({
        scene_id,
        project_id,
        visual_style: { style_id: visual_style, references: {} },
        cameras: technicalDoc.cameras || [],
        continuity_lock: technicalDoc.continuity_lock || {
          enabled: true,
          locked_props: [],
          wardrobe_lock: true,
          color_lock: true,
          time_of_day_lock: true,
        },
        edit_plan: { mode: "assisted", recommended_cut_points: [] },
        status: "draft",
        version: 1,
      }, { onConflict: "scene_id" })
      .select()
      .single();

    if (docError) {
      console.error("[generate-technical-doc] Doc insert error:", docError);
      throw docError;
    }

    // Map panels to their IDs
    const panelIdMap = new Map(storyboard_panels.map(p => [p.panel_no, p.id]));

    // Prepare shots for insertion
    const shotsToUpsert = (technicalDoc.shots || []).map((shot, idx) => ({
      scene_id,
      project_id,
      shot_no: shot.shot_order || idx + 1,
      shot_type: shot.shot_type || "WIDE",
      camera: {
        id: shot.camera_id,
        focal_mm: shot.frame?.size === "CU" ? 85 : shot.frame?.size === "PG" ? 24 : 50,
        aperture: 2.8,
      },
      blocking: shot.blocking || { subjects: [], props: [] },
      lighting: shot.lighting || { look: "natural" },
      keyframe_hints: [],
      // New technical doc fields
      focus_config: shot.focus_config,
      timing_config: shot.timing_config,
      camera_path: shot.camera_path,
      camera_position: shot.camera_position,
      camera_rotation: shot.camera_rotation,
      constraints: shot.constraints,
      storyboard_panel_id: shot.panel_id ? panelIdMap.get(parseInt(shot.panel_id.replace('panel_', ''))) : null,
    }));

    // Delete existing shots for this scene
    await supabase.from("shots").delete().eq("scene_id", scene_id);

    // Insert new shots
    const { data: insertedShots, error: shotsError } = await supabase
      .from("shots")
      .insert(shotsToUpsert)
      .select();

    if (shotsError) {
      console.error("[generate-technical-doc] Shots insert error:", shotsError);
      throw shotsError;
    }

    console.log(`[generate-technical-doc] Inserted ${insertedShots?.length} shots`);

    return new Response(
      JSON.stringify({
        success: true,
        technical_doc: techDoc,
        shots: insertedShots,
        message: `Generated technical document with ${insertedShots?.length} shots`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-technical-doc] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
