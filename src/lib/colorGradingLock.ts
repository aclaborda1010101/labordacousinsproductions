/**
 * COLOR GRADING LOCK SYSTEM
 * Ensures consistent color palette across all keyframes and micro-shots in a scene
 */

export interface ColorGradingLock {
  id: string;
  sceneId: string;
  projectId: string;
  
  // Primary palette - extracted from reference or first keyframe
  dominantColors: string[]; // 5 hex colors
  
  // Tonal mapping
  shadows: {
    color: string;
    density: 'light' | 'medium' | 'deep';
  };
  midtones: {
    color: string;
    saturation: 'muted' | 'natural' | 'rich';
  };
  highlights: {
    color: string;
    intensity: 'soft' | 'medium' | 'bright';
  };
  
  // Color temperature
  temperature: {
    kelvin: number; // 2700-10000
    tint: number; // -100 to +100 (green to magenta)
  };
  
  // Contrast and saturation
  contrast: {
    level: 'low' | 'medium' | 'high';
    curve: 'linear' | 's-curve' | 'lifted-blacks';
  };
  saturation: {
    global: number; // -100 to +100
    vibrancy: number; // -100 to +100
  };
  
  // LUT reference (if applicable)
  lutReference?: string;
  
  // Creation metadata
  sourceKeyframeId?: string;
  sourceImageUrl?: string;
  createdAt: string;
}

/**
 * Analyze an image and extract color grading parameters
 * This is a client-side approximation - full analysis happens server-side
 */
export function estimateColorProfile(imageUrl: string): Promise<Partial<ColorGradingLock>> {
  // Note: Full implementation requires server-side image analysis
  // This returns reasonable defaults for client-side use
  return Promise.resolve({
    dominantColors: ['#2a2a2a', '#5a5a5a', '#8a8a8a', '#bababa', '#eaeaea'],
    shadows: { color: '#1a1a2e', density: 'medium' },
    midtones: { color: '#4a4a4a', saturation: 'natural' },
    highlights: { color: '#f0f0f0', intensity: 'medium' },
    temperature: { kelvin: 5600, tint: 0 },
    contrast: { level: 'medium', curve: 's-curve' },
    saturation: { global: 0, vibrancy: 10 },
  });
}

/**
 * Generate color grading prompt injection for keyframe generation
 */
export function buildColorGradingPrompt(lock: ColorGradingLock): string {
  const kelvinDesc = lock.temperature.kelvin < 4000 
    ? 'warm tungsten' 
    : lock.temperature.kelvin < 5500 
    ? 'neutral daylight' 
    : 'cool blue';
  
  return `
=== COLOR GRADING LOCK (MANDATORY) ===
DOMINANT PALETTE: ${lock.dominantColors.join(', ')}
These colors must be present in the frame.

TONAL MAPPING:
- Shadows: ${lock.shadows.color} (${lock.shadows.density} density)
- Midtones: ${lock.midtones.color} (${lock.midtones.saturation} saturation)
- Highlights: ${lock.highlights.color} (${lock.highlights.intensity} intensity)

COLOR TEMPERATURE: ${lock.temperature.kelvin}K (${kelvinDesc})
${lock.temperature.tint !== 0 ? `Tint shift: ${lock.temperature.tint > 0 ? 'magenta' : 'green'} ${Math.abs(lock.temperature.tint)}%` : ''}

CONTRAST: ${lock.contrast.level} (${lock.contrast.curve} response)
SATURATION: Global ${lock.saturation.global >= 0 ? '+' : ''}${lock.saturation.global}%, Vibrancy ${lock.saturation.vibrancy >= 0 ? '+' : ''}${lock.saturation.vibrancy}%

${lock.lutReference ? `LUT REFERENCE: ${lock.lutReference}` : ''}

CRITICAL: Every keyframe in this scene MUST match this color profile.
No color drift allowed between keyframes.
=== END COLOR GRADING ===
`;
}

/**
 * Presets for common film looks
 */
