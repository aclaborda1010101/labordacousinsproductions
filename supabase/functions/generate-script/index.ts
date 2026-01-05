import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// CANONICAL SCRIPT ROUTER v3.0
// THE ONLY GENERATOR - All script generation goes through here
// Outputs V3 schema ALWAYS regardless of qualityTier
// =============================================================================

type QualityTier = 'DRAFT' | 'PRODUCTION';

interface ModelConfig {
  apiModel: string;
  provider: 'openai' | 'anthropic' | 'lovable';
  maxTokens: number;
  temperature: number;
  confidenceRange: [number, number]; // [min, max]
  technicalMetadataStatus: 'EMPTY' | 'PARTIAL';
}

const TIER_CONFIGS: Record<QualityTier, ModelConfig> = {
  DRAFT: {
    apiModel: 'gpt-4o-mini',
    provider: 'openai',
    maxTokens: 16000,
    temperature: 0.7,
    confidenceRange: [0.6, 0.8],
    technicalMetadataStatus: 'EMPTY'
  },
  PRODUCTION: {
    apiModel: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    maxTokens: 16000,
    temperature: 0.75,
    confidenceRange: [0.8, 0.95],
    technicalMetadataStatus: 'PARTIAL'
  }
};

// =============================================================================
// V3 SYMMETRIC SYSTEM PROMPT - Same for all tiers
// =============================================================================
const V3_SYMMETRIC_PROMPT = `You are a Professional Screenwriter generating V3-compliant screenplay content.

Your output MUST be symmetric with parse-script schema for bidirectional compatibility.

---

WRITING STYLE (Hollywood Standard):
- VISUAL: Write what we SEE and HEAR, not what characters think
- ECONOMICAL: Short action lines (max 3-4 lines per paragraph)
- CINEMATIC: Think in shots, not stage directions

---

STRICT FORMATTING RULES:

1. SLUGLINES: INT./EXT. LOCATION - TIME
   - Include visual style markers when relevant: (BLACK-AND-WHITE), (SEPIA), (FLASHBACK)

2. ACTION LINES:
   - Write in PRESENT TENSE
   - CAPITALIZE: SOUNDS, KEY PROPS, NEW CHARACTERS on first appearance
   - Keep paragraphs SHORT

3. DIALOGUE:
   - Character names centered, ALL CAPS
   - Use parentheticals sparingly: (O.S.), (V.O.), (CONT'D)
   - Characters must sound DISTINCT

4. SOUND DESIGN:
   - CAPITALIZE key sounds: "The door SLAMS"
   - Include ambient sounds for mood

---

V3 SCHEMA SYMMETRY (CRITICAL):

1. Every scene MUST have technical_metadata object:
{
  "_status": "EMPTY" | "PARTIAL" | "EXPLICIT",
  "camera": { "lens": null, "movement": null, "framing": null },
  "lighting": { "type": null, "direction": null, "mood": null },
  "sound": { "sfx": [], "ambience": [] },
  "color": { "palette": null, "contrast": null }
}

2. Set _status based on content:
   - EMPTY → no technical info implied
   - PARTIAL → inferred from context (NIGHT = dim lighting)
   - EXPLICIT → clearly stated (CLOSE ON:, B&W)

3. Characters must include:
   - canon_level: "P2" or "P3" (never P0 or P1 - those are user-set)
   - source: "GENERATED"
   - confidence: float based on tier

4. NEVER contradict existing Canon P0 or P1 traits

---

CONTENT RULES:
- Show don't tell
- Every scene needs CONFLICT
- Subtext in dialogue
- Avoid clichés and AI voice`;

