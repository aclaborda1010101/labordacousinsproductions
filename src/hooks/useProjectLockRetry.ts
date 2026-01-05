import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

interface ProjectBusyError {
  code: 'PROJECT_BUSY';
  message: string;
  retry_after_seconds: number;
  lock_reason?: string;
}

interface UseProjectLockRetryOptions {
  maxRetries?: number;
  onRetryScheduled?: (retryInSeconds: number, attemptNumber: number) => void;
  onRetryAttempt?: (attemptNumber: number) => void;
  onGiveUp?: (reason: string) => void;
}

/**
 * Hook for handling V3.0 project lock conflicts with automatic retry
 * 
 * Usage:
 * const { executeWithRetry, isWaitingForRetry, cancelRetry, retryInfo } = useProjectLockRetry();
 * 
 * const result = await executeWithRetry(
 *   () => supabase.functions.invoke('generate-script', { body: {...} }),
 *   { maxRetries: 3 }
 * );
 */
export function useProjectLockRetry(defaultOptions?: UseProjectLockRetryOptions) {
  const [isWaitingForRetry, setIsWaitingForRetry] = useState(false);
  const [retryInfo, setRetryInfo] = useState<{
    attemptNumber: number;
    retryInSeconds: number;
    scheduledAt: Date;
  } | null>(null);
  
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cancelledRef = useRef(false);

  const cancelRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    cancelledRef.current = true;
    setIsWaitingForRetry(false);
    setRetryInfo(null);
  }, []);

  const isProjectBusyError = (error: any): error is ProjectBusyError => {
    return error?.code === 'PROJECT_BUSY' && typeof error?.retry_after_seconds === 'number';
  };

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<{ data: T | null; error: any }>,
    options?: UseProjectLockRetryOptions
  ): Promise<{ data: T | null; error: any }> => {
    const opts = { ...defaultOptions, ...options };
    const maxRetries = opts.maxRetries ?? 3;
    
    cancelledRef.current = false;
    let attemptNumber = 0;

    const tryOperation = async (): Promise<{ data: T | null; error: any }> => {
      attemptNumber++;
      opts.onRetryAttempt?.(attemptNumber);

      const result = await operation();
      
      // Check if response body contains PROJECT_BUSY
      let errorData = result.error;
      
      // Handle edge function response where error might be in data
      if (!errorData && result.data && typeof result.data === 'object') {
        const dataObj = result.data as any;
        if (dataObj.code === 'PROJECT_BUSY') {
          errorData = dataObj;
        }
      }

      // If it's a PROJECT_BUSY error and we have retries left
      if (isProjectBusyError(errorData) && attemptNumber < maxRetries && !cancelledRef.current) {
        const retryInSeconds = Math.min(errorData.retry_after_seconds, 120); // Cap at 2 minutes
        
        console.log(`[ProjectLockRetry] Attempt ${attemptNumber}/${maxRetries} - Retrying in ${retryInSeconds}s`);
        
        opts.onRetryScheduled?.(retryInSeconds, attemptNumber);
        
        // Show toast notification
        toast.info(`Proyecto ocupado. Reintentando en ${retryInSeconds}s...`, {
          duration: retryInSeconds * 1000,
          id: 'project-busy-retry'
        });
        
        setIsWaitingForRetry(true);
        setRetryInfo({
          attemptNumber,
          retryInSeconds,
          scheduledAt: new Date()
        });

        // Wait and retry
        return new Promise((resolve) => {
          retryTimeoutRef.current = setTimeout(async () => {
            if (cancelledRef.current) {
              resolve({ data: null, error: { code: 'CANCELLED', message: 'Retry cancelled by user' } });
              return;
            }
            setIsWaitingForRetry(false);
            setRetryInfo(null);
            resolve(await tryOperation());
          }, retryInSeconds * 1000);
        });
      }

      // Either success, non-retryable error, or max retries reached
      if (isProjectBusyError(errorData) && attemptNumber >= maxRetries) {
        console.warn('[ProjectLockRetry] Max retries reached, giving up');
        opts.onGiveUp?.('max_retries_reached');
        toast.error('El proyecto sigue ocupado. Inténtalo más tarde.');
      }

      setIsWaitingForRetry(false);
      setRetryInfo(null);
      return result;
    };

    return tryOperation();
  }, [defaultOptions]);

  return {
    executeWithRetry,
    isWaitingForRetry,
    retryInfo,
    cancelRetry
  };
}

export type { ProjectBusyError, UseProjectLockRetryOptions };
