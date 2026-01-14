/**
 * Identity Fix Panel - Paso B of 2-Step Pipeline
 * 
 * Edits ONLY the face, hair, and upper neckline of a staging image
 * to match character identity anchors exactly.
 * 
 * This is a targeted fix that preserves composition, blocking, and style.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { editImageWithNanoBanana, SHOT_ANCHOR_REQUIREMENTS } from "../_shared/image-generator.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// IDENTITY FIX PROMPT - Only modifies face/hair, preserves everything else
// ============================================================================

const IDENTITY_FIX_PROMPT = (charName: string, shotType: string) => `
═══════════════════════════════════════════════════════════════════════════════
IDENTITY FIX PASS - EDIT ONLY FACE AND HAIR
═══════════════════════════════════════════════════════════════════════════════

You are editing an existing storyboard panel image.
The composition, blocking, camera angle, and style are CORRECT.
ONLY the character's face/identity needs correction.

CHARACTER: ${charName}
SHOT TYPE: ${shotType}

ONLY MODIFY:
✓ Face (nose, eyes, jaw, lips, cheeks)
✓ Hairline + hair shape + hair volume
✓ Eyebrows + eye shape
✓ Ears (if visible)
✓ Upper neckline (if needed for hair continuity)

DO NOT CHANGE (PRESERVE EXACTLY):
✗ Pose and body position
✗ Body proportions
✗ Outfit/clothing design
✗ Background
✗ Lighting and shadows
✗ Composition and framing
✗ Camera angle
✗ Overall drawing style (pencil/graphite look)
✗ Line weight and shading style

IDENTITY MATCHING RULES:
1. Match ${charName}'s face EXACTLY to the provided reference images
2. Same nose shape, lip thickness, eye spacing
3. Same jawline and cheekbone structure
4. Same brow shape and forehead proportion
5. Same hair color (in grayscale value), texture, and style
6. Same apparent age - no aging or de-aging

The reference images ARE the ground truth.
If the original face differs from references, REPLACE it with the correct identity.

If uncertain about any detail, SIMPLIFY rather than invent.
═══════════════════════════════════════════════════════════════════════════════`;

interface IdentityFixRequest {
  panelId: string;
  forceRun?: boolean;  // Skip check for staging_image_url
}

// Helpers
const isUuid = (s?: string) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let panelId: string | undefined;

  try {
    const body: IdentityFixRequest = await req.json();
    panelId = body.panelId;

    if (!panelId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing panelId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[identity-fix] Starting for panel ${panelId}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Fetch panel with new pipeline fields
    const { data: panel, error: panelError } = await supabase
      .from("storyboard_panels")
      .select(`
        id, scene_id, panel_no, shot_hint, panel_intent,
        characters_present, staging_image_url, staging_status,
        identity_fix_attempts, identity_fix_status, image_url
      `)
      .eq("id", panelId)
      .single();

    if (panelError || !panel) {
      throw new Error(`Panel not found: ${panelError?.message || "unknown"}`);
    }

    // 2) Check if we have a staging image to edit - NO FALLBACK to image_url
    const stagingImage = panel.staging_image_url;
    if (!stagingImage) {
      console.log(JSON.stringify({
        event: "IDENTITY_FIX_BLOCKED",
        panel_id: panelId,
        reason: "No staging_image_url",
        has_image_url: !!panel.image_url,
      }));
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No staging image available. Run Paso A (staging) first.",
          needsStaging: true 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Get scene for project_id
    const { data: scene } = await supabase
      .from("scenes")
      .select("project_id")
      .eq("id", panel.scene_id)
      .single();

    if (!scene) {
      throw new Error("Scene not found");
    }

    const projectId = scene.project_id;

    // 4) Mark as processing
    await supabase
      .from("storyboard_panels")
      .update({
        pipeline_phase: "identity_fix",
        identity_fix_status: "generating",
        identity_fix_attempts: (panel.identity_fix_attempts || 0) + 1,
      })
      .eq("id", panelId);

    // 5) Get character IDs and names
    const rawCharIds = (panel.characters_present || []).map((c: any) =>
      typeof c === "string" ? c : c.character_id
    );
    const cleanCharIds = rawCharIds.filter((id: string) => isUuid(id));

    if (cleanCharIds.length === 0) {
      // No characters = nothing to fix
      await supabase
        .from("storyboard_panels")
        .update({
          pipeline_phase: "complete",
          identity_fix_status: "success",
          image_url: stagingImage,  // Use staging as final
        })
        .eq("id", panelId);

      return new Response(
        JSON.stringify({ success: true, message: "No characters to fix", skipped: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get character names
    const { data: characters } = await supabase
      .from("characters")
      .select("id, name")
      .in("id", cleanCharIds);

    const charNames = (characters || []).map((c) => c.name).join(", ") || "Character";

    // 6) Get identity anchors from character_pack_slots
    const shotType = (panel.shot_hint || "PM").toUpperCase();
    const requiredSlots = SHOT_ANCHOR_REQUIREMENTS[shotType] || ["ref_closeup_front"];
    
    // Prioritized slot types for identity
    const slotPriority = [
      "ref_closeup_front",
      "identity_primary",
      "closeup_front",
      "ref_profile",
      "closeup_profile",
      ...requiredSlots,
    ];

    const { data: slots } = await supabase
      .from("character_pack_slots")
      .select("character_id, slot_type, image_url, status")
      .in("character_id", cleanCharIds)
      .in("status", ["accepted", "uploaded", "generated"])
      .not("image_url", "is", null);

    // Group by character and prioritize
    const slotsByChar = new Map<string, any[]>();
    for (const s of slots || []) {
      if (!s.image_url) continue;
      if (!slotsByChar.has(s.character_id)) slotsByChar.set(s.character_id, []);
      slotsByChar.get(s.character_id)!.push(s);
    }

    const identityAnchorUrls: string[] = [];
    for (const charId of cleanCharIds) {
      const charSlots = slotsByChar.get(charId) || [];
      charSlots.sort(
        (a: any, b: any) =>
          slotPriority.indexOf(a.slot_type) - slotPriority.indexOf(b.slot_type)
      );

      // Take top 2 refs per character for identity fix
      const topSlots = charSlots.slice(0, 2);
      for (const s of topSlots) {
        identityAnchorUrls.push(s.image_url);
      }
    }

    if (identityAnchorUrls.length === 0) {
      console.warn(`[identity-fix] No identity anchors found for characters`);
      // Still proceed but with warning - use staging as is
      await supabase
        .from("storyboard_panels")
        .update({
          pipeline_phase: "complete",
          identity_fix_status: "success",
          image_url: stagingImage,
        })
        .eq("id", panelId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No identity anchors available", 
          warning: "Character pack not found" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(JSON.stringify({
      event: "IDENTITY_FIX_START",
      panel_id: panelId,
      staging_url: stagingImage,
      anchors_count: identityAnchorUrls.length,
      characters: charNames,
      shot_type: shotType,
    }));

    // 7) Build edit instruction and call editImageWithNanoBanana
    const editInstruction = IDENTITY_FIX_PROMPT(charNames, shotType);

    const editStartTime = Date.now();
    const editResult = await editImageWithNanoBanana({
      lovableApiKey,
      sourceImageUrl: stagingImage,
      editInstruction,
      identityAnchorUrls,
      label: `identity_fix_p${panel.panel_no}`,
      supabase,
      projectId,
    });
    const editDurationMs = Date.now() - editStartTime;

    if (!editResult.success || (!editResult.imageUrl && !editResult.imageBase64)) {
      const errMsg = editResult.error?.slice(0, 500) || "Identity fix failed";
      
      console.log(JSON.stringify({
        event: "IDENTITY_FIX_FAILED",
        panel_id: panelId,
        error: errMsg,
        duration_ms: editDurationMs,
      }));

      await supabase
        .from("storyboard_panels")
        .update({
          identity_fix_status: "failed",
          image_status: "needs_identity_fix",
          image_error: errMsg,
        })
        .eq("id", panelId);

      return new Response(
        JSON.stringify({ success: false, error: errMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8) Upload to storage if base64
    let finalImageUrl = editResult.imageUrl;

    if (editResult.imageBase64 && !editResult.imageUrl?.startsWith("http")) {
      const binaryData = Uint8Array.from(atob(editResult.imageBase64), (c) =>
        c.charCodeAt(0)
      );
      const fileName = `storyboard/${panel.id}_identity.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("project-assets")
        .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

      if (!uploadError && uploadData) {
        const { data: publicUrl } = supabase.storage
          .from("project-assets")
          .getPublicUrl(fileName);
        finalImageUrl = publicUrl.publicUrl;
      } else {
        throw new Error(`Storage upload failed: ${uploadError?.message}`);
      }
    }

    // 9) Update panel with final image
    await supabase
      .from("storyboard_panels")
      .update({
        image_url: finalImageUrl,
        pipeline_phase: "complete",
        identity_fix_status: "success",
        image_status: "success",
        image_error: null,
      })
      .eq("id", panelId);

    const duration = Date.now() - startTime;
    
    console.log(JSON.stringify({
      event: "IDENTITY_FIX_OK",
      panel_id: panelId,
      image_url: finalImageUrl,
      duration_ms: duration,
      edit_duration_ms: editDurationMs,
      characters: charNames,
      anchors_used: identityAnchorUrls.length,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        image_url: finalImageUrl,
        duration_ms: duration,
        characters_fixed: charNames,
        anchors_used: identityAnchorUrls.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[identity-fix] Error:", error);

    if (panelId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      await supabase
        .from("storyboard_panels")
        .update({
          identity_fix_status: "failed",
          image_error: error instanceof Error ? error.message : String(error),
        })
        .eq("id", panelId);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
