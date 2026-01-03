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
export interface BatchConfig {
  batchesPerEpisode: number;
  scenesPerBatch: number;
  delayBetweenBatchesMs: number;
  estimatedScenesTotal: number;
}

export function calculateDynamicBatches(
  targets: CalculatedTargets,
  complexity: 'simple' | 'medium' | 'high',
  ambitionSliders?: { humor: number; darkness: number; realism: number; worldIntensity: number }
): BatchConfig {
  // Base scenes per episode from targets
  const baseScenesPerEpisode = targets.scenes_per_episode || 20;
  
  // Calculate complexity score (0-100)
  let complexityScore = 0;
  
  // From complexity level
  switch (complexity) {
    case 'simple': complexityScore += 20; break;
    case 'medium': complexityScore += 40; break;
    case 'high': complexityScore += 60; break;
  }
  
  // From character density
  const characterDensity = (targets.protagonists_min || 0) + (targets.supporting_min || 0);
  if (characterDensity > 15) complexityScore += 15;
  else if (characterDensity > 10) complexityScore += 10;
  else if (characterDensity > 5) complexityScore += 5;
  
  // From locations
  if ((targets.locations_min || 0) > 15) complexityScore += 10;
  else if ((targets.locations_min || 0) > 10) complexityScore += 5;
  
  // From subplots and twists
  complexityScore += Math.min((targets.subplots_min || 0) * 3, 12);
  complexityScore += Math.min((targets.twists_min || 0) * 2, 8);
  
  // From ambition sliders (if provided)
  if (ambitionSliders) {
    const avgAmbition = (
      (ambitionSliders.humor || 50) + 
      (ambitionSliders.darkness || 50) + 
      (ambitionSliders.realism || 50) + 
      (ambitionSliders.worldIntensity || 50)
    ) / 4;
    // Add up to 15 points for high ambition
    complexityScore += Math.round((avgAmbition - 50) / 50 * 15);
  }
  
  // Clamp to 0-100
  complexityScore = Math.max(0, Math.min(100, complexityScore));
  
  // Determine batches based on complexity score
  // Low complexity (0-30): 3 batches, 7 scenes each = 21 scenes
  // Medium complexity (31-60): 5 batches, 5 scenes each = 25 scenes  
  // High complexity (61-80): 6 batches, 4 scenes each = 24 scenes
  // Very high complexity (81+): 8 batches, 3 scenes each = 24 scenes
  
  let batchesPerEpisode: number;
  let scenesPerBatch: number;
  let delayMs: number;
  
  if (complexityScore <= 30) {
    batchesPerEpisode = 3;
    scenesPerBatch = 7;
    delayMs = 1500; // Less delay needed for simpler batches
  } else if (complexityScore <= 60) {
    batchesPerEpisode = 5;
    scenesPerBatch = 5;
    delayMs = 2000;
  } else if (complexityScore <= 80) {
    batchesPerEpisode = 6;
    scenesPerBatch = 4;
    delayMs = 2500;
  } else {
    batchesPerEpisode = 8;
    scenesPerBatch = 3;
    delayMs = 3000; // More delay for very complex batches
  }
  
  return {
    batchesPerEpisode,
    scenesPerBatch,
    delayBetweenBatchesMs: delayMs,
    estimatedScenesTotal: batchesPerEpisode * scenesPerBatch
  };
}
