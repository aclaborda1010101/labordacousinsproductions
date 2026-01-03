/**
 * Helper to invoke Supabase Edge Functions with a custom timeout.
 * This is needed because supabase.functions.invoke doesn't support timeout options.
 */
export async function invokeWithTimeout<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  timeoutMs = 120000 // 2 minutes default
): Promise<{ data: T | null; error: Error | null }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: new Error(errorText || `HTTP ${response.status}`) };
    }

    const data = await response.json() as T;
    return { data, error: null };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    
    if (err instanceof Error && err.name === 'AbortError') {
      return { data: null, error: new Error(`Timeout: la generación tardó más de ${Math.round(timeoutMs / 1000)}s`) };
    }
    
    return { data: null, error: err instanceof Error ? err : new Error('Unknown error') };
  }
}
