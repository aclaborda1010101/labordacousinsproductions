import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface KeyframeBatchRequest {
  scene_id: string;
  project_id: string;
  shot_ids?: string[]; // Optional: specific shots. If empty, processes all shots
}

interface ShotData {
  id: string;
  shot_no: number;
  shot_type: string;
  duration_target: number;
  camera?: any;
  camera_path?: any;
  camera_position?: any;
  camera_rotation?: any;
  lighting?: any;
  focus_config?: any;
  timing_config?: any;
  blocking?: any;
  constraints?: any;
  frame_config?: any;
}

// KEYFRAME EXECUTOR (IA 4) - Official from pipeline spec
// This prompt is for image generation, NOT for LLM reasoning
const buildKeyframePrompt = (
  shot: ShotData,
  frameType: 'start' | 'mid' | 'end',
  sceneContext: string,
  previousFrameDescription?: string
): string => {
  const timing = shot.timing_config || { start_s: 0, end_s: 5 };
  const duration = timing.end_s - timing.start_s;
  const timestamp = frameType === 'start' ? 0 : frameType === 'mid' ? duration / 2 : duration;

  // Camera info
  const camera = shot.camera || {};
  const focalMm = camera.focal_mm || 50;
  const cameraMove = shot.camera_path?.type || 'static';
  
  // Lighting info
  const lighting = shot.lighting || {};
  const lightingLook = lighting.look || 'natural soft lighting';
  
  // Blocking info
  const blocking = shot.blocking || { subjects: [], props: [] };
  const subjectsDesc = blocking.subjects?.map((s: any) => 
    `${s.id} positioned ${s.screen_pos || 'center'}, ${s.action || 'present'}`
  ).join('; ') || 'subjects in scene';
  
  const propsDesc = blocking.props?.map((p: any) => 
    `${p.id} at ${p.pos || 'in frame'}`
  ).join('; ') || '';

  // Frame info
  const frame = shot.frame_config || {};
  const shotSize = frame.size || shot.shot_type || 'MEDIUM';
  const composition = frame.composition || 'balanced composition';
  const aspectRatio = frame.aspect_ratio || '16:9';

  // Focus info
  const focus = shot.focus_config || {};
  const focusMode = focus.mode || 'follow';
  
  // Constraints for enforcement
  const constraints = shot.constraints || {};
  
  // Build CONSTRAINT BLOCK for must_keep enforcement (prepended to prompt)
  const constraintBlock = buildConstraintBlock(constraints);
  
  // Build the prompt
  let prompt = constraintBlock; // Start with enforcement block
  prompt += `Cinematic ${shotSize} shot, ${focalMm}mm lens, ${aspectRatio} aspect ratio. `;
  prompt += `${composition}. `;
  prompt += `${sceneContext}. `;
  prompt += `${subjectsDesc}. `;
  if (propsDesc) prompt += `Props: ${propsDesc}. `;
  prompt += `Lighting: ${lightingLook}. `;
  
  // Camera movement context for the specific frame
  if (cameraMove !== 'static') {
    if (frameType === 'start') {
      prompt += `Camera at starting position of ${cameraMove} movement. `;
    } else if (frameType === 'mid') {
      prompt += `Camera mid-movement during ${cameraMove}. `;
    } else {
      prompt += `Camera at end position of ${cameraMove} movement. `;
    }
  }
  
  // Focus context
  if (focus.events?.length > 0) {
    const relevantEvent = focus.events.find((e: any) => e.t_s <= timestamp) || focus.events[0];
    if (relevantEvent?.target) {
      prompt += `Focus on ${relevantEvent.target}. `;
    }
  }

  // Continuity from previous frame
  if (previousFrameDescription) {
    prompt += `Maintaining continuity: ${previousFrameDescription}. `;
  }

  // Quality markers
  prompt += `Professional cinematography, film grain, natural skin texture with visible pores, realistic lighting with proper falloff, asymmetric composition. `;
  prompt += `Ultra high resolution, cinematic color grading. `;

  return prompt;
};

// BUILD CONSTRAINT BLOCK - Injects must_keep as mandatory instructions
const buildConstraintBlock = (constraints: any): string => {
  const mustKeep = constraints?.must_keep || [];
  if (mustKeep.length === 0) return '';
  
  return `
═══════════════════════════════════════════════════════════════════════════════
CONTINUITY LOCKS - MANDATORY (DO NOT DEVIATE)
═══════════════════════════════════════════════════════════════════════════════
${mustKeep.map((lock: string) => `• MAINTAIN EXACTLY: ${lock.replace(/_/g, ' ')}`).join('\n')}
═══════════════════════════════════════════════════════════════════════════════

`;
};

