/**
 * Video Provider Selector
 * Automatically selects the optimal video generation engine based on:
 * - User preference (provider_preference)
 * - A→B availability (keyframeTailUrl support)
 * - Configured providers (API keys available)
 * 
 * Priority for A→B transitions:
 * 1. Kling v2 (best quality, native image + image_tail)
 * 2. Runway Gen-3 (native promptImage + promptEndImage)
 * 3. Veo 3.1 (fallback, chaining only - no native A→B)
 */

export type VideoEngine = 'kling' | 'runway' | 'veo';

export interface ProviderCapabilities {
  supportsAtoB: boolean;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  maxDurationSec: number;
  qualityTier: 'premium' | 'standard' | 'fast';
}

export const PROVIDER_CAPABILITIES: Record<VideoEngine, ProviderCapabilities> = {
  kling: {
    supportsAtoB: true,
    supportsTextToVideo: false, // v2 requires keyframe
    supportsImageToVideo: true,
    maxDurationSec: 10,
    qualityTier: 'premium'
  },
  runway: {
    supportsAtoB: true,
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    maxDurationSec: 10,
    qualityTier: 'premium'
  },
  veo: {
    supportsAtoB: false, // Only supports keyframeUrl, no tail
    supportsTextToVideo: true,
    supportsImageToVideo: true,
    maxDurationSec: 8,
    qualityTier: 'premium'
  }
};

export interface ShotContext {
  provider_preference: 'auto' | VideoEngine;
  is_hero?: boolean;
  shot_type?: string;
  duration_sec?: number;
}

export interface SelectionResult {
  engine: VideoEngine;
  reason: string;
  supportsAtoB: boolean;
  fallbackChain: VideoEngine[];
}

/**
 * Select the optimal video provider for a shot/microshot
 * 
 * @param shot - Shot context with preferences
 * @param hasEndFrame - Whether an end keyframe is available for A→B
 * @param configuredProviders - List of providers with valid API keys
 * @returns Selected engine with reasoning
 */
export function selectVideoProvider(
  shot: ShotContext,
  hasEndFrame: boolean,
  configuredProviders: VideoEngine[] = ['kling', 'runway', 'veo']
): SelectionResult {
  const available = configuredProviders.filter(p => 
    PROVIDER_CAPABILITIES[p] !== undefined
  );

  // 1. Respect explicit user preference
  if (shot.provider_preference !== 'auto') {
    const preferred = shot.provider_preference;
    if (available.includes(preferred)) {
      return {
        engine: preferred,
        reason: `User preference: ${preferred}`,
        supportsAtoB: PROVIDER_CAPABILITIES[preferred].supportsAtoB,
        fallbackChain: available.filter(p => p !== preferred)
      };
    }
  }

  // 2. A→B mode: prioritize engines with native support
  if (hasEndFrame) {
    if (available.includes('kling')) {
      return {
        engine: 'kling',
        reason: 'A→B transition with Kling (native image + image_tail)',
        supportsAtoB: true,
        fallbackChain: (['runway', 'veo'] as VideoEngine[]).filter(p => available.includes(p))
      };
    }
    
    if (available.includes('runway')) {
      return {
        engine: 'runway',
        reason: 'A→B transition with Runway (native promptImage + promptEndImage)',
        supportsAtoB: true,
        fallbackChain: (['veo'] as VideoEngine[]).filter(p => available.includes(p))
      };
    }
  }

  // 3. Hero shots with realism preference -> Veo
  if (shot.is_hero && available.includes('veo')) {
    return {
      engine: 'veo',
      reason: 'Hero shot prioritizing Veo for realism',
      supportsAtoB: false,
      fallbackChain: (['kling', 'runway'] as VideoEngine[]).filter(p => available.includes(p))
    };
  }

  // 4. Default: use Kling if available
  if (available.includes('kling')) {
    return {
      engine: 'kling',
      reason: 'Default selection: Kling v2 (premium quality)',
      supportsAtoB: true,
      fallbackChain: (['runway', 'veo'] as VideoEngine[]).filter(p => available.includes(p))
    };
  }

  // 5. Fallback to Runway
  if (available.includes('runway')) {
    return {
      engine: 'runway',
      reason: 'Fallback to Runway Gen-3',
      supportsAtoB: true,
      fallbackChain: (['veo'] as VideoEngine[]).filter(p => available.includes(p))
    };
  }

  // 6. Last resort: Veo
  return {
    engine: 'veo',
    reason: 'Last resort: Veo 3.1',
    supportsAtoB: false,
    fallbackChain: []
  };
}

/**
 * Check if a provider supports the required features for a shot
 */
export function canProviderHandleShot(
  engine: VideoEngine,
  hasStartFrame: boolean,
  hasEndFrame: boolean
): { supported: boolean; reason?: string } {
  const caps = PROVIDER_CAPABILITIES[engine];
  
  if (!caps) {
    return { supported: false, reason: `Unknown engine: ${engine}` };
  }

  // Kling v2 requires start frame
  if (engine === 'kling' && !hasStartFrame) {
    return { 
      supported: false, 
      reason: 'Kling v2 requires a start keyframe (image2video)' 
    };
  }

  // All engines can work without end frame (chaining mode)
  if (hasEndFrame && !caps.supportsAtoB) {
    // Not an error, just won't use A→B
    return { 
      supported: true, 
      reason: `${engine} will use chaining (no native A→B support)` 
    };
  }

  return { supported: true };
}

/**
 * Get recommended microshot duration based on provider
 */
export function getRecommendedMicroDuration(engine: VideoEngine): number {
  switch (engine) {
    case 'kling':
      return 2; // Kling works best with 2-5s segments
    case 'runway':
      return 2; // Runway Gen-3 optimal at 2-4s
    case 'veo':
      return 3; // Veo can handle slightly longer segments
    default:
      return 2;
  }
}

/**
 * Generate a fixed seed for a shot to ensure consistency
 */
export function generateShotSeed(shotId: string): number {
  // Simple hash of shot ID to get deterministic seed
  let hash = 0;
  for (let i = 0; i < shotId.length; i++) {
    const char = shotId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash) % 2147483647; // Keep within int32 range
}
