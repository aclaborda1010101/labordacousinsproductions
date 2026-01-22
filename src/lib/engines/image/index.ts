/**
 * ENGINE CORE - Unified Image Engine Layer
 * Normalizes all image generation through a single interface
 */

import { supabase } from '@/integrations/supabase/client';

export type ImageEngine = 'nano-banana' | 'flux-1.1-pro-ultra';

export interface ImageEnginePayload {
  projectId: string;
  type: 'character' | 'location' | 'keyframe';
  phase: 'exploration' | 'production';
  engine: ImageEngine;
  engineSelectedBy: 'auto' | 'user' | 'recommendation' | 'autopilot';
  engineReason?: string;
  prompt: string;
  negativePrompt?: string;
  context?: string;
  params?: Record<string, unknown>;
  parentRunId?: string;
  presetId?: string;
  userOverride?: boolean;
  autopilotUsed?: boolean;
  autopilotConfidence?: number;
}

export interface ImageEngineResult {
  ok: boolean;
  runId?: string;
  outputUrl?: string;
  outputType?: 'image';
  engine?: string;
  model?: string;
  generationTimeMs?: number;
  warnings?: unknown[];
  suggestions?: unknown[];
  error?: string;
  autoRetried?: boolean;
  autoRetryCount?: number;
}

// Transient errors that warrant auto-retry
const TRANSIENT_ERROR_PATTERNS = [
  'timeout',
  'rate limit',
  'rate_limit',
  '500',
  '502',
  '503',
  '504',
  'network',
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'socket hang up',
  'temporarily unavailable',
  'service unavailable',
];

function isTransientError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern => lowerError.includes(pattern.toLowerCase()));
}

async function logAutoRegenerateEvent(
  projectId: string,
  reason: string,
  fromRunId: string,
  toRunId: string
): Promise<void> {
  // editorial_events table removed - log to console only
  console.log('[runImageEngine] auto_regenerated:', { projectId, reason, fromRunId, toRunId });
}

/**
 * Unified Image Engine - Routes to generate-run edge function
 * Implements auto-retry (1x) for transient technical failures
 */
export async function runImageEngine(payload: ImageEnginePayload): Promise<ImageEngineResult> {
  const executeGeneration = async (isRetry: boolean, parentRunId?: string): Promise<ImageEngineResult> => {
    try {
      const bodyPayload = {
        ...payload,
        parentRunId: isRetry ? parentRunId : payload.parentRunId,
        isAutoRetry: isRetry
      };
      
      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: bodyPayload
      });

      if (error) {
        console.error('[runImageEngine] invoke error:', error);
        return {
          ok: false,
          error: error.message || 'Failed to invoke generate-run',
          runId: data?.runId
        };
      }

      return data as ImageEngineResult;
    } catch (err) {
      console.error('[runImageEngine] exception:', err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error'
      };
    }
  };

  // First attempt
  const firstResult = await executeGeneration(false);

  // Check if we should auto-retry
  if (!firstResult.ok && firstResult.error && firstResult.runId) {
    const shouldRetry = isTransientError(firstResult.error) || !firstResult.outputUrl;
    
    if (shouldRetry) {
      console.log('[runImageEngine] Auto-retrying due to transient error:', firstResult.error);
      
      const retryResult = await executeGeneration(true, firstResult.runId);
      
      if (retryResult.runId) {
        await logAutoRegenerateEvent(
          payload.projectId,
          firstResult.error,
          firstResult.runId,
          retryResult.runId
        );
      }

      return {
        ...retryResult,
        autoRetried: true,
        autoRetryCount: 1
      };
    }
  }

  return firstResult;
}

/**
 * Get available image engines
 */
export function getAvailableImageEngines(): { id: ImageEngine; label: string; description: string }[] {
  return [
    {
      id: 'nano-banana',
      label: 'Nano Banana',
      description: 'Rápido, ideal para exploración y variantes'
    },
    {
      id: 'flux-1.1-pro-ultra',
      label: 'FLUX Pro Ultra',
      description: 'Alta calidad, ideal para producción y canon'
    }
  ];
}
