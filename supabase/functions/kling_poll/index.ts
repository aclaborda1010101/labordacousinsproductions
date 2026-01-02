import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuthOrDemo, authErrorResponse } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-demo-key',
};

interface KlingPollRequest {
  taskId: string;
  endpoint: 'image2video' | 'text2video';
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

// Generate JWT for Kling API
async function makeKlingJwt(accessKey: string, secretKey: string): Promise<string> {
  const header = base64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));

  const now = Math.floor(Date.now() / 1000);
  const payloadObj = {
    iss: accessKey,
    exp: now + 1800,
    nbf: now - 5
  };
  const payload = base64url(new TextEncoder().encode(JSON.stringify(payloadObj)));

  const unsigned = `${header}.${payload}`;
  const signature = base64url(await hmacSha256(secretKey, unsigned));
  return `${unsigned}.${signature}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check (even if verify_jwt=false in config)
    const { userId } = await requireAuthOrDemo(req);
    console.log("[AUTH] Authenticated user:", userId);

    const { taskId, endpoint }: KlingPollRequest = await req.json();

    if (!taskId) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'taskId is required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!endpoint || (endpoint !== 'image2video' && endpoint !== 'text2video')) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'endpoint must be image2video or text2video'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const KLING_ACCESS_KEY = Deno.env.get('KLING_ACCESS_KEY');
    const KLING_SECRET_KEY = Deno.env.get('KLING_SECRET_KEY');
    const KLING_BASE_URL = Deno.env.get('KLING_BASE_URL') || 'https://api.klingai.com';

    if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Kling credentials not configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate fresh JWT token
    const token = await makeKlingJwt(KLING_ACCESS_KEY, KLING_SECRET_KEY);

    const pollUrl = `${KLING_BASE_URL}/v1/videos/${endpoint}/${taskId}`;
    console.log('Polling Kling:', pollUrl);

    const statusResponse = await fetch(pollUrl, {
      headers: { 
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json"
      }
    });

    const responseText = await statusResponse.text();
    console.log('Kling poll status:', statusResponse.status);

    if (!statusResponse.ok) {
      console.error('Kling poll error:', responseText);
      return new Response(JSON.stringify({
        ok: false,
        done: false,
        error: `Kling poll error: ${statusResponse.status}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const statusData = JSON.parse(responseText);
    const status = statusData.data?.task_status;
    const statusMsg = statusData.data?.task_status_msg;

    console.log(`Kling task ${taskId} status: ${status} - ${statusMsg || ''}`);

    if (status === 'succeed') {
      const videoUrl = statusData.data?.task_result?.videos?.[0]?.url;
      const coverUrl = statusData.data?.task_result?.videos?.[0]?.cover_image_url;
      const videoDuration = statusData.data?.task_result?.videos?.[0]?.duration;

      if (!videoUrl) {
        console.error('No video URL in Kling response:', statusData);
        return new Response(JSON.stringify({
          ok: true,
          done: true,
          error: 'No video URL in response'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        done: true,
        videoUrl,
        coverUrl,
        duration: videoDuration,
        taskId
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (status === 'failed') {
      return new Response(JSON.stringify({
        ok: true,
        done: true,
        error: `Kling generation failed: ${statusMsg || 'Unknown error'}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Still processing
    return new Response(JSON.stringify({
      ok: true,
      done: false,
      status,
      statusMsg,
      taskId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in kling_poll:', error);

    if (error instanceof Error) {
      return authErrorResponse(error, corsHeaders);
    }

    return new Response(JSON.stringify({
      ok: false,
      done: false,
      error: 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
