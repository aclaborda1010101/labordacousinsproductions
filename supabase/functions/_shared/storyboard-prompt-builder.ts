/**
 * Storyboard Prompt Builder v2.0 - Professional Lock System
 * 
 * PRIORITY ORDER: STYLE PACK > CHARACTER PACK > CONTINUITY > PANEL
 * 
 * Builds image prompts by concatenating blocks in strict order:
 * SYSTEM_CONTEXT + STYLE_PACK_LOCK + STORYBOARD_STYLE_LOCK + LOCATION_LOCK + 
 * CHARACTER_PACK_LOCK + PANEL_SPEC + CONTINUITY_LOCK + EXTENDED_NEGATIVE
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

// ============================================================================
// CHARACTER PACK LOCK DATA (v2.0)
// ============================================================================

export interface CharacterPackLockData {
  id: string;
  name: string;
  role?: string;
  age?: string | number;
  height?: string;
  body_type?: string;
  face_description?: string;
  hair_description?: string;
  wardrobe_lock?: string;
  reference_frontal?: string;
  reference_profile?: string;
  has_approved_pack: boolean;
}

// Canvas Format - Global video format configuration
export interface CanvasFormat {
  aspect_ratio: '16:9' | '9:16' | '1:1' | '4:5' | '3:4';
  orientation: 'horizontal' | 'vertical' | 'square';
  safe_area: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface BuildStoryboardPromptOptions {
  storyboard_style: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
  style_pack_lock: StylePackLock;
  location_lock?: LocationLock;
  cast: CharacterLock[];
  characters_present_ids: string[];
  panel_spec: PanelSpec;
  // v2.0: Enhanced Character Pack Data
  character_pack_data?: CharacterPackLockData[];
  // v3.0: Panel count for sheet layout specification
  panel_count?: number;
  // v4.0: Canvas Format (global video format)
  canvas_format?: CanvasFormat;
}

// ============================================================================
// STORYBOARD FORMAT CONTRACT (HIGHEST PRIORITY — NEVER VIOLATE)
// ============================================================================

const STORYBOARD_FORMAT_CONTRACT = `═══════════════════════════════════════════════════════════════════════════════
STORYBOARD FORMAT CONTRACT (HIGHEST PRIORITY — NEVER VIOLATE)
═══════════════════════════════════════════════════════════════════════════════

You must output EXACTLY ONE of the following fixed formats, depending on storyboard_style:
A) GRID_SHEET_V1  = one sheet containing 6–9 panels in a clean grid layout
B) TECH_PAGE_V1   = one technical sheet containing 4–6 panels with stronger technical annotations

ABSOLUTE RULES (MUST):
- Keep the SAME page layout, panel framing system, line weight, and paper texture across the ENTIRE generation
- Grayscale pencil storyboard only. Clean linework. Subtle paper grain
- Each panel must contain:
  - Panel label "P{n}" clearly visible
  - Shot type label (e.g., PG/PM/PMC/OTS/2SHOT/INSERT/LOW/TRACK/PP) visible
  - Simple directional arrows only when needed (movement/camera)
- Composition must be readable at thumbnail size. Clear silhouettes
- Consistent margins, consistent panel borders, consistent typography style for labels

ABSOLUTE PROHIBITIONS (NEVER):
- Do NOT switch to comic/cartoon/anime/3D/colored illustration
- Do NOT change the sheet format mid-generation
- Do NOT add new UI frames, decorative backgrounds, or cinematic posters
- Do NOT invent different label styles. Use the SAME label style in all panels
- Do NOT output a single-panel "cinematic frame" if storyboard_style requests a sheet

IF CONFLICT EXISTS:
STORYBOARD FORMAT CONTRACT overrides everything else (including panel description)
═══════════════════════════════════════════════════════════════════════════════`;

// ============================================================================
// PACK-FIRST CANON (GLOBAL RULE)
// ============================================================================

const PACK_FIRST_CANON = `═══════════════════════════════════════════════════════════════════════════════
PACK_FIRST_CANON (GLOBAL RULE)
═══════════════════════════════════════════════════════════════════════════════

Canon priority for ANY downstream document or generation:
1) CANVAS FORMAT (aspect ratio + orientation + safe zones)
2) FORMAT CONTRACT (layout + framing + labels)
3) STYLE PACK (drawing style + paper + line weight)
4) CHARACTER PACK (identity + wardrobe)
5) LOCATION PACK (set dressing + environment anchors)
6) CONTINUITY LOCKS (axis, props, wardrobe continuity)
7) PANEL/SHOT DESCRIPTION (what happens)

Any conflict must be resolved by higher priority. Never invent character identity if pack exists.
═══════════════════════════════════════════════════════════════════════════════`;

// ============================================================================
// CANVAS LOCK BUILDER (v4.0)
// ============================================================================

const DEFAULT_CANVAS_FORMAT: CanvasFormat = {
  aspect_ratio: '16:9',
  orientation: 'horizontal',
  safe_area: { top: 5, bottom: 5, left: 5, right: 5 }
};

/**
 * Builds the CANVAS_LOCK block for storyboard prompts.
 * This ensures consistent framing across the entire pipeline.
 */
