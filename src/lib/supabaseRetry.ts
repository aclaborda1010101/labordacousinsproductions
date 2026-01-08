import { retryWithBackoff, isRetryableError } from './retryWithBackoff';
import { PostgrestError } from '@supabase/supabase-js';

export interface QueryResult<T> {
  data: T | null;
  error: PostgrestError | Error | null;
}

/**
 * Check if a Supabase error is retryable (network issues, timeouts, 5xx errors)
 */
export function isSupabaseRetryableError(error: unknown): boolean {
  if (!error) return false;
  
  // Network/fetch errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }
  
  // PostgrestError with specific codes
  if (error && typeof error === 'object') {
    const pgError = error as PostgrestError;
    
    // Connection terminated, timeout, etc.
    if (pgError.code === '08006' || pgError.code === '08000' || pgError.code === '08003') {
      return true;
    }
    
    // Check message for common timeout patterns
    if (pgError.message?.toLowerCase().includes('timeout')) {
      return true;
    }
    if (pgError.message?.toLowerCase().includes('connection terminated')) {
      return true;
    }
    
    // HTTP status codes
    if ('status' in error) {
      const status = (error as { status: number }).status;
      return status === 429 || status >= 500;
    }
  }
  
  return isRetryableError(error);
}

/**
 * Execute a Supabase query with automatic retry on transient errors
 */
export async function withSupabaseRetry<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options: {
    maxRetries?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<QueryResult<T>> {
  const { maxRetries = 2, onRetry } = options;
  
  try {
    const result = await retryWithBackoff(
      async () => {
        const { data, error } = await queryFn();
        
        if (error && isSupabaseRetryableError(error)) {
          throw error;
        }
        
        return { data, error };
      },
      {
        maxRetries,
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffFactor: 2,
        retryOn: isSupabaseRetryableError,
        onRetry: (attempt, error, delay) => {
          console.log(`[Supabase Retry ${attempt}] Retrying in ${delay}ms...`, error);
          onRetry?.(attempt, error);
        },
      }
    );
    
    return result;
  } catch (error) {
    // All retries exhausted
    return {
      data: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Local storage cache helpers
 */
const CACHE_PREFIX = 'lc_cache_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData<T> {
  data: T;
  timestamp: number;
}

export function getCachedData<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;
    
    const parsed: CachedData<T> = JSON.parse(cached);
    const isExpired = Date.now() - parsed.timestamp > CACHE_TTL_MS;
    
    // Return cached data even if expired (for offline mode)
    // The caller can check isFresh
    return parsed.data;
  } catch {
    return null;
  }
}

export function setCachedData<T>(key: string, data: T): void {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(cached));
  } catch {
    // localStorage might be full or disabled
  }
}

export function getCacheTimestamp(key: string): Date | null {
  try {
    const cached = localStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached);
    return new Date(parsed.timestamp);
  } catch {
    return null;
  }
}

export function formatCacheTime(date: Date | null): string {
  if (!date) return '';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins}m`;
  
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
