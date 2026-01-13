import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  v3RequireAuth, 
  v3RequireProjectAccess,
  corsHeaders,
  V3AuthContext
} from "../_shared/v3-enterprise.ts";

/**
 * force-unlock-project: Secure project unlock for stale locks
 * 
 * Only unlocks if:
 * 1. Lock exists and is expired (>5 minutes old)
 * 2. OR lock exists and no heartbeat on any 'generating' outline for >60s
 * 3. User has project access
 */

const STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const ZOMBIE_HEARTBEAT_THRESHOLD_MS = 60 * 1000; // 60 seconds without heartbeat

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate
  const authResult = await v3RequireAuth(req);
  if (authResult instanceof Response) {
    return authResult;
  }
  const auth: V3AuthContext = authResult;

  try {
    const body = await req.json();
    const projectId = body.projectId || body.project_id;

    if (!projectId) {
      return new Response(
        JSON.stringify({ success: false, error: 'project_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check project access
    const accessResult = await v3RequireProjectAccess(auth, projectId);
    if (accessResult instanceof Response) {
      return accessResult;
    }

    // Fetch current lock
    const { data: lock, error: lockError } = await auth.supabase
      .from('project_locks')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (lockError) {
      console.error('[FORCE-UNLOCK] Error fetching lock:', lockError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to check lock status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lock) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          unlocked: false, 
          reason: 'no_lock_exists',
          message: 'No hay bloqueo activo en este proyecto'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lockAge = Date.now() - new Date(lock.created_at).getTime();
    const isExpired = lockAge > STALE_LOCK_THRESHOLD_MS;

    // Check for zombie outline (generating with stale heartbeat)
    let isZombie = false;
    let zombieOutlineId: string | null = null;
    
    const { data: generatingOutline } = await auth.supabase
      .from('project_outlines')
      .select('id, heartbeat_at, updated_at, status')
      .eq('project_id', projectId)
      .eq('status', 'generating')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (generatingOutline) {
      const heartbeat = generatingOutline.heartbeat_at || generatingOutline.updated_at;
      const heartbeatAge = Date.now() - new Date(heartbeat).getTime();
      isZombie = heartbeatAge > ZOMBIE_HEARTBEAT_THRESHOLD_MS;
      if (isZombie) {
        zombieOutlineId = generatingOutline.id;
      }
    }

    // Decision: unlock or not
    if (!isExpired && !isZombie) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          unlocked: false,
          reason: 'lock_still_valid',
          lockAge: Math.round(lockAge / 1000),
          expiresInSeconds: Math.round((STALE_LOCK_THRESHOLD_MS - lockAge) / 1000),
          message: 'El bloqueo aún es válido. Hay una generación activa en progreso.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unlock
    const { error: deleteError } = await auth.supabase
      .from('project_locks')
      .delete()
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('[FORCE-UNLOCK] Error deleting lock:', deleteError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to release lock' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark zombie outline as error
    if (zombieOutlineId) {
      await auth.supabase
        .from('project_outlines')
        .update({ 
          status: 'error', 
          qc_issues: ['Generación interrumpida - proceso zombie detectado'],
          updated_at: new Date().toISOString()
        })
        .eq('id', zombieOutlineId);
    }

    const unlockReason = isExpired ? 'lock_expired' : 'zombie_process';
    console.log('[FORCE-UNLOCK] Successfully unlocked project:', {
      projectId,
      reason: unlockReason,
      lockAgeSeconds: Math.round(lockAge / 1000),
      zombieOutlineId
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        unlocked: true,
        reason: unlockReason,
        lockAgeSeconds: Math.round(lockAge / 1000),
        zombieOutlineId,
        message: unlockReason === 'lock_expired' 
          ? 'Bloqueo expirado liberado correctamente'
          : 'Proceso zombie detectado y detenido'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (e) {
    console.error('[FORCE-UNLOCK] Unexpected error:', e);
    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
