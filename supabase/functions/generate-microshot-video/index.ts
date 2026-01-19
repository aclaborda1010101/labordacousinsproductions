/**
 * GENERATE-MICROSHOT-VIDEO Edge Function v2
 * Generates video for individual micro-shots using keyframe chaining
 * Supports Kling (A→B), Runway Gen-3 (A→B), and Veo (chaining only)
 * 
 * Features:
 * - Automatic engine selection based on A→B availability
 * - Canonical anti-hallucination prompts
 * - Support for end frame extraction via chaining
 * - Negative prompt injection
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MicroShotRequest {
  microShotId: string;
  engine?: 'kling' | 'runway' | 'veo' | 'auto';
  promptOverride?: string;
  keyframeUrlOverride?: string;  // For chaining from previous microshot
  keyframeTailUrlOverride?: string;  // For A→B transition
}

interface MicroShot {
  id: string;
  shot_id: string;
  project_id: string;
  sequence_no: number;
  start_sec: number;
  end_sec: number;
  duration_sec: number;
  keyframe_initial_id: string | null;
  keyframe_final_id: string | null;
  video_status: string;
  video_engine: string;
  prompt_text: string | null;
  motion_notes: string | null;
  negative_prompt: string | null;
  seed: number | null;
  end_frame_image_url: string | null;
}

interface Keyframe {
  id: string;
  image_url: string | null;
  prompt_text: string | null;
  timestamp_sec: number;
  approved: boolean;
}

interface Shot {
  id: string;
  shot_no: number;
  shot_type: string;
  dialogue_text: string | null;
  camera: Record<string, unknown>;
  blocking: Record<string, unknown>;
  provider_preference: string;
  style_lock: Record<string, unknown>;
  continuity_anchor_image_url: string | null;
  scenes: {
    slugline: string;
    summary: string | null;
    project_id: string;
    style_profile: string | null;
  };
}

// Canonical negative prompt for all engines
const CANONICAL_NEGATIVE = 
  'no face drift, no wardrobe change, no prop change, no new characters, ' +
  'no text, no logos, no extra limbs, no lighting change, no scene change, ' +
  'no camera angle change, no style drift, no morphing, no blur artifacts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Select the best engine based on A→B availability
 */
function selectEngine(
  preferredEngine: string,
  hasEndFrame: boolean,
  configuredEngines: string[]
): 'kling' | 'runway' | 'veo' {
  // Respect explicit preference
  if (preferredEngine && preferredEngine !== 'auto') {
    if (configuredEngines.includes(preferredEngine)) {
      return preferredEngine as 'kling' | 'runway' | 'veo';
    }
  }

  // A→B mode: prioritize Kling > Runway
  if (hasEndFrame) {
    if (configuredEngines.includes('kling')) return 'kling';
    if (configuredEngines.includes('runway')) return 'runway';
  }

  // Default priority: Kling > Runway > Veo
  if (configuredEngines.includes('kling')) return 'kling';
  if (configuredEngines.includes('runway')) return 'runway';
  return 'veo';
}

/**
 * Build a CANONICAL anti-hallucination prompt for video generation
 * Following the studio's STYLE LOCK / CAMERA LOCK / CONTINUITY pattern
 */
