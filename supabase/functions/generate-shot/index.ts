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
  engine: 'veo' | 'kling' | 'lovable';
  characterRefs?: { name: string; token?: string; referenceUrl?: string }[];
  locationRef?: { name: string; token?: string; referenceUrl?: string };
  keyframeUrl?: string;
  dialogueText?: string;
  cameraMovement?: string;
  blocking?: string;
}

interface VideoResult {
  videoUrl: string | null;
  imageUrl?: string;
  thumbnailUrl?: string;
  metadata: any;
}

// Generate image using Lovable AI (Gemini)
async function generateImage(prompt: string): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  console.log('Generating image with Lovable AI...');

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
    const errorText = await response.text();
    console.error('Image generation error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    if (response.status === 402) {
      throw new Error('Payment required. Please add credits to continue.');
    }
    throw new Error(`Image generation failed: ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  
  if (!imageUrl) {
    console.error('No image URL in response:', JSON.stringify(data, null, 2));
    throw new Error('No image generated');
  }
  
  console.log('Image generated successfully');
  return imageUrl;
}

// Generate video with Veo 3.1 (external API - may fail)
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

  // Use API key authentication (not OAuth)
  const createResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${VEO_API_KEY}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio: "16:9",
        durationSeconds: duration
      }
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Veo creation error:', error);
    throw new Error(`Veo API error: ${createResponse.status}`);
  }

  const createData = await createResponse.json();
  const operationName = createData.name;

  if (!operationName) {
    throw new Error('No operation name from Veo');
  }

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${VEO_API_KEY}`, {
      headers: { "Content-Type": "application/json" }
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
      
      const videoUri = statusData.response?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) throw new Error('No video URL in Veo response');

      return {
        videoUrl: videoUri,
        thumbnailUrl: undefined,
        metadata: { engine: 'veo', operationName, duration }
      };
    }
    
    attempts++;
  }

  throw new Error('Veo generation timeout');
}

// Helper: base64url encoding for JWT
function base64url(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Helper: HMAC-SHA256 signature
async function hmacSha256(key: string, data: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return new Uint8Array(sig);
}

// Generate JWT for Kling API (AK+SK authentication)
async function makeKlingJwt(accessKey: string, secretKey: string): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

  const now = Math.floor(Date.now() / 1000);
  const payloadObj = {
    iss: accessKey,
    exp: now + 1800,  // 30 min
    nbf: now - 5
  };
  const payload = base64url(new TextEncoder().encode(JSON.stringify(payloadObj)));

  const unsigned = `${header}.${payload}`;
  const signature = base64url(await hmacSha256(secretKey, unsigned));
  return `${unsigned}.${signature}`;
}

// Helper: Convert image URL to base64
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  console.log('Converting image URL to base64...');
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const base64 = btoa(String.fromCharCode(...uint8Array));
  console.log('Image converted to base64 successfully');
  return base64;
}

