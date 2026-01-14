import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CameraPlanRequest {
  scene_id: string;
  project_id: string;
}

// =============================================================================
// CAMERA PLAN GENERATOR - 1st AD / Script Supervisor Role
// =============================================================================
// This function creates the "Camera Plan" document from an approved storyboard.
// The Camera Plan is the intermediate step between Storyboard and Technical Doc.
// It contains:
//   - plan_header (SEC_XXX, location code, scene logline)
//   - shots_list (01..n with shot labels, type hints, blocking refs)
//   - blocking_diagrams (top-view diagrams for complex setups)
// =============================================================================

const CAMERA_PLAN_SYSTEM_PROMPT = `ROLE: 1st AD / Script Supervisor

You are creating a CAMERA PLAN from an approved storyboard. This document will be used by the DoP to set up shots.

OUTPUT: A JSON object with this structure:

{
  "plan_header": {
    "sec_code": "SEC_001",
    "location_code": "LOC_XXX",
    "set_code": "SET_XXX",
    "time_context": "INT/DÍA",
    "scene_logline": "Brief description of the scene"
  },
  "shots_list": [
    {
      "shot_no": 1,
      "panel_ref": "P1",
      "shot_label": "PMC lateral driver, weapons in foreground",
      "shot_type_hint": "PMC",
      "framing_hint": "lateral",
      "blocking_ref": "B1",
      "notes": "Optional notes for DoP"
    }
  ],
  "blocking_diagrams": [
    {
      "blocking_id": "B1",
      "type": "top_view",
      "frame_shape": "room",
      "entities": [
        { "kind": "character", "id": "CHAR_A", "label": "A", "pos": { "x": 0.3, "y": 0.5 } }
      ],
      "camera_marks": [
        { "cam_id": "C1", "shot_no": 1, "pos": { "x": 0.8, "y": 0.5 }, "aim": { "x": 0.3, "y": 0.5 } }
      ],
      "movement_arrows": [
        { "type": "character", "id": "CHAR_A", "from": { "x": 0.3, "y": 0.5 }, "to": { "x": 0.5, "y": 0.5 } }
      ]
    }
  ]
}

SHOT TYPE HINTS:
- PG: Plan General / Wide / Establishing (24-35mm)
- PM: Plano Medio / Medium (35-50mm)
- PMC: Plano Medio Corto / Medium Close (50mm)
- PP: Primer Plano / Close-up (85mm+)
- PPP: Primerísimo Primer Plano / Extreme Close-up (100mm+)
- INSERT: Detail shot of object/prop
- OTS: Over the Shoulder (dialogue coverage)
- POV: Point of View shot

FRAMING HINTS:
- frontal, lateral, 3/4, profile, top, low_angle, high_angle, dutch, escorzo

FRAME SHAPES for blocking diagrams:
- room: Standard interior
- vehicle_interior: Car/bus/train interior
- exterior: Outdoor scene
- table: Conversation around a table
- corridor: Narrow space

RULES:
1. One shot per storyboard panel (shot_no matches panel order)
2. Maintain 180° rule for dialogue scenes
3. Group OTS shots by axis (A-side / B-side)
4. Generate blocking diagrams ONLY for:
   - Vehicle interiors
   - Dialogue scenes with 2+ characters
   - Complex action sequences
   - Scenes with significant character movement
5. Use normalized coordinates (0.0 to 1.0) for positions in blocking diagrams

Return ONLY valid JSON. No explanations.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { scene_id, project_id }: CameraPlanRequest = await req.json();

    if (!scene_id || !project_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-camera-plan] Processing scene ${scene_id}`);

    // PRECONDITION: Check if storyboard has approved panels
    const { data: panels, error: panelsError } = await supabase
      .from("storyboard_panels")
      .select("*")
      .eq("scene_id", scene_id)
      .eq("approved", true)
      .order("panel_no", { ascending: true });

    if (panelsError) {
      throw new Error(`Failed to fetch storyboard panels: ${panelsError.message}`);
    }

    if (!panels || panels.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No approved storyboard panels found. Approve at least 1 panel before generating Camera Plan.",
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-camera-plan] Found ${panels.length} approved panels`);

    // Fetch scene details
    const { data: sceneData } = await supabase
      .from("scenes")
      .select("slugline, summary, location_id, character_ids, time_of_day, interior_exterior")
      .eq("id", scene_id)
      .single();

    // Fetch location details
    let locationInfo = "Unknown location";
    if (sceneData?.location_id) {
      const { data: locData } = await supabase
        .from("locations")
        .select("name, location_type")
        .eq("id", sceneData.location_id)
        .single();
      
      if (locData) {
        locationInfo = `${locData.name} (${locData.location_type || "unspecified"})`;
      }
    }

    // Fetch character names
    const characterNames: Record<string, string> = {};
    if (sceneData?.character_ids && sceneData.character_ids.length > 0) {
      const { data: charsData } = await supabase
        .from("characters")
        .select("id, name")
        .in("id", sceneData.character_ids);
      
      for (const char of charsData || []) {
        characterNames[char.id] = char.name;
      }
    }

    // Build COMPACT panels summary for the prompt (avoid "prompt too long")
    const panelsCompact = panels.map((p: any) => ({
      panel_no: p.panel_no,
      panel_code: p.panel_code || `P${p.panel_no}`,
      shot_hint: p.shot_hint || 'PM',
      intent: p.panel_intent || '',
      chars: (p.characters_present || []).map((cid: string) => characterNames[cid] || cid),
      props: p.props_present || [],
      staging: p.staging ? {
        axis_180: (p.staging as any).axis_180 ?? null,
        movement: (p.staging as any).movement_arrows ?? null,
      } : null,
    }));

    const panelsSummary = JSON.stringify(panelsCompact, null, 2);

    const userPrompt = `Create a CAMERA PLAN for this scene.

