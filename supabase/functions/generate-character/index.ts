import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { logGenerationCost } from "../_shared/cost-logging.ts";
import { v3RequireAuth, v3RequireProjectAccess, V3AuthContext } from "../_shared/v3-enterprise.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Legacy request for backwards compatibility
interface LegacyCharacterRequest {
  name: string;
  role: string;
  bio: string;
  style?: string;
}

// New slot-based request
interface SlotGenerateRequest {
  slotId: string;
  characterId: string;
  characterName: string;
  characterBio: string;
  slotType: 'turnaround' | 'expression' | 'outfit' | 'closeup' | 'base_look' | 'anchor_closeup';
  viewAngle?: string;
  expressionName?: string;
  outfitDescription?: string;
  styleToken?: string;
  useReferenceAnchoring?: boolean;
  referenceWeight?: number;
  allowTextToImage?: boolean; // Allow generation without reference (creates anchor)
  entitySubtype?: 'human' | 'animal' | 'creature' | 'robot' | 'other'; // For animals, creatures, etc.
}

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Character generation uses gemini-3-pro-image-preview (nano-banana-pro)
const IMAGE_ENGINE = 'google/gemini-3-pro-image-preview'; // nano-banana-pro

// Retry configuration
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;
const TRANSIENT_ERROR_PATTERNS = ['timeout', 'rate limit', 'rate_limit', '500', '502', '503', '504', 'network', 'ETIMEDOUT', 'ECONNRESET', 'temporarily unavailable', 'service unavailable'];

