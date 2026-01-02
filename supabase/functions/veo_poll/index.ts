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
 * Extrae componentes del operation name
 */
function parseOperationName(opName: string): { projectId: string | null; location: string | null; operationId: string | null } {
  const projectMatch = opName.match(/projects\/([^/]+)/);
  const locationMatch = opName.match(/locations\/([^/]+)/);
  const operationMatch = opName.match(/operations\/([^/]+)$/);
  
  return {
    projectId: projectMatch?.[1] ?? null,
    location: locationMatch?.[1] ?? null,
    operationId: operationMatch?.[1] ?? null,
  };
}

/**
 * Intenta hacer polling con múltiples formatos de URL
 */
async function tryPolling(opName: string, token: string, defaultProjectId: string, defaultLocation: string): Promise<Response> {
  const { projectId, location, operationId } = parseOperationName(opName);
  const effectiveProjectId = projectId || defaultProjectId;
  const effectiveLocation = location || defaultLocation;
  
  // Lista de URLs a intentar en orden de prioridad
  const urlsToTry = [
    // Formato 1: Path completo tal como viene (publishers/google/models/.../operations/...)
    `https://${effectiveLocation}-aiplatform.googleapis.com/v1/${opName}`,
    
    // Formato 2: LRO estándar de Vertex AI (projects/.../locations/.../operations/...)
    operationId ? `https://${effectiveLocation}-aiplatform.googleapis.com/v1/projects/${effectiveProjectId}/locations/${effectiveLocation}/operations/${operationId}` : null,
    
    // Formato 3: Generative Language API (para algunos modelos Veo)
    operationId ? `https://generativelanguage.googleapis.com/v1beta/operations/${operationId}` : null,
  ].filter(Boolean) as string[];
  
  let lastError: { url: string; status: number; response: string } | null = null;
  
  for (const url of urlsToTry) {
    console.log(`Trying polling URL: ${url}`);
    
    const r = await fetch(url, { 
      headers: { authorization: `Bearer ${token}` } 
    });
    
    console.log(`Response status for ${url}: ${r.status}`);
    
    // Si es exitoso, retornar
    if (r.ok) {
      const contentType = r.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await r.json();
        console.log("Successful poll response:", JSON.stringify(data, null, 2));
        return new Response(JSON.stringify({
          ok: true,
          done: Boolean(data.done),
          operation: opName,
          location: effectiveLocation,
          usedUrl: url,
          result: data.response ?? null,
          metadata: data.metadata ?? null,
          raw: data,
        }), {
          status: 200,
          headers: { ...corsHeaders, "content-type": "application/json" },
        });
      }
    }
    
    // Guardar el error para reportar si todos fallan
    const text = await r.text();
    lastError = { url, status: r.status, response: text.substring(0, 300) };
    console.log(`URL ${url} failed: ${r.status}`);
  }
  
  // Todos fallaron
  return new Response(JSON.stringify({
    error: "All polling URLs failed",
    operation: opName,
    urlsTried: urlsToTry,
    lastError,
  }), {
    status: 404,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
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
    const location = getEnv("GCP_LOCATION");

    // Normalizar: si es solo UUID, convertir a path completo
    let opName = operation;
    if (!operation.startsWith("projects/") && !operation.startsWith("https://")) {
      // Es solo un UUID, reconstruir
      const rawModelId = Deno.env.get("VEO_MODEL_ID");
      const modelId = (rawModelId && rawModelId !== "VEO_MODEL_ID" && !rawModelId.includes("MODEL_ID")) 
        ? rawModelId 
        : "veo-3.1-generate-001";
      opName = `projects/${projectId}/locations/${location}/publishers/google/models/${modelId}/operations/${operation}`;
      console.log("Reconstructed operation name from UUID:", opName);
    } else if (operation.startsWith("https://")) {
      // Es una URL, extraer el path
      const idx = operation.indexOf("/v1/");
      if (idx !== -1) {
        opName = operation.slice(idx + 4);
        console.log("Extracted operation name from URL:", opName);
      }
    }

    const token = await getAccessTokenFromServiceAccount();
    
    // Intentar múltiples formatos de polling
    return await tryPolling(opName, token, projectId, location);
    
  } catch (e) {
    console.error("veo_poll error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
