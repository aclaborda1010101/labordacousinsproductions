/**
 * ANTI-AI TELLS SYSTEM
 * Eliminates common AI generation artifacts for professional film quality
 */

export const ANTI_AI_TELLS = {
  /**
   * Modifiers to inject into prompts to ensure photorealistic quality
   */
  promptModifiers: {
    // Skin texture
    skin: [
      'visible skin pores at appropriate distance',
      'natural skin imperfections',
      'subtle skin texture variations',
      'no airbrushed skin',
      'realistic subsurface scattering',
      'natural skin tone variations including subtle redness and vein patterns',
    ],
    
    // Eye realism
    eyes: [
      'realistic ambient light reflections in eyes',
      'subtle sclera veins',
      'natural asymmetry between eyes',
      'iris color and texture variations',
      'no perfect circular catchlights',
      'bloodshot details appropriate to character state',
    ],
    
    // Hair naturalism
    hair: [
      'natural flyaway hair strands',
      'hair thickness and direction variations',
      'coherent light reflections on hair',
      'individual hair strand visibility',
      'not perfectly styled unless character demands it',
    ],
    
    // Lighting authenticity
    lighting: [
      'coherent with established light source',
      'variable shadow edge softness',
      'ambient color spill from environment',
      'natural light falloff',
      'motivated practical lighting',
      'no uniform flat lighting',
    ],
    
    // Texture realism
    textures: [
      'clothing wrinkles and natural folds',
      'appropriate fabric wear patterns',
      'surface dust or fingerprints where natural',
      'material-appropriate shininess variation',
      'not pristine clean unless narratively motivated',
    ],
    
    // Composition naturalism
    composition: [
      'natural asymmetric composition',
      'intentional negative space',
      'not perfectly centered unless narratively motivated',
      'depth of field appropriate to focal length',
    ],
  },
  
  /**
   * Negative prompts to block AI artifacts
   */
  negativePrompts: {
    // Core anti-AI blocks
    core: [
      'smooth plastic skin',
      'poreless skin',
      'airbrushed face',
      'perfectly symmetrical face',
      'overly bright eyes',
      'uniform lighting without falloff',
      'perfectly clean textures',
      'stock photo look',
      'CGI render appearance',
      'wax figure look',
      'mannequin appearance',
      'uncanny valley',
      'video game graphics',
      'hyper-smooth skin',
    ],
    
    // Technical artifacts
    technical: [
      'jpeg artifacts',
      'visible noise pattern',
      'watermark',
      'text overlay',
      'border frame',
      'vignette filter',
      'chromatic aberration artifacts',
      'banding',
      'posterization',
    ],
    
    // Composition flaws
    composition: [
      'centered composition',
      'amateur framing',
      'snapshot aesthetic',
      'flat depth',
      'missing background detail',
    ],
    
    // AI-specific tells
    aiTells: [
      'extra fingers',
      'deformed hands',
      'asymmetric clothing',
      'floating objects',
      'merged body parts',
      'inconsistent shadows',
      'multiple light sources without motivation',
      'blurry background with sharp subject only',
    ],
  },
  
  /**
   * Build the full anti-AI prompt injection
   */
  buildPromptInjection(category: 'live-action' | 'animation'): string {
    if (category === 'animation') {
      return `
=== ANIMATION QUALITY MANDATE ===
STYLE CONSISTENCY:
- Maintain exact line weight throughout
- Color palette locked to style guide
- Shading style must be uniform (cel, gradient, or painterly - pick one)
- Character proportions must be model-sheet accurate

ANIMATION-SPECIFIC AVOIDS:
- No style mixing (anime + western, 2D + 3D unless intentional)
- No inconsistent line quality
- No color banding in gradients
- No unintentional brush stroke visibility

FRAME QUALITY:
- Clean vector-quality lines for 2D
- Consistent subsurface scattering for 3D
- Proper anti-aliasing on all edges
=== END ANIMATION QUALITY ===
`;
    }
    
    // Live-action photorealism
    const skinRules = this.promptModifiers.skin.join(', ');
    const eyeRules = this.promptModifiers.eyes.join(', ');
    const hairRules = this.promptModifiers.hair.join(', ');
    const lightRules = this.promptModifiers.lighting.join(', ');
    const textureRules = this.promptModifiers.textures.join(', ');
    const compRules = this.promptModifiers.composition.join(', ');
    
    return `
=== PHOTOGRAPHIC REALISM MANDATE ===
SKIN: ${skinRules}

EYES: ${eyeRules}

HAIR: ${hairRules}

LIGHTING: ${lightRules}

TEXTURES: ${textureRules}

COMPOSITION: ${compRules}
=== END REALISM MANDATE ===
`;
  },
  
  /**
   * Build comprehensive negative prompt
   */
  buildNegativePrompt(additionalNegatives?: string[]): string {
    const allNegatives = [
      ...this.negativePrompts.core,
      ...this.negativePrompts.technical,
      ...this.negativePrompts.composition,
      ...this.negativePrompts.aiTells,
      ...(additionalNegatives || []),
    ];
    
    // Remove duplicates and join
    return [...new Set(allNegatives)].join(', ');
  },
  
  /**
   * Genre-specific anti-AI configurations
   */
  genreConfigs: {
    drama: {
      skinEmphasis: 'high',
      eyeDetail: 'realistic reflections of practicals, not ring lights',
      hairStyle: 'natural flyaways, character-appropriate',
      clothingWear: 'lived-in, character-appropriate wear patterns',
      lightingNote: 'motivated by visible or implied sources',
    },
    action: {
      skinEmphasis: 'medium with sweat and dirt',
      eyeDetail: 'dilated pupils, adrenaline-appropriate',
      hairStyle: 'disheveled from action',
      clothingWear: 'damaged, dirty, torn where story-appropriate',
      lightingNote: 'high contrast, practical explosions and fires',
    },
    horror: {
      skinEmphasis: 'pale, sickly undertones acceptable',
      eyeDetail: 'fear-widened, bloodshot acceptable',
      hairStyle: 'disheveled, wet, or matted',
      clothingWear: 'degraded, stained where appropriate',
      lightingNote: 'low key, harsh shadows, motivated by flashlights or practicals',
    },
    comedy: {
      skinEmphasis: 'natural but flattering',
      eyeDetail: 'expressive, well-lit for reactions',
      hairStyle: 'can be stylized for character comedy',
      clothingWear: 'clean but character-appropriate',
      lightingNote: 'high key, even, flattering',
    },
    scifi: {
      skinEmphasis: 'can have subtle futuristic elements',
      eyeDetail: 'can reflect technology interfaces',
      hairStyle: 'stylized futuristic acceptable',
      clothingWear: 'clean and uniform for tech settings',
      lightingNote: 'cool LED sources, holographic spill acceptable',
    },
    fantasy: {
      skinEmphasis: 'can have otherworldly qualities',
      eyeDetail: 'can have magical reflections',
      hairStyle: 'can be stylized for magical beings',
      clothingWear: 'period-appropriate wear patterns',
      lightingNote: 'magical sources acceptable, but must be consistent',
    },
    animation: {
      skinEmphasis: 'style-consistent rendering',
      eyeDetail: 'style-appropriate expressiveness',
      hairStyle: 'volume and movement per animation style',
      clothingWear: 'style-appropriate detail level',
      lightingNote: 'painterly or cel-shaded as per style guide',
    },
  } as Record<string, {
    skinEmphasis: string;
    eyeDetail: string;
    hairStyle: string;
    clothingWear: string;
    lightingNote: string;
  }>,
};

