/**
 * Retry utility with exponential backoff
 * Used for API calls that may fail due to rate limits or transient errors
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  retryOn?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  retryOn: () => true,
  onRetry: () => {}
};

/**
 * Execute a function with automatic retry and exponential backoff
 * 
 * @example
 * const result = await retryWithBackoff(
 *   () => fetch('/api/generate'),
 *   { 
 *     maxRetries: 3,
 *     retryOn: (err) => err.status === 429 || err.status >= 500
 *   }
 * );
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt >= opts.maxRetries || !opts.retryOn(error)) {
        throw error;
      }

      // Calculate next delay with jitter
      const jitter = Math.random() * 0.3 * delay; // 0-30% jitter
      const nextDelay = Math.min(delay + jitter, opts.maxDelayMs);

      // Notify about retry
      opts.onRetry(attempt + 1, error, nextDelay);

      // Wait before next attempt
      await sleep(nextDelay);

      // Increase delay for next iteration
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (rate limit or server error)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Response) {
    return error.status === 429 || error.status >= 500;
  }
  
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 429 || status >= 500;
  }

  // Retry on network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  return false;
}

/**
 * Create a retryable fetch function
 * 
 * @example
 * const fetchWithRetry = createRetryableFetch({ maxRetries: 3 });
 * const response = await fetchWithRetry('/api/generate', { method: 'POST' });
 */
export function createRetryableFetch(options: RetryOptions = {}) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    return retryWithBackoff(
      async () => {
        const response = await fetch(input, init);
        
        // Throw on error responses so retry logic can handle them
        if (!response.ok && isRetryableError({ status: response.status })) {
          throw { status: response.status, response };
        }
        
        return response;
      },
      {
        ...options,
        retryOn: options.retryOn || isRetryableError,
        onRetry: (attempt, error, delay) => {
          console.log(`[Retry ${attempt}] Retrying in ${delay}ms...`, error);
          options.onRetry?.(attempt, error, delay);
        }
      }
    );
  };
}

/**
 * Graceful degradation helper
 * Returns fallback value if all retries fail
 * 
 * @example
 * const data = await withFallback(
 *   () => fetchUserData(userId),
 *   { name: 'Unknown', avatar: null },
 *   { maxRetries: 2 }
 * );
 */
export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  options: RetryOptions = {}
): Promise<T> {
  try {
    return await retryWithBackoff(fn, options);
  } catch (error) {
    console.warn('All retries failed, using fallback:', error);
    return fallback;
  }
}

/**
 * Rate limit aware fetch with automatic waiting
 */
export async function rateLimitAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const retryableFetch = createRetryableFetch({
    ...options,
    onRetry: (attempt, error, delay) => {
      if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status === 429) {
          console.log(`Rate limited. Waiting ${delay}ms before retry ${attempt}...`);
        }
      }
      options.onRetry?.(attempt, error, delay);
    }
  });

  return retryableFetch(input, init);
}

export default retryWithBackoff;
