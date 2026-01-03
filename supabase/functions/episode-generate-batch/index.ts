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

/**
 * Genera UN SOLO batch de escenas con formato SHOOT-READY.
 * Soporta configuración dinámica: scenesPerBatch, totalBatches, isLastBatch
 * Por defecto: 5 escenas por batch si no se especifica.
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
      // Dynamic batch config (optional, defaults to 5 scenes per batch)
      scenesPerBatch = 5,
      totalBatches = 5,
      isLastBatch: isLastBatchParam
    } = await req.json();

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

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

    // Calculate scene range for this batch using dynamic config
    const SCENES_PER_BATCH = Math.max(1, Math.min(10, scenesPerBatch)); // Clamp 1-10
    const sceneStart = batchIndex * SCENES_PER_BATCH + 1;
    const sceneEnd = sceneStart + SCENES_PER_BATCH - 1;
    const isLastBatch = isLastBatchParam ?? (batchIndex === totalBatches - 1);

    console.log(`[EP${episodeNumber} BATCH${batchIndex}] Generating SHOOT-READY scenes ${sceneStart}-${sceneEnd} (${SCENES_PER_BATCH} scenes) | Mode: ${narrativeMode || 'serie_adictiva'}...`);

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

    // SHOOT-READY TOOL SCHEMA
    const tools = [
      {
        name: "generate_shoot_ready_scenes",
        description: `Genera exactamente ${SCENES_PER_BATCH} escenas SHOOT-READY con especificaciones técnicas COMPLETAS para producción profesional`,
        input_schema: {
          type: "object",
          properties: {
            synopsis: { 
              type: "string", 
              description: "Sinopsis del episodio (100-200 palabras)" 
            },
            scenes: {
              type: "array",
              description: `Exactamente ${SCENES_PER_BATCH} escenas con formato SHOOT-READY`,
              minItems: SCENES_PER_BATCH,
              maxItems: SCENES_PER_BATCH,
              items: {
                type: "object",
                properties: {
                  scene_number: { type: "number" },
                  slugline: { type: "string", description: "INT./EXT. LOCALIZACIÓN - DÍA/NOCHE" },
                  summary: { type: "string", description: "Resumen de 50-80 palabras" },
                  duration_seconds: { type: "number", description: "Duración estimada en segundos" },
                  
                  // ═══════════════════════════════════════════════════
                  // CAMERA SPECIFICATIONS (REQUIRED)
                  // ═══════════════════════════════════════════════════
                  camera_specs: {
                    type: "object",
                    description: "Especificaciones técnicas completas de cámara",
                    properties: {
                      lens: {
                        type: "string",
                        description: "Lente específico",
                        enum: ["14mm ultra-wide", "24mm wide", "35mm wide-standard", "50mm standard", "85mm portrait", "100mm macro", "135mm telephoto", "200mm telephoto"]
                      },
                      aperture: {
                        type: "string",
                        description: "Apertura f-stop",
                        enum: ["f/1.4", "f/1.8", "f/2.0", "f/2.8", "f/4", "f/5.6", "f/8", "f/11"]
                      },
                      framing: {
                        type: "string",
                        description: "Tipo de encuadre",
                        enum: ["ELS (Extreme Long Shot)", "LS (Long Shot)", "MLS (Medium Long Shot)", "MS (Medium Shot)", "MCU (Medium Close-Up)", "CU (Close-Up)", "ECU (Extreme Close-Up)", "OTS (Over The Shoulder)", "POV (Point of View)", "TWO-SHOT", "INSERT"]
                      },
                      movement: {
                        type: "string",
                        description: "Descripción específica del movimiento de cámara (ej: 'Dolly in 6 inches over 3 seconds')"
                      },
                      movement_type: {
                        type: "string",
                        enum: ["static", "dolly in", "dolly out", "dolly left/right", "crane up", "crane down", "pan left", "pan right", "tilt up", "tilt down", "handheld", "steadicam", "drone", "tracking shot", "whip pan", "zoom in", "zoom out"]
                      },
                      frame_rate: {
                        type: "number",
                        description: "Frames por segundo",
                        enum: [24, 30, 60, 120]
                      },
                      aspect_ratio: {
                        type: "string",
                        enum: ["2.39:1", "16:9", "4:3", "1:1"]
                      }
                    },
                    required: ["lens", "aperture", "framing", "movement", "movement_type", "frame_rate"]
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // VISUAL SPECIFICS (REQUIRED)
                  // ═══════════════════════════════════════════════════
                  visual_specifics: {
                    type: "array",
                    description: "Elementos visuales específicos ejecutables (mínimo 3, máximo 8). NO emociones abstractas.",
                    items: { type: "string" },
                    minItems: 3,
                    maxItems: 8
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // ACTION BLOCKS (REQUIRED)
                  // ═══════════════════════════════════════════════════
                  action_blocks: {
                    type: "array",
                    description: "Bloques de acción con ángulos de cámara específicos (mínimo 6)",
                    items: {
                      type: "object",
                      properties: {
                        camera_angle: {
                          type: "string",
                          description: "Ángulo de cámara para este beat",
                          enum: ["WIDE", "MEDIUM", "CLOSE ON", "EXTREME CLOSE-UP", "OVER SHOULDER", "POV", "TWO-SHOT", "INSERT", "TRACKING SHOT", "CRANE SHOT", "ESTABLISHING SHOT", "AERIAL SHOT"]
                        },
                        subject: {
                          type: "string",
                          description: "Sujeto del encuadre"
                        },
                        action_text: {
                          type: "string",
                          description: "Descripción de la acción (máx 4 líneas, un beat visual)"
                        }
                      },
                      required: ["camera_angle", "action_text"]
                    },
                    minItems: 6
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // SOUND DESIGN (REQUIRED)
                  // ═══════════════════════════════════════════════════
                  sound_specifics: {
                    type: "object",
                    description: "Especificaciones detalladas de diseño de sonido",
                    properties: {
                      dialogue_recording_notes: {
                        type: "string",
                        description: "Notas para grabación de diálogo (ADR, reverb, etc.)"
                      },
                      room_tone: {
                        type: "string",
                        description: "Room tone / ambiente base del espacio"
                      },
                      ambience: {
                        type: "array",
                        description: "Capas de ambiente (mínimo 2)",
                        items: { type: "string" },
                        minItems: 2
                      },
                      foley: {
                        type: "array",
                        description: "Sonidos foley específicos necesarios",
                        items: { type: "string" }
                      },
                      sfx: {
                        type: "array",
                        description: "Efectos de sonido específicos",
                        items: { type: "string" }
                      },
                      music_cue: {
                        type: "string",
                        description: "Descripción de música si aplica"
                      },
                      sound_perspective: {
                        type: "string",
                        description: "Perspectiva sonora",
                        enum: ["close", "medium", "distant", "POV"]
                      }
                    },
                    required: ["room_tone", "ambience", "sound_perspective"]
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // LIGHTING (REQUIRED)
                  // ═══════════════════════════════════════════════════
                  lighting_specs: {
                    type: "object",
                    description: "Especificaciones completas de iluminación",
                    properties: {
                      setup: {
                        type: "string",
                        enum: ["natural", "three-point", "high-key", "low-key", "silhouette", "practical only", "mixed", "custom"]
                      },
                      key_light: {
                        type: "object",
                        properties: {
                          position: {
                            type: "string",
                            enum: ["45° left", "45° right", "90° left", "90° right", "overhead", "below (uplighting)", "Rembrandt", "Butterfly", "Split"]
                          },
                          quality: {
                            type: "string",
                            enum: ["soft", "hard", "diffused", "direct"]
                          },
                          intensity: {
                            type: "string",
                            enum: ["low", "medium", "high"]
                          }
                        },
                        required: ["position", "quality", "intensity"]
                      },
                      fill_light: {
                        type: "object",
                        properties: {
                          present: { type: "boolean" },
                          ratio: { type: "string", description: "Ratio de fill (ej: '1:2', '1:4')" }
                        }
                      },
                      rim_light: {
                        type: "object",
                        properties: {
                          present: { type: "boolean" },
                          position: { type: "string", enum: ["back left", "back right", "directly behind", "none"] }
                        }
                      },
                      practicals: {
                        type: "array",
                        description: "Luces prácticas en escena",
                        items: { type: "string" }
                      },
                      color_temperature: {
                        type: "string",
                        enum: ["2700K (warm tungsten)", "3200K (tungsten)", "4000K (cool white)", "5600K (daylight)", "6500K (overcast)", "7000K+ (cool blue)"]
                      },
                      mood: {
                        type: "string",
                        description: "Descripción del mood de iluminación (mínimo 15 palabras)"
                      }
                    },
                    required: ["setup", "key_light", "color_temperature", "mood"]
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // DIALOGUE
                  // ═══════════════════════════════════════════════════
                  dialogue: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        character: { type: "string" },
                        parenthetical: { type: "string" },
                        line: { type: "string" },
                        action_before: { type: "string", description: "Beat de acción antes del diálogo" },
                        action_after: { type: "string", description: "Beat de acción después del diálogo" }
                      },
                      required: ["character", "line"]
                    }
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // VFX NOTES
                  // ═══════════════════════════════════════════════════
                  vfx_notes: {
                    type: "array",
                    description: "Requerimientos VFX con timing",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string" },
                        timing: { type: "string" },
                        complexity: { type: "string", enum: ["simple", "medium", "complex"] }
                      }
                    }
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // COLOR GRADING
                  // ═══════════════════════════════════════════════════
                  color_grading: {
                    type: "object",
                    properties: {
                      lut_base: { type: "string", description: "LUT base o estilo de color" },
                      saturation: { type: "string", enum: ["desaturated", "normal", "saturated", "hyper-saturated"] },
                      contrast: { type: "string", enum: ["low", "normal", "high"] },
                      tone: { type: "string", description: "Tono de color específico (ej: 'cool blue teal shadows')" },
                      notes: { type: "string", description: "Notas específicas de color grading" }
                    },
                    required: ["saturation", "contrast", "tone"]
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // TRANSITION
                  // ═══════════════════════════════════════════════════
                  transition: {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: ["CUT TO", "HARD CUT", "SMASH CUT", "MATCH CUT", "JUMP CUT", "CROSS DISSOLVE", "FADE TO BLACK", "FADE FROM BLACK", "FADE TO WHITE", "WIPE", "IRIS IN/OUT"]
                      },
                      duration: { type: "string", description: "Duración de transición (ej: '0.5s', '2s')" },
                      description: { type: "string", description: "Notas específicas de transición" }
                    },
                    required: ["type"]
                  },
                  
                  // ═══════════════════════════════════════════════════
                  // NARRATIVE FIELDS
                  // ═══════════════════════════════════════════════════
                  characters: { type: "array", items: { type: "string" } },
                  conflict: { type: "string", description: "Conflicto central de la escena" },
                  consequence: { type: "string", description: "Qué cambia después de esta escena" },
                  mood: { type: "string" },
                  is_cliffhanger: { type: "boolean", description: "True si es el cliffhanger del episodio" }
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
      }
    ];

    // Try up to 2 attempts
    let lastError: string | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const temperature = attempt === 1 ? 0.75 : 0.6;

      try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: SCRIPT_MODEL,
            max_tokens: 12000, // Increased for SHOOT-READY format
            temperature,
            system: SHOOT_READY_SYSTEM_PROMPT,
            tools,
            tool_choice: { type: "tool", name: "generate_shoot_ready_scenes" },
            messages: [{ role: "user", content: userPrompt }],
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] API Error:`, response.status, errorText);

          if (response.status === 429) {
            clearTimeout(timeoutId);
            return new Response(
              JSON.stringify({ error: "Rate limit alcanzado. Espera un momento.", retryable: true }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          if (response.status === 400 && errorText.toLowerCase().includes("credit")) {
            clearTimeout(timeoutId);
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
          (b: any) => b?.type === "tool_use" && b?.name === "generate_shoot_ready_scenes"
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
        if (!Array.isArray(scenes) || scenes.length !== SCENES_PER_BATCH) {
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] Invalid scenes count:`, scenes.length, `expected ${SCENES_PER_BATCH}`);
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
        console.log(`[EP${episodeNumber} BATCH${batchIndex}] ✅ SHOOT-READY Success in ${durationMs}ms | Mode: ${narrativeMode || 'serie_adictiva'}`);

        // Log generation cost
        const userId = extractUserId(req.headers.get('authorization'));
        if (userId) {
          await logGenerationCost({
            userId,
            slotType: `script_episode_batch_shoot_ready`,
            engine: SCRIPT_MODEL,
            durationMs,
            success: true,
            metadata: {
              episodeNumber,
              batchIndex,
              scenesGenerated: 5,
              narrativeMode: narrativeMode || 'serie_adictiva',
              format: 'shoot-ready'
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
            narrativeMode: narrativeMode || 'serie_adictiva',
            format: 'shoot-ready'
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          lastError = "Request timeout (150s)";
          console.error(`[EP${episodeNumber} BATCH${batchIndex}] Timeout after 150s`);
        } else {
          throw fetchError;
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
