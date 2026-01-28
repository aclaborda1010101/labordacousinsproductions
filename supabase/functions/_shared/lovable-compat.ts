/**
 * Lovable Compatibility Layer
 * 
 * Provides Lovable-like interface but uses direct API calls.
 * Drop-in replacement for LOVABLE_API_KEY dependent code.
 */

// Model mapping: Lovable fictional → Real models
const MODEL_MAP: Record<string, { provider: string; model: string }> = {
  // OpenAI models
  "openai/gpt-5.2": { provider: "openai", model: "gpt-4o" },
  "openai/gpt-5": { provider: "openai", model: "gpt-4o" },
  "openai/gpt-5-mini": { provider: "openai", model: "gpt-4o-mini" },
  "openai/gpt-5-nano": { provider: "openai", model: "gpt-4o-mini" },
  
  // Google models
  "google/gemini-3-flash-preview": { provider: "google", model: "gemini-2.0-flash" },
  "google/gemini-3-pro-image-preview": { provider: "google-imagen", model: "imagen-3.0-generate-002" },
  "google/gemini-2.5-flash": { provider: "google", model: "gemini-2.0-flash" },
  "google/gemini-2.5-flash-lite": { provider: "google", model: "gemini-2.0-flash" },
  
  // Anthropic
  "anthropic/claude-opus": { provider: "anthropic", model: "claude-opus-4-20250514" },
  "anthropic/claude-sonnet": { provider: "anthropic", model: "claude-sonnet-4-20250514" },
  "anthropic/claude-haiku": { provider: "anthropic", model: "claude-haiku-4-5-20250514" },
};

interface ChatMessage {
  role: string;
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  response_format?: { type: string };
  tools?: any[];
  tool_choice?: any;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
      tool_calls?: any[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

function getApiKey(provider: string): string {
  const envKeys: Record<string, string[]> = {
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY"],
    anthropic: ["ANTHROPIC_API_KEY"],
  };
  
  for (const key of envKeys[provider] || []) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  
  // Fallback to LOVABLE_API_KEY if direct keys not available
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) return lovableKey;
  
  throw new Error(`No API key found for provider: ${provider}. Set ${envKeys[provider]?.[0] || "API key"}`);
}

function resolveModel(model: string): { provider: string; realModel: string; useLovable: boolean } {
  // Check if we have direct API keys
  const hasOpenAI = !!Deno.env.get("OPENAI_API_KEY");
  const hasGoogle = !!Deno.env.get("GOOGLE_AI_API_KEY") || !!Deno.env.get("GEMINI_API_KEY");
  const hasAnthropic = !!Deno.env.get("ANTHROPIC_API_KEY");
  const hasLovable = !!Deno.env.get("LOVABLE_API_KEY");
  
  const mapped = MODEL_MAP[model];
  if (mapped) {
    // Check if we can use direct API
    if (mapped.provider === "openai" && hasOpenAI) {
      return { provider: "openai", realModel: mapped.model, useLovable: false };
    }
    if (mapped.provider === "google" && hasGoogle) {
      return { provider: "google", realModel: mapped.model, useLovable: false };
    }
    if (mapped.provider === "anthropic" && hasAnthropic) {
      return { provider: "anthropic", realModel: mapped.model, useLovable: false };
    }
  }
  
  // Fallback to Lovable if available
  if (hasLovable) {
    return { provider: "lovable", realModel: model, useLovable: true };
  }
  
  // Try to use whatever direct API is available
  if (hasGoogle) {
    return { provider: "google", realModel: "gemini-2.0-flash", useLovable: false };
  }
  if (hasOpenAI) {
    return { provider: "openai", realModel: "gpt-4o-mini", useLovable: false };
  }
  if (hasAnthropic) {
    return { provider: "anthropic", realModel: "claude-sonnet-4-20250514", useLovable: false };
  }
  
  throw new Error("No API keys configured. Set GOOGLE_AI_API_KEY, OPENAI_API_KEY, or LOVABLE_API_KEY");
}

async function callOpenAI(request: ChatCompletionRequest, apiKey: string, realModel: string): Promise<ChatCompletionResponse> {
  const payload: Record<string, unknown> = {
    model: realModel,
    messages: request.messages,
    max_tokens: request.max_tokens || request.max_completion_tokens || 4096,
  };
  
  if (request.temperature !== undefined) payload.temperature = request.temperature;
  if (request.response_format) payload.response_format = request.response_format;
  if (request.tools) payload.tools = request.tools;
  if (request.tool_choice) payload.tool_choice = request.tool_choice;
  
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${error}`);
  }
  
  return response.json();
}

async function callGoogle(request: ChatCompletionRequest, apiKey: string, realModel: string): Promise<ChatCompletionResponse> {
  // Convert OpenAI format to Google format
  const contents = request.messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: typeof m.content === "string" 
        ? [{ text: m.content }]
        : m.content.filter(c => c.type === "text").map(c => ({ text: c.text || "" })),
    }));
  
  // Extract system prompt
  const systemMsg = request.messages.find(m => m.role === "system");
  const systemInstruction = systemMsg 
    ? { parts: [{ text: typeof systemMsg.content === "string" ? systemMsg.content : "" }] }
    : undefined;
  
  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: request.max_tokens || request.max_completion_tokens || 4096,
      temperature: request.temperature ?? 0.7,
    },
  };
  
  if (systemInstruction) payload.systemInstruction = systemInstruction;
  
  // Handle JSON mode
  if (request.response_format?.type === "json_object") {
    (payload.generationConfig as Record<string, unknown>).responseMimeType = "application/json";
  }
  
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${realModel}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google AI error ${response.status}: ${error}`);
  }
  
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  
  // Convert to OpenAI format
  return {
    choices: [{
      message: { role: "assistant", content: text },
      finish_reason: "stop",
    }],
  };
}

