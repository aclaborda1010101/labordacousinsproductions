import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { 
  generateImageWithNanoBanana, 
  editImageWithNanoBanana 
} from "../_shared/image-generator.ts";

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

// ============================================================================
// STRICT CONTINUITY EDIT PROMPT - For K1/K2 frames (Δt ≤ 1s)
// Used when editing from previous frame to prevent AI hallucination
// ============================================================================
const buildInterframeEditPrompt = (
  frameType: 'mid' | 'end',
  shot: ShotData,
  sceneContext: string
): string => {
  const cameraMove = shot.camera_path?.type || 'static';
  
  return `
═══════════════════════════════════════════════════════════════════════════════
EDIT MODE: STRICT CONTINUITY (Δt = 1 second)
═══════════════════════════════════════════════════════════════════════════════

EDIT the existing storyboard keyframe image.
Time step: +1 second. Maintain STRICT continuity.

CONTEXT: ${sceneContext}
Frame position: ${frameType} (${frameType === 'mid' ? 'middle' : 'final'} frame of shot)

═══════════════════════════════════════════════════════════════════════════════
ALLOWED CHANGES ONLY (micro-movement for 1 second):
═══════════════════════════════════════════════════════════════════════════════
• Minimal natural movement (small head turn, slight hand shift, a tiny step)
• Very slight camera motion: ${cameraMove !== 'static' ? `subtle ${cameraMove}` : 'none'}
• Micro expression change if dialogue is happening
• Natural eye blink or gaze shift

═══════════════════════════════════════════════════════════════════════════════
FORBIDDEN CHANGES (ABSOLUTE - ZERO TOLERANCE):
═══════════════════════════════════════════════════════════════════════════════
• do NOT change art style (must remain EXACTLY same style as source)
• do NOT switch to photorealism or 3D render
• do NOT add or remove characters
• do NOT change any animal species (dog STAYS dog, cat STAYS cat)
• do NOT change wardrobe, props, background elements
• do NOT change lighting direction or color temperature
• do NOT change framing or shot type beyond micro camera motion
• do NOT smooth skin or add airbrushed effects
• do NOT add text, watermarks, or new props

═══════════════════════════════════════════════════════════════════════════════
CONTINUITY LOCKS (MUST MATCH SOURCE IMAGE EXACTLY):
═══════════════════════════════════════════════════════════════════════════════
• All character identities (faces, hair color, age)
• All wardrobe items (colors, textures, patterns)
• All props in scene (positions, types, colors)
• Lighting setup (direction, color, intensity)
• Background/set design
• Art style and rendering technique

Keep all identities EXACTLY the same as the source image.
This is frame continuity, NOT a new generation.
`.trim();
};

// ============================================================================
// TRANSITION EDIT PROMPT - For K1/K2 when Δt > 1s (more movement allowed)
// ============================================================================
const buildTransitionEditPrompt = (
  frameType: 'mid' | 'end',
  shot: ShotData,
  sceneContext: string
): string => {
  const cameraMove = shot.camera_path?.type || 'static';
  const duration = shot.duration_target || 5;
  
  return `
═══════════════════════════════════════════════════════════════════════════════
EDIT MODE: TRANSITION CONTINUITY (Δt > 1 second)
═══════════════════════════════════════════════════════════════════════════════

EDIT the existing keyframe image for a ${frameType} frame.
This is ${Math.round(duration / 2)}s from start. Natural movement allowed.

CONTEXT: ${sceneContext}
Camera movement: ${cameraMove}

ALLOWED CHANGES:
• Natural body movement (walking, gesturing, turning)
• Camera position change per ${cameraMove} movement
• Expression changes appropriate for scene
• Character repositioning within the set

MANDATORY CONTINUITY (NEVER CHANGE):
• Art style (SAME style as source - no switching to photorealism)
• Character identities (faces, hair, age)
• Wardrobe (exact same clothes)
• Props (same items, though positions can shift)
• Lighting type (same setup, angle may shift with camera)
• Background/location (same set)

FORBIDDEN:
• Style changes (pencil→photo, cartoon→realistic)
• Adding/removing characters
• Changing animal species
• Wardrobe changes
• Adding new props not in source
`.trim();
};

