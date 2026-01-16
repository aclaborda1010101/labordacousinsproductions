import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { requireAuthOrDemo, requireProjectAccess, authErrorResponse, AuthContext } from "../_shared/auth.ts";
import { parseJsonSafe, parseToolCallArgs, parseAnthropicToolUse, ParseResult } from "../_shared/llmJson.ts";
import { extractEpisodeContract, formatContractForPrompt, type EpisodeContract } from "../_shared/episode-contracts.ts";
import { validateScriptAgainstContract, getQCSummary, validateBatchAgainstPlan, buildRepairPrompt, type ScriptQCResult, type BatchValidationResult } from "../_shared/script-qc.ts";
import { validateDensity, getDensityProfile } from "../_shared/density-validator.ts";
// V13: Narrative Profiles - Genre-driven writing method
import { resolveNarrativeProfile, buildNarrativeProfilePromptBlock, type NarrativeProfile } from "../_shared/narrative-profiles.ts";
// V13: Intelligent Repair Prompts
import { buildIntelligentRepairPrompt, SITUATION_DETAIL_REQUIREMENT } from "../_shared/repair-prompts.ts";
// V13: Genericity validation for Hollywood-grade scripts
import { validateGenericity } from "../_shared/anti-generic.ts";
import { 
  buildBatchPlan, 
  buildStateBlock, 
  buildBatchContractBlock, 
  updateGenerationState, 
  createInitialState,
  type BatchPlan, 
  type GenerationState 
} from "../_shared/batch-planner.ts";

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
// HOLLYWOOD FILM SYSTEM PROMPT V2 - Literary Script Generation (Genre-Agnostic)
// =============================================================================
const HOLLYWOOD_FILM_PROMPT = `Eres guionista profesional de CINE (nivel Hollywood).

FORMATO ABSOLUTO: PELÍCULA (FILM).
PROHIBIDO:
- episodios, temporadas, estructura serial, cliffhangers episódicos

Tu tarea es escribir un GUION LITERARIO profesional basado en un OUTLINE ya validado.

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLAS GENERALES (VÁLIDAS PARA TODOS LOS GÉNEROS)
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Escribe escenas COMPLETAS, no resúmenes
- Cada escena tiene:
  • SITUACIÓN clara (espacio, luz, atmósfera)
  • OBJETIVO del personaje
  • CONFLICTO tangible
  • ACCIÓN visible
  • CONSECUENCIA
- Nada genérico ("discuten", "hablan del pasado")
- Todo diálogo tiene INTENCIÓN y SUBTEXTO

━━━━━━━━━━━━━━━━━━━━━━━━━━
DESCRIPCIÓN DE SITUACIÓN (OBLIGATORIA - 8-12 líneas por escena)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Antes del diálogo, describe:
- Espacio y atmósfera (luz, sonido, textura)
- Posición física de los personajes (blocking)
- Estado emocional (MOSTRADO, no explicado)
- Ritmo de la escena (tenso, incómodo, absurdo, íntimo)
- Qué está en juego en ese momento

━━━━━━━━━━━━━━━━━━━━━━━━━━
DIÁLOGOS
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Prohibido diálogo explicativo
- Los personajes NO dicen lo que sienten
- El subtexto manda
- Cada línea debe tener intención (presionar, ocultar, provocar, huir)

━━━━━━━━━━━━━━━━━━━━━━━━━━
LENGUAJE PROHIBIDO (RECHAZO AUTOMÁTICO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
NUNCA uses estas frases:
- "Se dan cuenta de que…"
- "Todo cambia"
- "La tensión aumenta"
- "Nada volverá a ser igual"
- "Empiezan a..."
- "Surge un conflicto"
- "Las cosas se complican"

━━━━━━━━━━━━━━━━━━━━━━━━━━
USO DEL NARRATIVE_PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━
- Respeta el método narrativo (setup/payoff, escalada, investigación, etc.)
- Respeta el pacing definido
- Respeta el tipo de conflicto
- NO expliques el perfil, aplícalo

━━━━━━━━━━━━━━━━━━━━━━━━━━
IMPORTANTE
━━━━━━━━━━━━━━━━━━━━━━━━━━
- No inventes personajes, reglas o localizaciones nuevas
- No simplifiques el outline
- No reduzcas densidad

━━━━━━━━━━━━━━━━━━━━━━━━━━
V3 SCHEMA (OBLIGATORIO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada escena incluye:
- scene_number, slugline, raw_content (descripción rica)
- action_summary (qué pasa dramáticamente)
- technical_metadata con _status, camera, lighting, sound, color
- characters_present con name, canon_level, source, confidence
- dialogue con character, parenthetical, line
- mood, conflict, duration_seconds

⚠️ REGLA DE ORO: Si no se puede FILMAR, no lo escribas.`;

