import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { characterId } = await req.json();

    if (!characterId) {
      throw new Error('characterId is required');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Get character with reference anchors
    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('id, name')
      .eq('id', characterId)
      .single();

    if (charError || !character) {
      throw new Error('Character not found');
    }

    // 2. Get reference anchors
    const { data: anchors, error: anchorsError } = await supabase
      .from('reference_anchors')
      .select('image_url')
      .eq('character_id', characterId)
      .eq('is_active', true);

    if (anchorsError) {
      throw new Error('Failed to fetch reference anchors');
    }

    // 3. Get approved slots
    const { data: slots, error: slotsError } = await supabase
      .from('character_pack_slots')
      .select('image_url')
      .eq('character_id', characterId)
      .in('status', ['approved', 'generated'])
      .not('image_url', 'is', null);

    if (slotsError) {
      throw new Error('Failed to fetch character slots');
    }

    // 4. Collect all image URLs
    const anchorUrls = (anchors || []).map(a => a.image_url).filter(Boolean);
    const slotUrls = (slots || []).map(s => s.image_url).filter(Boolean);
    const trainingImageUrls = [...anchorUrls, ...slotUrls];

    console.log(`[LoRA Training] Character: ${character.name}`);
    console.log(`[LoRA Training] Anchor images: ${anchorUrls.length}`);
    console.log(`[LoRA Training] Slot images: ${slotUrls.length}`);
    console.log(`[LoRA Training] Total images: ${trainingImageUrls.length}`);

    // 5. Validate minimum images
    if (trainingImageUrls.length < 6) {
      throw new Error(`Need at least 6 images to train LoRA. Currently have: ${trainingImageUrls.length}`);
    }

    // 6. Create unique trigger word
    const triggerWord = `char_${character.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10)}_${Date.now().toString(36)}`;

    // 7. Check for REPLICATE_API_KEY (optional - LoRA training requires it)
    const REPLICATE_API_KEY = Deno.env.get('REPLICATE_API_KEY');
    
    if (!REPLICATE_API_KEY) {
      // If no Replicate key, mark as "ready_to_train" but don't actually train
      console.log('[LoRA Training] No REPLICATE_API_KEY - marking as ready_to_train');
      
      await supabase
        .from('characters')
        .update({
          lora_training_status: 'ready_to_train',
          lora_trigger_word: triggerWord
        })
        .eq('id', characterId);

      await supabase
        .from('lora_training_logs')
        .insert({
          character_id: characterId,
          status: 'pending',
          training_steps: 1500,
          images_used: trainingImageUrls.length,
          cost_usd: 5.00,
          training_images_urls: trainingImageUrls,
          progress_percentage: 0
        });

      return new Response(
        JSON.stringify({
          success: true,
          status: 'ready_to_train',
          message: 'LoRA training prepared. REPLICATE_API_KEY required to start training.',
          triggerWord: triggerWord,
          imagesCollected: trainingImageUrls.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Start training on Replicate
    console.log(`[LoRA Training] Starting Replicate training...`);
    console.log(`[LoRA Training] Trigger word: ${triggerWord}`);

    const trainingResponse = await fetch('https://api.replicate.com/v1/trainings', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'ostris/flux-dev-lora-trainer:4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa',
        input: {
          input_images: trainingImageUrls.join(','),
          trigger_word: triggerWord,
          steps: 1500,
          learning_rate: 0.0004,
          batch_size: 1,
          resolution: '512,768,1024',
          autocaption: true,
        },
        webhook: `${Deno.env.get('SUPABASE_URL')}/functions/v1/lora-training-webhook`,
        webhook_events_filter: ['start', 'completed']
      })
    });

    if (!trainingResponse.ok) {
      const errorText = await trainingResponse.text();
      console.error('[LoRA Training] Replicate error:', errorText);
      throw new Error(`Replicate training failed: ${trainingResponse.status}`);
    }

    const trainingData = await trainingResponse.json();
    console.log('[LoRA Training] Started:', trainingData.id);

    // 9. Update character
    await supabase
      .from('characters')
      .update({
        lora_training_status: 'training',
        lora_training_id: trainingData.id,
        lora_trigger_word: triggerWord
      })
      .eq('id', characterId);

    // 10. Create training log
    await supabase
      .from('lora_training_logs')
      .insert({
        character_id: characterId,
        status: 'training',
        training_steps: 1500,
        images_used: trainingImageUrls.length,
        cost_usd: 5.00,
        replicate_training_id: trainingData.id,
        replicate_version: 'ostris/flux-dev-lora-trainer:4ffd32160efd92e956d39c5338a9b8fbafca58e03f791f6d8011f3e20e8ea6fa',
        training_images_urls: trainingImageUrls,
        progress_percentage: 0
      });

    return new Response(
      JSON.stringify({
        success: true,
        trainingId: trainingData.id,
        triggerWord: triggerWord,
        imagesUsed: trainingImageUrls.length,
        estimatedTime: '20-30 minutes',
        status: 'training'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LoRA Training Error]', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
