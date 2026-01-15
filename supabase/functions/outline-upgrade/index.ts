import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// V2: Chunked upgrade with heartbeat (avoids 60s Edge timeout)
// Each invocation does ONE stage, frontend loops until complete
// ============================================================================

const CHUNK_TIMEOUT_MS = 45000; // 45s budget per chunk
const HEARTBEAT_INTERVAL_MS = 15000; // 15s keepalive

interface UpgradeStage {
  id: string;
  label: string;
  progressStart: number;
  progressEnd: number;
  maxTokens: number;
}

const UPGRADE_STAGES: UpgradeStage[] = [
  { id: 'season_arc', label: 'Arco de temporada', progressStart: 10, progressEnd: 40, maxTokens: 6000 },
  { id: 'character_arcs', label: 'Arcos de personajes', progressStart: 40, progressEnd: 70, maxTokens: 6000 },
  { id: 'episode_enrich', label: 'Enriquecimiento de episodios', progressStart: 70, progressEnd: 100, maxTokens: 8000 }
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

const SEASON_ARC_SCHEMA = {
  type: "object",
  properties: {
    season_arc: {
      type: "object",
      properties: {
        protagonist_name: { type: "string" },
        protagonist_start: { type: "string", description: "Estado emocional/situacional al inicio" },
        protagonist_break: { type: "string", description: "El momento de quiebre que lo transforma" },
        protagonist_end: { type: "string", description: "En quién se convierte al final" },
        midpoint_episode: { type: "number" },
        midpoint_event: { type: "string" },
        midpoint_consequence: { type: "string" },
        thematic_question: { type: "string" },
        thematic_answer: { type: "string" }
      },
      required: ["protagonist_name", "protagonist_start", "protagonist_break", "protagonist_end", "midpoint_event", "thematic_question"]
    },
    mythology_rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          entity: { type: "string" },
          nature: { type: "string" },
          can_do: { type: "array", items: { type: "string" } },
          cannot_do: { type: "array", items: { type: "string" } },
          weakness: { type: "string" },
          dramatic_purpose: { type: "string" }
        },
        required: ["entity", "can_do", "cannot_do"]
      }
    }
  },
  required: ["season_arc"]
};

const CHARACTER_ARCS_SCHEMA = {
  type: "object",
  properties: {
    character_arcs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
          arc_type: { type: "string", description: "Tipo: redención, caída, transformación, revelación" },
          arc_start: { type: "string" },
          arc_catalyst: { type: "string" },
          arc_midpoint: { type: "string" },
          arc_end: { type: "string" },
          key_relationship: { type: "string" },
          internal_conflict: { type: "string" }
        },
        required: ["name", "role", "arc_start", "arc_end"]
      }
    }
  },
  required: ["character_arcs"]
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