function buildCanvasLockBlock(canvasFormat: CanvasFormat = DEFAULT_CANVAS_FORMAT): string {
  const orientationRules = canvasFormat.orientation === 'vertical' 
    ? `VERTICAL FORMAT RULES:
- More medium shots, less wide panoramas
- Vertical subject alignment
- Characters closer to camera
- Action flows top-to-bottom, not left-to-right`
    : canvasFormat.orientation === 'square'
    ? `SQUARE FORMAT RULES:
- Centered, compact composition
- Balanced headroom and footroom
- Symmetrical when appropriate`
    : `HORIZONTAL FORMAT RULES:
- Use full horizontal space
- Rule of thirds applies laterally
- Wide panoramas allowed
- Action flows left-to-right`;

  return `═══════════════════════════════════════════════════════════════════════════════
CANVAS_LOCK (GLOBAL — NEVER OVERRIDE)
═══════════════════════════════════════════════════════════════════════════════

Target video format:
- Aspect ratio: ${canvasFormat.aspect_ratio}
- Orientation: ${canvasFormat.orientation}

All storyboard panels MUST:
- Be composed for this aspect ratio
- Keep characters and action inside safe area (${canvasFormat.safe_area.top}% top, ${canvasFormat.safe_area.bottom}% bottom, ${canvasFormat.safe_area.left}% left, ${canvasFormat.safe_area.right}% right)
- Avoid framing that would be cropped in final video
- Respect ${canvasFormat.orientation} composition balance

${orientationRules}

This canvas applies to: Storyboard → Camera Plan → Keyframes → Video Render
═══════════════════════════════════════════════════════════════════════════════`;
}

// ============================================================================
// CONSTANTS - STYLE BLOCKS (v3.0 - IMPERATIVE WITH LAYOUT SPECIFICATION)
// ============================================================================

const GRID_SHEET_STYLE_BLOCK = `RENDER TARGET: GRID_SHEET_V1

You are rendering a SINGLE storyboard SHEET with panels arranged in a clean grid.
The sheet must look like a professional pencil storyboard printout.

STYLE (LOCKED):
- Grayscale pencil storyboard, clean linework, subtle shading (3–5 values)
- Off-white paper with light grain
- Consistent border thickness and label typography

SHEET LAYOUT (MUST):
- Grid layout: 2 rows if panel_count is 7–9; 2–3 rows if 6 panels (keep balanced)
- Each panel has visible label "P{n}" and shot-type chip

CHARACTER PACK (PACK-FIRST):
Only depict characters using the provided character pack references.
If a character is present in this panel, match face, hair, and wardrobe to the pack.
If uncertain, simplify but do NOT change identity.

CONTINUITY:
Maintain axis, screen direction, and wardrobe continuity across panels.

NOW RENDER THE FULL SHEET. No extra text outside labels.`;

