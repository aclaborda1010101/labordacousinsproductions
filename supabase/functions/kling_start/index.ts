import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";
import { requireAuthOrDemo, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

interface KlingStartRequest {
  prompt: string;
  duration: number;
  keyframeUrl?: string;
  qualityMode?: 'CINE' | 'ULTRA';
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

// Helper: Convert image URL (or data URL) to raw base64 (no prefix)
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  console.log('Converting image URL to base64...');

  // If the AI returns a data URL, it already contains base64.
  if (imageUrl.startsWith('data:')) {
    const commaIndex = imageUrl.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URL (missing comma)');
    }

    const base64 = imageUrl.slice(commaIndex + 1);
    console.log('Data URL detected, using embedded base64. Length:', base64.length);
    return base64;
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const uint8Array = new Uint8Array(await response.arrayBuffer());
  const base64 = encode(uint8Array.buffer);

  console.log('Image converted to base64 successfully, length:', base64.length);
  return base64;
}

// Generate keyframe using Lovable AI - returns null if generation fails
async function generateKeyframe(prompt: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    console.warn('LOVABLE_API_KEY not configured, skipping keyframe generation');
    return null;
  }

  console.log('Generating keyframe with Lovable AI...');

  try {
    // Simplify prompt for image generation to avoid content filters
    const imagePrompt = `Professional cinematic still frame: A person in a modern office environment. 16:9 aspect ratio, film quality, natural lighting.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        messages: [{ 
          role: "user", 
          content: imagePrompt
        }],
        modalities: ["image", "text"]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('Keyframe generation failed, will use text2video:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    
    if (!imageUrl) {
      console.warn('No image URL in response, will use text2video. Response:', JSON.stringify(data, null, 2));
      return null;
    }
    
    console.log('Keyframe generated successfully');
    return imageUrl;
  } catch (error) {
    console.warn('Keyframe generation error, will use text2video:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const { userId } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const { prompt, duration, keyframeUrl, qualityMode = 'CINE' }: KlingStartRequest = await req.json();

    const KLING_ACCESS_KEY = Deno.env.get('KLING_ACCESS_KEY');
    const KLING_SECRET_KEY = Deno.env.get('KLING_SECRET_KEY');
    const KLING_BASE_URL = Deno.env.get('KLING_BASE_URL') || 'https://api.klingai.com';
    const KLING_MODEL_NAME = Deno.env.get('KLING_DEFAULT_MODEL_NAME') || 'kling-v2';
    const KLING_MODE_CINE = Deno.env.get('KLING_MODE_CINE') || 'pro';
    const KLING_MODE_ULTRA = Deno.env.get('KLING_MODE_ULTRA') || 'pro';

    if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
      console.error('Kling credentials missing');
      return new Response(JSON.stringify({
        ok: false,
        error: 'KLING_ACCESS_KEY and KLING_SECRET_KEY must be configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Select mode based on quality preset
    const mode = qualityMode === 'ULTRA' ? KLING_MODE_ULTRA : KLING_MODE_CINE;

    console.log(`Starting Kling generation (model: ${KLING_MODEL_NAME}, mode: ${mode}, duration: ${duration}s)`);

    // Generate JWT token
    const token = await makeKlingJwt(KLING_ACCESS_KEY, KLING_SECRET_KEY);

    // Check if model requires image2video (v2.x models typically do)
    const requiresImage = KLING_MODEL_NAME.includes('v2');
    
    // For v2.x models, try to generate keyframe but fallback to text2video if it fails
    let finalKeyframeUrl: string | undefined = keyframeUrl;
    if (requiresImage && !finalKeyframeUrl) {
      console.log('Model requires keyframe, attempting to generate one...');
      const generatedKeyframe = await generateKeyframe(prompt);
      if (generatedKeyframe) {
        finalKeyframeUrl = generatedKeyframe;
      } else {
        console.log('Keyframe generation failed, falling back to text2video');
      }
    }

    const requestBody: Record<string, unknown> = {
      prompt,
      duration: duration.toString(),
      aspect_ratio: "16:9",
      model_name: KLING_MODEL_NAME,
      mode
    };

    // For image2video, convert keyframe URL to base64
    if (finalKeyframeUrl) {
      console.log('Converting keyframe to base64 for Kling...');
      const imageBase64 = await imageUrlToBase64(finalKeyframeUrl);
      requestBody.image = imageBase64;
    }

    // Determine endpoint
    const useImage2Video = !!finalKeyframeUrl;
    const endpoint = useImage2Video ? 'image2video' : 'text2video';
    
    console.log(`Calling Kling ${endpoint} endpoint...`);

    const createResponse = await fetch(`${KLING_BASE_URL}/v1/videos/${endpoint}`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await createResponse.text();
    console.log('Kling response status:', createResponse.status);
    console.log('Kling response:', responseText);

    if (!createResponse.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: `Kling API error: ${createResponse.status} - ${responseText}`
      }), {
        status: createResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const createData = JSON.parse(responseText);
    const taskId = createData.data?.task_id;

    if (!taskId) {
      console.error('No task ID in Kling response:', createData);
      return new Response(JSON.stringify({
        ok: false,
        error: 'No task ID from Kling',
        response: createData
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Kling task created: ${taskId}`);

    return new Response(JSON.stringify({
      ok: true,
      taskId,
      endpoint,
      model: KLING_MODEL_NAME,
      mode,
      keyframeUrl: finalKeyframeUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in kling_start:', error);
    
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
