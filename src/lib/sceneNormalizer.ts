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
 * Get the slugline from a scene object, checking multiple possible field names.
 * Note: Some sources include `slugline: ""` even when `heading` exists.
 * We treat empty strings as missing and fall back.
 */
export function getSceneSlugline(scene: any): string {
  const candidates = [
    scene?.slugline,
    scene?.heading,
    scene?.location_raw,
    scene?.locationRaw,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return "";
}

/**
 * Check if a slugline is valid (starts with INT./EXT. etc.)
 */
export function isValidSlugline(slugline: string): boolean {
  const s = String(slugline ?? "").trim();
  if (!s) return false;
  return /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i.test(s);
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
 * Normalize a single scene object (handles string inputs from JSON serialization)
 */
export function normalizeScene(scene: any): any {
  if (!scene) return null;
  
  // Handle stringified JSON
  let parsed = scene;
  if (typeof scene === "string") {
    try {
      parsed = JSON.parse(scene);
    } catch {
      return null;
    }
  }
  
  const slugline = getSceneSlugline(parsed);
  
  return {
    ...parsed,
    // Ensure slugline is always present
    slugline,
    // Keep heading as alias for compatibility
    heading: parsed?.heading ?? slugline,
    // Normalize time
    time_of_day: normalizeTimeOfDay(parsed?.time ?? parsed?.time_of_day),
    time: normalizeTimeOfDay(parsed?.time ?? parsed?.time_of_day),
    // Clean characters
    characters_present: cleanCharacters(parsed?.characters_present),
    // Ensure scene number
    scene_number: parsed?.scene_number ?? parsed?.number ?? 0,
    number: parsed?.number ?? parsed?.scene_number ?? 0,
    // Location info
    location: parsed?.location ?? parsed?.location_base ?? "",
    int_ext: parsed?.int_ext ?? (slugline.startsWith("INT") ? "INT" : slugline.startsWith("EXT") ? "EXT" : ""),
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

/**
 * Extract content for a specific scene from raw script text
 * Returns dialogues, actions, and character presence
 */
export function extractSceneContent(rawText: string, sceneNumber: number, slugline: string): {
  dialogues: Array<{ character: string; text: string }>;
  actions: string[];
  mood: string;
  summary: string;
} {
  if (!rawText) {
    return { dialogues: [], actions: [], mood: '', summary: '' };
  }

  // Find scene boundaries using sluglines or scene markers
  const lines = rawText.split('\n');
  const sceneStartPatterns = [
    new RegExp(`^\\s*(ESCENA\\s*${sceneNumber}|SCENE\\s*${sceneNumber})\\b`, 'i'),
    new RegExp(`^\\s*${sceneNumber}[.\\-)]\\s*`, 'i'),
    slugline ? new RegExp(slugline.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').substring(0, 30), 'i') : null,
    /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i,
  ].filter(Boolean) as RegExp[];

  let sceneStartIdx = -1;
  let sceneEndIdx = lines.length;
  let currentSceneCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if this line starts a new scene
    const isSceneStart = sceneStartPatterns.some(p => p.test(line));
    if (isSceneStart) {
      currentSceneCounter++;
      if (currentSceneCounter === sceneNumber) {
        sceneStartIdx = i;
      } else if (sceneStartIdx !== -1 && currentSceneCounter > sceneNumber) {
        sceneEndIdx = i;
        break;
      }
    }
  }

  if (sceneStartIdx === -1) {
    return { dialogues: [], actions: [], mood: '', summary: '' };
  }

  const sceneLines = lines.slice(sceneStartIdx, sceneEndIdx);
  const dialogues: Array<{ character: string; text: string }> = [];
  const actions: string[] = [];

  // Parse dialogues and actions
  const characterPattern = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.'-]{1,25})$/;
  let currentCharacter = '';
  let collectingDialogue = false;
  let dialogueBuffer: string[] = [];

  for (let i = 0; i < sceneLines.length; i++) {
    const line = sceneLines[i].trim();
    if (!line) {
      if (collectingDialogue && dialogueBuffer.length > 0) {
        dialogues.push({ character: currentCharacter, text: dialogueBuffer.join(' ') });
        dialogueBuffer = [];
        collectingDialogue = false;
      }
      continue;
    }

    // Skip sluglines and scene headers
    if (/^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|ESCENA|SCENE)/i.test(line)) continue;

    // Detect character name (all caps on its own line)
    if (characterPattern.test(line) && !line.includes(':')) {
      if (collectingDialogue && dialogueBuffer.length > 0) {
        dialogues.push({ character: currentCharacter, text: dialogueBuffer.join(' ') });
        dialogueBuffer = [];
      }
      currentCharacter = line.trim();
      collectingDialogue = true;
      continue;
    }

    // If we're collecting dialogue, add the line
    if (collectingDialogue) {
      // Parentheticals are not dialogue
      if (line.startsWith('(') && line.endsWith(')')) continue;
      dialogueBuffer.push(line);
    } else {
      // Action/description line
      if (line.length > 10 && !line.match(/^[A-ZÁÉÍÓÚÑ\s.'-]+$/)) {
        actions.push(line);
      }
    }
  }

  // Flush remaining dialogue
  if (collectingDialogue && dialogueBuffer.length > 0) {
    dialogues.push({ character: currentCharacter, text: dialogueBuffer.join(' ') });
  }

  // Infer mood from keywords
  const textLower = sceneLines.join(' ').toLowerCase();
  let mood = 'neutral';
  if (textLower.includes('tenso') || textLower.includes('ansiedad') || textLower.includes('nervioso')) {
    mood = 'tense';
  } else if (textLower.includes('feliz') || textLower.includes('alegr') || textLower.includes('risa')) {
    mood = 'joyful';
  } else if (textLower.includes('triste') || textLower.includes('llora') || textLower.includes('melanc')) {
    mood = 'melancholic';
  } else if (textLower.includes('románt') || textLower.includes('amor') || textLower.includes('íntim')) {
    mood = 'romantic';
  } else if (textLower.includes('miedo') || textLower.includes('terror') || textLower.includes('horror')) {
    mood = 'fearful';
  }

  // Build summary from first actions
  const summary = actions.slice(0, 2).join(' ').substring(0, 200);

  return { dialogues, actions, mood, summary };
}

/**
 * Suggest shot count based on scene content
 */
export function suggestShotCount(content: { dialogues: Array<{ character: string; text: string }>; actions: string[] }): number {
  const dialogueCount = content.dialogues.length;
  const actionDensity = content.actions.length;
  
  // Base: 1 establishing + 1 per major beat
  let shots = 1;
  
  // Add shots for dialogue exchanges (roughly 1 shot per 2 dialogue lines)
  shots += Math.ceil(dialogueCount / 2);
  
  // Add shots for action beats (roughly 1 shot per 3 action lines)
  shots += Math.ceil(actionDensity / 3);
  
  // Minimum 2, maximum 8 shots per scene for standard pacing
  return Math.max(2, Math.min(8, shots));
}
