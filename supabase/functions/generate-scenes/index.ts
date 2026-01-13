import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { parseJsonSafe } from "../_shared/llmJson.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ═══════════════════════════════════════════════════════════════════════════
// BATCH CONFIGURATION - Generate in small batches for JSON reliability
// ═══════════════════════════════════════════════════════════════════════════
const SCENES_PER_BATCH = 3;
const MAX_RETRIES = 2;

interface GenerateScenesRequest {
  projectId: string;
  episodeNo: number;
  synopsis: string;
  sceneCount?: number;
  narrativeMode?: 'SERIE_ADICTIVA' | 'VOZ_AUTOR' | 'GIRO_IMPREVISIBLE';
  generateFullShots?: boolean;
  microShotDuration?: number;
  isTeaser?: boolean;
  teaserType?: '60s' | '30s';
  teaserData?: {
    title: string;
    logline: string;
    music_cue: string;
    voiceover_text?: string;
    scenes: Array<{
      shot_type: string;
      duration_sec: number;
      description: string;
      character?: string;
      dialogue_snippet?: string;
      visual_hook: string;
      sound_design: string;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL CALLING SCHEMA - Force structured JSON output
// ═══════════════════════════════════════════════════════════════════════════
const SCENE_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "generate_scenes",
    description: "Generate cinematographic scenes with shots for video production",
    parameters: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scene_no: { type: "number", description: "Scene number in episode" },
              slugline: { type: "string", description: "Scene header like INT. LOCATION - DAY" },
              summary: { type: "string", description: "What happens in this scene" },
              time_of_day: { type: "string", enum: ["DAY", "NIGHT"] },
              character_names: { type: "array", items: { type: "string" } },
              location_name: { type: "string" },
              mood: { type: "string" },
              scene_setup: {
                type: "object",
                properties: {
                  camera_package: {
                    type: "object",
                    properties: {
                      body: { type: "string" },
                      codec: { type: "string" },
                      fps: { type: "number" },
                      shutter_angle: { type: "number" },
                      iso_target: { type: "number" }
                    }
                  },
                  lens_set: {
                    type: "object",
                    properties: {
                      family: { type: "string" },
                      look: { type: "string" },
                      available_focals: { type: "array", items: { type: "number" } }
                    }
                  },
                  lighting_plan: {
                    type: "object",
                    properties: {
                      key_style: { type: "string" },
                      color_temp_base_k: { type: "number" },
                      contrast_ratio: { type: "string" }
                    }
                  }
                }
              },
              shots: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    shot_id: { type: "string" },
                    shot_no: { type: "number" },
                    shot_type: { type: "string" },
                    coverage_type: { type: "string" },
                    story_purpose: { type: "string" },
                    camera_variation: {
                      type: "object",
                      properties: {
                        focal_mm: { type: "number" },
                        aperture: { type: "string" },
                        movement: { type: "string" },
                        height: { type: "string" },
                        stabilization: { type: "string" },
                        camera_body: { type: "string" },
                        lens_model: { type: "string" }
                      }
                    },
                    blocking: {
                      type: "object",
                      properties: {
                        subject_positions: { type: "string" },
                        screen_direction: { type: "string" },
                        action: { type: "string" },
                        timing_breakdown: { type: "string" }
                      }
                    },
                    dialogue: { type: ["string", "null"] },
                    duration_sec: { type: "number" },
                    lighting: {
                      type: "object",
                      properties: {
                        style: { type: "string" },
                        color_temp: { type: "string" },
                        key_light_direction: { type: "string" }
                      }
                    },
                    sound_design: {
                      type: "object",
                      properties: {
                        room_tone: { type: "string" },
                        ambience: { type: "array", items: { type: "string" } },
                        foley: { type: "array", items: { type: "string" } }
                      }
                    },
                    transition: {
                      type: "object",
                      properties: {
                        type: { type: "string" },
                        to_next: { type: "string" },
                        bridge_audio: { type: "string" }
                      }
                    },
                    edit_intent: {
                      type: "object",
                      properties: {
                        expected_cut: { type: "string" },
                        hold_ms: { type: "number" },
                        rhythm_note: { type: "string" },
                        viewer_notice: { type: "string" },
                        intention: { type: "string" }
                      }
                    },
                    ai_risks: { type: "array", items: { type: "string" } },
                    risk_mitigation: { type: "string" },
                    keyframe_hints: {
                      type: "object",
                      properties: {
                        start_frame: { type: "string" },
                        end_frame: { type: "string" },
                        mid_frames: { type: "array", items: { type: "string" } }
                      }
                    },
                    continuity: {
                      type: "object",
                      properties: {
                        wardrobe_notes: { type: "string" },
                        props_in_frame: { type: "array", items: { type: "string" } },
                        match_to_previous: { type: "string" }
                      }
                    },
                    hero: { type: "boolean" }
                  },
                  required: ["shot_no", "shot_type", "duration_sec"]
                }
              }
            },
            required: ["scene_no", "slugline", "summary", "time_of_day", "character_names", "location_name", "mood"]
          }
        }
      },
      required: ["scenes"]
    }
  }
};

