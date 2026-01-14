import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateImageWithNanoBanana } from "../_shared/image-generator.ts";
import { 
  buildStoryboardImagePrompt,
  getDefaultStylePackLock,
  type PanelSpec,
  type CharacterPackLockData,
} from "../_shared/storyboard-prompt-builder.ts";
import { generateSeed } from "../_shared/storyboard-serializer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegenerateRequest {
  panelId: string;
  prompt?: string;
  seed?: number;
  storyboard_style?: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
}

// Helpers for ID validation and key normalization
const isUuid = (s?: string) =>
  !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

const isBadToken = (s?: string) => {
  const v = (s || "").trim().toLowerCase();
  return !v || v === "undefined" || v === "null" || v === "none" || v === "n/a";
};

/**
 * PACK-FIRST: Resolves character references directly from character_pack_slots
 * Returns both pack data and prioritized reference URLs for multimodal input
 */
async function resolveCharacterPackRefs(
  supabase: any,
  characterIds: string[],
  projectId: string
): Promise<{ packData: CharacterPackLockData[]; referenceUrls: string[] }> {
  // Filter to valid UUIDs only
  const validIds = characterIds.filter(id => isUuid(id) && !isBadToken(id));
  
  if (validIds.length === 0) {
    console.log(`[regenerate-panel] No valid character IDs to resolve`);
    return { packData: [], referenceUrls: [] };
  }

  console.log(`[regenerate-panel] Resolving refs for ${validIds.length} characters`);

  const packData: CharacterPackLockData[] = [];
  const referenceUrls: string[] = [];

  // Slot priority order for identity refs
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

  // Query all pack slots for all characters at once (more efficient)
  const { data: allSlots } = await supabase
    .from('character_pack_slots')
    .select('character_id, slot_type, image_url, status')
    .in('character_id', validIds)
    .in('status', ['accepted', 'uploaded', 'generated'])
    .not('image_url', 'is', null);

  // Group slots by character
  const slotsByChar = new Map<string, any[]>();
  for (const s of (allSlots || [])) {
    if (!s.image_url) continue;
    if (!slotsByChar.has(s.character_id)) slotsByChar.set(s.character_id, []);
    slotsByChar.get(s.character_id)!.push(s);
  }

  // Get character names for pack data
  const { data: characters } = await supabase
    .from('characters')
    .select('id, name, character_role')
    .in('id', validIds);

  const charMap = new Map<string, any>();
  for (const c of (characters || [])) {
    charMap.set(c.id, c);
  }

  // Build pack data and collect refs for each character
  for (const charId of validIds) {
    const charInfo = charMap.get(charId);
    const charSlots = slotsByChar.get(charId) || [];
    
    // Sort by priority
    charSlots.sort((a: any, b: any) => 
      slotPriority.indexOf(a.slot_type) - slotPriority.indexOf(b.slot_type)
    );

    const frontalSlot = charSlots.find((s: any) => 
      ['ref_closeup_front', 'closeup_front', 'identity_primary'].includes(s.slot_type)
    );
    const profileSlot = charSlots.find((s: any) => 
      ['closeup_profile', 'turn_side', 'ref_profile'].includes(s.slot_type)
    );

    packData.push({
      id: charId,
      name: charInfo?.name || charId,
      role: charInfo?.character_role,
      reference_frontal: frontalSlot?.image_url,
      reference_profile: profileSlot?.image_url,
      has_approved_pack: frontalSlot?.status === 'accepted',
    });

    // Collect top 3 refs per character (prioritized)
    const topSlots = charSlots.slice(0, 3);
    for (const s of topSlots) {
      referenceUrls.push(s.image_url);
    }
  }

  // Hard cap at 10 refs total
  const finalRefs = referenceUrls.slice(0, 10);
  
  console.log(`[regenerate-panel] Pack refs resolved`, {
    char_count: validIds.length,
    ref_count: finalRefs.length,
    first_host: finalRefs[0] ? new URL(finalRefs[0]).host : 'none'
  });

  return { packData, referenceUrls: finalRefs };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let panelId: string | undefined;

  try {
    const body: RegenerateRequest = await req.json();
    panelId = body.panelId;

    if (!panelId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required field: panelId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[regenerate-panel] Starting for panel ${panelId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Fetch panel WITHOUT invalid joins - only use real FK relationships
    const { data: panel, error: panelError } = await supabase
      .from('storyboard_panels')
      .select(`
        id,
        scene_id,
        panel_no,
        panel_code,
        shot_hint,
        panel_intent,
        image_prompt,
        characters_present,
        props_present,
        staging,
        continuity,
        approved,
        image_url,
        image_status
      `)
      .eq('id', panelId)
      .maybeSingle();

    if (panelError || !panel) {
      console.error(`[regenerate-panel] Panel not found:`, panelError);
      return new Response(JSON.stringify({
        success: false,
        error: `Panel not found: ${panelError?.message || 'unknown'}`
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2) Fetch scene using valid FK (panel.scene_id -> scenes.id)
    // Only select columns that actually exist in the scenes table
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('id, project_id, slugline, summary, scene_no, episode_no, time_of_day, location_id, mood')
      .eq('id', panel.scene_id)
      .maybeSingle();

    if (sceneError || !scene) {
      console.error(`[regenerate-panel] Scene not found:`, sceneError);
      return new Response(JSON.stringify({
        success: false,
        error: `Scene not found for panel: ${sceneError?.message || 'unknown'}`
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const projectId = scene.project_id;
    const sceneId = scene.id;

    // Get total panel count for format contract (same as batch)
    const { count: totalPanelCount } = await supabase
      .from("storyboard_panels")
      .select("*", { count: "exact", head: true })
      .eq("scene_id", sceneId);

    const panelCount = totalPanelCount || 8;

    // ========== DETERMINISTIC PROMPT FALLBACK ==========
    // 1) Start with explicit prompt or stored image_prompt
    let promptText = (body.prompt || panel.image_prompt || "").trim();

    // 2) If no prompt available, rebuild using panel data (same logic as generate-storyboard)
    if (!promptText) {
      console.log(`[regenerate-panel] No stored prompt, rebuilding from panel data`);
      
      const storyboardStyle = body.storyboard_style || 'GRID_SHEET_V1';
      
      // Build minimal PanelSpec from available panel data
      const panelSpec: PanelSpec = {
        panel_code: panel.panel_code || `P${panel.panel_no}`,
        shot_hint: panel.shot_hint || 'PM',
        panel_intent: panel.panel_intent || '',
        action: panel.panel_intent || 'Action',
        dialogue_snippet: undefined,
        characters_present: (panel.characters_present || []).map((c: any) => 
          typeof c === 'string' ? c : c.character_id
        ),
        props_present: (panel.props_present || []).map((p: any) => 
          typeof p === 'string' ? p : p.prop_id
        ),
        staging: panel.staging || {
          spatial_info: '',
          movement_arrows: [],
          axis_180: { enabled: false, screen_direction: 'left_to_right' },
        },
        continuity: panel.continuity || {
          must_match_previous: ['hair', 'wardrobe'],
          do_not_change: ['age'],
        },
      };

      // Build prompt using the same builder as generate-storyboard (v3.0: with panel_count)
      promptText = buildStoryboardImagePrompt({
        storyboard_style: storyboardStyle,
        style_pack_lock: getDefaultStylePackLock(),
        location_lock: undefined,
        cast: [],
        characters_present_ids: panelSpec.characters_present,
        panel_spec: panelSpec,
        panel_count: panelCount,  // NEW: Inject panel count for format contract
      });
      
      console.log(`[regenerate-panel] Rebuilt prompt (${promptText.length} chars) panel_count=${panelCount}`);
    }

    // 3) ULTRA-MINIMAL FALLBACK if builders somehow returned empty (should never happen)
    if (!promptText) {
      promptText = [
        "Professional pencil storyboard panel, grayscale, clean linework, no color.",
        `Panel P${panel.panel_no}.`,
        panel.shot_hint ? `Shot type: ${panel.shot_hint}.` : "",
        panel.panel_intent ? `Intent: ${panel.panel_intent}.` : "",
        panel.staging?.movement_arrows?.length 
          ? `Movement: ${JSON.stringify(panel.staging.movement_arrows)}` 
          : ""
      ].filter(Boolean).join(" ");
      
      console.log(`[regenerate-panel] Using ultra-minimal fallback prompt`);
    }

    // 4) Persist rebuilt prompt for future regenerations
    if (!panel.image_prompt || panel.image_prompt.trim() !== promptText) {
      await supabase
        .from("storyboard_panels")
        .update({ image_prompt: promptText.substring(0, 2000) })
        .eq("id", panelId);
    }

    console.log(`[regenerate-panel] Panel ${panel.panel_no}, scene ${sceneId}, project ${projectId}`);

    // 3) Mark panel as generating
    await supabase
      .from('storyboard_panels')
      .update({ 
        image_status: 'generating',
        image_error: null 
      })
      .eq('id', panelId);

    // 4) Resolve character reference images for multimodal input (PACK-FIRST)
    const rawCharIds = (panel.characters_present || []).map((c: any) => 
      typeof c === 'string' ? c : c.character_id
    );
    
    // Filter out bad tokens before resolution
    const cleanCharIds = rawCharIds.filter((id: string) => 
      isUuid(id) && !isBadToken(id)
    );

    console.log(`[regenerate-panel] Character IDs`, {
      raw: rawCharIds.slice(0, 5),
      clean: cleanCharIds.slice(0, 5),
      filtered_out: rawCharIds.length - cleanCharIds.length
    });
    
    const { packData, referenceUrls } = await resolveCharacterPackRefs(
      supabase, 
      cleanCharIds, 
      projectId
    );

    // Guardrail: warn if we have character IDs but no refs
    if (cleanCharIds.length > 0 && referenceUrls.length === 0) {
      console.warn(`[regenerate-panel] IDENTITY_UNLOCKED: No pack refs found for characters`, {
        char_ids: cleanCharIds
      });
    }

    // 5) Generate the image with deterministic seed + multimodal refs
    const seed = body.seed ?? generateSeed(sceneId, 'GRID_SHEET_V1', panel.panel_no);
    
    console.log(`[regenerate-panel] Generating image with seed ${seed}, refs: ${referenceUrls.length}`);

    const imageResult = await generateImageWithNanoBanana({
      lovableApiKey,
      model: "google/gemini-3-pro-image-preview",
      promptText,
      referenceImageUrls: referenceUrls,  // NEW: Pass actual image references
      seed,
      label: `storyboard_panel_${panel.panel_no}`,
      supabase,
      projectId,
    });

    console.log(`[regenerate-panel] Image result:`, {
      success: imageResult.success,
      hasUrl: !!imageResult.imageUrl,
      hasBase64: !!imageResult.imageBase64,
      error: imageResult.error?.slice(0, 200)
    });

    if (!imageResult.success || (!imageResult.imageUrl && !imageResult.imageBase64)) {
      await supabase
        .from('storyboard_panels')
        .update({ 
          image_status: 'error',
          image_error: imageResult.error || 'No image generated'
        })
        .eq('id', panelId);

      return new Response(JSON.stringify({
        success: false,
        error: imageResult.error || 'Image generation failed'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5) Upload to storage if we have base64
    let finalImageUrl = imageResult.imageUrl;

    if (imageResult.imageBase64) {
      const fileName = `storyboard/${projectId}/${sceneId}/panel_${panel.panel_no}_${Date.now()}.png`;
      
      console.log(`[regenerate-panel] Uploading to ${fileName}`);

      const imageBuffer = Uint8Array.from(atob(imageResult.imageBase64), c => c.charCodeAt(0));
      
      const { error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        console.error(`[regenerate-panel] Upload error:`, uploadError);
        finalImageUrl = `data:image/png;base64,${imageResult.imageBase64}`;
      } else {
        const { data: urlData } = supabase.storage
          .from('project-assets')
          .getPublicUrl(fileName);
        
        finalImageUrl = urlData.publicUrl;
        console.log(`[regenerate-panel] Uploaded successfully: ${finalImageUrl.slice(0, 80)}...`);
      }
    }

    // 6) Update panel with success
    const { error: updateError } = await supabase
      .from('storyboard_panels')
      .update({
        image_url: finalImageUrl,
        image_status: 'success',
        image_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', panelId);

    if (updateError) {
      console.error(`[regenerate-panel] Update error:`, updateError);
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`[regenerate-panel] SUCCESS in ${generationTimeMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      panelId,
      imageUrl: finalImageUrl,
      generationTimeMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[regenerate-panel] FAILED:`, errorMessage);

    if (panelId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);
        
        await supabase
          .from('storyboard_panels')
          .update({ 
            image_status: 'error',
            image_error: errorMessage.slice(0, 500)
          })
          .eq('id', panelId);
      } catch {
        // Ignore
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
