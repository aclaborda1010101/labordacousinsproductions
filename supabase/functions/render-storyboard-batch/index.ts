/**
 * Batch Storyboard Image Renderer
 * 
 * Processes N panels at a time to avoid Edge Function timeouts.
 * Called in a loop by the frontend until all panels are complete.
 * 
 * Architecture:
 * - generate-storyboard creates panels with image_status='pending'
 * - This function renders a batch (default 2) of pending panels per call
 * - Frontend calls in loop until no pending panels remain
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateImageWithNanoBanana } from "../_shared/image-generator.ts";
import { generateSeed } from "../_shared/storyboard-serializer.ts";
import {
  buildStoryboardImagePrompt,
  buildVisualDNAText,
  getDefaultStylePackLock,
  validateCharacterDNA,
  type StylePackLock,
  type CharacterLock,
  type CharacterPackLockData,
  type LocationLock,
  type PanelSpec,
} from "../_shared/storyboard-prompt-builder.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BatchRequest {
  scene_id: string;
  batch_size?: number;
  retry_errors?: boolean;
}

// Helpers
const isUuid = (s?: string) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { scene_id, batch_size = 2, retry_errors = true }: BatchRequest = await req.json();

    if (!scene_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing scene_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query pending/error panels
    const statuses = retry_errors ? ["pending", "error"] : ["pending"];
    const { data: panels, error: panelsErr } = await supabase
      .from("storyboard_panels")
      .select("*")
      .eq("scene_id", scene_id)
      .in("image_status", statuses)
      .order("panel_no", { ascending: true })
      .limit(batch_size);

    if (panelsErr) throw panelsErr;

    // If no pending panels, return done status
    if (!panels || panels.length === 0) {
      const { count } = await supabase
        .from("storyboard_panels")
        .select("*", { count: "exact", head: true })
        .eq("scene_id", scene_id);

      const { data: successPanels } = await supabase
        .from("storyboard_panels")
        .select("id")
        .eq("scene_id", scene_id)
        .eq("image_status", "success");

      return new Response(
        JSON.stringify({
          ok: true,
          processed: 0,
          total: count || 0,
          done: successPanels?.length || 0,
          remaining: 0,
          complete: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get project_id and storyboard_style from first panel
    const projectId = panels[0].project_id;
    const storyboardStyle = panels[0].storyboard_style || "GRID_SHEET_V1";

    // ========================================================================
    // Build Locks (cached per batch - same scene = same locks)
    // ========================================================================

    // Get Style Pack Lock from project
    let stylePackLock: StylePackLock = getDefaultStylePackLock();
    try {
      const { data: project } = await supabase
        .from("projects")
        .select("style_pack, global_visual_dna")
        .eq("id", projectId)
        .single();

      if (project?.style_pack) {
        const sp = project.style_pack;
        const parts: string[] = [];
        if (sp.visual_preset) parts.push(`Visual preset: ${sp.visual_preset}`);
        if (sp.lens_style) parts.push(`Lens style: ${sp.lens_style}`);
        if (sp.realism_level) parts.push(`Realism: ${sp.realism_level}`);
        if (sp.description) parts.push(sp.description);

        if (parts.length > 0) {
          stylePackLock = {
            schema_version: "1.0",
            text: `${parts.join("\n")}\n- Storyboard look: professional pencil storyboard, grayscale, clean linework`,
          };
        }
      }
    } catch (e) {
      console.log("[batch] style_pack_fetch_error:", e);
    }

    // Get all characters for this scene
    const allCharIds = new Set<string>();
    for (const p of panels) {
      if (Array.isArray(p.characters_present)) {
        for (const id of p.characters_present) {
          if (isUuid(id)) allCharIds.add(id);
        }
      }
    }

    // Build Cast Locks
    const castLocks: CharacterLock[] = [];
    const characterPackData: CharacterPackLockData[] = [];

    if (allCharIds.size > 0) {
      const { data: chars } = await supabase
        .from("characters")
        .select(`
          id, name, character_role, visual_dna, wardrobe_lock_json,
          character_visual_dna!character_visual_dna_character_id_fkey(
            visual_dna, continuity_lock, is_active
          )
        `)
        .in("id", [...allCharIds]);

      for (const c of chars || []) {
        const activeDna = c.character_visual_dna?.find((d: any) => d.is_active);
        const dna = activeDna?.visual_dna || c.visual_dna || {};
        const physical = dna.physical_identity || {};
        const hair = dna.hair?.head_hair || {};
        const face = dna.face || {};

        // Build DNA text
        const dnaText = buildVisualDNAText(dna);

        castLocks.push({
          id: c.id,
          name: c.name,
          visual_dna_lock: { schema_version: "1.0", text: dnaText || "Use reference images" },
          reference_images: [],
        });

        // Wardrobe
        const wardrobeLock = c.wardrobe_lock_json;
        const wardrobeText = wardrobeLock?.primary_outfit || dna.wardrobe?.default_outfit || null;

        // Face/hair descriptions
        let faceDesc: string | undefined;
        if (face.shape || face.distinctive_features?.length) {
          const parts: string[] = [];
          if (face.shape) parts.push(`${face.shape} face`);
          if (face.distinctive_features?.length) parts.push(face.distinctive_features.join(", "));
          faceDesc = parts.join(", ");
        }

        let hairDesc: string | undefined;
        if (hair.color?.natural_base || hair.length?.type || hair.texture) {
          const parts: string[] = [];
          if (hair.color?.natural_base) parts.push(hair.color.natural_base);
          if (hair.length?.type) parts.push(hair.length.type);
          if (hair.texture) parts.push(hair.texture);
          hairDesc = parts.join(" ");
        }

        characterPackData.push({
          id: c.id,
          name: c.name,
          role: c.character_role,
          age: physical.age_exact_for_prompt || physical.age_range,
          height: physical.height ? `${physical.height}cm` : undefined,
          body_type: physical.body_type?.somatotype,
          face_description: faceDesc,
          hair_description: hairDesc,
          wardrobe_lock: wardrobeText,
          has_approved_pack: false,
        });
      }
    }

    // Get location lock
    let locationLock: LocationLock | undefined;
    const locationId = panels[0].location_id;
    if (locationId) {
      const { data: loc } = await supabase
        .from("locations")
        .select("id, name, visual_profile, reference_images")
        .eq("id", locationId)
        .single();

      if (loc) {
        locationLock = {
          id: loc.id,
          name: loc.name,
          visual_lock: { schema_version: "1.0", text: loc.visual_profile || loc.name },
          reference_images: loc.reference_images || [],
        };
      }
    }

    console.log(`[batch] scene=${scene_id} batch=${panels.length} chars=${allCharIds.size}`);

    // ========================================================================
    // Process panels sequentially (no parallelism = no rate limit issues)
    // ========================================================================

    let processed = 0;

    for (const panel of panels) {
      const panelNo = panel.panel_no;

      try {
        // Mark as generating
        await supabase
          .from("storyboard_panels")
          .update({ image_status: "generating", image_error: null })
          .eq("id", panel.id);

        // Calculate deterministic seed
        const seed = generateSeed(scene_id, storyboardStyle, panelNo);

        // Get character names for this panel
        const presentCharIds = (panel.characters_present || []).filter((id: string) => isUuid(id));
        const presentCharNames = castLocks
          .filter((c) => presentCharIds.includes(c.id))
          .map((c) => c.name);

        // Build panel spec
        const panelSpec: PanelSpec = {
          panel_code: panel.panel_code,
          shot_hint: panel.shot_hint,
          panel_intent: panel.panel_intent,
          action: panel.action_beat_ref || panel.panel_intent,
          dialogue_snippet: panel.dialogue_snippet,
          characters_present: presentCharNames,
          props_present: panel.props_present || [],
          staging: {
            spatial_info: panel.staging?.spatial_info || "",
            movement_arrows: panel.staging?.movement_arrows || [],
            axis_180: panel.staging?.axis_180 || { enabled: false, screen_direction: "left_to_right" },
          },
          continuity: {
            must_match_previous: panel.continuity?.must_match_previous || [],
            do_not_change: panel.continuity?.do_not_change || [],
          },
        };

        // Build image prompt
        const imagePrompt = buildStoryboardImagePrompt({
          storyboard_style: storyboardStyle,
          style_pack_lock: stylePackLock,
          location_lock: locationLock,
          cast: castLocks,
          characters_present_ids: presentCharIds,
          panel_spec: panelSpec,
          character_pack_data: characterPackData,
        });

        // ================================================================
        // PACK-FIRST: Get reference images from character_pack_slots
        // ================================================================
        const referenceImageUrls: string[] = [];

        if (presentCharIds.length > 0) {
          const slotPriority = [
            "ref_closeup_front",
            "identity_primary",
            "closeup_front",
            "ref_profile",
            "closeup_profile",
            "turn_side",
            "turn_front_34",
            "expr_neutral",
          ];

          const { data: slots } = await supabase
            .from("character_pack_slots")
            .select("character_id, slot_type, image_url, status")
            .in("character_id", presentCharIds)
            .in("status", ["accepted", "uploaded", "generated"])
            .not("image_url", "is", null);

          // Group by character
          const slotsByChar = new Map<string, any[]>();
          for (const s of slots || []) {
            if (!s.image_url) continue;
            if (!slotsByChar.has(s.character_id)) slotsByChar.set(s.character_id, []);
            slotsByChar.get(s.character_id)!.push(s);
          }

          // Take max 2 refs per character (prioritized)
          for (const charId of presentCharIds) {
            const charSlots = slotsByChar.get(charId) || [];
            charSlots.sort((a: any, b: any) => slotPriority.indexOf(a.slot_type) - slotPriority.indexOf(b.slot_type));

            const topSlots = charSlots.slice(0, 2);
            for (const s of topSlots) {
              referenceImageUrls.push(s.image_url);
            }
          }
        }

        // Location reference (max 1)
        if (locationLock?.reference_images?.length) {
          referenceImageUrls.push(locationLock.reference_images[0]);
        }

        // Hard cap
        const finalRefs = referenceImageUrls.slice(0, 6);

        console.log(`[batch] panel_${panelNo} refs=${finalRefs.length} chars=${presentCharIds.length}`);

        // Generate image
        const imageResult = await generateImageWithNanoBanana({
          lovableApiKey,
          promptText: imagePrompt,
          referenceImageUrls: finalRefs,
          label: `storyboard_batch_p${panelNo}`,
          seed,
          supabase,
          projectId,
        });

        if (imageResult.success && (imageResult.imageUrl || imageResult.imageBase64)) {
          let finalImageUrl = imageResult.imageUrl;

          // Upload base64 to Storage if needed
          if (imageResult.imageBase64 && !imageResult.imageUrl?.startsWith("http")) {
            const binaryData = Uint8Array.from(atob(imageResult.imageBase64), (c) => c.charCodeAt(0));
            const fileName = `storyboard/${panel.id}.png`;

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("project-assets")
              .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

            if (!uploadError && uploadData) {
              const { data: publicUrl } = supabase.storage.from("project-assets").getPublicUrl(fileName);
              finalImageUrl = publicUrl.publicUrl;
            } else {
              await supabase
                .from("storyboard_panels")
                .update({ image_status: "error", image_error: `Storage: ${uploadError?.message}` })
                .eq("id", panel.id);
              continue;
            }
          }

          if (finalImageUrl) {
            await supabase
              .from("storyboard_panels")
              .update({
                image_url: finalImageUrl,
                image_prompt: imagePrompt.substring(0, 2000),
                image_status: "success",
                image_error: null,
              })
              .eq("id", panel.id);
            processed++;
          }
        } else {
          const errMsg = imageResult.error?.slice(0, 500) || "Image generation failed";
          await supabase.from("storyboard_panels").update({ image_status: "error", image_error: errMsg }).eq("id", panel.id);
        }
      } catch (imgError) {
        const errMsg = imgError instanceof Error ? imgError.message : String(imgError);
        await supabase
          .from("storyboard_panels")
          .update({ image_status: "error", image_error: errMsg.slice(0, 500) })
          .eq("id", panel.id);
      }

      // Micro-pause between panels (anti-rate-limit)
      await new Promise((r) => setTimeout(r, 400));
    }

    // Get final counts
    const { count: total } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene_id);

    const { count: doneCount } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene_id)
      .eq("image_status", "success");

    const { count: pendingCount } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene_id)
      .in("image_status", ["pending", "generating", "error"]);

    console.log(`[batch] complete processed=${processed} done=${doneCount}/${total}`);

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        total: total || 0,
        done: doneCount || 0,
        remaining: pendingCount || 0,
        complete: (pendingCount || 0) === 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[render-storyboard-batch] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
