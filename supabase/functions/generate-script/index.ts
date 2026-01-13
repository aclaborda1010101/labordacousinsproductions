import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse, AuthContext } from "../_shared/auth.ts";
import { parseJsonSafe, parseToolCallArgs, parseAnthropicToolUse, ParseResult } from "../_shared/llmJson.ts";
import { extractEpisodeContract, formatContractForPrompt, type EpisodeContract } from "../_shared/episode-contracts.ts";
import { validateScriptAgainstContract, getQCSummary, type ScriptQCResult } from "../_shared/script-qc.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// CANONICAL SCRIPT ROUTER v3.1 - WITH FULL BIBLE INJECTION
// THE ONLY GENERATOR - All script generation goes through here
// Outputs V3 schema ALWAYS regardless of qualityTier
// =============================================================================

type QualityTier = 'rapido' | 'profesional' | 'hollywood';

interface ModelConfig {
  apiModel: string;
  provider: 'lovable';
  maxTokens: number;
  temperature: number;
  confidenceRange: [number, number];
  technicalMetadataStatus: 'EMPTY' | 'PARTIAL';
}

const TIER_CONFIGS: Record<QualityTier, ModelConfig> = {
  rapido: {
    apiModel: 'openai/gpt-5-mini',
    provider: 'lovable',
    maxTokens: 16000,
    temperature: 0.7,
    confidenceRange: [0.6, 0.8],
    technicalMetadataStatus: 'EMPTY'
  },
  profesional: {
    apiModel: 'openai/gpt-5',
    provider: 'lovable',
    maxTokens: 16000,
    temperature: 0.72,
    confidenceRange: [0.75, 0.9],
    technicalMetadataStatus: 'PARTIAL'
  },
  hollywood: {
    apiModel: 'openai/gpt-5.2',
    provider: 'lovable',
    maxTokens: 16000,
    temperature: 0.75,
    confidenceRange: [0.8, 0.95],
    technicalMetadataStatus: 'PARTIAL'
  }
};

// =============================================================================
// V3 SYMMETRIC SYSTEM PROMPT - WITH ANTI-INVENTION RULES
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

⚠️ CRITICAL ENTITY RULES (NON-NEGOTIABLE):

1. NEVER INVENT NEW CHARACTERS - Use ONLY:
   - Characters from STORY_BIBLE (P0/P1/P2)
   - Characters explicitly named in beats/outline
   - Generic roles like "POLICÍA", "CAMARERO" for one-line appearances

2. NEVER INVENT NEW LOCATIONS - Use ONLY:
   - Locations from STORY_BIBLE
   - Locations explicitly named in beats/outline
   - Reasonable sub-areas of existing locations

3. If you NEED a new character/location not in Bible:
   - DO NOT use it in the script
   - Add it to "new_entities_requested" array with reason
   - Use a placeholder or generic role instead

4. If information is missing or unclear:
   - Add the gap to "uncertainties" array
   - Make a reasonable choice and note it

---

