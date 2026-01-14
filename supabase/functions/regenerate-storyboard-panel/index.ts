import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { generateImageWithNanoBanana } from "../_shared/image-generator.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RegenerateRequest {
  panelId: string;
  prompt?: string;
  seed?: number;
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
      .single();

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
    const { data: scene, error: sceneError } = await supabase
      .from('scenes')
      .select('id, project_id, title, slugline, script_content, time_of_day, location_id')
      .eq('id', panel.scene_id)
      .single();

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
    const prompt = body.prompt || panel.image_prompt;

    if (!prompt) {
      throw new Error('No prompt available for this panel');
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

    // 4) Generate the image
    const seed = body.seed ?? Math.floor(Math.random() * 1000000);
    
    console.log(`[regenerate-panel] Generating image with seed ${seed}`);

    const imageResult = await generateImageWithNanoBanana({
      lovableApiKey,
      model: "google/gemini-3-pro-image-preview",
      promptText: prompt,
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
