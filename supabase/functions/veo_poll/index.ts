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

function extractLocation(opName: string): string | null {
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

    // Aceptar tanto "operationName" (nuevo) como "operation" (legacy) para compatibilidad
    const body = await req.json();
    const operationName = body.operationName || body.operation;
    
    if (!operationName || typeof operationName !== "string") {
      return json({ error: "Missing operationName (string)" }, 400);
    }

    console.log("Received operationName:", operationName);

    // CRÍTICO: Exigir nombre completo para evitar 404/400
    if (!operationName.startsWith("projects/")) {
      return json({
        error: "operationName must be full resource name (starts with 'projects/')",
        received: operationName,
        fix: "Guarda y envía el campo operationName tal cual te lo devuelve veo_start",
      }, 400);
    }

    const defaultLocation = getEnv("GCP_LOCATION");
    const loc = extractLocation(operationName) ?? defaultLocation;

    console.log("Using location:", loc);

    const token = await getAccessTokenFromServiceAccount();

    // Endpoint correcto: GET https://{loc}-aiplatform.googleapis.com/v1/{operationName}
    const url = `https://${loc}-aiplatform.googleapis.com/v1/${operationName}`;
    console.log("Polling URL:", url);

    const r = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

    // Loggear body SIEMPRE (para 400/404)
    const text = await r.text();
    console.log("Poll response status:", r.status);
    console.log("Poll response body:", text.substring(0, 500));
    
    let responseBody: any = null;
    try { 
      responseBody = JSON.parse(text); 
    } catch { 
      responseBody = { rawText: text.substring(0, 1000) }; 
    }

    if (!r.ok) {
      return json({
        error: "Poll failed",
        status: r.status,
        url,
        operationName,
        details: responseBody,
        hint: r.status === 404
          ? "Si esto es 404, casi siempre es: operationName mal guardado/recortado o región (host) distinta."
          : r.status === 400
          ? "Si esto es 400, suele ser nombre de recurso inválido (no uses UUID, usa operationName completo)."
          : "Error inesperado del API de Vertex AI.",
      }, r.status);
    }

    console.log("Poll successful, done:", responseBody.done);

    return json({
      ok: true,
      done: Boolean(responseBody.done),
      operationName,
      location: loc,
      result: responseBody.response ?? null,
      metadata: responseBody.metadata ?? null,
      raw: responseBody,
    });
  } catch (e) {
    console.error("veo_poll error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
