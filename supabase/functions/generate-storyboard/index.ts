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

      // HARDENING: Only push if ID is a valid UUID
      const isValidUuid = (s?: string) =>
        !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

      if (!isValidUuid(char.id)) {
        console.warn(`[SB] cast_lock_skip_invalid`, { name: char.name, id: char.id });
        continue;
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
      
      // HARDENING: Only push if ID is valid
      const isValidUuid = (s?: string) =>
        !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
      
      if (!isValidUuid(char.id)) {
        console.warn(`[SB] cast_lock_fallback_skip_invalid`, { name: char.name, id: char.id });
        continue;
      }

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
  characterRefs: { id?: string; name: string; image_url?: string }[],
  projectId: string
): Promise<CharacterPackLockData[]> {
  if (!characterRefs || characterRefs.length === 0) {
    return [];
  }

  const packData: CharacterPackLockData[] = [];

  for (const char of characterRefs) {
    try {
      let charData: any = null;
      let charId = char.id;

      // If no ID provided, look up by name in the project
      if (!charId) {
        const { data: lookupResult } = await supabase
          .from('characters')
          .select('id')
          .eq('project_id', projectId)
          .ilike('name', char.name)
          .limit(1)
          .single();
        
        if (lookupResult?.id) {
          charId = lookupResult.id;
          console.log(`[SB] Resolved character "${char.name}" to ID: ${charId}`);
        } else {
          console.log(`[SB] Character "${char.name}" not found in project, using silhouette`);
          packData.push({
            id: `unknown_${char.name}`,
            name: char.name,
            reference_frontal: char.image_url,
            has_approved_pack: false,
          });
          continue;
        }
      }

      // Get character + active visual DNA + role
      const { data: fetchedChar } = await supabase
        .from('characters')
        .select(`
          id, name, character_role, visual_dna, wardrobe_lock_json,
          character_visual_dna!character_visual_dna_character_id_fkey(
            visual_dna, continuity_lock, is_active
          )
        `)
        .eq('id', charId)
        .single();
      
      charData = fetchedChar;

      // Get reference images (frontal and profile) from pack slots
      // FIX: Use charId (resolved) instead of char.id (may be undefined)
      const { data: packSlots } = await supabase
        .from('character_pack_slots')
        .select('slot_type, image_url, status')
        .eq('character_id', charId)
        .in('status', ['accepted', 'generated', 'uploaded'])
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
        id: charId!,
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
        id: char.id || `unknown_${char.name}`,
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
    const characterPackData = await buildCharacterPackData(supabase, character_refs, project_id);
    
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

    // Helper: normalize key for matching
    const cleanKey = (s: string) =>
      s.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");

    // Use characterPackData as source (has resolved IDs from buildCharacterPackData)
    // Fall back to castLocks if characterPackData is empty
    const castSource = characterPackData.length > 0 
      ? characterPackData.filter(c => c.id && !c.id.startsWith('unknown_'))
      : castLocks.filter(c => isUuid(c.id));

    console.log(`[SB] cast_source_for_planner`, { 
      source: characterPackData.length > 0 ? 'characterPackData' : 'castLocks',
      count: castSource.length,
      names: castSource.map(c => c.name)
    });

    // Build cast list for planner with explicit keys for resolution
    const castListText = castSource.map(c => 
      `- KEY: "${cleanKey(c.name)}" | ID: ${c.id} | Name: ${c.name}`
    ).join('\n');

    // Build scene context
    const sceneContext = screenplay_context || {
      slugline: scene_slugline || 'Untitled Scene',
      scene_summary: scene_text,
      scene_dialogue: dialogue_blocks.length > 0
        ? dialogue_blocks.slice(0, 10).map(d => `${d.speaker_id}: "${d.text}"`).join('\n')
        : '',
    };

    // Build cast keys instruction for planner
    const castKeysInstruction = `
═══════════════════════════════════════════════════════════════
CRITICAL OUTPUT RULES FOR characters_present:
═══════════════════════════════════════════════════════════════
- Use ONLY keys or IDs from the cast list above.
- Valid keys: ${castSource.map(c => `"${cleanKey(c.name)}"`).join(', ')}
- NEVER output "undefined", "null", or empty strings.
- If no characters appear in a panel, use an empty array [].
- Do NOT invent characters - use ONLY those listed above.
═══════════════════════════════════════════════════════════════`;

    const userPrompt = buildStoryboardPlannerUserPrompt({
      storyboard_style,
      panel_count: targetPanelCount,
      style_pack_lock_text: stylePackLock.text,
      cast_list: castListText ? `${castListText}\n${castKeysInstruction}` : 'No characters specified',
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
    // PHASE 2.5: ROBUST CHARACTER RESOLUTION (Post-Planner Normalization)
    // ========================================================================
    
    // Helpers for ID validation
    const isUuid = (s?: string) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

    const isBadToken = (s?: string) => {
      const v = (s || "").trim().toLowerCase();
      return !v || v === "undefined" || v === "null" || v === "none" || v === "n/a";
    };

    // =========================================================================
    // HARDENED CAST INDEX - Never insert undefined/invalid IDs
    // =========================================================================
    type CastHit = { id: string; name: string; key: string };
    const castIndex = new Map<string, CastHit>();

    const addToIndex = (id: any, name: any) => {
      // CRITICAL: Skip if not a valid UUID
      if (!isUuid(id)) return;
      if (!name || typeof name !== "string") return;
      
      const key = cleanKey(name);
      const hit: CastHit = { id, name, key };
      
      // Multiple keys for flexible lookup
      castIndex.set(id, hit);                    // by UUID
      castIndex.set(key, hit);                   // by normalized key
      castIndex.set(name.toLowerCase(), hit);   // by exact lowercase name
    };

    // ✅ PRIORITY 1: characterPackData (IDs are properly resolved in buildCharacterPackData)
    for (const c of (characterPackData || [])) {
      addToIndex(c.id, c.name);
    }

    // ✅ PRIORITY 2: castLocks (only if ID is valid UUID - already filtered above)
    for (const c of (castLocks || [])) {
      addToIndex(c.id, c.name);
    }

    console.log("[SB] cast_index_built", {
      key_count: castIndex.size,
      sample_keys: [...castIndex.keys()].filter(k => k && k !== "undefined").slice(0, 12),
      valid_ids: [...new Set([...castIndex.values()].map(v => v.id))].length,
    });

    // Normalize characters_present in each panel (resolve names/keys to IDs)
    for (const panel of panels) {
      const raw = Array.isArray(panel.characters_present) ? panel.characters_present : [];
      const keysField = Array.isArray((panel as any).characters_present_keys) 
        ? (panel as any).characters_present_keys 
        : [];

      // Merge both fields and extract tokens
      const merged = [...raw, ...keysField]
        .map((x: any) => typeof x === 'string' ? x.trim() : x?.character_id?.trim?.())
        .filter((x: any) => typeof x === 'string' && !isBadToken(x));

      const resolvedIds: string[] = [];
      for (const token of merged) {
        // If already a valid UUID in our cast, use it
        if (isUuid(token) && castIndex.has(token)) {
          resolvedIds.push(token);
          continue;
        }
        // Try to resolve by key/name
        const hit = castIndex.get(cleanKey(token)) || castIndex.get(token.toLowerCase());
        if (hit && isUuid(hit.id)) {  // CRITICAL: Validate UUID before pushing
          resolvedIds.push(hit.id);
          console.log(`[SB] char_resolved`, { token, id: hit.id, name: hit.name });
        } else if (hit) {
          console.warn(`[SB] char_resolve_invalid_uuid`, { token, hitId: hit.id, hitName: hit.name });
        }
      }

      // Deduplicate and assign back (only valid UUIDs)
      panel.characters_present = [...new Set(resolvedIds)].filter(id => isUuid(id));

      // Warning if we couldn't resolve any but had tokens
      if (panel.characters_present.length === 0 && merged.length > 0) {
        console.warn(`[SB] char_resolve_failed`, { 
          panel: panel.panel_no || panel.panel_id,
          raw_tokens: merged.slice(0, 5),
          available_keys: [...castIndex.keys()].filter(k => k !== "undefined").slice(0, 10)
        });
      }
    }

    console.log(`[SB] post_normalize`, { 
      panels: panels.map((p: any) => ({ 
        no: p.panel_no || p.panel_id, 
        chars: p.characters_present.filter((c: string) => isUuid(c)),
        raw_count: p.characters_present.length
      }))
    });

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

    // Normalize characters_present to array of IDs (already normalized above, just extract)
    const normalizeCharacters = (chars: any[]): string[] => {
      if (!chars || chars.length === 0) return [];
      // Already normalized to string IDs by Phase 2.5
      return chars.filter((c: any) => typeof c === 'string' && isUuid(c));
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
    // PHASE 4: Return immediately (images rendered by render-storyboard-batch)
    // ========================================================================
    // NOTE: Image generation has been moved to render-storyboard-batch
    // to avoid Edge Function timeouts. The frontend calls that function
    // in a loop after this function returns.

    console.log(`[SB] plan_complete`, { 
      panels_created: insertedPanels?.length || 0,
      style: storyboard_style,
      images_pending: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        storyboard_id: storyboardRecord?.id,
        storyboard_style,
        panels_created: insertedPanels?.length || 0,
        panels: insertedPanels,
        images_pending: true,
        dna_warnings: dnaWarnings,
        message: `Created ${insertedPanels?.length || 0} panels. Use render-storyboard-batch to generate images.`,
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