export const COLOR_GRADING_PRESETS: Record<string, Omit<ColorGradingLock, 'id' | 'sceneId' | 'projectId' | 'createdAt'>> = {
  // Cinematic Film
  cinematic_film: {
    dominantColors: ['#1a1a2e', '#3d3d5c', '#6b6b8a', '#9e9eb8', '#d1d1e6'],
    shadows: { color: '#0a0a1e', density: 'deep' },
    midtones: { color: '#4a4a5a', saturation: 'natural' },
    highlights: { color: '#f5f5ff', intensity: 'soft' },
    temperature: { kelvin: 5200, tint: 5 },
    contrast: { level: 'medium', curve: 's-curve' },
    saturation: { global: -10, vibrancy: 15 },
  },
  
  // Warm Golden Hour
  golden_hour: {
    dominantColors: ['#1a1008', '#4a3018', '#8b5a2b', '#d4a054', '#ffe4b5'],
    shadows: { color: '#1a1008', density: 'medium' },
    midtones: { color: '#8b5a2b', saturation: 'rich' },
    highlights: { color: '#ffe4b5', intensity: 'bright' },
    temperature: { kelvin: 3200, tint: 10 },
    contrast: { level: 'medium', curve: 's-curve' },
    saturation: { global: 20, vibrancy: 30 },
  },
  
  // Cool Blue Hour
  blue_hour: {
    dominantColors: ['#0a1628', '#1a3a5c', '#3a6a9c', '#5a9adc', '#8acaff'],
    shadows: { color: '#0a1628', density: 'deep' },
    midtones: { color: '#3a6a9c', saturation: 'natural' },
    highlights: { color: '#c0e0ff', intensity: 'soft' },
    temperature: { kelvin: 7500, tint: -10 },
    contrast: { level: 'low', curve: 'lifted-blacks' },
    saturation: { global: -5, vibrancy: 10 },
  },
  
  // High Key Bright
  high_key: {
    dominantColors: ['#f0f0f0', '#e0e0e0', '#d0d0d0', '#c0c0c0', '#b0b0b0'],
    shadows: { color: '#808080', density: 'light' },
    midtones: { color: '#c0c0c0', saturation: 'muted' },
    highlights: { color: '#ffffff', intensity: 'bright' },
    temperature: { kelvin: 5600, tint: 0 },
    contrast: { level: 'low', curve: 'linear' },
    saturation: { global: -20, vibrancy: 0 },
  },
  
  // Low Key Noir
  low_key_noir: {
    dominantColors: ['#0a0a0a', '#1a1a1a', '#2a2a2a', '#4a4a4a', '#8a8a8a'],
    shadows: { color: '#000000', density: 'deep' },
    midtones: { color: '#2a2a2a', saturation: 'muted' },
    highlights: { color: '#c0c0c0', intensity: 'soft' },
    temperature: { kelvin: 4500, tint: 0 },
    contrast: { level: 'high', curve: 's-curve' },
    saturation: { global: -60, vibrancy: -20 },
  },
  
  // Teal and Orange
  teal_orange: {
    dominantColors: ['#0a3a3a', '#2a6a6a', '#ff8c42', '#ffc07a', '#005050'],
    shadows: { color: '#0a2a2a', density: 'medium' },
    midtones: { color: '#3a6a6a', saturation: 'rich' },
    highlights: { color: '#ffc07a', intensity: 'medium' },
    temperature: { kelvin: 5000, tint: 0 },
    contrast: { level: 'high', curve: 's-curve' },
    saturation: { global: 30, vibrancy: 40 },
  },
  
  // Vintage Film
  vintage_film: {
    dominantColors: ['#2a2018', '#5a4a38', '#8a7a68', '#bab098', '#eae0c8'],
    shadows: { color: '#1a1810', density: 'medium' },
    midtones: { color: '#7a6a58', saturation: 'muted' },
    highlights: { color: '#f0e8d8', intensity: 'soft' },
    temperature: { kelvin: 4000, tint: 15 },
    contrast: { level: 'low', curve: 'lifted-blacks' },
    saturation: { global: -20, vibrancy: -10 },
  },
  
  // Neon Cyberpunk
  neon_cyberpunk: {
    dominantColors: ['#0a0a1a', '#1a0a2e', '#ff00ff', '#00ffff', '#ff0080'],
    shadows: { color: '#0a0a1a', density: 'deep' },
    midtones: { color: '#2a1a3e', saturation: 'rich' },
    highlights: { color: '#ff80ff', intensity: 'bright' },
    temperature: { kelvin: 6500, tint: 20 },
    contrast: { level: 'high', curve: 's-curve' },
    saturation: { global: 50, vibrancy: 60 },
  },
};

/**
 * Get a color grading preset by ID
 */
export function getColorGradingPreset(presetId: string): Omit<ColorGradingLock, 'id' | 'sceneId' | 'projectId' | 'createdAt'> | undefined {
  return COLOR_GRADING_PRESETS[presetId];
}

/**
 * Create a complete ColorGradingLock from a preset
 */
export function createColorLockFromPreset(
  presetId: string,
  sceneId: string,
  projectId: string
): ColorGradingLock | undefined {
  const preset = COLOR_GRADING_PRESETS[presetId];
  if (!preset) return undefined;
  
  return {
    ...preset,
    id: `lock_${Date.now()}`,
    sceneId,
    projectId,
    createdAt: new Date().toISOString(),
  };
}

export default COLOR_GRADING_PRESETS;
