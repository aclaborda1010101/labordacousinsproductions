// Auto Target Calculator for Script Generation
// Based on format, duration, complexity, and genre

export interface TargetInputs {
  format: 'film' | 'series';
  duration?: number; // film duration in minutes
  episodesCount?: number;
  episodeDurationMin?: number;
  complexity: 'simple' | 'medium' | 'high';
  genre: string;
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
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max);

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

  if (format === 'film') {
    const M = duration || 100;
    
    // Scenes
    const scenes_target = clamp(Math.round(M / 2), 35, 80);
    
    // Locations
    const locations_min = clamp(Math.round(M / 10), 6, 18);
    
    // Characters by complexity
    let protagonists_min: number, supporting_min: number, extras_min: number;
    let setpieces_min: number, subplots_min: number, twists_min: number, hero_props_min: number;
    
    switch (complexity) {
      case 'simple':
        protagonists_min = 2;
        supporting_min = 6;
        extras_min = 8;
        setpieces_min = 2;
        subplots_min = 1;
        twists_min = 2;
        hero_props_min = 3;
        break;
      case 'high':
        protagonists_min = 3;
        supporting_min = 12;
        extras_min = 18;
        setpieces_min = 5;
        subplots_min = 4;
        twists_min = 4;
        hero_props_min = 7;
        break;
      default: // medium
        protagonists_min = 3;
        supporting_min = 9;
        extras_min = 12;
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
      dialogue_action_ratio
    };
  } else {
    // Series
    const E = episodesCount || 6;
    const D = episodeDurationMin || 45;
    
    // Scenes per episode
    const scenes_per_episode = clamp(Math.round(D / 2.2), 10, 22);
    
    // Locations (across season)
    const locations_min = clamp(Math.round((E * D) / 25), 8, 30);
    
    // Characters by complexity
    let protagonists_min: number, supporting_min: number, extras_min: number;
    let setpieces_min: number, subplots_min: number, twists_min: number, hero_props_min: number;
    
    switch (complexity) {
      case 'simple':
        protagonists_min = 2;
        supporting_min = 10;
        extras_min = 14;
        setpieces_min = E; // 1 per episode
        subplots_min = 3;
        twists_min = 1; // per episode
        hero_props_min = 5;
        break;
      case 'high':
        protagonists_min = 5;
        supporting_min = 20;
        extras_min = 40;
        setpieces_min = E + 4;
        subplots_min = 9;
        twists_min = 3; // per episode
        hero_props_min = 10;
        break;
      default: // medium
        protagonists_min = 3;
        supporting_min = 14;
        extras_min = 24;
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
      dialogue_action_ratio
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
export type QualityTier = 'DRAFT' | 'PRODUCTION';

export interface QualityTierConfig {
  tier: QualityTier;
  displayName: string;
  description: string;
  estimatedTimePerEpisodeMin: number;
  delayBetweenBatchesMs: number;
  delayBetweenEpisodesMs: number;
}

export const QUALITY_TIERS: Record<QualityTier, QualityTierConfig> = {
  DRAFT: {
    tier: 'DRAFT',
    displayName: '📝 Modo Borrador',
    description: 'Rápido para revisión (GPT-4o-mini). ~2-5 min/episodio',
    estimatedTimePerEpisodeMin: 2,
    delayBetweenBatchesMs: 2000,
    delayBetweenEpisodesMs: 3000
  },
  PRODUCTION: {
    tier: 'PRODUCTION',
    displayName: '🎬 Modo Producción',
    description: 'Calidad Hollywood (Claude Sonnet). ~10-20 min/episodio',
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

// Map legacy models to new tiers
export function legacyModelToTier(model: GenerationModel): QualityTier {
  if (model === 'rapido' || model === 'profesional') return 'DRAFT';
  return 'PRODUCTION';
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
 */
export function calculateDynamicBatches(
  targets: CalculatedTargets,
  complexity: 'simple' | 'medium' | 'high',
  episodeBeats?: any[],
  durationMin?: number,
  qualityTier: QualityTier = 'PRODUCTION'
): BatchConfig {
  const baseDuration = 45;
  const actualDuration = durationMin || baseDuration;
  const durationMultiplier = Math.max(0.7, Math.min(2, actualDuration / baseDuration));
  
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
  
  let baseBatches: number;
  let baseScenesPerBatch: number;
  
  if (complexityScore <= 30) {
    baseBatches = 3;
    baseScenesPerBatch = 5;
  } else if (complexityScore <= 60) {
    baseBatches = 4;
    baseScenesPerBatch = 4;
  } else if (complexityScore <= 80) {
    baseBatches = 5;
    baseScenesPerBatch = 3;
  } else {
    baseBatches = 6;
    baseScenesPerBatch = 3;
  }
  
  const batchesPerEpisode = Math.max(2, Math.min(12, Math.round(baseBatches * durationMultiplier)));
  
  return {
    batchesPerEpisode,
    scenesPerBatch: baseScenesPerBatch,
    delayBetweenBatchesMs: delayMs,
    estimatedScenesTotal: batchesPerEpisode * baseScenesPerBatch
  };
}
