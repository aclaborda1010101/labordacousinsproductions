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
        'MATCH THE ATTACHED REFERENCE STORYBOARD EXACTLY',
        'Professional film PRODUCTION storyboard - NOT comic art',
        'Quick rough sketch for film crew reference',
        'Black and white line art with minimal shading',
        'Simple functional drawings - speed over beauty',
        'Clear staging and blocking visible',
        'This is a WORKING DOCUMENT, not finished artwork',
        'Like storyboards from Spielberg, Pixar pre-production',
      ],
      mustInclude: [
        'rough sketch quality',
        'functional linework',
        'clear staging',
        'production document feel',
      ],
      hardExclusions: [
        'NOT a comic book page',
        'NOT manga or anime style',
        'NOT polished illustration',
        'NOT concept art',
        'NOT graphic novel',
        'no stylized art',
        'no decorative elements',
        'no comic panel effects',
        'no speed lines',
        'no dramatic shading',
        'no artistic interpretation',
      ],
    },
    
    qaProfile: {
      forbiddenTokens: ['comic', 'manga', 'anime', 'illustration', 'concept art', 'graphic novel', 'polished'],
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
        'MATCH THE ATTACHED REFERENCE STORYBOARD EXACTLY',
        'Spanish/European film production storyboard style',
        'Rough pencil sketch - functional, NOT artistic',
        'Quick gestural drawing with varied line weight',
        'Simple grayscale shading (3-4 values max)',
        'Readable at thumbnail size - clear silhouettes',
        'This is a WORKING DOCUMENT for film crew, not finished art',
      ],
      mustInclude: [
        'rough sketch quality',
        'functional shading',
        'clear silhouettes',
        'production storyboard feel',
      ],
      hardExclusions: [
        'NOT a comic book',
        'NOT manga or anime',
        'NOT polished illustration',
        'NOT concept art',
        'NOT detailed rendering',
        'no dramatic artistic lighting',
        'no decorative linework',
        'no stylized proportions',
        'no comic panel borders',
        'no speech bubbles',
        'no action lines',
      ],
    },
    
    qaProfile: {
      forbiddenTokens: ['comic', 'manga', 'anime', 'illustration', 'concept art', 'polished', 'detailed render'],
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

// ============================================================================
// GENERATION MODES (v2.0 - State Machine Support)
// ============================================================================

export type GenerationMode = 'NORMAL' | 'STRICT' | 'SAFE';

export interface PanelStateForMode {
  image_status?: string;
  failure_reason?: string;
  regen_count?: number;
  identity_qc?: {
    issues?: string[];
    needs_regen?: boolean;
  };
  style_qc?: {
    issues?: string[];
    needs_regen?: boolean;
  };
}

/**
 * Choose generation mode based on panel history
 * 
 * - NORMAL: Standard generation (first attempt or successful history)
 * - STRICT: After QA failure (fix identity/style without changing composition)
 * - SAFE: After repeated failures or timeout (prioritize valid output)
 */
export function chooseGenerationMode(
  panel: PanelStateForMode, 
  opts?: { forceStrict?: boolean; forceSafe?: boolean }
): GenerationMode {
  // Force override options
  if (opts?.forceSafe) return 'SAFE';
  if (opts?.forceStrict) return 'STRICT';
  
  const status = panel.image_status;
  const failureReason = panel.failure_reason;
  const regenCount = panel.regen_count || 0;
  
  // If last run failed to return image or timed out: go SAFE
  if (status === 'failed_safe' || 
      failureReason === 'NO_IMAGE_RETURNED' ||
      failureReason === 'TIMEOUT' ||
      failureReason === 'STUCK_GENERATING') {
    return 'SAFE';
  }
  
  // If 2+ consecutive failures: go SAFE
  if (regenCount >= 2 && (status === 'error' || status === 'pending_regen')) {
    return 'SAFE';
  }
  
  // If QA indicates style mixing but image exists: STRICT
  const hasStyleMix = panel.style_qc?.issues?.includes('STYLE_MIX') ||
                      panel.identity_qc?.issues?.includes('STYLE_MIX');
  if (hasStyleMix) return 'STRICT';
  
  // If identity QC failed: STRICT
  if (panel.identity_qc?.needs_regen) return 'STRICT';
  
  return 'NORMAL';
}

/**
 * SAFE MODE Block - Prepend when generation has failed repeatedly
 * Prioritizes returning a valid image over non-critical constraints
 */
export const SAFE_MODE_BLOCK = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ SAFE MODE ACTIVATED - PRIORITY: VALID IMAGE ⚠️
═══════════════════════════════════════════════════════════════════════════════

Previous generation(s) FAILED to produce a valid image.

OBJECTIVE: Return a VALID image for this panel AT ALL COSTS.

PRIORITIES (in strict order):
1. ✅ Generate a COMPLETE image - no blank/corrupted/partial output
2. ✅ Keep the selected storyboard style CATEGORY (do not drift to different preset)
3. ✅ Maintain character IDENTITY from reference images
4. ✅ Respect 16:9 aspect ratio

RELAXATIONS ALLOWED (if needed to avoid failure):
- Reduce non-essential rendering complexity
- Simplify extreme lighting, textures, or atmospheric effects
- Simplify detailed backgrounds
- Use simpler poses if complex blocking causes issues

NEVER RELAX (even in safe mode):
✗ Style preset category (technical/cinematic/artistic/previz)
✗ Character identity (must match reference images)
✗ Aspect ratio 16:9
✗ No extra characters or props not in the brief

IF A CONSTRAINT WOULD CAUSE GENERATION FAILURE → SIMPLIFY rather than fail.
═══════════════════════════════════════════════════════════════════════════════
`;

/**
 * STRICT MODE Block - Prepend when QA failed (identity/style drift)
 * Keeps composition but enforces strict adherence to locks
 */
export const STRICT_MODE_BLOCK = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ STRICT MODE - QA CORRECTION REQUIRED ⚠️
═══════════════════════════════════════════════════════════════════════════════

Previous generation FAILED quality control checks.

CORRECTION RULES:
1. Keep IDENTICAL composition and framing (same camera angle, same blocking)
2. FIX identity to EXACTLY match reference images
3. FIX style to EXACTLY match the style preset
4. Do NOT change scene content, only fix compliance issues

Match references EXACTLY. No creative interpretation.
═══════════════════════════════════════════════════════════════════════════════
`;

/**
 * Get mode block to prepend based on generation mode
 */
export function getModeBlock(mode: GenerationMode): string {
  switch (mode) {
    case 'SAFE': return SAFE_MODE_BLOCK;
    case 'STRICT': return STRICT_MODE_BLOCK;
    default: return '';
  }
}
