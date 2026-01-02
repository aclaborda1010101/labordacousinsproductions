import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(res: unknown, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function getEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env secret: ${name}`);
  return v;
}

function base64Decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function base64UrlEncode(data: string | Uint8Array): string {
  let base64: string;
  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    let binary = '';
    for (let i = 0; i < data.length; i++) {
      binary += String.fromCharCode(data[i]);
    }
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwtRS256(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
  const pem = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "")
    .trim();

  const keyData = base64Decode(pem);
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData.buffer as ArrayBuffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );

  const signatureB64 = base64UrlEncode(new Uint8Array(signature));
  return `${unsigned}.${signatureB64}`;
}

async function getAccessTokenFromServiceAccount(): Promise<string> {
  const sa = JSON.parse(getEnv("GCP_SERVICE_ACCOUNT_JSON"));
  const now = Math.floor(Date.now() / 1000);

  const scope = "https://www.googleapis.com/auth/cloud-platform";
  const aud = "https://oauth2.googleapis.com/token";

  const jwt = await signJwtRS256(
    {
      iss: sa.client_email,
      sub: sa.client_email,
      scope,
      aud,
      iat: now,
      exp: now + 3600,
    },
    sa.private_key,
  );

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const r = await fetch(aud, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`OAuth token error: ${r.status} ${JSON.stringify(j)}`);
  return j.access_token as string;
}

// Helper: Convert image URL to base64 for Veo image-to-video
// Returns { base64, mimeType } because Veo requires mimeType
async function imageUrlToBase64(imageUrl: string): Promise<{ base64: string; mimeType: string }> {
  console.log('Converting image URL to base64 for Veo...');

  // If already a data URL, extract base64 and mimeType
  if (imageUrl.startsWith('data:')) {
    const commaIndex = imageUrl.indexOf(',');
    if (commaIndex === -1) {
      throw new Error('Invalid data URL (missing comma)');
    }
    const base64 = imageUrl.slice(commaIndex + 1);
    // Extract mime type from "data:image/png;base64,"
    const mimeMatch = imageUrl.match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    console.log('Data URL detected, mimeType:', mimeType, 'base64 length:', base64.length);
    return { base64, mimeType };
  }

  // Fetch and convert to base64
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  // Get mime type from response headers or infer from URL
  let mimeType = response.headers.get('content-type') || '';
  if (!mimeType || mimeType === 'application/octet-stream') {
    // Infer from URL extension
    if (imageUrl.includes('.png')) mimeType = 'image/png';
    else if (imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')) mimeType = 'image/jpeg';
    else if (imageUrl.includes('.webp')) mimeType = 'image/webp';
    else mimeType = 'image/png'; // Default fallback
  }

  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64 = btoa(binary);

  console.log('Image converted, mimeType:', mimeType, 'base64 length:', base64.length);
  return { base64, mimeType };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    const { prompt, seconds = 8, aspectRatio = "16:9", negativePrompt, sampleCount = 1, seed, keyframeUrl } =
      await req.json();

    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Missing prompt (string)" }, 400);
    }

    console.log("Starting Veo generation with prompt:", prompt.substring(0, 100));
    console.log("Keyframe URL provided:", keyframeUrl ? "Yes" : "No (text-to-video mode)");

    const projectId = getEnv("GCP_PROJECT_ID");
    const location = getEnv("GCP_LOCATION");
    // Use default model if VEO_MODEL_ID is not set or is a placeholder
    const rawModelId = Deno.env.get("VEO_MODEL_ID");
    const modelId = (rawModelId && rawModelId !== "VEO_MODEL_ID" && !rawModelId.includes("MODEL_ID")) 
      ? rawModelId 
      : "veo-3.1-generate-001";

    console.log(`Using project: ${projectId}, location: ${location}, model: ${modelId}`);

    const token = await getAccessTokenFromServiceAccount();
    console.log("OAuth2 token obtained successfully");

    const endpoint =
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${modelId}:predictLongRunning`;

    console.log("Calling Veo endpoint:", endpoint);

    // Build instance - with or without image
    const instance: Record<string, unknown> = { prompt };
    
    // If keyframeUrl provided, use image-to-video mode
    if (keyframeUrl) {
      try {
        const { base64, mimeType } = await imageUrlToBase64(keyframeUrl);
        instance.image = {
          bytesBase64Encoded: base64,
          mimeType: mimeType, // Required by Veo API
        };
        console.log("Image-to-video mode: keyframe attached with mimeType:", mimeType);
      } catch (imgErr) {
        console.warn("Failed to convert keyframe, falling back to text-to-video:", imgErr);
      }
    }

    // Request parameters
    const parameters: Record<string, unknown> = {
      aspectRatio,
      sampleCount,
      personGeneration: "allow_adult",
    };

    if (negativePrompt) parameters.negativePrompt = negativePrompt;
    if (seed !== undefined) parameters.seed = seed;

    const payload = {
      instances: [instance],
      parameters,
    };

    console.log("Request payload (image truncated):", JSON.stringify({
      ...payload,
      instances: payload.instances.map(i => ({
        ...i,
        image: i.image ? { bytesBase64Encoded: "[BASE64_TRUNCATED]" } : undefined
      }))
    }, null, 2));

    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const j = await r.json();
    console.log("Veo response status:", r.status);
    console.log("Veo response:", JSON.stringify(j, null, 2));

    if (!r.ok) return json({ error: "Veo start failed", details: j }, r.status);

    // CRITICAL: Guardar j.name completo, NO recortarlo
    const operationName = j?.name;
    if (!operationName || typeof operationName !== "string") {
      return json({ error: "Veo did not return operation name", raw: j }, 500);
    }

    console.log("Operation name (FULL):", operationName);

    // Devolver operationName completo para que el frontend lo guarde así
    return json({
      ok: true,
      operationName,
      raw: j,
      modelId,
      seconds,
      mode: keyframeUrl ? "image-to-video" : "text-to-video",
    });
  } catch (e) {
    console.error("veo_start error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