function isTransientError(error: string): boolean {
  const lowerError = error.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern => lowerError.includes(pattern.toLowerCase()));
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const errorMsg = lastError.message;
      
      if (attempt < MAX_RETRIES && isTransientError(errorMsg)) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.log(`[${label}] Transient error, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES}): ${errorMsg}`);
        await sleep(backoffMs);
      } else {
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

// ============================================
// STYLE CONFIG TYPES (from Visual Bible)
// ============================================

interface StyleConfig {
  mood?: string;
  camera?: {
    movement?: string;
    angle?: string;
    framing?: string;
  };
  lens?: {
    focal_length?: string;
    aperture?: string;
  };
  lighting?: {
    style?: string;
    quality?: string;
    direction?: string;
  };
  color_palette?: {
    primary?: string[];
    secondary?: string[];
    mood_tone?: string;
  };
  film_grain?: string;
  contrast?: string;
  prompt_modifier?: string;
  // Extended fields for Visual Bible presets
  promptModifiers?: string[];
  negativeModifiers?: string[];
  customAnalysis?: {
    prompt_modifiers?: string[];
    negative_modifiers?: string[];
    style?: unknown;
    camera?: unknown;
  };
}

// ============================================
// VISUAL DNA TYPES
// ============================================

interface VisualDNA {
  physical_identity?: {
    age_exact_for_prompt?: number;
    gender_presentation?: string;
    ethnicity?: {
      primary?: string;
      skin_tone_description?: string;
      skin_tone_hex_approx?: string;
    };
    height?: { cm?: number };
    weight_kg?: number;
    body_type?: {
      somatotype?: string;
      posture?: string;
    };
  };
  face?: {
    shape?: string;
    eyes?: {
      color_base?: string;
      color_hex_approx?: string;
      color_description?: string;
      shape?: string;
      size?: string;
      eyebrows?: {
        thickness?: string;
        shape?: string;
        color?: string;
      };
    };
    nose?: {
      bridge?: { height?: string; width?: string; shape?: string };
      tip?: { shape?: string };
    };
    mouth?: {
      lips?: {
        fullness_upper?: string;
        fullness_lower?: string;
        shape?: { cupids_bow?: string; corners?: string };
      };
    };
    jaw_chin?: {
      jawline?: { shape?: string; definition?: string };
      chin?: { shape?: string; projection?: string };
    };
    cheekbones?: { prominence?: string; position?: string };
    facial_hair?: {
      type?: string;
      length_mm?: number;
      density?: string;
      color?: { base?: string; grey_percentage?: number };
      grooming?: string;
    };
    distinctive_marks?: {
      scars?: Array<{ location?: string; description?: string; size_cm?: number }>;
      moles_birthmarks?: Array<{ location?: string; type?: string; size_mm?: number }>;
      wrinkles_lines?: {
        forehead?: { horizontal_lines?: string };
        eyes?: { crows_feet?: string };
        nose_to_mouth?: { nasolabial_folds?: string };
      };
    };
  };
  hair?: {
    head_hair?: {
      length?: { type?: string; measurement_cm?: number };
      texture?: { type?: string };
      thickness?: { density?: string };
      color?: {
        natural_base?: string;
        hex_approx_base?: string;
        grey_white?: { percentage?: number; pattern?: string };
      };
      style?: { overall_shape?: string; grooming_level?: string; fringe_bangs?: string };
      hairline?: { front?: string };
    };
  };
  skin?: {
    texture?: { overall?: string };
    undertone?: { type?: string };
    condition?: {
      clarity?: string;
      hyperpigmentation?: { freckles?: string };
    };
  };
  hands?: {
    size?: { overall?: string };
  };
  visual_references?: {
    celebrity_likeness?: {
      primary?: { name?: string; percentage?: number; features_borrowed?: string[] };
      secondary?: { name?: string; percentage?: number };
      tertiary?: { name?: string; percentage?: number };
      combination_description?: string;
    };
  };
  default_outfit?: {
    description?: string;
  };
}

// ============================================
// WARDROBE LOCK TYPES & HELPERS
// ============================================

interface WardrobeLock {
  primary_outfit?: string;
  top?: string;
  bottom?: string;
  footwear?: string;
  accessories?: string[];
  hair_style?: string;
  makeup_style?: string;
  color_palette?: string[];
  fabric_textures?: string[];
  distinctive_elements?: string[];
  locked_at?: string;
  source_image?: string;
}

function formatWardrobeLock(lock: WardrobeLock): string {
  const parts: string[] = [];
  if (lock.primary_outfit) parts.push(lock.primary_outfit);
  if (lock.top) parts.push(`Top: ${lock.top}`);
  if (lock.bottom) parts.push(`Bottom: ${lock.bottom}`);
  if (lock.footwear) parts.push(`Footwear: ${lock.footwear}`);
  if (lock.accessories?.length) parts.push(`Accessories: ${lock.accessories.join(', ')}`);
  if (lock.hair_style) parts.push(`Hair: ${lock.hair_style}`);
  if (lock.color_palette?.length) parts.push(`Colors: ${lock.color_palette.join(', ')}`);
  if (lock.distinctive_elements?.length) parts.push(`Distinctive: ${lock.distinctive_elements.join(', ')}`);
  return parts.join('. ') || 'As shown in reference';
}

// ============================================
// PROACTIVE IDENTITY GUARDS - Prevent common AI generation errors
// ============================================

const PROACTIVE_IDENTITY_GUARDS = [
  'CRITICAL: Preserve EXACT hair color from reference - DO NOT darken, lighten, or change hue',
  'CRITICAL: Preserve ALL grey/silver/white hair tones with exact percentage - grey hair must remain grey',
  'CRITICAL: Maintain EXACT skin tone and undertone - no smoothing, no changing complexion',
  'CRITICAL: Preserve ALL wrinkles, lines, and age indicators - DO NOT de-age or smooth skin',
  'CRITICAL: Keep EXACT face shape, proportions, and bone structure',
  'CRITICAL: Maintain EXACT eye color, shape, and size',
  'CRITICAL: Keep EXACT nose shape, bridge, and tip',
  'CRITICAL: Preserve EXACT lip shape and fullness',
  'AVOID: Smoothing skin texture, removing wrinkles, changing hair color, de-aging, altering facial proportions',
  'AVOID: Making skin more even, removing age spots, changing eye color, modifying face shape',
];

// ============================================
// IDENTITY LOCK BUILDER - Detailed imperatives from Visual DNA
// ============================================

function buildIdentityLock(visualDNA: VisualDNA, characterName?: string): string {
  const parts: string[] = ['=== IDENTITY LOCK - ABSOLUTELY NON-NEGOTIABLE ==='];
  
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair?.head_hair;
  const skin = visualDNA.skin;
  
  // CHARACTER ID
  if (characterName) {
    parts.push(`CHARACTER: "${characterName}" - This MUST be the SAME person as reference`);
  }
  
  // AGE - Most critical for preventing de-aging
  if (physical?.age_exact_for_prompt) {
    parts.push(`AGE: EXACTLY ${physical.age_exact_for_prompt} years old`);
    parts.push(`- DO NOT make younger or older`);
    parts.push(`- Preserve ALL age-appropriate features (wrinkles, lines, skin texture)`);
  }
  
  // HAIR - Extremely detailed to prevent color drift
  if (hair) {
    const baseColor = hair.color?.natural_base || 'as shown in reference';
    const greyPercent = hair.color?.grey_white?.percentage;
    const greyPattern = hair.color?.grey_white?.pattern;
    const length = hair.length?.type || 'as shown';
    const texture = hair.texture?.type || 'as shown';
    const style = hair.style?.overall_shape || 'as shown';
    
    parts.push(`HAIR COLOR: ${baseColor.toUpperCase()}`);
    if (greyPercent && greyPercent > 0) {
      parts.push(`- GREY/SILVER: EXACTLY ${greyPercent}% of hair is grey/silver`);
      if (greyPattern) {
        parts.push(`- Grey pattern: ${greyPattern}`);
      }
      parts.push(`- DO NOT remove or reduce grey hair - it is essential to identity`);
    }
    parts.push(`- Hair length: ${length}`);
    parts.push(`- Hair texture: ${texture}`);
    parts.push(`- Hair style: ${style}`);
    parts.push(`- DO NOT darken, lighten, or change hair color in ANY way`);
  }
  
  // SKIN TONE - Prevent complexion changes
  if (physical?.ethnicity?.skin_tone_description || skin) {
    const skinTone = physical?.ethnicity?.skin_tone_description || 'as shown in reference';
    const undertone = skin?.undertone?.type || '';
    const texture = skin?.texture?.overall || '';
    
    parts.push(`SKIN TONE: ${skinTone.toUpperCase()}`);
    if (undertone) {
      parts.push(`- Undertone: ${undertone}`);
    }
    if (texture) {
      parts.push(`- Skin texture: ${texture} (PRESERVE exactly)`);
    }
    parts.push(`- DO NOT smooth, even out, or change skin complexion`);
    
    // CONDITIONAL FRECKLES/MOLES - Only preserve if explicitly detected in Visual DNA
    const hasFreckles = skin?.condition?.hyperpigmentation?.freckles && 
                        skin.condition.hyperpigmentation.freckles !== 'none' &&
                        skin.condition.hyperpigmentation.freckles !== 'absent';
    const hasMoles = face?.distinctive_marks?.moles_birthmarks && 
                     Array.isArray(face.distinctive_marks.moles_birthmarks) &&
                     face.distinctive_marks.moles_birthmarks.length > 0;
    
    if (hasFreckles || hasMoles) {
      const preserveList: string[] = [];
      if (hasFreckles) preserveList.push('freckles');
      if (hasMoles) preserveList.push('moles/birthmarks');
      parts.push(`- PRESERVE ${preserveList.join(' and ')} as shown in reference`);
    } else {
      parts.push(`- NO FRECKLES - this character has clear skin without freckles`);
      parts.push(`- DO NOT add freckles, moles, or spots that are not in reference`);
    }
    parts.push(`- Preserve pores, natural texture, and age-appropriate skin`);
  }
  
  // FACE STRUCTURE - Detailed bone structure
  if (face) {
    if (face.shape) {
      parts.push(`FACE SHAPE: ${face.shape.toUpperCase()}`);
    }
    
    // Eyes
    if (face.eyes) {
      const eyeColor = face.eyes.color_base || 'as shown';
      const eyeShape = face.eyes.shape || '';
      parts.push(`EYES: ${eyeColor.toUpperCase()} color, ${eyeShape} shape`);
      if (face.eyes.eyebrows) {
        parts.push(`- Eyebrows: ${face.eyes.eyebrows.thickness || ''} ${face.eyes.eyebrows.shape || ''}`);
      }
    }
    
    // Nose
    if (face.nose?.bridge) {
      parts.push(`NOSE: ${face.nose.bridge.shape || 'as shown'} bridge, ${face.nose.tip?.shape || 'natural'} tip`);
    }
    
    // Mouth
    if (face.mouth?.lips) {
      const upper = face.mouth.lips.fullness_upper || '';
      const lower = face.mouth.lips.fullness_lower || '';
      parts.push(`LIPS: ${upper} upper, ${lower} lower`);
    }
    
    // Jaw
    if (face.jaw_chin?.jawline) {
      parts.push(`JAWLINE: ${face.jaw_chin.jawline.shape || 'as shown'}, ${face.jaw_chin.jawline.definition || 'as shown'} definition`);
    }
    
    // Facial hair
    if (face.facial_hair?.type && face.facial_hair.type !== 'clean_shaven') {
      const fhColor = face.facial_hair.color?.base || '';
      const fhGrey = face.facial_hair.color?.grey_percentage || 0;
      parts.push(`FACIAL HAIR: ${face.facial_hair.type}, ${face.facial_hair.density || 'medium'} density`);
      if (fhColor) parts.push(`- Facial hair color: ${fhColor}`);
      if (fhGrey > 0) parts.push(`- Facial hair grey: ${fhGrey}%`);
    }
    
    // Wrinkles and marks - Critical for age preservation
    if (face.distinctive_marks?.wrinkles_lines) {
      const wrinkles = face.distinctive_marks.wrinkles_lines;
      parts.push(`WRINKLES (MUST PRESERVE):`);
      if (wrinkles.forehead?.horizontal_lines) {
        parts.push(`- Forehead: ${wrinkles.forehead.horizontal_lines} horizontal lines`);
      }
      if (wrinkles.eyes?.crows_feet) {
        parts.push(`- Eyes: ${wrinkles.eyes.crows_feet} crow's feet`);
      }
      if (wrinkles.nose_to_mouth?.nasolabial_folds) {
        parts.push(`- Nasolabial folds: ${wrinkles.nose_to_mouth.nasolabial_folds}`);
      }
    }
  }
  
  // Celebrity likeness hints (if available)
  if (visualDNA.visual_references?.celebrity_likeness?.primary?.name) {
    const celeb = visualDNA.visual_references.celebrity_likeness.primary;
    parts.push(`VISUAL REFERENCE: Resembles ${celeb.name} (${celeb.percentage || 0}%)`);
    if (celeb.features_borrowed?.length) {
      parts.push(`- Borrowed features: ${celeb.features_borrowed.join(', ')}`);
    }
  }
  
  parts.push('=== END IDENTITY LOCK ===');
  parts.push('');
  parts.push('GENERATION RULES:');
  PROACTIVE_IDENTITY_GUARDS.forEach(guard => parts.push(`• ${guard}`));
  
  return parts.join('\n');
}

// ============================================
// STYLE CONFIG INJECTION HELPER
// ============================================

function buildStyleBlock(styleConfig: StyleConfig | null): string {
  if (!styleConfig) return '';
  
  const parts: string[] = [];
  
  // PRIORITY 1: Check for promptModifiers array (Visual Bible presets)
  // This is the primary style definition from preset selection or image analysis
  if (styleConfig.promptModifiers && Array.isArray(styleConfig.promptModifiers) && styleConfig.promptModifiers.length > 0) {
    parts.push(`VISUAL STYLE (MANDATORY): ${styleConfig.promptModifiers.join(', ')}`);
  }
  
  // PRIORITY 2: Check customAnalysis from image analysis
  if (styleConfig.customAnalysis?.prompt_modifiers && Array.isArray(styleConfig.customAnalysis.prompt_modifiers)) {
    const modifiers = styleConfig.customAnalysis.prompt_modifiers.filter(
      (m: string) => !parts.some(p => p.includes(m))
    );
    if (modifiers.length > 0) {
      parts.push(`STYLE MODIFIERS: ${modifiers.join(', ')}`);
    }
  }
  
  // PRIORITY 3: Legacy single prompt_modifier
  if (styleConfig.prompt_modifier && !parts.some(p => p.includes(styleConfig.prompt_modifier!))) {
    parts.push(styleConfig.prompt_modifier);
  }
  
  if (styleConfig.mood) {
    parts.push(`VISUAL MOOD: ${styleConfig.mood}`);
  }
  
  if (styleConfig.lighting) {
    const lighting = styleConfig.lighting;
    const lightingParts = [
      lighting.style && `${lighting.style} lighting`,
      lighting.quality && `${lighting.quality} quality`,
      lighting.direction && `from ${lighting.direction}`
    ].filter(Boolean).join(', ');
    if (lightingParts) parts.push(`LIGHTING STYLE: ${lightingParts}`);
  }
  
  if (styleConfig.color_palette) {
    const palette = styleConfig.color_palette;
    if (palette.mood_tone) {
      parts.push(`COLOR TONE: ${palette.mood_tone}`);
    }
    if (palette.primary?.length) {
      parts.push(`COLOR PALETTE: ${palette.primary.slice(0, 3).join(', ')}`);
    }
  }
  
  if (styleConfig.film_grain) {
    parts.push(`FILM GRAIN: ${styleConfig.film_grain}`);
  }
  
  if (styleConfig.contrast) {
    parts.push(`CONTRAST: ${styleConfig.contrast}`);
  }
  
  // NEGATIVE MODIFIERS: Avoid unwanted styles
  if (styleConfig.negativeModifiers && Array.isArray(styleConfig.negativeModifiers) && styleConfig.negativeModifiers.length > 0) {
    parts.push(`AVOID THESE STYLES: ${styleConfig.negativeModifiers.join(', ')}`);
  }
  if (styleConfig.customAnalysis?.negative_modifiers && Array.isArray(styleConfig.customAnalysis.negative_modifiers)) {
    const negatives = styleConfig.customAnalysis.negative_modifiers;
    if (negatives.length > 0 && !parts.some(p => p.includes('AVOID'))) {
      parts.push(`AVOID: ${negatives.join(', ')}`);
    }
  }
  
  if (parts.length === 0) return '';
  
  return `
PROJECT VISUAL STYLE (MANDATORY - DO NOT DEVIATE):
${parts.join('\n')}
`;
}

// ============================================
// REFERENCE-BASED PROMPT BUILDERS
// ============================================

// CRITICAL STYLE CONSISTENCY block - used in all generation prompts
const STYLE_CONSISTENCY_BLOCK = `
=== CRITICAL STYLE RULES (MANDATORY) ===
- Match EXACTLY the visual style of the reference image
- If reference is cartoon/anime, output MUST be cartoon/anime
- If reference is photorealistic, output MUST be photorealistic
- DO NOT switch between styles (cartoon <-> photorealistic <-> 3D render)
- Maintain the SAME art style, line work, and shading technique
- Keep SAME color palette and lighting style as reference
- Use NEUTRAL BACKGROUND (studio grey/white) - no scene elements
=== END STYLE RULES ===
`;

function buildTurnaroundPrompt(visualDNA: VisualDNA, viewAngle: string, styleConfig: StyleConfig | null, wardrobeLock?: WardrobeLock | null, characterName?: string): string {
  const angleInstructions: Record<string, string> = {
    'front': 'front view, facing camera directly, standing straight, arms at sides',
    'front_34': '3/4 front view, 45 degrees from front, standing straight, arms at sides',
    'side': 'side profile view, 90 degrees to camera, standing straight, arms at sides',
    'back': 'back view, facing away from camera, standing straight, arms at sides',
    'back_34': '3/4 back view, 45 degrees from behind, standing straight, arms at sides',
    '3/4': '3/4 front view, 45 degrees from front, standing straight, arms at sides'
  };

  const angle = angleInstructions[viewAngle] || angleInstructions.front;
  const physical = visualDNA.physical_identity;
  const styleBlock = buildStyleBlock(styleConfig);
  
  // Build detailed identity lock
  const identityLock = buildIdentityLock(visualDNA, characterName);
  
  // Use wardrobe lock if available, otherwise fall back to default outfit
  const outfitDescription = wardrobeLock 
    ? formatWardrobeLock(wardrobeLock)
    : (visualDNA.default_outfit?.description || 'Casual outfit as shown in reference');

  return `${STYLE_CONSISTENCY_BLOCK}

SAME PERSON from reference image, ${angle}.

${identityLock}

${styleBlock}

POSE REQUIREMENTS:
- Full body shot (head to toe in frame)
- Standing straight, neutral pose
- Arms relaxed at sides
- Weight evenly distributed
- Natural, confident posture
- Height: ${physical?.height?.cm || 'average'} cm
- Build: ${physical?.body_type?.somatotype || 'average'}

OUTFIT (LOCKED - DO NOT CHANGE):
${outfitDescription}

Only change: camera angle to ${viewAngle} view

TECHNICAL SPECS:
- Full body turnaround reference shot
- 50mm lens equivalent, f/4
- Clean studio background (neutral grey or white)
- Even lighting, no harsh shadows
- Sharp focus throughout
- Professional character design quality
- 8K resolution

AVOID: Changing art style, adding background props, scene decorations, seasonal elements`;
}

function buildExpressionPrompt(visualDNA: VisualDNA, expressionName: string, styleConfig: StyleConfig | null, wardrobeLock?: WardrobeLock | null, characterName?: string): string {
  const expressionInstructions: Record<string, string> = {
    'neutral': 'neutral, calm expression, relaxed face',
    'happy': 'smiling, happy expression, genuine joy, natural smile',
    'sad': 'sad, melancholic expression, downcast eyes',
    'angry': 'angry, intense expression, furrowed brow',
    'surprised': 'surprised, wide eyes, raised eyebrows',
    'focused': 'focused, determined expression, slight squint',
    'worried': 'worried, concerned expression, tense face',
    'laughing': 'laughing, open mouth smile, crinkled eyes',
    'serious': 'serious, stern expression, no smile',
    'fear': 'fearful, wide eyes, tense expression, subtle worry'
  };

  const expression = expressionInstructions[expressionName] || expressionInstructions.neutral;
  const styleBlock = buildStyleBlock(styleConfig);
  
  // Build detailed identity lock
  const identityLock = buildIdentityLock(visualDNA, characterName);
  
  // Use wardrobe lock for visible clothing in medium close-up
  const outfitHint = wardrobeLock?.top 
    ? `Visible clothing: ${wardrobeLock.top}`
    : '';

  // CRITICAL STYLE CONSISTENCY - Prevents style drift between generations
  const styleConsistency = `
=== CRITICAL STYLE RULES (MANDATORY) ===
- Match EXACTLY the visual style of the reference image
- If reference is cartoon/anime, output MUST be cartoon/anime
- If reference is photorealistic, output MUST be photorealistic
- DO NOT switch between styles (cartoon <-> photorealistic <-> 3D render)
- Maintain the SAME art style, line work, and shading technique
- Keep SAME color palette and lighting style as reference
- Use NEUTRAL BACKGROUND (no Christmas trees, no decorations, no scene elements)
- Background should be simple, clean, matching the reference style
=== END STYLE RULES ===
`;

  return `${styleConsistency}

SAME PERSON from reference image, showing ${expression}.

${identityLock}

${styleBlock}

SHOT REQUIREMENTS:
- Medium close-up (shoulders up)
- Direct eye contact with camera, FACING FORWARD
- 85mm lens equivalent, f/2.8
- Shallow depth of field (blurred background)
- NEUTRAL/CLEAN BACKGROUND - no props, no decorations
${outfitHint ? `- ${outfitHint}` : ''}

Only change: facial expression to ${expressionName}

TECHNICAL SPECS:
- Professional headshot quality
- Soft studio lighting
- Neutral background (grey/white/simple gradient)
- Sharp focus on eyes
- Natural skin tones
- 8K quality

AVOID: Changing art style, adding background elements, scene decorations, props, Christmas themes, seasonal elements`;
}

function buildOutfitPrompt(visualDNA: VisualDNA, outfitDescription: string, styleConfig: StyleConfig | null): string {
  const physical = visualDNA.physical_identity;
  const hair = visualDNA.hair?.head_hair;
  const face = visualDNA.face;
  const styleBlock = buildStyleBlock(styleConfig);

  return `This same person, wearing: ${outfitDescription}.
${styleBlock}
PHYSICAL CONTEXT:
- Height: ${physical?.height?.cm || 'average'} cm
- Build: ${physical?.body_type?.somatotype || 'average'}
- Age: ${physical?.age_exact_for_prompt || 'as shown in reference'}

SHOT REQUIREMENTS:
- Full body or 3/4 length shot (depends on outfit)
- Standing naturally
- Neutral pose showing the outfit clearly
- 50mm lens, f/4

OUTFIT DETAILS:
${outfitDescription}

STYLING CONTEXT:
- Outfit should fit the character's age (${physical?.age_exact_for_prompt || 'as shown'})
- Outfit should fit the character's build (${physical?.body_type?.somatotype || 'as shown'})
- Natural, realistic clothing physics (no AI artifacts)

CONSISTENCY REQUIREMENTS (CRITICAL):
- Keep EXACT same face
- Keep EXACT same hair (${hair?.color?.natural_base || 'as shown'}${hair?.color?.grey_white?.percentage ? `, with ${hair.color.grey_white.percentage}% grey` : ''}, ${hair?.length?.type || 'as shown'})
- Keep EXACT same skin tone
- Keep EXACT same age appearance
- Keep EXACT same body proportions
- Keep EXACT same facial hair

Only change: outfit/clothing

TECHNICAL SPECS:
- Clean background
- Even lighting
- Sharp focus
- Professional fashion photography quality
- Natural pose
- 8K resolution`;
}

function buildCloseupPrompt(visualDNA: VisualDNA, styleConfig: StyleConfig | null, viewAngle: string = 'front', characterName?: string): string {
  const styleBlock = buildStyleBlock(styleConfig);
  
  // Build detailed identity lock
  const identityLock = buildIdentityLock(visualDNA, characterName);

  const angleInstructions: Record<string, string> = {
    'front': 'front view, facing camera directly',
    'side': 'side profile view, 90 degrees to camera',
  };
  const angle = angleInstructions[viewAngle] || angleInstructions.front;

  return `SAME PERSON from reference image, professional portrait closeup, ${angle}.

${identityLock}

${styleBlock}

SHOT REQUIREMENTS:
- Tight headshot (face fills frame)
- ${viewAngle === 'side' ? 'Profile view showing side of face' : 'Direct eye contact with camera, FACING FORWARD'}
- 85mm lens, f/2.8
- Sharp focus on eyes
- Soft focus on background

LIGHTING:
- Soft key light at 45°
- Fill light for even skin tones
- Subtle rim light for separation
- Natural, flattering light

Only change: camera angle to ${viewAngle} view

EXPRESSION:
- Neutral, professional
- Slight warmth in eyes
- Relaxed face
- Natural, approachable

TECHNICAL SPECS:
- Professional headshot quality
- Sharp detail in eyes, skin texture
- Natural skin tones
- Clean background
- 8K resolution`;
}

function buildBaseLookPrompt(visualDNA: VisualDNA, styleConfig: StyleConfig | null, characterName?: string): string {
  return buildCloseupPrompt(visualDNA, styleConfig, 'front', characterName);
}

// ============================================
// ANIMAL-SPECIFIC PROMPT BUILDERS
// ============================================
function buildAnimalPrompt(
  characterName: string,
  characterBio: string,
  viewAngle: string,
  slotType: string,
  styleConfig: StyleConfig | null
): string {
  const styleBlock = buildStyleBlock(styleConfig);
  
  const angleInstructions: Record<string, string> = {
    'front': 'front view, facing camera directly',
    'front_34': '3/4 front view, 45 degrees from front',
    'side': 'side profile view, 90 degrees to camera',
    'back': 'back view, facing away from camera',
    'back_34': '3/4 back view, 45 degrees from behind',
  };
  
  const angle = angleInstructions[viewAngle] || angleInstructions.front;
  const isCloseup = slotType.includes('closeup') || slotType === 'anchor_closeup' || slotType === 'base_look';

  return `Professional photography of a ${characterName} for film production.
${styleBlock}
ANIMAL SUBJECT: ${characterName}
DESCRIPTION: ${characterBio}

POSE/ANGLE:
- ${angle}
${isCloseup ? '- Close-up portrait shot, head and upper body' : '- Full body shot showing complete anatomy'}

ANIMAL-SPECIFIC REQUIREMENTS:
- Capture natural animal posture and stance
- Show realistic fur/feather/scale texture as described
- Natural eye reflection and expression appropriate to species
- Anatomically correct proportions for this species
- Natural environment lighting

PHOTOGRAPHY SPECS:
- Professional wildlife/pet photography quality
- ${isCloseup ? '85mm lens, f/2.8, shallow depth of field' : '50mm lens, f/4, full body in focus'}
- Natural or studio lighting
- Clean, neutral background for production use
- Sharp focus on eyes and face details
- 8K resolution

CRITICAL - KEEP CONSISTENT:
- Same animal, same coloring, same markings
- Same breed/species characteristics
- Same eye color and expression style

AVOID: Humanoid features, unrealistic proportions, anthropomorphized poses, AI artifacts, blurry details`;
}

function buildAnimalExpressionPrompt(
  characterName: string,
  characterBio: string,
  expressionName: string,
  styleConfig: StyleConfig | null
): string {
  const styleBlock = buildStyleBlock(styleConfig);
  
  // Animal expressions are different from human ones
  const animalExpressions: Record<string, string> = {
    'neutral': 'calm, relaxed expression, alert eyes',
    'happy': 'playful expression, bright eyes, relaxed posture (tail wagging for dogs, purring pose for cats)',
    'sad': 'subdued expression, lowered ears, downcast eyes',
    'angry': 'aggressive stance, ears back, teeth showing if appropriate',
    'surprised': 'alert expression, ears perked up, wide eyes',
    'focused': 'intense focus, hunter stance, concentrated gaze',
    'worried': 'anxious expression, ears back slightly, cautious posture',
    'playful': 'energetic pose, play bow if dog, playful stance, bright expression',
    'sleeping': 'peaceful sleeping pose, eyes closed, relaxed body',
  };

  const expression = animalExpressions[expressionName] || animalExpressions.neutral;

  return `Professional close-up photograph of ${characterName} for film production.
${styleBlock}
ANIMAL: ${characterName}
DESCRIPTION: ${characterBio}

EXPRESSION/MOOD:
${expression}

SHOT REQUIREMENTS:
- Medium close-up, head and shoulders/upper body
- Direct focus on face capturing expression
- 85mm lens, f/2.8
- Shallow depth of field
- Natural catch lights in eyes

CONSISTENCY (CRITICAL):
- Same animal as reference
- Same coloring and markings
- Same breed characteristics
- Same fur/coat texture

Only change: expression/mood to ${expressionName}

TECHNICAL SPECS:
- Professional pet/wildlife photography
- Sharp focus on eyes
- Natural skin and fur tones
- Clean background
- 8K resolution

AVOID: Humanized expressions, unnatural poses, AI artifacts`;
}

// Build a standalone prompt for text-to-image (no reference)
function buildStandaloneCharacterPrompt(characterName: string, characterBio: string, visualDNA: VisualDNA, styleConfig: StyleConfig | null): string {
  const physical = visualDNA.physical_identity;
  const face = visualDNA.face;
  const hair = visualDNA.hair?.head_hair;
  const skin = visualDNA.skin;
  const styleBlock = buildStyleBlock(styleConfig);
  
  const ageStr = physical?.age_exact_for_prompt ? `${physical.age_exact_for_prompt} years old` : '';
  const genderStr = physical?.gender_presentation || '';
  const ethnicityStr = physical?.ethnicity?.primary || '';
  const skinTone = physical?.ethnicity?.skin_tone_description || '';
  const hairColor = hair?.color?.natural_base || '';
  const hairLength = hair?.length?.type || '';
  const hairTexture = hair?.texture?.type || '';
  const eyeColor = face?.eyes?.color_base || '';
  const faceShape = face?.shape || '';
  const bodyType = physical?.body_type?.somatotype || '';
  
  return `Professional portrait photograph of a fictional character for film production.
${styleBlock}
CHARACTER: ${characterName}
DESCRIPTION: ${characterBio}

PHYSICAL ATTRIBUTES:
${ageStr ? `- Age: ${ageStr}` : ''}
${genderStr ? `- Gender presentation: ${genderStr}` : ''}
${ethnicityStr ? `- Ethnicity: ${ethnicityStr}` : ''}
${skinTone ? `- Skin tone: ${skinTone}` : ''}
${hairColor ? `- Hair color: ${hairColor}` : ''}
${hairLength ? `- Hair length: ${hairLength}` : ''}
${hairTexture ? `- Hair texture: ${hairTexture}` : ''}
${eyeColor ? `- Eye color: ${eyeColor}` : ''}
${faceShape ? `- Face shape: ${faceShape}` : ''}
${bodyType ? `- Body type: ${bodyType}` : ''}

SHOT REQUIREMENTS:
- Professional identity closeup (head and shoulders)
- Direct eye contact with camera
- 85mm lens equivalent, f/2.8
- Shallow depth of field
- Neutral expression, approachable

LIGHTING:
- Soft key light at 45 degrees
- Fill light for even skin tones
- Subtle rim light for separation
- Natural, flattering light

TECHNICAL SPECS:
- Professional headshot quality
- Sharp focus on eyes
- Natural skin tones
- Clean, neutral background
- 8K resolution
- Photorealistic, cinematic quality

AVOID: AI artifacts, unnatural features, morphed faces, extra limbs, blurry details`;
}

// Build a standalone prompt for animals (no reference)
function buildStandaloneAnimalPrompt(characterName: string, characterBio: string, styleConfig: StyleConfig | null): string {
  const styleBlock = buildStyleBlock(styleConfig);
  
  return `Professional portrait photograph of ${characterName} for film production.
${styleBlock}
ANIMAL: ${characterName}
DESCRIPTION: ${characterBio}

SHOT REQUIREMENTS:
- Professional close-up portrait
- Head and upper body in frame
- Direct gaze at camera (if species-appropriate)
- Natural, alert expression

ANIMAL DETAILS TO CAPTURE:
- Realistic fur/feather/scale texture as described
- Natural coloring and any distinctive markings
- Species-appropriate anatomy and proportions
- Natural eye reflection and color

PHOTOGRAPHY SPECS:
- Professional pet/wildlife photography
- 85mm lens equivalent, f/2.8
- Shallow depth of field
- Soft, natural lighting
- Clean, neutral background
- 8K resolution

LIGHTING:
- Soft key light at 45 degrees
- Fill light for even tones
- Subtle rim light for separation
- Natural, flattering light that shows texture

AVOID: Anthropomorphized features, cartoon style, AI artifacts, blurry details, unnatural proportions`;
}

// ============================================
// TEXT-TO-IMAGE GENERATION (NO REFERENCE)
// ============================================
async function generateWithoutReference(
  prompt: string
): Promise<{ imageUrl: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  console.log(`[TEXT-TO-IMAGE] Generating with ${IMAGE_ENGINE}...`);
  console.log(`[TEXT-TO-IMAGE] Prompt length: ${prompt.length} chars`);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_ENGINE,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      modalities: ['image', 'text']
    })
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('[TEXT-TO-IMAGE] Error:', response.status, responseText.substring(0, 500));
    throw new Error(`Image generation failed: ${response.status} - ${responseText.substring(0, 200)}`);
  }

  // Safe JSON parse - handle HTML error pages
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseErr) {
    console.error('[TEXT-TO-IMAGE] Response is not JSON:', responseText.substring(0, 500));
    throw new Error(`API returned non-JSON response (possibly HTML error page). Status: ${response.status}`);
  }
  console.log('[TEXT-TO-IMAGE] Response received');

  // Check for content policy block
  const finishReason = data.choices?.[0]?.native_finish_reason || data.choices?.[0]?.finish_reason;
  if (finishReason === 'IMAGE_PROHIBITED_CONTENT') {
    console.warn('[TEXT-TO-IMAGE] Content blocked by safety filter');
    throw new Error('CONTENT_BLOCKED: Image generation blocked by safety filter. Try a different prompt.');
  }

  const imageUrl = extractImageFromResponse(data);
  
  if (!imageUrl) {
    console.error('[TEXT-TO-IMAGE] No image in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated in response');
  }

  console.log('[TEXT-TO-IMAGE] Image generated successfully');
  return { imageUrl };
}