const buildNegativePrompt = (constraints?: any): string => {
  const baseNegatives = [
    'smooth plastic skin', 'poreless skin', 'airbrushed face', 'perfectly symmetrical face',
    'overly bright eyes', 'CGI render', 'wax figure', 'stock photo',
    'text', 'watermark', 'logo', 'extra people', 'deformed hands', 'extra fingers',
    'jpeg artifacts', 'low quality', 'blurry', 'amateur photography',
    'centered composition without purpose', 'flat lighting', 'video game graphics'
  ];
  
  const constraintNegatives = constraints?.negatives || [];
  const mustNotDo = constraints?.must_not?.map((m: string) => m.replace(/_/g, ' ')) || [];
  
  return [...baseNegatives, ...constraintNegatives, ...mustNotDo].join(', ');
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { scene_id, project_id, shot_ids }: KeyframeBatchRequest = await req.json();

    if (!scene_id || !project_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: scene_id, project_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PRECONDITION: Check technical doc is approved or locked
    const { data: techDoc } = await supabase
      .from("scene_technical_docs")
      .select("status")
      .eq("scene_id", scene_id)
      .single();

    if (!techDoc || (techDoc.status !== 'approved' && techDoc.status !== 'locked')) {
      return new Response(
        JSON.stringify({ 
          error: "Technical Document must be approved or locked before generating keyframes",
          success: false 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch scene for context
    const { data: sceneData } = await supabase
      .from("scenes")
      .select("slugline, summary, description")
      .eq("id", scene_id)
      .single();

    const sceneContext = sceneData 
      ? `${sceneData.slugline || ''} - ${sceneData.summary || sceneData.description || ''}`
      : 'Scene context unavailable';

    // Fetch shots
    let shotsQuery = supabase
      .from("shots")
      .select("*")
      .eq("scene_id", scene_id)
      .order("shot_no", { ascending: true });

    if (shot_ids && shot_ids.length > 0) {
      shotsQuery = shotsQuery.in("id", shot_ids);
    }

    const { data: shots, error: shotsError } = await shotsQuery;

    if (shotsError || !shots || shots.length === 0) {
      return new Response(
        JSON.stringify({ error: "No shots found for this scene" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-keyframes-batch] Processing ${shots.length} shots for scene ${scene_id}`);

    const generatedKeyframes: any[] = [];
    const errors: string[] = [];

    // Process each shot
    for (const shot of shots) {
      const shotData = shot as ShotData;
      const duration = shotData.duration_target || 5;
      
      // Determine which frames to generate based on camera movement and focus events
      const frameTypes: Array<{ type: 'start' | 'mid' | 'end'; timestamp: number }> = [
        { type: 'start', timestamp: 0 },
        { type: 'mid', timestamp: duration / 2 },
        { type: 'end', timestamp: duration }
      ];

      // If there's complex camera movement or focus events, we might need more frames
      // For now, stick with 3 frames per shot
      
      let previousFrameUrl: string | null = null;
      let previousFrameDescription: string | undefined;

      for (const frame of frameTypes) {
        try {
          // Build the prompt for this keyframe
          const prompt = buildKeyframePrompt(
            shotData, 
            frame.type, 
            sceneContext,
            previousFrameDescription
          );
          
          const negativePrompt = buildNegativePrompt(shotData.constraints);

          console.log(`[generate-keyframes-batch] Generating ${frame.type} frame for shot ${shotData.shot_no}`);

          // Generate image using NanoBanana Pro 3
          const imageResponse = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${lovableApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-pro-image-preview",
              prompt: prompt,
              negative_prompt: negativePrompt,
              n: 1,
              size: "1920x1080", // 16:9 cinematic
            }),
          });

          if (!imageResponse.ok) {
            const errorText = await imageResponse.text();
            console.error(`[generate-keyframes-batch] Image generation failed:`, errorText);
            errors.push(`Shot ${shotData.shot_no} ${frame.type}: Image generation failed`);
            continue;
          }

          const imageData = await imageResponse.json();
          const imageUrl = imageData.data?.[0]?.url;

          if (!imageUrl) {
            errors.push(`Shot ${shotData.shot_no} ${frame.type}: No image URL returned`);
            continue;
          }

          // Delete existing keyframe for this shot/frame type
          await supabase
            .from("keyframes")
            .delete()
            .eq("shot_id", shotData.id)
            .eq("frame_type", frame.type);

          // Insert new keyframe
          const { data: insertedKeyframe, error: insertError } = await supabase
            .from("keyframes")
            .insert({
              shot_id: shotData.id,
              image_url: imageUrl,
              frame_type: frame.type,
              timestamp_sec: frame.timestamp,
              approved: false,
              prompt_text: prompt,
              meta_json: {
                camera: shotData.camera,
                lighting: shotData.lighting,
                focus: shotData.focus_config,
                constraints: shotData.constraints,
              },
            })
            .select()
            .single();

          if (insertError) {
            console.error(`[generate-keyframes-batch] Insert error:`, insertError);
            errors.push(`Shot ${shotData.shot_no} ${frame.type}: Failed to save keyframe`);
            continue;
          }

          generatedKeyframes.push(insertedKeyframe);
          
          // Store for continuity
          previousFrameUrl = imageUrl;
          previousFrameDescription = `Previous ${frame.type} frame established lighting, wardrobe, and positioning`;

          console.log(`[generate-keyframes-batch] Generated ${frame.type} keyframe for shot ${shotData.shot_no}`);

        } catch (frameError) {
          console.error(`[generate-keyframes-batch] Error for shot ${shotData.shot_no} ${frame.type}:`, frameError);
          errors.push(`Shot ${shotData.shot_no} ${frame.type}: ${frameError instanceof Error ? frameError.message : 'Unknown error'}`);
        }
      }
    }

    const successMessage = `Generated ${generatedKeyframes.length} keyframes for ${shots.length} shots`;
    console.log(`[generate-keyframes-batch] ${successMessage}`);

    return new Response(
      JSON.stringify({
        success: true,
        keyframes: generatedKeyframes,
        errors: errors.length > 0 ? errors : undefined,
        message: successMessage,
        stats: {
          shots_processed: shots.length,
          keyframes_generated: generatedKeyframes.length,
          errors_count: errors.length,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[generate-keyframes-batch] Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
