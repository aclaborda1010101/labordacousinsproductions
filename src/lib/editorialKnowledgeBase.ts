/**
 * EDITORIAL KNOWLEDGE BASE v1
 * Decision-making system based on industry rules, format profiles, and animation styles
 * NO generative content - only decisional logic
 */

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type FormatProfile = 'short' | 'series' | 'trailer' | 'teaser' | 'cinematic';
export type AnimationType = '2D' | '3D' | 'mixed';
export type VisualStyle = 'pixar' | 'ghibli' | 'anime' | 'cartoon' | 'sports_epic' | 'realistic';
export type UserLevel = 'explorer' | 'creator' | 'pro';
export type AssetCategory = 'character' | 'location' | 'keyframe' | 'video';
export type ImpactLevel = 'high' | 'medium' | 'low';

export interface IndustryRule {
  id: string;
  name: string;
  description: string;
  appliesTo: AssetCategory[];
  impact: ImpactLevel;
  effect: {
    recommendPreset?: string;
    limitPreset?: string[];
    forceIllumination?: string;
    recommendComposition?: string;
    warnIfMissing?: boolean;
    limitContrast?: number;
    warnStyle?: VisualStyle[];
    boostPreset?: string;
    motionExaggeration?: number;
    requireExpressionPack?: boolean;
    syncLightingMood?: boolean;
  };
}

export interface FormatProfileConfig {
  id: FormatProfile;
  name: string;
  rhythm: 'slow' | 'medium' | 'fast';
  avgShotDurationSec: number;
  visualComplexity: 'low' | 'medium' | 'high' | 'very_high';
  recommendedPresets: string[];
  activatedRules: string[];
}

export interface AnimationStyleConfig {
  id: VisualStyle;
  name: string;
  animationType: AnimationType;
  visualTraits: {
    expressions?: string;
    eyes?: string;
    colors?: string;
    textures?: string;
    backgrounds?: string;
    movement?: string;
    nature?: string;
    proportions?: string;
    speedLines?: boolean;
    dramaticLighting?: boolean;
    squashStretch?: boolean;
    outlines?: string;
    anatomy?: string;
    motionBlur?: boolean;
    sweatEffects?: boolean;
    dramaticAngles?: boolean;
    lighting?: string;
  };
  narrativeTraits: {
    emotion?: string;
    humor?: string;
    arc?: string;
    pace?: string;
    themes?: string;
    magic?: string;
    drama?: string;
    action?: string;
    tension?: string;
    rivalry?: string;
    trainingArcs?: boolean;
    dialogue?: string;
    gags?: string;
  };
  typicalComposition: string;
  lighting: string;
  restrictions: string[];
  presetBias: Record<string, number>;
}

export interface ProjectStyleContext {
  formatProfile: FormatProfile;
  animationType: AnimationType;
  visualStyle: VisualStyle;
  userLevel: UserLevel;
}

export interface StyleDecision {
  presetBias: Record<string, number>;
  engineBias: Record<string, number>;
  activeRules: IndustryRule[];
  warnings: string[];
  suggestions: string[];
}

// ─────────────────────────────────────────────────────────────
// INDUSTRY RULES (IMMUTABLE)
// ─────────────────────────────────────────────────────────────

export const INDUSTRY_RULES: IndustryRule[] = [
  {
    id: 'protagonist_silhouette',
    name: 'Silueta Protagonista',
    description: 'Los personajes protagonistas deben ser reconocibles solo por su silueta',
    appliesTo: ['character'],
    impact: 'high',
    effect: { recommendPreset: 'silhouette', warnIfMissing: true },
  },
  {
    id: 'child_contrast',
    name: 'Contraste Infantil',
    description: 'Animación infantil debe evitar contrastes agresivos de color',
    appliesTo: ['character', 'location', 'keyframe'],
    impact: 'medium',
    effect: { limitContrast: 0.7, warnStyle: ['realistic', 'anime'] },
  },
  {
    id: 'sports_wide_shots',
    name: 'Planos Deportivos',
    description: 'Acción deportiva usa planos abiertos y exageración de movimiento',
    appliesTo: ['keyframe'],
    impact: 'medium',
    effect: { boostPreset: 'wide', motionExaggeration: 1.3 },
  },
  {
    id: 'expression_consistency',
    name: 'Consistencia Expresiva',
    description: 'Las expresiones del personaje deben mantener consistencia con su arco narrativo',
    appliesTo: ['character'],
    impact: 'high',
    effect: { requireExpressionPack: true },
  },
  {
    id: 'ambient_lighting',
    name: 'Iluminación Ambiental',
    description: 'La iluminación debe reflejar el tono emocional de la escena',
    appliesTo: ['location', 'keyframe'],
    impact: 'medium',
    effect: { syncLightingMood: true },
  },
  {
    id: 'ghibli_pacing',
    name: 'Ritmo Ghibli',
    description: 'El estilo Ghibli requiere momentos contemplativos y respeto al silencio',
    appliesTo: ['keyframe', 'video'],
    impact: 'medium',
    effect: { recommendComposition: 'environmental_focus' },
  },
  {
    id: 'anime_drama',
    name: 'Drama Anime',
    description: 'El estilo anime potencia momentos de pico emocional con iluminación dramática',
    appliesTo: ['keyframe', 'character'],
    impact: 'medium',
    effect: { forceIllumination: 'high_contrast' },
  },
];

