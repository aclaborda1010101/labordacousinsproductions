/**
 * VISUAL PRESETS SYSTEM
 * Pre-defined cinematic styles that auto-configure camera, lens, lighting, and mood
 */

export interface VisualPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  thumbnail?: string;
  
  // Technical defaults
  camera: {
    body: string;
    lens: string;
    focalLength: string;
    aperture: string;
  };
  
  // Visual characteristics
  style: {
    lighting: string;
    colorPalette: string[];
    mood: string;
    contrast: 'low' | 'medium' | 'high';
    saturation: 'muted' | 'natural' | 'vibrant';
    grain: 'none' | 'subtle' | 'medium' | 'heavy';
  };
  
  // Shot defaults
  shotDefaults: {
    avgDuration: number; // seconds
    preferredAngles: string[];
    movement: string[];
  };
  
  // Prompt modifiers for AI generation
  promptModifiers: string[];
  negativePromptModifiers: string[];
}

export const VISUAL_PRESETS: Record<string, VisualPreset> = {
  noir: {
    id: 'noir',
    name: 'Film Noir',
    description: 'Sombras profundas, alto contraste, atmósfera misteriosa',
    icon: '🎬',
    camera: {
      body: 'ARRI Alexa Mini',
      lens: 'Cooke S4/i',
      focalLength: '35mm',
      aperture: 'f/2.8',
    },
    style: {
      lighting: 'high contrast, deep shadows, practical lights, chiaroscuro',
      colorPalette: ['#0a0a0a', '#1a1a2e', '#4a4a4a', '#e5e5e5'],
      mood: 'mysterious, tense, atmospheric',
      contrast: 'high',
      saturation: 'muted',
      grain: 'medium',
    },
    shotDefaults: {
      avgDuration: 4,
      preferredAngles: ['dutch angle', 'low angle', 'silhouette'],
      movement: ['slow dolly', 'static', 'subtle tracking'],
    },
    promptModifiers: [
      'film noir aesthetic',
      'high contrast black and white tones',
      'deep shadows',
      'venetian blind lighting',
      'moody atmosphere',
      'cinematic chiaroscuro',
    ],
    negativePromptModifiers: ['bright', 'colorful', 'cheerful', 'flat lighting'],
  },
  
  epic: {
    id: 'epic',
    name: 'Épico Cinematográfico',
    description: 'Grandeza visual, composición majestuosa, escala monumental',
    icon: '⚔️',
    camera: {
      body: 'RED V-Raptor',
      lens: 'ARRI Signature Prime',
      focalLength: '24mm',
      aperture: 'f/4',
    },
    style: {
      lighting: 'golden hour, god rays, dramatic rim light',
      colorPalette: ['#1a1a1a', '#8b4513', '#d4af37', '#87ceeb'],
      mood: 'majestic, powerful, awe-inspiring',
      contrast: 'high',
      saturation: 'vibrant',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 5,
      preferredAngles: ['wide establishing', 'low angle hero', 'aerial'],
      movement: ['crane', 'steadicam', 'sweeping dolly'],
    },
    promptModifiers: [
      'epic cinematic scale',
      'dramatic lighting',
      'golden hour',
      'majestic composition',
      'wide aspect ratio',
      'anamorphic lens flares',
    ],
    negativePromptModifiers: ['intimate', 'claustrophobic', 'mundane', 'flat'],
  },
  
  documentary: {
    id: 'documentary',
    name: 'Documental',
    description: 'Naturalismo, luz disponible, inmediatez y autenticidad',
    icon: '📹',
    camera: {
      body: 'Sony FX6',
      lens: 'Sony G Master',
      focalLength: '50mm',
      aperture: 'f/1.8',
    },
    style: {
      lighting: 'natural light, available light, minimal intervention',
      colorPalette: ['#f5f5dc', '#8b8b7a', '#a0522d', '#4682b4'],
      mood: 'authentic, intimate, observational',
      contrast: 'medium',
      saturation: 'natural',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['eye level', 'handheld', 'observational'],
      movement: ['handheld', 'follow', 'reactive'],
    },
    promptModifiers: [
      'documentary style',
      'natural lighting',
      'candid moment',
      'authentic',
      'observational',
      'available light',
    ],
    negativePromptModifiers: ['stylized', 'artificial', 'theatrical', 'over-lit'],
  },
  
  fantasy: {
    id: 'fantasy',
    name: 'Fantasía',
    description: 'Mundos mágicos, colores saturados, atmósferas etéreas',
    icon: '✨',
    camera: {
      body: 'ARRI Alexa 65',
      lens: 'Panavision Sphero 65',
      focalLength: '40mm',
      aperture: 'f/2.0',
    },
    style: {
      lighting: 'magical hour, ethereal glow, practical magic lights',
      colorPalette: ['#1a0a2e', '#4a0080', '#00d4ff', '#ffd700'],
      mood: 'magical, dreamlike, otherworldly',
      contrast: 'medium',
      saturation: 'vibrant',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 4,
      preferredAngles: ['wide fantasy landscape', 'intimate character', 'wonder POV'],
      movement: ['floating steadicam', 'crane reveal', 'gentle push'],
    },
    promptModifiers: [
      'fantasy world',
      'magical atmosphere',
      'ethereal lighting',
      'dreamlike quality',
      'rich saturated colors',
      'otherworldly',
    ],
    negativePromptModifiers: ['mundane', 'realistic', 'gritty', 'urban'],
  },
  
  realistic: {
    id: 'realistic',
    name: 'Realista Moderno',
    description: 'Estética naturalista contemporánea, paleta sobria',
    icon: '📷',
    camera: {
      body: 'ARRI Alexa Mini LF',
      lens: 'Zeiss Supreme Prime',
      focalLength: '50mm',
      aperture: 'f/2.8',
    },
    style: {
      lighting: 'motivated lighting, naturalistic, soft sources',
      colorPalette: ['#2c2c2c', '#5a5a5a', '#8b8b8b', '#d4d4d4'],
      mood: 'grounded, contemporary, authentic',
      contrast: 'medium',
      saturation: 'natural',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['eye level', 'over shoulder', 'medium close'],
      movement: ['subtle dolly', 'static tripod', 'gentle handheld'],
    },
    promptModifiers: [
      'photorealistic',
      'naturalistic lighting',
      'contemporary aesthetic',
      'grounded reality',
      'subtle color grading',
      'modern cinematography',
    ],
    negativePromptModifiers: ['stylized', 'theatrical', 'fantasy', 'exaggerated'],
  },
  
  vintage: {
    id: 'vintage',
    name: 'Vintage / Retro',
    description: 'Estética de época, colores cálidos, textura de película',
    icon: '📼',
    camera: {
      body: 'ARRI Alexa Mini',
      lens: 'Cooke Speed Panchro',
      focalLength: '40mm',
      aperture: 'f/2.0',
    },
    style: {
      lighting: 'soft tungsten, warm practicals, period-accurate',
      colorPalette: ['#8b4513', '#daa520', '#f4a460', '#ffe4b5'],
      mood: 'nostalgic, warm, period-authentic',
      contrast: 'low',
      saturation: 'muted',
      grain: 'heavy',
    },
    shotDefaults: {
      avgDuration: 4,
      preferredAngles: ['classic compositions', 'static frames', 'tableaux'],
      movement: ['slow dolly', 'static', 'gentle pan'],
    },
    promptModifiers: [
      'vintage film aesthetic',
      'warm color temperature',
      'film grain texture',
      '35mm film look',
      'period-accurate',
      'nostalgic atmosphere',
    ],
    negativePromptModifiers: ['modern', 'digital', 'clean', 'sharp'],
  },
  
  horror: {
    id: 'horror',
    name: 'Horror / Thriller',
    description: 'Tensión visual, sombras amenazantes, atmósfera opresiva',
    icon: '👻',
    camera: {
      body: 'RED Komodo',
      lens: 'Leica Summilux-C',
      focalLength: '29mm',
      aperture: 'f/1.4',
    },
    style: {
      lighting: 'low key, motivated shadows, unsettling sources',
      colorPalette: ['#0a0a0a', '#1a1a2e', '#4a0000', '#2e1a1a'],
      mood: 'tense, unsettling, claustrophobic',
      contrast: 'high',
      saturation: 'muted',
      grain: 'medium',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['dutch angle', 'low angle', 'POV stalker', 'claustrophobic close'],
      movement: ['slow creeping dolly', 'handheld tension', 'static dread'],
    },
    promptModifiers: [
      'horror atmosphere',
      'low key lighting',
      'deep shadows',
      'unsettling composition',
      'tension',
      'dread',
    ],
    negativePromptModifiers: ['bright', 'cheerful', 'safe', 'comfortable'],
  },
  
  comedy: {
    id: 'comedy',
    name: 'Comedia',
    description: 'Iluminación brillante, colores vivos, energía visual',
    icon: '😂',
    camera: {
      body: 'Sony Venice 2',
      lens: 'Panavision Primo',
      focalLength: '35mm',
      aperture: 'f/4',
    },
    style: {
      lighting: 'bright, even, flattering, high key',
      colorPalette: ['#ffffff', '#ffcc00', '#ff6b6b', '#4ecdc4'],
      mood: 'light, energetic, warm',
      contrast: 'low',
      saturation: 'vibrant',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 2,
      preferredAngles: ['medium shot', 'two-shot', 'reaction close'],
      movement: ['snappy pan', 'push in', 'whip pan'],
    },
    promptModifiers: [
      'bright lighting',
      'warm atmosphere',
      'comedic framing',
      'high key lighting',
      'vibrant colors',
      'energetic',
    ],
    negativePromptModifiers: ['dark', 'moody', 'tense', 'dramatic'],
  },
};

export function getPresetById(id: string): VisualPreset | undefined {
  return VISUAL_PRESETS[id];
}

export function getAllPresets(): VisualPreset[] {
  return Object.values(VISUAL_PRESETS);
}

export function getPresetPromptModifiers(presetId: string): { positive: string[]; negative: string[] } {
  const preset = VISUAL_PRESETS[presetId];
  if (!preset) {
    return { positive: [], negative: [] };
  }
  return {
    positive: preset.promptModifiers,
    negative: preset.negativePromptModifiers,
  };
}
