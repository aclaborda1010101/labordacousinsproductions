// Auto Target Calculator for Script Generation
// Based on format, duration, complexity, and genre
// V3.0 - Hollywood-Grade Pipeline with corrected batch calculations
// 1 página ≈ 1 minuto, scenesPerPage varies by genre

export interface TargetInputs {
  format: 'film' | 'series';
  duration?: number; // film duration in minutes
  episodesCount?: number;
  episodeDurationMin?: number;
  complexity: 'simple' | 'medium' | 'high';
  genre: string;
}

export interface SceneLengthDistribution {
  short_pct: number;   // escenas < 1 min
  medium_pct: number;  // escenas 1-2 min
  long_pct: number;    // escenas > 2 min
}

export interface CalculatedTargets {
  protagonists_min: number;
  supporting_min: number;
  extras_min: number;
  locations_min: number;
  hero_props_min: number;
  setpieces_min: number;
  subplots_min: number;
  twists_min: number;
  scenes_per_episode?: number;
  scenes_target?: number;
  dialogue_action_ratio: string;
  scene_length_distribution?: SceneLengthDistribution;
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

// =============================================================================
// V3.0 HOLLYWOOD BATCH CALCULATOR
// Corrected scene/block calculations based on real TV/film metrics
// =============================================================================

// Scenes per page by genre (based on real production data)
const SCENES_PER_PAGE_BY_GENRE: Record<string, number> = {
  'drama': 1.1,
  'romance': 1.1,
  'action': 1.4,
  'thriller': 1.3,
  'comedy': 1.3,
  'horror': 1.3,
  'sci-fi': 1.2,
  'fantasy': 1.2,
  'crime': 1.2,
  'mystery': 1.2,
  'default': 1.2
};

export interface HollywoodBatchConfig {
  totalScenes: number;
  totalBlocks: number;
  scenesPerBlock: number;
  sceneCardsCallsNeeded: number;
  polishCallsNeeded: number;
  estimatedTotalCalls: number;
  estimatedTimeMinutes: number;
  scenesPerPage: number;
}

/**
 * Calculate Hollywood-grade batch configuration
 * Uses corrected formulas: pages × scenesPerPage ÷ scenesPerBlock
 * 
 * Example outputs (with genre=drama, scenesPerPage=1.1):
 * - Film 180 min: 198 scenes → 99 blocks (2 scenes/block)
 * - Series 10×60: 660 scenes → 330 blocks (2 scenes/block)
 */
export function calculateHollywoodBatches(
  format: 'film' | 'series',
  durationMin: number,
  genre: string,
  episodeCount?: number,
  complexity: 'simple' | 'medium' | 'high' = 'medium'
): HollywoodBatchConfig {
  const genreLower = genre.toLowerCase();
  const scenesPerPage = SCENES_PER_PAGE_BY_GENRE[genreLower] || SCENES_PER_PAGE_BY_GENRE['default'];
  
  // 1 page ≈ 1 minute
  const totalPages = format === 'series' 
    ? durationMin * (episodeCount || 10)
    : durationMin;
  
  const totalScenes = Math.ceil(totalPages * scenesPerPage);
  
  // Scenes per block based on complexity (2 = Hollywood pro standard)
  const scenesPerBlock = complexity === 'high' ? 2 : complexity === 'simple' ? 3 : 2;
  
  const totalBlocks = Math.ceil(totalScenes / scenesPerBlock);
  
  // Scene cards: 10 per call
  const sceneCardsCallsNeeded = Math.ceil(totalScenes / 10);
  
  // Polish: 1 per episode or per 60 pages (film acts)
  const polishCallsNeeded = format === 'series' 
    ? (episodeCount || 10)
    : Math.ceil(durationMin / 60);
  
  // Total: bible (1) + outline (1-2) + scene cards + script blocks + polish
  const estimatedTotalCalls = 
    2 +                           // Bible + Outline Master
    sceneCardsCallsNeeded +       // Scene cards
    totalBlocks +                 // Script blocks
    polishCallsNeeded;            // Polish passes
  
  // Estimated time (average seconds per call × calls)
  const avgSecondsPerCall = 40;
  const estimatedTimeMinutes = Math.ceil((estimatedTotalCalls * avgSecondsPerCall) / 60);
  
  return {
    totalScenes,
    totalBlocks,
    scenesPerBlock,
    sceneCardsCallsNeeded,
    polishCallsNeeded,
    estimatedTotalCalls,
    estimatedTimeMinutes,
    scenesPerPage
  };
}

/**
 * Get scenes per page for a given genre
 */
export function getScenesPerPageByGenre(genre: string): number {
  return SCENES_PER_PAGE_BY_GENRE[genre.toLowerCase()] || SCENES_PER_PAGE_BY_GENRE['default'];
}

/**
 * Get scene length distribution based on genre
 * Industry standard distributions for pacing variety
 */
function getSceneLengthDistribution(genre: string): SceneLengthDistribution {
  const genreLower = genre.toLowerCase();
  
  // Action/Thriller: more short scenes for faster pacing
  if (['action', 'thriller', 'horror'].includes(genreLower)) {
    return { short_pct: 35, medium_pct: 45, long_pct: 20 };
  }
  
  // Drama/Romance: more long scenes for character development
  if (['drama', 'romance'].includes(genreLower)) {
    return { short_pct: 20, medium_pct: 45, long_pct: 35 };
  }
  
  // Comedy: balanced with slight short bias for punch
  if (['comedy'].includes(genreLower)) {
    return { short_pct: 30, medium_pct: 50, long_pct: 20 };
  }
  
  // Sci-Fi/Fantasy: balanced for world-building
  if (['sci-fi', 'fantasy'].includes(genreLower)) {
    return { short_pct: 25, medium_pct: 45, long_pct: 30 };
  }
  
  // Default balanced distribution
  return { short_pct: 25, medium_pct: 50, long_pct: 25 };
}

export function calculateAutoTargets(inputs: TargetInputs): CalculatedTargets {
  const { format, duration, episodesCount, episodeDurationMin, complexity, genre } = inputs;

  // Dialogue/Action ratio by genre
  const dialogueActionByGenre: Record<string, string> = {
    'action': '40/60',
    'thriller': '55/45',
    'drama': '70/30',
    'comedy': '65/35',
    'sci-fi': '55/45',
    'fantasy': '55/45',
    'crime': '60/40',
    'horror': '50/50',
    'romance': '65/35',
    'mystery': '60/40',
    'default': '55/45'
  };

  const dialogue_action_ratio = dialogueActionByGenre[genre.toLowerCase()] || dialogueActionByGenre['default'];
  const scene_length_distribution = getSceneLengthDistribution(genre);

  if (format === 'film') {
    const M = duration || 100;
    
    // RECALIBRADO: 1 min ≈ 0.88 escenas (considerando variación de duración)
    // 90 min = ~79 escenas, 120 min = ~106, 150 min = ~132
    const scenes_target = clamp(Math.round(M * 0.88), 60, 150);
    
    // RECALIBRADO: Más localizaciones basadas en duración
    // 90 min = ~11 locs, 120 min = ~15, 150 min = ~19
    const locations_min = clamp(Math.round(M / 8), 8, 25);
    
    // Duration factor for scaling characters (100 min = base)
    const durationFactor = Math.max(0.8, Math.min(1.5, M / 100));
    
    // Characters by complexity
    let protagonists_min: number, supporting_min: number, extras_min: number;
    let setpieces_min: number, subplots_min: number, twists_min: number, hero_props_min: number;
    
    switch (complexity) {
      case 'simple':
        protagonists_min = 2;
        supporting_min = Math.round(6 * durationFactor);
        extras_min = Math.round(8 * durationFactor);
        setpieces_min = 2;
        subplots_min = 1;
        twists_min = 2;
        hero_props_min = 3;
        break;
      case 'high':
        protagonists_min = 3;
        supporting_min = Math.round(12 * durationFactor);
        extras_min = Math.round(18 * durationFactor);
        setpieces_min = 5;
        subplots_min = 4;
        twists_min = 4;
        hero_props_min = 7;
        break;
      default: // medium
        protagonists_min = 3;
        supporting_min = Math.round(9 * durationFactor);
        extras_min = Math.round(12 * durationFactor);
        setpieces_min = 3;
        subplots_min = 2;
        twists_min = 3;
        hero_props_min = 5;
    }
    
    return {
      protagonists_min,
      supporting_min,
      extras_min,
      locations_min,
      hero_props_min,
      setpieces_min,
      subplots_min,
      twists_min,
      scenes_target,
      dialogue_action_ratio,
      scene_length_distribution
    };
  } else {
    // Series
    const E = episodesCount || 6;
    const D = episodeDurationMin || 45;
    
    // RECALIBRADO: 1 min ≈ 0.9 escenas
    // 30 min = ~27 escenas, 45 min = ~40, 60 min = ~54
    // Estructura TV típica: Teaser (1-2), Acto 1 (6-8), Acto 2 (8-10), Acto 3 (6-8), Tag (1-2)
    const scenes_per_episode = clamp(Math.round(D * 0.9), 20, 65);
    
    // RECALIBRADO: Más localizaciones por minuto de contenido
    // 6 eps x 30 min = 180 min total → ~15 locs
    // 10 eps x 60 min = 600 min total → ~50 locs
    const locations_min = clamp(Math.round((E * D) / 12), 10, 50);
    
    // Duration factor for scaling characters (45 min = base)
    const durationFactor = Math.max(0.8, Math.min(1.5, D / 45));
    
    // Characters by complexity
    let protagonists_min: number, supporting_min: number, extras_min: number;
    let setpieces_min: number, subplots_min: number, twists_min: number, hero_props_min: number;
    
    switch (complexity) {
      case 'simple':
        protagonists_min = 2;
        supporting_min = Math.round(10 * durationFactor);
        extras_min = Math.round(14 * durationFactor);
        setpieces_min = E; // 1 per episode
        subplots_min = 3;
        twists_min = 1; // per episode
        hero_props_min = 5;
        break;
      case 'high':
        protagonists_min = 5;
        supporting_min = Math.round(20 * durationFactor);
        extras_min = Math.round(40 * durationFactor);
        setpieces_min = E + 4;
        subplots_min = 9;
        twists_min = 3; // per episode
        hero_props_min = 10;
        break;
      default: // medium
        protagonists_min = 3;
        supporting_min = Math.round(14 * durationFactor);
        extras_min = Math.round(24 * durationFactor);
        setpieces_min = E + 2;
        subplots_min = 5;
        twists_min = 2; // per episode
        hero_props_min = 7;
    }
    
    return {
      protagonists_min,
      supporting_min,
      extras_min,
      locations_min,
      hero_props_min,
      setpieces_min,
      subplots_min,
      twists_min,
      scenes_per_episode,
      dialogue_action_ratio,
      scene_length_distribution
    };
  }
}

/**
 * Calculate optimal batch configuration based on narrative complexity
 * More complex scripts = more batches = fewer scenes per batch = less tokens per call
 * This prevents timeouts and 429 rate limit errors
 */

// =============================================================================
// V3.0 UNIFIED QUALITY TIER SYSTEM
// Replaces legacy generation model selection
// =============================================================================
export type QualityTier = 'rapido' | 'profesional' | 'hollywood';

export interface QualityTierConfig {
  tier: QualityTier;
  displayName: string;
  description: string;
  estimatedTimePerEpisodeMin: number;
  delayBetweenBatchesMs: number;
  delayBetweenEpisodesMs: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualityTierConfig> = {
  rapido: {
    tier: 'rapido',
    displayName: '⚡ Rápido',
    description: 'MVPs, borradores funcionales (GPT-5-mini). ~2-5 min/ep',
    estimatedTimePerEpisodeMin: 2,
    delayBetweenBatchesMs: 2000,
    delayBetweenEpisodesMs: 3000
  },
  profesional: {
    tier: 'profesional',
    displayName: '🎬 Profesional',
    description: 'Scripts robustos y detallados (GPT-5). ~5-10 min/ep',
    estimatedTimePerEpisodeMin: 7,
    delayBetweenBatchesMs: 10000,
    delayBetweenEpisodesMs: 10000
  },
  hollywood: {
    tier: 'hollywood',
    displayName: '🏆 Hollywood',
    description: 'Guiones complejos, tono refinado (GPT-5.2). ~15-20 min/ep',
    estimatedTimePerEpisodeMin: 15,
    delayBetweenBatchesMs: 30000,
    delayBetweenEpisodesMs: 20000
  }
};

// Legacy type alias for backward compatibility
export type GenerationModel = 'rapido' | 'profesional' | 'hollywood';

// Legacy config (deprecated - kept for migration)
export interface GenerationModelConfig {
  model: GenerationModel;
  displayName: string;
  description: string;
  apiModel: string;
  provider: 'openai' | 'anthropic';
  delayBetweenBatchesMs: number;
  delayBetweenEpisodesMs: number;
  estimatedTimePerEpisodeMin: number;
  costPerEpisodeUsd: number;
}

// Map legacy models to new tiers (now same values)
export function legacyModelToTier(model: GenerationModel): QualityTier {
  return model; // Direct mapping since they're now the same type
}

// Legacy GENERATION_MODELS - deprecated, use QUALITY_TIERS
export const GENERATION_MODELS: Record<GenerationModel, GenerationModelConfig> = {
  rapido: {
    model: 'rapido',
    displayName: '⚡ Rápido (Legacy)',
    description: 'Usar Modo Borrador',
    apiModel: 'gpt-4o-mini',
    provider: 'openai',
    delayBetweenBatchesMs: 2000,
    delayBetweenEpisodesMs: 3000,
    estimatedTimePerEpisodeMin: 0.5,
    costPerEpisodeUsd: 0.007
  },
  profesional: {
    model: 'profesional',
    displayName: '🎬 Profesional (Legacy)',
    description: 'Usar Modo Borrador',
    apiModel: 'gpt-4o',
    provider: 'openai',
    delayBetweenBatchesMs: 5000,
    delayBetweenEpisodesMs: 8000,
    estimatedTimePerEpisodeMin: 1.5,
    costPerEpisodeUsd: 0.11
  },
  hollywood: {
    model: 'hollywood',
    displayName: '🏆 Hollywood (Legacy)',
    description: 'Usar Modo Producción',
    apiModel: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    delayBetweenBatchesMs: 50000,
    delayBetweenEpisodesMs: 30000,
    estimatedTimePerEpisodeMin: 15,
    costPerEpisodeUsd: 0.16
  }
};

export interface BatchConfig {
  batchesPerEpisode: number;
  scenesPerBatch: number;
  delayBetweenBatchesMs: number;
  estimatedScenesTotal: number;
}

/**
 * Calculate dynamic batch config based on complexity and quality tier
 * V3.0: Corrected to use 2 scenes per block for Hollywood quality
 * 
 * Key changes:
 * - scenesPerBatch: 2 (Hollywood) or 3 (simple) - never 4-6
 * - Uses genre-based scenesPerPage for accurate calculations
 */
export function calculateDynamicBatches(
  targets: CalculatedTargets,
  complexity: 'simple' | 'medium' | 'high',
  episodeBeats?: any[],
  durationMin?: number,
  qualityTier: QualityTier = 'profesional',
  genre: string = 'drama'
): BatchConfig {
  const baseDuration = 45;
  const actualDuration = durationMin || baseDuration;
  
  // V3.0: Use genre-based scenes per page
  const scenesPerPage = getScenesPerPageByGenre(genre);
  const estimatedScenes = targets.scenes_per_episode || Math.round(actualDuration * scenesPerPage);
  
  let complexityScore = complexity === 'simple' ? 20 : complexity === 'medium' ? 50 : 80;
  
  if (episodeBeats && episodeBeats.length > 0) {
    const avgAmbition = episodeBeats.reduce((sum, beat) => {
      const amb = beat.ambition_score || beat.complexity || 50;
      return sum + amb;
    }, 0) / episodeBeats.length;
    complexityScore += Math.round((avgAmbition - 50) / 50 * 15);
  }
  
  complexityScore = Math.max(0, Math.min(100, complexityScore));
  
  const tierConfig = QUALITY_TIERS[qualityTier];
  const delayMs = tierConfig.delayBetweenBatchesMs;
  
  // V3.0: Hollywood standard = 2 scenes per batch
  // More scenes = less quality per scene
  let scenesPerBatch: number;
  if (qualityTier === 'hollywood' || complexityScore >= 70) {
    scenesPerBatch = 2;  // Hollywood standard
  } else if (complexityScore <= 30) {
    scenesPerBatch = 3;  // Simple/fast mode
  } else {
    scenesPerBatch = 2;  // Default to quality
  }
  
  const batchesPerEpisode = Math.max(3, Math.min(40, Math.ceil(estimatedScenes / scenesPerBatch)));
  
  return {
    batchesPerEpisode,
    scenesPerBatch,
    delayBetweenBatchesMs: delayMs,
    estimatedScenesTotal: batchesPerEpisode * scenesPerBatch
  };
}