// ─────────────────────────────────────────────────────────────
// FORMAT PROFILES
// ─────────────────────────────────────────────────────────────

export const FORMAT_PROFILES: Record<FormatProfile, FormatProfileConfig> = {
  short: {
    id: 'short',
    name: 'Cortometraje',
    rhythm: 'medium',
    avgShotDurationSec: 4,
    visualComplexity: 'high',
    recommendedPresets: ['hero', 'establishing', 'detail'],
    activatedRules: ['protagonist_silhouette', 'expression_consistency'],
  },
  series: {
    id: 'series',
    name: 'Serie',
    rhythm: 'fast',
    avgShotDurationSec: 3,
    visualComplexity: 'medium',
    recommendedPresets: ['frontal', 'action', 'dialog'],
    activatedRules: ['expression_consistency'],
  },
  trailer: {
    id: 'trailer',
    name: 'Trailer',
    rhythm: 'fast',
    avgShotDurationSec: 2,
    visualComplexity: 'high',
    recommendedPresets: ['hero', 'action', 'impact'],
    activatedRules: ['protagonist_silhouette'],
  },
  teaser: {
    id: 'teaser',
    name: 'Teaser',
    rhythm: 'slow',
    avgShotDurationSec: 5,
    visualComplexity: 'high',
    recommendedPresets: ['establishing', 'mood', 'silhouette'],
    activatedRules: ['protagonist_silhouette', 'ambient_lighting'],
  },
  cinematic: {
    id: 'cinematic',
    name: 'Cinemática',
    rhythm: 'slow',
    avgShotDurationSec: 6,
    visualComplexity: 'very_high',
    recommendedPresets: ['hero', 'establishing', 'epic'],
    activatedRules: ['protagonist_silhouette', 'expression_consistency', 'ambient_lighting'],
  },
};

// ─────────────────────────────────────────────────────────────
// ANIMATION STYLES
// ─────────────────────────────────────────────────────────────

export const ANIMATION_STYLES: Record<VisualStyle, AnimationStyleConfig> = {
  pixar: {
    id: 'pixar',
    name: 'Pixar',
    animationType: '3D',
    visualTraits: {
      expressions: 'exaggerated',
      eyes: 'large',
      colors: 'vibrant',
      textures: 'smooth',
    },
    narrativeTraits: {
      emotion: 'high',
      humor: 'family_friendly',
      arc: 'hero_journey',
    },
    typicalComposition: 'rule_of_thirds',
    lighting: 'soft_volumetric',
    restrictions: ['avoid_dark_themes', 'no_realistic_violence'],
    presetBias: { expressive: 0.05, character_focus: 0.03, frontal: 0.02 },
  },
  ghibli: {
    id: 'ghibli',
    name: 'Studio Ghibli',
    animationType: '2D',
    visualTraits: {
      colors: 'watercolor',
      backgrounds: 'detailed',
      movement: 'fluid',
      nature: 'prominent',
    },
    narrativeTraits: {
      pace: 'contemplative',
      themes: 'nature_humanity',
      magic: 'subtle',
    },
    typicalComposition: 'environmental_focus',
    lighting: 'natural_atmospheric',
    restrictions: ['avoid_fast_cuts', 'respect_silence'],
    presetBias: { atmospheric: 0.05, establishing: 0.04, mood: 0.03 },
  },
  anime: {
    id: 'anime',
    name: 'Anime / Manga',
    animationType: '2D',
    visualTraits: {
      eyes: 'very_large',
      expressions: 'extreme',
      speedLines: true,
      dramaticLighting: true,
    },
    narrativeTraits: {
      drama: 'high',
      action: 'intense',
      emotion: 'peak_moments',
    },
    typicalComposition: 'dynamic_angles',
    lighting: 'high_contrast',
    restrictions: [],
    presetBias: { action: 0.05, impact: 0.04, dramatic: 0.03 },
  },
  cartoon: {
    id: 'cartoon',
    name: 'Cartoon Clásico',
    animationType: '2D',
    visualTraits: {
      proportions: 'exaggerated',
      squashStretch: true,
      colors: 'bold',
      outlines: 'thick',
    },
    narrativeTraits: {
      humor: 'slapstick',
      pace: 'fast',
      gags: 'visual',
    },
    typicalComposition: 'centered_action',
    lighting: 'flat_bright',
    restrictions: ['avoid_realistic_physics'],
    presetBias: { comedic: 0.05, expressive: 0.04, action: 0.02 },
  },
  sports_epic: {
    id: 'sports_epic',
    name: 'Deportivo Épico',
    animationType: '2D',
    visualTraits: {
      anatomy: 'exaggerated',
      motionBlur: true,
      sweatEffects: true,
      dramaticAngles: true,
    },
    narrativeTraits: {
      tension: 'high',
      rivalry: 'core',
      trainingArcs: true,
    },
    typicalComposition: 'low_angle_dynamic',
    lighting: 'dramatic_rim_light',
    restrictions: [],
    presetBias: { action: 0.06, wide: 0.04, impact: 0.03 },
  },
  realistic: {
    id: 'realistic',
    name: 'Realista',
    animationType: '3D',
    visualTraits: {
      textures: 'photorealistic',
      lighting: 'physically_based',
      proportions: 'accurate',
    },
    narrativeTraits: {
      drama: 'grounded',
      dialogue: 'naturalistic',
    },
    typicalComposition: 'cinematic',
    lighting: 'naturalistic',
    restrictions: ['avoid_cartoon_physics'],
    presetBias: { cinematic: 0.05, detail: 0.04, establishing: 0.03 },
  },
};

