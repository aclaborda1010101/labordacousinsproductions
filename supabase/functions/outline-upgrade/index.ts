import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractModelText, logExtractionDiagnostic } from "../_shared/extract-model-text.ts";
import { parseJsonRobust } from "../_shared/parse-json-robust.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// V3: Atomic JSON contract (IDs only, no prose) + robust parsing + concurrency guard
// Each invocation does ONE stage, frontend loops until complete
// ============================================================================

const CHUNK_TIMEOUT_MS = 85000; // 85s budget per chunk (edge limit ~120s, leaving margin)
const HEARTBEAT_INTERVAL_MS = 8000; // 8s keepalive (frequent to avoid zombie detection)
const HEARTBEAT_STALE_THRESHOLD_MS = 60000; // 60s - if heartbeat older, allow new run

interface UpgradeStage {
  id: string;
  label: string;
  progressStart: number;
  progressEnd: number;
  maxTokens: number;
  useDirectJson: boolean; // true = no tools, use response_format: json_object
}

// REDUCED TOKENS: Atomic JSON needs far fewer tokens
const UPGRADE_STAGES: UpgradeStage[] = [
  { id: 'season_arc', label: 'Arco de temporada', progressStart: 10, progressEnd: 40, maxTokens: 600, useDirectJson: true },
  { id: 'character_arcs', label: 'Arcos de personajes', progressStart: 40, progressEnd: 70, maxTokens: 800, useDirectJson: true },
  { id: 'episode_enrich', label: 'Enriquecimiento de episodios', progressStart: 70, progressEnd: 100, maxTokens: 3500, useDirectJson: false }
];

// Showrunner-level system prompt (shared across stages)
const SHOWRUNNER_SYSTEM = `Eres showrunner senior para una serie de televisión de alto nivel (HBO/Apple TV+/Netflix).
Tu misión NO es resumir, sino PROFUNDIZAR y ESTRUCTURAR DRAMA.

Piensas como un arquitecto narrativo:
- Cada episodio es un acto dramático con inicio, desarrollo y giro
- Los personajes tienen arcos claros con transformaciones medibles
- Las reglas del mundo son consistentes y tienen consecuencias
- La escala sube progresivamente: personal → grupal → societal → civilizatoria
- Cada decisión tiene peso y consecuencias irreversibles`;

// ============================================================================
// Stage-specific schemas (smaller = faster)
// ============================================================================

// ============================================================================
// V3 ATOMIC SCHEMA: IDs and codes ONLY - no prose, no narrative text
// This prevents JSON parse errors from unterminated strings
// ============================================================================

const SEASON_ARC_SCHEMA = {
  type: "object",
  properties: {
    season_theme_code: { type: "string" }, // e.g. "POWER_DECAY", "REDEMPTION_IMPOSSIBLE"
    season_promise_code: { type: "string" }, // e.g. "DESCENT_CONSEQUENCES", "RISE_FALL"
    acts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          act: { type: "number" },
          goal_id: { type: "string" }, // e.g. "ACT1_ESTABLISH_WORLD"
          turning_point_ids: { type: "array", items: { type: "string" } } // e.g. ["TP1_INCITING", "TP2_BREAK"]
        },
        required: ["act", "goal_id"]
      }
    },
    protagonist_ref: {
      type: "object",
      properties: {
        name: { type: "string" },
        start_state_id: { type: "string" }, // e.g. "WEARY_ISOLATED"
        midpoint_state_id: { type: "string" }, // e.g. "CONFLICTED_HOPEFUL"
        end_state_id: { type: "string" } // e.g. "TRANSFORMED_CONNECTED"
      },
      required: ["name", "start_state_id", "end_state_id"]
    },
    thematic_code: { type: "string" }, // e.g. "CAN_KILLER_REDEEM"
    midpoint_episode: { type: "number" },
    mythology_rule_ids: { type: "array", items: { type: "string" } } // e.g. ["MYTH_ANCESTRAL_SPIRITS"]
  },
  required: ["season_theme_code", "acts", "protagonist_ref", "thematic_code"]
};