CONTENT RULES:
- Show don't tell
- Every scene needs CONFLICT
- Subtext in dialogue
- Avoid clichés and AI voice`;

// =============================================================================
// TOOL SCHEMA FOR V3 OUTPUT - Extended with uncertainties and new_entities_requested
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
                  canon_level: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
                  source: { type: "string", enum: ["BIBLE", "OUTLINE", "GENERATED"] },
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
      },
      uncertainties: {
        type: "array",
        description: "List of gaps or unclear information found during generation",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["character_info", "location_info", "timeline", "motivation", "continuity"] },
            description: { type: "string" },
            assumed_value: { type: "string" }
          }
        }
      },
      new_entities_requested: {
        type: "array",
        description: "Entities that would be useful but were NOT in Bible - do not use in script",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["character", "location", "prop"] },
            name: { type: "string" },
            reason: { type: "string" },
            suggested_role: { type: "string" }
          }
        }
      }
    },
    required: ["scenes"]
  }
};

// =============================================================================
// BIBLE FETCHER - Parallel fetch of project context
// =============================================================================
interface BibleContext {
  project: any | null;
  characters: any[];
  locations: any[];
  fetchErrors: string[];
}

async function fetchProjectBible(projectId: string): Promise<BibleContext> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  const fetchErrors: string[] = [];
  
  // Parallel fetch with allSettled for robustness
  const [projectResult, charactersResult, locationsResult] = await Promise.allSettled([
    supabase
      .from('projects')
      .select('id, title, logline, genre, tone, narrative_framework, global_visual_dna, style_pack')
      .eq('id', projectId)
      .single(),
    supabase
      .from('characters')
      .select('id, name, role, character_role, canon_level, visual_dna, bio, arc, profile_json')
      .eq('project_id', projectId),
    supabase
      .from('locations')
      .select('id, name, canon_level, visual_dna, description, narrative_role, profile_json')
      .eq('project_id', projectId)
  ]);
  
  let project = null;
  let characters: any[] = [];
  let locations: any[] = [];
  
  if (projectResult.status === 'fulfilled' && projectResult.value.data) {
    project = projectResult.value.data;
  } else {
    fetchErrors.push('project_fetch_failed');
    console.warn('[Bible] Project fetch failed:', projectResult);
  }
  
  if (charactersResult.status === 'fulfilled' && charactersResult.value.data) {
    characters = charactersResult.value.data;
  } else {
    fetchErrors.push('characters_fetch_failed');
    console.warn('[Bible] Characters fetch failed:', charactersResult);
  }
  
  if (locationsResult.status === 'fulfilled' && locationsResult.value.data) {
    locations = locationsResult.value.data;
  } else {
    fetchErrors.push('locations_fetch_failed');
    console.warn('[Bible] Locations fetch failed:', locationsResult);
  }
  
  console.log('[Bible] Fetched:', {
    hasProject: !!project,
    charactersCount: characters.length,
    locationsCount: locations.length,
    errors: fetchErrors
  });
  
  return { project, characters, locations, fetchErrors };
}

// =============================================================================
// BIBLE FILTER - Filter to relevant entities based on beats
// =============================================================================
function filterBibleToRelevant(
  bible: BibleContext,
  outline: any,
  episodeNumber?: number
): { characters: any[], locations: any[] } {
  // Extract names from outline/beats
  const beatCharacterNames = new Set<string>();
  const beatLocationNames = new Set<string>();
  
  // From main_characters in outline
  if (outline?.main_characters) {
    outline.main_characters.forEach((c: any) => {
      if (c.name) beatCharacterNames.add(c.name.toLowerCase());
    });
  }
  
  // From episode_beats
  if (outline?.episode_beats) {
    const relevantBeats = episodeNumber 
      ? [outline.episode_beats[episodeNumber - 1]].filter(Boolean)
      : outline.episode_beats;
    
    relevantBeats.forEach((beat: any) => {
      // Characters from beat
      if (beat?.characters_present) {
        beat.characters_present.forEach((c: any) => {
          const name = typeof c === 'string' ? c : c.name;
          if (name) beatCharacterNames.add(name.toLowerCase());
        });
      }
      if (beat?.key_characters) {
        beat.key_characters.forEach((c: any) => {
          const name = typeof c === 'string' ? c : c.name;
          if (name) beatCharacterNames.add(name.toLowerCase());
        });
      }
      // Locations from beat
      if (beat?.location) {
        beatLocationNames.add(beat.location.toLowerCase());
      }
      if (beat?.locations) {
        beat.locations.forEach((l: any) => {
          const name = typeof l === 'string' ? l : l.name;
          if (name) beatLocationNames.add(name.toLowerCase());
        });
      }
    });
  }
  
  // From main_locations in outline
  if (outline?.main_locations) {
    outline.main_locations.forEach((l: any) => {
      if (l.name) beatLocationNames.add(l.name.toLowerCase());
    });
  }
  
  // Filter characters: include P0/P1 always + any mentioned in beats
  const filteredCharacters = bible.characters.filter(char => {
    const canonLevel = char.canon_level?.toUpperCase() || 'P3';
    const isHighPriority = canonLevel === 'P0' || canonLevel === 'P1';
    const isInBeats = beatCharacterNames.has(char.name?.toLowerCase());
    return isHighPriority || isInBeats;
  });
  
  // Filter locations: include P0/P1 always + any mentioned in beats
  const filteredLocations = bible.locations.filter(loc => {
    const canonLevel = loc.canon_level?.toUpperCase() || 'P3';
    const isHighPriority = canonLevel === 'P0' || canonLevel === 'P1';
    const isInBeats = beatLocationNames.has(loc.name?.toLowerCase());
    return isHighPriority || isInBeats;
  });
  
  console.log('[Bible] Filtered:', {
    totalCharacters: bible.characters.length,
    relevantCharacters: filteredCharacters.length,
    totalLocations: bible.locations.length,
    relevantLocations: filteredLocations.length,
    beatCharacterNames: Array.from(beatCharacterNames).slice(0, 10),
    beatLocationNames: Array.from(beatLocationNames).slice(0, 10)
  });
  
  return { characters: filteredCharacters, locations: filteredLocations };
}

// =============================================================================
// VISUAL DNA TRANSFORMER - Convert to readable constraints
// =============================================================================
function formatVisualDNA(visualDna: any): string {
  if (!visualDna) return '';
  
  const constraints: string[] = [];
  
  // Hard traits (non-negotiable)
  if (visualDna.hard_traits?.length) {
    constraints.push(`FIJOS: ${visualDna.hard_traits.join(', ')}`);
  }
  
  // Physical identity
  if (visualDna.physical_identity) {
    const pi = visualDna.physical_identity;
    const parts: string[] = [];
    if (pi.apparent_age) parts.push(`${pi.apparent_age} años aprox`);
    if (pi.biological_sex) parts.push(pi.biological_sex);
    if (pi.skin_tone) parts.push(`piel ${pi.skin_tone}`);
    if (pi.body_type) parts.push(`complexión ${pi.body_type}`);
    if (pi.height_category) parts.push(`estatura ${pi.height_category}`);
    if (parts.length) constraints.push(`FÍSICO: ${parts.join(', ')}`);
  }
  
  // Face geometry
  if (visualDna.face_geometry) {
    const fg = visualDna.face_geometry;
    const parts: string[] = [];
    if (fg.face_shape) parts.push(`rostro ${fg.face_shape}`);
    if (fg.eye_color) parts.push(`ojos ${fg.eye_color}`);
    if (fg.eye_shape) parts.push(`forma ${fg.eye_shape}`);
    if (fg.nose_type) parts.push(`nariz ${fg.nose_type}`);
    if (fg.distinctive_features?.length) parts.push(`rasgos: ${fg.distinctive_features.join(', ')}`);
    if (parts.length) constraints.push(`ROSTRO: ${parts.join(', ')}`);
  }
  
  // Hair
  if (visualDna.hair) {
    const h = visualDna.hair;
    const parts: string[] = [];
    if (h.color) parts.push(h.color);
    if (h.texture) parts.push(h.texture);
    if (h.length) parts.push(h.length);
    if (h.style) parts.push(h.style);
    if (parts.length) constraints.push(`CABELLO: ${parts.join(', ')}`);
  }
  
  // Soft traits (suggestions)
  if (visualDna.soft_traits?.length) {
    constraints.push(`SUGERIDOS: ${visualDna.soft_traits.slice(0, 5).join(', ')}`);
  }
  
  return constraints.join(' | ');
}

// =============================================================================
// BUILD STORY BIBLE BLOCK
// =============================================================================
function buildStoryBibleBlock(
  project: any | null,
  characters: any[],
  locations: any[],
  outline: any
): string {
  let bible = `\n══════════════════════════════════════════════════════════════
