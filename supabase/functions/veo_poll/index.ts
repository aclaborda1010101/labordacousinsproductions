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

/**
 * Normaliza el operation name:
 * - Si ya viene completo "projects/.../operations/..." → lo usa tal cual
 * - Si viene como URL completa → extrae el path después de "/v1/"
 * - Si viene solo UUID → reconstruye el path completo
 */
function normalizeOperationName(input: string, projectId: string, location: string, modelId: string): string {
  // Caso 1: ya viene completo "projects/.../operations/..."
  if (input.startsWith("projects/")) return input;

  // Caso 2: viene como URL completa (a veces pasa)
  if (input.startsWith("https://")) {
    const idx = input.indexOf("/v1/");
    if (idx !== -1) return input.slice(idx + 4); // lo que va después de "/v1/"
  }

  // Caso 3: viene solo UUID → reconstruimos
  // Formato Veo: projects/PROJECT/locations/LOCATION/publishers/google/models/MODEL/operations/UUID
  return `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}/operations/${input}`;
}

/**
 * Extrae la región del operation name para usar el host correcto
 */
function extractLocationFromOpName(opName: string): string | null {
  const m = opName.match(/\/locations\/([^/]+)\//);
  return m?.[1] ?? null;
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

    console.log("Received operation input:", operation);

    const projectId = getEnv("GCP_PROJECT_ID");
    const defaultLocation = getEnv("GCP_LOCATION");
    // Use default model if VEO_MODEL_ID is not set or is a placeholder
    const rawModelId = Deno.env.get("VEO_MODEL_ID");
    const modelId = (rawModelId && rawModelId !== "VEO_MODEL_ID" && !rawModelId.includes("MODEL_ID")) 
      ? rawModelId 
      : "veo-3.1-generate-001";

    // Normalizar el operation name (maneja UUID solo, path completo, o URL)
    const opName = normalizeOperationName(operation, projectId, defaultLocation, modelId);
    console.log("Normalized operation name:", opName);

    // IMPORTANTÍSIMO: usar la región del operation name, no solo el secret
    const opLocation = extractLocationFromOpName(opName) ?? defaultLocation;
    console.log("Using location from operation:", opLocation);

    const token = await getAccessTokenFromServiceAccount();

    // Vertex AI LRO get: GET /v1/{name}
    // https://{location}-aiplatform.googleapis.com/v1/{operation_name}
    const url = `https://${opLocation}-aiplatform.googleapis.com/v1/${opName}`;
    console.log("Polling URL:", url);

    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    
    console.log("Poll response status:", r.status);
    
    // Check content type before parsing
    const contentType = r.headers.get("content-type") || "";
    
    if (!contentType.includes("application/json")) {
      const text = await r.text();
      console.error("Non-JSON response:", r.status, text.substring(0, 500));
      return json({
        error: "Poll returned non-JSON response",
        status: r.status,
        opName,
        url,
        contentType,
        responsePreview: text.substring(0, 200),
      }, r.status >= 400 ? r.status : 502);
    }

    const j = await r.json();
    console.log("Poll response:", JSON.stringify(j, null, 2));

    if (!r.ok) {
      return json({
        error: "Poll failed",
        status: r.status,
        opName,
        url,
        details: j,
      }, r.status);
    }

    // Respuesta exitosa
    return json({
      ok: true,
      done: Boolean(j.done),
      operation: opName,
      location: opLocation,
      result: j.response ?? null,
      metadata: j.metadata ?? null,
      raw: j,
    });
  } catch (e) {
    console.error("veo_poll error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