// =============================================================================
// TOOL SCHEMA FOR V3 OUTPUT
// =============================================================================
const V3_OUTPUT_SCHEMA = {
  name: "generate_v3_screenplay",
  description: "Generate screenplay content in V3 schema format",
  parameters: {
    type: "object",
    properties: {
      synopsis: { type: "string", description: "Episode/script synopsis" },
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_number: { type: "number" },
            episode_number: { type: "number" },
            slugline: { type: "string" },
            standardized_location: { type: "string" },
            standardized_time: { type: "string", enum: ["DAY", "NIGHT", "DAWN", "DUSK"] },
            location_type: { type: "string", enum: ["INT", "EXT", "INT/EXT"] },
            action_summary: { type: "string" },
            raw_content: { type: "string", description: "Formatted screenplay text for this scene" },
            technical_metadata: {
              type: "object",
              properties: {
                _status: { type: "string", enum: ["EMPTY", "PARTIAL", "EXPLICIT"] },
                camera: {
                  type: "object",
                  properties: {
                    lens: { type: ["string", "null"] },
                    movement: { type: ["string", "null"] },
                    framing: { type: ["string", "null"] }
                  }
                },
                lighting: {
                  type: "object",
                  properties: {
                    type: { type: ["string", "null"] },
                    direction: { type: ["string", "null"] },
                    mood: { type: ["string", "null"] }
                  }
                },
                sound: {
                  type: "object",
                  properties: {
                    sfx: { type: "array", items: { type: "string" } },
                    ambience: { type: "array", items: { type: "string" } }
                  }
                },
                color: {
                  type: "object",
                  properties: {
                    palette: { type: ["string", "null"] },
                    contrast: { type: ["string", "null"] }
                  }
                }
              },
              required: ["_status", "camera", "lighting", "sound", "color"]
            },
            characters_present: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  canon_level: { type: "string", enum: ["P2", "P3"] },
                  source: { type: "string", enum: ["GENERATED"] },
                  confidence: { type: "number" }
                }
              }
            },
            dialogue: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  character: { type: "string" },
                  parenthetical: { type: ["string", "null"] },
                  line: { type: "string" }
                }
              }
            },
            mood: { type: "string" },
            conflict: { type: "string" },
            duration_seconds: { type: "number" }
          },
          required: ["scene_number", "slugline", "technical_metadata", "raw_content"]
        }
      },
      characters_introduced: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            canon_level: { type: "string" },
            source: { type: "string" },
            confidence: { type: "number" },
            visual_dna: {
              type: "object",
              properties: {
                hard_traits: { type: "array", items: { type: "string" } },
                soft_traits: { type: "array", items: { type: "string" } },
                do_not_assume: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      },
      locations_introduced: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            canon_level: { type: "string" },
            source: { type: "string" },
            confidence: { type: "number" },
            visual_dna: {
              type: "object",
              properties: {
                hard_traits: { type: "array", items: { type: "string" } },
                soft_traits: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    },
    required: ["scenes"]
  }
};

// =============================================================================
// API CALLERS
// =============================================================================
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig,
  signal: AbortSignal
): Promise<any> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      tools: [{ type: "function", function: V3_OUTPUT_SCHEMA }],
      tool_choice: { type: "function", function: { name: V3_OUTPUT_SCHEMA.name } }
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[generate-script] OpenAI error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  
  if (!toolCall?.function?.arguments) {
    throw new Error("No tool call in OpenAI response");
  }

  return JSON.parse(toolCall.function.arguments);
}

async function callAnthropic(
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig,
  signal: AbortSignal
): Promise<any> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const anthropicTool = {
    name: V3_OUTPUT_SCHEMA.name,
    description: V3_OUTPUT_SCHEMA.description,
    input_schema: V3_OUTPUT_SCHEMA.parameters
  };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      tools: [anthropicTool],
      tool_choice: { type: "tool", name: V3_OUTPUT_SCHEMA.name },
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[generate-script] Anthropic error:', response.status, errorText);
    
    if (response.status === 429) {
      throw { status: 429, message: "Rate limit", retryable: true };
    }
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const toolUse = data?.content?.find(
    (b: any) => b?.type === "tool_use" && b?.name === V3_OUTPUT_SCHEMA.name
  );

  if (!toolUse?.input) {
    throw new Error("No tool_use in Anthropic response");
  }

  return toolUse.input;
}