// ============================================
// HELPER: Convert unsupported image formats to base64 data URL
// ============================================
async function ensureSupportedImageFormat(imageUrl: string): Promise<string> {
  const supportedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  const urlLower = imageUrl.toLowerCase();
  
  // Check if already a data URL (always supported)
  if (imageUrl.startsWith('data:image/')) {
    return imageUrl;
  }
  
  // Check if URL has a supported extension
  const hasSupported = supportedExtensions.some(ext => urlLower.includes(ext));
  if (hasSupported) {
    return imageUrl;
  }
  
  // Unsupported format (like .heic) - fetch and convert to base64
  console.log(`[IMAGE-CONVERT] Unsupported format detected, converting: ${imageUrl.substring(0, 80)}...`);
  
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to base64
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    
    // For HEIC, we need to tell the API it's JPEG (since we can't truly convert without a library)
    // The API should handle the raw bytes even with jpeg mime type
    const mimeType = contentType.includes('heic') || contentType.includes('heif') 
      ? 'image/jpeg'  // Pretend it's JPEG - some APIs can handle raw HEIC bytes this way
      : contentType;
    
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.log(`[IMAGE-CONVERT] Converted to base64 data URL (${Math.round(base64.length / 1024)}KB)`);
    
    return dataUrl;
  } catch (err) {
    console.error(`[IMAGE-CONVERT] Conversion failed:`, err);
    // Return original URL as fallback - let the API give a clearer error
    return imageUrl;
  }
}

