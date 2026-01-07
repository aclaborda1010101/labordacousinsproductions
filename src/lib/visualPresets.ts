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
  category: 'live-action' | 'animation' | 'hybrid';
  examples: string[]; // Reference films/shows
  
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
  // =====================
  // LIVE-ACTION PRESETS
  // =====================
  noir: {
    id: 'noir',
    name: 'Film Noir',
    description: 'Sombras profundas, alto contraste, atmósfera misteriosa',
    icon: '🎬',
    category: 'live-action',
    examples: ['Sin City', 'Blade Runner', 'L.A. Confidential'],
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
    category: 'live-action',
    examples: ['Gladiator', 'El Señor de los Anillos', 'Dune'],
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
    category: 'live-action',
    examples: ['Free Solo', 'The Social Dilemma', 'Searching for Sugar Man'],
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
    category: 'live-action',
    examples: ['Harry Potter', 'Avatar', 'El Laberinto del Fauno'],
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
    category: 'live-action',
    examples: ['Marriage Story', 'Nomadland', 'Manchester by the Sea'],
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
    category: 'live-action',
    examples: ['La La Land', 'The Grand Budapest Hotel', 'Babylon'],
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
    category: 'live-action',
    examples: ['Hereditary', 'The Conjuring', 'El Exorcista'],
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
    category: 'live-action',
    examples: ['Superbad', 'Barbie', 'The Grand Budapest Hotel'],
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

  scifi: {
    id: 'scifi',
    name: 'Ciencia Ficción',
    description: 'Estética futurista, iluminación tecnológica, ambientes fríos',
    icon: '🚀',
    category: 'live-action',
    examples: ['Interstellar', 'Ex Machina', 'Arrival'],
    camera: {
      body: 'ARRI Alexa 65',
      lens: 'Panavision Ultra Vista',
      focalLength: '35mm',
      aperture: 'f/2.8',
    },
    style: {
      lighting: 'cool LEDs, practical tech lights, clinical whites',
      colorPalette: ['#0a1628', '#1a3a5c', '#4a9eff', '#e0e0e0'],
      mood: 'futuristic, clinical, vast',
      contrast: 'high',
      saturation: 'natural',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 4,
      preferredAngles: ['wide establishing', 'symmetrical', 'POV technology'],
      movement: ['slow tracking', 'orbital', 'push through'],
    },
    promptModifiers: [
      'science fiction aesthetic',
      'futuristic technology',
      'clean clinical lighting',
      'cool color temperature',
      'vast scale',
      'sleek design',
    ],
    negativePromptModifiers: ['warm', 'organic', 'rustic', 'vintage'],
  },

  // =====================
  // ANIMATION PRESETS
  // =====================
  anime: {
    id: 'anime',
    name: 'Anime Cinematográfico',
    description: 'Colores vibrantes, líneas definidas, expresión dramática',
    icon: '🎌',
    category: 'animation',
    examples: ['Your Name', 'Spirited Away', 'Akira'],
    camera: {
      body: 'Virtual Camera',
      lens: 'Anime Standard',
      focalLength: '35mm equivalent',
      aperture: 'f/2.0 simulated',
    },
    style: {
      lighting: 'dramatic rim lights, lens flares, volumetric beams',
      colorPalette: ['#1a0a2e', '#ff6b9d', '#00d4ff', '#ffd700'],
      mood: 'emotional, dramatic, expressive',
      contrast: 'high',
      saturation: 'vibrant',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['dynamic low angle', 'emotional close-up', 'panoramic vista'],
      movement: ['speed lines', 'zoom burst', 'parallax scrolling'],
    },
    promptModifiers: [
      'anime style',
      'cel shading',
      'clean line art',
      'vibrant saturated colors',
      'dramatic lighting effects',
      'japanese animation aesthetic',
    ],
    negativePromptModifiers: ['photorealistic', '3D render', 'western cartoon', 'rough sketch'],
  },

  pixar: {
    id: 'pixar',
    name: 'Pixar / 3D Estilizado',
    description: 'Rendering suave, iluminación cálida, personajes expresivos',
    icon: '🎨',
    category: 'animation',
    examples: ['Coco', 'Soul', 'Ratatouille'],
    camera: {
      body: 'Virtual Cinema Camera',
      lens: 'Simulated Prime',
      focalLength: '35mm equivalent',
      aperture: 'f/2.8 simulated',
    },
    style: {
      lighting: 'soft global illumination, warm practicals, subsurface scattering',
      colorPalette: ['#2d1b4e', '#ff8c42', '#ffd166', '#06d6a0'],
      mood: 'warm, emotional, family-friendly',
      contrast: 'medium',
      saturation: 'vibrant',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['character-focused', 'environmental wide', 'emotional reaction'],
      movement: ['smooth dolly', 'crane reveal', 'gentle push'],
    },
    promptModifiers: [
      'Pixar style 3D animation',
      'stylized 3D render',
      'soft global illumination',
      'expressive characters',
      'warm color palette',
      'subsurface scattering skin',
    ],
    negativePromptModifiers: ['photorealistic', '2D flat', 'anime', 'low poly'],
  },

  stopmotion: {
    id: 'stopmotion',
    name: 'Stop Motion',
    description: 'Textura táctil, iluminación práctica, imperfecciones artesanales',
    icon: '🎭',
    category: 'animation',
    examples: ['Coraline', 'Kubo and the Two Strings', 'Isle of Dogs'],
    camera: {
      body: 'Canon EOS (Miniature)',
      lens: 'Macro Prime',
      focalLength: '50mm macro',
      aperture: 'f/8',
    },
    style: {
      lighting: 'miniature practical lights, soft diffusion, visible texture',
      colorPalette: ['#3d2c29', '#8b6b4a', '#c4a35a', '#e8dcc8'],
      mood: 'handcrafted, tactile, whimsical',
      contrast: 'medium',
      saturation: 'natural',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['eye level miniature', 'detailed close-up', 'set establishing'],
      movement: ['subtle camera shake', 'slow pan', 'static tableau'],
    },
    promptModifiers: [
      'stop motion animation',
      'handcrafted aesthetic',
      'tactile textures',
      'miniature set design',
      'visible craft imperfections',
      'practical miniature lighting',
    ],
    negativePromptModifiers: ['smooth 3D', 'digital clean', 'photorealistic', 'cel shaded'],
  },

  disney2d: {
    id: 'disney2d',
    name: '2D Clásico Disney',
    description: 'Líneas fluidas, fondos pintados, animación tradicional',
    icon: '✏️',
    category: 'animation',
    examples: ['El Rey León', 'La Bella y la Bestia', 'Aladdin'],
    camera: {
      body: 'Multiplane Camera',
      lens: 'Traditional Animation',
      focalLength: 'Variable field',
      aperture: 'N/A',
    },
    style: {
      lighting: 'painted shadows, warm highlights, theatrical',
      colorPalette: ['#1a3a5c', '#d4af37', '#8b4513', '#87ceeb'],
      mood: 'classic, theatrical, timeless',
      contrast: 'medium',
      saturation: 'vibrant',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['character centered', 'multiplane depth', 'musical staging'],
      movement: ['multiplane parallax', 'character follow', 'zoom in emotion'],
    },
    promptModifiers: [
      'classic Disney 2D animation',
      'hand-drawn animation',
      'painted backgrounds',
      'fluid character animation',
      'traditional cel animation',
      'theatrical lighting',
    ],
    negativePromptModifiers: ['3D render', 'anime style', 'modern flat design', 'rough sketch'],
  },

  spiderverse: {
    id: 'spiderverse',
    name: 'Motion Graphics / Spider-Verse',
    description: 'Estilo cómic, halftone, mezcla 2D/3D innovadora',
    icon: '💥',
    category: 'animation',
    examples: ['Spider-Verse', 'The Mitchells vs. the Machines', 'Puss in Boots 2'],
    camera: {
      body: 'Hybrid Virtual',
      lens: 'Comic Book Style',
      focalLength: 'Variable',
      aperture: 'Stylized',
    },
    style: {
      lighting: 'bold graphic shadows, neon accents, comic panel lighting',
      colorPalette: ['#000000', '#ff0055', '#00d4ff', '#ffff00'],
      mood: 'dynamic, bold, innovative',
      contrast: 'high',
      saturation: 'vibrant',
      grain: 'none',
    },
    shotDefaults: {
      avgDuration: 2,
      preferredAngles: ['dynamic action', 'comic panel framing', 'exaggerated perspective'],
      movement: ['smear frames', 'impact zoom', 'frame rate variation'],
    },
    promptModifiers: [
      'Spider-Verse animation style',
      'comic book aesthetic',
      'halftone dots',
      'bold graphic lines',
      'mixed 2D 3D hybrid',
      'frame rate variation effect',
    ],
    negativePromptModifiers: ['photorealistic', 'smooth traditional 3D', 'flat 2D', 'anime'],
  },

  arcane: {
    id: 'arcane',
    name: 'Realismo Estilizado (Arcane)',
    description: 'Hiperrealismo artístico, pinceladas visibles, iluminación dramática',
    icon: '🎮',
    category: 'animation',
    examples: ['Arcane', 'Love Death + Robots', 'The Mandalorian (CGI)'],
    camera: {
      body: 'Unreal Engine Virtual',
      lens: 'Cinematic Prime Simulated',
      focalLength: '35mm',
      aperture: 'f/1.4 simulated',
    },
    style: {
      lighting: 'painterly god rays, neon rim lights, atmospheric fog',
      colorPalette: ['#1a0a2e', '#ff6b35', '#7b2cbf', '#00b4d8'],
      mood: 'gritty, stylized, cinematic',
      contrast: 'high',
      saturation: 'vibrant',
      grain: 'subtle',
    },
    shotDefaults: {
      avgDuration: 3,
      preferredAngles: ['cinematic wide', 'intimate character', 'action dynamic'],
      movement: ['smooth virtual camera', 'dramatic crane', 'action tracking'],
    },
    promptModifiers: [
      'Arcane animation style',
      'stylized realism',
      'painterly textures',
      'visible brush strokes',
      'dramatic cinematic lighting',
      'game engine quality',
    ],
    negativePromptModifiers: ['photorealistic', 'flat cartoon', 'anime', 'low quality'],
  },
};

export function getPresetById(id: string): VisualPreset | undefined {
  return VISUAL_PRESETS[id];
}

export function getAllPresets(): VisualPreset[] {
  return Object.values(VISUAL_PRESETS);
}

export function getPresetsByCategory(category: 'live-action' | 'animation' | 'hybrid'): VisualPreset[] {
  return Object.values(VISUAL_PRESETS).filter(preset => preset.category === category);
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
