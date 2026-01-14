/**
 * Storyboard Prompt Builder v1.0
 * 
 * Builds image prompts by concatenating blocks in strict order:
 * STYLE_PACK_LOCK + STORYBOARD_STYLE_LOCK + LOCATION_LOCK + CAST_LOCK + 
 * CHARACTER_DNA_LOCKS + PANEL_SPEC + CONTINUITY_LOCK + FAILSAFE_NEGATIVE
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StylePackLock {
  schema_version: string;
  text: string;
}

export interface CharacterLock {
  id: string;
  name: string;
  visual_dna_lock: { schema_version: string; text: string };
  reference_images: string[];
}

export interface LocationLock {
  id: string;
  name: string;
  visual_lock: { schema_version: string; text: string };
  reference_images: string[];
}

export interface PanelSpec {
  panel_code: string;
  shot_hint: string;
  panel_intent: string;
  action: string;
  dialogue_snippet?: string;
  characters_present: string[];
  props_present: string[];
  staging: {
    spatial_info: string;
    movement_arrows: Array<{ subject: string; direction: string; intent: string }>;
    axis_180: { enabled: boolean; screen_direction: string };
  };
  continuity: {
    must_match_previous: string[];
    do_not_change: string[];
  };
}

export interface BuildStoryboardPromptOptions {
  storyboard_style: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
  style_pack_lock: StylePackLock;
  location_lock?: LocationLock;
  cast: CharacterLock[];
  characters_present_ids: string[];
  panel_spec: PanelSpec;
}

// ============================================================================
// CONSTANTS - STYLE BLOCKS
// ============================================================================

const GRID_SHEET_STYLE_BLOCK = `STORYBOARD_STYLE_LOCK: GRID_SHEET_V1
- Output: professional pencil storyboard, grayscale, clean linework, consistent line weight
- Paper: subtle off-white texture, light grain, no heavy stains
- Readability: clear silhouettes, correct perspective, no warped anatomy
- Lighting: simple value structure (3-5 tones), avoid full rendering
- No color. Grayscale pencil only.`;

const TECH_PAGE_STYLE_BLOCK = `STORYBOARD_STYLE_LOCK: TECH_PAGE_V1
- Output: technical storyboard page with 4-6 panels
- Include technical headings and shot abbreviations (PG/PM/PMC/PP)
- Allow simple movement arrows and blocking diagrams
- Clean layout, readable. Grayscale pencil only.`;

const FAILSAFE_NEGATIVE_BLOCK = `FAILSAFE_NEGATIVE:
- No photorealism, no 3D render, no color illustration
- No distorted faces, no extra limbs, no broken perspective
- No random wardrobe changes, no age shifts
- No modern digital concept art
- Must be storyboard pencil sketch`;

const DEFAULT_STORYBOARD_STYLE_PACK = `- Storyboard look: professional pencil storyboard, grayscale, clean linework
- Paper: subtle off-white texture, light grain
- Readability: clear silhouettes, correct perspective
- Lighting: simple value structure (3-5 tones)`;

// ============================================================================
// MAIN BUILDER FUNCTION
// ============================================================================

/**
 * Builds the complete image prompt by concatenating blocks in strict order
 */