function buildStagePrompt(stageId: string, outline: any, originalText: string): string {
  const outlineStr = JSON.stringify(outline, null, 2);
  
  switch (stageId) {
    case 'season_arc':
      return `OUTLINE ACTUAL:
${outlineStr}

MATERIAL ORIGINAL:
${originalText}

TAREA: Define el ARCO DE LA TEMPORADA COMPLETA.

REQUISITOS:
1. ARCO DEL PROTAGONISTA:
   - Estado inicial (quién es al empezar)
   - Punto de quiebre (qué lo transforma)
   - Estado final (en quién se convierte)

2. MIDPOINT de la temporada:
   - El momento donde "no hay vuelta atrás"
   - El giro que redefine el conflicto central

3. PREGUNTA TEMÁTICA:
   - La pregunta filosófica que explora la temporada
   - Cómo responde la serie a esa pregunta

4. REGLAS DE MITOLOGÍA (si aplica):
   - Para cada entidad especial, define qué PUEDE y qué NO PUEDE hacer
   - Límites narrativos que dan tensión

Usa la herramienta deliver_season_arc.`;

    case 'character_arcs':
      return `OUTLINE ACTUAL (con arco de temporada):
${outlineStr}

TAREA: Define ARCOS DRAMÁTICOS para cada personaje principal.

Para cada personaje:
- arc_type: redención, caída, transformación, o revelación
- arc_start: Quién es al inicio
- arc_catalyst: Qué evento inicia su cambio
- arc_midpoint: Su estado en el midpoint de la temporada
- arc_end: Quién es al final
- key_relationship: Relación más importante para su arco
- internal_conflict: Su lucha interna principal

IMPORTANTE: Los arcos deben conectar con el season_arc y el midpoint ya definidos.

Usa la herramienta deliver_character_arcs.`;

    case 'episode_enrich':
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

Usa la herramienta deliver_episode_enrichment.`;

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

async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  toolName: string,
  toolSchema: any,
  signal?: AbortSignal
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-5-mini", // Faster model for chunked approach
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [
        {
          type: "function",
          function: {
            name: toolName,
            description: `Deliver ${toolName} data`,
            parameters: toolSchema
          }
        }
      ],
      tool_choice: { type: "function", function: { name: toolName } }
    }),
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
  
  // Extract tool call result
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try {
      return JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments:", e);
      throw new Error("PARSE_ERROR: Invalid response format from AI");
    }
  }

  // Fallback: try to extract JSON from content
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("PARSE_ERROR: Could not parse JSON from response");
      }
    }
  }

  throw new Error("NO_RESPONSE: No valid response from AI");
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

    // 3. Detect pending stage from _upgrade_parts
    const upgradeParts = outline.outline_json?._upgrade_parts || {};
    const pendingStage = UPGRADE_STAGES.find(s => !upgradeParts[s.id]?.done);
    
    if (!pendingStage) {
      // All stages done, mark as showrunner
      await supabase.from("project_outlines").update({
        quality: "showrunner",
        status: "completed",
        stage: "done",
        progress: 100,
        updated_at: new Date().toISOString()
      }).eq("id", outline_id);

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

    // 4. Update status to upgrading
    await supabase.from("project_outlines").update({
      status: "upgrading",
      substage: pendingStage.id,
      progress: pendingStage.progressStart,
      heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null
    }).eq("id", outline_id);

    // 5. Start heartbeat
    const heartbeat = startHeartbeat(supabase, outline_id, pendingStage.id, pendingStage.progressStart);

    try {
      // 6. Prepare for AI call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CHUNK_TIMEOUT_MS);

      // Get original text for context
      const originalText = outline.idea || outline.summary_text || "";

      // 7. Call AI for this stage
      const stageResult = await callLovableAI(
        SHOWRUNNER_SYSTEM,
        buildStagePrompt(pendingStage.id, outline.outline_json, originalText),
        pendingStage.maxTokens,
        getToolNameForStage(pendingStage.id),
        getSchemaForStage(pendingStage.id),
        controller.signal
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

      // 10. Save progress
      await supabase.from("project_outlines").update({
        outline_json: mergedOutline,
        status: isComplete ? "completed" : "upgrading",
        quality: isComplete ? "showrunner" : outline.quality,
        stage: isComplete ? "done" : "showrunner",
        substage: isComplete ? "done" : nextStage?.id,
        progress: isComplete ? 100 : pendingStage.progressEnd,
        updated_at: new Date().toISOString(),
        error_message: null
      }).eq("id", outline_id);

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

      // Save error but don't revert prior progress
      await supabase.from("project_outlines").update({
        status: "error",
        error_message: stageError.message || "Stage failed",
        updated_at: new Date().toISOString()
      }).eq("id", outline_id);

      // Determine error type for frontend
      const errMsg = stageError.message || "";
      let errorCode = "STAGE_FAILED";
      if (errMsg.includes("RATE_LIMIT")) errorCode = "RATE_LIMIT";
      if (errMsg.includes("CREDITS_EXHAUSTED")) errorCode = "CREDITS_EXHAUSTED";
      if (errMsg.includes("PARSE_ERROR")) errorCode = "PARSE_ERROR";
      if (stageError.name === "AbortError") errorCode = "TIMEOUT";

      return new Response(
        JSON.stringify({ 
          success: false,
          error: stageError.message,
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
