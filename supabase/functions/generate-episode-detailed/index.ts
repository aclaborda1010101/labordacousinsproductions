import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function contentSummary(data: any) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks
    .map((b: any) => ({ type: b.type, name: b.name }))
    .slice(0, 10);
}

type ClaudeHttpError = {
  kind: "http_error";
  status: number;
  payload: Record<string, unknown>;
};

type ClaudeOk = {
  kind: "ok";
  data: any;
};

type ClaudeRes = ClaudeHttpError | ClaudeOk;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const { outline, episodeNumber, language } = await req.json();

    if (!outline || !episodeNumber) {
      return new Response(JSON.stringify({ error: "Outline y episodeNumber requeridos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
    if (!episodeBeat) {
      return new Response(JSON.stringify({ error: `Episode beat ${episodeNumber} not found` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

    const charactersRef =
      outline.main_characters
        ?.map((c: any) => `- ${c.name} (${c.role || "personaje"}): ${c.description || ""}`)
        .join("\n") ||
      "";

    const locationsRef =
      outline.main_locations
        ?.map((l: any) => `- ${l.name} (${l.type || "INT"}): ${l.description || ""}`)
        .join("\n") ||
      "";

    // Tool Use: generamos el episodio en 3 chunks (1-5, 6-10, 11-15)
    // para evitar timeouts y respuestas gigantes.
    const tools = [
      {
        name: "generate_episode_chunk",
        description:
          "Genera un chunk de escenas de un episodio (5 escenas) y devuelve synopsis + escenas estructuradas.",
        input_schema: {
          type: "object",
          properties: {
            episode_number: { type: "number" },
            title: { type: "string" },
            synopsis: { type: "string", description: "150-300 palabras" },
            scenes: {
              type: "array",
              description: "Debe contener EXACTAMENTE 5 escenas para este chunk",
              items: {
                type: "object",
                properties: {
                  scene_number: { type: "number" },
                  slugline: {
                    type: "string",
                    description: "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE",
                  },
                  summary: { type: "string", description: "1-2 frases" },
                  action: { type: "string", description: "80-160 palabras (acción visual)" },
                  characters: { type: "array", items: { type: "string" } },
                  dialogue: {
                    type: "array",
                    description: "MÍNIMO 6 intercambios",
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
                required: [
                  "scene_number",
                  "slugline",
                  "action",
                  "characters",
                  "dialogue",
                  "mood",
                  "duration_estimate_sec",
                ],
              },
            },
          },
          required: ["episode_number", "title", "synopsis", "scenes"],
        },
      },
    ];

    const callClaude = async (prompt: string, temperature: number): Promise<ClaudeRes> => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 6500,
          temperature,
          tools,
          tool_choice: { type: "tool", name: "generate_episode_chunk" },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EPISODE ${episodeNumber} ERROR]`, response.status, errorText);

        if (response.status === 429) {
          return {
            kind: "http_error",
            status: 429,
            payload: { error: "Rate limit alcanzado. Espera un momento." },
          };
        }

        if (response.status === 400 && errorText.toLowerCase().includes("credit")) {
          return {
            kind: "http_error",
            status: 402,
            payload: { error: "Créditos insuficientes en la cuenta de Claude." },
          };
        }

        return {
          kind: "http_error",
          status: 500,
          payload: {
            error: `Claude API error: ${response.status}`,
            details: errorText.slice(0, 1200),
          },
        };
      }

      const data = await response.json();
      return { kind: "ok", data };
    };

    const seriesTitle = outline.title || "Sin título";
    const episodeTitle = episodeBeat.title || `Episodio ${episodeNumber}`;
    const episodeBeatSummary = episodeBeat.summary || "Por definir";

    const baseContext = `
Genera el episodio usando la herramienta generate_episode_chunk.

SERIE: ${seriesTitle}
EPISODIO ${episodeNumber}: ${episodeTitle}
SINOPSIS DEL EPISODIO (BEAT): ${episodeBeatSummary}

PERSONAJES DISPONIBLES:
${charactersRef || "- (Crear personajes necesarios)"}

LOCALIZACIONES DISPONIBLES:
${locationsRef || "- (Crear localizaciones necesarias)"}

IDIOMA DE LOS DIÁLOGOS: ${language || "es-ES"}

REQUISITOS OBLIGATORIOS:
- Este request debe devolver EXACTAMENTE 5 escenas en scenes.
- Cada escena debe tener acción y diálogo con mínimo 6 intercambios.
- Las escenas deben tener conflicto dramático.
`;

    const scenes: any[] = [];
    let synopsisFromClaude: string | null = null;
    let lastDebug: any = null;

    const chunkRanges = [
      { start: 1, end: 5 },
      { start: 6, end: 10 },
      { start: 11, end: 15 },
    ];

    for (let ci = 0; ci < chunkRanges.length; ci++) {
      const { start, end } = chunkRanges[ci];
      const chunkStartedAt = Date.now();

      const prior = scenes
        .map((s) => `- ${s.scene_number}. ${s.slugline}: ${s.summary || ""}`)
        .slice(-8)
        .join("\n");

      const prompt = `${baseContext}

CHUNK ${ci + 1}/3:
Genera SOLO las escenas ${start}-${end} (scene_number debe estar entre ${start} y ${end}).
Devuelve EXACTAMENTE 5 escenas.

Continuidad (escenas ya generadas):
${prior || "- (Ninguna aún)"}

IMPORTANTE: devuelve TODO via tool use (no texto).`;

      console.log(`[EPISODE ${episodeNumber}] Generating scenes ${start}-${end} (chunk ${ci + 1})...`);

      // 2 intentos por chunk (temperatura más baja en retry)
      let chunkOk = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const temperature = attempt === 1 ? 0.7 : 0.4;

        const res = await callClaude(prompt, temperature);
        if (res.kind === "http_error") {
          return new Response(JSON.stringify(res.payload), {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const data = res.data;
        lastDebug = {
          stop_reason: data?.stop_reason,
          usage: data?.usage,
          content: contentSummary(data),
        };

        const toolUseBlock = data?.content?.find(
          (b: any) => b?.type === "tool_use" && b?.name === "generate_episode_chunk",
        );

        const input = toolUseBlock?.input;
        const chunkScenes = input?.scenes;

        if (!input || !Array.isArray(chunkScenes)) {
          console.error(
            `[EPISODE ${episodeNumber}] Chunk ${ci + 1} attempt ${attempt}: no tool_use input`,
            lastDebug,
          );
          continue;
        }

        if (!synopsisFromClaude && typeof input.synopsis === "string" && input.synopsis.trim()) {
          synopsisFromClaude = input.synopsis.trim();
        }

        if (chunkScenes.length !== 5) {
          console.error(
            `[EPISODE ${episodeNumber}] Chunk ${ci + 1} attempt ${attempt}: invalid scenes length`,
            { len: chunkScenes.length, ...lastDebug },
          );
          continue;
        }

        const inRange = chunkScenes.every(
          (s: any) => typeof s?.scene_number === "number" && s.scene_number >= start && s.scene_number <= end,
        );
        if (!inRange) {
          console.error(
            `[EPISODE ${episodeNumber}] Chunk ${ci + 1} attempt ${attempt}: scene_number out of range`,
            { start, end, preview: chunkScenes.map((s: any) => s.scene_number), ...lastDebug },
          );
          continue;
        }

        scenes.push(...chunkScenes);
        chunkOk = true;
        break;
      }

      if (!chunkOk) {
        throw new Error(
          `No se pudo generar chunk ${ci + 1} (${start}-${end}). Debug: ${JSON.stringify(lastDebug)}`,
        );
      }

      console.log(
        `[EPISODE ${episodeNumber}] Chunk ${ci + 1} OK in ${Date.now() - chunkStartedAt}ms (total scenes=${scenes.length})`,
      );
    }

    // Normalize & compute stats
    const normalizedScenes = scenes
      .filter((s) => s && typeof s.scene_number === "number")
      .sort((a, b) => a.scene_number - b.scene_number);

    if (normalizedScenes.length < 15) {
      throw new Error(
        `Episodio incompleto: ${normalizedScenes.length} escenas. Debug: ${JSON.stringify(lastDebug)}`,
      );
    }

    const totalDialogueLines = normalizedScenes.reduce(
      (acc: number, s: any) => acc + (Array.isArray(s.dialogue) ? s.dialogue.length : 0),
      0,
    );

    const durationMin = Math.round(
      normalizedScenes.reduce((acc: number, s: any) => acc + (s.duration_estimate_sec || 90), 0) / 60,
    );

    const episode = {
      episode_number: episodeNumber,
      title: episodeTitle,
      synopsis: synopsisFromClaude || episodeBeatSummary,
      scenes: normalizedScenes,
      duration_min: durationMin,
      total_duration_min: durationMin,
      total_dialogue_lines: totalDialogueLines,
    };

    console.log(
      `[EPISODE ${episodeNumber}] ✅ Success: ${episode.scenes.length} scenes, ${totalDialogueLines} dialogue lines, ${durationMin} min (total ${Date.now() - startedAt}ms)`,
    );

    // Importante: NO devolvemos screenplay_text para evitar payload duplicado gigante.
    return new Response(JSON.stringify({ success: true, episode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EPISODE ERROR]", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