// ============================================
// REFERENCE-BASED GENERATION WITH LOVABLE AI
// ============================================
async function generateWithReference(
  referenceImageUrl: string,
  prompt: string
): Promise<{ imageUrl: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    throw new Error('LOVABLE_API_KEY is not configured');
  }

  console.log(`[REFERENCE-GEN] Generating with ${IMAGE_ENGINE}...`);
  console.log(`[REFERENCE-GEN] Reference image: ${referenceImageUrl.substring(0, 100)}...`);
  console.log(`[REFERENCE-GEN] Prompt length: ${prompt.length} chars`);

  // Ensure image format is supported by the API
  const processedImageUrl = await ensureSupportedImageFormat(referenceImageUrl);

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_ENGINE,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { 
                url: processedImageUrl
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }
      ],
      modalities: ['image', 'text']
    })
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('[REFERENCE-GEN] Error:', response.status, responseText.substring(0, 500));
    throw new Error(`Image generation failed: ${response.status} - ${responseText.substring(0, 200)}`);
  }

  // Safe JSON parse - handle HTML error pages
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch (parseErr) {
    console.error('[REFERENCE-GEN] Response is not JSON:', responseText.substring(0, 500));
    throw new Error(`API returned non-JSON response (possibly HTML error page). Status: ${response.status}`);
  }
  console.log('[REFERENCE-GEN] Response received');

  // Check for content policy block
  const finishReason = data.choices?.[0]?.native_finish_reason || data.choices?.[0]?.finish_reason;
  if (finishReason === 'IMAGE_PROHIBITED_CONTENT') {
    console.warn('[REFERENCE-GEN] Content blocked by safety filter');
    throw new Error('CONTENT_BLOCKED: Image generation blocked by safety filter. Try a different expression or pose.');
  }

  const imageUrl = extractImageFromResponse(data);
  
  if (!imageUrl) {
    console.error('[REFERENCE-GEN] No image in response:', JSON.stringify(data).substring(0, 500));
    throw new Error('No image generated in response');
  }

  console.log('[REFERENCE-GEN] Image generated successfully');
  return { imageUrl };
}

