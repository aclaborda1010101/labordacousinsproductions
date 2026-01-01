import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateShotRequest {
  shotId: string;
  sceneDescription: string;
  shotType: string;
  duration: number;
  engine: 'veo' | 'kling';
  characterRefs?: { name: string; token?: string; referenceUrl?: string }[];
  locationRef?: { name: string; token?: string; referenceUrl?: string };
  keyframeUrl?: string;
}

interface VideoResult {
  videoUrl: string;
  thumbnailUrl?: string;
  metadata: any;
}

// Generate keyframe fallback using Lovable AI
async function generateKeyframe(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"]
    }),
  });

  if (!response.ok) {
    throw new Error(`Keyframe generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!imageUrl) throw new Error('No keyframe generated');
  return imageUrl;
}

// Generate video with Veo 3.1
async function generateWithVeo(prompt: string, duration: number, keyframeUrl?: string): Promise<VideoResult> {
  const VEO_API_KEY = Deno.env.get('VEO_API_KEY');
  if (!VEO_API_KEY) throw new Error('VEO_API_KEY not configured');

  console.log('Generating with Veo 3.1...');

  const requestBody: any = {
    prompt,
    duration_seconds: duration,
    aspect_ratio: "16:9",
    model: "veo-3.1"
  };

  if (keyframeUrl) {
    requestBody.image_url = keyframeUrl;
  }

  const createResponse = await fetch("https://api.veo.google/v1/videos/generate", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VEO_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Veo creation error:', error);
    throw new Error(`Veo API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  const operationId = createData.name || createData.operation_id;

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusResponse = await fetch(`https://api.veo.google/v1/operations/${operationId}`, {
      headers: { "Authorization": `Bearer ${VEO_API_KEY}` }
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const statusData = await statusResponse.json();
    
    if (statusData.done) {
      if (statusData.error) {
        throw new Error(`Veo generation failed: ${statusData.error.message}`);
      }
      
      const videoUrl = statusData.response?.video_url || statusData.result?.video_url;
      if (!videoUrl) throw new Error('No video URL in Veo response');

      return {
        videoUrl,
        thumbnailUrl: statusData.response?.thumbnail_url,
        metadata: { engine: 'veo', operationId, duration }
      };
    }
    
    attempts++;
  }

  throw new Error('Veo generation timeout');
}

// Generate video with Kling 2.0
async function generateWithKling(prompt: string, duration: number, keyframeUrl?: string): Promise<VideoResult> {
  const KLING_API_KEY = Deno.env.get('KLING_API_KEY');
  if (!KLING_API_KEY) throw new Error('KLING_API_KEY not configured');

  console.log('Generating with Kling 2.0...');

  const requestBody: any = {
    prompt,
    duration: duration.toString(),
    aspect_ratio: "16:9",
    model_name: "kling-v2"
  };

  if (keyframeUrl) {
    requestBody.image_url = keyframeUrl;
  }

  const createResponse = await fetch("https://api.klingai.com/v1/videos/image2video", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${KLING_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Kling creation error:', error);
    throw new Error(`Kling API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.data?.task_id;

  if (!taskId) throw new Error('No task ID from Kling');

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));

    const statusResponse = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { "Authorization": `Bearer ${KLING_API_KEY}` }
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const statusData = await statusResponse.json();
    const status = statusData.data?.task_status;

    if (status === 'succeed') {
      const videoUrl = statusData.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error('No video URL in Kling response');

      return {
        videoUrl,
        thumbnailUrl: statusData.data?.task_result?.videos?.[0]?.cover_image_url,
        metadata: { engine: 'kling', taskId, duration }
      };
    }

    if (status === 'failed') {
      throw new Error(`Kling generation failed: ${statusData.data?.task_status_msg}`);
    }

    attempts++;
  }

  throw new Error('Kling generation timeout');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: GenerateShotRequest = await req.json();
    const { shotId, sceneDescription, shotType, duration, engine, characterRefs, locationRef, keyframeUrl } = request;

    console.log(`Generating shot ${shotId} with ${engine}, duration: ${duration}s`);

    // Build detailed prompt
    let prompt = `Cinematic ${shotType} shot: ${sceneDescription}`;

    if (characterRefs && characterRefs.length > 0) {
      const charDescs = characterRefs.map(c => c.token || c.name).join(', ');
      prompt += ` Characters: ${charDescs}.`;
    }

    if (locationRef) {
      prompt += ` Location: ${locationRef.token || locationRef.name}.`;
    }

    prompt += ` Professional cinematography, high production value, ${duration} seconds duration.`;

    console.log('Prompt:', prompt);

    // Determine keyframe to use
    let finalKeyframeUrl = keyframeUrl;

    // If no keyframe provided, generate one first
    if (!finalKeyframeUrl) {
      console.log('Generating keyframe first...');
      try {
        finalKeyframeUrl = await generateKeyframe(
          `Cinematic keyframe for: ${sceneDescription}. ${shotType} shot composition. Professional film quality, 16:9 aspect ratio.`
        );
        console.log('Keyframe generated successfully');
      } catch (e) {
        console.warn('Keyframe generation failed, proceeding with text-to-video:', e);
      }
    }

    // Generate video with selected engine
    let result: VideoResult;

    try {
      if (engine === 'veo') {
        result = await generateWithVeo(prompt, duration, finalKeyframeUrl);
      } else {
        result = await generateWithKling(prompt, duration, finalKeyframeUrl);
      }
    } catch (videoError) {
      console.error(`${engine} video generation failed:`, videoError);
      
      // Return keyframe as fallback if video fails
      if (finalKeyframeUrl) {
        return new Response(JSON.stringify({
          success: true,
          fallback: true,
          keyframeUrl: finalKeyframeUrl,
          videoUrl: null,
          error: `Video generation failed, using keyframe fallback`,
          metadata: { engine, shotId, duration }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw videoError;
    }

    return new Response(JSON.stringify({
      success: true,
      fallback: false,
      videoUrl: result.videoUrl,
      thumbnailUrl: result.thumbnailUrl,
      keyframeUrl: finalKeyframeUrl,
      metadata: result.metadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-shot:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
