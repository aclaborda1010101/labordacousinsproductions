import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LocationGenerationRequest {
  locationName: string;
  locationDescription: string;
  viewAngle: string;
  timeOfDay?: string;
  weather?: string;
  styleToken?: string;
  projectStyle?: {
    colorPalette?: any;
    lensStyle?: string;
    grainLevel?: string;
  };
}

// Use Lovable AI (Nano Banana) for faster generation
const LOVABLE_MODEL = 'google/gemini-2.5-flash-image-preview';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { 
      locationName, 
      locationDescription, 
      viewAngle, 
      timeOfDay = 'day',
      weather = 'clear',
      styleToken,
      projectStyle 
    }: LocationGenerationRequest = await req.json();

    console.log(`[generate-location] Generating: ${locationName}, view: ${viewAngle}, time: ${timeOfDay}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Build the view angle description
    const viewDescriptions: Record<string, string> = {
      'establishing': 'wide establishing shot showing the full scope and environment',
      'detail': 'close-up detail shot focusing on textures and distinctive features',
      '3/4': 'three-quarter angle showing depth and spatial relationships',
      'close-up': 'intimate close-up of a specific architectural element',
      'alternate': 'alternative perspective from an unexpected angle'
    };

    const viewDesc = viewDescriptions[viewAngle] || viewAngle;

    // Build the time of day description
    const timeDescriptions: Record<string, string> = {
      'day': 'bright daylight, natural sunlight',
      'night': 'nighttime with artificial lighting and moonlight',
      'dawn': 'early morning golden hour light, warm tones',
      'dusk': 'evening golden hour, warm sunset colors'
    };

    const timeDesc = timeDescriptions[timeOfDay] || timeOfDay;

    // Build the weather description
    const weatherDescriptions: Record<string, string> = {
      'clear': 'clear weather',
      'rain': 'rainy conditions with wet surfaces',
      'fog': 'foggy atmospheric conditions',
      'overcast': 'overcast sky with diffused lighting',
      'snow': 'snowy conditions with snow coverage'
    };

    const weatherDesc = weatherDescriptions[weather] || weather;

    // Build style context
    let styleContext = '';
    if (projectStyle) {
      if (projectStyle.lensStyle) {
        styleContext += ` Shot with ${projectStyle.lensStyle} lens style.`;
      }
      if (projectStyle.grainLevel && projectStyle.grainLevel !== 'none') {
        styleContext += ` Apply ${projectStyle.grainLevel} film grain.`;
      }
    }
    if (styleToken) {
      styleContext += ` Apply visual style token: ${styleToken}.`;
    }

    // Construct the prompt
    const prompt = `Generate a cinematic film still of a location for production reference.

Location: ${locationName}
Description: ${locationDescription || locationName}

View: ${viewDesc}
Lighting: ${timeDesc}
Weather: ${weatherDesc}
${styleContext}

Ultra high resolution, 16:9 aspect ratio, professional cinematography, anamorphic lens characteristics, natural color grading, film-like depth of field, architectural accuracy, environmental storytelling.`;

    console.log('[generate-location] Using Lovable AI with prompt:', prompt.substring(0, 150) + '...');

    // Call Lovable AI Gateway
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        modalities: ['image', 'text']
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-location] Lovable AI error:', response.status, errorText);
      throw new Error(`Lovable AI failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const imageData = result.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      console.error('[generate-location] No image in response:', JSON.stringify(result).substring(0, 500));
      throw new Error('No image generated');
    }

    const generationTimeMs = Date.now() - startTime;
    console.log(`[generate-location] Complete in ${generationTimeMs}ms`);

    // Log generation cost
    const userId = extractUserId(req.headers.get('authorization'));
    if (userId) {
      await logGenerationCost({
        userId,
        slotType: 'location_image',
        engine: LOVABLE_MODEL,
        durationMs: generationTimeMs,
        success: true,
        metadata: { viewAngle, timeOfDay, weather }
      });
    }

    return new Response(JSON.stringify({ 
      imageUrl: imageData,
      seed: Math.floor(Math.random() * 999999),
      prompt,
      metadata: {
        viewAngle,
        timeOfDay,
        weather,
        engine: LOVABLE_MODEL,
        generatedAt: new Date().toISOString(),
        generationTimeMs
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-location] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
