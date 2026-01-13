// =============================================================================
// CINEMATOGRAPHIC DEFAULTS - INDUSTRY STANDARD
// =============================================================================
// Source of truth for technical specs by shot type.
// Used by generate-technical-doc to auto-fill specs from camera plan.
// =============================================================================

/**
 * Default cinematographic parameters by shot type
 * All values are for S35 sensor (use FF equiv multiplier 1.5x for reference)
 */
export const SHOT_TYPE_DEFAULTS: Record<string, {
  focal_mm: [number, number]; // [min, max] range
  aperture: number;
  duration_s: [number, number]; // [min, max] target duration
  movement: string;
  focus: string;
  notes: string;
}> = {
  // Wide shots - establish geography
  'PG': { 
    focal_mm: [24, 32], 
    aperture: 4.0, 
    duration_s: [6, 10], 
    movement: 'dolly_slow', 
    focus: 'static', 
    notes: 'Establecer geografía y dirección. Horizonte limpio.' 
  },
  'WIDE': { 
    focal_mm: [24, 32], 
    aperture: 4.0, 
    duration_s: [5, 10], 
    movement: 'dolly_slow', 
    focus: 'static', 
    notes: 'Establishing shot. Deep focus.' 
  },
  'WIDE_MASTER': { 
    focal_mm: [24, 35], 
    aperture: 5.6, 
    duration_s: [6, 12], 
    movement: 'static', 
    focus: 'deep', 
    notes: 'Master shot for safety coverage.' 
  },
  
  // Medium shots - conversational
  'PM': { 
    focal_mm: [35, 50], 
    aperture: 2.8, 
    duration_s: [5, 8], 
    movement: 'handheld_subtle', 
    focus: 'follow', 
    notes: 'Mantener eje 180°. Cabeza con aire.' 
  },
  'MEDIUM': { 
    focal_mm: [35, 50], 
    aperture: 2.8, 
    duration_s: [4, 7], 
    movement: 'static', 
    focus: 'follow', 
    notes: 'Standard coverage framing.' 
  },
  
  // Medium close - action detail
  'PMC': { 
    focal_mm: [50, 50], 
    aperture: 2.0, 
    duration_s: [4, 7], 
    movement: 'handheld_subtle', 
    focus: 'follow_rack', 
    notes: 'Ideal para acción pequeña (manos, props).' 
  },
  
  // Close-ups - emotion
  'PP': { 
    focal_mm: [65, 85], 
    aperture: 2.0, 
    duration_s: [3, 6], 
    movement: 'static', 
    focus: 'follow_eyes', 
    notes: 'Ojos nítidos. Fondo suave.' 
  },
  'CLOSE': { 
    focal_mm: [85, 85], 
    aperture: 2.0, 
    duration_s: [3, 5], 
    movement: 'static', 
    focus: 'static', 
    notes: 'Eyes sharp. Shallow depth.' 
  },
  
  // Extreme close-up - detail
  'PPP': { 
    focal_mm: [85, 100], 
    aperture: 2.0, 
    duration_s: [2, 4], 
    movement: 'static', 
    focus: 'static_micro', 
    notes: 'Para detalles (objeto, lágrima, mano).' 
  },
  
  // Over the shoulder - dialogue
  'OTS': { 
    focal_mm: [50, 65], 
    aperture: 2.8, 
    duration_s: [4, 7], 
    movement: 'static', 
    focus: 'follow_speaker', 
    notes: 'Hombro en primer término difuso, sin tapar ojos.' 
  },
  
  // Two-shot - conversation dynamics
  '2SHOT': { 
    focal_mm: [35, 50], 
    aperture: 2.8, 
    duration_s: [5, 9], 
    movement: 'handheld_subtle', 
    focus: 'follow_dominant', 
    notes: 'Perfecto para conversación + dinámica.' 
  },
  
  // Special angles
  'TOP_DOWN': { 
    focal_mm: [24, 35], 
    aperture: 4.0, 
    duration_s: [5, 9], 
    movement: 'static', 
    focus: 'static', 
    notes: 'Útil para mapas, mesas, blocking claro.' 
  },
  'LOW_ANGLE': { 
    focal_mm: [24, 35], 
    aperture: 4.0, 
    duration_s: [5, 9], 
    movement: 'tracking', 
    focus: 'static', 
    notes: 'Héroe, niño pequeño, acción.' 
  },
  'HIGH_ANGLE': { 
    focal_mm: [24, 35], 
    aperture: 4.0, 
    duration_s: [5, 9], 
    movement: 'static', 
    focus: 'static', 
    notes: 'Vulnerabilidad o visión de conjunto.' 
  },
  
  // Insert and POV
  'INSERT': { 
    focal_mm: [100, 100], 
    aperture: 4.0, 
    duration_s: [2, 4], 
    movement: 'static', 
    focus: 'macro', 
    notes: 'Detail shot of object/prop.' 
  },
  'POV': { 
    focal_mm: [35, 35], 
    aperture: 4.0, 
    duration_s: [3, 6], 
    movement: 'handheld', 
    focus: 'follow', 
    notes: 'Vista subjetiva. Handheld movement.' 
  },
};

/**
 * Context-specific overrides for specific scene types
 * These override base defaults when context matches
 */
