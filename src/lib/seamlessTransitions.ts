/**
 * Seamless Transitions Workflow
 * 
 * Based on Runway's proven workflow for creating uncut continuous tracking shots
 * where a person walks between scenes with natural object transitions.
 * 
 * Key principles:
 * 1. Person reference stays constant (identity lock via img_3)
 * 2. Camera moves to new location within same environment
 * 3. Object handoff: put down current → pick up new (off-screen)
 * 4. Uncut, continuous, seamless motion
 * 5. ~7 second clips trimmed for perfect transitions
 */

export interface SeamlessScene {
  id: string;
  environment: string;
  object: string;
  objectReferenceUrl?: string;
  poseHint?: string;
  generatedImageUrl?: string;
  videoUrl?: string;
  trimStart?: number;
  trimEnd?: number;
}

export interface SeamlessTransitionWorkflow {
  id: string;
  name: string;
  personReferenceUrl: string;
  baseEnvironment: string;
  scenes: SeamlessScene[];
  stitchedVideoUrl?: string;
  status: 'draft' | 'generating' | 'complete' | 'error';
}

// ============================================================
// SYSTEM PROMPTS - Core of the Seamless Transition Magic
// ============================================================

export const INITIAL_SCENE_SYSTEM_PROMPT = `You'll be given an environment or location along with an object or item or animal of some sort. These things will be provided via the text input. You'll be creating a prompt for an image generator that will be provided with a reference image of a person.

Ensure that the person is shown in the provided environment/location posing with the object/item/animal.

Output only that prompt.

CRITICAL RULES:
- Start your prompt with "Move the camera to a new location, with a different background, in the same environment"
- Make sure the person is in a new pose
- The person must be holding or interacting with the object/item/animal
- End the prompt with "the image provided as img_3 is a reference of the same exact person"
- Output ONLY the prompt, nothing else`;

export const TRANSITION_SCENE_SYSTEM_PROMPT = `You'll be given a new object/item/animal to replace the previous one.

CRITICAL RULES:
- Make sure you replace the object/item/animal in the image with the newly provided object/item/animal
- Make sure the person is holding the new object/item/animal
- The person should be in a DIFFERENT pose than before
- End the prompt with "the image provided as img_3 is a reference of the same exact person"

Output only that prompt.`;

export const VIDEO_TRANSITION_PROMPT = `An uncut continuous tracking shot of the person walking from one scene to the next with flawless natural motion. Ensure they set the object they're holding down off-screen first, before picking up the new object. Uncut. Continuous. Seamless.`;

// ============================================================
// PROMPT GENERATORS
// ============================================================

export function generateInitialScenePrompt(
  environment: string,
  object: string,
  poseHint?: string
): string {
  const poseInstruction = poseHint 
    ? `, ${poseHint}` 
    : ', in a natural confident pose';
  
  return `Move the camera to a new location, with a different background, in the same environment. The person is in ${environment}${poseInstruction}, holding ${object}. Cinematic lighting, professional photography. The image provided as img_3 is a reference of the same exact person.`;
}

export function generateTransitionScenePrompt(
  previousObject: string,
  newObject: string,
  environment: string,
  poseHint?: string
): string {
  const poseInstruction = poseHint 
    ? `, now ${poseHint}` 
    : ', now in a different confident pose';
  
  return `Move the camera to a new location, with a different background, in the same environment. Replace ${previousObject} with ${newObject}. The person is now holding ${newObject}${poseInstruction}. Maintain the ${environment} aesthetic. Cinematic lighting. The image provided as img_3 is a reference of the same exact person.`;
}

export function generateVideoTransitionPrompt(
  currentObject: string,
  nextObject: string,
  movementHint?: string
): string {
  const movement = movementHint || 'walking naturally';
  
  return `An uncut continuous tracking shot of the person ${movement} from one scene to the next with flawless natural motion. Ensure they set the ${currentObject} they're holding down off-screen first, before picking up the ${nextObject}. Uncut. Continuous. Seamless.`;
}

// ============================================================
// WORKFLOW PRESETS
// ============================================================

export interface SeamlessPreset {
  id: string;
  name: string;
  description: string;
  baseEnvironment: string;
  suggestedObjects: string[];
  poseProgression: string[];
  movementStyle: string;
  targetDuration: number; // seconds per clip
}