// V3 ATOMIC SCHEMA: IDs and codes ONLY
const CHARACTER_ARCS_SCHEMA = {
  type: "object",
  properties: {
    character_arc_refs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role_code: { type: "string" }, // "PROTAGONIST", "ANTAGONIST", "ALLY", "MENTOR"
          arc_type_code: { type: "string" }, // "REDEMPTION", "FALL", "REVELATION", "GROWTH"
          start_state_id: { type: "string" }, // e.g. "AMBITIOUS_ISOLATED"
          catalyst_id: { type: "string" }, // e.g. "BETRAYAL_DISCOVERY"
          end_state_id: { type: "string" }, // e.g. "HUMBLE_CONNECTED"
          key_relationship_id: { type: "string" }, // e.g. "REL_PROTAGONIST_MENTOR"
          conflict_id: { type: "string" } // e.g. "LOYALTY_VS_AMBITION"
        },
        required: ["name", "role_code", "arc_type_code", "start_state_id", "end_state_id"]
      }
    }
  },
  required: ["character_arc_refs"]
};

const EPISODE_ENRICH_SCHEMA = {
  type: "object",
  properties: {
    episodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          episode: { type: "number" },
          title: { type: "string" },
          central_question: { type: "string" },
          central_conflict: { type: "string" },
          stakes: { type: "string" },
          turning_point: { type: "string" },
          irreversible_change: { type: "string" },
          end_state: { type: "string" },
          consequence_for_next: { type: "string" },
          scale: { type: "string", enum: ["personal", "grupal", "institucional", "civilizatorio"] }
        },
        required: ["episode", "title", "central_conflict", "turning_point", "irreversible_change"]
      }
    }
  },
  required: ["episodes"]
};

// ============================================================================
// Stage-specific prompts
// ============================================================================

