import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireAuthOrDemo, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

interface RunwayStartRequest {
  prompt: string;
  duration: number;
  keyframeUrl?: string;      // Initial keyframe (image-to-video)
  keyframeTailUrl?: string;  // Final keyframe for A→B transition
  aspectRatio?: string;
}

// Helper: Convert image URL to base64 data URL for Runway API
async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  console.log('Converting image URL to data URL for Runway...');

  // If already a data URL, return as-is
  if (imageUrl.startsWith('data:')) {
    console.log('Already a data URL');
    return imageUrl;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'image/png';
  const uint8Array = new Uint8Array(await response.arrayBuffer());
  const base64 = encode(uint8Array.buffer);
  
  const dataUrl = `data:${contentType};base64,${base64}`;
  console.log('Image converted to data URL. Length:', dataUrl.length);
  return dataUrl;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const { userId } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const { 
      prompt, 
      duration = 5, 
      keyframeUrl, 
      keyframeTailUrl,
      aspectRatio = '16:9'
    }: RunwayStartRequest = await req.json();

    const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY');

    if (!RUNWAY_API_KEY) {
      console.error('RUNWAY_API_KEY not configured');
      return new Response(JSON.stringify({
        ok: false,
        error: 'RUNWAY_API_KEY must be configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Starting Runway generation (duration: ${duration}s, hasInitial: ${!!keyframeUrl}, hasTail: ${!!keyframeTailUrl})`);

    // Build request body for Runway Gen-3 API
    // Runway uses 'promptImage' for initial frame, 'promptEndImage' for end frame (A→B transition)
    const requestBody: Record<string, unknown> = {
      promptText: prompt,
      model: 'gen3a_turbo', // Gen-3 Alpha Turbo (fastest)
      duration: duration, // 5 or 10 seconds
      ratio: aspectRatio === '16:9' ? '1280:768' : aspectRatio === '9:16' ? '768:1280' : '1280:768',
    };

    // Add initial keyframe (image-to-video)
    if (keyframeUrl) {
      console.log('Converting initial keyframe for Runway...');
      const imageDataUrl = await imageUrlToDataUrl(keyframeUrl);
      requestBody.promptImage = imageDataUrl;
    }

    // Add tail keyframe for A→B transition (Start & End Frame feature)
    if (keyframeTailUrl) {
      console.log('Converting tail keyframe for A→B transition...');
      const tailDataUrl = await imageUrlToDataUrl(keyframeTailUrl);
      requestBody.promptEndImage = tailDataUrl;
      console.log('Tail keyframe added for frame-to-frame transition');
    }

    console.log('Calling Runway Gen-3 API...');

    const createResponse = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await createResponse.text();
    console.log('Runway response status:', createResponse.status);
    console.log('Runway response:', responseText.substring(0, 500));

    if (!createResponse.ok) {
      // Parse error for more context
      let errorMessage = `Runway API error: ${createResponse.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      
      return new Response(JSON.stringify({
        ok: false,
        error: errorMessage
      }), {
        status: createResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let createData: any = null;
    try {
      createData = JSON.parse(responseText);
    } catch (e) {
      console.warn('Failed to JSON.parse Runway response:', e);
      return new Response(JSON.stringify({
        ok: false,
        error: 'Invalid JSON response from Runway'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Runway returns { id: "task_xxx", status: "PENDING" }
    const taskId = createData.id;

    if (!taskId) {
      console.error('No task ID in Runway response:', createData);
      return new Response(JSON.stringify({
        ok: false,
        error: 'No task ID from Runway',
        response: createData
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Runway task created: ${taskId}`);

    return new Response(JSON.stringify({
      ok: true,
      taskId,
      model: 'gen3a_turbo',
      hasInitialKeyframe: !!keyframeUrl,
      hasTailKeyframe: !!keyframeTailUrl,
      isTransition: !!(keyframeUrl && keyframeTailUrl)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in runway_start:', error);
    
    if (error instanceof Error) {
      return authErrorResponse(error, corsHeaders);
    }
    
    return new Response(JSON.stringify({
      ok: false,
      error: 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
