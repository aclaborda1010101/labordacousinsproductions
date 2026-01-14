/**
 * Storyboard Style Presets v1.0
 * 
 * Sistema de 4 estilos radicalmente diferenciados para storyboards.
 * Cada estilo = lenguaje visual + intención narrativa + reglas de cámara + nivel de abstracción
 * 
 * Principio fundamental: Un estilo NO es solo estética.
 */

export type StoryboardStylePresetId = 
  | 'sb_tech_production' 
  | 'sb_cinematic_narrative' 
  | 'sb_art_visual_dev' 
  | 'sb_previz_animatic';

export interface StoryboardStylePreset {
  id: StoryboardStylePresetId;
  name: string;
  nameEn: string;
  useCase: string;
  useCaseEn: string;
  icon: string;
  
  // Visual signature for QA validation
  visualSignature: {
    color: 'strict_black_white' | 'grayscale_graphite' | 'grayscale_or_limited_tone' | 'simple_grayscale';
    line: 'hard_uniform' | 'pencil_varied' | 'illustrative' | 'clean_simple';
    shading: 'none_or_minimal' | 'soft_graphite' | 'high_contrast_expressive' | 'very_low';
    detailLevel: 'schematic_precise' | 'cinematic_readable' | 'stylized_high' | 'low_volumes';
    notes: string;
  };
  
  // Prompt blocks for generation
  promptBlock: {
    styleCore: string[];      // What the style MUST do
    mustInclude: string[];    // Mandatory elements
    hardExclusions: string[]; // NEVER violate these
  };
  
  // QA profile for automatic validation
  qaProfile: {
    expectedLineWeight: 'uniform' | 'varied' | 'illustrative' | 'simple';
    expectedShading: 'low' | 'medium' | 'high';
    expectedContrast: 'medium' | 'medium_low' | 'high';
    forbiddenTokens: string[];
    regenOnStyleMix: boolean;
  };
}

/**
 * Shot type policies - strictness varies by shot type
 */
export const SHOT_TYPE_STYLE_POLICIES: Record<string, { 
  styleStrictness: number; 
  minLineWeightConsistency: number; 
  minShadingMatch: number;
}> = {
  PG: { styleStrictness: 0.7, minLineWeightConsistency: 0.6, minShadingMatch: 0.4 },
  PMC: { styleStrictness: 0.8, minLineWeightConsistency: 0.7, minShadingMatch: 0.6 },
  OTS: { styleStrictness: 0.8, minLineWeightConsistency: 0.7, minShadingMatch: 0.6 },
  PP: { styleStrictness: 0.9, minLineWeightConsistency: 0.8, minShadingMatch: 0.7 },
  '2SHOT': { styleStrictness: 0.8, minLineWeightConsistency: 0.7, minShadingMatch: 0.6 },
  INSERT: { styleStrictness: 0.85, minLineWeightConsistency: 0.75, minShadingMatch: 0.65 },
  TRACK: { styleStrictness: 0.8, minLineWeightConsistency: 0.7, minShadingMatch: 0.6 },
};

/**
 * The 4 Radically Differentiated Storyboard Styles
 */