export const CONTEXT_OVERRIDES: Record<string, {
  movement_override?: string;
  aperture_override?: number;
  focal_bias?: 'wide' | 'tight';
  lighting_default?: string;
  focus_bias?: string;
}> = {
  'vehicle_interior': {
    movement_override: 'static',
    aperture_override: 2.8,
    focal_bias: 'tight',
    lighting_default: 'daylight_soft_fill_low',
    focus_bias: 'follow_speaker',
  },
  'exterior_road': {
    movement_override: 'tracking',
    aperture_override: 4.0,
    focal_bias: 'wide',
    lighting_default: 'natural_direction_clear',
  },
  'interior_room': {
    movement_override: 'dolly_slow',
    aperture_override: 2.8,
    lighting_default: 'practical_motivated',
  },
  'dialogue_scene': {
    movement_override: 'static',
    focus_bias: 'rack_on_speaker_change',
  },
  'action_sequence': {
    movement_override: 'handheld',
    aperture_override: 4.0,
    focus_bias: 'follow_dynamic',
  },
};

/**
 * Automatic focus rules based on shot context
 * These are deterministic rules that reduce LLM invention
 */
export const FOCUS_RULES: Record<string, {
  mode: string;
  priority?: string[];
  type?: string;
  rack_required?: boolean;
  rack_points?: string[];
}> = {
  // Dialogue close-ups: follow speaker, rack to listener on cut
  'dialogue_with_pp_pmc_ots': {
    mode: 'follow',
    priority: ['speaker', 'listener_reaction'],
    rack_required: false,
  },
  
  // Props in action: mandatory rack from speaker to prop
  'prop_action': {
    mode: 'rack',
    rack_required: true,
    rack_points: ['speaker', 'prop'],
  },
  
  // Wide shots: static hyperfocal or subject center
  'pg_wide': {
    mode: 'static',
    type: 'hyperfocal',
    priority: ['central_subject'],
  },
  
  // Two-shot: follow dominant speaker
  'two_shot_dialogue': {
    mode: 'follow',
    priority: ['dominant_speaker', 'reactor'],
  },
  
  // Insert: macro on prop
  'insert_detail': {
    mode: 'macro',
    priority: ['prop_surface', 'prop_detail'],
  },
};

/**
 * Get cinematographic defaults for a shot type
 * Falls back to PM (medium shot) if type not found
 */
export function getDefaults(shotType: string): typeof SHOT_TYPE_DEFAULTS[string] {
  const normalized = shotType.toUpperCase().replace(/\s+/g, '_');
  return SHOT_TYPE_DEFAULTS[normalized] || SHOT_TYPE_DEFAULTS['PM'];
}

/**
 * Apply context overrides to base defaults
 */
export function applyContextOverrides(
  baseDefaults: typeof SHOT_TYPE_DEFAULTS[string],
  context: string
): typeof SHOT_TYPE_DEFAULTS[string] & { lighting_default?: string } {
  const override = CONTEXT_OVERRIDES[context];
  if (!override) return baseDefaults;
  
  return {
    ...baseDefaults,
    movement: override.movement_override || baseDefaults.movement,
    aperture: override.aperture_override || baseDefaults.aperture,
    lighting_default: override.lighting_default,
  };
}

/**
 * Determine focus rule based on shot context
 */
export function determineFocusRule(
  shotType: string,
  hasDialogue: boolean,
  hasPropAction: boolean,
): typeof FOCUS_RULES[string] | null {
  const normalized = shotType.toUpperCase();
  
  // Props in action take priority
  if (hasPropAction) {
    return FOCUS_RULES['prop_action'];
  }
  
  // Dialogue close-ups
  if (hasDialogue && ['PP', 'PMC', 'OTS', 'CLOSE'].includes(normalized)) {
    return FOCUS_RULES['dialogue_with_pp_pmc_ots'];
  }
  
  // Two-shot dialogue
  if (hasDialogue && ['2SHOT'].includes(normalized)) {
    return FOCUS_RULES['two_shot_dialogue'];
  }
  
  // Wide shots
  if (['PG', 'WIDE', 'WIDE_MASTER'].includes(normalized)) {
    return FOCUS_RULES['pg_wide'];
  }
  
  // Insert detail
  if (['INSERT', 'PPP'].includes(normalized)) {
    return FOCUS_RULES['insert_detail'];
  }
  
  return null;
}

/**
 * Storyboard styles supported by the pipeline
 */
export type StoryboardStyle = 'GRID_SHEET_V1' | 'TECH_PAGE_V1';

export const STORYBOARD_STYLES: Record<StoryboardStyle, {
  id: StoryboardStyle;
  name: string;
  description: string;
  panel_count_range: [number, number];
  generates_blocking: boolean;
}> = {
  'GRID_SHEET_V1': {
    id: 'GRID_SHEET_V1',
    name: 'Lámina Multipanel',
    description: 'Storyboard visual tipo lámina de producción (6-9 paneles)',
    panel_count_range: [6, 9],
    generates_blocking: false,
  },
  'TECH_PAGE_V1': {
    id: 'TECH_PAGE_V1',
    name: 'Página Técnica',
    description: 'Storyboard técnico con lista de planos + diagrama blocking',
    panel_count_range: [4, 6],
    generates_blocking: true,
  },
};
