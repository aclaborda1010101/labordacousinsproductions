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

    // 4. Build EFFECTIVE config from technical doc + overrides (composición en runtime)
    // IMPORTANTE: No duplicamos config en el shot, solo guardamos referencia + patch
    const overrides = shot.technical_overrides || {};
    
    // Compose effective config (for response, NOT stored in shot)
    const effectiveConfig = {
      camera: {
        movement: techShot.camera?.camera_path || techShot.camera?.movement || 'Static',
        height: techShot.camera?.camera_position?.height || 'EyeLevel',
        angle: techShot.camera?.camera_position?.angle || '',
        focal_mm: techShot.camera?.lens_mm || techShot.camera?.focal_mm || 35,
        camera_body: techShot.camera?.camera_body || 'ARRI_ALEXA_35',
        lens_model: techShot.camera?.lens_model || 'ARRI_SIGNATURE_PRIME',
        ...(overrides.camera || {})
      },
      lighting: {
        style: techShot.lighting?.look || techShot.lighting?.style || 'Naturalistic_Daylight',
        key_direction: techShot.lighting?.key_direction,
        fill_ratio: techShot.lighting?.fill_ratio,
        practical_sources: techShot.lighting?.practical_sources,
        ...(overrides.lighting || {})
      },
      focus: {
        mode: techShot.focus?.mode || 'rack_focus',
        depth: techShot.focus?.depth || 'shallow',
        target: techShot.focus?.target,
        ...(overrides.focus || {})
      },
      timing: {
        start_sec: techShot.timing?.start_sec,
        end_sec: techShot.timing?.end_sec,
        duration_sec: techShot.timing?.duration_sec || shot.duration_target,
        ...(overrides.timing || {})
      },
      constraints: {
        ...techShot.constraints,
        ...(overrides.constraints || {})
      }
    };

    // 5. Update shot with ONLY the mapping reference (not the full config)
    // Regla: el shot tiene referencia + patch, no snapshot
    const updatePayload: Record<string, any> = {
      technical_shot_idx: shotIdx,
      inherit_technical: true,
      // NO copiamos camera/lighting/blocking al shot
      // Los consumidores deben componer en runtime: tech_doc.shots[idx] + overrides
    };

    const { error: updateError } = await supabase
      .from('shots')
      .update(updatePayload)
      .eq('id', shotId);

    if (updateError) {
      console.error('[hydrate-shot] Update error:', updateError);
      return json({ ok: false, error: `Failed to update shot: ${updateError.message}` }, 500);
    }

    console.log(`[hydrate-shot] Hydrated shot ${shotId} from technical doc (idx: ${shotIdx}) - reference only, no duplication`);

    // Return effective config for immediate use (composed, not stored)
    return json({
      ok: true,
      hydrated: true,
      shotId,
      technicalDocId: techDoc.id,
      technicalShotIdx: shotIdx,
      // Devolvemos effective_config compuesto para uso inmediato
      effectiveConfig,
      message: 'Shot mapped to Technical Document (reference + overrides, no duplication)'
    });

  } catch (error) {
    console.error('[hydrate-shot] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
