import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateImageWithNanoBanana } from "../_shared/image-generator.ts";
import { 
  buildStoryboardImagePrompt,
  getDefaultStylePackLock,
  type PanelSpec,
} from "../_shared/storyboard-prompt-builder.ts";
import { generateSeed } from "../_shared/storyboard-serializer.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegenerateRequest {
  panelId: string;
  prompt?: string;
  seed?: number;
  storyboard_style?: 'GRID_SHEET_V1' | 'TECH_PAGE_V1';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let panelId: string | undefined;

  try {
    const body: RegenerateRequest = await req.json();
    panelId = body.panelId;

    if (!panelId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required field: panelId'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[regenerate-panel] Starting for panel ${panelId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 1) Fetch panel WITHOUT invalid joins - only use real FK relationships
    const { data: panel, error: panelError } = await supabase
      .from('storyboard_panels')
      .select(`
        id,
        scene_id,
        panel_no,
        panel_code,
        shot_hint,
        panel_intent,
        image_prompt,
        characters_present,
        props_present,
        staging,
        continuity,
        approved,
        image_url,
        image_status
      `)
      .eq('id', panelId)
      .maybeSingle();

    if (panelError || !panel) {
      console.error(`[regenerate-panel] Panel not found:`, panelError);
      return new Response(JSON.stringify({
        success: false,
        error: `Panel not found: ${panelError?.message || 'unknown'}`
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2) Fetch scene using valid FK (panel.scene_id -> scenes.id)
    // Only select columns that actually exist in the scenes table
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('id, project_id, slugline, summary, scene_no, episode_no, time_of_day, location_id, mood')
      .eq('id', panel.scene_id)
      .maybeSingle();

    if (sceneError || !scene) {
      console.error(`[regenerate-panel] Scene not found:`, sceneError);
      return new Response(JSON.stringify({
        success: false,
        error: `Scene not found for panel: ${sceneError?.message || 'unknown'}`
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const projectId = scene.project_id;
    const sceneId = scene.id;

    // ========== DETERMINISTIC PROMPT FALLBACK ==========
    // 1) Start with explicit prompt or stored image_prompt
    let promptText = (body.prompt || panel.image_prompt || "").trim();

    // 2) If no prompt available, rebuild using panel data (same logic as generate-storyboard)
    if (!promptText) {
      console.log(`[regenerate-panel] No stored prompt, rebuilding from panel data`);
      
      const storyboardStyle = body.storyboard_style || 'GRID_SHEET_V1';
      
      // Build minimal PanelSpec from available panel data
      const panelSpec: PanelSpec = {
        panel_code: panel.panel_code || `P${panel.panel_no}`,
        shot_hint: panel.shot_hint || 'PM',
        panel_intent: panel.panel_intent || '',
        action: panel.panel_intent || 'Action',
        dialogue_snippet: undefined,
        characters_present: (panel.characters_present || []).map((c: any) => 
          typeof c === 'string' ? c : c.character_id
        ),
        props_present: (panel.props_present || []).map((p: any) => 
          typeof p === 'string' ? p : p.prop_id
        ),
        staging: panel.staging || {
          spatial_info: '',
          movement_arrows: [],
          axis_180: { enabled: false, screen_direction: 'left_to_right' },
        },
        continuity: panel.continuity || {
          must_match_previous: ['hair', 'wardrobe'],
          do_not_change: ['age'],
        },
      };

      // Build prompt using the same builder as generate-storyboard
      promptText = buildStoryboardImagePrompt({
        storyboard_style: storyboardStyle,
        style_pack_lock: getDefaultStylePackLock(),
        location_lock: undefined,
        cast: [],
        characters_present_ids: panelSpec.characters_present,
        panel_spec: panelSpec,
      });
      
      console.log(`[regenerate-panel] Rebuilt prompt (${promptText.length} chars)`);
    }

    // 3) ULTRA-MINIMAL FALLBACK if builders somehow returned empty (should never happen)
    if (!promptText) {
      promptText = [
        "Professional pencil storyboard panel, grayscale, clean linework, no color.",
        `Panel P${panel.panel_no}.`,
        panel.shot_hint ? `Shot type: ${panel.shot_hint}.` : "",
        panel.panel_intent ? `Intent: ${panel.panel_intent}.` : "",
        panel.staging?.movement_arrows?.length 
          ? `Movement: ${JSON.stringify(panel.staging.movement_arrows)}` 
          : ""
      ].filter(Boolean).join(" ");
      
      console.log(`[regenerate-panel] Using ultra-minimal fallback prompt`);
    }

    // 4) Persist rebuilt prompt for future regenerations
    if (!panel.image_prompt || panel.image_prompt.trim() !== promptText) {
      await supabase
        .from("storyboard_panels")
        .update({ image_prompt: promptText.substring(0, 2000) })
        .eq("id", panelId);
    }

    console.log(`[regenerate-panel] Panel ${panel.panel_no}, scene ${sceneId}, project ${projectId}`);

    // 3) Mark panel as generating
    await supabase
      .from('storyboard_panels')
      .update({ 
        image_status: 'generating',
        image_error: null 
      })
      .eq('id', panelId);

    // 4) Generate the image with deterministic seed
    const seed = body.seed ?? generateSeed(sceneId, 'GRID_SHEET_V1', panel.panel_no);
    
    console.log(`[regenerate-panel] Generating image with seed ${seed}`);

    const imageResult = await generateImageWithNanoBanana({
      lovableApiKey,
      model: "google/gemini-3-pro-image-preview",
      promptText,
      seed,
      label: `storyboard_panel_${panel.panel_no}`,
      supabase,
      projectId,
    });

    console.log(`[regenerate-panel] Image result:`, {
      success: imageResult.success,
      hasUrl: !!imageResult.imageUrl,
      hasBase64: !!imageResult.imageBase64,
      error: imageResult.error?.slice(0, 200)
    });

    if (!imageResult.success || (!imageResult.imageUrl && !imageResult.imageBase64)) {
      await supabase
        .from('storyboard_panels')
        .update({ 
          image_status: 'error',
          image_error: imageResult.error || 'No image generated'
        })
        .eq('id', panelId);

      return new Response(JSON.stringify({
        success: false,
        error: imageResult.error || 'Image generation failed'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5) Upload to storage if we have base64
    let finalImageUrl = imageResult.imageUrl;

    if (imageResult.imageBase64) {
      const fileName = `storyboard/${projectId}/${sceneId}/panel_${panel.panel_no}_${Date.now()}.png`;
      
      console.log(`[regenerate-panel] Uploading to ${fileName}`);

      const imageBuffer = Uint8Array.from(atob(imageResult.imageBase64), c => c.charCodeAt(0));
      
      const { error: uploadError } = await supabase.storage
        .from('project-assets')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          upsert: true
        });

      if (uploadError) {
        console.error(`[regenerate-panel] Upload error:`, uploadError);
        finalImageUrl = `data:image/png;base64,${imageResult.imageBase64}`;
      } else {
        const { data: urlData } = supabase.storage
          .from('project-assets')
          .getPublicUrl(fileName);
        
        finalImageUrl = urlData.publicUrl;
        console.log(`[regenerate-panel] Uploaded successfully: ${finalImageUrl.slice(0, 80)}...`);
      }
    }

    // 6) Update panel with success
    const { error: updateError } = await supabase
      .from('storyboard_panels')
      .update({
        image_url: finalImageUrl,
        image_status: 'success',
        image_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', panelId);

    if (updateError) {
      console.error(`[regenerate-panel] Update error:`, updateError);
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`[regenerate-panel] SUCCESS in ${generationTimeMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      panelId,
      imageUrl: finalImageUrl,
      generationTimeMs
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[regenerate-panel] FAILED:`, errorMessage);

    if (panelId) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);
        
        await supabase
          .from('storyboard_panels')
          .update({ 
            image_status: 'error',
            image_error: errorMessage.slice(0, 500)
          })
          .eq('id', panelId);
      } catch {
        // Ignore
      }
    }

    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
