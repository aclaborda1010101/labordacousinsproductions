/**
 * Helper to invoke backend functions with a custom timeout.
 *
 * NOTE: This uses fetch directly because supabase.functions.invoke doesn't expose timeout/AbortSignal.
 */
import { supabase } from '@/integrations/supabase/client';

export type InvokeWithTimeoutOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

export async function invokeWithTimeout<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMsOrOptions: number | InvokeWithTimeoutOptions = 120000
): Promise<{ data: T | null; error: Error | null }> {
  const options: InvokeWithTimeoutOptions =
    typeof timeoutMsOrOptions === 'number' ? { timeoutMs: timeoutMsOrOptions } : timeoutMsOrOptions;

  const timeoutMs = options.timeoutMs ?? 120000;
  const externalSignal = options.signal;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Try to get current session first
  let {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  // If session exists but might be expired, try to refresh
  if (session) {
    const expiresAt = session.expires_at ?? 0;
    const now = Math.floor(Date.now() / 1000);
    const bufferSeconds = 60; // Refresh if expiring within 60s
    
    if (expiresAt - now < bufferSeconds) {
      console.log('[invokeWithTimeout] Session expiring soon, refreshing...');
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session) {
        session = refreshData.session;
        console.log('[invokeWithTimeout] Session refreshed successfully');
      } else {
        console.warn('[invokeWithTimeout] Failed to refresh session:', refreshError?.message);
      }
    }
  }

  if (sessionError) {
    return { data: null, error: new Error(sessionError.message) };
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    return { data: null, error: new Error('Sesión no válida. Vuelve a iniciar sesión.') };
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText || `HTTP ${response.status}`) };
    }

    const data = (await response.json()) as T;
    return { data, error: null };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);

    // Abort can be either timeout or user cancel
    const isAbort =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof err === 'object' && err && 'name' in err && (err as any).name === 'AbortError');

    if (isAbort) {
      if (externalSignal?.aborted) {
        return { data: null, error: new Error('Cancelado por el usuario') };
      }
      return {
        data: null,
        error: new Error(`Timeout: la generación tardó más de ${Math.round(timeoutMs / 1000)}s`),
      };
    }

    return { data: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
}

