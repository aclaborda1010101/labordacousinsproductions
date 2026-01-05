// supabase/functions/_shared/promptBuilder.ts
// Broadcast Quality v2.0 - Strict Prompt Builder for Cinematic AI Generation

// ============================================================================
// SCENE MASTER (Global Immutable Variables per Scene)
// ============================================================================
export interface SceneMaster {
  // 1. LIGHTING RIG (Physics)
  lighting_source: string; // e.g. "Moonlight coming through window on right"
  lighting_quality: 'Hard' | 'Soft' | 'Diffused' | 'Harsh';
  color_temperature: 'Warm (Tungsten)' | 'Neutral (Daylight)' | 'Cool (Blue)' | 'Mixed';
  contrast: 'High Key' | 'Low Key' | 'Balanced';

  // 2. ATMOSPHERE (Texture)
  atmosphere: string; // e.g. "Thick fog, God rays, Dust particles"
  weather: string; // e.g. "Heavy rain, Wet surfaces"

  // 3. OPTICAL CHARACTER (The Lens Set)
  lens_character: 'Modern Clean (Sharp)' | 'Vintage (Soft edges)' | 'Anamorphic (Oval bokeh, flares)' | 'B&W Film Grain';
  film_stock: string; // e.g. "Kodak Portra 400", "Fujifilm Eterna 500T"

  // 4. ART DIRECTION (The World)
  location_anchor: string; // e.g. "Cyberpunk alleyway, neon signs, trash on floor"
  palette: string; // e.g. "Teal and Orange, High Contrast"
}

// ============================================================================
// SHOT SPECS (Local Variables per Shot)
// ============================================================================
export interface ShotSpecs {
  size: 'EXTREME_CLOSE_UP' | 'CLOSE_UP' | 'MEDIUM_CLOSE_UP' | 'MEDIUM' | 'COWBOY' | 'FULL' | 'WIDE' | 'EXTREME_WIDE';
  angle: 'EYE_LEVEL' | 'LOW_ANGLE' | 'HIGH_ANGLE' | 'DUTCH' | 'OVERHEAD' | 'WORMS_EYE';
  lens: string; // e.g. "85mm", "35mm", "50mm"
  aperture: string; // e.g. "f/1.8", "f/2.8"
  movement: 'Static' | 'Handheld' | 'Dolly In' | 'Dolly Out' | 'Pan' | 'Tracking' | 'Crane Up' | 'Crane Down' | 'Steadicam';
  action: string; // The actual action/description
}

// ============================================================================
// PROMPT CONTEXT (Full Generation Context)
// ============================================================================
export interface PromptContext {
  // Canon / Bible Context
  bible: { 
    tone: string; 
    period: string; 
    realism_level?: string;
    rating?: string;
  };

  // Asset Context (P0/P1)
  character?: {
    name: string;
    visual_trigger?: string; // e.g. "woman, 25yo, blue eyes"
    fixed_traits: string[];
  };
  location?: {
    name: string;
    visual_trigger?: string;
    fixed_elements: string[];
  };

  // Scene Master (Global)
  scene?: SceneMaster;

  // Shot Specs (Local)
  shot: ShotSpecs;

  // Legacy simple fields (for backwards compatibility)
  lighting?: string;

  // Seed for consistency
  seed?: number;
}

// ============================================================================
// PROMPT BUILDER FUNCTIONS
// ============================================================================

/**
 * Build a strict, mathematical prompt for maximum photorealism
 * Structure: [Technical Header] -> [Film Stock] -> [World/Scene] -> [Subject] -> [Camera] -> [Negative]
 */
