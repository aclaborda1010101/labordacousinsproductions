import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

// Use flux-1.1-pro-ultra for high-quality location scouting images
const FAL_MODEL = 'fal-ai/flux-pro/v1.1-ultra';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Validate auth internally
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[generate-location] Missing or invalid Authorization header');
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 401 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await supabase.auth.getUser(token);
    if (authError || !claims?.user) {
      console.error('[generate-location] Invalid JWT:', authError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized', code: 401 }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-location] Authenticated user: ${claims.user.id}`);

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

    const FAL_KEY = Deno.env.get('FAL_API_KEY') || Deno.env.get('FAL_KEY');
    if (!FAL_KEY) {
      throw new Error('FAL_API_KEY is not configured');
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
    const prompt = `Cinematic film still, location scouting photograph.

Location: ${locationName}
Description: ${locationDescription || locationName}

View: ${viewDesc}
Lighting: ${timeDesc}
Weather: ${weatherDesc}
${styleContext}

Ultra high resolution, 16:9 aspect ratio, professional cinematography, anamorphic lens characteristics, natural color grading, film-like depth of field, architectural accuracy, environmental storytelling.`;

    console.log('[generate-location] Using FAL flux-pro-ultra with prompt:', prompt.substring(0, 150) + '...');

    // Call FAL AI for flux-1.1-pro-ultra
    const response = await fetch('https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        aspect_ratio: '16:9',
        safety_tolerance: 5,
        output_format: 'jpeg',
        raw: false
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-location] FAL error:', response.status, errorText);
      throw new Error(`FAL AI failed: ${response.status} - ${errorText}`);
    }

    // Safely parse JSON response
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[generate-location] Failed to parse FAL response:', responseText.substring(0, 500));
      throw new Error(`FAL returned invalid JSON: ${responseText.substring(0, 200)}`);
    }
    
    // Handle FAL async queue response
    if (result.request_id) {
      // Poll for result
      const requestId = result.request_id;
      console.log('[generate-location] FAL request queued:', requestId);
      
      let attempts = 0;
      const maxAttempts = 60; // 60 seconds max
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const statusResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${requestId}/status`, {
          headers: {
            'Authorization': `Key ${FAL_KEY}`,
          },
        });
        
        // Safely parse status response
        const statusText = await statusResponse.text();
        let status;
        try {
          status = JSON.parse(statusText);
        } catch (parseError) {
          console.error('[generate-location] Failed to parse status response:', statusText.substring(0, 200));
          attempts++;
          continue;
        }
        
        if (status.status === 'COMPLETED') {
          // Get result
          const resultResponse = await fetch(`https://queue.fal.run/fal-ai/flux-pro/v1.1-ultra/requests/${requestId}`, {
            headers: {
              'Authorization': `Key ${FAL_KEY}`,
            },
          });
          
          // Safely parse final result
          const finalText = await resultResponse.text();
          let finalResult;
          try {
            finalResult = JSON.parse(finalText);
          } catch (parseError) {
            console.error('[generate-location] Failed to parse final result:', finalText.substring(0, 200));
            throw new Error('FAL returned invalid JSON for completed request');
          }
          const imageUrl = finalResult.images?.[0]?.url;
          
          if (!imageUrl) {
            throw new Error('No image URL in FAL response');
          }
          
          const generationTimeMs = Date.now() - startTime;
          console.log(`[generate-location] Complete in ${generationTimeMs}ms`);
          
          // Log generation cost
          const userId = extractUserId(req.headers.get('authorization'));
          if (userId) {
            await logGenerationCost({
              userId,
              slotType: 'location_image',
              engine: 'flux-1.1-pro-ultra',
              durationMs: generationTimeMs,
              success: true,
              metadata: { viewAngle, timeOfDay, weather }
            });
          }
          
          return new Response(JSON.stringify({ 
            imageUrl,
            seed: finalResult.seed || Math.floor(Math.random() * 999999),
            prompt,
            metadata: {
              viewAngle,
              timeOfDay,
              weather,
              engine: 'flux-1.1-pro-ultra',
              generatedAt: new Date().toISOString(),
              generationTimeMs
            }
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else if (status.status === 'FAILED') {
          throw new Error(`FAL generation failed: ${status.error || 'Unknown error'}`);
        }
        
        attempts++;
      }
      
      throw new Error('FAL generation timed out');
    }
    
    // Direct response (no queue)
    const imageUrl = result.images?.[0]?.url;
    
    if (!imageUrl) {
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
        engine: 'flux-1.1-pro-ultra',
        durationMs: generationTimeMs,
        success: true,
        metadata: { viewAngle, timeOfDay, weather }
      });
    }

    return new Response(JSON.stringify({ 
      imageUrl,
      seed: result.seed || Math.floor(Math.random() * 999999),
      prompt,
      metadata: {
        viewAngle,
        timeOfDay,
        weather,
        engine: 'flux-1.1-pro-ultra',
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