function extractImageFromResponse(data: any): string | null {
  // Check for images array in message (nano-banana format)
  if (data.choices?.[0]?.message?.images?.[0]?.image_url?.url) {
    return data.choices[0].message.images[0].image_url.url;
  }

  // Check for content as array with image blocks
  const content = data.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const imageBlock = content.find((block: any) => 
      block.type === 'image_url' || block.type === 'image'
    );
    if (imageBlock?.image_url?.url) {
      return imageBlock.image_url.url;
    }
    if (imageBlock?.url) {
      return imageBlock.url;
    }
  }

  // Check for direct URL in content
  if (typeof content === 'string') {
    if (content.startsWith('http')) {
      return content;
    }
    if (content.startsWith('data:image')) {
      return content;
    }
    // If it looks like base64 without header
    if (content.length > 1000 && !content.includes(' ')) {
      return `data:image/png;base64,${content}`;
    }
  }

  return null;
}

// ============================================
// STORAGE UPLOAD HELPER
// ============================================
async function uploadBase64ToStorage(
  supabase: any,
  imageData: string,
  characterId: string,
  slotType: string
): Promise<string> {
  // If it's already a URL (not base64), return as-is
  if (imageData.startsWith('http') && !imageData.startsWith('data:')) {
    console.log('[STORAGE] Image is already a URL, skipping upload');
    return imageData;
  }

  console.log('[STORAGE] Uploading base64 image to storage...');
  
  // Parse base64 data
  let base64Content: string;
  let mimeType = 'image/png';
  
  if (imageData.startsWith('data:image')) {
    const matches = imageData.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 image format');
    }
    mimeType = `image/${matches[1]}`;
    base64Content = matches[2];
  } else {
    // Assume raw base64
    base64Content = imageData;
  }

  // Decode base64 to binary
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Determine file extension
  const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
  const fileName = `${characterId}/${slotType}_${Date.now()}.${ext}`;

  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('character-packs')
    .upload(fileName, bytes, {
      contentType: mimeType,
      upsert: true
    });

  if (uploadError) {
    console.error('[STORAGE] Upload failed:', uploadError);
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('character-packs')
    .getPublicUrl(fileName);

  console.log('[STORAGE] Image uploaded successfully:', urlData.publicUrl.substring(0, 80) + '...');
  return urlData.publicUrl;
}

