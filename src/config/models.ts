/**
 * Centralized Image Model Configuration
 * Single source of truth for all image generation engines
 * 
 * ARCHITECTURE (Executive Producer + AI CTO recommendations):
 * - Characters/Keyframes: Nano Banana (gemini-2.5-flash-image) for identity consistency
 * - Locations: FLUX for spatial composition and cinematic environments
 * - Props: Nano Banana for detail consistency
 */

// Real Nano Banana model for character identity consistency
export const IMAGE_MODEL_NANO_BANANA = "google/gemini-2.5-flash-image";

// FLUX for locations - better spatial composition
export const IMAGE_MODEL_FLUX = "flux-1.1-pro-ultra";

// Default for general use (characters, props, keyframes)
export const IMAGE_MODEL_DEFAULT = IMAGE_MODEL_NANO_BANANA;

// Alias mapping for backward compatibility
export const IMAGE_MODEL_ALIASES: Record<string, string> = {
  // Nano Banana aliases -> Real nano banana
  "nano-banana": IMAGE_MODEL_NANO_BANANA,
  "nano-banana-pro": IMAGE_MODEL_NANO_BANANA,
  "fal-ai/nano-banana": IMAGE_MODEL_NANO_BANANA,
  "fal-ai/nano-banana-pro": IMAGE_MODEL_NANO_BANANA,
  
  // FLUX aliases for locations/concept art
  "flux": IMAGE_MODEL_FLUX,
  "flux-pro": IMAGE_MODEL_FLUX,
  "flux-ultra": IMAGE_MODEL_FLUX,
};

/**
 * Resolves model alias to actual model ID
 * Returns default if model is empty or unknown alias
 */
export function resolveImageModel(model?: string | null): string {
  if (!model) return IMAGE_MODEL_DEFAULT;
  return IMAGE_MODEL_ALIASES[model] ?? model;
}
