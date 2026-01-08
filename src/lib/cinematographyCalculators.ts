/**
 * Professional Cinematography Calculators
 * Implements real-world photographic formulas for precise prompt generation
 */

/**
 * Circle of Confusion values for different sensor sizes (in mm)
 */
const CIRCLE_OF_CONFUSION = {
  'full_frame': 0.03,      // 35mm full frame (36x24mm)
  'super35': 0.025,        // Super 35 (24.89x18.66mm)
  'aps_c': 0.02,           // APS-C crop sensor
  'micro_four_thirds': 0.015, // MFT
  'medium_format': 0.05,   // Medium format
  'imax': 0.05,            // IMAX (large format)
};

export interface DOFResult {
  nearFocus: number;      // meters
  farFocus: number;       // meters (Infinity if applicable)
  totalDOF: number;       // meters
  hyperfocal: number;     // meters
  description: string;    // Human-readable description for prompts
}

/**
 * Calculate Depth of Field using real photographic formulas
 * 
 * @param focalLengthMm - Lens focal length in millimeters
 * @param aperture - f-stop number (e.g., 1.4, 2.8, 5.6)
 * @param subjectDistanceM - Distance to subject in meters
 * @param sensorType - Sensor/film format type
 */
export function calculateDOF(
  focalLengthMm: number,
  aperture: number,
  subjectDistanceM: number,
  sensorType: keyof typeof CIRCLE_OF_CONFUSION = 'super35'
): DOFResult {
  const coc = CIRCLE_OF_CONFUSION[sensorType];
  const f = focalLengthMm;
  const N = aperture;
  const s = subjectDistanceM * 1000; // Convert to mm
  
  // Hyperfocal distance: H = f² / (N × c)
  const hyperfocal = (f * f) / (N * coc);
  
  // Near focus distance: Dn = (H × s) / (H + (s - f))
  const nearFocus = (hyperfocal * s) / (hyperfocal + (s - f));
  
  // Far focus distance: Df = (H × s) / (H - (s - f))
  // If s > H, far focus is infinity
  let farFocus: number;
  if (s >= hyperfocal) {
    farFocus = Infinity;
  } else {
    farFocus = (hyperfocal * s) / (hyperfocal - (s - f));
  }
  
  // Total DOF
  const totalDOF = farFocus === Infinity ? Infinity : (farFocus - nearFocus);
  
  // Generate description for prompts
  const description = generateDOFDescription(
    nearFocus / 1000,
    farFocus / 1000,
    totalDOF / 1000,
    focalLengthMm,
    aperture
  );
  
  return {
    nearFocus: nearFocus / 1000,
    farFocus: farFocus === Infinity ? Infinity : farFocus / 1000,
    totalDOF: totalDOF === Infinity ? Infinity : totalDOF / 1000,
    hyperfocal: hyperfocal / 1000,
    description
  };
}

function generateDOFDescription(
  nearM: number,
  farM: number,
  totalM: number,
  focalMm: number,
  aperture: number
): string {
  // Classify DOF
  let dofClass: string;
  if (aperture <= 2) {
    dofClass = 'extremely shallow depth of field, razor-thin focus plane';
  } else if (aperture <= 2.8) {
    dofClass = 'very shallow depth of field, strong background blur';
  } else if (aperture <= 4) {
    dofClass = 'shallow depth of field, visible bokeh';
  } else if (aperture <= 5.6) {
    dofClass = 'moderate depth of field, subtle background softness';
  } else if (aperture <= 8) {
    dofClass = 'normal depth of field, good overall sharpness';
  } else if (aperture <= 11) {
    dofClass = 'deep depth of field, most elements sharp';
  } else {
    dofClass = 'very deep depth of field, everything in focus';
  }
  
  // Classify focal length look
  let focalClass: string;
  if (focalMm <= 24) {
    focalClass = 'wide-angle perspective, expanded depth, environmental context';
  } else if (focalMm <= 35) {
    focalClass = 'moderate wide perspective, natural spatial relationship';
  } else if (focalMm <= 50) {
    focalClass = 'normal perspective, natural human field of view';
  } else if (focalMm <= 85) {
    focalClass = 'portrait telephoto, flattering compression, isolated subject';
  } else if (focalMm <= 135) {
    focalClass = 'telephoto compression, intimate isolation, compressed planes';
  } else {
    focalClass = 'long telephoto, extreme compression, documentary feel';
  }
  
  return `${focalMm}mm lens at f/${aperture}, ${dofClass}. ${focalClass}`;
}

/**
 * Camera angle descriptions for prompt injection
 */
export const CAMERA_ANGLES = {
  EXTREME_LOW: {
    degrees: -60,
    description: 'extreme low angle, camera near ground level looking up',
    effect: 'makes subject appear powerful, dominant, or threatening'
  },
  LOW: {
    degrees: -30,
    description: 'low angle, camera below eye level looking up',
    effect: 'adds heroic quality, subtle power dynamic'
  },
  EYE_LEVEL: {
    degrees: 0,
    description: 'eye level, neutral camera angle',
    effect: 'natural, documentary, intimate connection'
  },
  HIGH: {
    degrees: 30,
    description: 'high angle, camera above subject looking down',
    effect: 'makes subject appear vulnerable, smaller, or subordinate'
  },
  EXTREME_HIGH: {
    degrees: 60,
    description: 'extreme high angle, bird\'s eye perspective',
    effect: 'god-like perspective, emphasizes isolation or pattern'
  },
  BIRDS_EYE: {
    degrees: 90,
    description: 'overhead bird\'s eye view, directly above subject',
    effect: 'abstract, graphic, complete environmental context'
  },
  DUTCH: {
    degrees: 'tilted',
    description: 'dutch angle, camera tilted on axis',
    effect: 'unease, tension, psychological disturbance, stylization'
  },
  WORMS_EYE: {
    degrees: -90,
    description: 'worm\'s eye view, directly below subject',
    effect: 'extreme power dynamic, architectural emphasis'
  }
};