export function buildStoryboardImagePrompt(options: BuildStoryboardPromptOptions): string {
  const {
    storyboard_style,
    style_pack_lock,
    location_lock,
    cast,
    characters_present_ids,
    panel_spec,
  } = options;

  // 1. STYLE_PACK_LOCK (global)
  const stylePackBlock = `STYLE_PACK_LOCK (GLOBAL):
${style_pack_lock.text || DEFAULT_STORYBOARD_STYLE_PACK}`;

  // 2. STORYBOARD_STYLE_LOCK
  const storyboardStyleBlock = storyboard_style === 'GRID_SHEET_V1'
    ? GRID_SHEET_STYLE_BLOCK
    : TECH_PAGE_STYLE_BLOCK;

  // 3. LOCATION_LOCK
  const locationBlock = location_lock
    ? `LOCATION_LOCK:
${location_lock.visual_lock.text}
Reference images: ${location_lock.reference_images.length > 0 ? location_lock.reference_images.join(', ') : 'none'}`
    : '';

  // 4. CAST_LOCK
  const castBlock = `CAST_LOCK (ONLY THESE CHARACTERS MAY APPEAR):
${cast.map(c => `- CharacterID: ${c.id} | Name: ${c.name}`).join('\n')}`;

  // 5. CHARACTER_DNA_LOCKS (only for characters_present)
  const presentChars = cast.filter(c => characters_present_ids.includes(c.id));
  const missingDnaChars: string[] = [];
  
  const dnaBlocks = presentChars.map(c => {
    const hasRefs = c.reference_images.length > 0;
    const hasDna = c.visual_dna_lock?.text && c.visual_dna_lock.text !== 'No DNA available';
    
    if (!hasRefs && !hasDna) {
      missingDnaChars.push(c.name);
      return `Character ${c.name} (${c.id}): DNA/REFS MISSING - render as SILHOUETTE/BACK VIEW only`;
    }
    
    return `Character ${c.name} (${c.id}) MUST MATCH:
${c.visual_dna_lock?.text || 'Use reference images only'}
Reference images: ${c.reference_images.length > 0 ? c.reference_images.join(', ') : 'none'}`;
  }).join('\n\n');

  const characterDnaBlock = `CHARACTER_DNA_LOCKS:
${dnaBlocks || 'No characters in this panel.'}

HARD RULE: Do NOT invent new characters. Unknown persons = faceless silhouette/blur.`;

  // 6. PANEL_SPEC
  const movementArrowsText = panel_spec.staging.movement_arrows.length > 0
    ? panel_spec.staging.movement_arrows.map(a => `${a.subject} ${a.direction}`).join('; ')
    : 'none';

  const panelBlock = `PANEL_SPEC:
PanelCode: ${panel_spec.panel_code}
ShotHint: ${panel_spec.shot_hint}
Intent: ${panel_spec.panel_intent}
Action: ${panel_spec.action}
${panel_spec.dialogue_snippet ? `Dialogue: "${panel_spec.dialogue_snippet}"` : ''}
CharactersPresent: ${panel_spec.characters_present.join(', ') || 'none'}
Props: ${panel_spec.props_present.join(', ') || 'none'}
StagingNotes: ${panel_spec.staging.spatial_info || 'none'}
MovementArrows: ${movementArrowsText}`;

  // 7. CONTINUITY_LOCK
  const continuityBlock = `CONTINUITY_LOCK:
- Keep continuity with previous panels: ${panel_spec.continuity.must_match_previous.join(', ') || 'none specified'}
- Do not change: ${panel_spec.continuity.do_not_change.join(', ') || 'none specified'}
- Respect 180-degree axis: ${panel_spec.staging.axis_180.screen_direction}`;

  // 8. FAILSAFE_NEGATIVE
  const failsafeBlock = FAILSAFE_NEGATIVE_BLOCK;

  // Concatenate in order
  return [
    stylePackBlock,
    storyboardStyleBlock,
    locationBlock,
    castBlock,
    characterDnaBlock,
    panelBlock,
    continuityBlock,
    failsafeBlock,
  ].filter(Boolean).join('\n\n');
}

// ============================================================================
// HELPER FUNCTIONS FOR BUILDING LOCKS
// ============================================================================

/**
 * Builds Visual DNA text from structured DNA object
 */
export function buildVisualDNAText(dna: Record<string, any> | null): string {
  if (!dna) return 'No DNA available';

  const parts: string[] = [];
  const physical = dna.physical_identity || {};
  const hair = dna.hair?.head_hair || {};
  const face = dna.face || {};
  const wardrobe = dna.wardrobe || {};

  if (physical.age_exact_for_prompt) parts.push(`Age: ${physical.age_exact_for_prompt}`);
  else if (physical.age_range) parts.push(`Age range: ${physical.age_range}`);
  
  if (physical.body_type?.somatotype) parts.push(`Build: ${physical.body_type.somatotype}`);
  if (physical.height) parts.push(`Height: ${physical.height}`);
  if (physical.skin_tone_hex) parts.push(`Skin tone: ${physical.skin_tone_hex}`);
  
  if (hair.color?.natural_base) {
    parts.push(`Hair: ${hair.color.natural_base} ${hair.length?.type || ''} ${hair.texture || ''}`);
  }
  
  if (face.shape) parts.push(`Face shape: ${face.shape}`);
  if (face.distinctive_features?.length) {
    parts.push(`Distinctive features: ${face.distinctive_features.join(', ')}`);
  }
  
  if (wardrobe.default_outfit) {
    parts.push(`Default outfit: ${wardrobe.default_outfit}`);
  }

  return parts.length > 0 ? parts.join('\n') : 'No DNA available';
}

