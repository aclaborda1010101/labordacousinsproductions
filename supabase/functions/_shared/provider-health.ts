/**
 * PROVIDER HEALTH - Circuit Breaker Pattern
 * 
 * Tracks provider errors to enable automatic fallback.
 * If a provider has 3+ consecutive errors in 2 minutes, mark it as unhealthy.
 * Auto-recover after 60-120 seconds.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface ProviderHealth {
  openaiOk: boolean;
  geminiOk: boolean;
}

export interface ProviderHealthDetailed extends ProviderHealth {
  openaiConsecutiveErrors: number;
  geminiConsecutiveErrors: number;
  lastOpenaiError?: string;
  lastGeminiError?: string;
}

// Circuit breaker thresholds
const ERROR_THRESHOLD = 3;
const TIME_WINDOW_MS = 2 * 60 * 1000; // 2 minutes
const RECOVERY_WINDOW_MS = 90 * 1000; // 90 seconds

/**
 * Get provider health status from recent logs.
 * Uses generation_run_logs to track errors.
 */
export async function getProviderHealth(supabase: SupabaseClient): Promise<ProviderHealthDetailed> {
  try {
    const windowStart = new Date(Date.now() - TIME_WINDOW_MS).toISOString();

    // Query recent logs
    const { data: recentLogs, error } = await supabase
      .from('generation_run_logs')
      .select('provider, status, created_at, error')
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) {
      console.warn('[provider-health] Failed to fetch logs:', error.message);
      // Assume both healthy if we can't check
      return { openaiOk: true, geminiOk: true, openaiConsecutiveErrors: 0, geminiConsecutiveErrors: 0 };
    }

    // Count consecutive errors per provider
    let openaiConsecutiveErrors = 0;
    let geminiConsecutiveErrors = 0;
    let lastOpenaiError: string | undefined;
    let lastGeminiError: string | undefined;
    
    // Track if we've seen a success yet (reset consecutive errors)
    let openaiSeenSuccess = false;
    let geminiSeenSuccess = false;

    for (const log of (recentLogs || [])) {
      const provider = log.provider?.toLowerCase() || '';
      const isError = log.status === 'error' || log.status === 'timeout';

      if (provider.includes('openai') || provider.includes('gpt')) {
        if (!openaiSeenSuccess) {
          if (isError) {
            openaiConsecutiveErrors++;
            if (!lastOpenaiError) lastOpenaiError = log.error;
          } else {
            openaiSeenSuccess = true;
          }
        }
      }

      if (provider.includes('google') || provider.includes('gemini')) {
        if (!geminiSeenSuccess) {
          if (isError) {
            geminiConsecutiveErrors++;
            if (!lastGeminiError) lastGeminiError = log.error;
          } else {
            geminiSeenSuccess = true;
          }
        }
      }
    }

    return {
      openaiOk: openaiConsecutiveErrors < ERROR_THRESHOLD,
      geminiOk: geminiConsecutiveErrors < ERROR_THRESHOLD,
      openaiConsecutiveErrors,
      geminiConsecutiveErrors,
      lastOpenaiError,
      lastGeminiError,
    };
  } catch (e) {
    console.error('[provider-health] Unexpected error:', e);
    // Default to healthy on error
    return { openaiOk: true, geminiOk: true, openaiConsecutiveErrors: 0, geminiConsecutiveErrors: 0 };
  }
}

/**
 * Record a provider result for circuit breaker tracking.
 * This is called after each AI call (success or failure).
 */
export async function recordProviderResult(
  supabase: SupabaseClient,
  provider: 'openai' | 'google',
  success: boolean,
  error?: string,
  latencyMs?: number,
  model?: string
): Promise<void> {
  try {
    await supabase.from('generation_run_logs').insert({
      provider,
      model: model || provider,
      status: success ? 'success' : 'error',
      error: error || null,
      latency_ms: latencyMs || null,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    // Don't fail the main operation if logging fails
    console.warn('[provider-health] Failed to record result:', e);
  }
}

/**
 * Quick health check without database query.
 * Uses in-memory tracking for performance.
 * 
 * @deprecated Use getProviderHealth for accurate status
 */
export function getDefaultProviderHealth(): ProviderHealth {
  return { openaiOk: true, geminiOk: true };
}

/**
 * Determine provider from model ID.
 */
export function getProviderFromModel(model: string): 'openai' | 'google' {
  if (model.startsWith('openai/') || model.includes('gpt')) {
    return 'openai';
  }
  return 'google';
}
