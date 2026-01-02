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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "Use POST" }, 405);

    const { operation } = await req.json();
    if (!operation || typeof operation !== "string") {
      return json({ error: "Missing operation (string)" }, 400);
    }

    console.log("Polling Veo operation:", operation);

    const location = getEnv("GCP_LOCATION");
    const token = await getAccessTokenFromServiceAccount();

    // Operation name comes as:
    // "projects/.../locations/.../publishers/google/models/.../operations/..."
    // We need to extract just the operation path and use the correct endpoint
    
    // Try multiple URL formats for compatibility
    // Format 1: Full path as returned by predictLongRunning
    let url = `https://${location}-aiplatform.googleapis.com/v1/${operation}`;
    
    // If operation contains full URL-like path, extract location from it
    const locationMatch = operation.match(/locations\/([^\/]+)/);
    const operationLocation = locationMatch ? locationMatch[1] : location;
    
    // Alternative: Use the operation as a direct path
    // For Veo, the correct endpoint format may be:
    // https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/operations/{op_id}
    
    // Extract operation ID from the full path
    const opIdMatch = operation.match(/operations\/([^\/]+)$/);
    const operationId = opIdMatch ? opIdMatch[1] : null;
    
    // Extract project ID from the operation path
    const projectMatch = operation.match(/projects\/([^\/]+)/);
    const projectId = projectMatch ? projectMatch[1] : null;
    
    if (operationId && projectId) {
      // Try the simpler operations endpoint format first
      const alternativeUrl = `https://${operationLocation}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${operationLocation}/operations/${operationId}`;
      console.log("Trying alternative operations URL:", alternativeUrl);
      
      const altResponse = await fetch(alternativeUrl, {
        headers: { authorization: `Bearer ${token}` },
      });
      
      if (altResponse.ok) {
        console.log("Alternative URL succeeded");
        url = alternativeUrl;
        const j = await altResponse.json();
        console.log("Poll response:", JSON.stringify(j, null, 2));
        
        return json({
          ok: true,
          done: Boolean(j.done),
          operation,
          result: j.response ?? null,
          metadata: j.metadata ?? null,
          raw: j,
        });
      } else {
        console.log("Alternative URL failed with status:", altResponse.status);
      }
    }
    
    console.log("Using original polling URL:", url);

    const r = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });

    console.log("Poll response status:", r.status);
    
    // Check content type before parsing
    const contentType = r.headers.get("content-type") || "";
    const responseText = await r.text();
    
    console.log("Poll response content-type:", contentType);
    console.log("Poll response text (first 500 chars):", responseText.substring(0, 500));
    
    // If not JSON, return error with details
    if (!contentType.includes("application/json")) {
      console.error("Non-JSON response from Veo API");
      return json({ 
        error: "Non-JSON response from Veo API", 
        status: r.status,
        contentType,
        responsePreview: responseText.substring(0, 200)
      }, 502);
    }
    
    let j;
    try {
      j = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError);
      return json({ 
        error: "Failed to parse API response", 
        responsePreview: responseText.substring(0, 200)
      }, 502);
    }
    
    console.log("Poll response:", JSON.stringify(j, null, 2));

    if (!r.ok) return json({ error: "Poll failed", details: j }, r.status);

    // When done, j.done = true and result is in j.response
    // Format varies: sometimes bytesBase64Encoded or GCS uri
    return json({
      ok: true,
      done: Boolean(j.done),
      operation,
      result: j.response ?? null,
      metadata: j.metadata ?? null,
      raw: j,
    });
  } catch (e) {
    console.error("veo_poll error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
