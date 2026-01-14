import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildTokenLimit } from "../_shared/model-config.ts";
import { generateImageWithNanoBanana } from "../_shared/image-generator.ts";
import { aiFetch } from "../_shared/ai-fetch.ts";
import { serializePanelList, generateSeed } from "../_shared/storyboard-serializer.ts";
import {
  buildStoryboardImagePrompt,
  buildVisualDNAText,
  getDefaultStylePackLock,
  validateCharacterDNA,
  validateCharacterPackForStoryboard,
  buildCharacterPackLockBlock,
  STORYBOARD_PLANNER_SYSTEM_PROMPT,
  STORYBOARD_ARTIST_SYSTEM_PROMPT,
  buildStoryboardPlannerUserPrompt,
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

interface StoryboardRequest {
  scene_id: string;
  project_id: string;
  scene_text: string;
  scene_slugline?: string;
  visual_style?: string;
  storyboard_style?: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
  character_refs?: { id: string; name: string; image_url?: string }[];
  location_ref?: { id: string; name: string; image_url?: string; interior_exterior?: string; time_of_day?: string };
  panel_count?: number;
  beats?: { beat_id: string; description: string }[];
  dialogue_blocks?: { line_id: string; speaker_id: string; text: string }[];
  show_movement_arrows?: boolean;
  aspect_ratio?: string;
  // New v1.0 SPEC fields
  locks?: {
    style_pack_id?: string;
    style_pack_lock?: { schema_version: string; text: string };
    characters?: Array<{
      id: string;
      name: string;
      visual_dna_lock?: { schema_version: string; text: string };
      reference_images?: string[];
    }>;
    locations?: Array<{
      id: string;
      name: string;
      visual_lock?: { schema_version: string; text: string };
      reference_images?: string[];
    }>;
  };
  screenplay_context?: {
    slugline: string;
    scene_summary: string;
    scene_dialogue?: string;
  };
}

interface StoryboardPanel {
  panel_id: string;
  panel_no: number;
  panel_code?: string;
  panel_intent: string;
  shot_hint: string;
  action_beat?: string;
  action?: string;
  dialogue_snippet?: string;
  characters_present: Array<{ character_id: string; importance: string } | string>;
  props_present: Array<{ prop_id: string; importance: string } | string>;
  movement_arrows?: Array<{ type: string; direction: string; intensity?: string }>;
  staging?: {
    schema_version?: string;
    movement_arrows?: Array<{ subject: string; direction: string; intent: string }>;
    spatial_info?: string;
    axis_180?: { enabled: boolean; screen_direction: string };
  };
  continuity?: {
    schema_version?: string;
    must_match_previous?: string[];
    do_not_change?: string[];
  };
  spatial_info?: {
    camera_relative_position?: string;
    subject_direction?: string;
    axis_locked?: boolean;
  };
}

// ============================================================================
// LOCK BUILDERS
// ============================================================================

/**
 * Builds Cast Locks with Visual DNA and reference images (legacy format)
 */
async function buildCastLocks(
  supabase: any,
  characterRefs: { id: string; name: string; image_url?: string }[]
): Promise<CharacterLock[]> {
  if (!characterRefs || characterRefs.length === 0) {
    return [];
  }

  const locks: CharacterLock[] = [];

  for (const char of characterRefs) {
    try {
      // 1. Get character + active visual DNA
      const { data: charData } = await supabase
        .from('characters')
        .select(`
          id, name, visual_dna, bio,
          character_visual_dna!character_visual_dna_character_id_fkey(
            visual_dna, continuity_lock, is_active
          )
        `)
        .eq('id', char.id)
        .single();

      // 2. Get reference images from character_pack_slots
      const { data: packImages } = await supabase
        .from('character_pack_slots')
        .select('image_url, slot_type')
        .eq('character_id', char.id)
        .eq('status', 'accepted')
        .in('slot_type', ['ref_closeup_front', 'closeup_front', 'identity_primary', 'portrait'])
        .limit(3);

      // 3. Build DNA lock text
      let dnaText = '';
      const activeDna = charData?.character_visual_dna?.find((d: any) => d.is_active);
      if (activeDna?.visual_dna) {
        dnaText = buildVisualDNAText(activeDna.visual_dna);
      } else if (charData?.visual_dna) {
        dnaText = buildVisualDNAText(charData.visual_dna);
      }

      // Collect reference images
      const referenceImages: string[] = [];
      if (packImages) {
        referenceImages.push(...packImages.map((p: any) => p.image_url).filter(Boolean));
      }
      if (char.image_url) {
        referenceImages.push(char.image_url);
      }

      locks.push({
        id: char.id,
        name: charData?.name || char.name,
        visual_dna_lock: {
          schema_version: '1.0',
          text: dnaText || `Use reference images for ${char.name}`,
        },
        reference_images: referenceImages,
      });
    } catch (err) {
      console.log(`[generate-storyboard] Could not fetch DNA for ${char.name}:`, err);
      locks.push({
        id: char.id,
        name: char.name,
        visual_dna_lock: {
          schema_version: '1.0',
          text: 'No DNA available',
        },
        reference_images: char.image_url ? [char.image_url] : [],
      });
    }
  }

  return locks;
}

/**
 * Builds Character Pack Data v2.0 with complete identity information
 * This is the enhanced format that enforces strict identity rules
 */
async function buildCharacterPackData(
  supabase: any,
  characterRefs: { id: string; name: string; image_url?: string }[]
): Promise<CharacterPackLockData[]> {
  if (!characterRefs || characterRefs.length === 0) {
    return [];
  }

  const packData: CharacterPackLockData[] = [];

  for (const char of characterRefs) {
    try {
      // Get character + active visual DNA + role
      const { data: charData } = await supabase
        .from('characters')
        .select(`
          id, name, character_role, visual_dna, wardrobe_lock_json,
          character_visual_dna!character_visual_dna_character_id_fkey(
            visual_dna, continuity_lock, is_active
          )
        `)
        .eq('id', char.id)
        .single();

      // Get reference images (frontal and profile) from pack slots
      const { data: packSlots } = await supabase
        .from('character_pack_slots')
        .select('slot_type, image_url, status')
        .eq('character_id', char.id)
        .in('status', ['accepted', 'generated'])
        .in('slot_type', ['ref_closeup_front', 'closeup_front', 'closeup_profile', 'turn_side', 'identity_primary']);

      // Extract DNA fields
      const activeDna = charData?.character_visual_dna?.find((d: any) => d.is_active);
      const dna = activeDna?.visual_dna || charData?.visual_dna || {};
      const physical = dna.physical_identity || {};
      const hair = dna.hair?.head_hair || {};
      const face = dna.face || {};
      
      // Get wardrobe from multiple sources (priority order)
      const wardrobeLock = charData?.wardrobe_lock_json;
      const continuityWardrobe = activeDna?.continuity_lock?.wardrobe;
      const dnaWardrobe = dna.wardrobe;
      
      const wardrobeText = wardrobeLock?.primary_outfit 
        || wardrobeLock?.default_outfit
        || continuityWardrobe?.primary_outfit
        || dnaWardrobe?.default_outfit
        || dnaWardrobe?.primary_outfit
        || null;

      // Find reference images by type
      const frontalSlot = packSlots?.find((s: any) => 
        ['ref_closeup_front', 'closeup_front', 'identity_primary'].includes(s.slot_type)
      );
      const profileSlot = packSlots?.find((s: any) => 
        ['closeup_profile', 'turn_side'].includes(s.slot_type)
      );

      // Build face description
      let faceDesc: string | undefined;
      if (face.shape || face.distinctive_features?.length) {
        const parts: string[] = [];
        if (face.shape) parts.push(`${face.shape} face`);
        if (face.distinctive_features?.length) parts.push(face.distinctive_features.join(', '));
        faceDesc = parts.join(', ');
      }

      // Build hair description
      let hairDesc: string | undefined;
      if (hair.color?.natural_base || hair.length?.type || hair.texture) {
        const parts: string[] = [];
        if (hair.color?.natural_base) parts.push(hair.color.natural_base);
        if (hair.length?.type) parts.push(hair.length.type);
        if (hair.texture) parts.push(hair.texture);
        hairDesc = parts.join(' ');
      }

      packData.push({
        id: char.id,
        name: charData?.name || char.name,
        role: charData?.character_role,
        age: physical.age_exact_for_prompt || physical.age_range,
        height: physical.height ? `${physical.height}cm` : undefined,
        body_type: physical.body_type?.somatotype,
        face_description: faceDesc,
        hair_description: hairDesc,
        wardrobe_lock: wardrobeText,
        reference_frontal: frontalSlot?.image_url || char.image_url,
        reference_profile: profileSlot?.image_url,
        has_approved_pack: !!(frontalSlot?.status === 'accepted'),
      });
    } catch (err) {
      console.log(`[generate-storyboard] Could not fetch pack data for ${char.name}:`, err);
      packData.push({
        id: char.id,
        name: char.name,
        reference_frontal: char.image_url,
        has_approved_pack: false,
      });
    }
  }

  return packData;
}

/**
 * Gets Style Pack Lock from project
 */
async function getStylePackLock(supabase: any, projectId: string): Promise<StylePackLock> {
  try {
    const { data: project } = await supabase
      .from('projects')
      .select('style_pack, global_visual_dna')
      .eq('id', projectId)
      .single();

    if (project?.style_pack) {
      const sp = project.style_pack;
      const parts: string[] = [];
      
      if (sp.visual_preset) parts.push(`Visual preset: ${sp.visual_preset}`);
      if (sp.lens_style) parts.push(`Lens style: ${sp.lens_style}`);
      if (sp.realism_level) parts.push(`Realism: ${sp.realism_level}`);
      if (sp.grain_level) parts.push(`Grain: ${sp.grain_level}`);
      if (sp.description) parts.push(sp.description);

      if (parts.length > 0) {
        return {
          schema_version: '1.0',
          text: `${parts.join('\n')}\n- Storyboard look: professional pencil storyboard, grayscale, clean linework`,
        };
      }
    }

    // Fallback to global_visual_dna if available
    if (project?.global_visual_dna?.style_description) {
      return {
        schema_version: '1.0',
        text: `${project.global_visual_dna.style_description}\n- Storyboard look: professional pencil storyboard, grayscale, clean linework`,
      };
    }
  } catch (err) {
    console.log('[generate-storyboard] Could not fetch style pack:', err);
  }

  return getDefaultStylePackLock();
}

/**
 * Gets Location Lock
 */
async function getLocationLock(
  supabase: any,
  locationRef?: { id: string; name: string; image_url?: string; interior_exterior?: string; time_of_day?: string }
): Promise<LocationLock | undefined> {
  if (!locationRef?.id) return undefined;

  try {
    const { data: loc } = await supabase
      .from('locations')
      .select('id, name, visual_profile, reference_images, visual_dna')
      .eq('id', locationRef.id)
      .single();

    if (loc) {
      const visualText = loc.visual_profile 
        || loc.visual_dna?.description 
        || `${loc.name} - ${locationRef.interior_exterior || 'INT'} / ${locationRef.time_of_day || 'DAY'}`;

      return {
        id: loc.id,
        name: loc.name,
        visual_lock: { schema_version: '1.0', text: visualText },
        reference_images: loc.reference_images || (locationRef.image_url ? [locationRef.image_url] : []),
      };
    }
  } catch (err) {
    console.log('[generate-storyboard] Could not fetch location:', err);
  }

  // Fallback with basic info
  return {
    id: locationRef.id,
    name: locationRef.name,
    visual_lock: {
      schema_version: '1.0',
      text: `${locationRef.name} - ${locationRef.interior_exterior || 'INT'} / ${locationRef.time_of_day || 'DAY'}`,
    },
    reference_images: locationRef.image_url ? [locationRef.image_url] : [],
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

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
      storyboard_style = "GRID_SHEET_V1",
      character_refs = [],
      location_ref,
      panel_count,
      beats = [],
      dialogue_blocks = [],
      show_movement_arrows = true,
      aspect_ratio = "16:9",
      locks,
      screenplay_context,
    }: StoryboardRequest = await req.json();

    if (!scene_id || !project_id || !scene_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id, scene_text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine panel count based on style
    const defaultPanelCount = storyboard_style === 'GRID_SHEET_V1' ? 8 : 5;
    const targetPanelCount = panel_count || defaultPanelCount;

    console.log(`[generate-storyboard] Style: ${storyboard_style}, Panels: ${targetPanelCount}`);

    // ========================================================================
    // PHASE 1: Build Locks (Style Pack, Cast, Location)
    // ========================================================================

    // Get Style Pack Lock (from request or fetch from project)
    const stylePackLock: StylePackLock = locks?.style_pack_lock 
      ? { schema_version: '1.0', text: locks.style_pack_lock.text }
      : await getStylePackLock(supabase, project_id);

    // Get Cast Locks with Visual DNA (from request or build from character_refs)
    let castLocks: CharacterLock[];
    if (locks?.characters && locks.characters.length > 0) {
      castLocks = locks.characters.map(c => ({
        id: c.id,
        name: c.name,
        visual_dna_lock: c.visual_dna_lock || { schema_version: '1.0', text: 'No DNA available' },
        reference_images: c.reference_images || [],
      }));
    } else {
      castLocks = await buildCastLocks(supabase, character_refs);
    }

    // Build Character Pack Data v2.0 (enhanced identity information)
    const characterPackData = await buildCharacterPackData(supabase, character_refs);
    
    // Validate Character Pack for storyboard
    const packValidation = validateCharacterPackForStoryboard(characterPackData);
    const packWarnings = [...packValidation.warnings];
    const packBlockers = [...packValidation.blockers];
    
    if (packBlockers.length > 0) {
      console.warn(`[generate-storyboard] Character Pack BLOCKERS: ${packBlockers.join('; ')}`);
      // Continue anyway but log prominently - could be made blocking in future
    }
    
    if (packWarnings.length > 0) {
      console.log(`[generate-storyboard] Character Pack Warnings: ${packWarnings.join('; ')}`);
    }

    // Get Location Lock
    let locationLock: LocationLock | undefined;
    if (locks?.locations && locks.locations.length > 0) {
      const loc = locks.locations[0];
      locationLock = {
        id: loc.id,
        name: loc.name,
        visual_lock: loc.visual_lock || { schema_version: '1.0', text: loc.name },
        reference_images: loc.reference_images || [],
      };
    } else {
      locationLock = await getLocationLock(supabase, location_ref);
    }

    console.log(`[generate-storyboard] Locks: StylePack=${!!stylePackLock.text}, Cast=${castLocks.length}, CharacterPack=${characterPackData.length}, Location=${!!locationLock}`);

    // Validate cast DNA and collect warnings (legacy)
    const dnaWarnings: string[] = [...packWarnings];
    for (const char of castLocks) {
      const validation = validateCharacterDNA(char);
      if (validation.warning) {
        dnaWarnings.push(validation.warning);
      }
    }

    if (dnaWarnings.length > 0) {
      console.log(`[generate-storyboard] All Warnings: ${dnaWarnings.join('; ')}`);
    }

    // ========================================================================
    // PHASE 2: Generate Panel Structure with GPT-5.2
    // ========================================================================

    // Build cast list for planner
    const castListText = castLocks.map(c => 
      `- ID: ${c.id} | Name: ${c.name} | DNA: ${c.visual_dna_lock.text.substring(0, 100)}...`
    ).join('\n');

    // Build scene context
    const sceneContext = screenplay_context || {
      slugline: scene_slugline || 'Untitled Scene',
      scene_summary: scene_text,
      scene_dialogue: dialogue_blocks.length > 0
        ? dialogue_blocks.slice(0, 10).map(d => `${d.speaker_id}: "${d.text}"`).join('\n')
        : '',
    };

    const userPrompt = buildStoryboardPlannerUserPrompt({
      storyboard_style,
      panel_count: targetPanelCount,
      style_pack_lock_text: stylePackLock.text,
      cast_list: castListText || 'No characters specified',
      location_lock_text: locationLock?.visual_lock.text || 'Location not specified',
      slugline: sceneContext.slugline,
      scene_summary: sceneContext.scene_summary,
      scene_dialogue: sceneContext.scene_dialogue || '',
    });

    // Call GPT-5.2 for panel structure
    const aiData = await aiFetch({
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      apiKey: lovableApiKey!,
      payload: {
        model: "openai/gpt-5.2",
        messages: [
          { role: "system", content: STORYBOARD_PLANNER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        ...buildTokenLimit("openai/gpt-5.2", 12000),
        response_format: { type: "json_object" },
      },
      label: "storyboard_plan_v1",
      supabase,
      projectId: project_id,
    });

    const content = (aiData.choices as Array<{ message?: { content?: string } }>)?.[0]?.message?.content || "";
    
    // Parse JSON from response
    let panelsData: { panels: StoryboardPanel[] };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        panelsData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (parseError) {
      console.error("[generate-storyboard] Parse error:", parseError, "Content:", content.substring(0, 500));
      throw new Error("Failed to parse storyboard panels from AI response");
    }

    const panels = panelsData.panels || [];
    console.log(`[generate-storyboard] Generated ${panels.length} panels structure`);

    // ========================================================================
    // PHASE 3: Persist Panels to Database
    // ========================================================================

    // Upsert storyboards wrapper table
    const { data: storyboardRecord, error: storyboardError } = await supabase
      .from("storyboards")
      .upsert({
        project_id,
        scene_id,
        status: "draft",
        style_id: storyboard_style,
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

    // Normalize characters_present to array of IDs
    const normalizeCharacters = (chars: any[]): string[] => {
      if (!chars || chars.length === 0) return [];
      return chars.map(c => typeof c === 'string' ? c : c.character_id).filter(Boolean);
    };

    // Insert new panels with full v1.0 SPEC compliance
    const panelsToInsert = panels.map((panel, idx) => {
      const charactersPresent = normalizeCharacters(panel.characters_present || []);
      
      // Build staging with schema_version
      const staging = {
        schema_version: "1.0",
        movement_arrows: panel.staging?.movement_arrows 
          || panel.movement_arrows?.map(a => ({ subject: a.type, direction: a.direction, intent: '' }))
          || [],
        spatial_info: panel.staging?.spatial_info 
          || panel.spatial_info?.camera_relative_position 
          || '',
        axis_180: panel.staging?.axis_180 || {
          enabled: panel.spatial_info?.axis_locked || false,
          screen_direction: 'left_to_right',
        },
      };

      // Build continuity with schema_version
      const continuity = {
        schema_version: "1.0",
        visual_dna_lock_ids: castLocks.map(c => c.id),
        style_pack_lock_id: 'STYLE_PACK',
        must_match_previous: panel.continuity?.must_match_previous || ['hair', 'wardrobe', 'scale'],
        do_not_change: panel.continuity?.do_not_change || ['age', 'species'],
      };

      return {
        scene_id,
        project_id,
        panel_no: panel.panel_no || idx + 1,
        panel_code: panel.panel_code || panel.panel_id || `P${idx + 1}`,
        panel_intent: panel.panel_intent,
        shot_hint: panel.shot_hint,
        dialogue_snippet: panel.dialogue_snippet || null,
        location_id: locationLock?.id || null,
        image_prompt: '', // Will be built per-panel during image generation
        action_beat_ref: panel.action_beat || panel.action || null,
        characters_present: charactersPresent,
        props_present: (panel.props_present || []).map((p: any) => typeof p === 'string' ? p : p.prop_id),
        staging,
        continuity,
        image_url: null,
        image_status: 'pending',
        image_error: null,
        approved: false,
      };
    });

    const { data: insertedPanels, error: insertError } = await supabase
      .from("storyboard_panels")
      .insert(panelsToInsert)
      .select();

    if (insertError) {
      console.error("[generate-storyboard] Insert error:", insertError);
      throw insertError;
    }

    console.log(`[SB] after_db_insert`, { 
      count: insertedPanels?.length, 
      panelIds: insertedPanels?.map((p: any) => p.id).slice(0, 3) 
    });

    // ========================================================================
    // PHASE 4: Generate Images with Lock-based Prompts
    // ========================================================================

    const generatedPanels = [];
    const panelsToProcess = insertedPanels || [];
    console.log(`[SB] entering_image_loop`, { toProcess: panelsToProcess.length });

    for (const panel of panelsToProcess) {
      const panelNo = panel.panel_no;
      try {
        // Mark panel as generating
        await supabase
          .from("storyboard_panels")
          .update({ image_status: 'generating' })
          .eq("id", panel.id);

        // Calculate deterministic seed
        const seed = generateSeed(scene_id, storyboard_style, panelNo);
        console.log(`[SB] generating_panel`, { no: panelNo, id: panel.id, seed });

        // Get character names for present characters
        const presentCharNames = castLocks
          .filter(c => panel.characters_present.includes(c.id))
          .map(c => c.name);

        // Check for missing DNA
        const presentCharsWithMissingDna = castLocks
          .filter(c => panel.characters_present.includes(c.id))
          .filter(c => !validateCharacterDNA(c).valid);

        // Build panel spec for prompt builder
        const panelSpec: PanelSpec = {
          panel_code: panel.panel_code,
          shot_hint: panel.shot_hint,
          panel_intent: panel.panel_intent,
          action: panel.action_beat_ref || panel.panel_intent,
          dialogue_snippet: panel.dialogue_snippet,
          characters_present: presentCharNames,
          props_present: panel.props_present || [],
          staging: {
            spatial_info: panel.staging?.spatial_info || '',
            movement_arrows: panel.staging?.movement_arrows || [],
            axis_180: panel.staging?.axis_180 || { enabled: false, screen_direction: 'left_to_right' },
          },
          continuity: {
            must_match_previous: panel.continuity?.must_match_previous || [],
            do_not_change: panel.continuity?.do_not_change || [],
          },
        };

        // Build complete image prompt using the prompt builder v2.0
        // Uses Character Pack Data for enhanced identity enforcement
        const imagePrompt = buildStoryboardImagePrompt({
          storyboard_style,
          style_pack_lock: stylePackLock,
          location_lock: locationLock,
          cast: castLocks,
          characters_present_ids: panel.characters_present,
          panel_spec: panelSpec,
          character_pack_data: characterPackData, // v2.0 enhanced data
        });

        // If characters have missing DNA, add warning
        if (presentCharsWithMissingDna.length > 0) {
          const warningMsg = `WARNING: Missing DNA for: ${presentCharsWithMissingDna.map(c => c.name).join(', ')}`;
          await supabase
            .from("storyboard_panels")
            .update({ image_error: warningMsg })
            .eq("id", panel.id);
        }

        // Generate image with NanoBanana
        const imageResult = await generateImageWithNanoBanana({
          lovableApiKey: lovableApiKey!,
          promptText: imagePrompt,
          label: `storyboard_panel_${panelNo}`,
          seed,
          supabase,
          projectId: project_id,
        });

        console.log(`[SB] image_result`, { 
          no: panelNo, 
          success: imageResult.success, 
          hasUrl: !!imageResult.imageUrl,
          hasBase64: !!imageResult.imageBase64,
          error: imageResult.error?.slice(0, 200)
        });

        if (imageResult.success && (imageResult.imageUrl || imageResult.imageBase64)) {
          let finalImageUrl = imageResult.imageUrl;

          // Upload base64 to Supabase Storage if needed
          if (imageResult.imageBase64 && !imageResult.imageUrl?.startsWith("http")) {
            const binaryData = Uint8Array.from(
              atob(imageResult.imageBase64),
              (c) => c.charCodeAt(0)
            );
            const fileName = `storyboard/${panel.id}.png`;
            console.log(`[SB] uploading_panel`, { no: panelNo, fileName });

            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("project-assets")
              .upload(fileName, binaryData, {
                contentType: "image/png",
                upsert: true,
              });

            if (!uploadError && uploadData) {
              const { data: publicUrl } = supabase.storage
                .from("project-assets")
                .getPublicUrl(fileName);
              finalImageUrl = publicUrl.publicUrl;
              console.log(`[SB] uploaded_ok`, { no: panelNo, url: finalImageUrl?.slice(0, 80) });
            } else {
              console.error(`[SB] upload_error`, { no: panelNo, error: uploadError });
              await supabase
                .from("storyboard_panels")
                .update({ 
                  image_status: 'error',
                  image_error: `Storage upload failed: ${uploadError?.message || 'Unknown'}`
                })
                .eq("id", panel.id);
              generatedPanels.push({ ...panel, image_error: uploadError?.message });
              continue;
            }
          }

          if (finalImageUrl) {
            // Keep any DNA warnings, just update URL and status
            const currentError = presentCharsWithMissingDna.length > 0
              ? `WARNING: Missing DNA for: ${presentCharsWithMissingDna.map(c => c.name).join(', ')}`
              : null;

            await supabase
              .from("storyboard_panels")
              .update({ 
                image_url: finalImageUrl,
                image_prompt: imagePrompt.substring(0, 2000), // Store prompt for debugging
                image_status: 'success',
                image_error: currentError,
              })
              .eq("id", panel.id);

            generatedPanels.push({ ...panel, image_url: finalImageUrl, image_error: currentError });
            console.log(`[SB] panel_complete`, { no: panelNo, seed });
          } else {
            await supabase
              .from("storyboard_panels")
              .update({ image_status: 'error', image_error: 'No final URL generated' })
              .eq("id", panel.id);
            generatedPanels.push({ ...panel, image_error: 'No final URL' });
          }
        } else {
          const errMsg = imageResult.error?.slice(0, 500) || 'Image generation failed';
          console.error(`[SB] image_failed`, { no: panelNo, error: errMsg });
          await supabase
            .from("storyboard_panels")
            .update({ image_status: 'error', image_error: errMsg })
            .eq("id", panel.id);
          generatedPanels.push({ ...panel, image_error: errMsg });
        }
      } catch (imgError) {
        const errMsg = imgError instanceof Error ? imgError.message : String(imgError);
        console.error(`[SB] panel_error`, { no: panelNo, id: panel.id, error: errMsg.slice(0, 500) });
        
        await supabase
          .from("storyboard_panels")
          .update({ 
            image_status: 'error',
            image_error: errMsg.slice(0, 500)
          })
          .eq("id", panel.id);
        
        generatedPanels.push({ ...panel, image_error: errMsg });
      }
    }

    console.log(`[SB] loop_complete`, { 
      generated: generatedPanels.length,
      withImages: generatedPanels.filter((p: any) => p.image_url).length,
      withErrors: generatedPanels.filter((p: any) => p.image_error).length,
      withWarnings: generatedPanels.filter((p: any) => p.image_error?.startsWith('WARNING')).length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        storyboard_id: storyboardRecord?.id,
        storyboard_style,
        panels: generatedPanels,
        dna_warnings: dnaWarnings,
        message: `Generated ${generatedPanels.length} storyboard panels (${storyboard_style})`,
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