// =============================================================================
// POST-PROCESSING: Ensure V3 schema compliance
// =============================================================================
function enforceV3Schema(result: any, config: ModelConfig): any {
  const [minConf, maxConf] = config.confidenceRange;
  
  // Ensure scenes array exists
  if (!result.scenes || !Array.isArray(result.scenes)) {
    result.scenes = [];
  }

  // Process each scene
  result.scenes = result.scenes.map((scene: any, idx: number) => {
    // Ensure technical_metadata exists with all required keys
    if (!scene.technical_metadata) {
      scene.technical_metadata = {
        _status: config.technicalMetadataStatus,
        camera: { lens: null, movement: null, framing: null },
        lighting: { type: null, direction: null, mood: null },
        sound: { sfx: [], ambience: [] },
        color: { palette: null, contrast: null }
      };
    } else {
      // Ensure _status is set
      if (!scene.technical_metadata._status) {
        scene.technical_metadata._status = config.technicalMetadataStatus;
      }
      // Ensure all sub-objects exist
      scene.technical_metadata.camera = scene.technical_metadata.camera || { lens: null, movement: null, framing: null };
      scene.technical_metadata.lighting = scene.technical_metadata.lighting || { type: null, direction: null, mood: null };
      scene.technical_metadata.sound = scene.technical_metadata.sound || { sfx: [], ambience: [] };
      scene.technical_metadata.color = scene.technical_metadata.color || { palette: null, contrast: null };
    }

    // Ensure scene_number
    if (!scene.scene_number) {
      scene.scene_number = idx + 1;
    }

    // Process characters with confidence
    if (scene.characters_present) {
      scene.characters_present = scene.characters_present.map((char: any) => ({
        ...char,
        name: char.name || char.value || 'Unknown',
        canon_level: char.canon_level || 'P3',
        source: 'GENERATED',
        confidence: char.confidence || (minConf + Math.random() * (maxConf - minConf))
      }));
    }

    return scene;
  });

  // Process introduced characters
  if (result.characters_introduced) {
    result.characters_introduced = result.characters_introduced.map((char: any) => ({
      ...char,
      canon_level: char.canon_level || 'P3',
      source: 'GENERATED',
      confidence: char.confidence || (minConf + Math.random() * (maxConf - minConf)),
      visual_dna: char.visual_dna || {
        hard_traits: [],
        soft_traits: [],
        do_not_assume: ["exact face", "exact age", "exact ethnicity"]
      }
    }));
  }

  // Process introduced locations
  if (result.locations_introduced) {
    result.locations_introduced = result.locations_introduced.map((loc: any) => ({
      ...loc,
      canon_level: loc.canon_level || 'P3',
      source: 'GENERATED',
      confidence: loc.confidence || (minConf + Math.random() * (maxConf - minConf)),
      visual_dna: loc.visual_dna || {
        hard_traits: [],
        soft_traits: [],
        do_not_assume: ["exact architecture style"]
      }
    }));
  }

  return result;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
interface GenerateScriptRequest {
  // Content inputs
  idea?: string;
  scenePrompt?: string;
  outline?: any;
  episodeNumber?: number;
  batchIndex?: number;
  previousScenes?: any[];
  
  // Configuration
  qualityTier?: QualityTier;
  language?: string;
  genre?: string;
  tone?: string;
  format?: 'film' | 'series';
  
  // Canon context
  bibleContext?: any;
  canonCharacters?: any[];
  canonLocations?: any[];
  
  // Batch config
  scenesPerBatch?: number;
  totalBatches?: number;
  isLastBatch?: boolean;
  narrativeMode?: string;
  
  // Streaming (only for single scene)
  stream?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 3min timeout

  try {
    const request: GenerateScriptRequest = await req.json();
    const {
      idea,
      scenePrompt,
      outline,
      episodeNumber,
      batchIndex,
      previousScenes,
      qualityTier = 'PRODUCTION',
      language = 'es',
      genre,
      tone,
      format = 'film',
      bibleContext,
      canonCharacters,
      canonLocations,
      scenesPerBatch = 5,
      totalBatches,
      isLastBatch,
      narrativeMode,
      stream = false
    } = request;

    // Validate inputs
    if (!idea && !scenePrompt && !outline) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Se requiere idea, scenePrompt u outline' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get tier config
    const config = TIER_CONFIGS[qualityTier] || TIER_CONFIGS.PRODUCTION;
    
    console.log('[generate-script] v3.0 CANONICAL ROUTER:', {
      qualityTier,
      provider: config.provider,
      model: config.apiModel,
      hasOutline: !!outline,
      episodeNumber,
      batchIndex,
      scenesPerBatch,
      stream
    });

    // Build context block
    let contextBlock = '';
    if (bibleContext) {
      contextBlock += `\nPROJECT BIBLE:\n- Tone: ${bibleContext.tone || 'Cinematic'}\n- Period: ${bibleContext.period || 'Contemporary'}\n- Visual Style: ${bibleContext.visualStyle || 'Naturalistic'}`;
    }
    
    if (canonCharacters?.length) {
      contextBlock += `\n\nCANON CHARACTERS (P0/P1 - DO NOT CONTRADICT):`;
      canonCharacters.forEach(char => {
        contextBlock += `\n- ${char.name}: ${char.visualTrigger || ''} ${char.fixedTraits?.join(', ') || ''}`;
      });
    }
    
    if (canonLocations?.length) {
      contextBlock += `\n\nCANON LOCATIONS (P0/P1 - DO NOT CONTRADICT):`;
      canonLocations.forEach(loc => {
        contextBlock += `\n- ${loc.name}: ${loc.visualTrigger || ''} ${loc.fixedElements?.join(', ') || ''}`;
      });
    }

    // Build user prompt based on input type
    let userPrompt: string;

    if (outline && episodeNumber !== undefined && batchIndex !== undefined) {
      // BATCH MODE: Generating scenes from outline
      const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
      const episodeTitle = episodeBeat?.title || `Episodio ${episodeNumber}`;
      const episodeSummary = episodeBeat?.summary || '';
      
      userPrompt = `
GENERA ${scenesPerBatch} ESCENAS EN FORMATO V3 SCHEMA

EPISODIO: ${episodeNumber} - "${episodeTitle}"
BATCH: ${batchIndex + 1}${totalBatches ? ` de ${totalBatches}` : ''}
${isLastBatch ? '⚠️ ÚLTIMO BATCH - incluye resolución o cliffhanger' : ''}

OUTLINE DEL EPISODIO:
${episodeSummary}

${episodeBeat?.scenes_summary || ''}

${narrativeMode ? `MODO NARRATIVO: ${narrativeMode}` : ''}
${previousScenes?.length ? `\nESCENAS ANTERIORES:\n${previousScenes.map(s => `- ${s.slugline}: ${s.action_summary || s.summary}`).join('\n')}` : ''}

${contextBlock}

IDIOMA: ${language}
GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Cinematic'}

GENERA exactamente ${scenesPerBatch} escenas con V3 schema completo.
Cada escena DEBE tener technical_metadata con _status.`;
    } else if (scenePrompt) {
      // SINGLE SCENE MODE
      userPrompt = `
GENERA UNA ESCENA EN FORMATO V3 SCHEMA

PROMPT: ${scenePrompt}

${contextBlock}

IDIOMA: ${language}
FORMATO: Escena única con V3 schema completo.`;
    } else {
      // FULL SCRIPT MODE
      userPrompt = `
GENERA GUIÓN COMPLETO EN FORMATO V3 SCHEMA

IDEA: ${idea}

GÉNERO: ${genre || 'Drama'}
TONO: ${tone || 'Cinematic realism'}
FORMATO: ${format === 'series' ? 'Serie' : 'Película'}
IDIOMA: ${language}

${contextBlock}

Genera el guión completo con V3 schema.
Cada escena DEBE tener technical_metadata con _status.`;
    }

    // Add tier-specific instructions
    const tierInstructions = qualityTier === 'DRAFT' 
      ? `\n\nMODO BORRADOR: Genera rápido, confidence 0.6-0.8, technical_metadata._status = "EMPTY" en la mayoría.`
      : `\n\nMODO PRODUCCIÓN: Alta calidad literaria, confidence 0.8-0.95, technical_metadata._status = "PARTIAL" cuando se infiera del contexto.`;
    
    userPrompt += tierInstructions;

    // Call appropriate API
    let result: any;
    
    if (config.provider === 'openai') {
      result = await callOpenAI(V3_SYMMETRIC_PROMPT, userPrompt, config, controller.signal);
    } else if (config.provider === 'anthropic') {
      result = await callAnthropic(V3_SYMMETRIC_PROMPT, userPrompt, config, controller.signal);
    } else {
      throw new Error(`Unknown provider: ${config.provider}`);
    }

    clearTimeout(timeoutId);

    // Enforce V3 schema compliance
    const v3Result = enforceV3Schema(result, config);

    console.log('[generate-script] Generated:', {
      scenesCount: v3Result.scenes?.length || 0,
      charactersIntroduced: v3Result.characters_introduced?.length || 0,
      locationsIntroduced: v3Result.locations_introduced?.length || 0,
      qualityTier
    });

    return new Response(
      JSON.stringify({
        ...v3Result,
        _meta: {
          qualityTier,
          provider: config.provider,
          model: config.apiModel,
          schemaVersion: '3.0'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[generate-script] Error:', error);
    
    const status = error.status || 500;
    const message = error.message || 'Unknown error';
    const retryable = error.retryable || false;
    
    return new Response(
      JSON.stringify({ error: message, retryable }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