/**
 * Gets default style pack lock for storyboard
 */
export function getDefaultStylePackLock(): StylePackLock {
  return {
    schema_version: '1.0',
    text: DEFAULT_STORYBOARD_STYLE_PACK,
  };
}

/**
 * Validates if a character has sufficient DNA/refs for rendering
 */
export function validateCharacterDNA(char: CharacterLock): {
  valid: boolean;
  warning?: string;
} {
  const hasDna = char.visual_dna_lock?.text && char.visual_dna_lock.text !== 'No DNA available';
  const hasRefs = char.reference_images.length > 0;

  if (!hasDna && !hasRefs) {
    return {
      valid: false,
      warning: `Missing DNA and reference images for ${char.name}. Will render as silhouette.`,
    };
  }

  if (!hasDna) {
    return {
      valid: true,
      warning: `No Visual DNA for ${char.name}, using reference images only.`,
    };
  }

  return { valid: true };
}

// ============================================================================
// GPT-5.2 STORYBOARD PLANNER PROMPTS
// ============================================================================

export const STORYBOARD_PLANNER_SYSTEM_PROMPT = `You are a storyboard planner for film/animation.
Output MUST be valid JSON only. No markdown. No commentary.
You MUST follow constraints and never invent characters outside the provided cast list.`;

export function buildStoryboardPlannerUserPrompt(options: {
  storyboard_style: string;
  panel_count: number;
  style_pack_lock_text: string;
  cast_list: string;
  location_lock_text: string;
  slugline: string;
  scene_summary: string;
  scene_dialogue: string;
}): string {
  return `TASK:
Create a storyboard panel plan for ONE scene. Output a JSON array of panels.

INPUTS:
- storyboard_style: ${options.storyboard_style}
- panel_count: ${options.panel_count}
- style_pack_lock (global): ${options.style_pack_lock_text}
- cast (allowed characters): ${options.cast_list}
- location_lock: ${options.location_lock_text}
- screenplay_context:
  slugline: ${options.slugline}
  summary: ${options.scene_summary}
  dialogue: ${options.scene_dialogue || 'none'}

HARD RULES:
1) characters_present must contain ONLY ids from cast list.
2) If DNA/ref missing for a character, still list the character but rendering will use silhouette/back view.
3) Each panel must include:
   - panel_no (1-based integer)
   - panel_code (P1, P2, P3...)
   - shot_hint (one of: PG, PM, PMC, PP, 2SHOT, OTS, TOP, LOW, TRACK, INSERT, MONTAGE)
   - panel_intent (why this panel exists - 1 sentence)
   - action (visual action description - 1-2 sentences)
   - dialogue_snippet (short quote if relevant, else null)
   - characters_present (array of character ids from cast)
   - props_present (array of prop names as strings)
   - staging: {
       schema_version: "1.0",
       movement_arrows: [{ subject: string, direction: string, intent: string }],
       spatial_info: string,
       axis_180: { enabled: boolean, screen_direction: "left_to_right" | "right_to_left" }
     }
   - continuity: {
       schema_version: "1.0",
       must_match_previous: ["hair", "wardrobe", "scale", "line_weight"],
       do_not_change: ["age", "species", "gender_presentation"]
     }

OUTPUT FORMAT:
Return a JSON object with a "panels" array containing exactly ${options.panel_count} panels.
{
  "panels": [
    { ...panel object... },
    ...
  ]
}

Generate panels that tell the scene clearly and cinematically, respecting 180° axis when possible.`;
}