const TECH_PAGE_STYLE_BLOCK = `RENDER TARGET: TECH_PAGE_V1

You are rendering a SINGLE technical storyboard SHEET with panels.
This format is more technical: add simple camera arrows, blocking arrows, and minimal notes.

STYLE (LOCKED):
- Grayscale pencil storyboard
- Technical cleanliness: clear arrows, clean annotations
- Off-white paper, consistent borders and label style

SHEET LAYOUT (MUST):
- 2 rows layout preferred
- Panel label "P{n}" + shot-type label always visible

TECH ANNOTATIONS (MUST, minimal):
- Camera direction arrow if movement occurs
- Blocking arrow for subject movement if needed
- NO verbose paragraphs. Only short technical marks

CHARACTER PACK (PACK-FIRST):
Use character pack references as identity truth. Never drift identity.

NOW RENDER THE FULL TECH SHEET. No stylistic changes.`;

const DEFAULT_STORYBOARD_STYLE_PACK = `- Storyboard look: professional pencil storyboard, grayscale, clean linework
- Paper: subtle off-white texture, light grain
- Readability: clear silhouettes, correct perspective
- Lighting: simple value structure (3-5 tones)`;

// ============================================================================
// EXTENDED NEGATIVE PROMPT (v3.0 - ENHANCED WITH FORMAT GUARDS)
// ============================================================================

const EXTENDED_NEGATIVE_BLOCK = `NEGATIVE (NEVER GENERATE):
- wrong character age
- generic child / adult with wrong proportions
- incorrect facial features
- different hairstyle than reference
- different clothing than wardrobe lock
- missing storyboard labels (P1, P2...)
- colored illustration
- cinematic lighting (keep flat storyboard lighting)
- depth of field effects
- photorealism or 3D render
- fantasy/stylized art style
- AI artifacts (extra limbs, distorted faces, melted features)
- concept art finish (must be pencil sketch)
- invented characters not in cast list
- background characters with detailed faces (should be silhouettes)
- single-panel cinematic frame when sheet format is requested
- decorative borders or poster-style composition`;

// ============================================================================
// CLOSE-UP IDENTITY REINFORCEMENT (for PP/PMC/ECU shots)
// ============================================================================

/**
 * Returns extra identity enforcement for close-up shots where face is dominant.
 */
export function getCloseupIdentityReinforcement(
  shotHint: string, 
  charNames: string[]
): string {
  const upper = (shotHint || '').toUpperCase();
  const isCloseup = ['PP', 'PMC', 'CLOSE', 'ECU', 'CU', 'BCU', 'XCU'].some(t => upper.includes(t));
  
  if (!isCloseup || charNames.length === 0) return '';
  
  return `
═══════════════════════════════════════════════════════════════════════════════
⚠️ CLOSE-UP IDENTITY RULES (CRITICAL FOR ${shotHint.toUpperCase()}) ⚠️
═══════════════════════════════════════════════════════════════════════════════

This is a ${shotHint.toUpperCase()} shot - the face occupies MOST of the frame.
IDENTITY ACCURACY IS CRITICAL. Any drift will be immediately visible.

For ${charNames.join(', ')}:

1. FACE MUST MATCH REFERENCE EXACTLY:
   - Same nose shape, lip thickness, eye spacing
   - Same jawline and cheekbone structure
   - Same brow shape and forehead proportion

2. HAIR MUST MATCH REFERENCE EXACTLY:
   - Same hairline position and shape
   - Same volume, texture, and length
   - Same color (in grayscale value)

3. AGE MUST BE IDENTICAL TO REFERENCE:
   - A child cannot look older or younger
   - Proportions must be age-appropriate
   - No wrinkles if young, proper aging if old

4. IF UNCERTAIN:
   - SIMPLIFY the drawing
   - Use fewer details rather than wrong details
   - Favor silhouette over invented features

═══════════════════════════════════════════════════════════════════════════════
DO NOT create a generic person that "looks similar".
The reference images ARE the character - match them EXACTLY.
═══════════════════════════════════════════════════════════════════════════════`;
}

// ============================================================================
// CHARACTER PACK LOCK BUILDER (v2.0)
// ============================================================================

/**
 * Builds the CHARACTER PACK LOCK block for storyboard prompts.
 * This is the single source of truth for character identity.
 */