SCENE: ${sceneData?.slugline || "Untitled"}
LOCATION: ${locationInfo}
TIME: ${sceneData?.interior_exterior || "INT"} / ${sceneData?.time_of_day || "DÍA"}
SUMMARY: ${sceneData?.summary || "No summary available"}

APPROVED STORYBOARD PANELS (compact JSON):
${panelsSummary}

Generate:
1. plan_header with sec_code, location_code, time_context, scene_logline
2. shots_list with one shot per panel (shot_no, panel_ref, shot_label, shot_type_hint, framing_hint, blocking_ref if needed, notes)
3. blocking_diagrams ONLY if needed (vehicle interior, dialogue, complex blocking)

Return ONLY valid JSON.`;

    // ==========================================================================
    // ROBUST AI CALLER with full logging + fallback
    // ==========================================================================
    const doAIFetch = async (payload: any, label: string) => {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const raw = await res.text();
      console.log(`[CAMPLAN] ${label} status`, res.status);
      console.log(`[CAMPLAN] ${label} body_head`, raw.slice(0, 1200));

      if (!res.ok) {
        return { ok: false as const, status: res.status, raw };
      }

      try {
        const data = JSON.parse(raw);
        return { ok: true as const, data };
      } catch {
        return { ok: false as const, status: 500, raw: `Non-JSON: ${raw.slice(0, 1200)}` };
      }
    };

    // Attempt A: with response_format (preferred for structured JSON)
    const payloadA = {
      model: "openai/gpt-5.2",
      temperature: 0.3,
      max_completion_tokens: 8000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CAMERA_PLAN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    };

    let aiResult = await doAIFetch(payloadA, "payloadA");

    // Fallback B: without response_format (ultra-compatible)
    if (!aiResult.ok) {
      console.log("[CAMPLAN] payloadA failed, trying payloadB fallback");
      const payloadB = {
        model: "openai/gpt-5.2",
        temperature: 0.3,
        max_completion_tokens: 8000,
        messages: [
          { role: "system", content: CAMERA_PLAN_SYSTEM_PROMPT },
          { role: "user", content: userPrompt + "\n\nReturn ONLY valid JSON. No markdown, no explanations." },
        ],
      };

      aiResult = await doAIFetch(payloadB, "payloadB");
    }

    // If both failed, throw with REAL error details
    if (!aiResult.ok) {
      throw new Error(`AI generation failed: status=${aiResult.status} body=${aiResult.raw.slice(0, 600)}`);
    }

    const content = aiResult.data?.choices?.[0]?.message?.content || "";

    // Parse the camera plan
    let cameraPlan: {
      plan_header: {
        sec_code: string;
        location_code: string;
        set_code?: string;
        time_context: string;
        scene_logline: string;
      };
      shots_list: Array<{
        shot_no: number;
        panel_ref: string;
        shot_label: string;
        shot_type_hint: string;
        framing_hint: string;
        blocking_ref?: string;
        notes?: string;
      }>;
      blocking_diagrams: Array<{
        blocking_id: string;
        type: string;
        frame_shape: string;
        entities: Array<{ kind: string; id: string; label: string; pos: { x: number; y: number } }>;
        camera_marks: Array<{ cam_id: string; shot_no: number; pos: { x: number; y: number }; aim: { x: number; y: number } }>;
        movement_arrows: Array<{ type: string; id?: string; from: { x: number; y: number }; to: { x: number; y: number } }>;
      }>;
    };

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cameraPlan = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (parseError) {
      console.error("[generate-camera-plan] Parse error:", parseError);
      throw new Error("Failed to parse camera plan from AI response");
    }

    console.log(`[generate-camera-plan] Generated plan with ${cameraPlan.shots_list?.length || 0} shots`);

    // Get current version
    const { data: existingPlans } = await supabase
      .from("scene_camera_plan")
      .select("version")
      .eq("scene_id", scene_id)
      .order("version", { ascending: false })
      .limit(1);

    const newVersion = (existingPlans?.[0]?.version || 0) + 1;

    // Insert the camera plan
    const { data: insertedPlan, error: insertError } = await supabase
      .from("scene_camera_plan")
      .insert({
        scene_id,
        project_id,
        version: newVersion,
        status: "draft",
        generated_from_storyboard: true,
        plan_header: cameraPlan.plan_header,
        shots_list: cameraPlan.shots_list || [],
        blocking_diagrams: cameraPlan.blocking_diagrams || [],
        constraints: {
          must_use_char_visual_dna: true,
          must_use_location_lock: true,
          no_new_props: true,
        },
      })
      .select()
      .single();

    if (insertError) {
      console.error("[generate-camera-plan] Insert error:", insertError);
      throw insertError;
    }

    console.log(`[generate-camera-plan] Created camera plan v${newVersion}`);

    return new Response(
      JSON.stringify({
        success: true,
        camera_plan: insertedPlan,
        version: newVersion,
        shots_count: cameraPlan.shots_list?.length || 0,
        blocking_diagrams_count: cameraPlan.blocking_diagrams?.length || 0,
        message: `Generated Camera Plan v${newVersion} with ${cameraPlan.shots_list?.length} shots`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-camera-plan] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
