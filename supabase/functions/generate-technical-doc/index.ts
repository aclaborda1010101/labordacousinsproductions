import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TechnicalDocRequest {
  scene_id: string;
  project_id: string;
  camera_plan_version?: number; // NEW: Use camera plan as input if available
  storyboard_panels?: {
    id: string;
    panel_no: number;
    panel_intent: string;
    shot_hint: string;
    image_prompt: string;
    action_beat_ref?: string;
    characters_present?: string[];
    props_present?: string[];
  }[];
  scene_slugline?: string;
  scene_duration_s?: number;
  visual_style?: string;
  characters_in_scene?: { id: string; name: string }[];
  props_in_scene?: { id: string; name: string }[];
}

// =============================================================================
// CINEMATOGRAPHIC DEFAULTS BY SHOT TYPE
// Pre-fill technical specs based on shot type for faster workflow
// =============================================================================
const CINEMATOGRAPHIC_DEFAULTS: Record<string, {
  focal_mm: number;
  duration_s: [number, number];
  focus: string;
  movement: string;
  aperture: number;
}> = {
  'PG': { focal_mm: 24, duration_s: [6, 10], focus: 'deep', movement: 'dolly_optional', aperture: 5.6 },
  'PM': { focal_mm: 35, duration_s: [5, 8], focus: 'follow', movement: 'static', aperture: 4.0 },
  'PMC': { focal_mm: 50, duration_s: [4, 7], focus: 'follow', movement: 'handheld_subtle', aperture: 2.8 },
  'PP': { focal_mm: 85, duration_s: [3, 6], focus: 'static', movement: 'static', aperture: 2.0 },
  'PPP': { focal_mm: 100, duration_s: [2, 4], focus: 'static', movement: 'static', aperture: 1.8 },
  'INSERT': { focal_mm: 100, duration_s: [2, 4], focus: 'macro', movement: 'static', aperture: 4.0 },
  'OTS': { focal_mm: 50, duration_s: [4, 8], focus: 'rack', movement: 'static', aperture: 2.8 },
  'POV': { focal_mm: 35, duration_s: [3, 6], focus: 'follow', movement: 'handheld', aperture: 4.0 },
  'WIDE': { focal_mm: 24, duration_s: [5, 10], focus: 'deep', movement: 'static', aperture: 5.6 },
  'WIDE_MASTER': { focal_mm: 24, duration_s: [5, 10], focus: 'deep', movement: 'static', aperture: 5.6 },
  'MEDIUM': { focal_mm: 50, duration_s: [4, 7], focus: 'follow', movement: 'static', aperture: 2.8 },
  'CLOSE': { focal_mm: 85, duration_s: [3, 5], focus: 'static', movement: 'static', aperture: 2.0 },
};

