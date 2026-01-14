/**
 * Storyboard Style Presets v1.0 (Edge Function version)
 * 
 * Sistema de 4 estilos radicalmente diferenciados para storyboards.
 * Cada estilo = lenguaje visual + intención narrativa + reglas de cámara + nivel de abstracción
 */

export type StoryboardStylePresetId = 
  | 'sb_tech_production' 
  | 'sb_cinematic_narrative' 
  | 'sb_art_visual_dev' 
  | 'sb_previz_animatic';

export interface StoryboardStylePreset {
  id: StoryboardStylePresetId;
  name: string;
  
  visualSignature: {
    color: 'strict_black_white' | 'grayscale_graphite' | 'grayscale_or_limited_tone' | 'simple_grayscale';
    line: 'hard_uniform' | 'pencil_varied' | 'illustrative' | 'clean_simple';
    shading: 'none_or_minimal' | 'soft_graphite' | 'high_contrast_expressive' | 'very_low';
    detailLevel: 'schematic_precise' | 'cinematic_readable' | 'stylized_high' | 'low_volumes';
  };
  
  promptBlock: {
    styleCore: string[];
    mustInclude: string[];
    hardExclusions: string[];
  };
  
  qaProfile: {
    forbiddenTokens: string[];
    regenOnStyleMix: boolean;
  };
}

/**
 * The 4 Radically Differentiated Storyboard Styles
 */
export const STORYBOARD_STYLE_PRESETS: Record<StoryboardStylePresetId, StoryboardStylePreset> = {
  sb_tech_production: {
    id: 'sb_tech_production',
    name: 'Técnico (Producción)',
    
    visualSignature: {
      color: 'strict_black_white',
      line: 'hard_uniform',
      shading: 'none_or_minimal',
      detailLevel: 'schematic_precise',
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
      forbiddenTokens: ['cinematic', 'soft shading', 'moody', 'film still', 'atmospheric', 'dramatic lighting'],
      regenOnStyleMix: true,
    },
  },

  sb_cinematic_narrative: {
    id: 'sb_cinematic_narrative',
    name: 'Cinematográfico (Narrativo)',
    
    visualSignature: {
      color: 'grayscale_graphite',
      line: 'pencil_varied',
      shading: 'soft_graphite',
      detailLevel: 'cinematic_readable',
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
      forbiddenTokens: ['technical arrows', 'schematic', 'diagram', 'inked comic', 'blueprint', 'uniform lines'],
      regenOnStyleMix: true,
    },
  },

  sb_art_visual_dev: {
    id: 'sb_art_visual_dev',
    name: 'Artístico (Visual Dev)',
    
    visualSignature: {
      color: 'grayscale_or_limited_tone',
      line: 'illustrative',
      shading: 'high_contrast_expressive',
      detailLevel: 'stylized_high',
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
      forbiddenTokens: ['technical', 'schematic', 'previz', 'minimal', 'flat', 'blocking arrows'],
      regenOnStyleMix: true,
    },
  },

  sb_previz_animatic: {
    id: 'sb_previz_animatic',
    name: 'Previs (Animatic)',
    
    visualSignature: {
      color: 'simple_grayscale',
      line: 'clean_simple',
      shading: 'very_low',
      detailLevel: 'low_volumes',
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
 * Build the Style Exclusion Block for prompts
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

⚠️ IF ANY OTHER STYLE IS DETECTED, THE GENERATION IS INVALID.
═══════════════════════════════════════════════════════════════════════════════`;
}

/**
 * Build strict reinforcement prompt for QA failures
 */
export function buildStyleReinforcementPrompt(presetId: StoryboardStylePresetId): string {
  const preset = getStoryboardStylePreset(presetId);
  
  return `
⚠️ STYLE COMPLIANCE FIX - REGENERATION REQUIRED ⚠️

Previous generation MIXED STYLES or violated exclusions.
Regenerate with STRICT adherence to: ${preset.name}

MANDATORY STYLE:
${preset.promptBlock.styleCore.join('\n')}

FORBIDDEN (MUST NOT APPEAR):
${preset.promptBlock.hardExclusions.join('\n')}

ONLY correct the style rendering. Keep all other aspects identical.`;
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
  
  const forbiddenHits = preset.qaProfile.forbiddenTokens
    .filter(token => promptLower.includes(token.toLowerCase()));
  
  const mustIncludeMissing = preset.promptBlock.mustInclude
    .filter(token => !promptLower.includes(token.toLowerCase()));
  
  const forbiddenPenalty = forbiddenHits.length * 0.2;
  const missingPenalty = mustIncludeMissing.length * 0.15;
  const complianceScore = Math.max(0, 1 - forbiddenPenalty - missingPenalty);
  
  const needsRegen = forbiddenHits.length >= 1 || mustIncludeMissing.length >= 2 || complianceScore < 0.6;
  
  return { forbiddenHits, mustIncludeMissing, complianceScore, needsRegen };
}

/**
 * Global negatives for ALL styles
 */
export const GLOBAL_STYLE_NEGATIVES = [
  'no watermark',
  'no text overlays',
  'no logos',
  'no AI artifacts',
  'no extra characters unless specified',
];