export function buildCharacterPackLockBlock(characters: CharacterPackLockData[]): string {
  if (!characters || characters.length === 0) {
    return `CHARACTER PACK (ONLY THESE MAY APPEAR):
No characters defined. Render all figures as neutral silhouettes.

NO OTHER CHARACTERS MAY APPEAR.
If any person is in the scene without data, draw SILHOUETTE only.`;
  }

  const charBlocks = characters.map(char => {
    const lines: string[] = [
      `CHARACTER ID: ${char.id}`,
      `NAME: ${char.name}`,
    ];
    
    if (char.role) lines.push(`ROLE: ${char.role}`);
    if (char.age) lines.push(`AGE: ${char.age} (STRICT - DO NOT CHANGE)`);
    if (char.height) lines.push(`HEIGHT: ${char.height}`);
    if (char.body_type) lines.push(`BODY TYPE: ${char.body_type}`);
    if (char.face_description) lines.push(`FACE: ${char.face_description}`);
    if (char.hair_description) lines.push(`HAIR: ${char.hair_description}`);
    if (char.wardrobe_lock) lines.push(`CLOTHING (LOCKED): ${char.wardrobe_lock}`);
    
    lines.push('REFERENCES:');
    lines.push(char.reference_frontal ? '- frontal reference approved ✓' : '- frontal reference MISSING (use silhouette for face)');
    lines.push(char.reference_profile ? '- profile reference approved ✓' : '- profile reference MISSING');
    
    lines.push('IDENTITY RULES:');
    lines.push('- Must match approved pack visuals exactly');
    lines.push('- No redesign of facial features');
    lines.push('- No age shift (STRICT)');
    lines.push('- No proportion change');
    lines.push('- No wardrobe change from lock');
    
    return lines.join('\n');
  }).join('\n\n---\n\n');

  return `CHARACTER PACK (ONLY THESE MAY APPEAR):

${charBlocks}

═══════════════════════════════════════════════════════════════
ABSOLUTE RULES:
- NO OTHER CHARACTERS MAY APPEAR IN THIS STORYBOARD.
- Background figures ONLY if explicitly allowed, and ONLY as silhouettes/blur.
- If character data is missing, render as SILHOUETTE only - never invent features.
- Unknown persons = faceless silhouette/blur.
═══════════════════════════════════════════════════════════════`;
}

// ============================================================================
// MAIN BUILDER FUNCTION (v2.0)
// ============================================================================

/**
 * Builds the complete image prompt by concatenating blocks in strict order
 * PRIORITY: STYLE PACK > CHARACTER PACK > CONTINUITY > PANEL
 */
