import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, type = 'concept', projectId, conversationId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    if (!prompt) {
      throw new Error('Prompt is required');
    }

    console.log(`[Forge Visual] Generating ${type} image: ${prompt.substring(0, 100)}...`);

    // Enhance prompt based on type
    let enhancedPrompt = prompt;
    if (type === 'concept') {
      enhancedPrompt = `Concept art, professional film production style, cinematic lighting, ${prompt}`;
    } else if (type === 'storyboard') {
      enhancedPrompt = `Storyboard frame, black and white sketch style, dynamic composition, ${prompt}`;
    } else if (type === 'character') {
      enhancedPrompt = `Character design sheet, full body, professional animation style, ${prompt}`;
    } else if (type === 'location') {
      enhancedPrompt = `Environment concept art, cinematic, detailed, atmospheric, ${prompt}`;
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [
          {
            role: 'user',
            content: enhancedPrompt,
          },
        ],
        modalities: ['image', 'text'],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Forge Visual] API error:', errorText);
      throw new Error(`Image generation failed: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const textResponse = data.choices?.[0]?.message?.content || '';

    if (!imageUrl) {
      throw new Error('No image generated');
    }

    console.log(`[Forge Visual] Image generated successfully`);

    // Store in Supabase if projectId provided
    if (projectId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Upload to storage
      const base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const fileName = `forge-visual-${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('forge-visuals')
        .upload(`${projectId}/${fileName}`, binaryData, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        console.error('[Forge Visual] Storage error:', uploadError);
      } else {
        const { data: publicUrl } = supabase.storage
          .from('forge-visuals')
          .getPublicUrl(`${projectId}/${fileName}`);
        
        return new Response(JSON.stringify({
          imageUrl: publicUrl.publicUrl,
          base64: imageUrl,
          description: textResponse,
          type,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      imageUrl,
      base64: imageUrl,
      description: textResponse,
      type,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Forge Visual] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
