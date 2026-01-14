/**
 * GENERATE-MICROSHOT-KEYFRAMES Edge Function
 * A/B Pipeline: Paso A (Staging) + Paso B (Identity Fix)
 * Generates keyframes per microshot with full context from storyboard + tech doc + identity pack
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateRequest {
  microShotId?: string;
  shotId?: string;
  keyframeRole?: 'initial' | 'final' | 'all';
  skipIdentityFix?: boolean;
}

interface IdentityAnchor {
  characterId: string;
  characterName: string;
  urls: string[];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ============= PROMPT BUILDERS =============

function buildStagingPrompt(context: {
  shotType: string;
  focalMm: number;
  cameraMovement: string;
  cameraHeight: string;
  lightingLook: string;
  focusTarget: string;
  actionBeat: string;
  cameraBeat: string;
  mustKeep: string[];
  negatives: string[];
  storyboardStyle?: string;
}): string {
  const mustKeepBlock = context.mustKeep.length > 0
    ? `\nCONTINUITY LOCKS - MANDATORY:\n${context.mustKeep.map(l => `• MAINTAIN EXACTLY: ${l}`).join('\n')}`
    : '';

  const negativesBlock = context.negatives.length > 0
    ? `\nNEGATIVES:\n${context.negatives.join(', ')}`
    : '';

  return `Generate a single keyframe for this microshot (16:9 aspect ratio).
Priority: exact camera framing, blocking, props continuity, lighting and style.
Do NOT finalize character faces. Facial detail can be minimal in this pass.
Maintain storyboard style and composition.
${mustKeepBlock}
${negativesBlock}

TECHNICAL SPECS:
- Shot type: ${context.shotType}
- Lens: ${context.focalMm}mm
- Camera height: ${context.cameraHeight}
- Camera movement: ${context.cameraMovement}
- Lighting: ${context.lightingLook}
- Focus target: ${context.focusTarget}
${context.storyboardStyle ? `- Visual style: ${context.storyboardStyle}` : ''}

BEAT:
- Action: ${context.actionBeat}
- Camera: ${context.cameraBeat}

Generate a high-quality cinematic keyframe following these exact specifications.`;
}

function buildIdentityFixPrompt(characterName: string): string {
  return `EDIT the existing keyframe image.
Allowed changes ONLY: face + hairline + hairstyle details + eyebrows + eyes + ears + minimal neckline alignment if needed.
Forbidden: do NOT change camera/framing/composition/background/props/lighting/shading style/body pose/wardrobe.
Match ${characterName} identity EXACTLY to the provided reference images.
No age shift. No hair drift. No wardrobe changes.
The character must look like the same person as in the reference images.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!lovableApiKey) {
      return json({ ok: false, error: 'LOVABLE_API_KEY not configured' }, 500);
    }

    const { microShotId, shotId, keyframeRole = 'all', skipIdentityFix = false } = await req.json() as GenerateRequest;

    if (!microShotId && !shotId) {
      return json({ ok: false, error: 'microShotId or shotId is required' }, 400);
    }

    // 1. Fetch microshots to process
    let microShots: any[] = [];
    
    if (microShotId) {
      const { data, error } = await supabase
        .from('micro_shots')
        .select('*')
        .eq('id', microShotId);
      if (error) throw error;
      microShots = data || [];
    } else if (shotId) {
      const { data, error } = await supabase
        .from('micro_shots')
        .select('*')
        .eq('shot_id', shotId)
        .order('sequence_no', { ascending: true });
      if (error) throw error;
      microShots = data || [];
    }

    if (microShots.length === 0) {
      return json({ ok: false, error: 'No microshots found' }, 404);
    }

    // 2. Fetch shot and scene context
    const firstMs = microShots[0];
    const { data: shot, error: shotError } = await supabase
      .from('shots')
      .select(`
        *,
        scenes!inner(
          id, slugline, summary, project_id, scene_no, episode_no,
          character_ids, location_id, time_of_day
        )
      `)
      .eq('id', firstMs.shot_id)
      .single();

    if (shotError || !shot) {
      return json({ ok: false, error: `Shot not found: ${shotError?.message}` }, 404);
    }

    const sceneId = shot.scenes.id;
    const projectId = shot.scenes.project_id;

    // 3. Fetch technical doc for constraints
    const { data: techDoc } = await supabase
      .from('scene_technical_docs')
      .select('*')
      .eq('scene_id', sceneId)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    // Extract technical shot data
    const techShots = (techDoc?.shots as any[]) || [];
    const shotIdx = shot.technical_shot_idx ?? (shot.shot_no - 1);
    const techShot = techShots[shotIdx] || {};

    // 4. Fetch storyboard panel for visual reference
    const { data: storyboardPanels } = await supabase
      .from('storyboard_panels')
      .select('*')
      .eq('scene_id', sceneId)
      .eq('status', 'approved')
      .order('panel_order', { ascending: true });

    const referencePanel = storyboardPanels?.[shotIdx] || storyboardPanels?.[0];

    // 5. Fetch character identity anchors
    const characterIds = shot.scenes.character_ids || [];
    const identityAnchors: IdentityAnchor[] = [];

    if (characterIds.length > 0) {
      // Fetch character pack slots for identity
      const { data: characters } = await supabase
        .from('characters')
        .select('id, name')
        .in('id', characterIds);

      for (const char of (characters || [])) {
        const { data: slots } = await supabase
          .from('character_pack_slots')
          .select('image_url, slot_type')
          .eq('character_id', char.id)
          .in('slot_type', ['ref_closeup_front', 'closeup_front', 'closeup_profile', 'identity_primary'])
          .in('status', ['accepted', 'uploaded', 'generated'])
          .limit(3);

        if (slots && slots.length > 0) {
          identityAnchors.push({
            characterId: char.id,
            characterName: char.name,
            urls: slots.map(s => s.image_url).filter(Boolean) as string[]
          });
        }
      }
    }

    // 6. Build context for generation
    const camera = shot.camera || {};
    const lighting = shot.lighting || {};
    const blocking = shot.blocking || {};
    const constraints = techShot.constraints || blocking.constraints || {};

    const context = {
      shotType: shot.shot_type || 'Medium',
      focalMm: camera.focal_mm || 35,
      cameraMovement: camera.movement || 'Static',
      cameraHeight: camera.height || 'EyeLevel',
      lightingLook: lighting.style || 'Naturalistic_Daylight',
      focusTarget: blocking.focus?.target || 'subject',
      actionBeat: '',
      cameraBeat: '',
      mustKeep: constraints.must_keep || [],
      negatives: constraints.negatives || [],
      storyboardStyle: referencePanel?.style_preset,
    };

    // 7. Process each microshot
    const results: any[] = [];
    let previousEndKeyframeUrl: string | null = null;

    for (let i = 0; i < microShots.length; i++) {
      const ms = microShots[i];
      
      // Update microshot pipeline status
      await supabase
        .from('micro_shots')
        .update({ keyframe_pipeline_status: 'staging' })
        .eq('id', ms.id);

      // Set action/camera beats from microshot or generate defaults
      context.actionBeat = ms.action_beat || ms.motion_notes || `Microshot ${ms.sequence_no} action`;
      context.cameraBeat = ms.camera_beat || camera.movement || 'maintain framing';

      // Determine which keyframes to generate
      const keyframesToGenerate: ('initial' | 'final')[] = [];
      if (keyframeRole === 'all' || keyframeRole === 'initial') keyframesToGenerate.push('initial');
      if (keyframeRole === 'all' || keyframeRole === 'final') keyframesToGenerate.push('final');

      for (const role of keyframesToGenerate) {
        // Check if we can reuse previous end as current start (chain hard)
        const canReuse = role === 'initial' && i > 0 && previousEndKeyframeUrl;
        
        let keyframeId = role === 'initial' ? ms.keyframe_initial_id : ms.keyframe_final_id;
        let stagingUrl: string | null = null;
        let finalUrl: string | null = null;
        
        // Identity fix metrics (declared at outer scope for keyframe save)
        let identityFixAttempts = 0;
        let identityFixEngineModel = '';
        let identityFixLatencyMs = 0;

        if (canReuse && previousEndKeyframeUrl) {
          // Reuse previous end keyframe
          console.log(`[generate-microshot-keyframes] Reusing previous end keyframe for MS ${ms.sequence_no}`);
          finalUrl = previousEndKeyframeUrl;
        } else {
          // ============= PASO A: STAGING =============
          console.log(`[generate-microshot-keyframes] Paso A (Staging) for MS ${ms.sequence_no} ${role}`);

          const stagingPrompt = buildStagingPrompt(context);
          
          // Build multimodal content with storyboard reference
          const contentParts: any[] = [{ type: 'text', text: stagingPrompt }];
          
          if (referencePanel?.image_url) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: referencePanel.image_url }
            });
          }

          const stagingResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-3-pro-image-preview',
              messages: [{ role: 'user', content: contentParts }],
              modalities: ['image', 'text'],
            }),
          });

          if (!stagingResponse.ok) {
            console.error('[generate-microshot-keyframes] Staging generation failed');
            await supabase
              .from('micro_shots')
              .update({ keyframe_pipeline_status: 'failed' })
              .eq('id', ms.id);
            results.push({ microShotId: ms.id, role, status: 'staging_failed' });
            continue;
          }

          const stagingData = await stagingResponse.json();
          const stagingImage = stagingData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

          if (!stagingImage) {
            console.error('[generate-microshot-keyframes] No staging image generated');
            results.push({ microShotId: ms.id, role, status: 'no_staging_image' });
            continue;
          }

          stagingUrl = stagingImage;

          // ============= PASO B: IDENTITY FIX =============
          if (!skipIdentityFix && identityAnchors.length > 0) {
            console.log(`[generate-microshot-keyframes] Paso B (Identity Fix) for MS ${ms.sequence_no} ${role}`);

            await supabase
              .from('micro_shots')
              .update({ keyframe_pipeline_status: 'identity_fix' })
              .eq('id', ms.id);

            // Use first character for identity fix (primary subject)
            const primaryAnchor = identityAnchors[0];
            const identityPrompt = buildIdentityFixPrompt(primaryAnchor.characterName);

            const identityContent: any[] = [
              { type: 'text', text: identityPrompt },
              { type: 'image_url', image_url: { url: stagingImage } }
            ];

            // Add identity anchor images (max 3)
            for (const anchorUrl of primaryAnchor.urls.slice(0, 3)) {
              identityContent.push({
                type: 'image_url',
                image_url: { url: anchorUrl }
              });
            }

            // Track metrics for traceability
            identityFixAttempts = 1;
            identityFixEngineModel = 'google/gemini-3-pro-image-preview';
            const fixStartTime = Date.now();

            const identityResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: identityFixEngineModel,
                messages: [{ role: 'user', content: identityContent }],
                modalities: ['image', 'text'],
              }),
            });

            identityFixLatencyMs = Date.now() - fixStartTime;

            if (identityResponse.ok) {
              const identityData = await identityResponse.json();
              const fixedImage = identityData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
              
              if (fixedImage) {
                finalUrl = fixedImage;
              } else {
                // Fall back to staging if identity fix failed
                console.log('[generate-microshot-keyframes] Identity fix returned no image, using staging');
                finalUrl = stagingUrl;
              }
            } else {
              // Fall back to staging if identity fix failed
              console.log('[generate-microshot-keyframes] Identity fix failed, using staging');
              finalUrl = stagingUrl;
            }
          } else {
            // No identity fix needed or skipped
            finalUrl = stagingUrl;
          }
        }

        // 8. Upload to storage and create/update keyframe record
        let storedUrl: string | null = finalUrl;
        
        if (finalUrl?.startsWith('data:')) {
          // Upload base64 to storage
          const base64Data = finalUrl.split(',')[1];
          const fileName = `keyframes/${projectId}/${ms.id}_${role}_${Date.now()}.png`;
          
          const { error: uploadError } = await supabase.storage
            .from('project-assets')
            .upload(fileName, Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)), {
              contentType: 'image/png',
              upsert: true
            });

          if (!uploadError) {
            const { data: urlData } = supabase.storage
              .from('project-assets')
              .getPublicUrl(fileName);
            storedUrl = urlData.publicUrl;
          }
        }

        // Update or create keyframe with identity fix metrics
        if (keyframeId) {
          await supabase
            .from('keyframes')
            .update({
              image_url: storedUrl,
              staging_image_url: stagingUrl,
              identity_status: skipIdentityFix ? 'pending' : (finalUrl !== stagingUrl ? 'fixed' : 'failed'),
              identity_anchors: identityAnchors.map(a => ({ characterId: a.characterId, urls: a.urls })),
              identity_fix_attempts: identityFixAttempts,
              identity_fix_engine_model: identityFixEngineModel || null,
              identity_fix_latency_ms: identityFixLatencyMs || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', keyframeId);
        } else {
          // Create new keyframe with metrics
          const { data: newKf } = await supabase
            .from('keyframes')
            .insert({
              shot_id: ms.shot_id,
              micro_shot_id: ms.id,
              chain_role: role,
              image_url: storedUrl,
              staging_image_url: stagingUrl,
              identity_status: skipIdentityFix ? 'pending' : (finalUrl !== stagingUrl ? 'fixed' : 'failed'),
              identity_anchors: identityAnchors.map(a => ({ characterId: a.characterId, urls: a.urls })),
              identity_fix_attempts: identityFixAttempts,
              identity_fix_engine_model: identityFixEngineModel || null,
              identity_fix_latency_ms: identityFixLatencyMs || null,
              timestamp_sec: role === 'initial' ? ms.start_sec : ms.end_sec,
              approved: false
            })
            .select()
            .single();

          if (newKf) {
            // Link keyframe to microshot
            const updateField = role === 'initial' ? 'keyframe_initial_id' : 'keyframe_final_id';
            await supabase
              .from('micro_shots')
              .update({ [updateField]: newKf.id })
              .eq('id', ms.id);
            
            keyframeId = newKf.id;
          }
        }

        // Track for chaining
        if (role === 'final') {
          previousEndKeyframeUrl = storedUrl;
        }

        results.push({
          microShotId: ms.id,
          role,
          keyframeId,
          status: 'success',
          stagingUrl,
          finalUrl: storedUrl,
          identityFixed: !skipIdentityFix && identityAnchors.length > 0
        });
      }

      // Update microshot status
      await supabase
        .from('micro_shots')
        .update({ keyframe_pipeline_status: 'complete' })
        .eq('id', ms.id);
    }

    return json({
      ok: true,
      processed: microShots.length,
      results,
      identityAnchorsUsed: identityAnchors.length,
      message: `Generated keyframes for ${microShots.length} microshots using A/B pipeline`
    });

  } catch (error) {
    console.error('[generate-microshot-keyframes] Error:', error);
    return json({ 
      ok: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, 500);
  }
});
