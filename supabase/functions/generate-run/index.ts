import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRunRequest {
  projectId: string;
  type: 'character' | 'location' | 'keyframe';
  phase: 'exploration' | 'production';
  engine: string;
  engineSelectedBy: 'auto' | 'user' | 'recommendation';
  engineReason?: string;
  prompt: string;
  context?: string;
  params?: Record<string, unknown>;
  parentRunId?: string; // For regeneration chains
  presetId?: string; // For editorial assistant tracking
  userOverride?: boolean; // True if user chose different from recommendation
  isAutoRetry?: boolean; // True if this is an auto-retry attempt
}

interface GenerateRunResponse {
  ok: boolean;
  runId?: string;
  outputUrl?: string;
  outputType?: 'image' | 'text';
  engine?: string;
  model?: string;
  generationTimeMs?: number;
  warnings?: unknown[];
  suggestions?: unknown[];
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let runId: string | undefined;

  try {
    const body: GenerateRunRequest = await req.json();
    
    // 1) Validate required fields
    if (!body.projectId || !body.type || !body.phase || !body.engine || !body.prompt) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing required fields: projectId, type, phase, engine, prompt'
      } as GenerateRunResponse), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Forward the caller's auth token when invoking downstream functions (they require a real user JWT)
    const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing Authorization header'
      } as GenerateRunResponse), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const supabaseAuthed = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    console.log(`[generate-run] Starting: type=${body.type}, engine=${body.engine}, project=${body.projectId}, isAutoRetry=${body.isAutoRetry || false}`);

    // Determine auto_retry_count
    let autoRetryCount = 0;
    if (body.isAutoRetry && body.parentRunId) {
      // Fetch parent's retry count
      const { data: parentRun } = await supabaseAdmin
        .from('generation_runs')
        .select('auto_retry_count')
        .eq('id', body.parentRunId)
        .single();
      
      autoRetryCount = (parentRun?.auto_retry_count ?? 0) + 1;
      console.log(`[generate-run] Auto-retry #${autoRetryCount} from parent ${body.parentRunId}`);
    }

    // 2) Create initial record in generation_runs
    const { data: runData, error: insertError } = await supabaseAdmin
      .from('generation_runs')
      .insert({
        project_id: body.projectId,
        run_type: body.type,
        output_type: 'image',
        phase: body.phase,
        engine: body.engine,
        engine_selected_by: body.engineSelectedBy,
        engine_reason: body.engineReason || null,
        prompt: body.prompt,
        context: body.context || null,
        payload: body,
        status: 'generating',
        input_intent: body.prompt,
        composed_prompt: body.prompt + (body.context ? `\nContexto: ${body.context}` : ''),
        verdict: 'approved',
        warnings: [],
        suggestions: [],
        parent_run_id: body.parentRunId || null,  // For regeneration chains
        preset_id: body.presetId || null,  // For editorial assistant tracking
        user_override: body.userOverride || false,  // Track if user overrode recommendation
        auto_retry_count: autoRetryCount  // Track auto-retry attempts
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[generate-run] Failed to create run record:', insertError);
      throw new Error(`Failed to create run: ${insertError.message}`);
    }

    runId = runData.id;
    console.log(`[generate-run] Created run: ${runId}`);

    // 3) Fetch canon assets for this project to build context
    const { data: canonAssets } = await supabaseAdmin
      .from('canon_assets')
      .select('asset_type, name, image_url, notes')
      .eq('project_id', body.projectId)
      .eq('is_active', true);

    // Build canon context string
    let canonContext = '';
    const canonReferenceImages: string[] = [];
    
    if (canonAssets && canonAssets.length > 0) {
      const groupedAssets: Record<string, typeof canonAssets> = {};
      for (const asset of canonAssets) {
        if (!groupedAssets[asset.asset_type]) {
          groupedAssets[asset.asset_type] = [];
        }
        groupedAssets[asset.asset_type].push(asset);
        if (asset.image_url) {
          canonReferenceImages.push(asset.image_url);
        }
      }

      canonContext = '\n\nCANON DEL PROYECTO:\n';
      for (const [type, assets] of Object.entries(groupedAssets)) {
        for (const asset of assets) {
          const typeLabel = type === 'character' ? 'Personaje' : 
                           type === 'location' ? 'Localización' : 'Estilo';
          canonContext += `- ${typeLabel}: ${asset.name}`;
          if (asset.notes) canonContext += ` -> ${asset.notes}`;
          canonContext += '\n';
        }
      }
      console.log(`[generate-run] Canon context: ${canonAssets.length} assets loaded`);
    }

    // 4) Route to existing Edge Functions based on type
    let functionName: string;
    let functionBody: Record<string, unknown>;

    // Append canon context to prompt/context
    const enhancedPrompt = body.prompt + canonContext;
    const enhancedContext = (body.context || '') + canonContext;

    switch (body.type) {
      case 'keyframe':
        functionName = 'generate-keyframe';
        functionBody = {
          shotId: body.params?.shotId,
          sceneDescription: enhancedPrompt,
          shotType: body.params?.shotType || 'medium',
          duration: body.params?.duration || 5,
          frameType: body.params?.frameType || 'initial',
          timestampSec: body.params?.timestampSec || 0,
          characters: body.params?.characters || [],
          location: body.params?.location,
          cameraMovement: body.params?.cameraMovement,
          blocking: body.params?.blocking,
          shotDetails: body.params?.shotDetails,
          previousKeyframeUrl: body.params?.previousKeyframeUrl,
          previousKeyframeData: body.params?.previousKeyframeData,
          stylePack: body.params?.stylePack,
          canonReferenceImages: canonReferenceImages.length > 0 ? canonReferenceImages : undefined
        };
        break;

      case 'character':
        functionName = 'generate-character';
        functionBody = {
          slotId: body.params?.slotId,
          characterId: body.params?.characterId,
          characterName: body.params?.characterName || 'Character',
          characterBio: body.prompt,
          slotType: body.params?.slotType || 'base_look',
          viewAngle: body.params?.viewAngle,
          expressionName: body.params?.expressionName,
          outfitDescription: body.params?.outfitDescription,
          styleToken: body.params?.styleToken,
          useReferenceAnchoring: body.params?.useReferenceAnchoring,
          referenceWeight: body.params?.referenceWeight,
          allowTextToImage: body.params?.allowTextToImage
        };
        break;

      case 'location':
        functionName = 'generate-location';
        functionBody = {
          locationName: body.params?.locationName || 'Location',
          locationDescription: body.prompt,
          viewAngle: body.params?.viewAngle || 'establishing',
          timeOfDay: body.params?.timeOfDay || 'day',
          weather: body.params?.weather || 'clear',
          styleToken: body.params?.styleToken,
          projectStyle: body.params?.projectStyle
        };
        break;

      default:
        throw new Error(`Unsupported type: ${body.type}`);
    }

    console.log(`[generate-run] Invoking ${functionName}...`);

    // Call the existing Edge Function
    const { data: fnResponse, error: fnError } = await supabaseAuthed.functions.invoke(functionName, {
      body: functionBody
    });

    if (fnError) {
      console.error(`[generate-run] ${functionName} error:`, fnError);
      throw new Error(fnError.message || `${functionName} failed`);
    }

    console.log(`[generate-run] ${functionName} response received`);

    // 4) Normalize response - extract outputUrl
    const outputUrl = 
      fnResponse?.outputUrl ||
      fnResponse?.imageUrl ||
      fnResponse?.publicUrl ||
      fnResponse?.keyframe?.image_url ||
      fnResponse?.data?.outputUrl ||
      fnResponse?.data?.imageUrl ||
      null;

    if (!outputUrl) {
      console.error(`[generate-run] No outputUrl in response:`, JSON.stringify(fnResponse).substring(0, 500));
      throw new Error('No output URL in response from generation function');
    }

    const model = fnResponse?.model || fnResponse?.data?.model || fnResponse?.metadata?.engine || null;
    const generationTimeMs = Date.now() - startTime;

    // 5) Update generation_runs with success
    const { error: updateError } = await supabaseAdmin
      .from('generation_runs')
      .update({
        output_url: outputUrl,
        model: model,
        generation_time_ms: generationTimeMs,
        status: 'generated'
      })
      .eq('id', runId);

    if (updateError) {
      console.error('[generate-run] Failed to update run:', updateError);
    }

    console.log(`[generate-run] SUCCESS: runId=${runId}, outputUrl=${outputUrl.substring(0, 80)}...`);

    // 6) Return standardized response
    return new Response(JSON.stringify({
      ok: true,
      runId,
      outputUrl,
      outputType: 'image',
      engine: body.engine,
      model,
      generationTimeMs,
      warnings: [],
      suggestions: []
    } as GenerateRunResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[generate-run] FAILED: runId=${runId}, error=${errorMessage}`);

    // Update run as failed if we have a runId
    if (runId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from('generation_runs')
          .update({
            status: 'failed',
            error: errorMessage,
            last_error: errorMessage,  // Store in dedicated column for analytics
            generation_time_ms: Date.now() - startTime
          })
          .eq('id', runId);
      } catch (updateErr) {
        console.error('[generate-run] Failed to update failed status:', updateErr);
      }
    }

    return new Response(JSON.stringify({
      ok: false,
      runId,
      error: errorMessage
    } as GenerateRunResponse), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