export const STORYBOARD_STYLE_PRESETS: Record<StoryboardStylePresetId, StoryboardStylePreset> = {
  /**
   * STYLE 1: TECHNICAL PRODUCTION
   * For: Production crew, directors, blocking
   * Visual: Pure B&W, hard uniform lines, no artistic shading
   */
  sb_tech_production: {
    id: 'sb_tech_production',
    name: 'Técnico (Producción)',
    nameEn: 'Technical (Production)',
    useCase: 'Rodaje, dirección técnica, blocking',
    useCaseEn: 'Shooting, technical direction, blocking',
    icon: '📐',
    
    visualSignature: {
      color: 'strict_black_white',
      line: 'hard_uniform',
      shading: 'none_or_minimal',
      detailLevel: 'schematic_precise',
      notes: 'Must look like a production storyboard with immediate readability. Blueprint-like precision.',
    },
    
    promptBlock: {
      styleCore: [
        'Technical production storyboard',
        'strict black-and-white line art only',
        'uniform hard line weight throughout',
        'minimal or no shading - flat areas',
        'clear blocking and staging arrows when relevant',
        'camera angle must be explicit and readable',
        'schematic precision over artistic expression',
      ],
      mustInclude: [
        'clear composition',
        'readable silhouettes',
        'explicit camera angle clarity',
        'uniform line weight',
      ],
      hardExclusions: [
        'no cinematic shading',
        'no dramatic lighting effects',
        'no painterly style',
        'no soft graphite mood',
        'no atmospheric haze',
        'no gradients',
        'no cross-hatching',
        'no emotion-driven composition',
        'no varied line weights',
      ],
    },
    
    qaProfile: {
      expectedLineWeight: 'uniform',
      expectedShading: 'low',
      expectedContrast: 'medium',
      forbiddenTokens: ['cinematic', 'soft shading', 'moody', 'film still', 'atmospheric', 'dramatic lighting'],
      regenOnStyleMix: true,
    },
  },

  /**
   * STYLE 2: CINEMATIC NARRATIVE
   * For: Directors, pitch, creative development
   * Visual: Graphite pencil, soft shading, emotional framing
   */
  sb_cinematic_narrative: {
    id: 'sb_cinematic_narrative',
    name: 'Cinematográfico (Narrativo)',
    nameEn: 'Cinematic (Narrative)',
    useCase: 'Dirección creativa, pitch, guion visual',
    useCaseEn: 'Creative direction, pitch, visual screenplay',
    icon: '🎬',
    
    visualSignature: {
      color: 'grayscale_graphite',
      line: 'pencil_varied',
      shading: 'soft_graphite',
      detailLevel: 'cinematic_readable',
      notes: 'Must breathe cinema: emotional framing and suggested light. Pencil texture visible.',
    },
    
    promptBlock: {
      styleCore: [
        'Cinematic narrative storyboard in graphite pencil',
        'soft shading with subtle gradients (no harsh black fills)',
        'varied pencil line weight (pressure visible)',
        'film composition and emotional framing',
        'slight background separation (soft depth suggestion)',
        'prioritize mood and emotion over mechanical clarity',
      ],
      mustInclude: [
        'emotional framing',
        'cinematic composition',
        'soft graphite shading',
        'varied line pressure',
      ],
      hardExclusions: [
        'no technical arrows',
        'no schematic diagrams',
        'no rigid geometric blocking marks',
        'no painterly illustration',
        'no high-contrast ink comic look',
        'no blueprint feel',
        'no engineering storyboard',
        'no uniform line weight',
      ],
    },
    
    qaProfile: {
      expectedLineWeight: 'varied',
      expectedShading: 'medium',
      expectedContrast: 'medium_low',
      forbiddenTokens: ['technical arrows', 'schematic', 'diagram', 'inked comic', 'blueprint', 'uniform lines'],
      regenOnStyleMix: true,
    },
  },

  /**
   * STYLE 3: ARTISTIC / VISUAL DEVELOPMENT
   * For: Look & feel, mood, aesthetic exploration
   * Visual: High contrast, illustrative, expressive lighting
   */
  sb_art_visual_dev: {
    id: 'sb_art_visual_dev',
    name: 'Artístico (Visual Dev)',
    nameEn: 'Artistic (Visual Dev)',
    useCase: 'Look & feel, mood, exploración estética',
    useCaseEn: 'Look & feel, mood, aesthetic exploration',
    icon: '🎨',
    
    visualSignature: {
      color: 'grayscale_or_limited_tone',
      line: 'illustrative',
      shading: 'high_contrast_expressive',
      detailLevel: 'stylized_high',
      notes: 'Must look almost like an illustration: dramatic light and atmosphere. Artistic over functional.',
    },
    
    promptBlock: {
      styleCore: [
        'Artistic storyboard illustration',
        'high-contrast expressive lighting (chiaroscuro)',
        'illustrative shading and visible texture',
        'conceptual mood-driven composition',
        'stylized but readable silhouettes',
        'dramatic light and shadow interplay',
      ],
      mustInclude: [
        'dramatic light/shadow',
        'illustrative texture',
        'mood-first composition',
        'high contrast',
      ],
      hardExclusions: [
        'no technical storyboard look',
        'no arrows or blocking marks',
        'no schematic line-only style',
        'no flat minimal previz',
        'no uniform line weight',
        'no clean simple volumes',
        'no engineering precision',
      ],
    },
    
    qaProfile: {
      expectedLineWeight: 'illustrative',
      expectedShading: 'high',
      expectedContrast: 'high',
      forbiddenTokens: ['technical', 'schematic', 'previz', 'minimal', 'flat', 'blocking arrows'],
      regenOnStyleMix: true,
    },
  },

  /**
   * STYLE 4: PREVIZ / ANIMATIC
   * For: Timing, rhythm, editing, continuity
   * Visual: Simplified, clear volumes, mannequin-like characters
   */
  sb_previz_animatic: {
    id: 'sb_previz_animatic',
    name: 'Previs (Animatic)',
    nameEn: 'Previz (Animatic)',
    useCase: 'Timing, ritmo, montaje, continuidad',
    useCaseEn: 'Timing, rhythm, editing, continuity',
    icon: '⏱️',
    
    visualSignature: {
      color: 'simple_grayscale',
      line: 'clean_simple',
      shading: 'very_low',
      detailLevel: 'low_volumes',
      notes: 'Must feel like previz: clear volumes, minimal texture. Animation-ready silhouettes.',
    },
    
    promptBlock: {
      styleCore: [
        'Previsualization storyboard (animatic-ready)',
        'simple clean geometric volumes',
        'minimal detail - only essential forms',
        'clarity of motion and staging',
        'readable silhouettes with basic shapes',
        'low detail mannequin-like figures',
      ],
      mustInclude: [
        'simple geometry of forms',
        'low detail',
        'clear staging',
        'readable silhouettes',
      ],
      hardExclusions: [
        'no cinematic graphite shading',
        'no illustrative high-contrast art',
        'no detailed facial rendering',
        'no atmospheric effects',
        'no textures',
        'no dramatic lighting',
        'no emotional framing',
      ],
    },
    
    qaProfile: {
      expectedLineWeight: 'simple',
      expectedShading: 'low',
      expectedContrast: 'medium',
      forbiddenTokens: ['graphite soft shading', 'illustration', 'chiaroscuro', 'detailed', 'textured', 'emotional'],
      regenOnStyleMix: true,
    },
  },
};