export function buildStrictPrompt(ctx: PromptContext): string {
  // 1. TECHNICAL HEADER (Forces high-end photography mode)
  const filmStock = ctx.scene?.film_stock || 'Fujifilm Eterna 500T';
  const realismLevel = ctx.bible.realism_level || 'hyperrealistic';
  const lensChar = ctx.scene?.lens_character || 'Modern Clean (Sharp)';
  
  const header = `Raw photo, 8k uhd, analog photography, ${filmStock}, film grain, realistic skin texture, ${realismLevel}, ${lensChar} lens style`;

  // 2. SUBJECT ANCHOR (Identity P0)
  const subject = ctx.character
    ? `${ctx.character.name}, ${ctx.character.visual_trigger || ''}, ${ctx.character.fixed_traits.join(', ')}`
    : 'cinematic scene';

  // 3. ENVIRONMENT ANCHOR (Location P1)
  const environment = ctx.location
    ? `in ${ctx.location.name}, ${ctx.location.visual_trigger || ''}, ${ctx.location.fixed_elements.join(', ')}`
    : ctx.scene?.location_anchor 
      ? `in ${ctx.scene.location_anchor}`
      : 'in a detailed cinematic background';

  // 4. CAMERA & LIGHTING (The Physics of Realism)
  const shotSize = formatShotSize(ctx.shot.size);
  const cameraAngle = formatCameraAngle(ctx.shot.angle);
  const lighting = ctx.scene 
    ? `${ctx.scene.lighting_source}, ${ctx.scene.lighting_quality} light, ${ctx.scene.color_temperature}, ${ctx.scene.contrast}`
    : ctx.lighting || 'cinematic lighting';
  
  const techSpecs = `Shot on ${ctx.shot.lens}, ${ctx.shot.aperture}, ${shotSize}, ${cameraAngle}, ${lighting}, shallow depth of field`;

  // 5. ATMOSPHERE (If scene master defined)
  const atmosphere = ctx.scene
    ? `${ctx.scene.atmosphere}, ${ctx.scene.weather}, ${ctx.scene.palette}`
    : '';

  // 6. ACTION
  const action = ctx.shot.action;

  // 7. MOVEMENT HINT (for future video)
  const movement = ctx.shot.movement !== 'Static' ? `, camera movement: ${ctx.shot.movement}` : '';

  // ASSEMBLY
  return `${header}. ${subject} ${action} ${environment}. ${techSpecs}${movement}. ${atmosphere} --ar 16:9 --v 6.0`.trim().replace(/\s+/g, ' ');
}

/**
 * Build a consistent prompt using Scene Master hierarchy
 * Ensures lighting and environment stay identical across all shots in a scene
 */
export function buildConsistentPrompt(scene: SceneMaster, shot: ShotSpecs, character?: PromptContext['character']): string {
  // PART 1: THE IMMUTABLE WORLD (The Scene) - This is IDENTICAL for every shot
  const worldLayer = [
    `${scene.film_stock}, ${scene.lens_character} lens style`,
    `Environment: ${scene.location_anchor}`,
    `Lighting Condition: ${scene.lighting_source}, ${scene.lighting_quality}, ${scene.color_temperature}`,
    `Contrast: ${scene.contrast}`,
    `Atmosphere: ${scene.atmosphere}`,
    `Weather: ${scene.weather}`,
    `Color Palette: ${scene.palette}`
  ].filter(Boolean).join('. ');

  // PART 2: SUBJECT (If character)
  const subjectLayer = character
    ? `Subject: ${character.name}, ${character.visual_trigger || ''}, ${character.fixed_traits.join(', ')}`
    : '';

  // PART 3: THE CAMERA PERSPECTIVE (The Shot) - This is the VARIABLE part
  const cameraLayer = [
    `Shot Type: ${formatShotSize(shot.size)} (${shot.lens}, ${shot.aperture})`,
    `Camera Angle: ${formatCameraAngle(shot.angle)}`,
    `Movement: ${shot.movement}`,
    `Action: ${shot.action}`
  ].join('. ');

  // ASSEMBLY with BREAK token for model guidance
  return `Raw photo, 8k uhd, hyperrealistic, film grain. ${worldLayer}. ${subjectLayer}. BREAK. ${cameraLayer} --no changing light, inconsistent shadows, varying color temperature`.trim().replace(/\s+/g, ' ');
}

/**
 * Build negative prompt based on context
 */