function buildStagePrompt(stageId: string, outline: any, originalText: string, useDirectJson: boolean): string {
  const outlineStr = JSON.stringify(outline, null, 2);
  
  switch (stageId) {
    case 'season_arc':
      // V3 ATOMIC: IDs and codes ONLY - zero prose
      return `OUTLINE:
${outlineStr}

OUTPUT: JSON con SOLO IDs/códigos. PROHIBIDO texto largo.

FORMATO EXACTO:
{
  "season_theme_code": "CODIGO_TEMA",
  "season_promise_code": "CODIGO_PROMESA",
  "acts": [
    {"act": 1, "goal_id": "ACT1_GOAL_ID", "turning_point_ids": ["TP1", "TP2"]},
    {"act": 2, "goal_id": "ACT2_GOAL_ID", "turning_point_ids": ["TP3"]},
    {"act": 3, "goal_id": "ACT3_GOAL_ID", "turning_point_ids": ["TP4", "TP5"]}
  ],
  "protagonist_ref": {
    "name": "Nombre",
    "start_state_id": "ESTADO_INICIO",
    "midpoint_state_id": "ESTADO_MEDIO",
    "end_state_id": "ESTADO_FIN"
  },
  "thematic_code": "PREGUNTA_TEMATICA",
  "midpoint_episode": 5,
  "mythology_rule_ids": []
}

CÓDIGOS VÁLIDOS (ejemplos):
- season_theme_code: POWER_CORRUPTION, REDEMPTION_IMPOSSIBLE, FAMILY_DUTY, IDENTITY_LOSS
- goal_id: ACT1_ESTABLISH, ACT2_ESCALATE, ACT3_RESOLVE
- turning_point_ids: TP_INCITING, TP_BETRAYAL, TP_REVELATION, TP_CRISIS
- start_state_id: WEARY_ISOLATED, AMBITIOUS_NAIVE, BROKEN_HOPELESS
- thematic_code: CAN_MONSTER_LOVE, PRICE_OF_POWER, FAMILY_OR_SELF

REGLAS:
- IDs en SCREAMING_SNAKE_CASE
- Sin espacios ni caracteres especiales
- mythology_rule_ids = [] si no hay elementos fantásticos
- SOLO JSON, sin texto adicional`;

    case 'character_arcs':
      // V3 ATOMIC: IDs and codes ONLY
      return `OUTLINE:
${outlineStr}

OUTPUT: JSON con SOLO IDs/códigos. PROHIBIDO texto.

FORMATO EXACTO:
{
  "character_arc_refs": [
    {
      "name": "Nombre",
      "role_code": "PROTAGONIST",
      "arc_type_code": "REDEMPTION",
      "start_state_id": "ESTADO_INICIO",
      "catalyst_id": "EVENTO_CATALIZADOR",
      "end_state_id": "ESTADO_FIN",
      "key_relationship_id": "REL_CON_QUIEN",
      "conflict_id": "CONFLICTO_INTERNO"
    }
  ]
}

CÓDIGOS VÁLIDOS:
- role_code: PROTAGONIST, ANTAGONIST, ALLY, MENTOR, LOVE_INTEREST, RIVAL
- arc_type_code: REDEMPTION, FALL, REVELATION, GROWTH, CORRUPTION, SACRIFICE
- start_state_id: AMBITIOUS_NAIVE, BROKEN_CYNICAL, LOYAL_BLIND, POWERFUL_ARROGANT
- catalyst_id: BETRAYAL, LOSS, DISCOVERY, CRISIS, TEMPTATION
- conflict_id: DUTY_VS_DESIRE, LOYALTY_VS_TRUTH, POWER_VS_LOVE, SELF_VS_FAMILY

REGLAS:
- IDs en SCREAMING_SNAKE_CASE
- Incluye TODOS los personajes del outline
- SOLO JSON`;

    case 'episode_enrich':
      // Modo tools - mantiene referencia a herramienta
      return `OUTLINE ACTUAL (con arcos de personajes):
${outlineStr}

TAREA: Enriquece cada EPISODIO con estructura dramática profunda.

Para cada episodio:
- central_question: Pregunta que el episodio responde
- central_conflict: El conflicto principal
- stakes: Qué está en juego
- turning_point: El giro principal
- irreversible_change: Qué cambia permanentemente
- end_state: Estado emocional/situacional al terminar
- consequence_for_next: Cómo afecta al siguiente
- scale: personal → grupal → institucional → civilizatorio (progresión)

IMPORTANTE: 
- Episodios 1-3: Conflicto personal/íntimo
- Episodios 4-6: Conflicto grupal/institucional
- Episodios 7+: Conflicto civilizatorio/existencial

Usa la herramienta deliver_episode_enrichment. SOLO JSON, sin explicaciones.`;

    default:
      throw new Error(`Unknown stage: ${stageId}`);
  }
}

function getSchemaForStage(stageId: string): any {
  switch (stageId) {
    case 'season_arc': return SEASON_ARC_SCHEMA;
    case 'character_arcs': return CHARACTER_ARCS_SCHEMA;
    case 'episode_enrich': return EPISODE_ENRICH_SCHEMA;
    default: throw new Error(`Unknown stage: ${stageId}`);
  }
}

function getToolNameForStage(stageId: string): string {
  switch (stageId) {
    case 'season_arc': return 'deliver_season_arc';
    case 'character_arcs': return 'deliver_character_arcs';
    case 'episode_enrich': return 'deliver_episode_enrichment';
    default: return 'deliver_data';
  }
}

// ============================================================================
// Heartbeat: keeps process alive during AI call
// ============================================================================

