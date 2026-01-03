import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ⚠️ MODEL CONFIG - DO NOT CHANGE WITHOUT USER AUTHORIZATION
const SCRIPT_MODEL = "claude-sonnet-4-20250514";

// MASTER SHOWRUNNER: Narrative mode specific instructions
const NARRATIVE_MODE_SCENE_RULES = {
  serie_adictiva: `REGLAS SERIE ADICTIVA:
- Cada escena debe tener CONFLICTO visible (no implícito)
- Diálogos con SUBTEXTO: lo no dicho importa tanto como lo dicho
- Termina escenas con TENSIÓN o PREGUNTA sin resolver
- Ritmo ALTO: entra tarde, sal temprano
- Si es la última escena del batch 2: CLIFFHANGER del episodio`,

  voz_de_autor: `REGLAS VOZ DE AUTOR:
- Mantén el TEMPO narrativo del outline (si es lento, respétalo)
- Diálogos con DENSIDAD literaria (no explicativos)
- Acciones que REVELAN en lugar de exponer
- Cada escena debe resonar con los TEMAS del outline
- Si hay iconos recurrentes, úsalos visualmente`,

  giro_imprevisible: `REGLAS GIRO IMPREVISIBLE:
- Incluye información que PARECE significar una cosa pero significa otra
- Planta SEMILLAS de giros futuros (foreshadowing sutil)
- Al menos una escena debe tener DOBLE LECTURA
- Personajes pueden mentir o tener información que el espectador no tiene
- Si es la última escena del batch 2: giro o revelación parcial que recontextualice`
};

/**
 * Genera UN SOLO batch de escenas (5 escenas).
 * El frontend llama 3 veces: batch 0 (1-5), batch 1 (6-10), batch 2 (11-15).
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { outline, episodeNumber, language, batchIndex, previousScenes, narrativeMode } = await req.json();

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
    const isLastBatch = batchIndex === 2;

    console.log(`[EP${episodeNumber} BATCH${batchIndex}] Generating scenes ${sceneStart}-${sceneEnd} | Mode: ${narrativeMode || 'serie_adictiva'}...`);

    const charactersRef = outline.main_characters
      ?.map((c: any) => `- ${c.name} (${c.role || "personaje"}): ${c.description || ""} ${c.secret ? `[SECRETO: ${c.secret}]` : ''}`)
      .join("\n") || "";

    const locationsRef = outline.main_locations
      ?.map((l: any) => `- ${l.name} (${l.type || "INT"}): ${l.description || ""} ${l.atmosphere ? `[Atmósfera: ${l.atmosphere}]` : ''}`)
      .join("\n") || "";

    const priorSummary = Array.isArray(previousScenes)
      ? previousScenes
          .map((s: any) => `- ${s.scene_number}. ${s.slugline}: ${s.summary || ""}`)
          .join("\n")
      : "";

    const seriesTitle = outline.title || "Sin título";
    const episodeTitle = episodeBeat.title || `Episodio ${episodeNumber}`;
    const episodeBeatSummary = episodeBeat.summary || "Por definir";
    const episodeCliffhanger = episodeBeat.cliffhanger || "";
    const episodeIrreversible = episodeBeat.irreversible_event || "";

    // Get narrative mode rules
    const modeRules = NARRATIVE_MODE_SCENE_RULES[narrativeMode as keyof typeof NARRATIVE_MODE_SCENE_RULES] || NARRATIVE_MODE_SCENE_RULES.serie_adictiva;

    const prompt = `Eres MASTER_SHOWRUNNER_ENGINE: guionista de series premium de nivel estudio.

SERIE: ${seriesTitle}
EPISODIO ${episodeNumber}: ${episodeTitle}
MODO NARRATIVO: ${narrativeMode || 'serie_adictiva'}

SINOPSIS DEL EPISODIO: ${episodeBeatSummary}
${episodeCliffhanger ? `CLIFFHANGER PLANIFICADO: ${episodeCliffhanger}` : ''}
${episodeIrreversible ? `EVENTO IRREVERSIBLE: ${episodeIrreversible}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━
${modeRules}
━━━━━━━━━━━━━━━━━━━━━━━━━━

PERSONAJES DISPONIBLES:
${charactersRef || "- (Crear personajes necesarios)"}

LOCALIZACIONES DISPONIBLES:
${locationsRef || "- (Crear localizaciones necesarias)"}

IDIOMA DE LOS DIÁLOGOS: ${language || "es-ES"}

${priorSummary ? `ESCENAS YA GENERADAS (para continuidad):\n${priorSummary}\n` : ""}

TAREA: Genera EXACTAMENTE 5 escenas (números ${sceneStart} a ${sceneEnd}).
${isLastBatch ? '\n⚠️ ÚLTIMA BATCH: La escena 15 DEBE contener el CLIFFHANGER del episodio.' : ''}

REQUISITOS QC POR ESCENA:
✓ scene_number: entre ${sceneStart} y ${sceneEnd}
✓ slugline: "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE"
✓ action: 80-160 palabras de descripción VISUAL cinematográfica
✓ dialogue: MÍNIMO 6 intercambios (con subtexto, no exposición)
✓ conflict: ¿Cuál es el conflicto de esta escena?
✓ consequence: ¿Qué cambia después de esta escena?
✓ mood, music_cue, sfx_cue, duration_estimate_sec

PROHIBIDO:
✗ Escenas de "transición" sin conflicto
✗ Diálogos explicativos o expositivos
✗ Acciones vagas ("hablan sobre X")
✗ Cerrar escenas sin tensión

Usa la herramienta generate_scene_batch para devolver las 5 escenas.`;

    const tools = [
      {
        name: "generate_scene_batch",
        description: "Genera exactamente 5 escenas cinematográficas con calidad MASTER SHOWRUNNER",
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
                  action: { type: "string", description: "80-160 palabras VISUALES" },
                  characters: { type: "array", items: { type: "string" } },
                  conflict: { type: "string", description: "El conflicto central de esta escena" },
                  consequence: { type: "string", description: "Qué cambia después de esta escena" },
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
                  is_cliffhanger: { type: "boolean", description: "True si esta escena es el cliffhanger del episodio" }
                },
                required: ["scene_number", "slugline", "action", "characters", "dialogue", "conflict", "mood", "duration_estimate_sec"],
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
      const temperature = attempt === 1 ? 0.75 : 0.6;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: SCRIPT_MODEL,
          max_tokens: 6000,
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

      // QC Check: Ensure scenes have conflict
      const scenesWithoutConflict = scenes.filter((s: any) => !s.conflict || s.conflict.length < 10);
      if (scenesWithoutConflict.length > 2) {
        console.warn(`[EP${episodeNumber} BATCH${batchIndex}] QC Warning: ${scenesWithoutConflict.length} scenes without clear conflict`);
      }

      const durationMs = Date.now() - startedAt;
      console.log(`[EP${episodeNumber} BATCH${batchIndex}] ✅ Success in ${durationMs}ms | Mode: ${narrativeMode || 'serie_adictiva'}`);

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
            scenesGenerated: 5,
            narrativeMode: narrativeMode || 'serie_adictiva'
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
          narrativeMode: narrativeMode || 'serie_adictiva'
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
