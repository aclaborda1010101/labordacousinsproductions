import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateScreenplayText(episode: any): string {
  let text = `EPISODIO ${episode.episode_number}: ${episode.title?.toUpperCase() || "SIN TÍTULO"}\n\n`;
  if (episode.synopsis) text += `${episode.synopsis}\n\n`;
  text += `FADE IN:\n\n`;

  for (const scene of (episode.scenes || [])) {
    text += `${scene.scene_number || 0}. ${scene.slugline || "ESCENA"}\n\n`;

    if (scene.description) text += `${scene.description}\n\n`;

    if (Array.isArray(scene.dialogue) && scene.dialogue.length > 0) {
      for (const line of scene.dialogue) {
        text += `                    ${line.character || "PERSONAJE"}\n`;
        if (line.parenthetical) text += `              ${line.parenthetical}\n`;
        text += `          ${line.line || ""}\n\n`;
      }
    }

    text += "\n";
  }

  text += `FADE OUT.\n`;
  return text;
}

function contentSummary(data: any) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  return blocks.map((b: any) => ({ type: b.type, name: b.name })).slice(0, 10);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { outline, episodeNumber, language } = await req.json();

    if (!outline || !episodeNumber) {
      return new Response(
        JSON.stringify({ error: "Outline y episodeNumber requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
    if (!episodeBeat) {
      return new Response(
        JSON.stringify({ error: `Episode beat ${episodeNumber} not found` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

    const charactersRef = outline.main_characters?.map((c: any) =>
      `- ${c.name} (${c.role || "personaje"}): ${c.description || ""}`
    ).join("\n") || "";

    const locationsRef = outline.main_locations?.map((l: any) =>
      `- ${l.name} (${l.type || "INT"}): ${l.description || ""}`
    ).join("\n") || "";

    const tools = [
      {
        name: "generate_episode",
        description: "Genera un episodio completo con escenas y diálogos.",
        input_schema: {
          type: "object",
          properties: {
            episode_number: { type: "number" },
            title: { type: "string" },
            synopsis: { type: "string", description: "150-300 palabras" },
            scenes: {
              type: "array",
              description: "Array de escenas del episodio (MÍNIMO 15 escenas)",
              items: {
                type: "object",
                properties: {
                  scene_number: { type: "number" },
                  slugline: { type: "string", description: "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE" },
                  description: { type: "string", description: "100-200 palabras de acción visual" },
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
                  mood: { type: "string" },
                  duration_estimate_sec: { type: "number" },
                },
                required: [
                  "scene_number",
                  "slugline",
                  "description",
                  "characters",
                  "dialogue",
                  "mood",
                  "duration_estimate_sec",
                ],
              },
            },
            total_duration_min: { type: "number" },
          },
          required: ["episode_number", "title", "synopsis", "scenes"],
        },
      },
    ];

    const basePrompt = `Genera el guión COMPLETO del episodio usando la herramienta generate_episode.

SERIE: ${outline.title || "Sin título"}
EPISODIO ${episodeNumber}: ${episodeBeat.title || `Episodio ${episodeNumber}`}
SINOPSIS DEL EPISODIO: ${episodeBeat.summary || "Por definir"}

PERSONAJES DISPONIBLES (úsalos en las escenas):
${charactersRef || "- (Crear personajes necesarios)"}

LOCALIZACIONES DISPONIBLES (úsalas en las escenas):
${locationsRef || "- (Crear localizaciones necesarias)"}

IDIOMA DE LOS DIÁLOGOS: ${language || "es-ES"}

ESTRUCTURA DEL EPISODIO:
- Acto 1 (Escenas 1-5): Presentación del conflicto
- Acto 2 (Escenas 6-12): Desarrollo y complicaciones
- Acto 3 (Escenas 13-15): Clímax y resolución

REQUISITOS OBLIGATORIOS:
1. Genera MÍNIMO 15 escenas completas
2. Cada escena con diálogo debe tener MÍNIMO 6 intercambios
3. Descripción de acción: 100-200 palabras por escena
4. Conflicto dramático en CADA escena

Ahora genera el episodio ${episodeNumber} completo usando la herramienta generate_episode.`;

    const callClaude = async (prompt: string, temperature: number) => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          temperature,
          tools,
          tool_choice: { type: "tool", name: "generate_episode" },
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[EPISODE ${episodeNumber} ERROR]`, response.status, errorText);

        if (response.status === 429) {
          return { kind: "http_error", status: 429, payload: { error: "Rate limit alcanzado. Espera un momento." } };
        }

        if (response.status === 400 && errorText.toLowerCase().includes("credit")) {
          return { kind: "http_error", status: 402, payload: { error: "Créditos insuficientes en la cuenta de Claude." } };
        }

        return {
          kind: "http_error",
          status: 500,
          payload: { error: `Claude API error: ${response.status}`, details: errorText.slice(0, 1200) },
        };
      }

      const data = await response.json();
      return { kind: "ok", data };
    };

    let episode: any | null = null;
    let lastDebug: any = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const temperature = attempt === 1 ? 0.7 : 0.4;
      const prompt = attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nIMPORTANTE: Tu intento anterior fue INVÁLIDO (scenes vacío o insuficiente). Debes devolver 15+ escenas y 6+ líneas de diálogo por escena.`;

      console.log(`[EPISODE ${episodeNumber}] Generating with Claude Tool Use (attempt ${attempt})...`);

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

      const toolUseBlock = data?.content?.find((b: any) => b?.type === "tool_use" && b?.name === "generate_episode");
      if (!toolUseBlock?.input) {
        console.error(`[EPISODE ${episodeNumber}] No tool_use(generate_episode) found`, lastDebug);
        continue;
      }

      episode = toolUseBlock.input;

      const scenes = episode?.scenes;
      const scenesCount = Array.isArray(scenes) ? scenes.length : 0;

      console.log(`[EPISODE ${episodeNumber}] Tool extracted. scenes=${scenesCount}`);

      if (!Array.isArray(scenes) || scenesCount < 15) {
        console.error(`[EPISODE ${episodeNumber}] Invalid episode: scenes missing/too few`, {
          ...lastDebug,
          episode_preview: { ...episode, scenes: Array.isArray(scenes) ? scenes.slice(0, 1) : scenes },
        });
        episode = null;
        continue;
      }

      // Quick dialogue sanity (non-blocking)
      const totalDialogueLines = scenes.reduce((acc: number, s: any) => acc + (Array.isArray(s.dialogue) ? s.dialogue.length : 0), 0);
      console.log(`[EPISODE ${episodeNumber}] Stats: ${scenesCount} scenes, ${totalDialogueLines} dialogue lines`);

      break;
    }

    if (!episode) {
      throw new Error(`El episodio no tiene escenas (debug: ${JSON.stringify(lastDebug)})`);
    }

    // Generate screenplay text
    episode.screenplay_text = generateScreenplayText(episode);

    // Calculate total duration
    if (!episode.total_duration_min) {
      episode.total_duration_min = Math.round(
        (episode.scenes || []).reduce((acc: number, s: any) => acc + (s.duration_estimate_sec || 90), 0) / 60,
      );
    }

    console.log(`[EPISODE ${episodeNumber}] ✅ Success: ${episode.scenes.length} scenes, ${episode.total_duration_min} min`);

    return new Response(JSON.stringify({ success: true, episode }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[EPISODE ERROR]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