📖 STORY BIBLE (SOURCE OF TRUTH - DO NOT CONTRADICT)
══════════════════════════════════════════════════════════════\n`;
  
  // Project info
  if (project) {
    bible += `\n▸ PROYECTO: ${project.title || 'Sin título'}`;
    if (project.logline) bible += `\n▸ LOGLINE: ${project.logline}`;
    if (project.genre) bible += `\n▸ GÉNERO: ${project.genre}`;
    if (project.tone) bible += `\n▸ TONO: ${project.tone}`;
    if (project.narrative_framework) {
      const nf = project.narrative_framework;
      if (nf.setting?.period) bible += `\n▸ ÉPOCA: ${nf.setting.period}`;
      if (nf.setting?.location) bible += `\n▸ AMBIENTACIÓN: ${nf.setting.location}`;
    }
  }
  
  // Characters from Bible
  if (characters.length > 0) {
    bible += `\n\n═══ PERSONAJES CANON (${characters.length}) ═══`;
    characters.forEach(char => {
      const level = char.canon_level?.toUpperCase() || 'P3';
      const role = char.character_role || char.role || 'supporting';
      bible += `\n\n【${level}】 ${char.name} (${role})`;
      
      // Bio/Arc
      if (char.bio) bible += `\n   Bio: ${char.bio.slice(0, 200)}${char.bio.length > 200 ? '...' : ''}`;
      if (char.arc) bible += `\n   Arco: ${char.arc.slice(0, 150)}${char.arc.length > 150 ? '...' : ''}`;
      
      // Visual DNA formatted
      const dnaStr = formatVisualDNA(char.visual_dna);
      if (dnaStr) bible += `\n   Visual: ${dnaStr}`;
      
      // Profile extras
      if (char.profile_json?.personality) {
        bible += `\n   Personalidad: ${char.profile_json.personality.slice(0, 100)}`;
      }
    });
  }
  
  // Locations from Bible
  if (locations.length > 0) {
    bible += `\n\n═══ LOCACIONES CANON (${locations.length}) ═══`;
    locations.forEach(loc => {
      const level = loc.canon_level?.toUpperCase() || 'P3';
      bible += `\n\n【${level}】 ${loc.name}`;
      
      if (loc.description) bible += `\n   Desc: ${loc.description.slice(0, 200)}`;
      if (loc.narrative_role) bible += `\n   Rol narrativo: ${loc.narrative_role}`;
      
      const dnaStr = formatVisualDNA(loc.visual_dna);
      if (dnaStr) bible += `\n   Visual: ${dnaStr}`;
    });
  }
  
  // Add outline entities not in Bible (from parsed script)
  const bibleCharNames = new Set(characters.map(c => c.name?.toLowerCase()));
  const bibleLocNames = new Set(locations.map(l => l.name?.toLowerCase()));
  
  const outlineOnlyChars = outline?.main_characters?.filter(
    (c: any) => c.name && !bibleCharNames.has(c.name.toLowerCase())
  ) || [];
  
  const outlineOnlyLocs = outline?.main_locations?.filter(
    (l: any) => l.name && !bibleLocNames.has(l.name.toLowerCase())
  ) || [];
  
  if (outlineOnlyChars.length > 0) {
    bible += `\n\n═══ PERSONAJES DEL OUTLINE (no en Bible aún) ═══`;
    outlineOnlyChars.forEach((char: any) => {
      bible += `\n• ${char.name} (${char.role || 'TBD'}): ${char.description || 'Sin descripción'}`;
    });
  }
  
  if (outlineOnlyLocs.length > 0) {
    bible += `\n\n═══ LOCACIONES DEL OUTLINE (no en Bible aún) ═══`;
    outlineOnlyLocs.forEach((loc: any) => {
      bible += `\n• ${loc.name} (${loc.type || 'INT/EXT'}): ${loc.description || 'Sin descripción'}`;
    });
  }
  
  bible += `\n\n══════════════════════════════════════════════════════════════