// Generate video with Kling (using JWT AK+SK auth and presets)
async function generateWithKling(prompt: string, duration: number, keyframeUrl?: string, qualityMode: 'CINE' | 'ULTRA' = 'CINE'): Promise<VideoResult> {
  // Get credentials from secrets
  const KLING_ACCESS_KEY = Deno.env.get('KLING_ACCESS_KEY');
  const KLING_SECRET_KEY = Deno.env.get('KLING_SECRET_KEY');
  const KLING_BASE_URL = Deno.env.get('KLING_BASE_URL') || 'https://api.klingai.com';
  const KLING_MODEL_NAME = Deno.env.get('KLING_DEFAULT_MODEL_NAME') || 'kling-v2';
  const KLING_MODE_CINE = Deno.env.get('KLING_MODE_CINE') || 'pro';
  const KLING_MODE_ULTRA = Deno.env.get('KLING_MODE_ULTRA') || 'pro';

  if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
    throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY must be configured');
  }

  // Select mode based on quality preset
  const mode = qualityMode === 'ULTRA' ? KLING_MODE_ULTRA : KLING_MODE_CINE;

  console.log(`Generating with Kling (model: ${KLING_MODEL_NAME}, mode: ${mode})...`);

  // Generate JWT token
  const token = await makeKlingJwt(KLING_ACCESS_KEY, KLING_SECRET_KEY);

  // Check if model requires image2video (v2.x models typically do)
  const requiresImage = KLING_MODEL_NAME.includes('v2');
  
  const requestBody: Record<string, unknown> = {
    prompt,
    duration: duration.toString(),
    aspect_ratio: "16:9",
    model_name: KLING_MODEL_NAME,
    mode
  };

  // For image2video, convert keyframe URL to base64 as per Kling API requirements
  if (keyframeUrl) {
    const imageBase64 = await imageUrlToBase64(keyframeUrl);
    requestBody.image = imageBase64;
  }

  // For v2.x models, always use image2video endpoint (they don't support text2video)
  const useImage2Video = keyframeUrl || requiresImage;
  const endpoint = useImage2Video ? 'image2video' : 'text2video';
  
  // If image2video is required but no keyframe, throw helpful error
  if (useImage2Video && !keyframeUrl) {
    throw new Error(`Model ${KLING_MODEL_NAME} requires image2video - keyframeUrl is mandatory`);
  }
  const createResponse = await fetch(`${KLING_BASE_URL}/v1/videos/${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(requestBody)
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('Kling creation error:', error);
    throw new Error(`Kling API error: ${createResponse.status} - ${error}`);
  }

  const createData = await createResponse.json();
  const taskId = createData.data?.task_id;

  if (!taskId) throw new Error('No task ID from Kling');

  console.log(`Kling task created: ${taskId}`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60;

  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));

    // Regenerate JWT for each poll (in case of long running tasks)
    const pollToken = await makeKlingJwt(KLING_ACCESS_KEY, KLING_SECRET_KEY);

    const statusResponse = await fetch(`${KLING_BASE_URL}/v1/videos/${endpoint}/${taskId}`, {
      headers: { 
        "Authorization": `Bearer ${pollToken}`,
        "Accept": "application/json"
      }
    });

    if (!statusResponse.ok) {
      attempts++;
      continue;
    }

    const statusData = await statusResponse.json();
    const status = statusData.data?.task_status;

    console.log(`Kling task ${taskId} status: ${status} (attempt ${attempts + 1}/${maxAttempts})`);

    if (status === 'succeed') {
      const videoUrl = statusData.data?.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error('No video URL in Kling response');

      return {
        videoUrl,
        thumbnailUrl: statusData.data?.task_result?.videos?.[0]?.cover_image_url,
        metadata: { engine: 'kling', taskId, duration, model: KLING_MODEL_NAME, mode }
      };
    }

    if (status === 'failed') {
      throw new Error(`Kling generation failed: ${statusData.data?.task_status_msg}`);
    }

    attempts++;
  }

  throw new Error('Kling generation timeout');
}

// Generate with Lovable AI (keyframe only - always works)
async function generateWithLovable(prompt: string, duration: number): Promise<VideoResult> {
  console.log('Generating keyframe with Lovable AI...');
  
  const imageUrl = await generateImage(
    `Cinematic film still, professional cinematography: ${prompt}. 16:9 aspect ratio, high production value, dramatic lighting.`
  );
  
  return {
    videoUrl: null,
    imageUrl,
    thumbnailUrl: imageUrl,
    metadata: { engine: 'lovable', duration, type: 'keyframe' }
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: GenerateShotRequest = await req.json();
    const { 
      shotId, 
      sceneDescription, 
      shotType, 
      duration, 
      engine, 
      characterRefs, 
      locationRef, 
      keyframeUrl,
      dialogueText,
      cameraMovement,
      blocking
    } = request;

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

    if (dialogueText) {
      prompt += ` Dialogue moment: "${dialogueText}".`;
    }

    if (cameraMovement) {
      prompt += ` Camera: ${cameraMovement}.`;
    }

    if (blocking) {
      prompt += ` Blocking: ${blocking}.`;
    }

    prompt += ` Professional cinematography, high production value, ${duration} seconds duration.`;

    console.log('Prompt:', prompt);

    let result: VideoResult;

    // If engine is lovable or no external APIs work, use Lovable AI directly
    if (engine === 'lovable') {
      result = await generateWithLovable(prompt, duration);
    } else {
      // Try external engine first, fallback to Lovable AI
      try {
        // Generate keyframe first if not provided
        let finalKeyframeUrl = keyframeUrl;
        if (!finalKeyframeUrl) {
          console.log('Generating keyframe first...');
          finalKeyframeUrl = await generateImage(
            `Cinematic keyframe for: ${sceneDescription}. ${shotType} shot composition. Professional film quality, 16:9 aspect ratio.`
          );
          console.log('Keyframe generated successfully');
        }

        // For Kling engine, keyframe is mandatory (especially for v2.x models)
        if (engine === 'kling' && !finalKeyframeUrl) {
          throw new Error('Keyframe is required for Kling video generation');
        }

        if (engine === 'veo') {
          result = await generateWithVeo(prompt, duration, finalKeyframeUrl);
        } else {
          result = await generateWithKling(prompt, duration, finalKeyframeUrl);
        }

        // Add keyframe to result
        result.imageUrl = finalKeyframeUrl || undefined;
        
      } catch (videoError) {
        console.error(`${engine} video generation failed:`, videoError);
        
        // Fallback to Lovable AI keyframe
        console.log('Falling back to Lovable AI keyframe...');
        result = await generateWithLovable(prompt, duration);
        
        return new Response(JSON.stringify({
          success: true,
          fallback: true,
          videoUrl: null,
          imageUrl: result.imageUrl,
          thumbnailUrl: result.thumbnailUrl,
          error: `Video generation failed, using keyframe. Error: ${videoError instanceof Error ? videoError.message : 'Unknown'}`,
          metadata: result.metadata
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      fallback: engine === 'lovable',
      videoUrl: result.videoUrl,
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
      metadata: result.metadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-shot:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('Rate limit') ? 429 : 
                   errorMessage.includes('Payment required') ? 402 : 500;
    
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
