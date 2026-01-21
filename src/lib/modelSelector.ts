/**
 * MODEL SELECTOR V1.0
 * 
 * Intelligent model selection for Writer's Room Hollywood Pipeline
 * Balances quality and cost by using appropriate models for each block type
 */

// Critical beats that require highest quality model
const CRITICAL_BEATS = [
  'cold_open',
  'teaser',
  'inciting_incident', 
  'first_plot_point',
  'midpoint',
  'midpoint_reversal',
  'all_is_lost',
  'dark_night_of_soul',
  'climax',
  'resolution',
  'cliffhanger',
  'season_finale'
] as const;

export type ModelTier = 'hollywood' | 'professional' | 'fast';
export type ModelId = 'openai/gpt-5.2' | 'openai/gpt-5' | 'openai/gpt-5-mini';

export interface SceneCard {
  scene_number: number;
  beat_executed?: string;
  duration_seconds?: number;
  objective?: string;
}

export interface ModelSelectionContext {
  sceneCards: SceneCard[];
  blockIndex: number;
  totalBlocks: number;
  driftWarnings: number;
  episodeNumber?: number;
  totalEpisodes?: number;
  qualityTier?: ModelTier;
}

export interface ModelSelectionResult {
  model: ModelId;
  reason: string;
  tier: ModelTier;
}

/**
 * Select appropriate model for a script block based on context
 * 
 * Rules:
 * 1. Rescue: If drift warnings >= 2 → gpt-5.2
 * 2. Critical beats (cold_open, climax, midpoint, etc.) → gpt-5.2
 * 3. Episode bookends (first/last block) → gpt-5.2
 * 4. Season premiere/finale episodes → gpt-5.2
 * 5. Default → gpt-5-mini
 */
export function selectModelForBlock(context: ModelSelectionContext): ModelSelectionResult {
  const {
    sceneCards,
    blockIndex,
    totalBlocks,
    driftWarnings,
    episodeNumber,
    totalEpisodes,
    qualityTier = 'professional'
  } = context;

  // Force hollywood tier uses gpt-5.2 for everything
  if (qualityTier === 'hollywood') {
    return {
      model: 'openai/gpt-5.2',
      reason: 'HOLLYWOOD_TIER',
      tier: 'hollywood'
    };
  }

  // Rescue: if drift warnings indicate problems
  if (driftWarnings >= 2) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'RESCUE_DRIFT',
      tier: 'hollywood'
    };
  }

  // Check for critical beats in scene cards
  const hasCriticalBeat = sceneCards.some(sc => {
    const beat = sc.beat_executed?.toLowerCase() || '';
    return CRITICAL_BEATS.some(cb => beat.includes(cb));
  });
  
  if (hasCriticalBeat) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'CRITICAL_BEAT',
      tier: 'hollywood'
    };
  }

  // Episode bookends: first and last block of episode
  if (blockIndex === 0) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'EPISODE_OPENING',
      tier: 'hollywood'
    };
  }
  
  if (blockIndex === totalBlocks - 1) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'EPISODE_CLOSING',
      tier: 'hollywood'
    };
  }

  // Season premiere/finale
  if (episodeNumber && totalEpisodes) {
    if (episodeNumber === 1 || episodeNumber === totalEpisodes) {
      return {
        model: 'openai/gpt-5',
        reason: 'SEASON_BOOKEND',
        tier: 'professional'
      };
    }
  }

  // Fast tier uses mini for everything
  if (qualityTier === 'fast') {
    return {
      model: 'openai/gpt-5-mini',
      reason: 'FAST_TIER',
      tier: 'fast'
    };
  }

  // Default: professional tier uses gpt-5-mini for standard blocks
  return {
    model: 'openai/gpt-5-mini',
    reason: 'STANDARD_BLOCK',
    tier: 'fast' // Cost-effective for non-critical blocks
  };
}

/**
 * Calculate scenes per block based on scene characteristics
 * 
 * Rules:
 * - Short scenes (<90s avg): 3 scenes per block
 * - Long scenes (>180s avg): 1 scene per block  
 * - Default: 2 scenes per block (Hollywood standard)
 */
export function calculateScenesPerBlock(sceneCards: SceneCard[]): number {
  if (!sceneCards.length) return 2;
  
  const avgDuration = sceneCards.reduce((sum, sc) => 
    sum + (sc.duration_seconds || 120), 0
  ) / sceneCards.length;
  
  // Short scenes: pack more together
  if (avgDuration < 90) return 3;
  
  // Long scenes/setpieces: one at a time
  if (avgDuration > 180) return 1;
  
  // Default: Hollywood standard
  return 2;
}

/**
 * Estimate model distribution for a project
 * Useful for cost estimation
 */
export function estimateModelDistribution(
  totalBlocks: number,
  totalEpisodes: number,
  qualityTier: ModelTier = 'professional'
): { gpt52Blocks: number; gpt5Blocks: number; gpt5MiniBlocks: number; estimatedSavings: number } {
  if (qualityTier === 'hollywood') {
    return {
      gpt52Blocks: totalBlocks,
      gpt5Blocks: 0,
      gpt5MiniBlocks: 0,
      estimatedSavings: 0
    };
  }

  // Estimate based on typical distribution:
  // - 2 blocks per episode are bookends → gpt-5.2
  // - ~15% of blocks have critical beats → gpt-5.2
  // - ~5% need rescue → gpt-5.2
  // - Rest → gpt-5-mini
  
  const bookendBlocks = totalEpisodes * 2;
  const criticalBlocks = Math.ceil(totalBlocks * 0.15);
  const rescueBlocks = Math.ceil(totalBlocks * 0.05);
  const seasonBookendBlocks = 4; // First and last episode get upgrades
  
  const gpt52Blocks = Math.min(
    totalBlocks,
    bookendBlocks + criticalBlocks + rescueBlocks + seasonBookendBlocks
  );
  
  const gpt5Blocks = Math.min(
    totalBlocks - gpt52Blocks,
    Math.ceil(totalBlocks * 0.05) // Season bookends use gpt-5
  );
  
  const gpt5MiniBlocks = totalBlocks - gpt52Blocks - gpt5Blocks;

  // Cost ratio: gpt-5.2 = 10x, gpt-5 = 3x, gpt-5-mini = 1x
  const allGpt52Cost = totalBlocks * 10;
  const mixedCost = (gpt52Blocks * 10) + (gpt5Blocks * 3) + (gpt5MiniBlocks * 1);
  const estimatedSavings = Math.round((1 - mixedCost / allGpt52Cost) * 100);

  return {
    gpt52Blocks,
    gpt5Blocks,
    gpt5MiniBlocks,
    estimatedSavings
  };
}

/**
 * Get model for specific task types
 */
export function getModelForTask(taskType: 
  'bible' | 'outline' | 'scene_cards' | 'script_block' | 'polish' | 'rescue' | 'drift_check'
): ModelId {
  switch (taskType) {
    case 'bible':
    case 'outline':
    case 'polish':
    case 'rescue':
      return 'openai/gpt-5.2';
    
    case 'scene_cards':
    case 'drift_check':
      return 'openai/gpt-5-mini';
    
    case 'script_block':
    default:
      return 'openai/gpt-5-mini'; // Selected dynamically based on context
  }
}