/**
 * Get a preset by ID
 */
export function getStoryboardStylePreset(id: StoryboardStylePresetId): StoryboardStylePreset {
  return STORYBOARD_STYLE_PRESETS[id] || STORYBOARD_STYLE_PRESETS.sb_cinematic_narrative;
}

/**
 * Get all presets as array
 */
export function getAllStoryboardStylePresets(): StoryboardStylePreset[] {
  return Object.values(STORYBOARD_STYLE_PRESETS);
}

/**
 * Build the Style Exclusion Block for prompts
 * This is injected into the image generation prompt to enforce style purity
 */
export function buildStyleExclusionBlock(presetId: StoryboardStylePresetId): string {
  const preset = getStoryboardStylePreset(presetId);
  
  return `
═══════════════════════════════════════════════════════════════════════════════
STYLE LOCK: ${preset.name} (IMMUTABLE - DO NOT VIOLATE)
═══════════════════════════════════════════════════════════════════════════════

RENDER STYLE (MANDATORY - FOLLOW EXACTLY):
${preset.promptBlock.styleCore.map(s => `• ${s}`).join('\n')}

MUST INCLUDE (REQUIRED IN OUTPUT):
${preset.promptBlock.mustInclude.map(s => `✓ ${s}`).join('\n')}

HARD EXCLUSIONS (NEVER VIOLATE - REGENERATE IF DETECTED):
${preset.promptBlock.hardExclusions.map(s => `✗ ${s}`).join('\n')}

VISUAL SIGNATURE: ${preset.visualSignature.line} line, ${preset.visualSignature.shading} shading, 
                  ${preset.visualSignature.color}, ${preset.visualSignature.detailLevel}

⚠️ IF ANY OTHER STYLE IS DETECTED, THE GENERATION IS INVALID AND MUST BE REGENERATED.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Build strict reinforcement prompt for QA failures
 */
export function buildStyleReinforcementPrompt(presetId: StoryboardStylePresetId): string {
  const preset = getStoryboardStylePreset(presetId);
  
  return `
═══════════════════════════════════════════════════════════════════════════════
⚠️ STYLE COMPLIANCE FIX - REGENERATION REQUIRED ⚠️
═══════════════════════════════════════════════════════════════════════════════

The previous generation MIXED STYLES or violated exclusions.
Regenerate with STRICT adherence to: ${preset.name}

MANDATORY STYLE (FOLLOW EXACTLY):
${preset.promptBlock.styleCore.join('\n')}

FORBIDDEN (DETECTED IN PREVIOUS - MUST NOT APPEAR):
${preset.promptBlock.hardExclusions.join('\n')}

KEEP IDENTICAL:
- Same shot type, composition intent, blocking, characters, environment, action.

ONLY CHANGE:
- Rendering language to match style signature exactly:
  - Line weight: ${preset.visualSignature.line}
  - Shading: ${preset.visualSignature.shading}
  - Color: ${preset.visualSignature.color}
  - Detail level: ${preset.visualSignature.detailLevel}

═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Validate prompt for style compliance (QA Lint)
 */
export function lintPromptForStyle(
  promptUsed: string, 
  presetId: StoryboardStylePresetId
): { 
  forbiddenHits: string[]; 
  mustIncludeMissing: string[];
  complianceScore: number;
  needsRegen: boolean;
} {
  const preset = getStoryboardStylePreset(presetId);
  const promptLower = promptUsed.toLowerCase();
  
  // Check for forbidden tokens
  const forbiddenHits = preset.qaProfile.forbiddenTokens
    .filter(token => promptLower.includes(token.toLowerCase()));
  
  // Check for missing must-include tokens
  const mustIncludeMissing = preset.promptBlock.mustInclude
    .filter(token => !promptLower.includes(token.toLowerCase()));
  
  // Calculate compliance score
  const forbiddenPenalty = forbiddenHits.length * 0.2;
  const missingPenalty = mustIncludeMissing.length * 0.15;
  const complianceScore = Math.max(0, 1 - forbiddenPenalty - missingPenalty);
  
  // Determine if regen is needed
  const needsRegen = forbiddenHits.length >= 1 || mustIncludeMissing.length >= 2 || complianceScore < 0.6;
  
  return { forbiddenHits, mustIncludeMissing, complianceScore, needsRegen };
}

/**
 * UI Locking policy
 */
export const STYLE_LOCKING_POLICY = {
  lockOnStoryboardStart: true,
  allowChangeAfterPanelsGenerated: false,
  changeRequiresRegeneration: true,
};

/**
 * Global negatives that apply to ALL styles
 */
export const GLOBAL_STYLE_NEGATIVES = [
  'no watermark',
  'no text overlays',
  'no logos',
  'no AI artifacts',
  'no extra characters unless specified',
  'no anachronistic elements',
];
