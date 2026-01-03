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
    const webhook = await req.json();

    console.log('[LoRA Webhook] Received:', webhook.status, webhook.id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Find the training log
    const { data: log } = await supabase
      .from('lora_training_logs')
      .select('character_id')
      .eq('replicate_training_id', webhook.id)
      .single();

    if (!log) {
      console.error('[LoRA Webhook] Training log not found:', webhook.id);
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (webhook.status === 'succeeded') {
      const loraUrl = webhook.output?.weights || webhook.output?.version;

      if (!loraUrl) {
        console.error('[LoRA Webhook] No LoRA weights URL in output:', JSON.stringify(webhook.output));
        throw new Error('No LoRA weights URL in webhook output');
      }

      console.log('[LoRA Webhook] Training completed:', loraUrl);

      // Update character
      await supabase
        .from('characters')
        .update({
          lora_training_status: 'completed',
          lora_url: loraUrl,
          lora_trained_at: new Date().toISOString()
        })
        .eq('lora_training_id', webhook.id);

      // Update log
      await supabase
        .from('lora_training_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          progress_percentage: 100
        })
        .eq('replicate_training_id', webhook.id);

    } else if (webhook.status === 'failed') {
      console.error('[LoRA Webhook] Training failed:', webhook.error);

      // Find character by training ID first
      const { data: charData } = await supabase
        .from('characters')
        .select('id')
        .eq('lora_training_id', webhook.id)
        .single();

      if (charData) {
        await supabase
          .from('characters')
          .update({
            lora_training_status: 'failed'
          })
          .eq('id', charData.id);
      }

      // Update log
      await supabase
        .from('lora_training_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: webhook.error || 'Training failed'
        })
        .eq('replicate_training_id', webhook.id);

    } else if (webhook.status === 'processing') {
      // Extract progress from logs if available
      const progressMatch = webhook.logs?.match(/(\d+)%/);
      const progress = progressMatch ? parseInt(progressMatch[1]) : null;
      
      if (progress !== null) {
        await supabase
          .from('lora_training_logs')
          .update({
            progress_percentage: progress
          })
          .eq('replicate_training_id', webhook.id);
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[LoRA Webhook Error]', error);
    return new Response(
      JSON.stringify({ 
        received: true, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