// ─────────────────────────────────────────────────────────────
// USER LEVEL VISIBILITY
// ─────────────────────────────────────────────────────────────

export interface UserLevelVisibility {
  showEngineSelector: boolean;
  showPresetSelector: boolean;
  showTechnicalMetrics: boolean;
  showAdvancedWarnings: boolean;
  showRuleDetails: boolean;
  showAutopilotToggle: boolean;
  showOverrides: boolean;
  showCanonButton: boolean;
  showRecommendations: boolean;
  allowBreakRules: boolean;
  autopilotSoft: boolean;
}

export const USER_LEVEL_VISIBILITY: Record<UserLevel, UserLevelVisibility> = {
  explorer: {
    showEngineSelector: false,
    showPresetSelector: false,
    showTechnicalMetrics: false,
    showAdvancedWarnings: false,
    showRuleDetails: false,
    showAutopilotToggle: false,
    showOverrides: false,
    showCanonButton: false,
    showRecommendations: false,
    allowBreakRules: false,
    autopilotSoft: true, // System decides automatically
  },
  creator: {
    showEngineSelector: false,
    showPresetSelector: true,
    showTechnicalMetrics: false,
    showAdvancedWarnings: false,
    showRuleDetails: false,
    showAutopilotToggle: false,
    showOverrides: false,
    showCanonButton: true,
    showRecommendations: true,
    allowBreakRules: false,
    autopilotSoft: false,
  },
  pro: {
    showEngineSelector: true,
    showPresetSelector: true,
    showTechnicalMetrics: true,
    showAdvancedWarnings: true,
    showRuleDetails: true,
    showAutopilotToggle: true,
    showOverrides: true,
    showCanonButton: true,
    showRecommendations: true,
    allowBreakRules: true,
    autopilotSoft: false,
  },
};

export const USER_LEVEL_CONFIG: Record<UserLevel, { label: string; icon: string; description: string }> = {
  explorer: {
    label: 'Explorador',
    icon: '🧭',
    description: 'El sistema decide automáticamente. Solo elige estilo y genera.',
  },
  creator: {
    label: 'Creador',
    icon: '✨',
    description: 'Ve recomendaciones y puede cambiar preset con explicación.',
  },
  pro: {
    label: 'Profesional',
    icon: '🎬',
    description: 'Control total sobre engines, presets, reglas y overrides.',
  },
};

// ─────────────────────────────────────────────────────────────
// DECISION ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Get active industry rules for a given context
 */
