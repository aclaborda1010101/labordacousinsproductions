import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
// See docs/MODEL_CONFIG_EXPERT_VERSION.md for rationale
// Scripts use Claude claude-sonnet-4-20250514 for professional screenplay quality
const SCRIPT_MODEL = "claude-sonnet-4-20250514";

/**
 * Genera UN SOLO batch de escenas (5 escenas).
 * El frontend llama 3 veces: batch 0 (1-5), batch 1 (6-10), batch 2 (11-15).
 * Esto evita timeouts de requests largas.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { outline, episodeNumber, language, batchIndex, previousScenes } = await req.json();

    if (!outline || !episodeNumber || typeof batchIndex !== "number") {
      return new Response(
        JSON.stringify({ error: "outline, episodeNumber y batchIndex requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
    if (!episodeBeat) {
      return new Response(
        JSON.stringify({ error: `Episode beat ${episodeNumber} not found` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

    // Calculate scene range for this batch
    const sceneStart = batchIndex * 5 + 1;
    const sceneEnd = sceneStart + 4;

    console.log(`[EP${episodeNumber} BATCH${batchIndex}] Generating scenes ${sceneStart}-${sceneEnd}...`);

    const charactersRef = outline.main_characters
      ?.map((c: any) => `- ${c.name} (${c.role || "personaje"}): ${c.description || ""}`)
      .join("\n") || "";

    const locationsRef = outline.main_locations
      ?.map((l: any) => `- ${l.name} (${l.type || "INT"}): ${l.description || ""}`)
      .join("\n") || "";

    const priorSummary = Array.isArray(previousScenes)
      ? previousScenes
          .map((s: any) => `- ${s.scene_number}. ${s.slugline}: ${s.summary || ""}`)
          .join("\n")
      : "";

    const seriesTitle = outline.title || "Sin título";
    const episodeTitle = episodeBeat.title || `Episodio ${episodeNumber}`;
    const episodeBeatSummary = episodeBeat.summary || "Por definir";

    const prompt = `Eres un guionista profesional de series premium.

SERIE: ${seriesTitle}
EPISODIO ${episodeNumber}: ${episodeTitle}
SINOPSIS DEL EPISODIO: ${episodeBeatSummary}

PERSONAJES DISPONIBLES:
${charactersRef || "- (Crear personajes necesarios)"}

LOCALIZACIONES DISPONIBLES:
${locationsRef || "- (Crear localizaciones necesarias)"}

IDIOMA DE LOS DIÁLOGOS: ${language || "es-ES"}

${priorSummary ? `ESCENAS YA GENERADAS (para continuidad):\n${priorSummary}\n` : ""}

TAREA: Genera EXACTAMENTE 5 escenas (números ${sceneStart} a ${sceneEnd}).

REQUISITOS POR ESCENA:
- scene_number: debe estar entre ${sceneStart} y ${sceneEnd}
- slugline: formato "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE"
- action: 80-160 palabras de descripción visual cinematográfica
- dialogue: MÍNIMO 6 intercambios de diálogo
- Cada escena debe tener conflicto dramático claro
- mood, music_cue, sfx_cue, duration_estimate_sec

Usa la herramienta generate_scene_batch para devolver las 5 escenas.`;

    const tools = [
      {
        name: "generate_scene_batch",
        description: "Genera exactamente 5 escenas consecutivas del episodio",
        input_schema: {
          type: "object",
          properties: {
            synopsis: { 
              type: "string", 
              description: "Sinopsis del episodio (100-200 palabras)" 
            },
            scenes: {
              type: "array",
              description: "Exactamente 5 escenas",
              items: {
                type: "object",
                properties: {
                  scene_number: { type: "number" },
                  slugline: { type: "string" },
                  summary: { type: "string" },
                  action: { type: "string", description: "80-160 palabras" },
                  characters: { type: "array", items: { type: "string" } },
                  dialogue: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        character: { type: "string" },
                        parenthetical: { type: "string" },
                        line: { type: "string" },
                      },
                      required: ["character", "line"],
                    },
                  },
                  music_cue: { type: "string" },
                  sfx_cue: { type: "string" },
                  vfx: { type: "array", items: { type: "string" } },
                  mood: { type: "string" },
                  duration_estimate_sec: { type: "number" },
                },
                required: ["scene_number", "slugline", "action", "characters", "dialogue", "mood", "duration_estimate_sec"],
              },
            },
          },
          required: ["scenes"],
        },
      },
    ];

    // Try up to 2 attempts
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const temperature = attempt === 1 ? 0.7 : 0.5;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: SCRIPT_MODEL,
          max_tokens: 5000,
          temperature,
          tools,
          tool_choice: { type: "tool", name: "generate_scene_batch" },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EP${episodeNumber} BATCH${batchIndex}] API Error:`, response.status, errorText);

        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: "Rate limit alcanzado. Espera un momento.", retryable: true }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (response.status === 400 && errorText.toLowerCase().includes("credit")) {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes en Claude." }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        lastError = `Claude API error: ${response.status}`;
        continue;
      }

      const data = await response.json();
      const toolUse = data?.content?.find(
        (b: any) => b?.type === "tool_use" && b?.name === "generate_scene_batch"
      );

      if (!toolUse?.input?.scenes) {
        console.error(`[EP${episodeNumber} BATCH${batchIndex}] No tool_use.scenes`, {
          stop_reason: data?.stop_reason,
          content_types: data?.content?.map((b: any) => b.type),
        });
        lastError = "No scenes in tool_use response";
        continue;
      }

      const scenes = toolUse.input.scenes;
      if (!Array.isArray(scenes) || scenes.length !== 5) {
        console.error(`[EP${episodeNumber} BATCH${batchIndex}] Invalid scenes count:`, scenes.length);
        lastError = `Expected 5 scenes, got ${scenes?.length || 0}`;
        continue;
      }

      // Validate scene numbers are in range
      const allInRange = scenes.every(
        (s: any) => s?.scene_number >= sceneStart && s?.scene_number <= sceneEnd
      );
      if (!allInRange) {
        console.error(`[EP${episodeNumber} BATCH${batchIndex}] Scene numbers out of range`);
        lastError = "Scene numbers out of expected range";
        continue;
      }

      const durationMs = Date.now() - startedAt;
      console.log(`[EP${episodeNumber} BATCH${batchIndex}] ✅ Success in ${durationMs}ms`);

      // Log generation cost
      const userId = extractUserId(req.headers.get('authorization'));
      if (userId) {
        await logGenerationCost({
          userId,
          slotType: `script_episode_batch`,
          engine: SCRIPT_MODEL,
          durationMs,
          success: true,
          metadata: {
            episodeNumber,
            batchIndex,
            scenesGenerated: 5
          }
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          batchIndex,
          sceneStart,
          sceneEnd,
          synopsis: toolUse.input.synopsis || null,
          scenes,
          durationMs,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All attempts failed
    return new Response(
      JSON.stringify({ error: lastError || "Failed to generate batch after 2 attempts" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[BATCH ERROR]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