function buildCanonicalPrompt(
  microShot: MicroShot,
  shot: Shot,
  _keyframeInitial: Keyframe | null,
  _keyframeFinal: Keyframe | null
): { prompt: string; negative: string } {
  const lines: string[] = [];

  // STYLE LOCK
  const styleName = (shot.style_lock as any)?.name 
    || shot.scenes?.style_profile 
    || 'CINEMATIC_CONSISTENT';
  lines.push(`STYLE LOCK: ${styleName} (mantener estilo constante)`);
  lines.push('');

  // SCENE LOCK (minimal - keyframes define the scene)
  const slugline = shot.scenes?.slugline || 'INTERIOR - SCENE';
  lines.push(`SCENE LOCK: ${slugline}`);
  lines.push('');

  // CAMERA LOCK
  const camera = shot.camera as Record<string, unknown> || {};
  const shotType = shot.shot_type || camera.shot_type || 'MEDIUM';
  const focalMm = camera.focal_mm || 35;
  const movement = camera.movement || 'maintain framing';
  const framing = camera.framing || 'center';
  const height = camera.height || 'eye-level';
  
  lines.push(`CAMERA LOCK: ${shotType}, lens ${focalMm}mm, movement ${movement}, framing ${framing}, camera height ${height}`);
  lines.push('');

  // LIGHT/FOCUS (from scene or defaults)
  const lighting = (shot.blocking as any)?.lighting || 'natural ambient';
  lines.push(`LIGHT/FOCUS: ${lighting}`);
  lines.push('');

  // ACTION (solo 1 micro-cambio)
  const actionBeat = microShot.motion_notes 
    || (shot.blocking as any)?.action 
    || 'subtle natural movement';
  lines.push(`ACTION: ${actionBeat}`);
  lines.push('');

  // CONTINUITY ENFORCEMENT
  lines.push('CONTINUITY: same identities, same clothes, same props, same background, same lighting, no new objects, no camera jump');
  lines.push('');

  // GROUND TRUTH
  lines.push('Use the provided start and end images as ground truth.');
  lines.push('Create only subtle natural motion connecting them.');
  lines.push('No scene changes. No style changes.');
  lines.push(`Duration: ${microShot.duration_sec || 2} seconds`);
  lines.push('');
  
  // REDUNDANCY: repeat ground truth for emphasis
  lines.push('Match start/end keyframes exactly. No drift in character appearance, wardrobe, or props.');

  return { 
    prompt: lines.join('\n'), 
    negative: microShot.negative_prompt || CANONICAL_NEGATIVE 
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { 
      microShotId, 
      engine: requestedEngine = 'auto', 
      promptOverride,
      keyframeUrlOverride,
      keyframeTailUrlOverride
    } = await req.json() as MicroShotRequest;

    if (!microShotId) {
      return json({ ok: false, error: 'microShotId is required' }, 400);
    }

    // Check configured engines
    const configuredEngines: string[] = [];
    if (Deno.env.get('KLING_ACCESS_KEY')) configuredEngines.push('kling');
    if (Deno.env.get('RUNWAY_API_KEY')) configuredEngines.push('runway');
    if (Deno.env.get('GCP_SERVICE_ACCOUNT_JSON')) configuredEngines.push('veo');

    if (configuredEngines.length === 0) {
      return json({ ok: false, error: 'No video engines configured. Set KLING_ACCESS_KEY, RUNWAY_API_KEY, or GCP_SERVICE_ACCOUNT_JSON.' }, 500);
    }

    // 1. Fetch micro_shot with related data
    const { data: microShot, error: msError } = await supabase
      .from('micro_shots')
      .select('*')
      .eq('id', microShotId)
      .single();

    if (msError || !microShot) {
      return json({ ok: false, error: `MicroShot not found: ${msError?.message}` }, 404);
    }

    // 2. Fetch related keyframes
    let keyframeInitial: Keyframe | null = null;
    let keyframeFinal: Keyframe | null = null;

    if (microShot.keyframe_initial_id) {
      const { data } = await supabase
        .from('keyframes')
        .select('*')
        .eq('id', microShot.keyframe_initial_id)
        .single();
      keyframeInitial = data;
    }

    if (microShot.keyframe_final_id) {
      const { data } = await supabase
        .from('keyframes')
        .select('*')
        .eq('id', microShot.keyframe_final_id)
        .single();
      keyframeFinal = data;
    }

    // 3. Determine effective keyframe URLs (with override support for chaining)
    const effectiveStartUrl = keyframeUrlOverride || keyframeInitial?.image_url;
    const effectiveTailUrl = keyframeTailUrlOverride || 
      (keyframeFinal?.approved ? keyframeFinal?.image_url : undefined);

    // 4. Validate start keyframe
    if (!effectiveStartUrl) {
      return json({ 
        ok: false, 
        error: 'Keyframe inicial no disponible. Genera y aprueba el keyframe primero.',
        code: 'MISSING_INITIAL_KEYFRAME'
      }, 400);
    }

    // If using original keyframe, check approval
    if (!keyframeUrlOverride && keyframeInitial && !keyframeInitial.approved) {
      return json({ 
        ok: false, 
        error: 'Keyframe inicial no aprobado. Aprueba el keyframe antes de generar video.',
        code: 'UNAPPROVED_INITIAL_KEYFRAME'
      }, 400);
    }

    // 5. Fetch shot details for prompt building
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        scenes!inner(slugline, summary, project_id, style_profile)
      `)
      .eq('id', microShot.shot_id)
      .single();

    if (shotError || !shot) {
      return json({ ok: false, error: `Shot not found: ${shotError?.message}` }, 404);
    }

    // 6. Select engine (auto-selection or explicit)
    const hasEndFrame = !!effectiveTailUrl;
    const shotPreference = shot.provider_preference || 'auto';
    const selectedEngine = selectEngine(
      requestedEngine !== 'auto' ? requestedEngine : shotPreference,
      hasEndFrame,
      configuredEngines
    );

    console.log(`[generate-microshot-video] Engine selection: ${selectedEngine} (hasEndFrame: ${hasEndFrame}, available: ${configuredEngines.join(',')})`);

    // 7. Build prompt
    const { prompt, negative } = promptOverride 
      ? { prompt: promptOverride, negative: microShot.negative_prompt || CANONICAL_NEGATIVE }
      : buildCanonicalPrompt(
          microShot as MicroShot,
          shot as unknown as Shot,
          keyframeInitial,
          keyframeFinal
        );

    // 8. Generate seed if not set
    const seed = microShot.seed || Math.floor(Math.random() * 2147483647);

    // 9. Update micro_shot status to generating
    await supabase
      .from('micro_shots')
      .update({ 
        video_status: 'generating',
        video_engine: selectedEngine,
        prompt_text: prompt,
        negative_prompt: negative,
        seed: seed
      })
      .eq('id', microShotId);

    // 10. Invoke video generation engine
    let videoResult: { taskId?: string; operationName?: string; error?: string };

    if (selectedEngine === 'kling') {
      console.log(`[generate-microshot-video] Kling: start=${!!effectiveStartUrl}, tail=${!!effectiveTailUrl}`);
      
      const { data, error } = await supabase.functions.invoke('kling_start', {
        body: {
          prompt,
          duration: microShot.duration_sec || 2,
          keyframeUrl: effectiveStartUrl,
          keyframeTailUrl: effectiveTailUrl,
          qualityMode: 'CINE'
        }
      });

      if (error) {
        console.error('[generate-microshot-video] Kling error:', error);
        await supabase.from('micro_shots').update({ video_status: 'failed' }).eq('id', microShotId);
        return json({ ok: false, error: `Kling error: ${error.message}` }, 500);
      }
      videoResult = data;

    } else if (selectedEngine === 'runway') {
      console.log(`[generate-microshot-video] Runway: start=${!!effectiveStartUrl}, tail=${!!effectiveTailUrl}`);
      
      const { data, error } = await supabase.functions.invoke('runway_start', {
        body: {
          prompt,
          duration: microShot.duration_sec || 4,
          keyframeUrl: effectiveStartUrl,
          keyframeTailUrl: effectiveTailUrl,  // A→B native support
          negativePrompt: negative
        }
      });

      if (error) {
        console.error('[generate-microshot-video] Runway error:', error);
        await supabase.from('micro_shots').update({ video_status: 'failed' }).eq('id', microShotId);
        return json({ ok: false, error: `Runway error: ${error.message}` }, 500);
      }
      videoResult = data;

    } else if (selectedEngine === 'veo') {
      console.log(`[generate-microshot-video] Veo: start=${!!effectiveStartUrl} (no A→B support)`);
      
      const { data, error } = await supabase.functions.invoke('veo_start', {
        body: {
          prompt,
          seconds: microShot.duration_sec || 2,
          keyframeUrl: effectiveStartUrl
          // Note: Veo doesn't support tail keyframe
        }
      });

      if (error) {
        console.error('[generate-microshot-video] Veo error:', error);
        await supabase.from('micro_shots').update({ video_status: 'failed' }).eq('id', microShotId);
        return json({ ok: false, error: `Veo error: ${error.message}` }, 500);
      }
      videoResult = data;

    } else {
      return json({ ok: false, error: `Unsupported engine: ${selectedEngine}` }, 400);
    }

    // 11. Create generation_run for tracking
    const { data: genRun } = await supabase
      .from('generation_runs')
      .insert({
        project_id: microShot.project_id,
        entity_type: 'micro_shot',
        entity_id: microShotId,
        phase: 'production',
        engine: selectedEngine,
        prompt_text: prompt,
        status: 'pending',
        raw_response: videoResult
      })
      .select()
      .single();

    // 12. Update micro_shot with generation run reference
    await supabase
      .from('micro_shots')
      .update({ generation_run_id: genRun?.id })
      .eq('id', microShotId);

    return json({
      ok: true,
      microShotId,
      engine: selectedEngine,
      taskId: videoResult.taskId || videoResult.operationName,
      generationRunId: genRun?.id,
      hasAtoB: hasEndFrame && (selectedEngine === 'kling' || selectedEngine === 'runway'),
      message: `Video generation started with ${selectedEngine.toUpperCase()}. ${hasEndFrame ? 'A→B mode active.' : 'Chaining mode.'}`
    });

  } catch (error) {
    console.error('[generate-microshot-video] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