export const SEAMLESS_PRESETS: Record<string, SeamlessPreset> = {
  product_showcase: {
    id: 'product_showcase',
    name: 'Product Showcase',
    description: 'Person walks through space presenting different products',
    baseEnvironment: 'a modern minimalist showroom with soft directional lighting',
    suggestedObjects: ['luxury handbag', 'designer watch', 'premium headphones', 'perfume bottle', 'sunglasses'],
    poseProgression: [
      'holding the item at chest level, examining it',
      'presenting the item to camera with a confident smile',
      'placing the item elegantly on a surface',
      'walking while casually holding the item',
      'posing with the item against a feature wall'
    ],
    movementStyle: 'walking elegantly',
    targetDuration: 7
  },
  
  tech_office_tour: {
    id: 'tech_office_tour',
    name: 'Tech Office Tour',
    description: 'Person navigates modern office with different tech items',
    baseEnvironment: 'a modern tech office in NYC with floor-to-ceiling windows',
    suggestedObjects: ['laptop', 'smartphone', 'tablet', 'wireless earbuds', 'smart watch', 'coffee cup'],
    poseProgression: [
      'working at a standing desk',
      'sitting in a lounge area',
      'walking through an open corridor',
      'at a collaborative meeting space',
      'near a window with city view'
    ],
    movementStyle: 'walking purposefully',
    targetDuration: 7
  },
  
  fashion_editorial: {
    id: 'fashion_editorial',
    name: 'Fashion Editorial',
    description: 'High-fashion transitions between accessories and poses',
    baseEnvironment: 'an avant-garde fashion studio with dramatic lighting',
    suggestedObjects: ['designer scarf', 'statement jewelry', 'clutch bag', 'oversized sunglasses', 'silk gloves'],
    poseProgression: [
      'striking a powerful pose',
      'in mid-motion, fabric flowing',
      'a contemplative side profile',
      'dynamic walking pose',
      'elegant seated position'
    ],
    movementStyle: 'gliding gracefully',
    targetDuration: 7
  },
  
  lifestyle_content: {
    id: 'lifestyle_content',
    name: 'Lifestyle Content',
    description: 'Casual day-in-the-life with everyday objects',
    baseEnvironment: 'a cozy modern apartment with natural light',
    suggestedObjects: ['coffee mug', 'book', 'plant', 'candle', 'throw blanket', 'breakfast bowl'],
    poseProgression: [
      'relaxing on the couch',
      'standing by the window',
      'in the kitchen area',
      'at a reading nook',
      'on a balcony or terrace'
    ],
    movementStyle: 'moving casually',
    targetDuration: 7
  },
  
  music_video: {
    id: 'music_video',
    name: 'Music Video Style',
    description: 'Dynamic transitions with performance energy',
    baseEnvironment: 'a neon-lit urban setting with atmospheric fog',
    suggestedObjects: ['microphone', 'guitar', 'vinyl record', 'vintage camera', 'boombox'],
    poseProgression: [
      'performing with energy',
      'in a dramatic silhouette',
      'interacting with the environment',
      'in a stylized dance move',
      'a powerful stance facing camera'
    ],
    movementStyle: 'moving with rhythm and energy',
    targetDuration: 7
  },
  
  nature_journey: {
    id: 'nature_journey',
    name: 'Nature Journey',
    description: 'Exploring natural environments with outdoor gear',
    baseEnvironment: 'a serene forest clearing with dappled sunlight',
    suggestedObjects: ['hiking backpack', 'binoculars', 'water bottle', 'field guide book', 'camera'],
    poseProgression: [
      'looking out at the vista',
      'crouching to examine something',
      'walking along a trail',
      'resting against a tree',
      'reaching toward the light'
    ],
    movementStyle: 'walking through nature',
    targetDuration: 7
  }
};

// ============================================================
// WORKFLOW GENERATOR
// ============================================================