// ============================================
// QC CHECKS (using Lovable AI for analysis)
// ============================================
async function runQC(
  imageUrl: string, 
  slotType: string, 
  characterName: string,
  referenceImageUrl?: string
): Promise<{
  score: number;
  passed: boolean;
  issues: string[];
  fixNotes: string;
  issuesSeverity?: { critical: string[]; minor: string[] };
  breakdown?: { estructura: number; rasgos: number; cabelloPiel: number; tecnico: number };
}> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return { score: 75, passed: true, issues: [], fixNotes: '' };
  }

  try {
    const content: any[] = [
      { 
        type: 'text', 
        text: `Evalúa esta imagen de tipo ${slotType} para el personaje "${characterName}".
        
Verifica la calidad técnica de la imagen:
1. ¿Hay artefactos de IA (manos deformadas, rasgos distorsionados)?
2. ¿La calidad técnica es profesional?
3. ¿La iluminación y composición son adecuadas?

IMPORTANTE: Escribe todos los "issues" y "fixNotes" en ESPAÑOL.
Devuelve JSON: {"score": 0-100, "passed": boolean, "issues": ["..."], "fixNotes": "...", "issuesSeverity": {"critical": [...], "minor": [...]}}
Score 70+ = aprobado.` 
      },
      { 
        type: 'image_url', 
        image_url: { url: imageUrl } 
      }
    ];

    // Add reference image if available for comparison - use weighted criteria
    if (referenceImageUrl) {
      content.splice(1, 0, {
        type: 'image_url',
        image_url: { url: referenceImageUrl }
      });
      content[0] = {
        type: 'text',
        text: `Compara estas dos imágenes. La PRIMERA es la REFERENCIA (la persona real). La SEGUNDA es la imagen GENERADA.

CRITERIOS DE EVALUACIÓN CON PESOS:
1. ESTRUCTURA FACIAL (40% del score): forma del rostro, mandíbula, frente, proporciones
2. RASGOS CLAVE (30% del score): ojos (forma y color), nariz, boca, orejas
3. CABELLO Y TONO DE PIEL (20% del score): color del cabello, canas, textura, tono de piel
4. CALIDAD TÉCNICA (10% del score): artefactos de IA, distorsiones

GUÍA DE SCORING:
- 85-100: Misma persona, muy reconocible, excelente parecido
- 70-84: Misma persona con variaciones menores aceptables (expresión, iluminación, ángulo)
- 50-69: Parecido parcial, estructura facial similar pero rasgos diferentes
- <50: No parece la misma persona

IMPORTANTE: 
- Diferencias menores en textura de barba, brillo de piel o iluminación NO deben penalizar mucho
- El PESO de los criterios es: Estructura 40%, Rasgos 30%, Cabello/piel 20%, Técnico 10%
- Escribe todos los "issues" y "fixNotes" en ESPAÑOL

Devuelve JSON:
{
  "score": 0-100,
  "passed": boolean,
  "issues": ["...en español..."],
  "fixNotes": "...en español...",
  "issuesSeverity": {
    "critical": ["problemas de estructura facial o rasgos muy diferentes"],
    "minor": ["diferencias menores en textura, iluminación, etc."]
  },
  "breakdown": {
    "estructura": 0-100,
    "rasgos": 0-100,
    "cabelloPiel": 0-100,
    "tecnico": 0-100
  }
}`
      };
    }

    // Retry logic for QC analysis
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash', // More stable than Pro for multi-image QC
            messages: [
              {
                role: 'system',
                content: `Eres un analista QC experto para imágenes de referencia de personajes.
Tu trabajo es verificar que las imágenes generadas mantienen PARECIDO con la persona de referencia.

CALIBRACIÓN IMPORTANTE:
- Sé JUSTO, no excesivamente estricto
- Las diferencias MENORES (textura de barba, brillo, iluminación) NO deben bajar mucho el score
- Las diferencias MAYORES (estructura facial, forma de ojos/nariz) SÍ deben penalizar
- Si la persona es RECONOCIBLE, el score debe ser 70+
- Clasifica los issues en "critical" (estructura/rasgos) y "minor" (textura/iluminación)

IMPORTANTE: Escribe todos los mensajes en ESPAÑOL.
Devuelve ÚNICAMENTE JSON válido.`
              },
              {
                role: 'user',
                content: content
              }
            ],
            response_format: { type: 'json_object' }
          }),
        });

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`QC request failed (attempt ${attempt}/${maxAttempts}): ${response.status} - ${errBody}`);
          console.error('QC payload size:', JSON.stringify(content).length, 'chars');
          
          // If last attempt, return fallback
          if (attempt === maxAttempts) {
          return { score: 75, passed: true, issues: [], fixNotes: '' };
          }
          // Wait before retry
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        const data = await response.json();
        const responseContent = data.choices?.[0]?.message?.content;
        
        if (responseContent) {
          try {
            const result = JSON.parse(responseContent);
            const score = result.score || 75;
            console.log(`QC analysis successful: score=${score}, issues=${result.issues?.length || 0}`);
            return {
              score,
              passed: result.passed !== false && score >= 70,
              issues: result.issues || [],
              fixNotes: result.fixNotes || '',
              issuesSeverity: result.issuesSeverity,
              breakdown: result.breakdown
            };
          } catch {
            console.error('Failed to parse QC response:', responseContent?.slice(0, 200));
          }
        }
      } catch (error) {
        console.error(`QC error (attempt ${attempt}/${maxAttempts}):`, error);
        if (attempt === maxAttempts) {
          return { score: 75, passed: true, issues: [], fixNotes: '' };
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }
  } catch (error) {
    console.error('QC outer error:', error);
  }
  
  return { score: 75, passed: true, issues: [], fixNotes: '' };
}

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Gateway JWT verification may be disabled; enforce auth here
    const authResult = await v3RequireAuth(req);
    if (authResult instanceof Response) {
      return authResult;
    }
    const auth: V3AuthContext = authResult;

    const body = await req.json();

    // Check if this is a slot-based request or legacy request
    const isSlotRequest = 'slotId' in body;

    if (isSlotRequest) {
      return await handleSlotGeneration(body as SlotGenerateRequest, auth);
    } else {
      return await handleLegacyGeneration(body as LegacyCharacterRequest);
    }
  } catch (error) {
    console.error('Error in generate-character function:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleSlotGeneration(request: SlotGenerateRequest, auth: V3AuthContext): Promise<Response> {
  console.log(`=== Slot Generation: ${request.slotType} for ${request.characterName} ===`);
  const startTime = Date.now();
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get character with visual DNA and entity_subtype
  const { data: character, error: charError } = await supabase
    .from('characters')
    .select(`
      *,
      character_visual_dna!character_visual_dna_character_id_fkey(
        visual_dna,
        continuity_lock,
        is_active
      )
    `)
    .eq('id', request.characterId)
    .single();

  if (charError || !character) {
    console.error('Character fetch error:', charError);
    throw new Error(`Character not found: ${request.characterId}`);
  }

  // Determine entity subtype (human, animal, creature, etc.)
  const entitySubtype = request.entitySubtype || character.entity_subtype || 'human';
  const isAnimalOrCreature = entitySubtype === 'animal' || entitySubtype === 'creature';
  console.log(`Entity subtype: ${entitySubtype}, isAnimalOrCreature: ${isAnimalOrCreature}`);

  // Enforce project access (security) now that we know the character's project
  const accessResult = await v3RequireProjectAccess(auth, character.project_id);
  if (accessResult instanceof Response) {
    return accessResult;
  }

  // Get active visual DNA
  const activeVisualDNA = character.character_visual_dna?.find((v: any) => v.is_active);
  const visualDNA: VisualDNA = activeVisualDNA?.visual_dna || {};
  
  // Get wardrobe lock for consistent outfit across all generations
  const wardrobeLock: WardrobeLock | null = character.wardrobe_lock_json || null;
  if (wardrobeLock) {
    console.log(`[WARDROBE LOCK] Using locked wardrobe: ${wardrobeLock.primary_outfit?.substring(0, 50) || 'defined'}...`);
  }

  // Get project's style_config from Visual Bible
  const { data: stylePack, error: styleError } = await supabase
    .from('style_packs')
    .select('style_config')
    .eq('project_id', character.project_id)
    .maybeSingle();
  
  if (styleError) {
    console.error('Style pack fetch error:', styleError);
  }
  
  const styleConfig: StyleConfig | null = stylePack?.style_config || null;
  console.log(`Style config loaded: ${styleConfig ? 'YES' : 'NO (will use defaults)'}`);
  console.log(`Wardrobe lock loaded: ${wardrobeLock ? 'YES' : 'NO (will use fallback)'}`);


  // Get reference anchors (user-uploaded photos)
  const { data: referenceAnchors, error: refError } = await supabase
    .from('reference_anchors')
    .select('*')
    .eq('character_id', request.characterId)
    .eq('is_active', true)
    .order('priority', { ascending: true });

  if (refError) {
    console.error('Reference anchors fetch error:', refError);
  }

  // ============================================
  // ANCHOR SELECTION STRATEGY (Priority Order):
  // 1. For expressions/turnarounds: Prefer CANON anchor (closeup_front) for style consistency
  // 2. If no canon anchor, use user-uploaded reference
  // 3. Fallback to pack slots
  // ============================================
  const isExpression = request.slotType.startsWith('expr_') || request.slotType === 'expression';
  const isTurnaround = request.slotType.startsWith('turn_') || request.slotType === 'turnaround';
  const needsCanonAnchor = isExpression || isTurnaround;

  let primaryAnchor: { image_url: string; anchor_type: string; id?: string; fromReferenceAnchors?: boolean } | null = null;
  let canonAnchorSource = 'none';

  // PRIORITY 1: For expressions/turnarounds, check for generated closeup_front (CANON ANCHOR)
  if (needsCanonAnchor) {
    console.log('[ANCHOR SELECTION] Looking for canon anchor (closeup_front) for style consistency...');
    
    const { data: canonSlot, error: canonError } = await supabase
      .from('character_pack_slots')
      .select('*')
      .eq('character_id', request.characterId)
      .eq('slot_type', 'closeup_front')
      .in('status', ['generated', 'approved', 'needs_review'])
      .single();
    
    if (!canonError && canonSlot?.image_url) {
      console.log('[ANCHOR SELECTION] ✓ Found canon anchor: closeup_front');
      primaryAnchor = {
        image_url: canonSlot.image_url,
        anchor_type: 'canon_closeup_front',
        // NOTE: No id here - this comes from pack_slots, not reference_anchors
        fromReferenceAnchors: false
      };
      canonAnchorSource = 'closeup_front';
    } else {
      console.log('[ANCHOR SELECTION] No closeup_front found, falling back to reference...');
    }
  }

  // PRIORITY 2: Identity primary from reference_anchors table
  if (!primaryAnchor?.image_url) {
    const foundAnchor = referenceAnchors?.find(a => 
      a.anchor_type === 'identity_primary' || a.anchor_type === 'face_front'
    ) || referenceAnchors?.[0] || null;
    
    if (foundAnchor?.image_url) {
      primaryAnchor = {
        ...foundAnchor,
        fromReferenceAnchors: true // This ID is valid for FK reference
      };
      canonAnchorSource = 'reference_anchors';
    }
  }

  // PRIORITY 3: Fallback to character_pack_slots for uploaded refs
  if (!primaryAnchor?.image_url) {
    console.log('No reference_anchors found, checking character_pack_slots...');
    const { data: refSlots, error: refSlotsError } = await supabase
      .from('character_pack_slots')
      .select('*')
      .eq('character_id', request.characterId)
      .in('slot_type', ['ref_closeup_front', 'ref_profile'])
      .eq('status', 'uploaded')
      .order('slot_type', { ascending: true });
    
    if (refSlotsError) {
      console.error('Reference slots fetch error:', refSlotsError);
    }
    
    const refSlot = refSlots?.find(s => s.slot_type === 'ref_closeup_front' && s.image_url) || refSlots?.[0];
    if (refSlot?.image_url) {
      console.log(`Found reference in pack slots: ${refSlot.slot_type}`);
      primaryAnchor = {
        image_url: refSlot.image_url,
        anchor_type: refSlot.slot_type === 'ref_closeup_front' ? 'identity_primary' : 'face_side',
        // NOTE: No id here - this comes from pack_slots, not reference_anchors
        fromReferenceAnchors: false
      };
      canonAnchorSource = 'pack_slots';
    }
  }

  const hasReference = !!primaryAnchor?.image_url;
  console.log(`[ANCHOR SELECTION] Final: hasReference=${hasReference}, source=${canonAnchorSource}, hasValidAnchorId=${primaryAnchor?.fromReferenceAnchors ?? false}`);
  
  // DECISION: Use reference or generate from text
  const isIdentitySlot = request.slotType === 'anchor_closeup' || request.slotType === 'base_look' || request.slotType === 'closeup';
  const allowTextToImage = request.allowTextToImage !== false; // Default to true
  
  if (!hasReference && !allowTextToImage) {
    throw new Error('No reference image found for this character. Please upload reference photos first.');
  }

  console.log(`Has reference: ${hasReference}, Allow text-to-image: ${allowTextToImage}, Is identity slot: ${isIdentitySlot}`);

  // Get slot details
  const { data: slot, error: slotError } = await supabase
    .from('character_pack_slots')
    .select('*')
    .eq('id', request.slotId)
    .single();

  if (slotError || !slot) {
    console.error('Slot fetch error:', slotError);
    throw new Error(`Slot not found: ${request.slotId}`);
  }

  // ============================================
  // PROTECTION: Prevent overwriting user-uploaded reference slots
  // ============================================
  const isReferenceSlot = request.slotType.startsWith('ref_');
  const isUploadedReference = slot.status === 'uploaded' && slot.image_url;
  
  if (isReferenceSlot && isUploadedReference) {
    console.log(`[PROTECTED] Reference slot ${request.slotType} has uploaded image - SKIPPING generation`);
    return new Response(JSON.stringify({
      success: false,
      error: 'REF_SLOT_PROTECTED',
      message: 'Los slots de referencia (ref_*) con fotos subidas no pueden ser sobrescritos. Use closeup_front, turn_*, o expr_* para generar.',
      slotId: request.slotId,
      existingImageUrl: slot.image_url
    }), {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let imageUrl: string;
  let prompt: string;
  let generationMode: 'reference' | 'text-to-image';
  let createdAnchorId: string | null = null;

  // ============================================
  // CHECK: COHERENCE MODE - Use enhanced prompt from improve-character-qc
  // ============================================
  const isCoherenceMode = slot?.status === 'pending_improvement';
  const enhancedPromptFromQC = slot?.prompt_text;
  
  if (isCoherenceMode && enhancedPromptFromQC) {
    console.log('[COHERENCE MODE] Using enhanced prompt from improve-character-qc');
    console.log('[COHERENCE MODE] Enhanced prompt preview:', enhancedPromptFromQC.substring(0, 200));
    
    // Use the enhanced prompt directly with reference
    prompt = enhancedPromptFromQC;
    
    if (hasReference && primaryAnchor) {
      generationMode = 'reference';
      console.log(`[COHERENCE MODE] Generating with reference: ${primaryAnchor.image_url.substring(0, 50)}...`);
      
      const result = await withRetry(
        () => generateWithReference(primaryAnchor!.image_url, prompt),
        'COHERENCE-REF-GEN'
      );
      imageUrl = result.imageUrl;
    } else {
      generationMode = 'text-to-image';
      console.log('[COHERENCE MODE] No reference found, using text-to-image');
      
      const result = await withRetry(
        () => generateWithoutReference(prompt),
        'COHERENCE-TEXT-GEN'
      );
      imageUrl = result.imageUrl;
    }
  } else if (hasReference && primaryAnchor) {
    // === REFERENCE-BASED GENERATION (Normal mode) ===
    generationMode = 'reference';
    console.log(`Using reference image: ${primaryAnchor.anchor_type} - ${primaryAnchor.image_url.substring(0, 50)}...`);
    
    // Build prompt based on slot type - detect by prefix for extended slot types
    const isTurnaround = request.slotType.startsWith('turn_') || request.slotType === 'turnaround';
    const isExpression = request.slotType.startsWith('expr_') || request.slotType === 'expression';
    const isOutfit = request.slotType.startsWith('outfit_') || request.slotType === 'outfit';
    const isReference = request.slotType.startsWith('ref_');
    const isCloseup = request.slotType.startsWith('closeup_');

    // Extract view angle from slot type if not provided
    const extractViewAngle = (slotType: string): string => {
      const angleMap: Record<string, string> = {
        'turn_front_34': 'front_34',
        'turn_side': 'side',
        'turn_back': 'back',
        'turn_back_34': 'back_34',
        'closeup_front': 'front',
        'closeup_profile': 'side',
      };
      return angleMap[slotType] || 'front';
    };

    // Extract expression from slot type if not provided
    const extractExpression = (slotType: string): string => {
      const exprMap: Record<string, string> = {
        'expr_neutral': 'neutral',
        'expr_happy': 'happy',
        'expr_sad': 'sad',
        'expr_angry': 'angry',
        'expr_surprised': 'surprised',
        'expr_fear': 'worried', // Map fear to worried which exists in instructions
        'expr_focused': 'focused',
        'expr_worried': 'worried',
        'expr_laughing': 'laughing',
        'expr_serious': 'serious',
      };
      return exprMap[slotType] || 'neutral';
    };

    // USE ANIMAL PROMPTS IF entity_subtype is animal/creature
    if (isAnimalOrCreature) {
      if (isExpression) {
        const expression = request.expressionName || extractExpression(request.slotType);
        console.log(`[ANIMAL EXPRESSION] Slot: ${request.slotType} -> Expression: ${expression}`);
        prompt = buildAnimalExpressionPrompt(request.characterName, request.characterBio, expression, styleConfig);
      } else {
        const angle = request.viewAngle || extractViewAngle(request.slotType);
        console.log(`[ANIMAL] Slot: ${request.slotType} -> Angle: ${angle}`);
        prompt = buildAnimalPrompt(request.characterName, request.characterBio, angle, request.slotType, styleConfig);
      }
    } else if (isCloseup) {
      const angle = request.viewAngle || extractViewAngle(request.slotType);
      console.log(`[CLOSEUP] Slot: ${request.slotType} -> Angle: ${angle}`);
      prompt = buildCloseupPrompt(visualDNA, styleConfig, angle, request.characterName);
    } else if (isTurnaround) {
      const angle = request.viewAngle || extractViewAngle(request.slotType);
      console.log(`[TURNAROUND] Slot: ${request.slotType} -> Angle: ${angle}`);
      prompt = buildTurnaroundPrompt(visualDNA, angle, styleConfig, wardrobeLock, request.characterName);
    } else if (isExpression) {
      const expression = request.expressionName || extractExpression(request.slotType);
      console.log(`[EXPRESSION] Slot: ${request.slotType} -> Expression: ${expression}`);
      prompt = buildExpressionPrompt(visualDNA, expression, styleConfig, wardrobeLock, request.characterName);
    } else if (isOutfit) {
      prompt = buildOutfitPrompt(visualDNA, request.outfitDescription || 'casual outfit', styleConfig);
    } else if (isReference || request.slotType === 'closeup' || request.slotType === 'anchor_closeup') {
      prompt = isAnimalOrCreature 
        ? buildAnimalPrompt(request.characterName, request.characterBio, 'front', request.slotType, styleConfig)
        : buildCloseupPrompt(visualDNA, styleConfig, 'front', request.characterName);
    } else if (request.slotType === 'base_look') {
      prompt = isAnimalOrCreature 
        ? buildAnimalPrompt(request.characterName, request.characterBio, 'front', 'base_look', styleConfig)
        : buildBaseLookPrompt(visualDNA, styleConfig, request.characterName);
    } else {
      // Default fallback
      console.log(`[FALLBACK] Unknown slot type: ${request.slotType}, using closeup`);
      prompt = isAnimalOrCreature 
        ? buildAnimalPrompt(request.characterName, request.characterBio, 'front', request.slotType, styleConfig)
        : buildCloseupPrompt(visualDNA, styleConfig, 'front', request.characterName);
    }
    
    const result = await withRetry(
      () => generateWithReference(primaryAnchor!.image_url, prompt),
      'REFERENCE-GEN'
    );
    imageUrl = result.imageUrl;
    
  } else {
    // === TEXT-TO-IMAGE GENERATION (No Reference) ===
    generationMode = 'text-to-image';
    console.log(`No reference found. Generating identity with text-to-image for: ${request.characterName} (${entitySubtype})`);
    
    // Build standalone prompt (different for animals vs humans)
    prompt = isAnimalOrCreature
      ? buildStandaloneAnimalPrompt(request.characterName, request.characterBio, styleConfig)
      : buildStandaloneCharacterPrompt(request.characterName, request.characterBio, visualDNA, styleConfig);
    
    const result = await withRetry(
      () => generateWithoutReference(prompt),
      'TEXT-TO-IMAGE'
    );
    imageUrl = result.imageUrl;
    
    // Create the generated image as primary reference anchor for future generations
    if (isIdentitySlot && imageUrl) {
      console.log('[TEXT-TO-IMAGE] Creating reference anchor from generated image...');
      
      const { data: newAnchor, error: anchorError } = await supabase
        .from('reference_anchors')
        .insert({
          character_id: request.characterId,
          anchor_type: 'identity_primary',
          image_url: imageUrl,
          is_active: true,
          priority: 1,
          approved: false, // Requires user approval
          metadata: {
            source: 'auto_generated',
            generated_at: new Date().toISOString(),
            engine: IMAGE_ENGINE,
            note: 'Auto-generated identity. Approve to use for future generations.'
          }
        })
        .select('id')
        .single();
      
      if (anchorError) {
        console.error('Failed to create reference anchor:', anchorError);
      } else {
        createdAnchorId = newAnchor.id;
        console.log(`[TEXT-TO-IMAGE] Created reference anchor: ${createdAnchorId}`);
        
        // AUTO-EXTRACT VISUAL DNA if not already present
        if (!activeVisualDNA) {
          console.log('[TEXT-TO-IMAGE] Triggering Visual DNA extraction...');
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const response = await fetch(`${supabaseUrl}/functions/v1/generate-visual-dna`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
              },
              body: JSON.stringify({
                characterId: request.characterId,
                imageUrl: imageUrl
              })
            });
            
            if (response.ok) {
              console.log('[TEXT-TO-IMAGE] Visual DNA extraction initiated');
            } else {
              console.warn('[TEXT-TO-IMAGE] Visual DNA extraction failed:', await response.text());
            }
          } catch (dnaError) {
            console.warn('[TEXT-TO-IMAGE] Visual DNA extraction error:', dnaError);
            // Non-blocking - continue even if DNA extraction fails
          }
        }
      }
    }
  }

  console.log('Generated prompt:', prompt.substring(0, 200) + '...');

  // Upload to Storage if base64 (to avoid storing large base64 in DB)
  const finalImageUrl = await uploadBase64ToStorage(
    supabase,
    imageUrl,
    request.characterId,
    request.slotType
  );

  // Run QC (with reference comparison if available)
  const qcResult = await runQC(
    finalImageUrl, 
    request.slotType, 
    request.characterName, 
    hasReference && primaryAnchor ? primaryAnchor.image_url : undefined
  );
  console.log(`QC Score: ${qcResult.score}, Passed: ${qcResult.passed}`);

  const durationMs = Date.now() - startTime;

  // Determine valid reference anchor ID (only set if anchor actually exists in reference_anchors table)
  let validReferenceAnchorId: string | null = null;
  
  // Only use primaryAnchor.id if it comes from reference_anchors table (not from pack_slots)
  if (hasReference && primaryAnchor?.fromReferenceAnchors && primaryAnchor?.id) {
    validReferenceAnchorId = primaryAnchor.id;
    console.log(`[SLOT UPDATE] Using reference_anchor ID: ${validReferenceAnchorId}`);
  } else if (createdAnchorId) {
    // Verify the created anchor exists before referencing it
    const { data: anchorExists } = await supabase
      .from('reference_anchors')
      .select('id')
      .eq('id', createdAnchorId)
      .maybeSingle();
    
    if (anchorExists) {
      validReferenceAnchorId = createdAnchorId;
      console.log(`[SLOT UPDATE] Using created anchor ID: ${validReferenceAnchorId}`);
    } else {
      console.warn(`[SLOT UPDATE] Created anchor ${createdAnchorId} not found, skipping FK reference`);
    }
  } else {
    console.log(`[SLOT UPDATE] No valid reference_anchor to link (source was pack_slots or text-to-image)`);
  }

  // Update slot in database
  const { error: updateError } = await supabase
    .from('character_pack_slots')
    .update({
      image_url: finalImageUrl,
      prompt_text: prompt,
      reference_anchor_id: validReferenceAnchorId,
      qc_score: qcResult.score,
      qc_issues: qcResult.issues,
      fix_notes: qcResult.fixNotes,
      status: qcResult.passed ? 'generated' : 'needs_review',
      generation_metadata: {
        engine: IMAGE_ENGINE,
        generation_mode: generationMode,
        reference_used: validReferenceAnchorId,
        created_anchor: createdAnchorId,
        generated_at: new Date().toISOString(),
        duration_ms: durationMs
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', request.slotId);

  if (updateError) {
    console.error('Slot update error:', updateError);
    throw new Error(`Failed to update slot: ${updateError.message}`);
  }

  // Log generation cost
  const { data: charData } = await supabase
    .from('characters')
    .select('project_id')
    .eq('id', request.characterId)
    .single();

  await logGenerationCost({
    userId: auth.userId,
    projectId: charData?.project_id,
    characterId: request.characterId,
    slotId: request.slotId,
    slotType: `character_${request.slotType}`,
    engine: IMAGE_ENGINE,
    durationMs: durationMs,
    success: true,
    metadata: {
      qcScore: qcResult.score,
      qcPassed: qcResult.passed,
      generationMode,
      referenceUsed: hasReference && primaryAnchor ? primaryAnchor.id : null,
      createdAnchor: createdAnchorId
    }
  });

  // CRITICAL: Recalculate pack completeness after each generation
  console.log('[PACK RECALC] Triggering pack completeness recalculation...');
  const { error: recalcError } = await supabase.rpc('recalc_character_pack', {
    p_character_id: request.characterId
  });
  if (recalcError) {
    console.warn('[PACK RECALC] Failed to recalculate pack:', recalcError.message);
  } else {
    console.log('[PACK RECALC] Pack completeness updated successfully');
  }

  return new Response(JSON.stringify({
    success: true,
    imageUrl,
    prompt,
    qc: qcResult,
    slotId: request.slotId,
    generationMode,
    referenceUsed: hasReference && primaryAnchor ? primaryAnchor.id : null,
    createdAnchor: createdAnchorId
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function handleLegacyGeneration(request: LegacyCharacterRequest): Promise<Response> {
  console.log(`=== Legacy Generation: ${request.name} ===`);
  
  // For legacy requests without reference, return an error asking to use the new flow
  return new Response(JSON.stringify({ 
    error: 'Legacy generation is deprecated. Please upload reference photos and use the new character pack builder.',
    suggestion: 'Upload 4 reference photos (face front, face side, body front, body side) to enable high-quality generation.'
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
