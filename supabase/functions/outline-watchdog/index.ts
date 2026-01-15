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

    // V15: Find and update zombie outlines with DUAL check
    // Status must be 'generating' or 'queued' AND BOTH:
    // - heartbeat_at must be older than threshold
    // - updated_at must be older than threshold (prevents false positives during model calls)
    // This prevents marking active workers as zombies just because they're waiting for AI response
    
    // First, fetch candidates that match heartbeat threshold
    const { data: candidates, error: fetchError } = await supabase
      .from('project_outlines')
      .select('id, project_id, stage, substage, progress, heartbeat_at, updated_at')
      .in('status', ['generating', 'queued'])
      .lt('heartbeat_at', staleTime);
    
    if (fetchError) {
      console.error('[WATCHDOG] Error fetching candidates:', fetchError);
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // V15: Filter to only include those where BOTH heartbeat AND updated_at are stale
    const staleTimeDate = new Date(staleTime);
    const trueZombies = (candidates || []).filter(outline => {
      const updatedAt = new Date(outline.updated_at || outline.heartbeat_at);
      const heartbeatAt = new Date(outline.heartbeat_at);
      const isUpdatedStale = updatedAt < staleTimeDate;
      const isHeartbeatStale = heartbeatAt < staleTimeDate;
      
      if (!isUpdatedStale) {
        console.log(`[WATCHDOG] Outline ${outline.id} has recent updated_at, skipping (not a zombie)`);
      }
      
      return isUpdatedStale && isHeartbeatStale;
    });
    
    console.log(`[WATCHDOG] Found ${candidates?.length || 0} candidates, ${trueZombies.length} true zombies`);
    
    // Update only the true zombies
    let zombies: any[] = [];
    if (trueZombies.length > 0) {
      const zombieIds = trueZombies.map(z => z.id);
      const { data: updatedZombies, error } = await supabase
        .from('project_outlines')
        .update({ 
          status: 'error',              // Valid status for retry
          // stage: preserved - do NOT overwrite with 'done'
          quality: 'error',
          error_code: 'ZOMBIE_TIMEOUT',
          error_detail: 'Detectado por watchdog: sin heartbeat ni updates por más de 5 minutos',
          completed_at: new Date().toISOString()
        })
        .in('id', zombieIds)
        .select('id, project_id, stage, substage, progress');
      
      if (error) {
        console.error('[WATCHDOG] Error updating zombies:', error);
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      zombies = updatedZombies || [];
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
