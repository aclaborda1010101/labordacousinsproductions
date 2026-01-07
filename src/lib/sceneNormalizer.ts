/**
 * Scene Normalizer - Utility for normalizing scene data from various sources
 * Handles field name inconsistencies (slugline vs heading) and cleans up data
 */

// Allowed time-of-day values for validation
const ALLOWED_TIMES = new Set([
  "DAY", "NIGHT", "MORNING", "AFTERNOON", "EVENING", 
  "LATE NIGHT", "CONTINUOUS", "DUSK", "DAWN", "LATER", "MOMENTS LATER"
]);

/**
 * Get the slugline from a scene object, checking multiple possible field names
 */
export function getSceneSlugline(scene: any): string {
  return (
    scene?.slugline ??
    scene?.heading ??
    scene?.location_raw ??
    ""
  ).trim();
}

/**
 * Check if a slugline is valid (starts with INT. or EXT.)
 */
export function isValidSlugline(slugline: string): boolean {
  return /^(INT\.|EXT\.)/i.test(slugline);
}

/**
 * Clean character names - removes numeric tokens and invalid entries
 */
function cleanCharacters(chars: any[]): string[] {
  return (chars ?? [])
    .map((c) => String(c).trim())
    .filter((c) => c && !/^\d+$/.test(c) && c.length > 1); // Remove "1", "2", single chars
}

/**
 * Normalize time of day value
 */
function normalizeTimeOfDay(time: any): string {
  const normalized = String(time ?? "").toUpperCase().trim();
  return ALLOWED_TIMES.has(normalized) ? normalized : "DAY";
}

/**
 * Normalize a single scene object
 */
export function normalizeScene(scene: any): any {
  if (!scene) return null;
  
  const slugline = getSceneSlugline(scene);
  
  return {
    ...scene,
    // Ensure slugline is always present
    slugline,
    // Keep heading as alias for compatibility
    heading: scene?.heading ?? slugline,
    // Normalize time
    time_of_day: normalizeTimeOfDay(scene?.time ?? scene?.time_of_day),
    time: normalizeTimeOfDay(scene?.time ?? scene?.time_of_day),
    // Clean characters
    characters_present: cleanCharacters(scene?.characters_present),
    // Ensure scene number
    scene_number: scene?.scene_number ?? scene?.number ?? 0,
    number: scene?.number ?? scene?.scene_number ?? 0,
    // Location info
    location: scene?.location ?? scene?.location_base ?? "",
    int_ext: scene?.int_ext ?? (slugline.startsWith("INT") ? "INT" : slugline.startsWith("EXT") ? "EXT" : ""),
  };
}

/**
 * Normalize an array of scenes
 */
export function normalizeScenes(rawScenes: any[]): any[] {
  return (rawScenes ?? [])
    .map(normalizeScene)
    .filter(Boolean);
}

/**
 * Count valid sluglines in a scene array
 */
export function countValidSluglines(scenes: any[]): { valid: number; total: number; ratio: number } {
  const total = scenes?.length ?? 0;
  const valid = (scenes ?? []).filter(s => isValidSlugline(getSceneSlugline(s))).length;
  return {
    valid,
    total,
    ratio: total > 0 ? valid / total : 0
  };
}

/**
 * Get breakdown reliability indicator
 */
export function getBreakdownReliability(scenes: any[]): 'reliable' | 'estimated' {
  const { ratio } = countValidSluglines(scenes);
  return ratio >= 0.8 ? 'reliable' : 'estimated';
}