/**
 * Standard focal lengths and their cinematic characteristics
 */
export const FOCAL_LENGTH_GUIDE = {
  14: { 
    category: 'ultra_wide',
    use: 'epic landscapes, architectural interiors, sci-fi',
    distortion: 'high barrel distortion, exaggerated depth',
    emotion: 'overwhelming, expansive, surreal'
  },
  24: {
    category: 'wide',
    use: 'establishing shots, action sequences, environments',
    distortion: 'moderate wide distortion, dynamic movement',
    emotion: 'energetic, immersive, documentary'
  },
  35: {
    category: 'moderate_wide',
    use: 'walk-and-talk, following shots, ensemble scenes',
    distortion: 'minimal distortion, natural depth',
    emotion: 'naturalistic, journalistic, intimate'
  },
  50: {
    category: 'normal',
    use: 'standard coverage, close dialogue, neutral framing',
    distortion: 'no distortion, matches human vision',
    emotion: 'authentic, familiar, understated'
  },
  85: {
    category: 'portrait',
    use: 'close-ups, portraits, beauty shots',
    distortion: 'flattering compression, shallow DOF',
    emotion: 'intimate, romantic, glamorous'
  },
  100: {
    category: 'macro_portrait',
    use: 'extreme close-ups, detail shots, macro',
    distortion: 'compression, very shallow DOF',
    emotion: 'clinical, detailed, isolated'
  },
  135: {
    category: 'telephoto',
    use: 'compressed dialogue, voyeuristic shots, sports',
    distortion: 'heavy compression, stacked planes',
    emotion: 'detached, observational, compressed'
  },
  200: {
    category: 'long_telephoto',
    use: 'surveillance, wildlife, compressed landscapes',
    distortion: 'extreme compression, flattened depth',
    emotion: 'distant, documentary, stalker-like'
  }
};

/**
 * Exposure triangle calculations for consistent lighting prompts
 */
export interface ExposureSettings {
  iso: number;
  shutterSpeed: string;
  aperture: number;
  ev: number;
  description: string;
}

export function calculateExposure(
  lightingCondition: 'bright_sun' | 'overcast' | 'shade' | 'golden_hour' | 'blue_hour' | 'indoor_bright' | 'indoor_dim' | 'night'
): ExposureSettings {
  const conditions: Record<string, ExposureSettings> = {
    bright_sun: {
      iso: 100,
      shutterSpeed: '1/500',
      aperture: 8,
      ev: 15,
      description: 'harsh sunlight, strong shadows, high contrast, sunny 16 exposure'
    },
    overcast: {
      iso: 200,
      shutterSpeed: '1/250',
      aperture: 5.6,
      ev: 12,
      description: 'soft diffused daylight, even lighting, minimal shadows, cloudy diffusion'
    },
    shade: {
      iso: 400,
      shutterSpeed: '1/125',
      aperture: 4,
      ev: 10,
      description: 'open shade lighting, cool color temperature, soft contrast'
    },
    golden_hour: {
      iso: 200,
      shutterSpeed: '1/250',
      aperture: 4,
      ev: 11,
      description: 'warm golden sunlight, long shadows, orange/amber color cast, magic hour glow'
    },
    blue_hour: {
      iso: 800,
      shutterSpeed: '1/60',
      aperture: 2.8,
      ev: 7,
      description: 'twilight blue ambient light, cool color temperature, soft atmospheric quality'
    },
    indoor_bright: {
      iso: 800,
      shutterSpeed: '1/125',
      aperture: 2.8,
      ev: 8,
      description: 'bright interior lighting, mixed light sources, practical fixtures visible'
    },
    indoor_dim: {
      iso: 1600,
      shutterSpeed: '1/60',
      aperture: 2,
      ev: 5,
      description: 'low-key interior lighting, pools of light, dramatic shadows, moody atmosphere'
    },
    night: {
      iso: 3200,
      shutterSpeed: '1/30',
      aperture: 1.4,
      ev: 2,
      description: 'night exterior, available light only, high contrast, noir atmosphere'
    }
  };
  
  return conditions[lightingCondition] || conditions.indoor_bright;
}

/**
 * Generate a complete cinematography prompt block
 */
export function generateCinematographyPrompt(options: {
  focalLength: number;
  aperture: number;
  subjectDistance: number;
  angle: keyof typeof CAMERA_ANGLES;
  lighting: Parameters<typeof calculateExposure>[0];
  movement?: string;
}): string {
  const dof = calculateDOF(options.focalLength, options.aperture, options.subjectDistance);
  const angle = CAMERA_ANGLES[options.angle];
  const exposure = calculateExposure(options.lighting);
  const focalGuide = FOCAL_LENGTH_GUIDE[options.focalLength as keyof typeof FOCAL_LENGTH_GUIDE] 
    || FOCAL_LENGTH_GUIDE[50];
  
  const parts = [
    `Shot on ${options.focalLength}mm lens at f/${options.aperture}`,
    dof.description,
    angle.description,
    exposure.description,
    focalGuide.distortion,
  ];
  
  if (options.movement) {
    parts.push(`${options.movement} camera movement`);
  }
  
  return parts.join('. ') + '.';
}
