/**
 * HYDRATE-SHOT-FROM-TECHNICAL Edge Function
 * Auto-populates shot fields from scene_technical_docs when inherit_technical=true
 * Respects technical_overrides for fields the user has explicitly changed
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HydrateRequest {
  shotId: string;
  forceRefresh?: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { shotId, forceRefresh = false } = await req.json() as HydrateRequest;

    if (!shotId) {
      return json({ ok: false, error: 'shotId is required' }, 400);
    }

    // 1. Fetch shot with scene info
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        scenes!inner(id, scene_no, project_id)
      `)
      .eq('id', shotId)
      .single();

    if (shotError || !shot) {
      return json({ ok: false, error: `Shot not found: ${shotError?.message}` }, 404);
    }

    // Check if inheritance is enabled
    if (!shot.inherit_technical && !forceRefresh) {
      return json({ 
        ok: true, 
        hydrated: false, 
        message: 'inherit_technical is disabled for this shot' 
      });
    }

    const sceneId = shot.scenes.id;

    // 2. Fetch technical doc for the scene
    const { data: techDoc, error: techError } = await supabase
      .from('scene_technical_docs')
      .select('*')
      .eq('scene_id', sceneId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (techError || !techDoc) {
      console.log(`[hydrate-shot] No technical doc found for scene ${sceneId}`);
      return json({ 
        ok: true, 
        hydrated: false, 
        message: 'No technical document found for this scene' 
      });
    }

    // 3. Parse technical doc to find matching shot
    const shots = techDoc.shots as any[];
    if (!shots || !Array.isArray(shots)) {
      return json({ 
        ok: true, 
        hydrated: false, 
        message: 'Technical doc has no shots array' 
      });
    }

    // Find matching shot by index or shot_no
    const shotIdx = shot.technical_shot_idx ?? (shot.shot_no - 1);
    const techShot = shots[shotIdx] || shots.find((s: any) => s.shot_no === shot.shot_no);

    if (!techShot) {
      return json({ 
        ok: true, 
        hydrated: false, 
        message: `No matching shot found in technical doc (idx: ${shotIdx})` 
      });
    }

    // 4. Build hydrated fields from technical doc
    const overrides = shot.technical_overrides || {};
    
    // Camera configuration
    const camera = overrides.camera ?? {
      movement: techShot.camera?.camera_path || techShot.camera?.movement || 'Static',
      height: techShot.camera?.camera_position?.height || 'EyeLevel',
      angle: techShot.camera?.camera_position?.angle || '',
      focal_mm: techShot.camera?.lens_mm || techShot.camera?.focal_mm || 35,
      camera_body: techShot.camera?.camera_body || 'ARRI_ALEXA_35',
      lens_model: techShot.camera?.lens_model || 'ARRI_SIGNATURE_PRIME',
      ...(shot.camera || {}),
      ...(overrides.camera || {})
    };

    // Lighting configuration
    const lighting = overrides.lighting ?? {
      style: techShot.lighting?.look || techShot.lighting?.style || 'Naturalistic_Daylight',
      key_direction: techShot.lighting?.key_direction,
      fill_ratio: techShot.lighting?.fill_ratio,
      practical_sources: techShot.lighting?.practical_sources,
      ...(shot.lighting || {}),
      ...(overrides.lighting || {})
    };

    // Focus configuration (from technical doc)
    const focus = overrides.focus ?? {
      mode: techShot.focus?.mode || 'rack_focus',
      depth: techShot.focus?.depth || 'shallow',
      target: techShot.focus?.target,
      ...(overrides.focus || {})
    };

    // Timing configuration
    const timing = overrides.timing ?? {
      start_sec: techShot.timing?.start_sec,
      end_sec: techShot.timing?.end_sec,
      duration_sec: techShot.timing?.duration_sec || shot.duration_target,
    };

    // Constraints / Locks from technical doc
    const constraints = techShot.constraints || {};

    // 5. Update shot with hydrated values
    const updatePayload: Record<string, any> = {
      camera,
      lighting,
      technical_shot_idx: shotIdx,
    };

    // Only update duration if not overridden
    if (!overrides.duration_target && timing.duration_sec) {
      updatePayload.duration_target = timing.duration_sec;
    }

    // Store focus and timing in a technical_context field or blocking
    const currentBlocking = shot.blocking || {};
    updatePayload.blocking = {
      ...currentBlocking,
      focus,
      timing,
      constraints,
      // Preserve existing descriptions
      description: overrides.blocking_description || currentBlocking.description,
      action: overrides.blocking_action || currentBlocking.action,
    };

    const { error: updateError } = await supabase
      .from('shots')
      .update(updatePayload)
      .eq('id', shotId);

    if (updateError) {
      console.error('[hydrate-shot] Update error:', updateError);
      return json({ ok: false, error: `Failed to update shot: ${updateError.message}` }, 500);
    }

    console.log(`[hydrate-shot] Hydrated shot ${shotId} from technical doc (idx: ${shotIdx})`);

    return json({
      ok: true,
      hydrated: true,
      shotId,
      technicalDocId: techDoc.id,
      hydratedFields: {
        camera: Object.keys(camera),
        lighting: Object.keys(lighting),
        focus: Object.keys(focus),
        timing: Object.keys(timing),
        constraints: Object.keys(constraints),
      },
      message: 'Shot successfully hydrated from Technical Document'
    });

  } catch (error) {
    console.error('[hydrate-shot] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