⚠️ REGLA: Usa SOLO los personajes y locaciones listados arriba.
   Si necesitas uno nuevo, añádelo a "new_entities_requested".
══════════════════════════════════════════════════════════════\n`;
  
  return bible;
}

// =============================================================================
// FALLBACK RESULT BUILDER
// =============================================================================
function buildFallbackScriptResult(episodeNumber?: number, scenesPerBatch: number = 5): any {
  return {
    synopsis: 'Generación fallida - usar resultado degradado',
    scenes: Array.from({ length: scenesPerBatch }, (_, i) => ({
      scene_number: i + 1,
      episode_number: episodeNumber || 1,
      slugline: 'INT. UBICACIÓN - DÍA',
      standardized_location: 'UBICACIÓN',
      standardized_time: 'DAY',
      location_type: 'INT',
      action_summary: 'Por generar',
      raw_content: '',
      technical_metadata: {
        _status: 'EMPTY',
        camera: { lens: null, movement: null, framing: null },
        lighting: { type: null, direction: null, mood: null },
        sound: { sfx: [], ambience: [] },
        color: { palette: null, contrast: null }
      },
      characters_present: [],
      dialogue: [],
      mood: 'neutral',
      conflict: 'Por definir',
      duration_seconds: 60
    })),
    characters_introduced: [],
    locations_introduced: [],
    uncertainties: [{ type: 'generation', description: 'Generación fallida', assumed_value: 'fallback' }],
    new_entities_requested: []
  };
}

// =============================================================================
// LOVABLE AI GATEWAY CALLER WITH HARDENED PARSING
// =============================================================================
async function callLovableAI(
  systemPrompt: string,
  userPrompt: string,
  config: ModelConfig,
  signal: AbortSignal,
  episodeNumber?: number,
  scenesPerBatch: number = 5
): Promise<{ result: any; parseWarnings: string[] }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.apiModel,
      max_completion_tokens: config.maxTokens,
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

  // Handle rate limits and payment required
  if (response.status === 429) {
    throw { status: 429, message: "Rate limit exceeded", retryable: true };
  }
  if (response.status === 402) {
    throw { status: 402, message: "Payment required - add credits to Lovable AI" };
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[generate-script] Lovable AI error:', response.status, errorText);
    throw new Error(`Lovable AI Gateway error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  
  // Use hardened parsing
  const parseResult = parseToolCallArgs(toolCall, V3_OUTPUT_SCHEMA.name, 'lovable.generate_script');
  
  if (parseResult.ok && parseResult.json) {
    return { result: parseResult.json, parseWarnings: parseResult.warnings };
  }
  
  // Try fallback from content
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    const contentResult = parseJsonSafe(content, 'lovable.content_fallback');
    if (contentResult.ok && contentResult.json) {
      return { 
        result: contentResult.json, 
        parseWarnings: [...parseResult.warnings, ...contentResult.warnings] 
      };
    }
  }
  
  // Return degraded fallback
  console.warn('[generate-script] Lovable AI parse failed, using fallback');
  return { 
    result: buildFallbackScriptResult(episodeNumber, scenesPerBatch), 
    parseWarnings: [...parseResult.warnings, 'LOVABLE_PARSE_FAILED'] 
  };
}

