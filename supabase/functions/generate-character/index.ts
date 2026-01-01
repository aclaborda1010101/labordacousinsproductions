import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CharacterRequest {
  name: string;
  role: string;
  bio: string;
  style?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, role, bio, style } = await req.json() as CharacterRequest;
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Generate detailed character description
    const descriptionPrompt = `Create a detailed visual description for an animated character for film production.

Character Name: ${name}
Role: ${role}
Background: ${bio}
Visual Style: ${style || 'Cinematic, realistic animation style'}

Generate a comprehensive visual description including:
1. Physical appearance (height, build, face shape, skin tone)
2. Hair style and color
3. Eye color and expression
4. Default clothing/costume
5. Distinguishing features
6. Body language and posture
7. Age range

Format as a single detailed paragraph optimized for AI image generation.`;

    const descResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an expert character designer for animated films. Create detailed, consistent visual descriptions.' },
          { role: 'user', content: descriptionPrompt }
        ],
      }),
    });

    if (!descResponse.ok) {
      if (descResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (descResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required. Please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error('Failed to generate description');
    }

    const descData = await descResponse.json();
    const characterDescription = descData.choices?.[0]?.message?.content || '';

    // Generate turnaround views using Gemini image generation
    const views = ['front', 'three-quarter', 'side', 'back'];
    const generatedImages: Record<string, string> = {};

    for (const view of views) {
      const imagePrompt = `${characterDescription}

View: ${view} view, full body character turnaround sheet
Style: High quality character design, clean background, professional animation reference
Lighting: Soft, even studio lighting for reference accuracy`;

      const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image-preview',
          messages: [{ role: 'user', content: imagePrompt }],
          modalities: ['image', 'text'],
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        const imageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (imageUrl) {
          generatedImages[view] = imageUrl;
        }
      }
    }

    // Generate expression sheet
    const expressionPrompt = `${characterDescription}

Expression sheet showing: neutral, happy, sad, angry, surprised, thinking
Style: Head/face only, multiple expressions in a grid, animation reference sheet
Background: Clean white background`;

    const expressionResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-image-preview',
        messages: [{ role: 'user', content: expressionPrompt }],
        modalities: ['image', 'text'],
      }),
    });

    let expressionSheet = null;
    if (expressionResponse.ok) {
      const exprData = await expressionResponse.json();
      expressionSheet = exprData.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    }

    return new Response(JSON.stringify({
      description: characterDescription,
      turnarounds: generatedImages,
      expressionSheet,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error generating character:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
