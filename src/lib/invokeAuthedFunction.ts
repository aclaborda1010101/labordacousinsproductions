import { supabase } from "@/integrations/supabase/client";

export async function invokeAuthedFunction<T = any>(
  fnName: string,
  body: any
): Promise<{ data: T | null; error: any | null }> {
  // Get current session
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;

  if (!session?.access_token) {
    return { data: null, error: new Error("No active session. Please login again.") };
  }

  // Check if token expires in less than 60 seconds - refresh proactively
  const expiresAt = session.expires_at ?? 0;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSeconds < 60) {
    console.log('[invokeAuthedFunction] Token expiring soon, refreshing...');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      console.error('[invokeAuthedFunction] Failed to refresh session:', refreshError);
      return { data: null, error: new Error("Session expired. Please login again.") };
    }
    session = refreshData.session;
    console.log('[invokeAuthedFunction] Token refreshed successfully');
  }

  // Supabase client will attach the JWT automatically when a session exists
  return await supabase.functions.invoke(fnName, { body });
}