export function getActiveRules(
  context: ProjectStyleContext,
  assetType: AssetCategory
): IndustryRule[] {
  const formatProfile = FORMAT_PROFILES[context.formatProfile];
  const style = ANIMATION_STYLES[context.visualStyle];

  // Get rules activated by format
  const formatRuleIds = new Set(formatProfile.activatedRules);

  // Filter rules that apply to this asset type
  return INDUSTRY_RULES.filter(rule => {
    const appliesTo = rule.appliesTo.includes(assetType);
    const isActivated = formatRuleIds.has(rule.id);
    
    // Special rules based on style
    if (context.visualStyle === 'ghibli' && rule.id === 'ghibli_pacing') {
      return appliesTo;
    }
    if (context.visualStyle === 'anime' && rule.id === 'anime_drama') {
      return appliesTo;
    }
    if (context.visualStyle === 'sports_epic' && rule.id === 'sports_wide_shots') {
      return appliesTo;
    }

    return appliesTo && isActivated;
  });
}

/**
 * Calculate preset bias from style context
 */
export function getPresetBias(context: ProjectStyleContext): Record<string, number> {
  const style = ANIMATION_STYLES[context.visualStyle];
  const format = FORMAT_PROFILES[context.formatProfile];

  // Start with style preset bias
  const bias = { ...style.presetBias };

  // Add bonus for format recommended presets
  for (const preset of format.recommendedPresets) {
    bias[preset] = (bias[preset] || 0) + 0.02;
  }

  return bias;
}

/**
 * Calculate engine bias from style context
 */
export function getEngineBias(context: ProjectStyleContext): Record<string, number> {
  const style = ANIMATION_STYLES[context.visualStyle];
  const bias: Record<string, number> = {};

  // Realistic and high complexity favor FLUX
  if (context.visualStyle === 'realistic' || 
      FORMAT_PROFILES[context.formatProfile].visualComplexity === 'very_high') {
    bias['flux-1.1-pro-ultra'] = 0.05;
  }

  // Fast iteration styles favor nano-banana
  if (style.animationType === '2D' || context.visualStyle === 'cartoon') {
    bias['nano-banana'] = 0.03;
  }

  return bias;
}

/**
 * Get style-based editorial suggestions
 */
export function getStyleSuggestions(
  context: ProjectStyleContext,
  assetType: AssetCategory
): string[] {
  const suggestions: string[] = [];
  const style = ANIMATION_STYLES[context.visualStyle];
  const format = FORMAT_PROFILES[context.formatProfile];

  // Style-specific suggestions
  if (context.visualStyle === 'pixar' && assetType === 'character') {
    suggestions.push('Para estilo Pixar, considera expresiones exageradas y ojos grandes');
  }
  if (context.visualStyle === 'ghibli' && assetType === 'location') {
    suggestions.push('Los fondos Ghibli destacan por el detalle en la naturaleza');
  }
  if (context.visualStyle === 'anime' && assetType === 'keyframe') {
    suggestions.push('El estilo anime potencia momentos de pico con iluminación dramática');
  }
  if (context.visualStyle === 'sports_epic' && assetType === 'keyframe') {
    suggestions.push('Para deporte épico, usa ángulos bajos y exageración de movimiento');
  }

  // Format-specific suggestions
  if (format.rhythm === 'slow' && assetType === 'keyframe') {
    suggestions.push(`Para ${format.name}, los planos pueden ser más largos y contemplativos`);
  }
  if (format.rhythm === 'fast' && assetType === 'keyframe') {
    suggestions.push(`Para ${format.name}, mantén planos dinámicos y cortos`);
  }

  return suggestions;
}

/**
 * Get style-based editorial warnings
 */
export function getStyleWarnings(
  context: ProjectStyleContext,
  assetType: AssetCategory,
  selectedPreset?: string
): string[] {
  const warnings: string[] = [];
  const style = ANIMATION_STYLES[context.visualStyle];
  const format = FORMAT_PROFILES[context.formatProfile];

  // Check restrictions
  if (style.restrictions.includes('avoid_dark_themes') && selectedPreset === 'noir') {
    warnings.push('Este preset puede alejarse del lenguaje visual definido');
  }
  if (style.restrictions.includes('avoid_fast_cuts') && format.rhythm === 'fast') {
    warnings.push('El ritmo rápido puede no encajar con el estilo Ghibli');
  }

  return warnings;
}

/**
 * Get full style decision for generation
 */
export function getStyleDecision(
  context: ProjectStyleContext,
  assetType: AssetCategory,
  selectedPreset?: string
): StyleDecision {
  return {
    presetBias: getPresetBias(context),
    engineBias: getEngineBias(context),
    activeRules: getActiveRules(context, assetType),
    warnings: getStyleWarnings(context, assetType, selectedPreset),
    suggestions: getStyleSuggestions(context, assetType),
  };
}

/**
 * Get visibility settings for current user level
 */
export function getVisibility(userLevel: UserLevel): UserLevelVisibility {
  return USER_LEVEL_VISIBILITY[userLevel];
}
