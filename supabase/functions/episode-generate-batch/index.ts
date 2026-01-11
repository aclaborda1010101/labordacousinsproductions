import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { logGenerationCost, extractUserId } from "../_shared/cost-logging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ⚠️ MODEL CONFIG - Lovable AI Gateway (GPT-5 family)
type GenerationModelType = 'rapido' | 'profesional' | 'hollywood';

interface ModelConfig {
  apiModel: string;
  provider: 'lovable';
  maxTokens: number;
  temperature: number;
}

const MODEL_CONFIGS: Record<GenerationModelType, ModelConfig> = {
  rapido: {
    apiModel: 'openai/gpt-5-mini',
    provider: 'lovable',
    maxTokens: 16000,
    temperature: 0.7
  },
  profesional: {
    apiModel: 'openai/gpt-5',
    provider: 'lovable',
    maxTokens: 16000,
    temperature: 0.75
  },
  hollywood: {
    apiModel: 'openai/gpt-5.2',
    provider: 'lovable',
    maxTokens: 12000,
    temperature: 0.75
  }
};

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

// SHOOT-READY SYSTEM PROMPT
const SHOOT_READY_SYSTEM_PROMPT = `Eres un Director de Fotografía y Script Supervisor profesional de alto nivel (nivel HBO/Netflix).

Tu trabajo es generar escenas SHOOT-READY con especificaciones técnicas COMPLETAS que un DP pueda ejecutar directamente.

═══════════════════════════════════════════════════════════
FORMATO OBLIGATORIO PARA CADA ESCENA
═══════════════════════════════════════════════════════════

1. CAMERA SPECS COMPLETAS:
   - Lens específico (14mm, 24mm, 35mm, 50mm, 85mm, 100mm, 135mm, 200mm)
   - Aperture exacto (f/1.4, f/1.8, f/2.0, f/2.8, f/4, f/5.6, f/8, f/11)
   - Framing type (ELS, LS, MLS, MS, MCU, CU, ECU, OTS, POV, TWO-SHOT, INSERT)
   - Movement description ESPECÍFICO (no genérico)
   - Movement type (static, dolly in/out, crane, pan, tilt, handheld, steadicam, drone, tracking, whip pan, zoom)
   - Frame rate (24fps standard, 60fps slight slow-mo, 120fps dramatic slow-mo)
   - Aspect ratio (2.39:1 cinematic, 16:9 TV, 4:3 retro)

2. VISUAL SPECIFICS (3-8 elementos):
   - Detalles CONCRETOS que el DP puede ejecutar
   - NO emociones abstractas ("se ve preocupado")
   - SÍ elementos visuales específicos ("sudor visible en sienes", "reflejo de monitor en pupilas")

3. ACTION BLOCKS (mínimo 6):
   - Cada block con camera angle específico (WIDE, MEDIUM, CLOSE ON, ECU, OTS, POV, INSERT, TRACKING, CRANE, ESTABLISHING, AERIAL)
   - Subject específico del encuadre
   - Máximo 4 líneas por block
   - Un beat visual por block

4. LIGHTING SPECS COMPLETAS:
   - Setup type (natural, three-point, high-key, low-key, silhouette, practical only, mixed)
   - Key light: position (45° left/right, Rembrandt, Butterfly, Split, overhead), quality (soft/hard/diffused/direct), intensity (low/medium/high)
   - Fill light: ratio (1:2, 1:4, etc.) si aplica
   - Rim light: position (back left, back right, directly behind) si aplica
   - Practicals en escena (nombre y color de temperatura)
   - Color temperature (2700K tungsten, 3200K tungsten, 4000K cool white, 5600K daylight, 6500K overcast, 7000K+ cool blue)
   - Mood description específico (mínimo 15 palabras)

5. SOUND DESIGN ESPECÍFICO:
   - Room tone específico del espacio
   - Ambient layers (mínimo 2)
   - Foley específico (no genérico)
   - SFX con descripción exacta (incluir frecuencias cuando sea relevante)
   - Music cue si aplica
   - Sound perspective (close, medium, distant, POV)
   - Dialogue recording notes si hay algo especial

6. COLOR GRADING:
   - LUT base o style reference
   - Saturation level (desaturated, normal, saturated, hyper-saturated)
   - Contrast level (low, normal, high)
   - Color tone específico (e.g., "cool blue teal shadows", "warm orange highlights")
   - Notes específicas

7. TRANSITION AL FINAL:
   - Type exacto (CUT TO, HARD CUT, SMASH CUT, MATCH CUT, JUMP CUT, CROSS DISSOLVE, FADE TO BLACK, FADE FROM BLACK, FADE TO WHITE, WIPE, IRIS)
   - Duration si aplica (0.5s, 1s, 2s)
   - Description si es compleja

═══════════════════════════════════════════════════════════
EJEMPLOS CORRECTOS vs INCORRECTOS
═══════════════════════════════════════════════════════════

✅ CORRECTO lens: "85mm portrait"
❌ INCORRECTO: "standard lens"

✅ CORRECTO movement: "Dolly in 6 inches over 3 seconds, following subject's hand"
❌ INCORRECTO: "camera moves in"

✅ CORRECTO visual_specifics: ["Iris café con reflejos de códigos", "Sudor visible en sienes", "Pestañas en foco perfecto, resto bokeh extremo"]
❌ INCORRECTO: ["Elena preocupada", "Se ve tensión"]

✅ CORRECTO lighting mood: "Clinical, cold, scientific atmosphere with blue-tinted practicals casting harsh geometric shadows"
❌ INCORRECTO: "tense lighting"

NUNCA uses términos genéricos como "normal", "standard", "moves", "lighting". Siempre sé ESPECÍFICO.`;