const OUTLINE_TOOL_SCHEMA = {
  type: "function",
  function: {
    name: "generate_scene_outlines",
    description: "Generate scene outlines without detailed shots",
    parameters: {
      type: "object",
      properties: {
        scenes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              scene_no: { type: "number" },
              slugline: { type: "string" },
              summary: { type: "string" },
              time_of_day: { type: "string", enum: ["DAY", "NIGHT"] },
              character_names: { type: "array", items: { type: "string" } },
              location_name: { type: "string" },
              mood: { type: "string" }
            },
            required: ["scene_no", "slugline", "summary", "time_of_day", "character_names", "location_name", "mood"]
          }
        }
      },
      required: ["scenes"]
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// NARRATIVE MODE PROMPTS
// ═══════════════════════════════════════════════════════════════════════════

const NARRATIVE_MODE_PROMPTS = {
  SERIE_ADICTIVA: `MODO: SERIE ADICTIVA
Tu objetivo es crear contenido ALTAMENTE ADICTIVO al estilo de las mejores series de streaming.

REGLAS NARRATIVAS:
1. CLIFFHANGERS: Cada escena termina con tensión, revelación o pregunta abierta
2. RITMO FRENÉTICO: Escenas cortas, acción constante, cero tiempos muertos
3. GANCHOS EMOCIONALES: Al menos 2-3 momentos "wow" por episodio
4. CONFLICTO CONSTANTE: Ningún personaje está en paz, siempre hay fricción
5. STAKES CLAROS: El espectador sabe qué se pierde si el protagonista falla
6. INFORMACIÓN DOSIFICADA: Revelaciones graduales que mantienen el misterio

ESTRUCTURA DE CADA ESCENA:
- Hook en los primeros 10 segundos
- Escalada de tensión en el medio
- Cliffhanger o twist al final`,

  VOZ_AUTOR: `MODO: VOZ DE AUTOR
Tu objetivo es crear contenido con IDENTIDAD DISTINTIVA tipo auteur cinema.

REGLAS NARRATIVAS:
1. DIÁLOGOS ÚNICOS: Cada personaje tiene voz propia, reconocible sin ver quién habla
2. ATMÓSFERA DENSA: La ambientación es tan importante como la acción
3. SUBTEXTO: Lo no dicho es más importante que lo dicho
4. TEMPO CONTEMPLATIVO: Permitir "respirar" al espectador con silencios significativos
5. SIMBOLISMO VISUAL: Motivos recurrentes que refuerzan temas
6. PROFUNDIDAD PSICOLÓGICA: Motivaciones complejas, no héroes ni villanos puros

ESTRUCTURA DE CADA ESCENA:
- Establecimiento atmosférico
- Desarrollo de capas de significado
- Resonancia emocional duradera`,

  GIRO_IMPREVISIBLE: `MODO: GIRO IMPREVISIBLE
Tu objetivo es SUBVERTIR EXPECTATIVAS constantemente.

REGLAS NARRATIVAS:
1. ANTI-CLICHÉS: Si el espectador espera X, dale Y o Z
2. PERSONAJES IMPREDECIBLES: Las decisiones sorprenden pero son coherentes
3. NARRATIVA NO LINEAL: Flashbacks, flashforwards, perspectivas múltiples
4. FALSAS PISTAS: Plantar información que lleva a conclusiones erróneas
5. TWISTS ORGÁNICOS: Los giros se sienten inevitables en retrospectiva
6. REGLAS ROTAS: Las convenciones de género se subvierten

ESTRUCTURA DE CADA ESCENA:
- Setup que parece familiar
- Desarrollo que tuerce expectativas
- Resolución que redefine lo anterior`
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE GENERATOR SYSTEM PROMPT (simplified for tool calling)
// ═══════════════════════════════════════════════════════════════════════════

const SCENE_GENERATION_PROMPT = `Eres SHOWRUNNER + DOP con 30 años en Hollywood.
TU MISIÓN: Generar escenas COMPLETAS con planos profesionales listos para producción.

Cada escena DEBE incluir:
1. Información básica (slugline, summary, mood)
2. scene_setup con configuración técnica
3. shots[] con detalles cinematográficos

REGLAS CRÍTICAS:
- CADA ESCENA tiene 4-8 planos que cubren TODA la acción
- Los diálogos se DISTRIBUYEN entre planos
- Planos "hero" (emocionales) marcar como hero: true
- La secuencia de planos respeta el eje de 180°
- USA LA FUNCIÓN generate_scenes PARA RESPONDER`;

const OUTLINE_SYSTEM_PROMPT = `Eres SHOWRUNNER profesional.
Tu salida DEBE usar la función generate_scene_outlines.

Campos obligatorios por escena:
- scene_no (number)
- slugline (string) 
- summary (string)
- time_of_day ("DAY" | "NIGHT")
- character_names (string[])
- location_name (string)
- mood (string)`;

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Call AI with tool calling for structured output
// ═══════════════════════════════════════════════════════════════════════════
async function callAIWithTool(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  tool: any,
  model: string = 'google/gemini-2.5-flash',
  maxTokens: number = 8000
): Promise<{ ok: boolean; scenes: any[] | null; rawResponse?: string; error?: string }> {
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout per batch
  
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0, // Deterministic for JSON reliability
        max_tokens: maxTokens,
        tools: [tool],
        tool_choice: { type: "function", function: { name: tool.function.name } },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-scenes] AI API error:', response.status, errorText);
      
      return {
        ok: false,
        scenes: null,
        error: response.status === 429 ? 'RATE_LIMIT' : 
               response.status === 402 ? 'PAYMENT_REQUIRED' : 
               `API_ERROR_${response.status}`,
        rawResponse: errorText.substring(0, 1000),
      };
    }

    const aiData = await response.json();
    
    // Extract from tool call
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        if (Array.isArray(args.scenes) && args.scenes.length > 0) {
          return { ok: true, scenes: args.scenes };
        }
      } catch (e) {
        console.error('[generate-scenes] Tool call parse error:', e);
      }
    }
    
    // Fallback: try to parse from content (some models don't use tool_calls properly)
    const content = aiData.choices?.[0]?.message?.content;
    if (content) {
      const parsed = parseJsonSafe<any>(content, 'generate-scenes-fallback');
      if (parsed.ok) {
        const scenes = Array.isArray(parsed.json) ? parsed.json : parsed.json?.scenes;
        if (Array.isArray(scenes) && scenes.length > 0) {
          console.log('[generate-scenes] Extracted scenes from content fallback');
          return { ok: true, scenes };
        }
      }
      return { ok: false, scenes: null, rawResponse: content.substring(0, 2000), error: 'PARSE_FAILED' };
    }
    
    return { ok: false, scenes: null, error: 'NO_CONTENT' };
    
  } catch (fetchError: unknown) {
    clearTimeout(timeoutId);
    if (fetchError instanceof Error && fetchError.name === 'AbortError') {
      return { ok: false, scenes: null, error: 'TIMEOUT' };
    }
    throw fetchError;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // JWT VALIDATION (internal enforcement since verify_jwt = false at gateway)
    // ═══════════════════════════════════════════════════════════════════════════
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validate JWT using anon client
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getUser(token);
    
    if (claimsError || !claimsData?.user) {
      console.error('[generate-scenes] JWT validation failed:', claimsError?.message);
      return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = claimsData.user.id;
    console.log(`[generate-scenes] Authenticated user: ${userId}`);

    const body = await req.json() as GenerateScenesRequest;

    const { 
      projectId, 
      episodeNo, 
      synopsis, 
      sceneCount = 8, 
      narrativeMode = 'SERIE_ADICTIVA',
      isTeaser, 
      teaserType, 
      teaserData 
    } = body;

    const generateFullShots = body.generateFullShots ?? (isTeaser ? true : false);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const contentType = isTeaser ? `teaser ${teaserType}` : `episode ${episodeNo}`;
    console.log(`[generate-scenes] Generating for project ${projectId}, ${contentType}, mode: ${narrativeMode}, scenes: ${sceneCount}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch characters from bible
    const { data: characters } = await supabase
      .from('characters')
      .select('id, name, role, bio')
      .eq('project_id', projectId);

    console.log(`[generate-scenes] Found ${characters?.length || 0} characters`);

    // Fetch locations from bible
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name, description')
      .eq('project_id', projectId);

    console.log(`[generate-scenes] Found ${locations?.length || 0} locations`);

    // Fetch style pack for visual consistency
    const { data: stylePack } = await supabase
      .from('style_packs')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    const styleConfig = stylePack?.style_config as {
      presetId?: string;
      camera?: { body: string; lens: string; focalLength: string; aperture: string };
      style?: { lighting: string; colorPalette: string[]; mood: string; contrast: string; saturation: string; grain: string };
      promptModifiers?: string[];
      negativeModifiers?: string[];
    } | null;

    // Build context for AI
    const characterList = characters?.map(c => `- ${c.name} (${c.role || 'character'}): ${c.bio || 'No description'}`).join('\n') || 'No characters defined';
    const locationList = locations?.map(l => `- ${l.name}: ${l.description || 'No description'}`).join('\n') || 'No locations defined';

    const narrativeModePrompt = NARRATIVE_MODE_PROMPTS[narrativeMode] || NARRATIVE_MODE_PROMPTS.SERIE_ADICTIVA;

    // Determine tool and prompts based on mode
    const tool = generateFullShots ? SCENE_TOOL_SCHEMA : OUTLINE_TOOL_SCHEMA;
    const systemPrompt = generateFullShots 
      ? `${SCENE_GENERATION_PROMPT}\n\n${narrativeModePrompt}`
      : OUTLINE_SYSTEM_PROMPT;
    
    const maxTokensPerBatch = generateFullShots ? 8000 : 2000;

    // Map character names to IDs for later use
    const characterMap = new Map(characters?.map(c => [c.name.toLowerCase(), c.id]) || []);
    const locationMap = new Map(locations?.map(l => [l.name.toLowerCase(), l.id]) || []);

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH GENERATION - Generate scenes in small batches for reliability
    // ═══════════════════════════════════════════════════════════════════════════
    
    const allGeneratedScenes: any[] = [];
    const totalBatches = Math.ceil(sceneCount / SCENES_PER_BATCH);
    const failedBatches: number[] = [];

    console.log(`[generate-scenes] Processing ${totalBatches} batches of ${SCENES_PER_BATCH} scenes each`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startScene = batchIndex * SCENES_PER_BATCH + 1;
      const endScene = Math.min((batchIndex + 1) * SCENES_PER_BATCH, sceneCount);
      const batchSize = endScene - startScene + 1;

      console.log(`[generate-scenes] Batch ${batchIndex + 1}/${totalBatches}: scenes ${startScene}-${endScene}`);

      const batchPrompt = `CONTEXTO DEL PROYECTO:

PERSONAJES DISPONIBLES:
${characterList}

LOCACIONES DISPONIBLES:
${locationList}

${styleConfig ? `ESTILO VISUAL: ${styleConfig.style?.mood || 'Cinematográfico'}, Iluminación: ${styleConfig.style?.lighting || 'Natural'}` : ''}

SINOPSIS DEL EPISODIO ${episodeNo}:
${synopsis}

GENERA ESCENAS ${startScene} a ${endScene} (de ${sceneCount} total).
${generateFullShots ? 'Incluye scene_setup y shots[] completos para cada escena.' : 'Solo outline básico.'}
Usa SOLO personajes y locaciones del contexto.`;

      let batchResult = await callAIWithTool(
        LOVABLE_API_KEY,
        systemPrompt,
        batchPrompt,
        tool,
        'google/gemini-2.5-flash',
        maxTokensPerBatch
      );

      // Retry with fallback model if failed
      if (!batchResult.ok && batchResult.error !== 'RATE_LIMIT' && batchResult.error !== 'PAYMENT_REQUIRED') {
        console.log(`[generate-scenes] Batch ${batchIndex + 1} failed with ${batchResult.error}, retrying with gpt-5-mini...`);
        
        batchResult = await callAIWithTool(
          LOVABLE_API_KEY,
          systemPrompt,
          batchPrompt,
          tool,
          'openai/gpt-5-mini',
          maxTokensPerBatch
        );
      }

      // Handle rate limit / payment errors globally
      if (batchResult.error === 'RATE_LIMIT') {
        return new Response(JSON.stringify({ 
          error: 'RATE_LIMIT_EXCEEDED',
          message: 'Límite de peticiones excedido. Inténtalo más tarde.',
          partialScenes: allGeneratedScenes.length,
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (batchResult.error === 'PAYMENT_REQUIRED') {
        return new Response(JSON.stringify({ 
          error: 'PAYMENT_REQUIRED',
          message: 'Se requieren créditos adicionales.',
          partialScenes: allGeneratedScenes.length,
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (batchResult.ok && batchResult.scenes) {
        // Renumber scenes to be sequential
        const renumberedScenes = batchResult.scenes.map((scene: any, idx: number) => ({
          ...scene,
          scene_no: startScene + idx
        }));
        allGeneratedScenes.push(...renumberedScenes);
        console.log(`[generate-scenes] Batch ${batchIndex + 1} success: ${renumberedScenes.length} scenes`);
      } else {
        console.error(`[generate-scenes] Batch ${batchIndex + 1} failed after retry:`, batchResult.error);
        
        // Log raw response for debugging
        if (batchResult.rawResponse) {
          console.error(`[generate-scenes] Raw response snippet:`, batchResult.rawResponse.substring(0, 500));
        }
        
        failedBatches.push(batchIndex + 1);
      }
    }

    // Check if we have any scenes at all
    if (allGeneratedScenes.length === 0) {
      return new Response(JSON.stringify({
        error: 'GENERATION_FAILED',
        message: 'No se pudieron generar escenas. Intenta con menos escenas o vuelve a intentar.',
        failedBatches,
        actionable: true,
        suggestedAction: 'retry_with_fewer_scenes',
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[generate-scenes] Total scenes generated: ${allGeneratedScenes.length}/${sceneCount}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // INSERT SCENES AND SHOTS INTO DATABASE
    // ═══════════════════════════════════════════════════════════════════════════

    const insertedScenes = [];
    let totalShotsInserted = 0;

    for (const scene of allGeneratedScenes) {
      // Find character IDs
      const characterIds = (scene.character_names || [])
        .map((name: string) => characterMap.get(name.toLowerCase()))
        .filter(Boolean);

      // Find location ID
      const locationId = locationMap.get((scene.location_name || '').toLowerCase()) || null;

      // Insert scene with setup metadata
      const sceneSlugline = isTeaser 
        ? `TEASER ${teaserType} - ${scene.slugline || 'PROMOTIONAL SEQUENCE'}` 
        : scene.slugline;

      const sceneData = {
        project_id: projectId,
        episode_no: episodeNo,
        scene_no: scene.scene_no || 1,
        slugline: sceneSlugline,
        summary: scene.summary || (isTeaser ? `Teaser promocional ${teaserType}: ${teaserData?.logline || ''}` : ''),
        time_of_day: scene.time_of_day,
        character_ids: characterIds,
        location_id: locationId,
        mood: { primary: typeof scene.mood === 'string' ? scene.mood : (isTeaser ? 'cinematic' : 'dramatic') },
        quality_mode: isTeaser ? 'ULTRA' : 'CINE',
        parsed_json: {
          scene_setup: scene.scene_setup || null,
          generated_with: 'cinematographer_engine_v5_tool_calling',
          narrative_mode: narrativeMode,
          is_teaser: isTeaser || false,
          teaser_type: teaserType || null,
        }
      };

      // First try to get existing scene
      const { data: existingScene } = await supabase
        .from('scenes')
        .select('id')
        .eq('project_id', projectId)
        .eq('episode_no', episodeNo)
        .eq('scene_no', scene.scene_no || 1)
        .maybeSingle();

      let insertedScene;
      let sceneError;

      if (existingScene) {
        // Update existing scene
        const { data, error } = await supabase
          .from('scenes')
          .update(sceneData)
          .eq('id', existingScene.id)
          .select()
          .single();
        insertedScene = data;
        sceneError = error;
        
        // Delete existing shots for regeneration
        if (!sceneError) {
          await supabase.from('shots').delete().eq('scene_id', existingScene.id);
        }
      } else {
        // Insert new scene
        const { data, error } = await supabase
          .from('scenes')
          .insert(sceneData)
          .select()
          .single();
        insertedScene = data;
        sceneError = error;
      }

      if (sceneError) {
        console.error('[generate-scenes] Error upserting scene:', sceneError);
        continue;
      }

      console.log(`[generate-scenes] Inserted scene ${scene.scene_no}: ${sceneSlugline}`);

      // Insert shots with full cinematographic data
      if (scene.shots && insertedScene) {
        for (const shot of scene.shots) {
          const cameraData = shot.camera_variation ? {
            focal_mm: shot.camera_variation.focal_mm,
            aperture: shot.camera_variation.aperture,
            movement: shot.camera_variation.movement,
            height: shot.camera_variation.height,
            stabilization: shot.camera_variation.stabilization,
            camera_body: shot.camera_variation.camera_body,
            lens_model: shot.camera_variation.lens_model
          } : null;

          const blockingData = shot.blocking ? {
            subject_positions: shot.blocking.subject_positions,
            screen_direction: shot.blocking.screen_direction,
            action: shot.blocking.action,
            timing_breakdown: shot.blocking.timing_breakdown
          } : null;

          const lightingData = shot.lighting ? {
            style: shot.lighting.style,
            color_temp: shot.lighting.color_temp,
            key_light_direction: shot.lighting.key_light_direction
          } : null;

          const soundDesignData = shot.sound_design ? {
            room_tone: shot.sound_design.room_tone,
            ambience: shot.sound_design.ambience,
            foley: shot.sound_design.foley
          } : null;

          const editIntentData = shot.edit_intent ? {
            expected_cut: shot.edit_intent.expected_cut,
            hold_ms: shot.edit_intent.hold_ms,
            rhythm_note: shot.edit_intent.rhythm_note,
            viewer_notice: shot.edit_intent.viewer_notice,
            intention: shot.edit_intent.intention
          } : null;

          const keyframeHintsData = shot.keyframe_hints ? {
            start_frame: shot.keyframe_hints.start_frame,
            end_frame: shot.keyframe_hints.end_frame,
            mid_frames: shot.keyframe_hints.mid_frames
          } : null;

          const continuityData = shot.continuity ? {
            wardrobe_notes: shot.continuity.wardrobe_notes,
            props_in_frame: shot.continuity.props_in_frame,
            match_to_previous: shot.continuity.match_to_previous
          } : null;

          const { error: shotError } = await supabase
            .from('shots')
            .insert({
              scene_id: insertedScene.id,
              shot_no: shot.shot_no || parseInt(shot.shot_id?.replace('S', '') || '1'),
              shot_type: shot.shot_type?.toLowerCase() || 'medium',
              dialogue_text: shot.dialogue || null,
              duration_target: shot.duration_sec || 4,
              hero: shot.hero || isTeaser || false,
              effective_mode: (shot.hero || isTeaser) ? 'ULTRA' : 'CINE',
              camera: cameraData,
              blocking: blockingData,
              coverage_type: shot.coverage_type || null,
              story_purpose: shot.story_purpose || null,
              transition_in: shot.transition?.type || (isTeaser ? 'MATCH_CUT' : 'CUT'),
              transition_out: shot.transition?.to_next || (isTeaser ? 'visual_match' : 'hard_cut'),
              edit_intent: editIntentData,
              ai_risk: shot.ai_risks || [],
              continuity_notes: continuityData ? JSON.stringify(continuityData) : (shot.risk_mitigation || null),
              lighting: lightingData,
              sound_plan: soundDesignData,
              keyframe_hints: keyframeHintsData,
            });

          if (shotError) {
            console.error('[generate-scenes] Error inserting shot:', shotError);
          } else {
            totalShotsInserted++;
          }
        }
      }

      insertedScenes.push(insertedScene);
    }

    const contentLabel = isTeaser ? `teaser ${teaserType}` : 'scenes';
    console.log(`[generate-scenes] Successfully generated ${insertedScenes.length} ${contentLabel} with ${totalShotsInserted} shots`);

    return new Response(JSON.stringify({
      success: true,
      scenesGenerated: insertedScenes.length,
      scenesRequested: sceneCount,
      shotsGenerated: totalShotsInserted,
      scenes: insertedScenes,
      narrativeMode,
      isTeaser: isTeaser || false,
      teaserType: teaserType || null,
      failedBatches: failedBatches.length > 0 ? failedBatches : undefined,
      message: isTeaser 
        ? `Teaser ${teaserType} generado con ${totalShotsInserted} planos` 
        : `${insertedScenes.length} escenas con ${totalShotsInserted} planos generados (modo: ${narrativeMode})`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-scenes] Error:', error);
    return new Response(JSON.stringify({ 
      error: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Error desconocido',
      actionable: true,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