/**
 * Get anti-AI configuration for a specific genre
 */
export function getAntiAIConfigForGenre(genre: string): typeof ANTI_AI_TELLS.genreConfigs.drama {
  return ANTI_AI_TELLS.genreConfigs[genre] || ANTI_AI_TELLS.genreConfigs.drama;
}

/**
 * Inject anti-AI tells into an existing prompt
 */
export function injectAntiAITells(
  prompt: string,
  category: 'live-action' | 'animation' = 'live-action',
  genre?: string
): string {
  const antiAIBlock = ANTI_AI_TELLS.buildPromptInjection(category);
  
  // Add genre-specific config if provided
  let genreBlock = '';
  if (genre && ANTI_AI_TELLS.genreConfigs[genre]) {
    const config = ANTI_AI_TELLS.genreConfigs[genre];
    genreBlock = `
=== GENRE-SPECIFIC QUALITY (${genre.toUpperCase()}) ===
Skin emphasis: ${config.skinEmphasis}
Eye detail: ${config.eyeDetail}
Hair style: ${config.hairStyle}
Clothing wear: ${config.clothingWear}
Lighting note: ${config.lightingNote}
=== END GENRE QUALITY ===
`;
  }
  
  return `${prompt}\n\n${antiAIBlock}${genreBlock}`;
}

export default ANTI_AI_TELLS;