// Tool schema for structured output
const getToolSchema = (scenesPerBatch: number) => ({
  name: "generate_shoot_ready_scenes",
  description: `Genera exactamente ${scenesPerBatch} escenas SHOOT-READY con especificaciones técnicas COMPLETAS para producción profesional`,
  parameters: {
    type: "object",
    properties: {
      synopsis: { 
        type: "string", 
        description: "Sinopsis del episodio (100-200 palabras)" 
      },
      scenes: {
        type: "array",
        description: `Exactamente ${scenesPerBatch} escenas con formato SHOOT-READY`,
        items: {
          type: "object",
          properties: {
            scene_number: { type: "number" },
            slugline: { type: "string", description: "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE" },
            summary: { type: "string", description: "Resumen de 50-80 palabras" },
            duration_seconds: { type: "number", description: "Duración estimada en segundos" },
            camera_specs: {
              type: "object",
              properties: {
                lens: { type: "string" },
                aperture: { type: "string" },
                framing: { type: "string" },
                movement: { type: "string" },
                movement_type: { type: "string" },
                frame_rate: { type: "number" },
                aspect_ratio: { type: "string" }
              },
              required: ["lens", "aperture", "framing", "movement", "movement_type", "frame_rate"]
            },
            visual_specifics: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 8
            },
            action_blocks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  camera_angle: { type: "string" },
                  subject: { type: "string" },
                  action_text: { type: "string" }
                },
                required: ["camera_angle", "action_text"]
              },
              minItems: 6
            },
            sound_specifics: {
              type: "object",
              properties: {
                dialogue_recording_notes: { type: "string" },
                room_tone: { type: "string" },
                ambience: { type: "array", items: { type: "string" } },
                foley: { type: "array", items: { type: "string" } },
                sfx: { type: "array", items: { type: "string" } },
                music_cue: { type: "string" },
                sound_perspective: { type: "string" }
              },
              required: ["room_tone", "ambience", "sound_perspective"]
            },
            lighting_specs: {
              type: "object",
              properties: {
                setup: { type: "string" },
                key_light: {
                  type: "object",
                  properties: {
                    position: { type: "string" },
                    quality: { type: "string" },
                    intensity: { type: "string" }
                  },
                  required: ["position", "quality", "intensity"]
                },
                fill_light: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    ratio: { type: "string" }
                  }
                },
                rim_light: {
                  type: "object",
                  properties: {
                    present: { type: "boolean" },
                    position: { type: "string" }
                  }
                },
                practicals: { type: "array", items: { type: "string" } },
                color_temperature: { type: "string" },
                mood: { type: "string" }
              },
              required: ["setup", "key_light", "color_temperature", "mood"]
            },
            dialogue: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  character: { type: "string" },
                  parenthetical: { type: "string" },
                  line: { type: "string" },
                  action_before: { type: "string" },
                  action_after: { type: "string" }
                },
                required: ["character", "line"]
              }
            },
            vfx_notes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  timing: { type: "string" },
                  complexity: { type: "string" }
                }
              }
            },
            color_grading: {
              type: "object",
              properties: {
                lut_base: { type: "string" },
                saturation: { type: "string" },
                contrast: { type: "string" },
                tone: { type: "string" },
                notes: { type: "string" }
              },
              required: ["saturation", "contrast", "tone"]
            },
            transition: {
              type: "object",
              properties: {
                type: { type: "string" },
                duration: { type: "string" },
                description: { type: "string" }
              },
              required: ["type"]
            },
            characters: { type: "array", items: { type: "string" } },
            conflict: { type: "string" },
            consequence: { type: "string" },
            mood: { type: "string" },
            is_cliffhanger: { type: "boolean" }
          },
          required: [
            "scene_number",
            "slugline",
            "camera_specs",
            "visual_specifics",
            "action_blocks",
            "sound_specifics",
            "lighting_specs",
            "color_grading",
            "transition",
            "characters",
            "dialogue",
            "conflict",
            "mood"
          ]
        }
      }
    },
    required: ["scenes"]
  }
});