// =============================================================================
// LOG BIBLE INJECTION EVENT
// =============================================================================
async function logBibleInjection(
  projectId: string,
  charactersCount: number,
  locationsCount: number,
  p0p1Count: number,
  fetchErrors: string[]
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    
    await supabase.from('editorial_events').insert({
      project_id: projectId,
      event_type: 'bible_injected',
      asset_type: 'script',
      payload: {
        characters_included: charactersCount,
        locations_included: locationsCount,
        p0p1_entities: p0p1Count,
        fetch_warnings: fetchErrors,
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    console.warn('[generate-script] Failed to log bible injection event:', e);
  }
}

// =============================================================================
// POST-PROCESSING: Ensure V3 schema compliance
// =============================================================================
function enforceV3Schema(result: any, config: ModelConfig, bibleCharNames: Set<string>): any {
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
      if (!scene.technical_metadata._status) {
        scene.technical_metadata._status = config.technicalMetadataStatus;
      }
      scene.technical_metadata.camera = scene.technical_metadata.camera || { lens: null, movement: null, framing: null };
      scene.technical_metadata.lighting = scene.technical_metadata.lighting || { type: null, direction: null, mood: null };
      scene.technical_metadata.sound = scene.technical_metadata.sound || { sfx: [], ambience: [] };
      scene.technical_metadata.color = scene.technical_metadata.color || { palette: null, contrast: null };
    }

    // Ensure scene_number
    if (!scene.scene_number) {
      scene.scene_number = idx + 1;
    }

    // Process characters - mark source based on Bible
    if (scene.characters_present) {
      scene.characters_present = scene.characters_present.map((char: any) => {
        const charName = (char.name || char.value || 'Unknown').toLowerCase();
        const isFromBible = bibleCharNames.has(charName);
        return {
          ...char,
          name: char.name || char.value || 'Unknown',
          canon_level: isFromBible ? (char.canon_level || 'P2') : 'P3',
          source: isFromBible ? 'BIBLE' : 'GENERATED',
          confidence: char.confidence || (minConf + Math.random() * (maxConf - minConf))
        };
      });
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

  // Ensure new output arrays exist
  if (!result.uncertainties) result.uncertainties = [];
  if (!result.new_entities_requested) result.new_entities_requested = [];

  return result;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
interface GenerateScriptRequest {
  projectId?: string;
  idea?: string;
  scenePrompt?: string;
  outline?: any;
  episodeNumber?: number;
  batchIndex?: number;
  previousScenes?: any[];
  qualityTier?: QualityTier;
  language?: string;
  genre?: string;
  tone?: string;
  format?: 'film' | 'series';
  bibleContext?: any;
  canonCharacters?: any[];
  canonLocations?: any[];
  scenesPerBatch?: number;
  totalBatches?: number;
  isLastBatch?: boolean;
  narrativeMode?: string;
  stream?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let auth: AuthContext;
  try {
    auth = await requireAuthOrDemo(req);
  } catch (error) {
    return authErrorResponse(error as Error, corsHeaders);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000);

  // Track if we acquired a lock (for cleanup in finally)
  let lockAcquired = false;
  let projectIdForLock: string | null = null;

  try {
    const request: GenerateScriptRequest = await req.json();
    
    if (request.projectId) {
      try {
        await requireProjectAccess(auth.supabase, auth.userId, request.projectId);
      } catch (error) {
        clearTimeout(timeoutId);
        return authErrorResponse(error as Error, corsHeaders);
      }

      // =======================================================================
      // V3.0 PROJECT LOCKING - Prevent concurrent generation on same project
      // =======================================================================
      projectIdForLock = request.projectId;
      
      const { data: lockResult, error: lockError } = await auth.supabase.rpc('acquire_project_lock', {
        p_project_id: request.projectId,
        p_reason: 'script_generation',
        p_duration_seconds: 600 // 10 minutes max
      });

      if (lockError) {
        console.error('[generate-script] Lock acquisition error:', lockError);
        // Continue anyway - don't block on lock errors
      } else if (!lockResult) {
        // Lock NOT acquired - project is busy
        console.log('[generate-script] Project busy, lock not acquired:', request.projectId);
        
        // Get retry info from existing lock
        const { data: existingLock } = await auth.supabase
          .from('project_locks')
          .select('expires_at, lock_reason')
          .eq('project_id', request.projectId)
          .single();

        const retryAfterSec = existingLock?.expires_at
          ? Math.max(10, Math.floor((new Date(existingLock.expires_at).getTime() - Date.now()) / 1000))
          : 60;

        clearTimeout(timeoutId);
        return new Response(
          JSON.stringify({
            code: 'PROJECT_BUSY',
            message: 'Este proyecto ya está generando un guión.',
            retry_after_seconds: retryAfterSec,
            lock_reason: existingLock?.lock_reason || 'script_generation'
          }),
          { 
            status: 409, 
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json',
              'Retry-After': String(retryAfterSec)
            } 
          }
        );
      } else {
        // Lock acquired successfully
        lockAcquired = true;
        console.log('[generate-script] Lock acquired for project:', request.projectId);
      }
    }
    
    const {
      projectId,
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

    if (!idea && !scenePrompt && !outline) {
      clearTimeout(timeoutId);
      return new Response(
        JSON.stringify({ error: 'Se requiere idea, scenePrompt u outline' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // V11.1: Hard fail if projectId is missing - prevents silent Bible injection failures
    if (!projectId) {
      clearTimeout(timeoutId);
      console.error('[generate-script] CRITICAL: projectId is undefined - Bible cannot be injected');
      return new Response(
        JSON.stringify({ 
          error: 'PROJECT_ID_MISSING', 
          message: 'projectId es requerido para inyección de Bible. Los scripts sin Bible tienen calidad degradada.'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = TIER_CONFIGS[qualityTier as QualityTier] || TIER_CONFIGS.profesional;
    
    console.log('[generate-script] v3.1 CANONICAL ROUTER + BIBLE:', {
      qualityTier,
      provider: config.provider,
      model: config.apiModel,
      hasOutline: !!outline,
      episodeNumber,
      batchIndex,
      scenesPerBatch,
      projectId
    });

    // =========================================================================
    // FETCH PROJECT BIBLE (if projectId provided)
    // =========================================================================
    let bible: BibleContext = { project: null, characters: [], locations: [], fetchErrors: [] };
    let filteredBible = { characters: [] as any[], locations: [] as any[] };
    let storyBibleBlock = '';
    
    if (projectId) {
      bible = await fetchProjectBible(projectId);
      
      // Filter to relevant entities
      filteredBible = filterBibleToRelevant(bible, outline, episodeNumber);
      
      // Build the Story Bible block
      storyBibleBlock = buildStoryBibleBlock(
        bible.project,
        filteredBible.characters,
        filteredBible.locations,
        outline
      );
      
      // Count P0/P1 for logging
      const p0p1Count = [...filteredBible.characters, ...filteredBible.locations].filter(
        e => e.canon_level?.toUpperCase() === 'P0' || e.canon_level?.toUpperCase() === 'P1'
      ).length;
      
      // Log injection event (fire and forget)
      logBibleInjection(
        projectId,
        filteredBible.characters.length,
        filteredBible.locations.length,
        p0p1Count,
        bible.fetchErrors
      );
    }
    
    // Create set of Bible character names for post-processing
    const bibleCharNames = new Set(
      filteredBible.characters.map(c => c.name?.toLowerCase()).filter(Boolean)
    );

    // =========================================================================
    // Build legacy context block (for backwards compatibility with passed context)
    // =========================================================================
    let legacyContextBlock = '';
    if (bibleContext && !projectId) {
      legacyContextBlock += `\nPROJECT BIBLE:\n- Tone: ${bibleContext.tone || 'Cinematic'}\n- Period: ${bibleContext.period || 'Contemporary'}\n- Visual Style: ${bibleContext.visualStyle || 'Naturalistic'}`;
    }
    
    if (canonCharacters?.length && !projectId) {
      legacyContextBlock += `\n\nCANON CHARACTERS (P0/P1 - DO NOT CONTRADICT):`;
      canonCharacters.forEach(char => {
        legacyContextBlock += `\n- ${char.name}: ${char.visualTrigger || ''} ${char.fixedTraits?.join(', ') || ''}`;
      });
    }
    
    if (canonLocations?.length && !projectId) {
      legacyContextBlock += `\n\nCANON LOCATIONS (P0/P1 - DO NOT CONTRADICT):`;
      canonLocations.forEach(loc => {
        legacyContextBlock += `\n- ${loc.name}: ${loc.visualTrigger || ''} ${loc.fixedElements?.join(', ') || ''}`;
      });
    }

    // Use Bible block if available, else legacy
    const contextBlock = storyBibleBlock || legacyContextBlock;

    // =========================================================================
    // Build user prompt based on input type
    // =========================================================================
    let userPrompt: string;

    // =======================================================================
    // V11 CONTRACT EXTRACTION - Extract structural contracts from outline
    // =======================================================================
    let episodeContract: EpisodeContract | null = null;
    
    if (outline && episodeNumber !== undefined && batchIndex !== undefined) {
      // BATCH MODE: Generating scenes from outline with CONTRACT ENFORCEMENT
      const episodeBeat = outline.episode_beats?.[episodeNumber - 1];
      const episodeTitle = episodeBeat?.title || `Episodio ${episodeNumber}`;
      const episodeSummary = episodeBeat?.summary || '';
      
      // =====================================================================
      // V11: Extract episode contract (non-negotiable structural requirements)
      // =====================================================================
      try {
        episodeContract = extractEpisodeContract(outline, episodeNumber);
        console.log('[generate-script] Contract extracted:', {
          episode: episodeNumber,
          threads: episodeContract.threads_required.length,
          turning_points: episodeContract.turning_points.length,
          factions: episodeContract.factions_in_play.length,
          characters_required: episodeContract.characters_required.length
        });
      } catch (contractError) {
        console.warn('[generate-script] Contract extraction failed, continuing with legacy mode:', contractError);
      }
      
      // Build outline context
      let outlineContext = '';
      if (outline.logline) outlineContext += `\nLOGLINE: ${outline.logline}`;
      if (outline.synopsis) outlineContext += `\nSINOPSIS: ${outline.synopsis}`;
      
      // Main characters from outline (not in Bible block already)
      if (outline.main_characters?.length && !projectId) {
        outlineContext += `\n\n=== PERSONAJES (${outline.main_characters.length}) ===`;
        outline.main_characters.forEach((char: any) => {
          outlineContext += `\n• ${char.name} (${char.role || 'supporting'}): ${char.description || ''}`;
        });
      }
      
      // Main locations from outline (not in Bible block already)
      if (outline.main_locations?.length && !projectId) {
        outlineContext += `\n\n=== LOCACIONES (${outline.main_locations.length}) ===`;
        outline.main_locations.forEach((loc: any) => {
          outlineContext += `\n• ${loc.name}: ${loc.description || ''}`;
        });
      }
      
      // Props
      if (outline.main_props?.length) {
        outlineContext += `\n\n=== PROPS ===`;
        outline.main_props.slice(0, 8).forEach((prop: any) => {
          outlineContext += `\n• ${prop.name}: ${prop.description || ''} - ${prop.narrative_function || ''}`;
        });
      }
      
      // Subplots (legacy - now using threads)
      if (outline.subplots?.length && !outline.threads?.length) {
        outlineContext += `\n\n=== SUBTRAMAS ===`;
        outline.subplots.forEach((subplot: any) => {
          outlineContext += `\n• ${subplot.name}: ${subplot.description || ''}`;
        });
      }
      
      // =====================================================================
      // V11: Build IMPERATIVE prompt with structural contracts
      // =====================================================================
      const contractBlock = episodeContract 
        ? formatContractForPrompt(episodeContract)
        : '';
      
      userPrompt = `
${contextBlock}

${contractBlock}

═══════════════════════════════════════════════════════════════
📝 INSTRUCCIONES DE GENERACIÓN
═══════════════════════════════════════════════════════════════

GENERA ${scenesPerBatch} ESCENAS EN FORMATO V3 SCHEMA

${outlineContext ? `=== CONTEXTO DEL OUTLINE ===${outlineContext}` : ''}

=== EPISODIO ACTUAL ===
EPISODIO: ${episodeNumber} - "${episodeTitle}"
CONFLICTO CENTRAL: ${episodeContract?.central_conflict || episodeBeat?.central_conflict || 'Ver outline'}
BATCH: ${batchIndex + 1}${totalBatches ? ` de ${totalBatches}` : ''}
${isLastBatch ? '⚠️ ÚLTIMO BATCH - DEBE INCLUIR EL CLIFFHANGER PLANIFICADO ARRIBA' : ''}

${episodeSummary ? `RESUMEN:\n${episodeSummary}` : ''}

${episodeBeat?.scenes_summary || ''}

${narrativeMode ? `MODO NARRATIVO: ${narrativeMode}` : ''}
${previousScenes?.length ? `\nESCENAS ANTERIORES:\n${previousScenes.map(s => `- ${s.slugline}: ${s.action_summary || s.summary}`).join('\n')}` : ''}

IDIOMA: ${language}
GÉNERO: ${genre || outline.genre || bible.project?.genre || 'Drama'}
TONO: ${tone || outline.tone || bible.project?.tone || 'Cinematic'}

═══════════════════════════════════════════════════════════════
⚠️ REGLAS CRÍTICAS (NO NEGOCIABLES)
═══════════════════════════════════════════════════════════════
1. EJECUTA los turning points del contrato - NO los resumas ni omitas
2. USA SOLO personajes del STORY_BIBLE o del contrato estructural
3. USA SOLO locaciones del STORY_BIBLE o del contrato estructural
4. CADA thread del contrato debe avanzar con escenas concretas
5. El SETPIECE debe dramatizarse completamente
6. Si necesitas entidad nueva → añádela a "new_entities_requested", NO la uses
7. Si algo no está claro → añádelo a "uncertainties"

GENERA exactamente ${scenesPerBatch} escenas con V3 schema completo.`;

    } else if (scenePrompt) {
      // SINGLE SCENE MODE
      userPrompt = `
${contextBlock}

GENERA UNA ESCENA EN FORMATO V3 SCHEMA

PROMPT: ${scenePrompt}

IDIOMA: ${language}

⚠️ USA SOLO personajes/locaciones del Bible o prompt. Ninguna invención.`;

    } else {
      // FULL SCRIPT MODE
      userPrompt = `
${contextBlock}

GENERA GUIÓN COMPLETO EN FORMATO V3 SCHEMA

IDEA: ${idea}

GÉNERO: ${genre || bible.project?.genre || 'Drama'}
TONO: ${tone || bible.project?.tone || 'Cinematic realism'}
FORMATO: ${format === 'series' ? 'Serie' : 'Película'}
IDIOMA: ${language}

⚠️ USA SOLO personajes/locaciones del Bible. Ninguna invención.`;
    }

    // Add tier-specific instructions
    const tierInstructions = qualityTier === 'rapido' 
      ? `\n\nMODO RÁPIDO: Genera rápido, confidence 0.6-0.8, technical_metadata._status = "EMPTY" en la mayoría.`
      : qualityTier === 'hollywood'
        ? `\n\nMODO HOLLYWOOD: Máxima calidad literaria, confidence 0.85-0.95, diálogos pulidos, ritmo cinematográfico, technical_metadata._status = "PARTIAL" cuando se infiera del contexto.`
        : `\n\nMODO PROFESIONAL: Alta calidad, confidence 0.75-0.9, technical_metadata._status = "PARTIAL" cuando se infiera del contexto.`;
    
    userPrompt += tierInstructions;

    // =========================================================================
    // Call LLM with hardened parsing
    // =========================================================================
    // Call Lovable AI Gateway with hardened parsing
    const llmResult = await callLovableAI(V3_SYMMETRIC_PROMPT, userPrompt, config, controller.signal, episodeNumber, scenesPerBatch);

    clearTimeout(timeoutId);

    const { result, parseWarnings } = llmResult;

    // Enforce V3 schema compliance + mark Bible sources
    const v3Result = enforceV3Schema(result, config, bibleCharNames);

    // Determine if this is a degraded result
    const isDegraded = parseWarnings.length > 0;
    const resultQuality = isDegraded ? 'DEGRADED' : 'FULL';

    console.log('[generate-script] Generated:', {
      scenesCount: v3Result.scenes?.length || 0,
      charactersIntroduced: v3Result.characters_introduced?.length || 0,
      locationsIntroduced: v3Result.locations_introduced?.length || 0,
      uncertainties: v3Result.uncertainties?.length || 0,
      newEntitiesRequested: v3Result.new_entities_requested?.length || 0,
      qualityTier,
      resultQuality,
      parseWarnings: parseWarnings.length > 0 ? parseWarnings.join(', ') : 'none'
    });

    // =========================================================================
    // V11: POST-GENERATION QC - Validate script against contract
    // =========================================================================
    let scriptQC: ScriptQCResult | null = null;
    
    if (episodeContract && v3Result.scenes?.length > 0) {
      try {
        scriptQC = validateScriptAgainstContract(v3Result as Record<string, unknown>, episodeContract);
        console.log('[generate-script] Script QC:', getQCSummary(scriptQC));
        
        if (!scriptQC.passed) {
          // V11.1: QC failure is a WARNING not a blocker - we still return the script
          // The frontend should mark it as 'degraded' and offer repair options
          console.warn('[generate-script] Script QC FAILED (proceeding with degraded quality):', {
            score: scriptQC.score,
            blockers: scriptQC.blockers,
            threads_coverage: scriptQC.threads_coverage?.coverage_percent || 0,
            missing_threads: scriptQC.threads_coverage?.missing || []
          });
        }
      } catch (qcError) {
        console.warn('[generate-script] Script QC failed to run:', qcError);
      }
    }

    // Always return 200 with quality indicator (never 500 for parse issues)
    return new Response(
      JSON.stringify({
        ...v3Result,
        _meta: {
          qualityTier,
          provider: config.provider,
          model: config.apiModel,
          schemaVersion: '3.2',
          bibleInjected: !!projectId,
          bibleCharacters: filteredBible.characters.length,
          bibleLocations: filteredBible.locations.length,
          resultQuality,
          parseWarnings: parseWarnings.length > 0 ? parseWarnings : undefined
        },
        _contract: episodeContract ? {
          episode: episodeContract.episode_number,
          threads_required: episodeContract.threads_required.length,
          turning_points: episodeContract.turning_points.length,
          characters_required: episodeContract.characters_required
        } : undefined,
        _qc: scriptQC ? {
          passed: scriptQC.passed,
          score: scriptQC.score,
          quality: scriptQC.quality,
          threads_coverage: scriptQC.threads_coverage.coverage_percent,
          tp_coverage: scriptQC.turning_points_executed.coverage_percent,
          blockers: scriptQC.blockers,
          warnings: scriptQC.warnings
        } : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('[generate-script] Error:', error);
    
    // For rate limits, return proper status
    if (error.status === 429) {
      return new Response(
        JSON.stringify({ error: error.message || 'Rate limit exceeded', retryable: true }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // For other errors, return 200 with degraded fallback (never crash)
    console.warn('[generate-script] Returning degraded fallback due to error');
    const fallback = buildFallbackScriptResult(undefined, 5);
    
    return new Response(
      JSON.stringify({
        ...fallback,
        _meta: {
          schemaVersion: '3.2',
          resultQuality: 'DEGRADED',
          parseWarnings: ['GENERATION_ERROR', error?.message || 'Unknown error']
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } finally {
    // =======================================================================
    // V3.0 LOCK RELEASE - Always release lock on exit (success or failure)
    // =======================================================================
    if (lockAcquired && projectIdForLock && auth?.supabase && auth?.userId) {
      try {
        await auth.supabase.rpc('release_project_lock', {
          p_project_id: projectIdForLock,
          p_user_id: auth.userId
        });
        console.log('[generate-script] Lock released for project:', projectIdForLock);
      } catch (releaseError) {
        // Don't fail the response if lock release fails - it will expire anyway
        console.warn('[generate-script] Failed to release lock (will expire):', releaseError);
      }
    }
  }
});