export function generateSeamlessWorkflow(
  presetId: string,
  personReferenceUrl: string,
  customObjects?: string[],
  sceneCount: number = 5
): SeamlessTransitionWorkflow {
  const preset = SEAMLESS_PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetId}`);
  }
  
  const objects = customObjects && customObjects.length > 0 
    ? customObjects 
    : preset.suggestedObjects.slice(0, sceneCount);
  
  const scenes: SeamlessScene[] = objects.map((object, index) => ({
    id: `scene_${index + 1}`,
    environment: preset.baseEnvironment,
    object,
    poseHint: preset.poseProgression[index % preset.poseProgression.length],
    trimStart: 0,
    trimEnd: preset.targetDuration
  }));
  
  return {
    id: crypto.randomUUID(),
    name: `${preset.name} - ${new Date().toLocaleDateString()}`,
    personReferenceUrl,
    baseEnvironment: preset.baseEnvironment,
    scenes,
    status: 'draft'
  };
}

// ============================================================
// PROMPT CHAIN GENERATOR
// ============================================================

export interface GeneratedPromptChain {
  sceneId: string;
  imagePrompt: string;
  videoPrompt: string | null; // null for last scene (no transition after)
}

export function generatePromptChain(workflow: SeamlessTransitionWorkflow): GeneratedPromptChain[] {
  const { scenes, baseEnvironment } = workflow;
  
  return scenes.map((scene, index) => {
    const isFirst = index === 0;
    const isLast = index === scenes.length - 1;
    const previousScene = isFirst ? null : scenes[index - 1];
    const nextScene = isLast ? null : scenes[index + 1];
    
    // Generate image prompt
    const imagePrompt = isFirst
      ? generateInitialScenePrompt(baseEnvironment, scene.object, scene.poseHint)
      : generateTransitionScenePrompt(
          previousScene!.object,
          scene.object,
          baseEnvironment,
          scene.poseHint
        );
    
    // Generate video transition prompt (null for last scene)
    const videoPrompt = nextScene
      ? generateVideoTransitionPrompt(scene.object, nextScene.object)
      : null;
    
    return {
      sceneId: scene.id,
      imagePrompt,
      videoPrompt
    };
  });
}

// ============================================================
// AI-POWERED SCENE GENERATOR
// ============================================================

export interface AISceneGeneratorInput {
  environment: string;
  objects: string[];
  personDescription?: string;
  style?: 'cinematic' | 'editorial' | 'casual' | 'dramatic';
}

export function buildAISceneGeneratorPrompt(input: AISceneGeneratorInput): string {
  const { environment, objects, personDescription, style = 'cinematic' } = input;
  
  const styleGuide = {
    cinematic: 'Hollywood-quality cinematography with dramatic lighting and depth',
    editorial: 'High-fashion editorial with artistic composition',
    casual: 'Natural, authentic lifestyle photography',
    dramatic: 'Bold, high-contrast visuals with strong shadows'
  };
  
  return `Generate a seamless transition workflow for the following:

ENVIRONMENT: ${environment}
OBJECTS TO FEATURE: ${objects.join(', ')}
${personDescription ? `PERSON: ${personDescription}` : ''}
STYLE: ${styleGuide[style]}

For each object, generate:
1. A scene description with specific camera angle and lighting
2. A pose suggestion for the person
3. Environmental details that vary between scenes
4. Transition movement hint

Ensure visual continuity across all scenes while maintaining variety in composition.
Output as JSON array with fields: object, sceneDescription, poseHint, environmentDetail, transitionHint`;
}

// ============================================================
// TRIM CONFIGURATION
// ============================================================

export const SEAMLESS_TRIM_CONFIG = {
  // Recommended duration for seamless transitions
  defaultDuration: 7, // seconds
  
  // Runway's recommended trim for seamless results
  trimStart: '00:00:00',
  trimEnd: '00:00:07',
  
  // Notes from the workflow
  notes: [
    '00:07:16 duration typically provides a seamless transition',
    'You may need to reselect time when connecting a new clip',
    'If not getting seamless transitions, try regenerating the scene node and/or Video results'
  ]
};

export default {
  INITIAL_SCENE_SYSTEM_PROMPT,
  TRANSITION_SCENE_SYSTEM_PROMPT,
  VIDEO_TRANSITION_PROMPT,
  SEAMLESS_PRESETS,
  generateSeamlessWorkflow,
  generatePromptChain,
  buildAISceneGeneratorPrompt,
  SEAMLESS_TRIM_CONFIG
};
