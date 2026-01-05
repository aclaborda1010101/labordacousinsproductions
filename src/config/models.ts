/**
 * Centralized Image Model Configuration
 * Single source of truth for all image generation engines
 */

// Default image model for all generation
export const IMAGE_MODEL_DEFAULT = "google/gemini-3-pro-image-preview";

// Alias mapping for backward compatibility
export const IMAGE_MODEL_ALIASES: Record<string, string> = {
  "nano-banana-pro": IMAGE_MODEL_DEFAULT,
  "nano-banana": IMAGE_MODEL_DEFAULT,
  "fal-ai/nano-banana-pro": IMAGE_MODEL_DEFAULT,
  "fal-ai/nano-banana": IMAGE_MODEL_DEFAULT,
  "flux": "flux-1.1-pro-ultra",
  "flux-pro": "flux-1.1-pro-ultra",
};

/**
 * Resolves model alias to actual model ID
 * Returns default if model is empty or unknown alias
 */
export function resolveImageModel(model?: string | null): string {
  if (!model) return IMAGE_MODEL_DEFAULT;
  return IMAGE_MODEL_ALIASES[model] ?? model;
}