export function buildNegativePrompt(ctx: PromptContext): string {
  const baseNegatives = [
    'cartoon', 'anime', 'illustration', 'painting', 'drawing', 'sketch',
    'cgi', 'render', '3d', 'plastic', 'fake', 'artificial',
    'blurry', 'out of focus', 'noisy', 'grainy', 'pixelated',
    'oversaturated', 'overexposed', 'underexposed',
    'deformed', 'distorted', 'disfigured', 'mutated',
    'bad anatomy', 'bad proportions', 'extra limbs', 'missing limbs',
    'watermark', 'text', 'logo', 'signature'
  ];

  // Add context-specific negatives
  const contextNegatives: string[] = [];

  if (ctx.scene?.lighting_quality === 'Soft') {
    contextNegatives.push('harsh shadows', 'hard light');
  }
  if (ctx.scene?.lighting_quality === 'Hard') {
    contextNegatives.push('soft shadows', 'diffused light');
  }
  if (ctx.scene?.lens_character === 'Anamorphic (Oval bokeh, flares)') {
    contextNegatives.push('circular bokeh', 'no lens flares');
  }

  return [...baseNegatives, ...contextNegatives].join(', ');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatShotSize(size: ShotSpecs['size']): string {
  const mapping: Record<ShotSpecs['size'], string> = {
    'EXTREME_CLOSE_UP': 'extreme close-up shot',
    'CLOSE_UP': 'close-up shot',
    'MEDIUM_CLOSE_UP': 'medium close-up shot',
    'MEDIUM': 'medium shot',
    'COWBOY': 'cowboy shot (mid-thigh up)',
    'FULL': 'full body shot',
    'WIDE': 'wide shot',
    'EXTREME_WIDE': 'extreme wide establishing shot'
  };
  return mapping[size] || 'medium shot';
}

function formatCameraAngle(angle: ShotSpecs['angle']): string {
  const mapping: Record<ShotSpecs['angle'], string> = {
    'EYE_LEVEL': 'eye level angle',
    'LOW_ANGLE': 'low angle (looking up)',
    'HIGH_ANGLE': 'high angle (looking down)',
    'DUTCH': 'dutch angle (tilted)',
    'OVERHEAD': 'overhead bird\'s eye view',
    'WORMS_EYE': 'worm\'s eye view (extreme low)'
  };
  return mapping[angle] || 'eye level angle';
}

// ============================================================================
// PRESET SCENE MASTERS
// ============================================================================

export const SCENE_PRESETS: Record<string, SceneMaster> = {
  'noir_night': {
    lighting_source: 'Single harsh streetlight from above, neon signs in background',
    lighting_quality: 'Hard',
    color_temperature: 'Mixed',
    contrast: 'Low Key',
    atmosphere: 'Thick fog, visible light beams, cigarette smoke',
    weather: 'Light rain, wet pavement reflections',
    lens_character: 'Vintage (Soft edges)',
    film_stock: 'Kodak Vision3 500T',
    location_anchor: 'Dark urban alley, brick walls, fire escapes',
    palette: 'Teal shadows, amber highlights, desaturated'
  },
  'golden_hour': {
    lighting_source: 'Low sun from camera left, warm backlight rim',
    lighting_quality: 'Soft',
    color_temperature: 'Warm (Tungsten)',
    contrast: 'Balanced',
    atmosphere: 'Golden dust particles, lens flares',
    weather: 'Clear sky, gentle breeze',
    lens_character: 'Anamorphic (Oval bokeh, flares)',
    film_stock: 'Kodak Portra 400',
    location_anchor: 'Open field, tall grass, distant mountains',
    palette: 'Warm orange and gold, soft greens'
  },
  'cyberpunk': {
    lighting_source: 'Multiple neon signs (pink, blue, green), holographic ads',
    lighting_quality: 'Hard',
    color_temperature: 'Cool (Blue)',
    contrast: 'High Key',
    atmosphere: 'Dense smog, neon reflections, steam vents',
    weather: 'Perpetual night, acid rain',
    lens_character: 'Anamorphic (Oval bokeh, flares)',
    film_stock: 'Digital ARRI Alexa',
    location_anchor: 'Crowded Asian market street, holographic billboards, flying cars',
    palette: 'Magenta and cyan, high saturation'
  },
  'studio_portrait': {
    lighting_source: 'Three-point lighting setup, key light at 45 degrees',
    lighting_quality: 'Soft',
    color_temperature: 'Neutral (Daylight)',
    contrast: 'Balanced',
    atmosphere: 'Clean, no particles',
    weather: 'Indoor controlled environment',
    lens_character: 'Modern Clean (Sharp)',
    film_stock: 'Digital Phase One',
    location_anchor: 'Professional studio, neutral gray backdrop',
    palette: 'Neutral tones, natural skin colors'
  }
};

// ============================================================================
// SHOT PRESETS
// ============================================================================

export const SHOT_PRESETS: Record<string, Partial<ShotSpecs>> = {
  'portrait_classic': {
    size: 'CLOSE_UP',
    angle: 'EYE_LEVEL',
    lens: '85mm',
    aperture: 'f/1.8',
    movement: 'Static'
  },
  'establishing': {
    size: 'EXTREME_WIDE',
    angle: 'HIGH_ANGLE',
    lens: '16mm',
    aperture: 'f/8',
    movement: 'Crane Down'
  },
  'action_tracking': {
    size: 'MEDIUM',
    angle: 'EYE_LEVEL',
    lens: '35mm',
    aperture: 'f/2.8',
    movement: 'Tracking'
  },
  'intimate_dialogue': {
    size: 'MEDIUM_CLOSE_UP',
    angle: 'EYE_LEVEL',
    lens: '50mm',
    aperture: 'f/2',
    movement: 'Static'
  },
  'power_shot': {
    size: 'COWBOY',
    angle: 'LOW_ANGLE',
    lens: '35mm',
    aperture: 'f/4',
    movement: 'Dolly In'
  }
};

// ============================================================================
// LENS PRESETS
// ============================================================================

export const LENS_OPTIONS = [
  { value: '16mm', label: '16mm (Ultra Wide)', description: 'Dramatic perspectives, establishes space' },
  { value: '24mm', label: '24mm (Wide)', description: 'Environmental, slight distortion' },
  { value: '35mm', label: '35mm (Reportage)', description: 'Natural field of view, documentary feel' },
  { value: '50mm', label: '50mm (Human Eye)', description: 'Most natural, no distortion' },
  { value: '85mm', label: '85mm (Portrait)', description: 'Flattering compression, beautiful bokeh' },
  { value: '135mm', label: '135mm (Telephoto)', description: 'Strong compression, intimate' },
  { value: '200mm', label: '200mm (Long Tele)', description: 'Extreme compression, isolated subjects' }
];

export const LIGHTING_OPTIONS = [
  { value: 'Natural (Soft Window)', label: 'Natural (Ventana Suave)', description: 'Luz difusa de ventana, suave y orgánica' },
  { value: 'Cinematic (Rembrandt)', label: 'Cinemático (Rembrandt)', description: 'Triángulo de luz en mejilla, dramático' },
  { value: 'Studio (High Key)', label: 'Estudio (High Key)', description: 'Todo iluminado, comercial, limpio' },
  { value: 'Studio (Low Key)', label: 'Estudio (Low Key)', description: 'Sombras profundas, misterio' },
  { value: 'Neon / Cyberpunk', label: 'Neón / Cyberpunk', description: 'Luces de colores, reflejos' },
  { value: 'Hard (Direct Sun)', label: 'Dura (Sol Directo)', description: 'Sombras definidas, alto contraste' },
  { value: 'Golden Hour', label: 'Hora Dorada', description: 'Luz cálida lateral, mágica' },
  { value: 'Blue Hour', label: 'Hora Azul', description: 'Pre-amanecer/post-atardecer, fría' }
];

export const SHOT_SIZE_OPTIONS = [
  { value: 'EXTREME_CLOSE_UP', label: 'Primerísimo Plano', description: 'Solo ojos/detalles' },
  { value: 'CLOSE_UP', label: 'Primer Plano', description: 'Cara completa' },
  { value: 'MEDIUM_CLOSE_UP', label: 'Plano Medio Corto', description: 'Cabeza y hombros' },
  { value: 'MEDIUM', label: 'Plano Medio', description: 'Cintura arriba' },
  { value: 'COWBOY', label: 'Plano Americano', description: 'Medio muslo arriba' },
  { value: 'FULL', label: 'Plano Entero', description: 'Cuerpo completo' },
  { value: 'WIDE', label: 'Plano General', description: 'Personaje + entorno' },
  { value: 'EXTREME_WIDE', label: 'Gran Plano General', description: 'Paisaje dominante' }
];

export const CAMERA_ANGLE_OPTIONS = [
  { value: 'EYE_LEVEL', label: 'Altura de Ojos', description: 'Neutral, natural' },
  { value: 'LOW_ANGLE', label: 'Contrapicado', description: 'Poder, grandeza' },
  { value: 'HIGH_ANGLE', label: 'Picado', description: 'Vulnerabilidad, sumisión' },
  { value: 'DUTCH', label: 'Ángulo Holandés', description: 'Tensión, desorientación' },
  { value: 'OVERHEAD', label: 'Cenital', description: 'Vista de pájaro' },
  { value: 'WORMS_EYE', label: 'Nadir', description: 'Desde el suelo, épico' }
];

export const CAMERA_MOVEMENT_OPTIONS = [
  { value: 'Static', label: 'Estático', description: 'Cámara fija, calma o tensión' },
  { value: 'Handheld', label: 'Cámara en Mano', description: 'Realismo, documental, caos' },
  { value: 'Dolly In', label: 'Dolly In', description: 'Acercamiento, revelación, foco' },
  { value: 'Dolly Out', label: 'Dolly Out', description: 'Alejamiento, aislamiento' },
  { value: 'Pan', label: 'Paneo', description: 'Seguimiento horizontal' },
  { value: 'Tracking', label: 'Travelling', description: 'Seguimiento lateral, energía' },
  { value: 'Crane Up', label: 'Grúa Arriba', description: 'Elevación, épico' },
  { value: 'Crane Down', label: 'Grúa Abajo', description: 'Descenso, revelación' },
  { value: 'Steadicam', label: 'Steadicam', description: 'Flotante, onírico' }
];

export const APERTURE_OPTIONS = [
  { value: 'f/1.4', label: 'f/1.4', description: 'Bokeh extremo, muy poca profundidad' },
  { value: 'f/1.8', label: 'f/1.8', description: 'Bokeh cremoso, retrato' },
  { value: 'f/2.8', label: 'f/2.8', description: 'Equilibrado, cine estándar' },
  { value: 'f/4', label: 'f/4', description: 'Más profundidad, todavía suave' },
  { value: 'f/5.6', label: 'f/5.6', description: 'Profundidad media' },
  { value: 'f/8', label: 'f/8', description: 'Nítido de cerca a lejos' },
  { value: 'f/11', label: 'f/11', description: 'Todo en foco, paisaje' }
];