export function buildStoryboardImagePrompt(options: BuildStoryboardPromptOptions): string {
  const {
    storyboard_style,
    style_pack_lock,
    location_lock,
    cast,
    characters_present_ids,
    panel_spec,
    character_pack_data,
    panel_count,
    canvas_format,
  } = options;

  // 0. CANVAS LOCK (HIGHEST PRIORITY - FIRST BLOCK)
  const canvasLockBlock = buildCanvasLockBlock(canvas_format || DEFAULT_CANVAS_FORMAT);

  // 0.1 FORMAT CONTRACT (SECOND HIGHEST PRIORITY)
  const formatContractBlock = STORYBOARD_FORMAT_CONTRACT;

  // 0.2 PACK-FIRST CANON (GLOBAL RULE)
  const packFirstBlock = PACK_FIRST_CANON;

  // 0.2 IDENTITY LOCK (multimodal instruction)
  const identityLockBlock = `IDENTITY LOCK (HARD):
Use the ATTACHED REFERENCE IMAGES as the ONLY identity source.
The reference images are being sent as multimodal inputs - YOU CAN SEE THEM.
Match face shape, hair, age, and proportions EXACTLY to the references.
Do NOT create generic characters.
If identity is unclear, simplify the drawing but KEEP THE SAME IDENTITY.
Character Pack text descriptions are SECONDARY to the actual image references.`;

  // 1. STYLE_PACK_LOCK (global)
  const stylePackBlock = `STYLE_PACK_LOCK (GLOBAL - HIGHEST PRIORITY):
${style_pack_lock.text || DEFAULT_STORYBOARD_STYLE_PACK}`;

  // 2. STORYBOARD_STYLE_LOCK (with panel_count if provided)
  let storyboardStyleBlock = storyboard_style === 'GRID_SHEET_V1'
    ? GRID_SHEET_STYLE_BLOCK
    : TECH_PAGE_STYLE_BLOCK;

  // Inject panel_count into the render block if provided
  if (panel_count) {
    storyboardStyleBlock = storyboardStyleBlock.replace(
      /SHEET LAYOUT \(MUST\):/,
      `SHEET LAYOUT (MUST):\n- Exactly ${panel_count} panels on the same sheet`
    );
  }

  // 3. LOCATION_LOCK (references now sent as multimodal, not text URLs)
  const locationBlock = location_lock
    ? `LOCATION_LOCK:
${location_lock.visual_lock.text}
Reference images: [attached as multimodal inputs]`
    : '';

  // 4. CHARACTER PACK LOCK (v2.0 - replaces old CAST_LOCK + DNA_LOCKS)
  let characterPackBlock: string;
  
  if (character_pack_data && character_pack_data.length > 0) {
    // Use enhanced character pack data
    const presentCharData = character_pack_data.filter(c => characters_present_ids.includes(c.id));
    characterPackBlock = buildCharacterPackLockBlock(presentCharData);
  } else {
    // Fallback to legacy cast lock format
    const presentChars = cast.filter(c => characters_present_ids.includes(c.id));
    const missingDnaChars: string[] = [];
    
    const dnaBlocks = presentChars.map(c => {
      const hasRefs = c.reference_images.length > 0;
      const hasDna = c.visual_dna_lock?.text && c.visual_dna_lock.text !== 'No DNA available';
      
      if (!hasRefs && !hasDna) {
        missingDnaChars.push(c.name);
        return `Character ${c.name} (${c.id}): DNA/REFS MISSING - render as SILHOUETTE/BACK VIEW only`;
      }
      
      // Reference images now sent as multimodal inputs, not text URLs
      return `Character ${c.name} (${c.id}) MUST MATCH:
${c.visual_dna_lock?.text || 'Use reference images only'}
Reference images: [attached as multimodal inputs]`;
    }).join('\n\n');

    characterPackBlock = `CHARACTER PACK (ONLY THESE MAY APPEAR):
${dnaBlocks || 'No characters in this panel.'}

HARD RULE: Do NOT invent new characters. Unknown persons = faceless silhouette/blur.`;
  }

  // 5. PANEL_SPEC
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

  // 6. CONTINUITY_LOCK
  const continuityBlock = `CONTINUITY_LOCK:
- Keep continuity with previous panels: ${panel_spec.continuity.must_match_previous.join(', ') || 'none specified'}
- Do not change: ${panel_spec.continuity.do_not_change.join(', ') || 'none specified'}
- Respect 180-degree axis: ${panel_spec.staging.axis_180.screen_direction}
- Maintain spatial relations between characters`;

  // 7. EXTENDED NEGATIVE (v3.0)
  const negativeBlock = EXTENDED_NEGATIVE_BLOCK;

  // 8. CLOSE-UP IDENTITY REINFORCEMENT (for PP/PMC shots)
  const closeupReinforcement = getCloseupIdentityReinforcement(
    panel_spec.shot_hint,
    panel_spec.characters_present
  );

  // Concatenate in strict priority order (CANVAS LOCK FIRST)
  return [
    canvasLockBlock,      // HIGHEST PRIORITY - CANVAS LOCK (v4.0)
    formatContractBlock,  // FORMAT CONTRACT
    packFirstBlock,       // PACK-FIRST CANON
    identityLockBlock,    // IDENTITY LOCK (multimodal)
    closeupReinforcement, // CLOSE-UP IDENTITY REINFORCEMENT (if applicable)
    stylePackBlock,
    storyboardStyleBlock,
    locationBlock,
    characterPackBlock,
    panelBlock,
    continuityBlock,
    negativeBlock,
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
 * Validates if a character has sufficient DNA/refs for rendering (legacy)
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
// CHARACTER PACK VALIDATION (v2.0)
// ============================================================================

/**
 * Validates character pack data for storyboard generation.
 * Returns blockers (must fix) and warnings (can proceed but suboptimal).
 */
export function validateCharacterPackForStoryboard(
  characters: CharacterPackLockData[]
): { 
  valid: boolean; 
  blockers: string[]; 
  warnings: string[];
} {
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const char of characters) {
    // Critical: must have frontal reference for identity
    if (!char.reference_frontal) {
      blockers.push(`${char.name}: Missing frontal reference (REQUIRED for identity)`);
    }
    
    // Important but not blocking
    if (!char.has_approved_pack) {
      warnings.push(`${char.name}: No approved reference pack - identity may vary`);
    }
    if (!char.age) {
      warnings.push(`${char.name}: Age not specified - may cause proportion issues`);
    }
    if (!char.wardrobe_lock) {
      warnings.push(`${char.name}: No wardrobe lock - clothing may vary between panels`);
    }
    if (!char.reference_profile) {
      warnings.push(`${char.name}: Missing profile reference - side views may be inconsistent`);
    }
  }

  return {
    valid: blockers.length === 0,
    blockers,
    warnings,
  };
}

// ============================================================================
// GPT-5.2 STORYBOARD PLANNER PROMPTS (v2.0)
// ============================================================================

export const STORYBOARD_ARTIST_SYSTEM_PROMPT = `You are a PROFESSIONAL FILM STORYBOARD ARTIST working in pre-production.

This is NOT concept art.
This is NOT character design.
This is NOT creative illustration.

Your job is to produce TECHNICAL STORYBOARD PANELS that strictly follow:
- the provided STYLE PACK
- the provided CHARACTER PACK
- the provided CONTINUITY RULES

ABSOLUTE RULES:
- NEVER invent characters.
- NEVER change age, body proportions, or identity.
- ONLY draw characters explicitly listed in the CHARACTER PACK.
- If character data is missing or unclear, draw a neutral silhouette and flag a warning internally.
- Respect cinematic grammar (shot size, axis, staging).
- Respect storyboard conventions: framing, arrows, labels, notes.

PRIORITY ORDER (if any instruction conflicts):
STYLE PACK > CHARACTER PACK > CONTINUITY > PANEL DESCRIPTION`;

export const STORYBOARD_PLANNER_SYSTEM_PROMPT = `You are a storyboard planner for film/animation.
Output MUST be valid JSON only. No markdown. No commentary.

ABSOLUTE RULES:
- You MUST follow constraints and NEVER invent characters outside the provided cast list.
- characters_present MUST contain ONLY character IDs from the cast list provided.
- If a character is not in the cast list, they CANNOT appear.
- Background figures should be marked as "silhouettes" in staging, never given identity.`;

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
- cast (ONLY ALLOWED characters): ${options.cast_list}
- location_lock: ${options.location_lock_text}
- screenplay_context:
  slugline: ${options.slugline}
  summary: ${options.scene_summary}
  dialogue: ${options.scene_dialogue || 'none'}

═══════════════════════════════════════════════════════════════
HARD RULES (MANDATORY):
═══════════════════════════════════════════════════════════════
1) characters_present MUST contain ONLY ids from the cast list above.
2) If DNA/ref missing for a character, still list the character but note in staging that rendering will use silhouette/back view.
3) DO NOT invent new characters. If the scene needs extras, do NOT list them in characters_present - they will be rendered as silhouettes automatically.
4) Each panel must include:
   - panel_no (1-based integer)
   - panel_code (P1, P2, P3...)
   - shot_hint (one of: PG, PM, PMC, PP, 2SHOT, OTS, TOP, LOW, TRACK, INSERT, MONTAGE)
   - panel_intent (why this panel exists - 1 sentence)
   - action (visual action description - 1-2 sentences)
   - dialogue_snippet (short quote if relevant, else null)
   - characters_present (array of character ids from cast ONLY)
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
       do_not_change: ["age", "species", "gender_presentation", "facial_features"]
     }

OUTPUT FORMAT:
Return a JSON object with a "panels" array containing exactly ${options.panel_count} panels.
{
  "panels": [
    { ...panel object... },
    ...
  ]
}

Generate panels that tell the scene clearly and cinematically, respecting 180° axis when possible.
REMEMBER: Only use character IDs from the cast list. Never invent characters.`;
}