// =============================================================================
// V3 SYMMETRIC SYSTEM PROMPT - WITH ANTI-INVENTION RULES (for series)
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
  "color": { "palette": null, contrast: null }
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

FORBIDDEN LANGUAGE (AUTOMATIC REJECTION):
- "todo cambia" / "everything changes"
- "se dan cuenta" / "they realize"
- "la tensión aumenta" / "tension rises"
- "empiezan a..." / "they start to..."
- "surge un conflicto" / "a conflict arises"

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
  // DEFENSIVE: Only select columns that are guaranteed to exist
  const [projectResult, charactersResult, locationsResult] = await Promise.allSettled([
    supabase
      .from('projects')
      .select('id, title, format, episodes_count, target_duration_min, master_language, creative_mode, visual_style, logline, genre, tone, narrative_framework, global_visual_dna, style_pack')
      .eq('id', projectId)
      .single(),
    supabase
      .from('characters')
      .select('id, name, role, character_role, canon_level, visual_dna, bio, arc, profile_json')
      .eq('project_id', projectId),
    supabase
      .from('locations')
      .select('id, name, canon_level, visual_dna, description, profile_json, narrative_role')
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
  // ==========================================================================
  // V3.2 ENHANCED BIBLE FILTER - Supports FILM + SERIES with multiple field names
  // ==========================================================================
  const beatCharacterNames = new Set<string>();
  const beatLocationNames = new Set<string>();
  
  // Helper to normalize and add name
  const addCharName = (c: any) => {
    const name = typeof c === 'string' ? c : c?.name;
    if (name) beatCharacterNames.add(name.toLowerCase().trim());
  };
  const addLocName = (l: any) => {
    const name = typeof l === 'string' ? l : l?.name;
    if (name) beatLocationNames.add(name.toLowerCase().trim());
  };
  
  // ──────────────────────────────────────────────────────────────────────────
  // 1. CHARACTERS: Support multiple field names (main_characters, cast, characters)
  // ──────────────────────────────────────────────────────────────────────────
  const charFields = ['main_characters', 'cast', 'characters', 'protagonists', 'ensemble'];
  charFields.forEach(field => {
    const arr = outline?.[field];
    if (Array.isArray(arr)) arr.forEach(addCharName);
  });
  
  // ──────────────────────────────────────────────────────────────────────────
  // 2. LOCATIONS: Support multiple field names (main_locations, locations, settings)
  // ──────────────────────────────────────────────────────────────────────────
  const locFields = ['main_locations', 'locations', 'settings', 'worlds'];
  locFields.forEach(field => {
    const arr = outline?.[field];
    if (Array.isArray(arr)) arr.forEach(addLocName);
  });
  
  // ──────────────────────────────────────────────────────────────────────────
  // 3. EPISODE BEATS (for series)
  // ──────────────────────────────────────────────────────────────────────────
  if (outline?.episode_beats) {
    const relevantBeats = episodeNumber 
      ? [outline.episode_beats[episodeNumber - 1]].filter(Boolean)
      : outline.episode_beats;
    
    relevantBeats.forEach((beat: any) => {
      // Characters from beat
      ['characters_present', 'key_characters', 'characters', 'cast'].forEach(f => {
        const arr = beat?.[f];
        if (Array.isArray(arr)) arr.forEach(addCharName);
      });
      // Locations from beat
      ['location', 'locations', 'setting'].forEach(f => {
        const val = beat?.[f];
        if (typeof val === 'string') addLocName(val);
        if (Array.isArray(val)) val.forEach(addLocName);
      });
    });
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 4. ACTS_SUMMARY (for FILM) - Extract from beat arrays within acts
  // ──────────────────────────────────────────────────────────────────────────
  if (outline?.acts_summary) {
    Object.values(outline.acts_summary).forEach((act: any) => {
      // Each act may have beats array
      const beats = act?.beats || act?.scenes || [];
      if (Array.isArray(beats)) {
        beats.forEach((beat: any) => {
          ['characters_present', 'key_characters', 'characters'].forEach(f => {
            const arr = beat?.[f];
            if (Array.isArray(arr)) arr.forEach(addCharName);
          });
          ['location', 'locations', 'setting'].forEach(f => {
            const val = beat?.[f];
            if (typeof val === 'string') addLocName(val);
            if (Array.isArray(val)) val.forEach(addLocName);
          });
        });
      }
    });
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 5. FALLBACK: If no names extracted, include ALL bible entities for FILM
  // ──────────────────────────────────────────────────────────────────────────
  const isFilm = bible.project?.format?.toLowerCase() === 'film' || 
                 outline?.format?.toLowerCase() === 'film' ||
                 !outline?.episode_beats;
  
  const noNamesExtracted = beatCharacterNames.size === 0 && beatLocationNames.size === 0;
  
  if (isFilm && noNamesExtracted) {
    console.log('[Bible] FILM fallback: including ALL entities (no names extracted from outline)');
    return { 
      characters: bible.characters, 
      locations: bible.locations 
    };
  }
  
  // ──────────────────────────────────────────────────────────────────────────
  // 6. FILTER: P0/P1/P2 always + any mentioned + partial name matching
  // ──────────────────────────────────────────────────────────────────────────
  const filteredCharacters = bible.characters.filter(char => {
    const canonLevel = char.canon_level?.toUpperCase() || 'P3';
    const isHighPriority = ['P0', 'P1', 'P2'].includes(canonLevel);
    const charNameLower = char.name?.toLowerCase()?.trim();
    const isInBeats = charNameLower && beatCharacterNames.has(charNameLower);
    // Partial match: if outline mentions "María" and bible has "María García"
    const partialMatch = charNameLower && Array.from(beatCharacterNames).some(
      n => charNameLower.includes(n) || n.includes(charNameLower)
    );
    return isHighPriority || isInBeats || partialMatch;
  });
  
  const filteredLocations = bible.locations.filter(loc => {
    const canonLevel = loc.canon_level?.toUpperCase() || 'P3';
    const isHighPriority = ['P0', 'P1', 'P2'].includes(canonLevel);
    const locNameLower = loc.name?.toLowerCase()?.trim();
    const isInBeats = locNameLower && beatLocationNames.has(locNameLower);
    const partialMatch = locNameLower && Array.from(beatLocationNames).some(
      n => locNameLower.includes(n) || n.includes(locNameLower)
    );
    return isHighPriority || isInBeats || partialMatch;
  });
  
  // ──────────────────────────────────────────────────────────────────────────
  // 7. SAFETY NET: If filter returned <3 chars for film, include all
  // ──────────────────────────────────────────────────────────────────────────
  const finalCharacters = (isFilm && filteredCharacters.length < 3 && bible.characters.length > filteredCharacters.length)
    ? bible.characters
    : filteredCharacters;
  const finalLocations = (isFilm && filteredLocations.length < 2 && bible.locations.length > filteredLocations.length)
    ? bible.locations
    : filteredLocations;
  
  console.log('[Bible] V3.2 Filtered:', {
    format: isFilm ? 'FILM' : 'SERIES',
    totalCharacters: bible.characters.length,
    relevantCharacters: finalCharacters.length,
    totalLocations: bible.locations.length,
    relevantLocations: finalLocations.length,
    extractedCharNames: Array.from(beatCharacterNames).slice(0, 10),
    extractedLocNames: Array.from(beatLocationNames).slice(0, 10),
    usedFallback: noNamesExtracted || finalCharacters.length > filteredCharacters.length
  });
  
  return { characters: finalCharacters, locations: finalLocations };
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
// LOVABLE AI GATEWAY CALLER WITH HARDENED PARSING + MULTI-STRATEGY FALLBACK
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
  const parseWarnings: string[] = [];
  
  // STRATEGY 1: Tool call arguments (expected path)
  const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    const parseResult = parseToolCallArgs(toolCall, V3_OUTPUT_SCHEMA.name, 'lovable.generate_script');
    if (parseResult.ok && parseResult.json) {
      return { result: parseResult.json, parseWarnings: parseResult.warnings };
    }
    parseWarnings.push(...parseResult.warnings);
  } else {
    parseWarnings.push('NO_TOOL_CALL_IN_RESPONSE');
  }
  
  // STRATEGY 2: Parse from message content
  const content = data?.choices?.[0]?.message?.content;
  if (content) {
    console.log('[generate-script] Trying content fallback, first 500 chars:', content.substring(0, 500));
    
    // Try direct parse with cleanLLMArtifacts via parseJsonSafe
    const contentResult = parseJsonSafe(content, 'lovable.content_fallback');
    if (contentResult.ok && contentResult.json) {
      parseWarnings.push('CONTENT_FALLBACK_USED');
      return { 
        result: contentResult.json, 
        parseWarnings: [...parseWarnings, ...contentResult.warnings] 
      };
    }
    
    // STRATEGY 3: Extract scenes array with regex
    try {
      const scenesMatch = content.match(/["']?scenes["']?\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
      if (scenesMatch) {
        const scenesJson = scenesMatch[1];
        const scenes = JSON.parse(scenesJson);
        if (Array.isArray(scenes) && scenes.length > 0) {
          parseWarnings.push('REGEX_SCENES_EXTRACTED');
          console.log(`[generate-script] Regex extracted ${scenes.length} scenes`);
          return {
            result: { scenes, synopsis: '', characters_introduced: [], locations_introduced: [] },
            parseWarnings
          };
        }
      }
    } catch (regexErr) {
      parseWarnings.push('REGEX_EXTRACTION_FAILED');
      console.warn('[generate-script] Regex extraction failed:', regexErr);
    }
    
    // STRATEGY 4: Extract JSON block from markdown
    try {
      const jsonBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        const jsonContent = jsonBlockMatch[1].trim();
        const parsed = JSON.parse(jsonContent);
        parseWarnings.push('MARKDOWN_JSON_EXTRACTED');
        return { result: parsed, parseWarnings };
      }
    } catch (mdErr) {
      parseWarnings.push('MARKDOWN_EXTRACTION_FAILED');
    }
  } else {
    parseWarnings.push('NO_CONTENT_IN_RESPONSE');
  }
  
  // Log full raw response for debugging (truncated)
  const rawResponseStr = JSON.stringify(data).substring(0, 2000);
  console.error('[generate-script] ALL PARSE STRATEGIES FAILED');
  console.error('[generate-script] Raw response (truncated):', rawResponseStr);
  
  // THROW instead of returning empty fallback - let caller handle retry
  throw new Error(`PARSE_FAILED: Could not extract valid screenplay from LLM response. Warnings: ${parseWarnings.join(', ')}`);
}

// =============================================================================
// AUTO-MATERIALIZATION HELPERS
// =============================================================================
type BibleEmptyReason = 'NO_CHARACTERS' | 'NO_LOCATIONS' | 'NO_BOTH';

function getBibleEmptyReason(charsLen: number, locsLen: number): BibleEmptyReason | null {
  if (charsLen === 0 && locsLen === 0) return 'NO_BOTH';
  if (charsLen === 0) return 'NO_CHARACTERS';
  if (locsLen === 0) return 'NO_LOCATIONS';
  return null;
}

async function callMaterializeEntities(projectId: string): Promise<{ success: boolean; message: string }> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceKey) {
    throw new Error('MATERIALIZE_MISSING_ENV');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/materialize-entities`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      projectId,
      source: 'outline',
    }),
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP_${res.status}`;
    return { success: false, message: msg };
  }
  
  return { success: true, message: json?.message || 'Materialized' };
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
  // V11.2: State tracking for batch-aware generation
  generationState?: GenerationState;
  // V11.2: Batch plan for this specific batch
  currentBatchPlan?: BatchPlan;
  // V11.2: Is this a repair attempt?
  isRepairAttempt?: boolean;
  repairBlockers?: string[];
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
    // V11.2: DENSITY GATE (DEFENSE IN DEPTH)
    // Only run if not a repair attempt (repair attempts focus on contract, not density)
    // =========================================================================
    const isRepairAttempt = request.isRepairAttempt || false;
    
    if (outline && !isRepairAttempt) {
      const densityProfile = getDensityProfile(format || 'serie_drama');
      const densityCheck = validateDensity(outline, densityProfile);
      
      if (densityCheck.status === 'FAIL') {
        console.warn('[generate-script] DENSITY_GATE_FAILED:', {
          score: densityCheck.score,
          fixesCount: densityCheck.required_fixes?.length || 0
        });
        
        // Release lock if acquired
        if (lockAcquired && projectIdForLock) {
          try {
            await auth.supabase.rpc('release_project_lock', { p_project_id: projectIdForLock });
          } catch { /* ignore */ }
        }
        
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({
          success: false,
          error: 'DENSITY_GATE_FAILED',
          code: 'DENSITY_INSUFFICIENT',
          message: 'El outline no cumple mínimos de densidad narrativa',
          // NORMALIZATION: Use both 'score' AND 'density_score' for compatibility
          score: densityCheck.score,
          density_score: densityCheck.score,
          required_fixes: densityCheck.required_fixes,
          human_summary: densityCheck.human_summary,
        }), { 
          status: 422, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        });
      }
    }

    // =========================================================================
    // V13: FORMAT GATE - FILM cannot have series artifacts
    // Pre-Bible check: use request format only (bible not yet loaded)
    // =========================================================================
    const formatUpper = (format || 'SERIES').toUpperCase();
    if (formatUpper === 'FILM' || formatUpper === 'PELÍCULA' || formatUpper === 'PELICULA') {
      const outlineBlob = JSON.stringify(outline ?? {});
      const hasSeriesArtifacts = 
        /"episodes?":/i.test(outlineBlob) || 
        /season_episodes/i.test(outlineBlob) || 
        /season_arc/i.test(outlineBlob) ||
        /episode_beats/i.test(outlineBlob) ||
        /episode_number/i.test(outlineBlob);
        
      if (hasSeriesArtifacts) {
        console.warn('[generate-script] FORMAT_GATE_FAILED: FILM contains series artifacts');
        
        // Release lock if acquired
        if (lockAcquired && projectIdForLock) {
          try {
            await auth.supabase.rpc('release_project_lock', { p_project_id: projectIdForLock });
          } catch { /* ignore */ }
        }
        
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({
          success: false,
          error: 'FORMAT_GATE_FAILED',
          code: 'FILM_CONTAINS_SERIES_ARTIFACTS',
          message: 'El outline FILM contiene artefactos de series (episodios/temporada). Regenera el outline en formato película con estructura de 3 actos.'
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // =========================================================================
    // V13: PRE-GENERATION GENERICITY CHECK (cheap, prevents garbage)
    // =========================================================================
    if (outline && !isRepairAttempt) {
      const genPre = validateGenericity(outline);
      
      if (genPre.status === 'FAIL') {
        console.warn('[generate-script] GENERICITY_GATE_FAILED:', {
          score: genPre.genericity_score,
          observability: genPre.observability_score,
          phrases: genPre.phrases_found?.slice(0, 5)
        });
        
        // Release lock if acquired
        if (lockAcquired && projectIdForLock) {
          try {
            await auth.supabase.rpc('release_project_lock', { p_project_id: projectIdForLock });
          } catch { /* ignore */ }
        }
        
        clearTimeout(timeoutId);
        return new Response(JSON.stringify({
          success: false,
          error: 'GENERICITY_GATE_FAILED',
          code: 'OUTLINE_TOO_GENERIC',
          message: 'El outline contiene vaguedad / turning points no filmables. Auto-parchea o mejora el outline.',
          genericity: {
            score: genPre.genericity_score,
            observability_score: genPre.observability_score,
            phrases_found: genPre.phrases_found,
            errors: genPre.errors
          }
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // =========================================================================
    // FETCH PROJECT BIBLE (if projectId provided)
    // =========================================================================
    let bible: BibleContext = { project: null, characters: [], locations: [], fetchErrors: [] };
    let filteredBible = { characters: [] as any[], locations: [] as any[] };
    let storyBibleBlock = '';
    
    if (projectId) {
      bible = await fetchProjectBible(projectId);
      
      // =========================================================================
      // AUTO-MATERIALIZATION GATE: If Bible is empty, try to materialize from outline
      // =========================================================================
      const emptyReason = getBibleEmptyReason(bible.characters.length, bible.locations.length);
      let materializeAttempted = false;
      
      if (emptyReason) {
        materializeAttempted = true;
        console.log('[generate-script] Bible empty, attempting auto-materialization...', { 
          emptyReason, 
          charactersCount: bible.characters.length, 
          locationsCount: bible.locations.length 
        });

        try {
          const matResult = await callMaterializeEntities(projectId);
          console.log('[generate-script] Auto-materialization result:', matResult);

          if (matResult.success) {
            // Re-fetch Bible after materialization
            bible = await fetchProjectBible(projectId);
            console.log('[generate-script] Bible re-fetched:', {
              charactersCount: bible.characters.length,
              locationsCount: bible.locations.length
            });
          }
        } catch (matErr) {
          console.error('[generate-script] Auto-materialization failed:', matErr);
        }
      }

      // HARD GATE: If still empty after auto-materialization, return actionable error
      const finalEmptyReason = getBibleEmptyReason(bible.characters.length, bible.locations.length);
      if (finalEmptyReason) {
        clearTimeout(timeoutId);
        
        // Release lock if acquired
        if (lockAcquired && projectIdForLock) {
          try {
            await auth.supabase.rpc('release_project_lock', { p_project_id: projectIdForLock });
          } catch { /* ignore */ }
        }
        
        return new Response(JSON.stringify({
          error: 'BIBLE_EMPTY',
          code: 'BIBLE_EMPTY',
          reason: finalEmptyReason,
          message: 'No hay suficientes entidades materializadas para generar el guión. Sincroniza el outline primero.',
          action: {
            type: 'materialize-entities',
            payload: { projectId, source: 'outline' }
          },
          debug: {
            charactersCount: bible.characters.length,
            locationsCount: bible.locations.length,
            autoMaterializeAttempted: materializeAttempted
          }
        }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      
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
    // V11.2: ADAPT_FROM_SOURCE DETECTION
    // If outline.idea contains a screenplay with sluglines/dialogue, adapt it
    // instead of generating from scratch
    // =======================================================================
    const sourceText = outline?.idea?.trim() || '';
    // V11.2 FIX: Detect sluglines with or without markdown bold (**INT. or INT.)
    const hasScreenplayMarkers = 
      sourceText && 
      /^(\*{0,2})(INT\.|EXT\.)/m.test(sourceText) && 
      /\n(\*{0,2})?[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 '.():-]{2,40}(\*{0,2})?\n/m.test(sourceText);
    
    const generationMode = hasScreenplayMarkers ? 'ADAPT_FROM_SOURCE' : 'GENERATE_FROM_BEATS';
    
    // Count expected scenes from source for QC - handle **INT. or INT.
    const expectedScenesFromSource = hasScreenplayMarkers 
      ? (sourceText.match(/^(\*{0,2})(INT\.|EXT\.)/gmi)?.length || 0)
      : 0;
    
    console.log('[generate-script] Generation mode:', {
      mode: generationMode,
      sourceLength: sourceText.length,
      hasScreenplayMarkers,
      expectedScenesFromSource
    });

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
      // V11.2: Build ADAPT or GENERATE prompt based on mode
      // =====================================================================
      const contractBlock = episodeContract 
        ? formatContractForPrompt(episodeContract)
        : '';
      
      // Build script source block if adapting from source
      let scriptSourceBlock = '';
      if (generationMode === 'ADAPT_FROM_SOURCE') {
        scriptSourceBlock = `
═══════════════════════════════════════════════════════════════
📜 GUION FUENTE (ADAPTAR - NO INVENTAR)
═══════════════════════════════════════════════════════════════
${sourceText}

⚠️ INSTRUCCIONES DE ADAPTACIÓN:
- EXTRAE sluglines, personajes, diálogos del texto fuente
- NO inventes contenido nuevo - solo estructura lo existente
- Cada escena debe mapearse 1:1 con las del fuente
- Copia diálogos textualmente
- Condensa acciones pero mantén fidelidad
- Genera raw_content con el texto original de cada escena
═══════════════════════════════════════════════════════════════
`;
      }
      
      const modeInstructions = generationMode === 'ADAPT_FROM_SOURCE'
        ? `ADAPTA las ${expectedScenesFromSource} escenas del GUION FUENTE a formato V3 SCHEMA`
        : `GENERA ${scenesPerBatch} ESCENAS EN FORMATO V3 SCHEMA`;
      
      const modeRules = generationMode === 'ADAPT_FROM_SOURCE'
        ? `
═══════════════════════════════════════════════════════════════
⚠️ REGLAS DE ADAPTACIÓN (NO NEGOCIABLES)
═══════════════════════════════════════════════════════════════
1. EXTRAE cada escena del guion fuente - NO inventes nuevas
2. COPIA los diálogos textualmente del fuente
3. GENERA raw_content con el texto cinematográfico de cada escena
4. IDENTIFICA personajes por sus líneas de diálogo
5. Si el guion fuente menciona personajes/locaciones, úsalos
6. Si algo no está en el fuente → NO lo añadas
7. Cada scene DEBE tener dialogue[] y characters_present[] poblados`
        : `
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

═══════════════════════════════════════════════════════════════
📍 SCENE SITUATION - OBLIGATORIO POR ESCENA (8-12 LÍNEAS)
═══════════════════════════════════════════════════════════════
Cada escena DEBE incluir en su action_summary y raw_content:

1. ATMÓSFERA: Tiempo, luz, sonido ambiente, sensación física del espacio
2. INTENCIÓN DRAMÁTICA: ¿Qué DEBE sentir el espectador en este momento?
3. MICROCONFLICTO: Tensión específica de ESTA escena (no el arco general)
4. SUBTEXTO: Lo que NO se dice pero se comunica con miradas/silencios/gestos
5. BLOCKING: Dónde está cada personaje, cómo se mueven, qué distancia hay entre ellos
6. RITMO: ¿Lento/contemplativo? ¿Tenso/acelerado? ¿Absurdo/cómico?
7. HOOK DE CIERRE: ¿Qué empuja al espectador a la siguiente escena?

⚠️ NO ACEPTABLE:
- "Juan entra y habla con María" → DEMASIADO VAGO
- "Tienen una conversación tensa" → NO HAY ESPECIFICIDAD
- "Se enfrentan por el pasado" → ABSTRACTO SIN IMAGEN

✅ ACEPTABLE:
- "Juan entra por la puerta trasera, PISANDO el charco de sangre sin darse cuenta. María, sentada de espaldas frente al espejo, lo observa por el reflejo pero no se gira. El ventilador del techo GIRA lentamente, cortando la luz en franjas. Juan: '¿Dónde está?' (tono neutro, pero sus manos tiemblan). María no responde. El silencio dura tres segundos. Solo el ZUMBIDO del ventilador."

GENERA exactamente ${scenesPerBatch} escenas con V3 schema completo.`;
      
      userPrompt = `
${contextBlock}

${scriptSourceBlock}

${contractBlock}

═══════════════════════════════════════════════════════════════
📝 INSTRUCCIONES DE GENERACIÓN
═══════════════════════════════════════════════════════════════

${modeInstructions}

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

${modeRules}`;

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

    // V13: Resolve narrative profile for writing method
    const resolvedGenre = genre || outline?.genre || bible.project?.genre || 'Drama';
    const resolvedTone = tone || outline?.tone || bible.project?.tone;
    const narrativeProfileResolved = resolveNarrativeProfile(resolvedGenre, resolvedTone);
    const narrativeProfileBlock = buildNarrativeProfilePromptBlock(narrativeProfileResolved);
    
    // Add tier-specific instructions + narrative profile
    const tierInstructions = qualityTier === 'rapido' 
      ? `\n\nMODO RÁPIDO: Genera rápido, confidence 0.6-0.8, technical_metadata._status = "EMPTY" en la mayoría.`
      : qualityTier === 'hollywood'
        ? `\n\nMODO HOLLYWOOD: Máxima calidad literaria, confidence 0.85-0.95, diálogos pulidos, ritmo cinematográfico, technical_metadata._status = "PARTIAL" cuando se infiera del contexto.\n\n${SITUATION_DETAIL_REQUIREMENT}`
        : `\n\nMODO PROFESIONAL: Alta calidad, confidence 0.75-0.9, technical_metadata._status = "PARTIAL" cuando se infiera del contexto.`;
    
    userPrompt += tierInstructions;
    userPrompt += `\n\n${narrativeProfileBlock}`;

    // =========================================================================
    // Call LLM with hardened parsing
    // =========================================================================
    // V13: Build system prompt with narrative profile for Hollywood tier
    const systemPrompt = qualityTier === 'hollywood' 
      ? `${HOLLYWOOD_FILM_PROMPT}\n\n${narrativeProfileBlock}`
      : V3_SYMMETRIC_PROMPT;
    
    // Call Lovable AI Gateway with hardened parsing
    const llmResult = await callLovableAI(systemPrompt, userPrompt, config, controller.signal, episodeNumber, scenesPerBatch);

    clearTimeout(timeoutId);

    const { result, parseWarnings } = llmResult;

    // Enforce V3 schema compliance + mark Bible sources
    const v3Result = enforceV3Schema(result, config, bibleCharNames);

    // =========================================================================
    // P0 FIX: ANTI-PLACEHOLDER QC - Detect and flag placeholder scenes
    // =========================================================================
    const isPlaceholderScene = (scene: any): boolean => {
      const slugline = (scene.slugline || '').toLowerCase();
      const actionSummary = (scene.action_summary || '').toLowerCase();
      const hasNoCharacters = !scene.characters_present || scene.characters_present.length === 0;
      const hasNoDialogue = !scene.dialogue || scene.dialogue.length === 0;
      
      return (
        slugline.includes('ubicación') ||
        slugline.includes('location') ||
        actionSummary === 'por generar' ||
        actionSummary.includes('placeholder') ||
        (hasNoCharacters && hasNoDialogue && !scene.raw_content?.trim())
      );
    };
    
    const scenes = v3Result.scenes || [];
    const placeholderScenes = scenes.filter(isPlaceholderScene);
    const placeholderRatio = scenes.length > 0 ? placeholderScenes.length / scenes.length : 0;
    
    // If more than 50% are placeholders, mark as degraded with specific code
    if (placeholderRatio > 0.5) {
      console.warn('[generate-script] PLACEHOLDER_DETECTED:', {
        total: scenes.length,
        placeholders: placeholderScenes.length,
        ratio: placeholderRatio.toFixed(2),
        examples: placeholderScenes.slice(0, 3).map((s: any) => s.slugline)
      });
      
      // Return 422 to indicate the content is degraded but saved
      return new Response(
        JSON.stringify({
          ...v3Result,
          _meta: {
            qualityTier,
            schemaVersion: '3.2',
            resultQuality: 'PLACEHOLDER_DEGRADED',
            placeholderCount: placeholderScenes.length,
            totalScenes: scenes.length,
            placeholderRatio: placeholderRatio.toFixed(2)
          },
          error: 'PLACEHOLDER_SCRIPT',
          message: 'El script generado contiene demasiados placeholders. Verifica que el outline tenga suficiente detalle.',
          actionable: true,
          suggestedAction: 'regenerate_with_detailed_outline'
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // =========================================================================
    // V11.2: ADAPT_FROM_SOURCE QC - Must not return 0 scenes when adapting
    // =========================================================================
    if (generationMode === 'ADAPT_FROM_SOURCE' && expectedScenesFromSource >= 2 && scenes.length === 0) {
      console.error('[generate-script] ADAPT_FAILED_NO_SCENES:', {
        mode: generationMode,
        expectedFromSource: expectedScenesFromSource,
        gotScenes: 0
      });
      
      return new Response(
        JSON.stringify({
          error: 'ADAPT_FAILED_NO_SCENES',
          code: 'ADAPT_FAILED_NO_SCENES',
          message: 'Se detectó guion fuente con escenas pero la adaptación falló. El LLM no extrajo las escenas.',
          expectedScenes: expectedScenesFromSource,
          gotScenes: 0,
          hint: 'Verifica que el outline.idea tenga formato de guion válido (INT./EXT. + diálogos)',
          actionable: true,
          suggestedAction: 'retry_with_deterministic_parser'
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine if this is a degraded result
    const isDegraded = parseWarnings.length > 0 || placeholderScenes.length > 0;
    const resultQuality = isDegraded ? 'DEGRADED' : 'FULL';

    console.log('[generate-script] Generated:', {
      scenesCount: v3Result.scenes?.length || 0,
      charactersIntroduced: v3Result.characters_introduced?.length || 0,
      locationsIntroduced: v3Result.locations_introduced?.length || 0,
      uncertainties: v3Result.uncertainties?.length || 0,
      newEntitiesRequested: v3Result.new_entities_requested?.length || 0,
      placeholderScenes: placeholderScenes.length,
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
    // V11.2: Include updatedGenerationState for frontend state accumulation
    const updatedGenerationState = request.generationState 
      ? updateGenerationState(
          request.generationState,
          {
            threads_advanced: v3Result.threads_advanced || [],
            turning_points_executed: v3Result.turning_points_executed || [],
            characters_appeared: v3Result.characters_appeared || (v3Result.scenes || []).flatMap((s: any) => 
              (s.characters_present || []).map((c: any) => c.name || c)
            ),
            scenes: v3Result.scenes || [],
          },
          request.currentBatchPlan || { episode: episodeNumber || 1, batchIndex: batchIndex || 0 } as any
        )
      : null;

    return new Response(
      JSON.stringify({
        ...v3Result,
        // V11.2: Add batch contract compliance fields
        threads_advanced: v3Result.threads_advanced || [],
        turning_points_executed: v3Result.turning_points_executed || [],
        characters_appeared: v3Result.characters_appeared || [],
        updatedGenerationState,
        _meta: {
          qualityTier,
          provider: config.provider,
          model: config.apiModel,
          schemaVersion: '3.2',
          generationMode,
          expectedScenesFromSource: generationMode === 'ADAPT_FROM_SOURCE' ? expectedScenesFromSource : undefined,
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
