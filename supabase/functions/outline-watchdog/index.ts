// ============================================================================
// OUTLINE WATCHDOG - Detects and marks stalled/zombie outline workers
// ============================================================================
// This function should be called periodically (e.g., via cron or manual trigger)
// to detect outlines that have stopped receiving heartbeats and mark them as
// 'stalled' so the UI can offer retry options.
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Outlines are considered stale if no heartbeat for 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Calculate the stale threshold timestamp
    const staleTime = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
    
    console.log(`[WATCHDOG] Checking for zombie outlines with heartbeat < ${staleTime}`);

    // Find and update zombie outlines
    // Status must be 'generating' or 'queued' and heartbeat must be older than threshold
    // V11.1: Use 'error' status (valid) instead of 'stalled' (invalid)
    // V11.1: Do NOT overwrite stage - preserve where the worker actually died
    // This allows the UI to offer "resume from X" functionality
    const { data: zombies, error } = await supabase
      .from('project_outlines')
      .update({ 
        status: 'error',              // Valid status for retry
        // stage: preserved - do NOT overwrite with 'done'
        quality: 'error',
        error_code: 'ZOMBIE_TIMEOUT',
        error_detail: 'Detectado por watchdog: sin heartbeat por más de 5 minutos',
        completed_at: new Date().toISOString()
      })
      .in('status', ['generating', 'queued'])
      .lt('heartbeat_at', staleTime)
      .select('id, project_id, stage, substage, progress');

    if (error) {
      console.error('[WATCHDOG] Error updating zombies:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanedCount = zombies?.length || 0;
    console.log(`[WATCHDOG] Marked ${cleanedCount} zombie outline(s) as stalled`);

    // Also clean up expired project locks while we're at it
    const { data: locksCleanedResult } = await supabase.rpc('cleanup_expired_locks');
    const locksCleaned = typeof locksCleanedResult === 'number' ? locksCleanedResult : 0;

    return new Response(
      JSON.stringify({
        success: true,
        cleaned: cleanedCount,
        zombies: zombies || [],
        locks_cleaned: locksCleaned,
        checked_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error('[WATCHDOG] Unexpected error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
