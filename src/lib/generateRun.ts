import { supabase } from '@/integrations/supabase/client';

export interface GenerateRunPayload {
  projectId: string;
  type: 'character' | 'location' | 'keyframe';
  phase: 'exploration' | 'production';
  engine: string;
  engineSelectedBy: 'auto' | 'user' | 'recommendation';
  engineReason?: string;
  prompt: string;
  context?: string;
  params?: Record<string, unknown>;
  parentRunId?: string; // For regeneration chains
  presetId?: string; // For editorial assistant tracking
  userOverride?: boolean; // True if user chose different from recommendation
}

export interface GenerateRunResult {
  ok: boolean;
  runId?: string;
  outputUrl?: string;
  outputType?: 'image' | 'text';
  engine?: string;
  model?: string;
  generationTimeMs?: number;
  warnings?: unknown[];
  suggestions?: unknown[];
  error?: string;
  autoRetried?: boolean; // True if this was auto-retried
  autoRetryCount?: number; // Number of auto-retries attempted
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

/**
 * Check if error is transient and eligible for auto-retry
 */
function isTransientError(errorMessage: string): boolean {
  const lowerError = errorMessage.toLowerCase();
  return TRANSIENT_ERROR_PATTERNS.some(pattern => lowerError.includes(pattern.toLowerCase()));
}

/**
 * Log auto-regeneration event to editorial_events
 */
async function logAutoRegenerateEvent(
  projectId: string,
  reason: string,
  fromRunId: string,
  toRunId: string
): Promise<void> {
  try {
    await supabase.from('editorial_events').insert({
      project_id: projectId,
      event_type: 'auto_regenerated',
      asset_type: 'generation',
      run_id: toRunId,
      payload: { reason, fromRunId, toRunId }
    });
  } catch (e) {
    console.warn('[generateRun] Failed to log auto_regenerated event:', e);
  }
}

/**
 * Unified generation gateway - routes to appropriate edge function
 * and logs telemetry to generation_runs table.
 * Implements auto-retry (1x) for transient technical failures.
 */
export async function generateRun(payload: GenerateRunPayload): Promise<GenerateRunResult> {
  const executeGeneration = async (isRetry: boolean, parentRunId?: string): Promise<GenerateRunResult> => {
    try {
      const bodyPayload = isRetry 
        ? { ...payload, parentRunId, isAutoRetry: true }
        : payload;
      
      const { data, error } = await supabase.functions.invoke('generate-run', {
        body: bodyPayload
      });

      if (error) {
        console.error('[generateRun] invoke error:', error);
        return {
          ok: false,
          error: error.message || 'Failed to invoke generate-run',
          runId: data?.runId
        };
      }

      return data as GenerateRunResult;
    } catch (err) {
      console.error('[generateRun] exception:', err);
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
    const shouldRetry = isTransientError(firstResult.error) || 
                       !firstResult.outputUrl;
    
    if (shouldRetry) {
      console.log('[generateRun] Auto-retrying due to transient error:', firstResult.error);
      
      // Auto-retry once
      const retryResult = await executeGeneration(true, firstResult.runId);
      
      // Log the auto-regeneration event
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
 * Update run status (accept/reject)
 */
export async function updateRunStatus(
  runId: string, 
  status: 'accepted' | 'rejected'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generation_runs')
      .update({ status })
      .eq('id', runId);

    if (error) {
      console.error('[updateRunStatus] error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[updateRunStatus] exception:', err);
    return false;
  }
}

/**
 * Mark run as canon
 */
export async function setRunCanon(
  runId: string, 
  isCanon: boolean
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('generation_runs')
      .update({ is_canon: isCanon })
      .eq('id', runId);

    if (error) {
      console.error('[setRunCanon] error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[setRunCanon] exception:', err);
    return false;
  }
}