// Lovable AI Gateway call (unified for all models)
async function callLovableAI(
  modelConfig: ModelConfig,
  systemPrompt: string,
  userPrompt: string,
  toolSchema: any,
  signal: AbortSignal
): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelConfig.apiModel,
      max_tokens: modelConfig.maxTokens,
      temperature: modelConfig.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [{
        type: "function",
        function: toolSchema
      }],
      tool_choice: { type: "function", function: { name: toolSchema.name } }
    }),
    signal
  });

  // Handle rate limits and payment required
  if (response.status === 429) {
    throw { status: 429, message: "Rate limit exceeded", retryable: true };
  }
  if (response.status === 402) {
    throw { status: 402, message: "Payment required - add credits to Lovable AI" };
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Lovable AI Gateway Error:`, response.status, errorText);
    throw new Error(`Lovable AI Gateway error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall?.function?.arguments) {
    throw new Error("No tool call in Lovable AI response");
  }

  return JSON.parse(toolCall.function.arguments);
}

/**
 * Genera UN SOLO batch de escenas con formato SHOOT-READY.
 * Soporta múltiples modelos: GPT-4o-mini (rápido), GPT-4o (profesional), Claude (hollywood)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 150000); // 150s timeout

  try {
    const { 
      outline, 
      episodeNumber, 
      language, 
      batchIndex, 
      previousScenes, 
      narrativeMode,
      scenesPerBatch = 5,
      totalBatches = 5,
      isLastBatch: isLastBatchParam,
    // NEW: Generation model selection
      generationModel: rawGenerationModel = 'hollywood'
    } = await req.json();

    // Validate generation model
    const validModels: GenerationModelType[] = ['rapido', 'profesional', 'hollywood'];
    const generationModel: GenerationModelType = validModels.includes(rawGenerationModel) 
      ? rawGenerationModel 
      : 'hollywood';

    if (!outline || !episodeNumber || typeof batchIndex !== "number") {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: "outline, episodeNumber y batchIndex requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
    if (!episodeBeat) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: `Episode beat ${episodeNumber} not found` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get model configuration
    const modelConfig = MODEL_CONFIGS[generationModel] || MODEL_CONFIGS.hollywood;
    console.log(`[EP${episodeNumber} BATCH${batchIndex}] Using model: ${modelConfig.apiModel} (${generationModel})`);

    // Lovable AI Gateway - no external API key needed
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no configurada');
    }

    // Calculate scene range for this batch using dynamic config
    const SCENES_PER_BATCH = Math.max(1, Math.min(10, scenesPerBatch)); // Clamp 1-10
    const sceneStart = batchIndex * SCENES_PER_BATCH + 1;
    const sceneEnd = sceneStart + SCENES_PER_BATCH - 1;
    const isLastBatch = isLastBatchParam ?? (batchIndex === totalBatches - 1);

    console.log(`[EP${episodeNumber} BATCH${batchIndex}] Generating SHOOT-READY scenes ${sceneStart}-${sceneEnd} (${SCENES_PER_BATCH} scenes) | Mode: ${narrativeMode || 'serie_adictiva'} | Model: ${generationModel}...`);

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

    const userPrompt = `Genera escenas ${sceneStart}-${sceneEnd} SHOOT-READY del episodio ${episodeNumber}.

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

${priorSummary ? `ESCENAS YA GENERADAS (para continuidad):\n${priorSummary}\n` : ""}

TAREA: Genera EXACTAMENTE ${SCENES_PER_BATCH} escenas SHOOT-READY (números ${sceneStart} a ${sceneEnd}).
${isLastBatch ? `\n⚠️ ÚLTIMA BATCH: La escena ${sceneEnd} DEBE contener el CLIFFHANGER del episodio.` : ''}

CRITICAL: Cada escena debe ser EJECUTABLE DIRECTAMENTE por un Director de Fotografía.
Incluye TODAS las especificaciones técnicas: camera_specs, visual_specifics, action_blocks, sound_specifics, lighting_specs, color_grading, transition.

IDIOMA: ${language || "es-ES"}

Usa la herramienta generate_shoot_ready_scenes para devolver las ${SCENES_PER_BATCH} escenas con formato profesional.`;

    // Get tool schema
    const toolSchema = getToolSchema(SCENES_PER_BATCH);

    // Try up to 2 attempts
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Adjust temperature for retries
      const attemptConfig = { 
        ...modelConfig, 
        temperature: attempt === 1 ? modelConfig.temperature : modelConfig.temperature - 0.15 
      };

      try {
        // Call Lovable AI Gateway (unified for all models)
        const result = await callLovableAI(
          attemptConfig,
          SHOOT_READY_SYSTEM_PROMPT,
          userPrompt,
          toolSchema,
          controller.signal
        );

        const scenes = result?.scenes;
        if (!Array.isArray(scenes) || scenes.length !== SCENES_PER_BATCH) {
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] Invalid scenes count:`, scenes?.length, `expected ${SCENES_PER_BATCH}`);
          lastError = `Expected ${SCENES_PER_BATCH} scenes, got ${scenes?.length || 0}`;
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

        // QC Check: Ensure scenes have technical specs
        const scenesWithoutSpecs = scenes.filter((s: any) => !s.camera_specs || !s.lighting_specs);
        if (scenesWithoutSpecs.length > 0) {
          console.warn(`[EP${episodeNumber} BATCH${batchIndex}] QC Warning: ${scenesWithoutSpecs.length} scenes without technical specs`);
        }

        clearTimeout(timeoutId);
        const durationMs = Date.now() - startedAt;
        console.log(`[EP${episodeNumber} BATCH${batchIndex}] ✅ SHOOT-READY Success in ${durationMs}ms | Model: ${generationModel} | Provider: ${modelConfig.provider}`);

        // Log generation cost
        const userId = extractUserId(req.headers.get('authorization'));
        if (userId) {
          await logGenerationCost({
            userId,
            slotType: `script_episode_batch_shoot_ready`,
            engine: modelConfig.apiModel,
            durationMs,
            success: true,
            metadata: {
              episodeNumber,
              batchIndex,
              scenesGenerated: SCENES_PER_BATCH,
              narrativeMode: narrativeMode || 'serie_adictiva',
              format: 'shoot-ready',
              generationModel,
              provider: modelConfig.provider
            }
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            batchIndex,
            sceneStart,
            sceneEnd,
            synopsis: result.synopsis || null,
            scenes,
            durationMs,
            narrativeMode: narrativeMode || 'serie_adictiva',
            format: 'shoot-ready',
            model: modelConfig.apiModel,
            provider: modelConfig.provider
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError: any) {
        if (fetchError?.status === 429) {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ error: "Rate limit alcanzado. Espera un momento.", retryable: true }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (fetchError?.status === 402) {
          clearTimeout(timeoutId);
          return new Response(
            JSON.stringify({ error: fetchError.message }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          lastError = "Request timeout (150s)";
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] Timeout after 150s`);
        } else {
          lastError = fetchError?.message || "Unknown error";
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] Error:`, fetchError);
        }
      }
    }

    // All attempts failed
    clearTimeout(timeoutId);
    return new Response(
      JSON.stringify({ error: lastError || "Failed to generate SHOOT-READY batch after 2 attempts" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[BATCH ERROR]", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
