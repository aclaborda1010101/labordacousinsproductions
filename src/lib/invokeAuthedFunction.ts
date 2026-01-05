import { supabase } from "@/integrations/supabase/client";

export async function invokeAuthedFunction<T = any>(
  fnName: string,
  body: any
): Promise<{ data: T | null; error: any | null }> {
  // Ensure we have a session before calling any verify_jwt=true function
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;

  if (!session?.access_token) {
    return { data: null, error: new Error("No active session. Please login again.") };
  }

  // IMPORTANT: do NOT set Authorization manually here.
  // Supabase client will attach the JWT automatically when a session exists.
  return await supabase.functions.invoke(fnName, { body });
}
