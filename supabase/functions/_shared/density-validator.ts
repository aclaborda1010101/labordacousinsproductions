/**
 * DENSITY VALIDATOR V1.0
 * Validates that outlines meet minimum narrative density requirements
 * before script generation can proceed.
 * 
 * The Density System ensures scripts are RICHER than outlines, not poorer.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface DensityProfile {
  min_characters_total: number;
  min_supporting_characters: number;
  min_antagonists: number;
  min_locations: number;
  min_scenes_per_episode: number;
  min_threads_total: number;
  min_secondary_threads: number;
}

export interface OutlineCounts {
  characters_total: number;
  supporting_characters: number;
  antagonists: number;
  protagonists: number;
  locations: number;
  episodes: number;
  scenes_per_episode: number[];
  threads_total: number;
  primary_threads: number;
  secondary_threads: number;
  average_turning_points_per_episode: number;
}

export interface RequiredFix {
  type: 'ADD_CHARACTER' | 'ADD_LOCATION' | 'ADD_THREAD' | 'ADD_SCENE_PLAN' | 'ADD_ANTAGONIST';
  id: string;
  title: string;
  why_needed: string;
  where_to_apply: string;
  acceptance_test: string;
}

export interface DensityCoverage {
  characters_missing: string[];
  locations_missing: string[];
  threads_missing: string[];
  episode_scene_plan_missing: number[];
}

export interface DensityCheckResult {
  status: 'PASS' | 'FAIL';
  density_profile: DensityProfile;
  outline_counts: OutlineCounts;
  coverage: DensityCoverage;
  required_fixes: RequiredFix[];
  acceptance_tests: string[];
  human_summary: string;
  score: number; // 0-100
}

// ============================================================================
// DEFAULT PROFILES
// ============================================================================

export const DENSITY_PROFILES: Record<string, DensityProfile> = {
  // ============================================================================
  // SERIES PROFILES
  // ============================================================================
  serie_drama: {
    min_characters_total: 8,
    min_supporting_characters: 3,
    min_antagonists: 1,
    min_locations: 6,
    min_scenes_per_episode: 8,
    min_threads_total: 5,
    min_secondary_threads: 2
  },
  serie_adictiva: {
    min_characters_total: 10,
    min_supporting_characters: 4,
    min_antagonists: 2,
    min_locations: 8,
    min_scenes_per_episode: 10,
    min_threads_total: 6,
    min_secondary_threads: 3
  },
  serie_antologia: {
    min_characters_total: 6,
    min_supporting_characters: 2,
    min_antagonists: 1,
    min_locations: 5,
    min_scenes_per_episode: 8,
    min_threads_total: 3,
    min_secondary_threads: 1
  },
  
// ============================================================================
// FILM PROFILES V3.0 - User-selectable complexity levels
// ============================================================================

// INDIE/AUTOR - Character-driven, intimate productions
// Use case: Art house films, character studies, low-budget productions
film_indie: {
  min_characters_total: 6,       // 2 protagonists + 1 antagonist + 3 supporting
  min_supporting_characters: 3,  // Named characters with presence
  min_antagonists: 1,            // Can be internal or subtle
  min_locations: 6,              // Intimate, well-developed spaces
  min_scenes_per_episode: 25,    // ~3.5 min average per scene
  min_threads_total: 2,          // A-plot + B-plot
  min_secondary_threads: 1       // Character relationship subplot
},

// STANDARD - Balanced production (RECOMMENDED DEFAULT)
// Use case: Most theatrical releases, streaming originals
film_standard: {
  min_characters_total: 10,      // 2-3 protagonists + 1-2 antagonists + 5-6 supporting
  min_supporting_characters: 5,  // Named characters with arcs
  min_antagonists: 1,            // Clear opposition
  min_locations: 10,             // Good visual variety
  min_scenes_per_episode: 35,    // ~2.5 min average per scene
  min_threads_total: 3,          // A + B + C plots
  min_secondary_threads: 2       // Character-driven subplots
},

// HOLLYWOOD - Full production density for major releases
// Use case: Theatrical blockbusters, ensemble pieces
film_hollywood: {
  min_characters_total: 15,      // Large ensemble
  min_supporting_characters: 8,  // Named characters with arcs
  min_antagonists: 2,            // Main + secondary opposition
  min_locations: 15,             // High visual variety
  min_scenes_per_episode: 45,    // ~2 min average per scene
  min_threads_total: 5,          // Multiple interwoven plots
  min_secondary_threads: 3       // Character-driven subplots
},

// BLOCKBUSTER - Epic scale productions
film_blockbuster: {
  min_characters_total: 20,
  min_supporting_characters: 10,
  min_antagonists: 2,
  min_locations: 20,
  min_scenes_per_episode: 55,
  min_threads_total: 6,
  min_secondary_threads: 4
},

// ============================================================================
// LEGACY COMPAT - Map old names to new profiles
// ============================================================================

// Legacy: film_90min -> film_standard (was too strict with Hollywood requirements)
film_90min: {
  min_characters_total: 10,      // Reduced from 15
  min_supporting_characters: 5,  // Reduced from 8
  min_antagonists: 1,            // Reduced from 2
  min_locations: 10,             // Reduced from 15
  min_scenes_per_episode: 35,    // Reduced from 45
  min_threads_total: 3,          // Reduced from 5
  min_secondary_threads: 2       // Reduced from 3
},

film_120min: {
  min_characters_total: 12,
  min_supporting_characters: 6,
  min_antagonists: 2,
  min_locations: 12,
  min_scenes_per_episode: 45,
  min_threads_total: 4,
  min_secondary_threads: 3
},

// Legacy Spanish name - Relaxed for typical 90-min drama
pelicula_90min: {
  min_characters_total: 5,       // Reduced: 2 protagonists + 1 antagonist + 2 supporting
  min_supporting_characters: 1,   // Reduced: 1 ally/secondary is enough for intimate dramas
  min_antagonists: 1,
  min_locations: 5,              // Reduced: sufficient for variety
  min_scenes_per_episode: 20,    // Reduced: ~4.5 min average per scene
  min_threads_total: 2,          // Reduced: A-plot + B-plot is enough
  min_secondary_threads: 1       // One subplot is sufficient
},
  
  // ============================================================================
  // SHORT FORM
  // ============================================================================
  corto: {
    min_characters_total: 3,
    min_supporting_characters: 1,
    min_antagonists: 0,
    min_locations: 2,
    min_scenes_per_episode: 5,
    min_threads_total: 1,
    min_secondary_threads: 0
  },
  piloto: {
    min_characters_total: 6,
    min_supporting_characters: 2,
    min_antagonists: 1,
    min_locations: 4,
    min_scenes_per_episode: 12,
    min_threads_total: 4,
    min_secondary_threads: 2
  },
  
  // ============================================================================
  // MINI-SERIES (3-6 episodes)
  // ============================================================================
  mini_limited: {
    min_characters_total: 7,
    min_supporting_characters: 3,
    min_antagonists: 1,
    min_locations: 5,
    min_scenes_per_episode: 10,
    min_threads_total: 4,
    min_secondary_threads: 2
  }
};

// ============================================================================
// OUTLINE COUNTS EXTRACTION
// ============================================================================

export function extractOutlineCounts(outline: Record<string, unknown>): OutlineCounts {
  const counts: OutlineCounts = {
    characters_total: 0,
    supporting_characters: 0,
    antagonists: 0,
    protagonists: 0,
    locations: 0,
    episodes: 0,
    scenes_per_episode: [],
    threads_total: 0,
    primary_threads: 0,
    secondary_threads: 0,
    average_turning_points_per_episode: 0
  };

  // Extract characters
  const mainChars = (outline.main_characters || outline.characters || outline.cast || []) as any[];
  counts.characters_total = mainChars.length;
  
  for (const char of mainChars) {
    const role = (char.role || char.character_role || '').toLowerCase();
    if (role.includes('protag') || role === 'main' || role === 'principal') {
      counts.protagonists++;
    } else if (role.includes('antag') || role.includes('villain') || role.includes('opponent')) {
      counts.antagonists++;
    } else {
      // Explicitly recognize ally, mentor, friend, support as supporting characters
      counts.supporting_characters++;
    }
  }

  // Extract locations
  const locations = (outline.main_locations || outline.locations || []) as any[];
  counts.locations = locations.length;

  // ============================================================================
  // V2: DETECT FILM ACT STRUCTURE (ACT_I, ACT_II, ACT_III)
  // ============================================================================
  const actI = outline.ACT_I as Record<string, unknown> | undefined;
  const actII = outline.ACT_II as Record<string, unknown> | undefined;
  const actIII = outline.ACT_III as Record<string, unknown> | undefined;
  
  const hasActStructure = actI || actII || actIII;
  
  if (hasActStructure) {
    // Film with 3-act structure - count beats from each act
    const actIBeats = (actI?.beats || actI?.detailed_beats || []) as any[];
    const actIIBeats = (actII?.beats || actII?.detailed_beats || []) as any[];
    const actIIIBeats = (actIII?.beats || actIII?.detailed_beats || []) as any[];
    
    const totalBeats = actIBeats.length + actIIBeats.length + actIIIBeats.length;
    
    console.log('[density-validator] Film act structure detected:', {
      actI: actIBeats.length,
      actII: actIIBeats.length,
      actIII: actIIIBeats.length,
      totalBeats
    });
    
    // Count turning points from acts
    let totalTurningPoints = 0;
    
    // ACT I turning points
    if (actI?.inciting_incident) totalTurningPoints++;
    if (actI?.point_of_no_return || actI?.first_plot_point) totalTurningPoints++;
    
    // ACT II turning points  
    if (actII?.midpoint_reversal) totalTurningPoints++;
    if (actII?.all_is_lost || actII?.crisis) totalTurningPoints++;
    
    // ACT III turning points
    if (actIII?.climax_decision || actIII?.climax) totalTurningPoints++;
    if (actIII?.resolution) totalTurningPoints++;
    
    // Estimate scenes: each beat typically generates 1-2 scenes
    // Minimum: 20 scenes for a 90-min film (~4.5 min/scene average)
    // With beats, estimate 2 scenes per beat for dramatic development
    const estimatedScenes = Math.max(
      totalBeats * 2,
      totalTurningPoints * 3,
      20 // Absolute minimum for a film
    );
    
    counts.episodes = 1; // A film is treated as 1 "episode"
    counts.scenes_per_episode = [estimatedScenes];
    counts.average_turning_points_per_episode = totalTurningPoints;
    
    console.log('[density-validator] Film scene estimate:', estimatedScenes);
  } else {
    // ============================================================================
    // ORIGINAL: SERIES EPISODE STRUCTURE
    // ============================================================================
    const episodeBeats = (outline.episode_beats || []) as any[];
    counts.episodes = episodeBeats.length;
    
    let totalTurningPoints = 0;
    for (const ep of episodeBeats) {
      // Estimate scenes per episode from turning_points, beats, or setpieces
      const tps = (ep.turning_points || []).length;
      totalTurningPoints += tps;
      
      // Each turning point usually needs 1-2 scenes + setup/resolution
      const estimatedScenes = Math.max(
        tps * 2,
        (ep.beats || []).length,
        8 // Minimum reasonable estimate
      );
      counts.scenes_per_episode.push(estimatedScenes);
    }
    
    counts.average_turning_points_per_episode = counts.episodes > 0 
      ? Math.round(totalTurningPoints / counts.episodes) 
      : 0;
  }

  // Extract threads
  const threads = (outline.threads || outline.subplots || []) as any[];
  counts.threads_total = threads.length;
  
  for (const thread of threads) {
    const threadType = (thread.type || thread.category || 'secondary').toLowerCase();
    if (threadType === 'primary' || threadType === 'main' || threadType === 'a') {
      counts.primary_threads++;
    } else {
      counts.secondary_threads++;
    }
  }

  // Also count threads from thread_usage if available
  if (outline.thread_usage && typeof outline.thread_usage === 'object') {
    const threadUsage = outline.thread_usage as Record<string, any>;
    const uniqueThreads = new Set<string>();
    
    for (const [epKey, usage] of Object.entries(threadUsage)) {
      if (usage.primary_thread) uniqueThreads.add(usage.primary_thread);
      if (usage.secondary_threads) {
        for (const t of usage.secondary_threads) {
          uniqueThreads.add(t);
        }
      }
    }
    
    // Use the higher count
    if (uniqueThreads.size > counts.threads_total) {
      counts.threads_total = uniqueThreads.size;
      counts.primary_threads = 1; // At least one primary
      counts.secondary_threads = uniqueThreads.size - 1;
    }
  }

  // V2: Also infer threads from thematic_premise if no explicit threads
  if (counts.threads_total === 0) {
    // Check for thematic elements that imply threads
    if (outline.thematic_premise) counts.threads_total++;
    if (outline.central_question) counts.threads_total++;
    if ((outline.character_arcs as any[])?.length > 0) {
      counts.threads_total += Math.min((outline.character_arcs as any[]).length, 2);
    }
    counts.primary_threads = counts.threads_total > 0 ? 1 : 0;
    counts.secondary_threads = Math.max(0, counts.threads_total - 1);
  }

  return counts;
}

// ============================================================================
// GENERATE REQUIRED FIXES
// ============================================================================

export function generateRequiredFixes(
  counts: OutlineCounts,
  profile: DensityProfile
): RequiredFix[] {
  const fixes: RequiredFix[] = [];

  // Characters fixes
  const charDeficit = profile.min_characters_total - counts.characters_total;
  if (charDeficit > 0) {
    fixes.push({
      type: 'ADD_CHARACTER',
      id: `add_chars_${charDeficit}`,
      title: `Añadir ${charDeficit} personaje(s)`,
      why_needed: `El perfil de densidad requiere ${profile.min_characters_total} personajes, tienes ${counts.characters_total}`,
      where_to_apply: 'global',
      acceptance_test: `main_characters.length >= ${profile.min_characters_total}`
    });
  }

  // Supporting characters
  const supportingDeficit = profile.min_supporting_characters - counts.supporting_characters;
  if (supportingDeficit > 0) {
    fixes.push({
      type: 'ADD_CHARACTER',
      id: `add_supporting_${supportingDeficit}`,
      title: `Añadir ${supportingDeficit} personaje(s) secundario(s)`,
      why_needed: `Necesitas personajes que creen fricción, apoyo o contraste con los protagonistas`,
      where_to_apply: 'global',
      acceptance_test: `supporting_characters >= ${profile.min_supporting_characters}`
    });
  }

  // Antagonists
  const antagDeficit = profile.min_antagonists - counts.antagonists;
  if (antagDeficit > 0) {
    fixes.push({
      type: 'ADD_ANTAGONIST',
      id: `add_antag_${antagDeficit}`,
      title: `Añadir ${antagDeficit} antagonista(s)`,
      why_needed: `Sin antagonista claro, el conflicto narrativo es débil`,
      where_to_apply: 'global',
      acceptance_test: `antagonists >= ${profile.min_antagonists}`
    });
  }

  // Locations
  const locDeficit = profile.min_locations - counts.locations;
  if (locDeficit > 0) {
    fixes.push({
      type: 'ADD_LOCATION',
      id: `add_locs_${locDeficit}`,
      title: `Añadir ${locDeficit} localización(es)`,
      why_needed: `Más localizaciones = más variedad visual y oportunidades de conflicto`,
      where_to_apply: 'global',
      acceptance_test: `main_locations.length >= ${profile.min_locations}`
    });
  }

  // Threads
  const threadDeficit = profile.min_threads_total - counts.threads_total;
  if (threadDeficit > 0) {
    fixes.push({
      type: 'ADD_THREAD',
      id: `add_threads_${threadDeficit}`,
      title: `Añadir ${threadDeficit} trama(s)`,
      why_needed: `Las tramas secundarias dan profundidad y permiten cruces narrativos`,
      where_to_apply: 'global',
      acceptance_test: `threads.length >= ${profile.min_threads_total}`
    });
  }

  // Secondary threads
  const secThreadDeficit = profile.min_secondary_threads - counts.secondary_threads;
  if (secThreadDeficit > 0 && threadDeficit <= 0) {
    fixes.push({
      type: 'ADD_THREAD',
      id: `add_secondary_${secThreadDeficit}`,
      title: `Añadir ${secThreadDeficit} trama(s) secundaria(s)`,
      why_needed: `Las tramas secundarias evitan un guion plano y predecible`,
      where_to_apply: 'global',
      acceptance_test: `secondary_threads >= ${profile.min_secondary_threads}`
    });
  }

  // Scenes per episode
  const episodesWithLowScenes: number[] = [];
  counts.scenes_per_episode.forEach((sceneCount, idx) => {
    if (sceneCount < profile.min_scenes_per_episode) {
      episodesWithLowScenes.push(idx + 1);
    }
  });

  if (episodesWithLowScenes.length > 0) {
    fixes.push({
      type: 'ADD_SCENE_PLAN',
      id: `add_scenes_${episodesWithLowScenes.join('_')}`,
      title: `Añadir turning points/beats en episodios ${episodesWithLowScenes.join(', ')}`,
      why_needed: `Cada episodio necesita ≥${profile.min_scenes_per_episode} escenas para mantener ritmo`,
      where_to_apply: `episodes: ${episodesWithLowScenes.join(', ')}`,
      acceptance_test: `all episodes have >= ${profile.min_scenes_per_episode} estimated scenes`
    });
  }

  return fixes;
}

// ============================================================================
// BUILD COVERAGE OBJECT
// ============================================================================

function buildCoverage(
  counts: OutlineCounts,
  profile: DensityProfile
): DensityCoverage {
  const coverage: DensityCoverage = {
    characters_missing: [],
    locations_missing: [],
    threads_missing: [],
    episode_scene_plan_missing: []
  };

  if (counts.characters_total < profile.min_characters_total) {
    const deficit = profile.min_characters_total - counts.characters_total;
    coverage.characters_missing.push(`${deficit} personajes para llegar a ${profile.min_characters_total}`);
  }

  if (counts.locations < profile.min_locations) {
    const deficit = profile.min_locations - counts.locations;
    coverage.locations_missing.push(`${deficit} localizaciones para llegar a ${profile.min_locations}`);
  }

  if (counts.threads_total < profile.min_threads_total) {
    const deficit = profile.min_threads_total - counts.threads_total;
    coverage.threads_missing.push(`${deficit} tramas para llegar a ${profile.min_threads_total}`);
  }

  counts.scenes_per_episode.forEach((sceneCount, idx) => {
    if (sceneCount < profile.min_scenes_per_episode) {
      coverage.episode_scene_plan_missing.push(idx + 1);
    }
  });

  return coverage;
}

// ============================================================================
// CALCULATE DENSITY SCORE
// ============================================================================

function calculateDensityScore(
  counts: OutlineCounts,
  profile: DensityProfile
): number {
  let score = 100;
  const weights = {
    characters: 20,
    supporting: 10,
    antagonists: 15,
    locations: 15,
    threads: 20,
    secondary_threads: 10,
    scenes: 10
  };

  // Characters
  if (counts.characters_total < profile.min_characters_total) {
    const ratio = counts.characters_total / profile.min_characters_total;
    score -= weights.characters * (1 - ratio);
  }

  // Supporting
  if (counts.supporting_characters < profile.min_supporting_characters) {
    const ratio = profile.min_supporting_characters > 0 
      ? counts.supporting_characters / profile.min_supporting_characters 
      : 1;
    score -= weights.supporting * (1 - ratio);
  }

  // Antagonists
  if (counts.antagonists < profile.min_antagonists) {
    const ratio = profile.min_antagonists > 0 
      ? counts.antagonists / profile.min_antagonists 
      : 1;
    score -= weights.antagonists * (1 - ratio);
  }

  // Locations
  if (counts.locations < profile.min_locations) {
    const ratio = counts.locations / profile.min_locations;
    score -= weights.locations * (1 - ratio);
  }

  // Threads
  if (counts.threads_total < profile.min_threads_total) {
    const ratio = profile.min_threads_total > 0 
      ? counts.threads_total / profile.min_threads_total 
      : 1;
    score -= weights.threads * (1 - ratio);
  }

  // Secondary threads
  if (counts.secondary_threads < profile.min_secondary_threads) {
    const ratio = profile.min_secondary_threads > 0 
      ? counts.secondary_threads / profile.min_secondary_threads 
      : 1;
    score -= weights.secondary_threads * (1 - ratio);
  }

  // Scenes per episode
  const episodesWithLowScenes = counts.scenes_per_episode.filter(
    s => s < profile.min_scenes_per_episode
  ).length;
  if (episodesWithLowScenes > 0 && counts.episodes > 0) {
    const ratio = 1 - (episodesWithLowScenes / counts.episodes);
    score -= weights.scenes * (1 - ratio);
  }

  return Math.max(0, Math.round(score));
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export function validateDensity(
  outline: Record<string, unknown>,
  profile: DensityProfile
): DensityCheckResult {
  const counts = extractOutlineCounts(outline);
  const fixes = generateRequiredFixes(counts, profile);
  const coverage = buildCoverage(counts, profile);
  const score = calculateDensityScore(counts, profile);
  
  const status: 'PASS' | 'FAIL' = fixes.length === 0 ? 'PASS' : 'FAIL';
  
  // Build human-readable summary
  const summaryParts: string[] = [];
  if (fixes.length === 0) {
    summaryParts.push('✅ El outline cumple todos los mínimos de densidad narrativa.');
  } else {
    summaryParts.push(`❌ Faltan ${fixes.length} elemento(s) para cumplir densidad:`);
    fixes.forEach(fix => {
      summaryParts.push(`  • ${fix.title}`);
    });
  }

  // Build acceptance tests
  const acceptanceTests = [
    `characters_total >= ${profile.min_characters_total}`,
    `supporting_characters >= ${profile.min_supporting_characters}`,
    `antagonists >= ${profile.min_antagonists}`,
    `locations >= ${profile.min_locations}`,
    `threads_total >= ${profile.min_threads_total}`,
    `secondary_threads >= ${profile.min_secondary_threads}`,
    `all_episodes_scenes >= ${profile.min_scenes_per_episode}`
  ];

  return {
    status,
    density_profile: profile,
    outline_counts: counts,
    coverage,
    required_fixes: fixes,
    acceptance_tests: acceptanceTests,
    human_summary: summaryParts.join('\n'),
    score
  };
}

// ============================================================================
// GET PROFILE BY NAME OR FORMAT
// ============================================================================

export function getDensityProfile(
  formatOrName: string,
  overrides?: Partial<DensityProfile>
): DensityProfile {
  const normalizedName = formatOrName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  
  const baseProfile = DENSITY_PROFILES[normalizedName] 
    || DENSITY_PROFILES.serie_drama; // Default

  if (!overrides) return baseProfile;

  return {
    ...baseProfile,
    ...overrides
  };
}

// ============================================================================
// V14: FILM PHASE-BASED DENSITY PROFILES (GENERIC FOR ALL GENRES)
// ============================================================================

export interface PhaseDensityProfile {
  id: string;
  min_score: number;
  rules: Array<{ id: string; label: string; min: number }>;
}

// FILM SCAFFOLD PHASE - Validates architectural structure (Hollywood Standard V2)
export const FILM_SCAFFOLD_PROFILE: PhaseDensityProfile = {
  id: 'film_scaffold',
  min_score: 60,
  rules: [
    { id: 'cast', label: 'Personajes principales', min: 8 },        // Upgraded from 4
    { id: 'supporting', label: 'Personajes secundarios', min: 5 },  // NEW
    { id: 'world_rules', label: 'Reglas del mundo', min: 2 },
    { id: 'locations', label: 'Localizaciones', min: 10 },          // Upgraded from 5
    { id: 'setpieces', label: 'Setpieces', min: 4 },                // Upgraded from 3
    { id: 'acts', label: 'Actos', min: 3 },
    { id: 'beats_total', label: 'Beats totales (scaffold)', min: 25 }, // Upgraded from 15
    { id: 'midpoint', label: 'Midpoint reversal', min: 1 }
  ]
};

// FILM EXPAND ACT PHASE - Validates per-act expansion
export const FILM_EXPAND_ACT_PROFILE: PhaseDensityProfile = {
  id: 'film_expand_act',
  min_score: 70,
  rules: [
    { id: 'beats', label: 'Beats del acto', min: 6 },
    { id: 'situation_detail', label: 'Detalle de situación', min: 6 },
    { id: 'state_changes', label: 'Cambios de estado', min: 6 }
  ]
};

// FILM FINAL PHASE - Validates complete outline (Hollywood Standard V2)
export const FILM_FINAL_PROFILE: PhaseDensityProfile = {
  id: 'film_final',
  min_score: 80,
  rules: [
    { id: 'beats_total', label: 'Beats totales', min: 35 },         // Upgraded from 18
    { id: 'cast', label: 'Personajes con arco', min: 12 },          // NEW
    { id: 'locations', label: 'Localizaciones', min: 12 },          // NEW
    { id: 'setpieces', label: 'Setpieces activos', min: 5 },        // Upgraded from 3
    { id: 'character_arcs', label: 'Arcos completos', min: 3 },     // Upgraded from 1
    { id: 'lowest_point', label: 'Lowest point', min: 1 },
    { id: 'final_resolution', label: 'Resolución final', min: 1 }
  ]
};

/**
 * Get FILM density profile by phase
 */