// DoP + DirectorTech PROMPT
const DOP_DIRECTOR_SYSTEM_PROMPT = `ROLE: DIRECTOR + DIRECTOR OF PHOTOGRAPHY (DoP)

You convert a Camera Plan (or approved storyboard) into a TECHNICAL SHOT DOCUMENT - the source of truth for AI generation.

GLOBAL CONTINUITY RULES (NON-NEGOTIABLE):
- No wardrobe changes between shots
- No prop mutation (props stay consistent)
- No time-of-day changes within a scene
- Character identity locked (same appearance throughout)

OUTPUT: A valid JSON object with this EXACT structure:

{
  "scene_id": "string",
  "continuity_lock": {
    "enabled": true,
    "wardrobe_lock": true,
    "color_lock": true,
    "time_of_day_lock": true,
    "locked_props": ["prop_id_1", "prop_id_2"]
  },
  "cameras": [
    {
      "camera_id": "CAM_A",
      "role": "OTS_A",
      "sensor": "S35",
      "codec_profile": "internal",
      "lens_default": { "focal_mm": 50, "aperture": 2.8 }
    }
  ],
  "shots": [
    {
      "shot_id": "SC_XXX_001",
      "shot_order": 1,
      "panel_id": "P1",
      "camera_id": "CAM_C",
      "shot_type": "WIDE_MASTER",
      "frame": {
        "size": "PG",
        "aspect_ratio": "2.39:1",
        "composition": "rule_of_thirds",
        "headroom": "normal"
      },
      "blocking": {
        "subjects": [
          { "id": "CHAR_A", "screen_pos": "left", "pose": "standing", "action": "talking" }
        ],
        "props": [
          { "id": "prop_id", "pos": "table_center", "state": "static" }
        ]
      },
      "camera_setup": {
        "position": { "x": 0.0, "y": 1.6, "z": -6.0 },
        "rotation": { "pan": 0, "tilt": -2, "roll": 0 },
        "lens": { "focal_mm": 24, "aperture": 4.0 },
        "stabilization": "tripod"
      },
      "camera_move": {
        "type": "static",
        "path": [],
        "speed": null,
        "easing": null
      },
      "lighting": {
        "look": "day_exterior_soft",
        "key": { "dir": "sun_back_left", "intensity": 0.6, "color_k": 5600 },
        "fill": { "intensity": 0.2 },
        "back": { "intensity": 0.3 },
        "practicals": []
      },
      "focus": {
        "mode": "follow",
        "depth_profile": "medium",
        "events": [
          { "t_s": 0.0, "target": "CHAR_A", "transition_s": 0.2, "type": "hold" }
        ]
      },
      "timing": {
        "start_s": 0.0,
        "end_s": 5.0
      },
      "constraints": {
        "must_keep": ["wardrobe_CHAR_A", "prop_color"],
        "must_not": ["change_time_of_day", "change_wardrobe"],
        "negatives": ["no_new_props", "no_extra_characters", "no_prop_mutation"]
      }
    }
  ]
}

CAMERA MOVE TYPES: static, dolly, crane, arc, handheld, steadicam
FOCUS MODES: follow, rack, deep, static
LIGHTING LOOKS: day_exterior_soft, day_interior_natural, night_interior_practical, golden_hour, overcast, dramatic_contrast

CRITICAL: Every shot MUST include ALL fields. This is the source of truth for keyframe and video generation.`;

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
      camera_plan_version,
      storyboard_panels,
      scene_slugline,
      scene_duration_s = 30,
      visual_style = "cinematic realism",
      characters_in_scene = [],
      props_in_scene = [],
    }: TechnicalDocRequest = await req.json();

    if (!scene_id || !project_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-technical-doc] Processing scene ${scene_id}`);

    // FIRST: Try to use Camera Plan if version specified or exists
    let cameraPlanData: {
      plan_header: Record<string, unknown>;
      shots_list: Array<{
        shot_no: number;
        panel_ref: string;
        shot_label: string;
        shot_type_hint: string;
        framing_hint: string;
        blocking_ref?: string;
        notes?: string;
      }>;
      blocking_diagrams: Array<Record<string, unknown>>;
    } | null = null;

    if (camera_plan_version) {
      const { data: cameraPlan } = await supabase
        .from("scene_camera_plan")
        .select("*")
        .eq("scene_id", scene_id)
        .eq("version", camera_plan_version)
        .single();
      
      if (cameraPlan) {
        cameraPlanData = {
          plan_header: cameraPlan.plan_header as Record<string, unknown>,
          shots_list: cameraPlan.shots_list as Array<{
            shot_no: number;
            panel_ref: string;
            shot_label: string;
            shot_type_hint: string;
            framing_hint: string;
            blocking_ref?: string;
            notes?: string;
          }>,
          blocking_diagrams: cameraPlan.blocking_diagrams as Array<Record<string, unknown>>,
        };
        console.log(`[generate-technical-doc] Using Camera Plan v${camera_plan_version}`);
      }
    } else {
      // Try to get the latest approved/locked camera plan
      const { data: latestCameraPlan } = await supabase
        .from("scene_camera_plan")
        .select("*")
        .eq("scene_id", scene_id)
        .in("status", ["approved", "locked"])
        .order("version", { ascending: false })
        .limit(1);
      
      if (latestCameraPlan && latestCameraPlan.length > 0) {
        cameraPlanData = {
          plan_header: latestCameraPlan[0].plan_header as Record<string, unknown>,
          shots_list: latestCameraPlan[0].shots_list as Array<{
            shot_no: number;
            panel_ref: string;
            shot_label: string;
            shot_type_hint: string;
            framing_hint: string;
            blocking_ref?: string;
            notes?: string;
          }>,
          blocking_diagrams: latestCameraPlan[0].blocking_diagrams as Array<Record<string, unknown>>,
        };
        console.log(`[generate-technical-doc] Using latest Camera Plan v${latestCameraPlan[0].version}`);
      }
    }

    // PRECONDITION: Check storyboard is approved (if no camera plan)
    if (!cameraPlanData) {
      const { data: storyboardData } = await supabase
        .from("storyboards")
        .select("status")
        .eq("scene_id", scene_id)
        .eq("project_id", project_id)
        .single();

      if (storyboardData?.status !== "approved") {
        const { data: panelsData } = await supabase
          .from("storyboard_panels")
          .select("approved")
          .eq("scene_id", scene_id);
        
        const allPanelsApproved = panelsData && panelsData.length > 0 && panelsData.every(p => p.approved);
        
        if (!allPanelsApproved) {
          return new Response(
            JSON.stringify({ 
              error: "Storyboard must be approved before generating Technical Document. Approve at least 1 storyboard panel.",
              success: false 
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Fetch panels if not provided
    let panels = storyboard_panels;
    if (!panels || panels.length === 0) {
      const { data: dbPanels } = await supabase
        .from("storyboard_panels")
        .select("*")
        .eq("scene_id", scene_id)
        .eq("approved", true)
        .order("panel_no", { ascending: true });
      
      panels = (dbPanels || []).map(p => ({
        id: p.id,
        panel_no: p.panel_no,
        panel_intent: p.panel_intent,
        shot_hint: p.shot_hint,
        image_prompt: p.image_prompt,
        action_beat_ref: p.action_beat_ref,
        characters_present: p.characters_present,
        props_present: p.props_present,
      }));
    }

    if ((panels?.length === 0) && !cameraPlanData) {
      return new Response(
        JSON.stringify({ error: "No approved storyboard panels or camera plan found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-technical-doc] Processing ${cameraPlanData ? cameraPlanData.shots_list.length : panels?.length} shots`);

    // Build character and prop context
    const charactersList = characters_in_scene.length > 0
      ? characters_in_scene.map(c => `${c.id}: ${c.name}`).join(", ")
      : "Characters TBD";
    
    const propsList = props_in_scene.length > 0
      ? props_in_scene.map(p => `${p.id}: ${p.name}`).join(", ")
      : "Props TBD";

    // Build source summary - prefer Camera Plan if available
    let sourceSummary: string;
    if (cameraPlanData) {
      const header = cameraPlanData.plan_header;
      sourceSummary = `CAMERA PLAN SOURCE:
SEC: ${header.sec_code || "N/A"}
LOCATION: ${header.location_code || "N/A"}
TIME: ${header.time_context || "N/A"}
LOGLINE: ${header.scene_logline || "N/A"}

SHOTS LIST:
${cameraPlanData.shots_list.map(s => 
  `${s.shot_no}. ${s.panel_ref} | ${s.shot_type_hint} ${s.framing_hint || ""} | ${s.shot_label}${s.notes ? ` (${s.notes})` : ""}`
).join("\n")}

BLOCKING DIAGRAMS: ${cameraPlanData.blocking_diagrams.length} available`;
    } else {
      sourceSummary = `STORYBOARD PANELS:
${(panels || []).map(p => 
  `Panel ${p.panel_no} (${p.id}): ${p.shot_hint} - ${p.panel_intent}
   Characters: ${p.characters_present?.join(", ") || "N/A"}
   Props: ${p.props_present?.join(", ") || "N/A"}`
).join("\n\n")}`;
    }

    const userPrompt = `Create a COMPLETE technical document for this scene.

SCENE: ${scene_slugline || "Untitled Scene"}
DURATION: ~${scene_duration_s}s
VISUAL STYLE: ${visual_style}
CHARACTERS: ${charactersList}
PROPS: ${propsList}

${sourceSummary}

CINEMATOGRAPHIC DEFAULTS TO USE (by shot type):
- PG/WIDE: 24mm, f/5.6, deep focus, 6-10s
- PM/MEDIUM: 35-50mm, f/4.0, follow focus, 5-8s
- PMC: 50mm, f/2.8, follow focus, 4-7s
- PP/CLOSE: 85mm, f/2.0, static focus, 3-6s
- INSERT: 100mm, f/4.0, macro, 2-4s
- OTS: 50mm, f/2.8, rack focus, 4-8s

Generate a technical document with:
1. continuity_lock - what must remain consistent
2. cameras - array of camera setups
3. shots - one shot per panel/camera plan entry, each with COMPLETE specs

Return ONLY valid JSON matching the schema.`;

    // Call Lovable AI with GPT-5.2 for complex reasoning
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: DOP_DIRECTOR_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_completion_tokens: 16000,
        response_format: { type: "json_object" },
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
      scene_id?: string;
      continuity_lock: {
        enabled: boolean;
        wardrobe_lock: boolean;
        color_lock: boolean;
        time_of_day_lock: boolean;
        locked_props: string[];
      };
      cameras: Array<{
        camera_id: string;
        role: string;
        sensor?: string;
        codec_profile?: string;
        lens_default: { focal_mm: number; aperture: number };
      }>;
      shots: Array<{
        shot_id: string;
        shot_order: number;
        panel_id: string;
        camera_id: string;
        shot_type: string;
        frame: { size: string; aspect_ratio: string; composition: string; headroom?: string };
        blocking: { subjects: unknown[]; props: unknown[] };
        camera_setup: { position: unknown; rotation: unknown; lens: { focal_mm?: number; aperture?: number }; stabilization?: string };
        camera_move: { type: string; path: unknown[]; speed: string | null; easing: string | null };
        lighting: { look: string; key: unknown; fill: unknown; back: unknown; practicals?: unknown[] };
        focus: { mode: string; depth_profile?: string; events: unknown[] };
        timing: { start_s: number; end_s: number };
        constraints: { must_keep: string[]; must_not: string[]; negatives: string[] };
      }>;
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

    // Apply cinematographic defaults where AI didn't specify
    for (const shot of technicalDoc.shots || []) {
      const shotType = shot.frame?.size || shot.shot_type || "PM";
      const defaults = CINEMATOGRAPHIC_DEFAULTS[shotType] || CINEMATOGRAPHIC_DEFAULTS["PM"];
      
      // Fill in defaults if not specified
      if (!shot.camera_setup?.lens?.focal_mm) {
        shot.camera_setup = shot.camera_setup || { position: {}, rotation: {}, lens: {} };
        shot.camera_setup.lens = shot.camera_setup.lens || {};
        shot.camera_setup.lens.focal_mm = defaults.focal_mm;
        shot.camera_setup.lens.aperture = defaults.aperture;
      }
      
      if (!shot.focus?.mode) {
        shot.focus = shot.focus || { mode: defaults.focus, events: [] };
        shot.focus.mode = defaults.focus;
      }
      
      if (!shot.camera_move?.type) {
        shot.camera_move = { type: defaults.movement, path: [], speed: null, easing: null };
      }
    }

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

    // Map panels to their IDs for shot linking
    const panelIdMap = new Map((panels || []).map(p => [p.panel_no, p.id]));

    // Delete existing shots for this scene
    await supabase.from("shots").delete().eq("scene_id", scene_id);

    // Prepare shots for insertion with FULL technical data
    const shotsToUpsert = (technicalDoc.shots || []).map((shot, idx) => {
      const panelNum = parseInt(shot.panel_id?.replace(/\D/g, "") || String(idx + 1));
      const shotType = shot.frame?.size || shot.shot_type || "PM";
      const defaults = CINEMATOGRAPHIC_DEFAULTS[shotType] || CINEMATOGRAPHIC_DEFAULTS["PM"];
      
      return {
        scene_id,
        // Note: project_id is not a column in shots table - scene_id links to project via scenes
        shot_no: shot.shot_order || idx + 1,
        shot_type: shot.shot_type || "WIDE",
        camera: {
          id: shot.camera_id,
          focal_mm: shot.camera_setup?.lens?.focal_mm || defaults.focal_mm,
          aperture: shot.camera_setup?.lens?.aperture || defaults.aperture,
        },
        blocking: shot.blocking || { subjects: [], props: [] },
        lighting: shot.lighting || { look: "natural" },
        keyframe_hints: [],
        focus_config: shot.focus,
        timing_config: shot.timing,
        camera_path: shot.camera_move,
        camera_position: shot.camera_setup?.position,
        camera_rotation: shot.camera_setup?.rotation,
        constraints: shot.constraints,
        frame_config: shot.frame,
        storyboard_panel_id: panelIdMap.get(panelNum) || null,
        duration_target: shot.timing ? (shot.timing.end_s - shot.timing.start_s) : defaults.duration_s[0],
      };
    });

    // Insert new shots
    const { data: insertedShots, error: shotsError } = await supabase
      .from("shots")
      .insert(shotsToUpsert)
      .select();

    if (shotsError) {
      console.error("[generate-technical-doc] Shots insert error:", shotsError);
      throw shotsError;
    }

    console.log(`[generate-technical-doc] Inserted ${insertedShots?.length} shots with cinematographic defaults`);

    return new Response(
      JSON.stringify({
        success: true,
        technical_doc: techDoc,
        shots: insertedShots,
        used_camera_plan: !!cameraPlanData,
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