function startHeartbeat(
  supabase: any,
  outlineId: string,
  substage: string,
  initialProgress: number
) {
  let currentSubstage = substage;
  let currentProgress = initialProgress;
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      await supabase.from('project_outlines').update({
        heartbeat_at: new Date().toISOString(),
        substage: currentSubstage,
        progress: currentProgress
      }).eq('id', outlineId);
      console.log(`[heartbeat] ${outlineId} substage=${currentSubstage} progress=${currentProgress}`);
    } catch (e) {
      console.warn('[heartbeat] update failed:', e);
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    stop: () => { stopped = true; clearInterval(timer); },
    update: (s: string, p: number) => { currentSubstage = s; currentProgress = p; }
  };
}

// ============================================================================
// AI call with timeout
// ============================================================================

// Model fallback chain with individual timeouts per model
const MODEL_CHAIN = [
  { model: "google/gemini-2.5-flash", timeoutMs: 35000 },
  { model: "openai/gpt-5-mini", timeoutMs: 30000 },
  { model: "google/gemini-2.5-flash-lite", timeoutMs: 25000 }
];

async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any,
  _signal?: AbortSignal, // Parent signal (for full abort)
  useDirectJson: boolean = false // NEW: Use JSON mode instead of tools
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  let lastError: Error | null = null;

  for (const { model, timeoutMs } of MODEL_CHAIN) {
    // Create individual AbortController per model attempt
    const modelController = new AbortController();
    const modelTimeout = setTimeout(() => modelController.abort(), timeoutMs);

    try {
      console.log(`[outline-upgrade] Trying model: ${model} (timeout: ${timeoutMs}ms, directJson: ${useDirectJson})`);
      const result = await callWithModel(
        model, systemPrompt, userPrompt, maxTokens, 
        toolName, toolSchema, LOVABLE_API_KEY, 
        modelController.signal, useDirectJson
      );
      clearTimeout(modelTimeout);
      return result;
    } catch (e: any) {
      clearTimeout(modelTimeout);
      lastError = e;
      console.warn(`[outline-upgrade] Model ${model} failed:`, e.message);
      
      // Don't retry on rate limits or credit issues
      if (e.message?.includes("RATE_LIMIT") || e.message?.includes("CREDITS_EXHAUSTED")) {
        throw e;
      }
      // Skip to next model on timeout, malformed response, or validation error
      if (e.name === "AbortError" || e.message?.includes("MALFORMED") || e.message?.includes("VALIDATION_ERROR")) {
        console.log(`[outline-upgrade] Model ${model} failed (${e.message?.slice(0, 50)}), trying next...`);
        continue;
      }
      // Continue to next model in chain
    }
  }

  throw lastError || new Error("NO_RESPONSE: All models failed");
}

