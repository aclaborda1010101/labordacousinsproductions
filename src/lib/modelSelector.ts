/**
 * MODEL SELECTOR V1.1
 * 
 * Intelligent model selection for Writer's Room Hollywood Pipeline
 * Balances quality and cost by using appropriate models for each block type
 * 
 * P1.2 REFINEMENTS:
 * - REVEAL_DIALOGUE: Reveals + intense confrontations → gpt-5.2
 * - VISUAL_SETPIECE: Scenes >4min or action-heavy → gpt-5.2
 * - POST_RESCUE_STABILIZE: Block after rescue also uses gpt-5.2
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
  'season_finale',
  'reveal',
  'confession',
  'twist',
  'confrontation'
] as const;

// Reveal-related keywords for intense dialogue detection
const REVEAL_KEYWORDS = ['reveal', 'confession', 'twist', 'secret', 'truth', 'discover'];
const INTENSE_DIALOGUE_KEYWORDS = ['confronta', 'revela', 'enfrenta', 'acusa', 'confiesa'];
const SETPIECE_KEYWORDS = ['setpiece', 'action', 'chase', 'fight', 'escape', 'explosion'];

export type ModelTier = 'hollywood' | 'professional' | 'fast';
export type ModelId = 'openai/gpt-5.2' | 'openai/gpt-5' | 'openai/gpt-5-mini';

export interface SceneCard {
  scene_number: number;
  beat_executed?: string;
  duration_seconds?: number;
  objective?: string;
  conflict?: string;
}

export interface ModelSelectionContext {
  sceneCards: SceneCard[];
  blockIndex: number;
  totalBlocks: number;
  driftWarnings: number;
  episodeNumber?: number;
  totalEpisodes?: number;
  qualityTier?: ModelTier;
  previousBlockWasRescue?: boolean; // P1.2: Post-rescue stabilization
}

export interface ModelSelectionResult {
  model: ModelId;
  reason: string;
  tier: ModelTier;
}

/**
 * Select appropriate model for a script block based on context
 * 
 * Rules (in priority order):
 * 1. Hollywood tier override → gpt-5.2
 * 2. Rescue: If drift warnings >= 2 → gpt-5.2
 * 3. Post-rescue stabilization → gpt-5.2
 * 4. Reveal + intense dialogue → gpt-5.2
 * 5. Visual setpiece → gpt-5.2  
 * 6. Critical beats (cold_open, climax, midpoint, etc.) → gpt-5.2
 * 7. Episode bookends (first/last block) → gpt-5.2
 * 8. Season premiere/finale episodes → gpt-5
 * 9. Default → gpt-5-mini
 */
export function selectModelForBlock(context: ModelSelectionContext): ModelSelectionResult {
  const {
    sceneCards,
    blockIndex,
    totalBlocks,
    driftWarnings,
    episodeNumber,
    totalEpisodes,
    qualityTier = 'professional',
    previousBlockWasRescue = false
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

  // P1.2: Post-rescue stabilization - use premium model to prevent cascade
  if (previousBlockWasRescue) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'POST_RESCUE_STABILIZE',
      tier: 'hollywood'
    };
  }

  // P1.2: Check for reveal + intense dialogue combination
  const hasReveal = sceneCards.some(sc => {
    const beat = (sc.beat_executed || '').toLowerCase();
    const objective = (sc.objective || '').toLowerCase();
    return REVEAL_KEYWORDS.some(kw => beat.includes(kw) || objective.includes(kw));
  });
  
  const hasIntenseDialogue = sceneCards.some(sc => {
    const objective = (sc.objective || '').toLowerCase();
    const conflict = (sc.conflict || '').toLowerCase();
    return INTENSE_DIALOGUE_KEYWORDS.some(kw => objective.includes(kw) || conflict.includes(kw));
  });

  if (hasReveal && hasIntenseDialogue) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'REVEAL_DIALOGUE',
      tier: 'hollywood'
    };
  }

  // P1.2: Check for visual setpiece
  const hasSetpiece = sceneCards.some(sc => {
    const beat = (sc.beat_executed || '').toLowerCase();
    const duration = sc.duration_seconds || 0;
    const isLongScene = duration > 240; // >4 minutes
    const isSetpieceBeat = SETPIECE_KEYWORDS.some(kw => beat.includes(kw));
    return isLongScene || isSetpieceBeat;
  });

  if (hasSetpiece) {
    return {
      model: 'openai/gpt-5.2',
      reason: 'VISUAL_SETPIECE',
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

  // P1.2: Updated estimates with reveal/setpiece/post-rescue rules
  // - 2 blocks per episode are bookends → gpt-5.2
  // - ~20% of blocks have critical beats/reveals/setpieces → gpt-5.2
  // - ~5% need rescue + 5% post-rescue → gpt-5.2
  // - Season premiere/finale get upgrades → gpt-5
  // - Rest → gpt-5-mini
  
  const bookendBlocks = totalEpisodes * 2;
  const criticalBlocks = Math.ceil(totalBlocks * 0.20); // Increased from 15%
  const rescueAndPostRescue = Math.ceil(totalBlocks * 0.10); // 5% rescue + 5% stabilize
  const seasonBookendBlocks = 4;
  
  const gpt52Blocks = Math.min(
    totalBlocks,
    bookendBlocks + criticalBlocks + rescueAndPostRescue + seasonBookendBlocks
  );
  
  const gpt5Blocks = Math.min(
    totalBlocks - gpt52Blocks,
    Math.ceil(totalBlocks * 0.05)
  );
  
  const gpt5MiniBlocks = Math.max(0, totalBlocks - gpt52Blocks - gpt5Blocks);

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
  'bible' | 'outline' | 'scene_cards' | 'script_block' | 'polish' | 'rescue' | 'drift_check' | 'auto_fix'
): ModelId {
  switch (taskType) {
    case 'bible':
    case 'outline':
    case 'polish':
    case 'rescue':
      return 'openai/gpt-5.2';
    
    case 'scene_cards':
    case 'drift_check':
    case 'auto_fix': // P1.3: Light fixes use mini
      return 'openai/gpt-5-mini';
    
    case 'script_block':
    default:
      return 'openai/gpt-5-mini'; // Selected dynamically based on context
  }
}
