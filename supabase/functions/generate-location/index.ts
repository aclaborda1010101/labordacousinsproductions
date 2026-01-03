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

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Locations: flux-1.1-pro-ultra via FAL.ai (cinematic architecture, atmospheres)
const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    console.log(`Generating location image for: ${locationName}, view: ${viewAngle}, time: ${timeOfDay}, weather: ${weather}`);

    const FAL_API_KEY = Deno.env.get('FAL_API_KEY');
    if (!FAL_API_KEY) {
      throw new Error('FAL_API_KEY is not configured');
    }

    // Build the view angle description
    const viewDescriptions: Record<string, string> = {
      'establishing': 'wide establishing shot showing the full scope and environment of the location',
      'detail': 'close-up detail shot focusing on textures, materials, and distinctive features',
      '3/4': 'three-quarter angle showing depth and spatial relationships',
      'close-up': 'intimate close-up of a specific architectural or environmental element',
      'alternate': 'alternative perspective showing the location from an unexpected angle'
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

    // Construct the full prompt (FLUX-optimized)
    const prompt = `Cinematic film still, photorealistic location reference.

Location: ${locationName}
Description: ${locationDescription}

View: ${viewDesc}
Lighting: ${timeDesc}
Weather: ${weatherDesc}
${styleContext}

Ultra high resolution, 16:9 aspect ratio, professional cinematography, anamorphic lens characteristics, natural color grading, film-like depth of field, architectural accuracy, environmental storytelling.`;

    console.log('Generating with FAL FLUX prompt:', prompt.substring(0, 200) + '...');

    // Submit to FAL queue
    const submitResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: prompt,
        aspect_ratio: "16:9",
        safety_tolerance: "6",
        output_format: "jpeg",
        raw: false
      }),
    });

    if (!submitResponse.ok) {
      if (submitResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (submitResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required. Please add FAL credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await submitResponse.text();
      console.error("FAL submit error:", submitResponse.status, errorText);
      throw new Error(`FAL submit failed: ${submitResponse.status}`);
    }

    const queueData = await submitResponse.json();
    const requestId = queueData.request_id;
    console.log('[FAL] Request queued:', requestId);

    // Poll for result
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max for FLUX ultra
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}/requests/${requestId}/status`, {
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
        },
      });

      if (!statusResponse.ok) {
        attempts++;
        continue;
      }

      const status = await statusResponse.json();
      
      if (status.status === 'COMPLETED') {
        // Get result
        const resultResponse = await fetch(`https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`, {
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
          },
        });

        if (!resultResponse.ok) {
          throw new Error('Failed to get FAL result');
        }

        const result = await resultResponse.json();
        const imageUrl = result.images?.[0]?.url;
        const seed = result.seed || Math.floor(Math.random() * 999999);
        
        if (!imageUrl) {
          throw new Error('No image in FAL response');
        }

        console.log('[FAL] Location generation complete');
        
        // Log generation cost
        const userId = extractUserId(req.headers.get('authorization'));
        if (userId) {
          await logGenerationCost({
            userId,
            slotType: 'location_image',
            engine: FAL_MODEL,
            durationMs: attempts * 1000,
            success: true,
            metadata: { viewAngle, timeOfDay, weather }
          });
        }
        
        return new Response(JSON.stringify({ 
          imageUrl,
          seed,
          prompt,
          metadata: {
            viewAngle,
            timeOfDay,
            weather,
            engine: FAL_MODEL,
            generatedAt: new Date().toISOString()
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (status.status === 'FAILED') {
        throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
      }

      attempts++;
    }

    throw new Error('FAL generation timeout');

  } catch (error) {
    console.error('Error in generate-location function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