export function getFilmDensityProfile(phase: 'SCAFFOLD' | 'EXPAND_ACT' | 'FINAL'): PhaseDensityProfile {
  switch (phase) {
    case 'SCAFFOLD': return FILM_SCAFFOLD_PROFILE;
    case 'EXPAND_ACT': return FILM_EXPAND_ACT_PROFILE;
    case 'FINAL': return FILM_FINAL_PROFILE;
  }
}

/**
 * Validate FILM outline against phase-specific density profile
 */
export function validateFilmDensity(
  data: Record<string, unknown>,
  phase: 'SCAFFOLD' | 'EXPAND_ACT' | 'FINAL'
): { passed: boolean; score: number; gaps: string[] } {
  const profile = getFilmDensityProfile(phase);
  const gaps: string[] = [];
  let score = 100;
  
  for (const rule of profile.rules) {
    let count = 0;
    
    switch (rule.id) {
      case 'cast':
        count = ((data.cast || data.characters || data.main_characters || []) as any[]).length;
        break;
      case 'supporting':
        const allChars = (data.cast || data.characters || data.main_characters || []) as any[];
        count = allChars.filter((c: any) => {
          const role = (c.role || c.character_role || '').toLowerCase();
          return role.includes('supporting') || role.includes('secondary') || role.includes('recurring');
        }).length;
        break;
      case 'world_rules':
        count = ((data.world_rules || []) as any[]).length;
        break;
      case 'locations':
        count = ((data.locations || data.main_locations || []) as any[]).length;
        break;
      case 'setpieces':
        count = ((data.setpieces || []) as any[]).length;
        break;
      case 'acts':
        count = (data.ACT_I ? 1 : 0) + (data.ACT_II ? 1 : 0) + (data.ACT_III ? 1 : 0);
        break;
      case 'beats':
      case 'beats_total':
        const actI = (data.ACT_I as any)?.beats?.length || 0;
        const actII = (data.ACT_II as any)?.beats?.length || 0;
        const actIII = (data.ACT_III as any)?.beats?.length || 0;
        const episodeBeats = ((data.episode_beats || []) as any[]).reduce((sum, ep) => 
          sum + (ep.turning_points?.length || ep.beats?.length || 0), 0);
        count = phase === 'EXPAND_ACT' 
          ? ((data.beats || []) as any[]).length 
          : Math.max(actI + actII + actIII, episodeBeats);
        break;
      case 'situation_detail':
        const beats = (data.beats || []) as any[];
        count = beats.filter((b: any) => b.situation_detail?.physical_context).length;
        break;
      case 'state_changes':
        const beatsWithState = (data.beats || []) as any[];
        count = beatsWithState.filter((b: any) => b.situation_detail?.state_change).length;
        break;
      case 'midpoint':
        count = (data.ACT_II as any)?.midpoint_reversal?.event ? 1 : 0;
        if (!count && (data as any).acts_summary?.midpoint_summary) count = 1;
        break;
      case 'character_arcs':
        const cast = (data.cast || data.characters || []) as any[];
        // Count characters with complete arcs (want + need + flaw OR arc description)
        count = cast.filter((c: any) => 
          (c.want && c.need && c.flaw) || (c.arc && c.arc.length > 20)
        ).length;
        break;
      case 'lowest_point':
        count = (data.ACT_II as any)?.all_is_lost_moment?.event ? 1 : 0;
        if (!count && (data as any).acts_summary?.all_is_lost_summary) count = 1;
        break;
      case 'final_resolution':
        count = (data.ACT_III as any)?.resolution ? 1 : 0;
        if (!count && (data as any).acts_summary?.resolution) count = 1;
        break;
    }
    
    if (count < rule.min) {
      gaps.push(`${rule.label}: ${count}/${rule.min}`);
      score -= Math.round(100 / profile.rules.length);
    }
  }
  
  return {
    passed: score >= profile.min_score,
    score: Math.max(0, score),
    gaps
  };
}

