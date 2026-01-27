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
  STAGING_PROMPT_BLOCK,
  type StylePackLock,
  type CharacterLock,
  type CharacterPackLockData,
  type LocationLock,
  type PanelSpec,
  type CanvasFormat,
} from "../_shared/storyboard-prompt-builder.ts";
import {
  chooseGenerationMode,
  getModeBlock,
  type GenerationMode,
} from "../_shared/storyboard-style-presets.ts";
import {
  getStoryboardReferenceUrl,
  buildReferenceInstructionBlock,
} from "../_shared/storyboard-reference-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// STUCK PANEL CLEANUP (Phase 5: Clean orphaned states)
// ============================================================================

const STUCK_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

async function cleanupStuckPanels(supabase: any, sceneId: string): Promise<number> {
  const stuckThreshold = new Date(Date.now() - STUCK_TIMEOUT_MS).toISOString();
  
  const { data: stuckPanels, error } = await supabase
    .from("storyboard_panels")
    .update({ 
      image_status: "failed_safe",
      failure_reason: "STUCK_GENERATING",
      image_error: "Generation timed out (stuck in generating state)",
    })
    .eq("scene_id", sceneId)
    .eq("image_status", "generating")
    .lt("generation_started_at", stuckThreshold)
    .select("id");

  if (error) {
    console.warn("[batch] Stuck cleanup error:", error.message);
    return 0;
  }
  
  const cleanedCount = stuckPanels?.length || 0;
  if (cleanedCount > 0) {
    console.log(`[batch] Cleaned ${cleanedCount} stuck panels`);
  }
  return cleanedCount;
}

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

    // Query pending/error/pending_regen panels (Phase 1: process pending_regen for failed_safe recovery)
    const statuses = retry_errors 
      ? ["pending", "error", "pending_regen"]  // NEW: Include pending_regen for QC-failed panels
      : ["pending"];
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

    // Get total panel count for format contract (layout specification)
    const { count: totalPanelCount } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", scene_id);

    const panelCount = totalPanelCount || 8;
    console.log(`[batch] scene=${scene_id} panel_count=${panelCount} style=${storyboardStyle}`);

    // ========================================================================
    // Build Locks (cached per batch - same scene = same locks)
    // ========================================================================

    // Get Style Pack Lock and Canvas Format from style_packs table
    let stylePackLock: StylePackLock = getDefaultStylePackLock();
    let canvasFormat: CanvasFormat | undefined;
    
    try {
      // First try style_packs table (new location)
      const { data: stylePack } = await supabase
        .from("style_packs")
        .select("style_config, aspect_ratio, canvas_format, description, visual_preset, lens_style")
        .eq("project_id", projectId)
        .maybeSingle();

      if (stylePack) {
        const parts: string[] = [];
        if (stylePack.visual_preset) parts.push(`Visual preset: ${stylePack.visual_preset}`);
        if (stylePack.lens_style) parts.push(`Lens style: ${stylePack.lens_style}`);
        if (stylePack.description) parts.push(stylePack.description);

        if (parts.length > 0) {
          stylePackLock = {
            schema_version: "1.0",
            text: `${parts.join("\n")}\n- Storyboard look: professional pencil storyboard, grayscale, clean linework`,
          };
        }
        
        // Extract canvas format (NEW - v4.0)
        if (stylePack.canvas_format) {
          canvasFormat = stylePack.canvas_format as CanvasFormat;
          console.log(`[batch] Canvas format loaded:`, canvasFormat.aspect_ratio, canvasFormat.orientation);
        } else if (stylePack.aspect_ratio) {
          // Fallback: build canvas format from aspect_ratio
          canvasFormat = {
            aspect_ratio: stylePack.aspect_ratio as CanvasFormat['aspect_ratio'],
            orientation: stylePack.aspect_ratio === '16:9' ? 'horizontal' : 
                         stylePack.aspect_ratio === '9:16' ? 'vertical' : 
                         stylePack.aspect_ratio === '1:1' ? 'square' : 'horizontal',
            safe_area: { top: 5, bottom: 5, left: 5, right: 5 }
          };
        }
      }
      
      // Fallback to project.style_pack if style_packs empty
      if (!stylePack) {
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

    // Phase 5: Clean up stuck panels before processing new ones
    await cleanupStuckPanels(supabase, scene_id);

    for (const panel of panels) {
      const panelNo = panel.panel_no;

      try {
        // ================================================================
        // Phase 1: Determine generation mode based on panel state
        // ================================================================
        const panelState = {
          image_status: panel.image_status,
          failure_reason: panel.failure_reason,
          regen_count: panel.regen_count || 0,
          identity_qc: panel.identity_qc,
          style_qc: panel.style_qc,
        };
        const mode: GenerationMode = chooseGenerationMode(panelState);
        
        console.log(`[batch] panel_${panelNo} mode=${mode} regen_count=${panelState.regen_count}`);

        // Mark as generating with mode tracking
        await supabase
          .from("storyboard_panels")
          .update({ 
            image_status: "generating", 
            image_error: null,
            generation_started_at: new Date().toISOString(),
            generation_mode: mode,
          })
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

        // Build image prompt (v4.0: with panel_count and canvas_format)
        let imagePrompt = buildStoryboardImagePrompt({
          storyboard_style: storyboardStyle,
          style_pack_lock: stylePackLock,
          location_lock: locationLock,
          cast: castLocks,
          characters_present_ids: presentCharIds,
          panel_spec: panelSpec,
          character_pack_data: characterPackData,
          panel_count: panelCount,
          canvas_format: canvasFormat,
        });
        
        // Phase 3: Prepend mode block if STRICT or SAFE
        const modeBlock = getModeBlock(mode);
        if (modeBlock) {
          imagePrompt = modeBlock + '\n\n' + imagePrompt;
          console.log(`[batch] panel_${panelNo} prepended ${mode} mode block`);
        }

        // v5.0: Get storyboard reference image URL and prepend instruction block
        const stylePresetId = panel.style_preset_id || 'sb_cinematic_narrative';
        const storyboardRefUrl = getStoryboardReferenceUrl(stylePresetId);
        if (storyboardRefUrl) {
          const refInstructionBlock = buildReferenceInstructionBlock(storyboardRefUrl);
          imagePrompt = refInstructionBlock + '\n\n' + imagePrompt;
          console.log(`[batch] panel_${panelNo} using storyboard reference image`);
        }

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

        // Take max refs per character (prioritized) - MORE on regen attempts
        const isRegen = (panel.regen_count || 0) > 0 || panel.image_status === 'pending_regen';
        const maxRefsPerChar = isRegen ? 4 : 2;  // Phase 3: Escalate refs on regen
        
        for (const charId of presentCharIds) {
          const charSlots = slotsByChar.get(charId) || [];
          charSlots.sort((a: any, b: any) => slotPriority.indexOf(a.slot_type) - slotPriority.indexOf(b.slot_type));

          const topSlots = charSlots.slice(0, maxRefsPerChar);
          for (const s of topSlots) {
            referenceImageUrls.push(s.image_url);
          }
        }
        
        if (isRegen) {
          console.log(`[batch] panel_${panelNo} is REGEN - using ${maxRefsPerChar} refs/char`);
        }
        }

        // Location reference (max 1)
        if (locationLock?.reference_images?.length) {
          referenceImageUrls.push(locationLock.reference_images[0]);
        }

        // v5.0: Prepend storyboard style reference image FIRST (highest priority)
        // This teaches the model what a real production storyboard looks like
        const allRefs: string[] = [];
        if (storyboardRefUrl) {
          allRefs.push(storyboardRefUrl);
        }
        allRefs.push(...referenceImageUrls);

        // Hard cap (6 refs max, but storyboard ref is always first)
        const finalRefs = allRefs.slice(0, 6);

        console.log(`[batch] panel_${panelNo} refs=${finalRefs.length} chars=${presentCharIds.length}`);

        // ================================================================
        // PIPELINE DE 2 PASOS: STAGING (A) → IDENTITY FIX (B)
        // ================================================================
        
        // ===================== PASO A: STAGING =====================
        // Genera composición/plano sin cara final detallada
        console.log(JSON.stringify({
          event: "PIPELINE_STEP",
          panel_id: panel.id,
          panel_no: panelNo,
          step: "STAGING_START",
          refs_count: finalRefs.length,
          chars_count: presentCharIds.length,
        }));

        // Build staging prompt (without character refs - only location)
        const locationRefs = locationLock?.reference_images?.slice(0, 1) || [];
        const stagingPrompt = STAGING_PROMPT_BLOCK + '\n\n' + imagePrompt;
        
        const stagingResult = await generateImageWithNanoBanana({
          lovableApiKey,
          promptText: stagingPrompt,
          referenceImageUrls: locationRefs, // Solo location refs en staging
          label: `staging_p${panelNo}`,
          seed,
          supabase,
          projectId,
        });

        if (!stagingResult.success || (!stagingResult.imageUrl && !stagingResult.imageBase64)) {
          // Staging failed - mark as error
          const errMsg = stagingResult.error?.slice(0, 500) || "Staging generation failed";
          const regenCount = (panel.regen_count || 0) + 1;
          
          console.log(JSON.stringify({
            event: "PIPELINE_STEP",
            panel_id: panel.id,
            step: "STAGING_FAILED",
            error: errMsg,
          }));
          
          await supabase
            .from("storyboard_panels")
            .update({ 
              image_status: regenCount >= 2 ? "failed_safe" : "error",
              staging_status: "failed",
              pipeline_phase: "staging",
              image_error: errMsg,
              regen_count: regenCount,
            })
            .eq("id", panel.id);
          continue;
        }

        // Upload staging image
        let stagingImageUrl = stagingResult.imageUrl;
        if (stagingResult.imageBase64 && !stagingResult.imageUrl?.startsWith("http")) {
          const binaryData = Uint8Array.from(atob(stagingResult.imageBase64), (c) => c.charCodeAt(0));
          const fileName = `storyboard/${panel.id}_staging.png`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("project-assets")
            .upload(fileName, binaryData, { contentType: "image/png", upsert: true });

          if (!uploadError && uploadData) {
            const { data: publicUrl } = supabase.storage.from("project-assets").getPublicUrl(fileName);
            stagingImageUrl = publicUrl.publicUrl;
          } else {
            await supabase
              .from("storyboard_panels")
              .update({ 
                image_status: "error", 
                staging_status: "failed",
                image_error: `Staging upload: ${uploadError?.message}` 
              })
              .eq("id", panel.id);
            continue;
          }
        }

        // Save staging URL
        await supabase
          .from("storyboard_panels")
          .update({
            staging_image_url: stagingImageUrl,
            staging_status: "success",
            pipeline_phase: "identity_fix",
            image_prompt: imagePrompt.substring(0, 2000),
          })
          .eq("id", panel.id);

        console.log(JSON.stringify({
          event: "PIPELINE_STEP",
          panel_id: panel.id,
          step: "STAGING_OK",
          staging_url: stagingImageUrl,
          duration_ms: Date.now() - (new Date(panel.generation_started_at || Date.now()).getTime()),
        }));

        // ===================== PASO B: IDENTITY FIX =====================
        // Llama a identity-fix-panel para editar SOLO cara/pelo
        
        if (presentCharIds.length > 0 && panel.shot_hint !== 'INSERT') {
          console.log(JSON.stringify({
            event: "PIPELINE_STEP",
            panel_id: panel.id,
            step: "IDENTITY_FIX_START",
            chars_count: presentCharIds.length,
          }));

          try {
            const fixResponse = await fetch(
              `${supabaseUrl}/functions/v1/identity-fix-panel`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`,
                },
                body: JSON.stringify({ panelId: panel.id }),
              }
            );

            const fixResult = await fixResponse.json();
            
            if (fixResult.success) {
              console.log(JSON.stringify({
                event: "PIPELINE_STEP",
                panel_id: panel.id,
                step: "IDENTITY_FIX_OK",
                image_url: fixResult.image_url,
                anchors_used: fixResult.anchors_used,
              }));
              processed++;
            } else {
              // Identity fix failed - panel stays with staging only
              console.log(JSON.stringify({
                event: "PIPELINE_STEP",
                panel_id: panel.id,
                step: "IDENTITY_FIX_FAILED",
                error: fixResult.error,
              }));
              
              // Mark as needs_identity_fix (staging preserved)
              await supabase
                .from("storyboard_panels")
                .update({
                  image_status: "needs_identity_fix",
                  identity_fix_status: "failed",
                  image_url: stagingImageUrl, // Use staging as fallback visual
                })
                .eq("id", panel.id);
            }
          } catch (fixErr) {
            console.error(`[batch] panel_${panelNo} identity fix error:`, fixErr);
            // Non-blocking: use staging as final image
            await supabase
              .from("storyboard_panels")
              .update({
                image_status: "needs_identity_fix",
                identity_fix_status: "failed",
                image_url: stagingImageUrl,
              })
              .eq("id", panel.id);
          }
        } else {
          // No characters or INSERT shot - staging is final
          await supabase
            .from("storyboard_panels")
            .update({
              image_url: stagingImageUrl,
              pipeline_phase: "complete",
              identity_fix_status: "skipped",
              image_status: "success",
            })
            .eq("id", panel.id);
          processed++;
          
          console.log(JSON.stringify({
            event: "PIPELINE_STEP",
            panel_id: panel.id,
            step: "STAGING_FINAL",
            reason: presentCharIds.length === 0 ? "no_characters" : "insert_shot",
          }));
        }

      } catch (imgError) {
        const errMsg = imgError instanceof Error ? imgError.message : String(imgError);
        const regenCount = (panel.regen_count || 0) + 1;
        
        console.error(JSON.stringify({
          event: "PIPELINE_ERROR",
          panel_id: panel.id,
          error: errMsg,
          regen_count: regenCount,
        }));
        
        // Phase 1: Transition to failed_safe after repeated failures
        const newStatus = regenCount >= 2 ? "failed_safe" : "error";
        await supabase
          .from("storyboard_panels")
          .update({ 
            image_status: newStatus, 
            image_error: errMsg.slice(0, 500),
            failure_reason: newStatus === "failed_safe" ? "GENERATION_ERROR" : null,
            regen_count: regenCount,
          })
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
