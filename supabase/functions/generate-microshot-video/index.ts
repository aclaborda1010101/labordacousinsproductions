/**
 * GENERATE-MICROSHOT-VIDEO Edge Function
 * Generates video for individual micro-shots using keyframe chaining
 * Supports Kling and Veo engines
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MicroShotRequest {
  microShotId: string;
  engine?: 'kling' | 'veo';
  promptOverride?: string;
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
  scenes: {
    slugline: string;
    summary: string | null;
    project_id: string;
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Build a motion-focused prompt for video generation
 */
function buildMicroShotPrompt(
  microShot: MicroShot,
  shot: Shot,
  keyframeInitial: Keyframe | null,
  keyframeFinal: Keyframe | null
): string {
  const parts: string[] = [];

  // Scene context
  parts.push(`Scene: ${shot.scenes.slugline}`);
  if (shot.scenes.summary) {
    parts.push(shot.scenes.summary);
  }

  // Shot type and camera
  parts.push(`${shot.shot_type} shot`);
  if (shot.camera) {
    const cam = shot.camera as Record<string, unknown>;
    if (cam.movement && cam.movement !== 'Static') {
      parts.push(`Camera movement: ${cam.movement}`);
    }
    if (cam.focal_mm) {
      parts.push(`${cam.focal_mm}mm lens`);
    }
  }

  // Blocking/action
  if (shot.blocking) {
    const block = shot.blocking as Record<string, unknown>;
    if (block.description) {
      parts.push(`Action: ${block.description}`);
    }
    if (block.action) {
      parts.push(block.action as string);
    }
  }

  // Dialogue context
  if (shot.dialogue_text) {
    parts.push(`Dialogue: "${shot.dialogue_text}"`);
  }

  // Micro-shot specific motion notes
  if (microShot.motion_notes) {
    parts.push(`Motion: ${microShot.motion_notes}`);
  }

  // Duration context
  parts.push(`Duration: ${microShot.duration_sec} seconds`);

  // Keyframe transition context
  if (keyframeInitial?.prompt_text && keyframeFinal?.prompt_text) {
    parts.push(`Transition from: ${keyframeInitial.prompt_text}`);
    parts.push(`Transition to: ${keyframeFinal.prompt_text}`);
  }

  // Micro-shot custom prompt
  if (microShot.prompt_text) {
    parts.push(microShot.prompt_text);
  }

  return parts.join('. ');
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

    const { microShotId, engine = 'kling', promptOverride } = await req.json() as MicroShotRequest;

    if (!microShotId) {
      return json({ ok: false, error: 'microShotId is required' }, 400);
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

    // 3. Validate keyframes
    if (!keyframeInitial?.image_url) {
      return json({ 
        ok: false, 
        error: 'Keyframe inicial no disponible. Genera y aprueba el keyframe primero.',
        code: 'MISSING_INITIAL_KEYFRAME'
      }, 400);
    }

    if (!keyframeInitial.approved) {
      return json({ 
        ok: false, 
        error: 'Keyframe inicial no aprobado. Aprueba el keyframe antes de generar video.',
        code: 'UNAPPROVED_INITIAL_KEYFRAME'
      }, 400);
    }

    // Note: Final keyframe is optional for video generation
    // but will be used in prompt for motion direction
    if (keyframeFinal && !keyframeFinal.approved) {
      console.log('[generate-microshot-video] Warning: Final keyframe not approved, using only initial');
    }

    // 4. Fetch shot details for prompt building
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        scenes!inner(slugline, summary, project_id)
      `)
      .eq('id', microShot.shot_id)
      .single();

    if (shotError || !shot) {
      return json({ ok: false, error: `Shot not found: ${shotError?.message}` }, 404);
    }

    // 5. Build prompt
    const prompt = promptOverride || buildMicroShotPrompt(
      microShot as MicroShot,
      shot as unknown as Shot,
      keyframeInitial,
      keyframeFinal
    );

    // 6. Update micro_shot status to generating
    await supabase
      .from('micro_shots')
      .update({ 
        video_status: 'generating',
        video_engine: engine,
        prompt_text: prompt
      })
      .eq('id', microShotId);

    // 7. Invoke video generation engine
    let videoResult: { taskId?: string; operationName?: string; error?: string };

    if (engine === 'kling') {
      const { data, error } = await supabase.functions.invoke('kling_start', {
        body: {
          prompt,
          duration: microShot.duration_sec || 2,
          keyframeUrl: keyframeInitial.image_url,
          qualityMode: 'high'
        }
      });

      if (error) {
        console.error('[generate-microshot-video] Kling error:', error);
        await supabase
          .from('micro_shots')
          .update({ video_status: 'failed' })
          .eq('id', microShotId);
        return json({ ok: false, error: `Kling error: ${error.message}` }, 500);
      }

      videoResult = data;
    } else if (engine === 'veo') {
      const { data, error } = await supabase.functions.invoke('veo_start', {
        body: {
          prompt,
          seconds: microShot.duration_sec || 2,
          keyframeUrl: keyframeInitial.image_url
        }
      });

      if (error) {
        console.error('[generate-microshot-video] Veo error:', error);
        await supabase
          .from('micro_shots')
          .update({ video_status: 'failed' })
          .eq('id', microShotId);
        return json({ ok: false, error: `Veo error: ${error.message}` }, 500);
      }

      videoResult = data;
    } else {
      return json({ ok: false, error: `Unsupported engine: ${engine}` }, 400);
    }

    // 8. Create generation_run for tracking
    const { data: genRun } = await supabase
      .from('generation_runs')
      .insert({
        project_id: microShot.project_id,
        entity_type: 'micro_shot',
        entity_id: microShotId,
        phase: 'production',
        engine: engine,
        prompt_text: prompt,
        status: 'pending',
        raw_response: videoResult
      })
      .select()
      .single();

    // 9. Update micro_shot with generation run reference
    await supabase
      .from('micro_shots')
      .update({ 
        generation_run_id: genRun?.id
      })
      .eq('id', microShotId);

    return json({
      ok: true,
      microShotId,
      engine,
      taskId: videoResult.taskId || videoResult.operationName,
      generationRunId: genRun?.id,
      message: 'Video generation started. Use polling to check status.'
    });

  } catch (error) {
    console.error('[generate-microshot-video] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