// ============================================================================
// POST-SCRIPT DENSITY VALIDATION
// ============================================================================

export interface PostScriptDensityResult {
  passed: boolean;
  gaps: string[];
  score: number;
}

export function validateScriptDensity(
  script: Record<string, unknown>,
  profile: DensityProfile
): PostScriptDensityResult {
  const gaps: string[] = [];
  let score = 100;

  const scenes = (script.scenes || []) as any[];
  const charactersIntroduced = (script.characters_introduced || []) as any[];
  const locationsIntroduced = (script.locations_introduced || []) as any[];

  // Count unique characters across all scenes
  const uniqueChars = new Set<string>();
  for (const scene of scenes) {
    const charsPresent = (scene.characters_present || []) as any[];
    for (const char of charsPresent) {
      const name = (char.name || char).toString().toLowerCase();
      if (name && name !== 'unknown') {
        uniqueChars.add(name);
      }
    }
  }

  // Count unique locations
  const uniqueLocs = new Set<string>();
  for (const scene of scenes) {
    const loc = (scene.standardized_location || scene.slugline || '').toLowerCase();
    if (loc) {
      uniqueLocs.add(loc.split('-')[0].trim()); // Normalize
    }
  }

  // Validate minimums
  if (uniqueChars.size < profile.min_characters_total) {
    gaps.push(`PERSONAJES: ${uniqueChars.size}/${profile.min_characters_total}`);
    score -= 20;
  }

  if (uniqueLocs.size < profile.min_locations) {
    gaps.push(`LOCALIZACIONES: ${uniqueLocs.size}/${profile.min_locations}`);
    score -= 15;
  }

  if (scenes.length < profile.min_scenes_per_episode) {
    gaps.push(`ESCENAS: ${scenes.length}/${profile.min_scenes_per_episode}`);
    score -= 25;
  }

  // Check for scene quality (each should have conflict)
  const scenesWithConflict = scenes.filter(s => 
    s.conflict && s.conflict !== 'Por definir' && s.conflict.length > 10
  ).length;
  
  if (scenesWithConflict < scenes.length * 0.8) {
    gaps.push(`CONFLICTOS: ${scenesWithConflict}/${scenes.length} escenas tienen conflicto definido`);
    score -= 10;
  }

  return {
    passed: gaps.length === 0,
    gaps,
    score: Math.max(0, score)
  };
}