// KEYFRAME EXECUTOR - For K0 (initial frame) generation
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
    'centered composition without purpose', 'flat lighting', 'video game graphics',
    // Anti-style-drift negatives
    'photorealistic when source is stylized', 'style change', 'render style mismatch'
  ];
  
  const constraintNegatives = constraints?.negatives || [];
  const mustNotDo = constraints?.must_not?.map((m: string) => m.replace(/_/g, ' ')) || [];
  
  return [...baseNegatives, ...constraintNegatives, ...mustNotDo].join(', ');
};

// Generate deterministic seed from shot ID and frame type
const generateSeed = (shotId: string, frameType: string): number => {
  let hash = 0;
  const str = `${shotId}-${frameType}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 999999);
};

// Fetch character identity anchors for a scene
async function getCharacterAnchors(
  supabase: any, 
  sceneId: string
): Promise<string[]> {
  try {
    // Get characters from scene (via storyboard or scene_characters)
    const { data: panels } = await supabase
      .from('storyboard_panels')
      .select('characters_in_panel')
      .eq('scene_id', sceneId)
      .limit(5);
    
    // Extract unique character IDs
    const characterIds = new Set<string>();
    for (const panel of panels || []) {
      const chars = panel.characters_in_panel || [];
      for (const char of chars) {
        if (typeof char === 'string') {
          characterIds.add(char);
        } else if (char?.id) {
          characterIds.add(char.id);
        }
      }
    }
    
    if (characterIds.size === 0) return [];
    
    // Fetch approved slots for these characters
    const { data: slots } = await supabase
      .from('character_pack_slots')
      .select('image_url')
      .in('character_id', Array.from(characterIds))
      .in('slot_type', ['ref_closeup_front', 'closeup_profile', 'identity_primary'])
      .in('status', ['accepted', 'uploaded', 'generated'])
      .not('image_url', 'is', null)
      .limit(6);
    
    return (slots || [])
      .map((s: any) => s.image_url)
      .filter((url: string) => url && url.startsWith('http'));
  } catch (error) {
    console.error('[getCharacterAnchors] Error:', error);
    return [];
  }
}

// Fetch storyboard panel images for style reference
async function getStoryboardRefs(
  supabase: any,
  sceneId: string
): Promise<string[]> {
  try {
    const { data: panels } = await supabase
      .from('storyboard_panels')
      .select('image_url')
      .eq('scene_id', sceneId)
      .not('image_url', 'is', null)
      .order('panel_order', { ascending: true })
      .limit(2);
    
    return (panels || [])
      .map((p: any) => p.image_url)
      .filter((url: string) => url && url.startsWith('http'));
  } catch (error) {
    console.error('[getStoryboardRefs] Error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    
    if (!lovableApiKey) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }
    
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

    // Fetch identity anchors and storyboard refs for the scene
    const characterAnchors = await getCharacterAnchors(supabase, scene_id);
    const storyboardRefs = await getStoryboardRefs(supabase, scene_id);
    console.log(`[generate-keyframes-batch] Found ${characterAnchors.length} character anchors, ${storyboardRefs.length} storyboard refs`);

    const generatedKeyframes: any[] = [];
    const errors: string[] = [];

    // Process each shot
    for (const shot of shots) {
      const shotData = shot as ShotData;
      const duration = shotData.duration_target || 5;
      
      // Determine if strict continuity applies (Δt ≤ 1s between frames)
      // For 3 frames in a shot, if duration <= 3s, then Δt ≤ 1.5s → use strict mode
      const isStrictContinuity = duration <= 3;
      
      // Determine which frames to generate
      const frameTypes: Array<{ type: 'start' | 'mid' | 'end'; timestamp: number }> = [
        { type: 'start', timestamp: 0 },
        { type: 'mid', timestamp: duration / 2 },
        { type: 'end', timestamp: duration }
      ];
      
      let previousFrameUrl: string | null = null;

      for (const frame of frameTypes) {
        try {
          let imageUrl: string | undefined;
          const seed = generateSeed(shotData.id, frame.type);

          // ================================================================
          // CORRELATIVE KEYFRAME PIPELINE
          // K0: Generate from scratch (with refs)
          // K1/K2: Edit from previous frame (strict continuity)
          // ================================================================
          
          if (frame.type === 'start') {
            // K0: Generate initial frame (staging)
            console.log(`[generate-keyframes-batch] K0 (start) - GENERATE for shot ${shotData.shot_no}`);
            
            const prompt = buildKeyframePrompt(shotData, frame.type, sceneContext);
            const negativePrompt = buildNegativePrompt(shotData.constraints);
            
            // Combine all references: storyboard + character anchors
            const allRefs = [...storyboardRefs, ...characterAnchors].slice(0, 6);
            
            const result = await generateImageWithNanoBanana({
              lovableApiKey,
              promptText: prompt + `\n\nNEGATIVE: ${negativePrompt}`,
              referenceImageUrls: allRefs,
              seed,
              label: `keyframe_k0_shot${shotData.shot_no}`,
            });
            
            if (!result.success || !result.imageUrl) {
              throw new Error(result.error || 'K0 generation failed');
            }
            
            imageUrl = result.imageUrl;
            
          } else if (previousFrameUrl) {
            // K1/K2: Edit from previous frame
            const editPrompt = isStrictContinuity 
              ? buildInterframeEditPrompt(frame.type as 'mid' | 'end', shotData, sceneContext)
              : buildTransitionEditPrompt(frame.type as 'mid' | 'end', shotData, sceneContext);
            
            console.log(`[generate-keyframes-batch] ${frame.type.toUpperCase()} - EDIT (${isStrictContinuity ? 'strict' : 'transition'}) for shot ${shotData.shot_no}`);
            
            const result = await editImageWithNanoBanana({
              lovableApiKey,
              sourceImageUrl: previousFrameUrl,
              editInstruction: editPrompt,
              identityAnchorUrls: characterAnchors.slice(0, 4),
              seed,
              label: `keyframe_${frame.type}_shot${shotData.shot_no}`,
            });
            
            if (!result.success || !result.imageUrl) {
              throw new Error(result.error || `${frame.type} edit failed`);
            }
            
            imageUrl = result.imageUrl;
            
          } else {
            // Fallback: No previous frame available, generate instead
            console.log(`[generate-keyframes-batch] ${frame.type.toUpperCase()} - FALLBACK GENERATE (no previous) for shot ${shotData.shot_no}`);
            
            const prompt = buildKeyframePrompt(shotData, frame.type, sceneContext);
            const negativePrompt = buildNegativePrompt(shotData.constraints);
            
            const allRefs = [...storyboardRefs, ...characterAnchors].slice(0, 6);
            
            const result = await generateImageWithNanoBanana({
              lovableApiKey,
              promptText: prompt + `\n\nNEGATIVE: ${negativePrompt}`,
              referenceImageUrls: allRefs,
              seed,
              label: `keyframe_${frame.type}_fallback_shot${shotData.shot_no}`,
            });
            
            if (!result.success || !result.imageUrl) {
              throw new Error(result.error || `${frame.type} fallback generation failed`);
            }
            
            imageUrl = result.imageUrl;
          }

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

          // Build prompt for storage (documentation)
          const storedPrompt = frame.type === 'start'
            ? buildKeyframePrompt(shotData, frame.type, sceneContext)
            : `[EDIT from ${frame.type === 'mid' ? 'K0' : 'K1'}] ${isStrictContinuity ? 'Strict' : 'Transition'} continuity mode`;

          // Insert new keyframe
          const { data: insertedKeyframe, error: insertError } = await supabase
            .from("keyframes")
            .insert({
              shot_id: shotData.id,
              image_url: imageUrl,
              frame_type: frame.type,
              timestamp_sec: frame.timestamp,
              approved: false,
              prompt_text: storedPrompt,
              seed,
              meta_json: {
                camera: shotData.camera,
                lighting: shotData.lighting,
                focus: shotData.focus_config,
                constraints: shotData.constraints,
                generation_mode: frame.type === 'start' ? 'generate' : 'edit',
                continuity_mode: isStrictContinuity ? 'strict' : 'transition',
                source_frame: frame.type === 'start' ? null : (frame.type === 'mid' ? 'start' : 'mid'),
                character_anchors_count: characterAnchors.length,
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
          
          // Store for next frame's continuity
          previousFrameUrl = imageUrl;

          console.log(`[generate-keyframes-batch] Generated ${frame.type} keyframe for shot ${shotData.shot_no} (mode: ${frame.type === 'start' ? 'generate' : 'edit'})`);

        } catch (frameError) {
          console.error(`[generate-keyframes-batch] Error for shot ${shotData.shot_no} ${frame.type}:`, frameError);
          errors.push(`Shot ${shotData.shot_no} ${frame.type}: ${frameError instanceof Error ? frameError.message : 'Unknown error'}`);
        }
      }
    }

    const successMessage = `Generated ${generatedKeyframes.length} keyframes for ${shots.length} shots (correlative pipeline)`;
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
          pipeline: 'correlative_edit',
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
