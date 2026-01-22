/**
 * AI Request Envelope - Centralized logging and error handling for all AI calls
 * 
 * Features:
 * - Sanitizes undefined values (common cause of 400 errors)
 * - Logs request_id, duration, payload/response previews
 * - Optionally persists to generation_run_logs for full observability
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export interface AiFetchOptions {
  url: string;
  apiKey: string;
  payload: Record<string, unknown>;
  label: string;
  // Optional: for persisting logs to database
  supabase?: SupabaseClient;
  projectId?: string;
  userId?: string;
}

/**
 * Extract provider from model string (e.g., "openai/gpt-5.2" -> "openai")
 */
function extractProvider(model: unknown): string {
  if (typeof model !== "string") return "unknown";
  const parts = model.split("/");
  return parts[0] || "unknown";
}

export async function aiFetch({
  url,
  apiKey,
  payload,
  label,
  supabase,
  projectId,
  userId,
}: AiFetchOptions): Promise<Record<string, unknown>> {
  const requestId = crypto.randomUUID();

  // Sanitize undefined values (common cause of 400 errors)
  const safePayload = JSON.parse(
    JSON.stringify(payload, (_k, v) => (v === undefined ? null : v))
  );

  // Convert max_tokens to max_completion_tokens for OpenAI GPT-5.x models
  const model = typeof safePayload.model === "string" ? safePayload.model : "";
  if (model.startsWith("openai/gpt-5") && safePayload.max_tokens && !safePayload.max_completion_tokens) {
    safePayload.max_completion_tokens = safePayload.max_tokens;
    delete safePayload.max_tokens;
  }

  // Remove unsupported temperature for OpenAI GPT-5 mini/nano models
  // These models only support default temperature (1)
  if ((model === "openai/gpt-5-mini" || model === "openai/gpt-5-nano") && safePayload.temperature !== undefined) {
    delete safePayload.temperature;
  }

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

  // Console logging for immediate visibility
  console.log("AI_RUN", {
    requestId,
    label,
    status: res.status,
    ok: res.ok,
    durationMs,
    payloadPreview: JSON.stringify(safePayload).slice(0, 800),
    responsePreview: text.slice(0, 800),
  });

  // Persist to generation_run_logs if supabase client provided
  if (supabase && projectId) {
    try {
      await supabase.from("generation_run_logs").insert({
        id: requestId,
        user_id: userId || "00000000-0000-0000-0000-000000000000",
        project_id: projectId,
        function_name: label,
        status: res.ok ? "success" : "error",
        provider: extractProvider(safePayload.model),
        model: typeof safePayload.model === "string" ? safePayload.model : null,
        error_code: res.ok ? null : String(res.status),
        error_message: res.ok ? null : text.slice(0, 1000),
        metadata: {
          durationMs,
          payloadPreview: JSON.stringify(safePayload).slice(0, 500),
          responsePreview: res.ok ? text.slice(0, 500) : null,
        },
        finished_at: new Date().toISOString(),
      });
    } catch (logError) {
      // Don't fail the main request if logging fails
      console.error("AI_RUN_LOG_ERROR", { requestId, error: logError });
    }
  }

  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${text}`);
  }

  return JSON.parse(text);
}