async function callAnthropic(request: ChatCompletionRequest, apiKey: string, realModel: string): Promise<ChatCompletionResponse> {
  const systemMsg = request.messages.find(m => m.role === "system");
  const otherMsgs = request.messages.filter(m => m.role !== "system");
  
  const payload: Record<string, unknown> = {
    model: realModel,
    max_tokens: request.max_tokens || request.max_completion_tokens || 4096,
    system: systemMsg ? (typeof systemMsg.content === "string" ? systemMsg.content : "") : "",
    messages: otherMsgs.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: typeof m.content === "string" ? m.content : m.content.map(c => c.text || "").join("\n"),
    })),
  };
  
  // Add tools support for Anthropic (convert from OpenAI format)
  if (request.tools && request.tools.length > 0) {
    payload.tools = request.tools.map((tool: any) => ({
      name: tool.function.name,
      description: tool.function.description || "",
      input_schema: tool.function.parameters || { type: "object", properties: {} },
    }));
    
    // Handle tool_choice
    if (request.tool_choice) {
      if (typeof request.tool_choice === "object" && request.tool_choice.function?.name) {
        payload.tool_choice = { type: "tool", name: request.tool_choice.function.name };
      } else if (request.tool_choice === "auto") {
        payload.tool_choice = { type: "auto" };
      }
    }
  }
  
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${error}`);
  }
  
  const data = await response.json();
  
  // Handle tool_use response (Anthropic format → OpenAI format)
  const toolUse = data.content?.find((c: any) => c.type === "tool_use");
  if (toolUse) {
    return {
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: toolUse.id,
            type: "function",
            function: {
              name: toolUse.name,
              arguments: JSON.stringify(toolUse.input),
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: data.usage,
    };
  }
  
  const text = data.content?.find((c: any) => c.type === "text")?.text || "";
  
  return {
    choices: [{
      message: { role: "assistant", content: text },
      finish_reason: data.stop_reason || "stop",
    }],
    usage: data.usage,
  };
}

async function callLovable(request: ChatCompletionRequest, apiKey: string): Promise<ChatCompletionResponse> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  
  if (!response.ok) {
    const error = await response.text();
    if (response.status === 402) {
      throw new Error("Payment required - add credits to Lovable AI");
    }
    throw new Error(`Lovable AI error ${response.status}: ${error}`);
  }
  
  return response.json();
}

/**
 * Drop-in replacement for Lovable AI Gateway calls.
 * Automatically routes to available API (Google > OpenAI > Anthropic > Lovable)
 */
export async function chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
  const { provider, realModel, useLovable } = resolveModel(request.model);
  
  console.log(`[lovable-compat] Routing ${request.model} → ${provider}/${realModel}`);
  
  if (useLovable) {
    const apiKey = getApiKey("lovable");
    return callLovable(request, apiKey);
  }
  
  const apiKey = getApiKey(provider);
  
  switch (provider) {
    case "openai":
      return callOpenAI(request, apiKey, realModel);
    case "google":
      return callGoogle(request, apiKey, realModel);
    case "anthropic":
      return callAnthropic(request, apiKey, realModel);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Simple function to check if API is available
 */
export function hasApiAccess(): boolean {
  return !!(
    Deno.env.get("GOOGLE_AI_API_KEY") ||
    Deno.env.get("OPENAI_API_KEY") ||
    Deno.env.get("ANTHROPIC_API_KEY") ||
    Deno.env.get("LOVABLE_API_KEY")
  );
}

/**
 * Get the API key check message for error handling
 */
export function getApiKeyError(): string {
  return "No API key configured. Set GOOGLE_AI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or LOVABLE_API_KEY";
}

/**
 * Get API key - returns first available key, checking GOOGLE first
 * Drop-in replacement for: const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
 */
export function getAvailableApiKey(): string {
  const keys = [
    Deno.env.get("GOOGLE_AI_API_KEY"),
    Deno.env.get("OPENAI_API_KEY"),
    Deno.env.get("ANTHROPIC_API_KEY"),
    Deno.env.get("LOVABLE_API_KEY"),
  ];
  
  for (const key of keys) {
    if (key) return key;
  }
  
  throw new Error("No API key configured. Set GOOGLE_AI_API_KEY, OPENAI_API_KEY, or LOVABLE_API_KEY");
}

/**
 * Drop-in replacement for fetch to Lovable AI Gateway
 * Use this instead of: fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {...})
 */
export async function fetchChatCompletion(
  requestBody: ChatCompletionRequest
): Promise<Response> {
  try {
    const result = await chatCompletion(requestBody);
    
    // Return a Response-like object
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    const status = error.message?.includes("402") ? 402 : 
                   error.message?.includes("429") ? 429 : 500;
    return new Response(JSON.stringify({ error: error.message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * GLOBAL FETCH INTERCEPTOR for Lovable AI Gateway
 * 
 * This intercepts fetch calls to ai.gateway.lovable.dev and routes them
 * through the compatibility layer (Google AI / OpenAI / Anthropic).
 * 
 * USAGE: Call initLovableCompat() at the top of your Edge Function.
 * After that, all fetch() calls to Lovable will be automatically redirected.
 */
const originalFetch = globalThis.fetch;

export function initLovableCompat(): void {
  if ((globalThis as any).__lovableCompatInitialized) return;
  
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    
    // Intercept Lovable AI Gateway calls
    if (url.includes('ai.gateway.lovable.dev/v1/chat/completions')) {
      try {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        console.log(`[lovable-compat] Intercepted call to Lovable Gateway, routing to direct API`);
        return await fetchChatCompletion(body);
      } catch (error: any) {
        console.error('[lovable-compat] Intercept error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    
    // Pass through all other fetch calls
    return originalFetch(input, init);
  };
  
  (globalThis as any).__lovableCompatInitialized = true;
  console.log('[lovable-compat] Global fetch interceptor installed');
}

/**
 * Alternative: Direct replacement function that matches fetch signature
 * Use: const response = await aiGatewayFetch(url, options);
 */
export async function aiGatewayFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  
  // If it's a Lovable Gateway call, route through compat layer
  if (url.includes('ai.gateway.lovable.dev')) {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    return fetchChatCompletion(body);
  }
  
  // Otherwise, use original fetch
  return originalFetch(input, init);
}