async function callWithModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any,
  apiKey: string,
  signal?: AbortSignal,
  useDirectJson: boolean = false
): Promise<any> {
  // Use max_completion_tokens for OpenAI models, max_tokens for others
  const isOpenAI = model.startsWith("openai/");
  const tokenField = isOpenAI ? "max_completion_tokens" : "max_tokens";

  // Build request body based on mode
  const requestBody: any = {
    model,
    [tokenField]: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  if (useDirectJson) {
    // Direct JSON mode - no tools, use response_format
    requestBody.response_format = { type: "json_object" };
    console.log(`[outline-upgrade] Using direct JSON mode for ${toolName}`);
  } else {
    // Tool calling mode - for deterministic stages
    requestBody.tools = [
      {
        type: "function",
        function: {
          name: toolName,
          description: `Deliver ${toolName} data as JSON`,
          parameters: toolSchema
        }
      }
    ];
    requestBody.tool_choice = { type: "function", function: { name: toolName } };
    // Add instruction for tool mode only
    requestBody.messages[1].content += "\n\nRESPONDE SOLO CON LA HERRAMIENTA. NO incluyas texto, explicaciones ni markdown.";
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("AI API error:", response.status, errorText);
    
    if (response.status === 429) {
      throw new Error("RATE_LIMIT: Rate limit exceeded. Please try again in a few minutes.");
    }
    if (response.status === 402) {
      throw new Error("CREDITS_EXHAUSTED: API credits exhausted. Please add credits to continue.");
    }
    throw new Error(`AI_ERROR: ${response.status}`);
  }

  const data = await response.json();
  
  // Check for malformed function call (only in tool mode)
  if (!useDirectJson) {
    const choice = data?.choices?.[0];
    if (choice?.native_finish_reason === "MALFORMED_FUNCTION_CALL" || 
        choice?.finish_reason === "error") {
      console.warn(`[outline-upgrade] ${model} returned MALFORMED_FUNCTION_CALL, trying next model`);
      throw new Error("MALFORMED_FUNCTION_CALL: Model produced invalid tool call");
    }
  }
  
  // Use canonical extractor for robustness
  const extraction = extractModelText(data);
  logExtractionDiagnostic(extraction, { phase: 'outline-upgrade', model });
  
  if (extraction.text) {
    // V3: Use robust JSON parser instead of raw JSON.parse
    const parseResult = parseJsonRobust(extraction.text, `outline-upgrade:${toolName}`);
    
    if (!parseResult.ok || !parseResult.json) {
      console.error("Robust parse failed:", parseResult.error, "strategy:", parseResult.strategy);
      console.error("Raw text preview:", extraction.text?.slice(0, 300));
      throw new Error(`PARSE_ERROR: ${parseResult.error || 'Invalid JSON structure'}`);
    }
    
    // Log if we had to repair the JSON
    if (parseResult.warnings?.length > 0) {
      console.warn(`[outline-upgrade] JSON repaired with warnings:`, parseResult.warnings);
    }
    
    const parsed = parseResult.json;
    
    // Validate response structure based on stage
    if (useDirectJson) {
      validateDirectJsonResponse(toolName, parsed);
    }
    
    return parsed;
  }

  // If extractor failed, log full response for debugging
  console.error("NO_RESPONSE: extraction failed", {
    strategy: extraction.strategy,
    rawType: extraction.rawType,
    responsePreview: JSON.stringify(data).slice(0, 500)
  });
  
  throw new Error("NO_RESPONSE: No valid response from AI");
}

/**
 * Validates the structure of direct JSON responses (non-tool mode)
 * Throws VALIDATION_ERROR if structure is invalid, allowing retry with next model
 */
/**
 * V3: Validates atomic JSON structure (IDs/codes only, no prose)
 */
function validateDirectJsonResponse(toolName: string, parsed: any): void {
  if (toolName === 'deliver_season_arc') {
    // V3: Validate new atomic structure
    if (!parsed.season_theme_code || typeof parsed.season_theme_code !== 'string') {
      throw new Error("VALIDATION_ERROR: season_theme_code is required");
    }
    if (!parsed.protagonist_ref || typeof parsed.protagonist_ref !== 'object') {
      throw new Error("VALIDATION_ERROR: protagonist_ref object is required");
    }
    const prot = parsed.protagonist_ref;
    if (!prot.name || !prot.start_state_id || !prot.end_state_id) {
      throw new Error("VALIDATION_ERROR: protagonist_ref must have name, start_state_id, end_state_id");
    }
    if (!parsed.thematic_code) {
      throw new Error("VALIDATION_ERROR: thematic_code is required");
    }
    if (!Array.isArray(parsed.acts) || parsed.acts.length === 0) {
      throw new Error("VALIDATION_ERROR: acts array is required");
    }
    // Ensure mythology_rule_ids exists
    if (!parsed.mythology_rule_ids) {
      parsed.mythology_rule_ids = [];
    }
    console.log(`[outline-upgrade] season_arc V3 validated: theme=${parsed.season_theme_code}, protagonist=${prot.name}`);
  }
  
  if (toolName === 'deliver_character_arcs') {
    // V3: Validate new atomic structure
    if (!Array.isArray(parsed.character_arc_refs)) {
      throw new Error("VALIDATION_ERROR: character_arc_refs must be an array");
    }
    if (parsed.character_arc_refs.length === 0) {
      throw new Error("VALIDATION_ERROR: character_arc_refs cannot be empty");
    }
    for (const arc of parsed.character_arc_refs) {
      if (!arc.name || !arc.role_code || !arc.arc_type_code) {
        throw new Error(`VALIDATION_ERROR: Character arc missing name, role_code, or arc_type_code`);
      }
      if (!arc.start_state_id || !arc.end_state_id) {
        throw new Error(`VALIDATION_ERROR: ${arc.name} missing start_state_id or end_state_id`);
      }
    }
    console.log(`[outline-upgrade] character_arcs V3 validated: ${parsed.character_arc_refs.length} characters`);
  }
}

// ============================================================================
// Main handler
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { outline_id } = await req.json();
    
    if (!outline_id) {
      return new Response(
        JSON.stringify({ error: "outline_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch current outline
    const { data: outline, error: fetchError } = await supabase
      .from("project_outlines")
      .select("*")
      .eq("id", outline_id)
      .single();

    if (fetchError || !outline) {
      console.error("Failed to fetch outline:", fetchError);
      return new Response(
        JSON.stringify({ error: "Outline not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Check if already showrunner quality
    if (outline.quality === "showrunner") {
      return new Response(
        JSON.stringify({ 
          success: true, 
          is_complete: true,
          message: "Already at showrunner level" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2b. V3: CONCURRENCY GUARD - Check if another process is actively running
    const heartbeatAge = outline.heartbeat_at 
      ? Date.now() - new Date(outline.heartbeat_at).getTime()
      : Infinity;
    
    if (outline.status === 'generating' && heartbeatAge < HEARTBEAT_STALE_THRESHOLD_MS) {
      console.log(`[outline-upgrade] Concurrent run detected, heartbeat age: ${heartbeatAge}ms`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error_code: 'IN_PROGRESS',
          error: `Upgrade already in progress (heartbeat ${Math.round(heartbeatAge/1000)}s ago)`,
          retry_after_ms: HEARTBEAT_STALE_THRESHOLD_MS - heartbeatAge
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Detect pending stage from _upgrade_parts
    const upgradeParts = outline.outline_json?._upgrade_parts || {};
    const pendingStage = UPGRADE_STAGES.find(s => !upgradeParts[s.id]?.done);
    
    if (!pendingStage) {
      // All stages done, mark as showrunner
      const { error: updateErr } = await supabase.from("project_outlines").update({
        quality: "showrunner",
        status: "completed",
        stage: "done",
        progress: 100,
        updated_at: new Date().toISOString()
      }).eq("id", outline_id);
      
      if (updateErr) {
        console.error("[outline-upgrade] Failed to mark complete:", updateErr);
        throw new Error(`DB_ERROR: ${updateErr.message}`);
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          is_complete: true,
          message: "Upgrade completed" 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[outline-upgrade] Starting stage: ${pendingStage.id} for outline ${outline_id}`);

    // 4. Update status to upgrading (using correct column names)
    const { error: statusErr } = await supabase.from("project_outlines").update({
      status: "generating",
      substage: pendingStage.id,
      progress: pendingStage.progressStart,
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_detail: null,
      error_code: null
    }).eq("id", outline_id);
    
    if (statusErr) {
      console.error("[outline-upgrade] Failed to update status:", statusErr);
      throw new Error(`DB_ERROR: ${statusErr.message}`);
    }

    // 5. Start heartbeat
    const heartbeat = startHeartbeat(supabase, outline_id, pendingStage.id, pendingStage.progressStart);

    try {
      // 6. Prepare for AI call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

      // Get original text for context
      const originalText = outline.idea || outline.summary_text || "";

      // 7. Call AI for this stage (with mode flag)
      const stageResult = await callLovableAI(
        SHOWRUNNER_SYSTEM,
        buildStagePrompt(pendingStage.id, outline.outline_json, originalText, pendingStage.useDirectJson),
        pendingStage.maxTokens,
        getToolNameForStage(pendingStage.id),
        getSchemaForStage(pendingStage.id),
        controller.signal,
        pendingStage.useDirectJson // Pass the flag to use direct JSON mode
      );

      clearTimeout(timeoutId);
      heartbeat.stop();

      console.log(`[outline-upgrade] Stage ${pendingStage.id} completed successfully`);

      // 8. Merge result into outline_json
      const mergedOutline = {
        ...outline.outline_json,
        ...stageResult,
        _upgrade_parts: {
          ...upgradeParts,
          [pendingStage.id]: { 
            done: true, 
            timestamp: new Date().toISOString() 
          }
        },
        _showrunner_upgrade: true,
        _upgrade_model: "openai/gpt-5-mini"
      };

      // Merge episodes if this is episode_enrich stage
      if (pendingStage.id === 'episode_enrich' && stageResult.episodes) {
        const existingEpisodes = outline.outline_json?.episodes || [];
        mergedOutline.episodes = stageResult.episodes.map((ep: any, idx: number) => {
          const existingEp = existingEpisodes[idx] || {};
          return {
            ...existingEp,
            ...ep,
            episode: ep.episode || idx + 1
          };
        });
      }

      // 9. Determine if complete
      const nextStage = UPGRADE_STAGES.find(s => !mergedOutline._upgrade_parts[s.id]?.done);
      const isComplete = !nextStage;

      // 10. Save progress (V3: use correct column names, check for errors)
      const { error: saveErr } = await supabase.from("project_outlines").update({
        outline_json: mergedOutline,
        status: isComplete ? "completed" : "generating",
        quality: isComplete ? "showrunner" : outline.quality,
        stage: isComplete ? "done" : "showrunner",
        substage: isComplete ? "done" : nextStage?.id,
        progress: isComplete ? 100 : pendingStage.progressEnd,
        updated_at: new Date().toISOString(),
        error_detail: null,
        error_code: null
      }).eq("id", outline_id);
      
      if (saveErr) {
        console.error("[outline-upgrade] CRITICAL: Failed to persist stage result:", saveErr);
        throw new Error(`DB_PERSIST_ERROR: ${saveErr.message}`);
      }
      
      console.log(`[outline-upgrade] Stage ${pendingStage.id} persisted successfully, next: ${nextStage?.id || 'COMPLETE'}`);

      return new Response(
        JSON.stringify({
          success: true,
          stage_completed: pendingStage.id,
          is_complete: isComplete,
          next_stage: nextStage?.id || null,
          progress: isComplete ? 100 : pendingStage.progressEnd
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (stageError: any) {
      heartbeat.stop();
      console.error(`[outline-upgrade] Stage ${pendingStage.id} failed:`, stageError);

      // Save error but don't revert prior progress (V3: use correct column names)
      const errMsg = stageError.message || "Stage failed";
      let errorCode = "STAGE_FAILED";
      if (errMsg.includes("RATE_LIMIT")) errorCode = "RATE_LIMIT";
      if (errMsg.includes("CREDITS_EXHAUSTED")) errorCode = "CREDITS_EXHAUSTED";
      if (errMsg.includes("PARSE_ERROR")) errorCode = "PARSE_ERROR";
      if (errMsg.includes("VALIDATION_ERROR")) errorCode = "VALIDATION_ERROR";
      if (errMsg.includes("DB_")) errorCode = "DB_ERROR";
      if (stageError.name === "AbortError") errorCode = "TIMEOUT";
      
      await supabase.from("project_outlines").update({
        status: "error",
        error_detail: errMsg,
        error_code: errorCode,
        updated_at: new Date().toISOString()
      }).eq("id", outline_id);

      return new Response(
        JSON.stringify({ 
          success: false,
          error: errMsg,
          error_code: errorCode,
          stage_failed: pendingStage.id
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("Outline upgrade error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
