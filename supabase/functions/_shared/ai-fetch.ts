/**
 * AI Request Envelope - Centralized logging and error handling for all AI calls
 */

export interface AiFetchOptions {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
  label: string;
}

export async function aiFetch({
  url,
  apiKey,
  payload,
  label,
}: AiFetchOptions): Promise<Record<string, unknown>> {
  const requestId = crypto.randomUUID();

  // Sanitize undefined values (common cause of 400 errors)
  const safePayload = JSON.parse(
    JSON.stringify(payload, (_k, v) => (v === undefined ? null : v))
  );

  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
    },
    body: JSON.stringify(safePayload),
  });

  const text = await res.text();
  const durationMs = Date.now() - startedAt;

  console.log("AI_RUN", {
    requestId,
    label,
    status: res.status,
    ok: res.ok,
    durationMs,
    payloadPreview: JSON.stringify(safePayload).slice(0, 800),
    responsePreview: text.slice(0, 800),
  });

  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}
