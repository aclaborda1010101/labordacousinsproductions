import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type BackendStatus = 'online' | 'degraded' | 'offline';

interface BackendStatusState {
  status: BackendStatus;
  lastCheckedAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
}

interface UseBackendStatusOptions {
  pollIntervalMs?: number;
  maxConsecutiveFailures?: number;
}

const INITIAL_STATE: BackendStatusState = {
  status: 'online',
  lastCheckedAt: null,
  lastError: null,
  consecutiveFailures: 0,
};

export function useBackendStatus(options: UseBackendStatusOptions = {}) {
  const { pollIntervalMs = 30000, maxConsecutiveFailures = 3 } = options;
  
  const [state, setState] = useState<BackendStatusState>(INITIAL_STATE);
  const [isChecking, setIsChecking] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef(1000);

  const checkHealth = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    const startTime = Date.now();
    
    try {
      // Simple health check - try to fetch 1 project
      const { error } = await supabase
        .from('projects')
        .select('id')
        .limit(1)
        .maybeSingle();

      const responseTime = Date.now() - startTime;
      
      if (error) {
        throw error;
      }

      // Success - reset backoff
      backoffRef.current = 1000;
      
      setState({
        status: responseTime > 3000 ? 'degraded' : 'online',
        lastCheckedAt: new Date(),
        lastError: null,
        consecutiveFailures: 0,
      });
      
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      setState((prev) => {
        const newFailures = prev.consecutiveFailures + 1;
        return {
          status: newFailures >= maxConsecutiveFailures ? 'offline' : 'degraded',
          lastCheckedAt: new Date(),
          lastError: errorMessage,
          consecutiveFailures: newFailures,
        };
      });
      
      // Increase backoff (max 30s)
      backoffRef.current = Math.min(backoffRef.current * 2, 30000);
      
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [maxConsecutiveFailures]);

  const retry = useCallback(async () => {
    backoffRef.current = 1000;
    return checkHealth();
  }, [checkHealth]);

  // Initial check on mount
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Polling with backoff when offline
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = state.status === 'offline' 
      ? Math.min(backoffRef.current, pollIntervalMs)
      : pollIntervalMs;

    intervalRef.current = setInterval(checkHealth, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkHealth, pollIntervalMs, state.status]);

  return {
    ...state,
    isChecking,
    retry,
    isOnline: state.status === 'online',
    isOffline: state.status === 'offline',
  };
}
