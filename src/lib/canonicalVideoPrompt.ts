/**
 * Canonical Video Prompt Builder
 * Generates anti-hallucination prompts for microshot video generation
 * 
 * RULE: Never describe characters physically (they're in keyframes)
 * RULE: Never describe scenery/props (they're in keyframes)
 * ONLY: Camera movement + minimal physical action
 */

export interface CharacterLock {
  name: string;
  appearance: string;
  wardrobe: string;
}

export interface SceneLock {
  location: string;
  props: string[];
  lighting: string;
}

export interface CameraLock {
  shot_type: string;
  focal_mm: number;
  movement: string;
  framing: string;
  height: string;
  screen_direction?: string;
}

export interface StyleLock {
  name: string;
  description?: string;
}

export interface CanonicalPromptInput {
  styleLock: StyleLock;
  characters: CharacterLock[];
  sceneLock: SceneLock;
  cameraLock: CameraLock;
  action: string;
  durationSec: number;
  lightingNotes?: string;
  focusNotes?: string;
}

/**
 * Build a canonical anti-hallucination prompt for video generation
 * Following the studio's STYLE LOCK / CHARACTER LOCK / SCENE LOCK pattern
 */
export function buildCanonicalPrompt(input: CanonicalPromptInput): string {
  const lines: string[] = [];

  // STYLE LOCK
  lines.push(`STYLE LOCK: ${input.styleLock.name} (mantener estilo constante)`);
  if (input.styleLock.description) {
    lines.push(`Style: ${input.styleLock.description}`);
  }
  lines.push('');

  // CHARACTER LOCK
  if (input.characters.length > 0) {
    lines.push('CHARACTER LOCK:');
    input.characters.forEach(char => {
      lines.push(`  - ${char.name}: ${char.appearance}, wearing ${char.wardrobe}`);
    });
    lines.push('');
  }

  // SCENE LOCK
  lines.push(`SCENE LOCK: ${input.sceneLock.location}`);
  if (input.sceneLock.props.length > 0) {
    lines.push(`Props: ${input.sceneLock.props.join(', ')}`);
  }
  lines.push('');

  // CAMERA LOCK
  const cam = input.cameraLock;
  lines.push(`CAMERA LOCK: ${cam.shot_type}, lens ${cam.focal_mm}mm, movement ${cam.movement}, framing ${cam.framing}, camera height ${cam.height}`);
  if (cam.screen_direction) {
    lines.push(`Screen direction: ${cam.screen_direction}`);
  }
  lines.push('');

  // LIGHT/FOCUS
  lines.push(`LIGHT/FOCUS: ${input.sceneLock.lighting}`);
  if (input.lightingNotes) {
    lines.push(`Lighting notes: ${input.lightingNotes}`);
  }
  if (input.focusNotes) {
    lines.push(`Focus: ${input.focusNotes}`);
  }
  lines.push('');

  // ACTION (solo 1 micro-cambio)
  lines.push(`ACTION: ${input.action}`);
  lines.push('');

  // CONTINUITY ENFORCEMENT
  lines.push('CONTINUITY: same identities, same clothes, same props, same background, same lighting, no new objects, no camera jump');
  lines.push('');

  // GROUND TRUTH
  lines.push('Use the provided start and end images as ground truth.');
  lines.push(`Duration: ${input.durationSec} seconds`);

  return lines.join('\n');
}

/**
 * Standard negative prompt for all video generations
 * Prevents common AI artifacts and drift
 */
export const CANONICAL_NEGATIVE_PROMPT = 
  'no face drift, no wardrobe change, no prop change, no new characters, ' +
  'no text, no logos, no extra limbs, no lighting change, no scene change, ' +
  'no camera angle change, no style drift, no morphing, no blur artifacts';

/**
 * Build a minimal motion-focused prompt for microshot chaining
 * Used when full canonical context is not available
 */
export function buildMinimalMotionPrompt(
  motionNotes: string,
  cameraMovement: string,
  durationSec: number
): string {
  const lines: string[] = [
    'Use the provided start and end images as ground truth.',
    'Create only subtle natural motion connecting them.',
    'No scene changes. No style changes.',
    'Keep identity, wardrobe, props, lighting and storyboard style unchanged.',
    'No new objects. No new characters. No text overlays.',
    '',
    `Movement: ${motionNotes || 'subtle natural movement'}`,
    `Camera: ${cameraMovement || 'maintain framing'}`,
    `Duration: ${durationSec} seconds`,
    '',
    'CONTINUITY: Match start/end keyframes exactly. No drift in character appearance, wardrobe, or props.',
    '',
    'Use start and end images as ground truth.'
  ];

  return lines.join('\n');
}

/**
 * Sanitize prompt to remove words that could cause style drift
 * Especially important for animated projects
 */
export function sanitizePromptForStyle(
  prompt: string,
  styleType: 'animated' | 'live_action' | 'mixed' = 'animated'
): string {
  // Words that can cause drift to photorealism in animated projects
  const BANNED_ANIMATED_WORDS = [
    'photorealistic', 'photo-realistic', 'hyperrealistic',
    'DSLR', 'film grain', 'pores', 'skin texture',
    'real person', 'real human', 'photograph',
    '35mm film', 'cinematic photography', 'RAW photo'
  ];

  // Words that can cause drift to animation in live-action projects
  const BANNED_LIVE_ACTION_WORDS = [
    'cartoon', 'animated', 'anime style', 'pixar style',
    'disney style', '3D render', 'CGI', 'illustration'
  ];

  let sanitized = prompt;
  const bannedWords = styleType === 'animated' 
    ? BANNED_ANIMATED_WORDS 
    : styleType === 'live_action'
      ? BANNED_LIVE_ACTION_WORDS
      : [];

  bannedWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    sanitized = sanitized.replace(regex, '');
  });

  // Clean up multiple spaces
  return sanitized.replace(/\s+/g, ' ').trim();
}
