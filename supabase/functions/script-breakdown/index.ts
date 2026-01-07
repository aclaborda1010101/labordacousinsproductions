import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBreakdown, type NormalizedBreakdown } from "../_shared/normalizeBreakdown.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScriptBreakdownRequest {
  scriptText: string;
  projectId: string;
  scriptId?: string;
  language?: string;
  format?: 'film' | 'series' | string;
  episodesCount?: number;
  episodeDurationMin?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER PROMPT: ANALIZADOR PERFECTO DE GUIONES CINEMATOGRÁFICOS
// Basado en formato estándar de la industria
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA-PROMPT V22: UNIFIED SEMANTIC SCREENPLAY ANALYSIS
// Single-pass architecture: Sonnet 4 does EVERYTHING, code only stores.
// ═══════════════════════════════════════════════════════════════════════════════
const MEGA_SEMANTIC_PROMPT = `You are a professional screenplay analyst.

Your task is to read and UNDERSTAND the screenplay as a human script supervisor would.

This is NOT a keyword extraction task.
This is NOT a simple NER task.
This is a semantic understanding task.

━━━━━━━━━━━━━━━━━━━━━━
GLOBAL RULES
━━━━━━━━━━━━━━━━━━━━━━

1. You MUST read the entire script holistically before answering.
2. You MUST understand that:
   - Characters can have multiple names, callsigns, aliases.
   - The same character can appear under different labels.
3. You MUST unify all aliases into a SINGLE canonical character.
4. You MUST ignore:
   - Technical screenplay terms (CONT'D, V.O., O.S., PRE-LAP, etc.)
   - Camera directions (ANGLE ON, CLOSE UP, POV, etc.)
   - Actions and stage directions
   - Transitions (CUT TO, FADE IN, etc.)
   - Colors used as tactical codes (RED, BLUE, ORANGE, etc.)
   - Dialogue fragments or exclamations
   - Verbs (BREAKING, RUNNING, EJECT, etc.)
   - Military/aviation jargon used as commands (LEVEL, ABORT, ENGAGE, etc.)
5. You MUST NOT invent characters.
6. You MUST NOT output partial, truncated or sampled lists.
7. If unsure, reason semantically. Do NOT guess.

━━━━━━━━━━━━━━━━━━━━━━
CHARACTER RULES
━━━━━━━━━━━━━━━━━━━━━━

A CHARACTER is:
- A named individual with narrative relevance
- OR a recurring role with identity (callsign, rank, function)

A CHARACTER is NOT:
- An action ("BREAKING", "RUNS", "EJECT")
- A command ("LEVEL", "ORANGE", "ABORT")
- A technical role without identity ("AIR CONTROL OFFICER", "REMAINING PILOT")
- A temporary label ("PILOT #3", "MAN IN CROWD")
- A color or code ("RED", "BLUE", "ALPHA")
- A system or voice without personality ("TOWER", "RADIO", "ALARM")

Alias unification examples:
- PETE MITCHELL = MAVERICK → canonical: "PETE MITCHELL", aliases: ["MAVERICK"]
- BRADLEY BRADSHAW = ROOSTER → canonical: "BRADLEY BRADSHAW", aliases: ["ROOSTER"]
- TOM KAZANSKY = ICEMAN → canonical: "TOM KAZANSKY", aliases: ["ICEMAN"]

Character types:
- "main": Protagonist, major screen time, drives the plot
- "supporting": Significant recurring role, important to story
- "featured_extra": Speaking role but limited scenes
- "voice": Non-physical voice (radio, intercom, announcer)

━━━━━━━━━━━━━━━━━━━━━━
SCENE RULES
━━━━━━━━━━━━━━━━━━━━━━

A SCENE is defined by:
- INT / EXT marker
- Location name
- Time of day (DAY, NIGHT, CONTINUOUS, etc.)

Each scene MUST include:
- characters_present: list of CANONICAL character names (not aliases)
- Only characters that actually appear or speak in that scene

IMPORTANT: Same location + different time = DIFFERENT scenes

━━━━━━━━━━━━━━━━━━━━━━
LOCATION RULES
━━━━━━━━━━━━━━━━━━━━━━

A LOCATION is:
- A real, physical place where scenes occur
- Normalized to its base form (e.g., "MAVERICK'S HOUSE - KITCHEN" → base: "MAVERICK'S HOUSE")

A LOCATION is NOT:
- A camera direction or shot description
- A vehicle in motion (unless it's a recurring set)
- A color or tactical code
- An abstract concept

━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (STRICT JSON)
━━━━━━━━━━━━━━━━━━━━━━

{
  "title": "Film title (extracted from script or inferred)",
  "logline": "One-sentence summary of the story",
  "synopsis": "2-3 paragraph summary of the narrative",
  "characters": [
    {
      "id": "stable_slug (lowercase, underscores)",
      "canonical_name": "FULL NAME AS IT SHOULD APPEAR",
      "aliases": ["CALLSIGN", "NICKNAME", "OTHER_NAME"],
      "type": "main | supporting | featured_extra | voice",
      "bio": "Brief character description",
      "confidence": "high | medium"
    }
  ],
  "scenes": [
    {
      "number": 1,
      "int_ext": "INT | EXT | INT/EXT",
      "location_base": "LOCATION NAME",
      "time": "DAY | NIGHT | DAWN | etc",
      "heading": "Original scene heading",
      "characters_present": ["CANONICAL_NAME_1", "CANONICAL_NAME_2"]
    }
  ],
  "locations": [
    {
      "name": "LOCATION NAME",
      "type": "interior | exterior | both",
      "scenes_count": 5
    }
  ],
  "voices_and_systems": [
    {
      "name": "TOWER | RADIO | etc",
      "type": "radio | intercom | computer | announcement"
    }
  ],
  "non_entities_rejected": [
    {
      "raw_text": "LEVEL",
      "reason": "Aviation command, not a character"
    }
  ],
  "production": {
    "dialogue_density": "low | medium | high",
    "cast_size": "small | medium | large",
    "complexity": "low | medium | high"
  }
}

━━━━━━━━━━━━━━━━━━━━━━
FINAL CHECK BEFORE OUTPUT
━━━━━━━━━━━━━━━━━━━━━━

Before answering:
✓ Verify that all major characters are present with correct aliases.
✓ Verify that no technical junk is present in characters list.
✓ Verify alias unification is correct (one canonical per real person).
✓ Verify scenes have real characters in characters_present, not counts.
✓ Verify locations are real places, not camera directions.
✓ Verify non_entities_rejected captures anything ambiguous you filtered.

If something is ambiguous, resolve it semantically based on context.
DO NOT include anything you're not confident about.`;

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: HAIKU - NORMALIZATION ENGINE (NO REINTERPRETATION, JUST CLEAN DATA)
// ═══════════════════════════════════════════════════════════════════════════════
const HAIKU_NORMALIZATION_PROMPT = `You are a data normalization engine.

INPUT:
You will receive a structured semantic analysis of a screenplay.
All classification decisions have already been made.
You must NOT reinterpret meaning.

TASKS:

1. Characters
   - Output one entry per real character
   - Use canonical_name only
   - Attach aliases as metadata
   - Remove any character marked as invalid or ambiguous

2. Extras with dialogue
   - Only include actual speaking extras
   - Exclude system labels or repeated main characters

3. Voices / Systems
   - Normalize functional entities (Tower, Comms, Alarm, Speaker)

4. Locations
   - Normalize to real, reusable locations
   - Remove scene annotations, routes, flight states, editor notes

RULES:
- Deduplicate strictly
- No explanations
- No reasoning
- No hallucination
- Clean production-ready output only

OUTPUT FORMAT (JSON ONLY):

{
  "cast_principal": [
    {
      "name": "",
      "aliases": [],
      "role": ""
    }
  ],
  "extras_with_dialogue": [
    {
      "name": ""
    }
  ],
  "voices_and_systems": [
    {
      "name": "",
      "type": ""
    }
  ],
  "locations": [
    {
      "name": ""
    }
  ]
}`;

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2B: HAIKU DETAIL PASSES - PROPS, SETPIECES (kept as before)
// ═══════════════════════════════════════════════════════════════════════════════
const HAIKU_PROPS_PROMPT = `You are a MASTER PRODUCTION PROPS ANALYST with exhaustive knowledge of film production.

## WHAT IS A PROP

DEFINITION: A prop (property) is any physical object that:
✅ Is manipulated by characters
✅ Is relevant to action or plot
✅ Is specifically mentioned in the screenplay
✅ Has narrative or visual importance

NOT A PROP:
❌ Fixed furniture (walls, doors, windows)
❌ Generic wardrobe elements
❌ Set parts that aren't touched
❌ Vaguely mentioned elements without importance

## PROP CATEGORIES

### A) HAND PROPS (objects characters carry or manipulate)
- Weapons: pistols, knives, rifles, swords
- Phones: mobiles, antique phones, walkie-talkies
- Documents: letters, photos, newspapers, maps, contracts
- Food/drink: glasses, bottles, plates, specific food
- Tools: keys, screwdrivers, hammers
- Personal accessories: watches, jewelry, glasses, bags

### B) SET PROPS (functional scene decoration)
- Specific furniture: antique sofa, office chair
- Decoration: paintings, lamps, plants
- Appliances: TV, radio, computer, landline
- Vehicles: specific cars, motorcycles, bicycles

### C) ACTION/EFFECTS PROPS
- Firearms with firing effects
- Explosives
- Blood/fluids
- Breakaway objects (breakaway glass)

### D) COSTUME PROPS (worn items with importance)
- Specific helmets
- Identifiable uniforms
- Masks
- Insignias/patches

## SPECIFICITY LEVELS

LEVEL 1 - GENERIC (Don't extract if many):
"He picks up a glass" → glass (too generic)

LEVEL 2 - SPECIFIC (Extract):
"He picks up the antique whiskey glass" → antique whiskey glass ✓

LEVEL 3 - UNIQUE/IMPORTANT (ALWAYS extract):
"He holds the One Ring" → The One Ring ✓

PRIORITIZE props that:
- Have proper name or brand
- Are mentioned multiple times
- Have narrative importance
- Require special handling

OUTPUT LANGUAGE: Return descriptions in the requested language. Do NOT translate prop names if they're brand names.

OUTPUT JSON ONLY:

{
  "props_key": [
    { "name": "", "importance": "critical|high|medium", "category": "hand|set|action|costume", "why": "" }
  ],
  "props_production": [
    { "name": "", "department": "art|costume|props|special|transport|sound|other", "category": "hand|set|action|costume", "why": "" }
  ]
}`;

const HAIKU_SETPIECES_PROMPT = `You are a MASTER SETPIECE + PRODUCTION FLAGS ANALYST.

## SETPIECES

Include not only action sequences, also:
- Hearings/trials/interrogations with high dramatic weight
- Scientific tests/demonstrations
- Chases/escapes
- Emotional peaks
- Montages
- Key dramatic confrontations

## PRODUCTION FLAGS

List practical concerns:
- **Stunts**: fire/explosions, weapons, water, heights, falls, fights
- **VFX**: digital effects, green screen, CGI characters/objects
- **Period**: historical accuracy requirements, vintage vehicles, costumes
- **Crowds**: large extras groups, stadium scenes, protests
- **Animals**: trained animals, safety considerations
- **Children**: minor actors, restricted hours, supervision
- **Night shoots**: exterior night, lighting requirements
- **Locations**: remote locations, permits, weather-dependent
- **Special equipment**: underwater, aerial, specialized cameras

OUTPUT LANGUAGE: Return descriptions in the requested language. Do NOT translate scene headings.

OUTPUT JSON ONLY:

{
  "setpieces": [
    { "name": "", "type": "action|trial|test|montage|emotional|chase|confrontation|other", "scenes": [], "complexity": "low|medium|high", "why": "" }
  ],
  "production_flags": [
    { "flag": "", "category": "stunts|vfx|period|crowds|animals|children|night|locations|equipment|other", "severity": "low|medium|high", "scenes_affected": [], "why": "" }
  ]
}`;

// ===== SLUGLINE REGEX =====
const SLUGLINE_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?|INTERIOR|EXTERIOR|INTERNO|EXTERNO)\s*[.:\-–—]?\s*(.+?)(?:\s*[.:\-–—]\s*(DAY|NIGHT|DAWN|DUSK|DÍA|NOCHE|AMANECER|ATARDECER|CONTINUOUS|CONTINUA|LATER|MÁS TARDE|MISMO|SAME))?$/i;

function looksLikeCharacterCue(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 50) return false;
  if (/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+(\s*\(.*\))?$/.test(trimmed)) return true;
  return false;
}

function cleanCharacterCue(raw: string): string {
  let name = raw.trim();
  name = name.replace(/\s*(CONT['']?D?\.?|CONTINUED|CONT\.)\s*/gi, '').trim();
  name = name.replace(/\(V\.?O\.?\)|\(O\.?S\.?\)|\(O\.?C\.?\)|\(ON\s?SCREEN\)|\(OFF\)/gi, '').trim();
  name = name.replace(/[()]/g, '').trim();

  const upper = name.toUpperCase();
  const banned = new Set([
    'CUT TO', 'SMASH CUT', 'DISSOLVE TO', 'FADE IN', 'FADE OUT', 'FADE TO BLACK',
    'TITLE', 'SUPER', 'MONTAGE', 'END', 'CONTINUED', 'THE END', 'CREDITS', 'BLACK',
    'FLASHBACK', 'INTERCUT', 'BACK TO', 'MATCH CUT', 'JUMP CUT',
  ]);
  if (banned.has(upper)) return '';
  return name;
}

interface DialogueStats {
  total_lines: number;
  total_words: number;
  by_character: Record<string, { lines: number; words: number }>;
}

interface SceneWithDialogue {
  number: number;
  heading: string;
  location_raw: string;
  location_base: string;
  int_ext: string;
  time: string;
  tags: string[];
  characters_present: string[];
  dialogue_lines: number;
  dialogue_words: number;
}

interface ExtractionResult {
  scenes: SceneWithDialogue[];
  dialogues: DialogueStats;
}

function extractScenesFromScript(text: string): ExtractionResult {
  const lines = text.split('\n');
  const scenes: SceneWithDialogue[] = [];
  let currentScene: SceneWithDialogue | null = null;
  let sceneNumber = 0;
  
  // Dialogue tracking
  const dialogueByCharacter: Record<string, { lines: number; words: number }> = {};
  let totalDialogueLines = 0;
  let totalDialogueWords = 0;
  
  // State for dialogue detection
  let currentSpeaker: string | null = null;
  let inDialogue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const rawLine = lines[i];
    const match = SLUGLINE_RE.exec(line);

    if (match) {
      // New scene - save current and reset
      if (currentScene) scenes.push(currentScene);
      sceneNumber++;
      const locationRaw = match[2]?.trim() || 'UNKNOWN';
      const intExt = match[1].toUpperCase().replace('.', '').replace('-', '');
      const time = match[3]?.toUpperCase() || '';
      
      const locationBase = locationRaw
        .replace(/\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|DÍA|NOCHE|LATER|CONTINUOUS|SAME|MOMENTS LATER|B&W|COLOR).*$/i, '')
        .trim();
      
      currentScene = {
        number: sceneNumber,
        heading: line,
        location_raw: locationRaw,
        location_base: locationBase,
        int_ext: intExt,
        time: time,
        tags: [],
        characters_present: [],
        dialogue_lines: 0,
        dialogue_words: 0,
      };
      currentSpeaker = null;
      inDialogue = false;
    } else if (currentScene && looksLikeCharacterCue(line)) {
      // Character cue - start of dialogue
      const charName = cleanCharacterCue(line);
      if (charName) {
        if (!currentScene.characters_present.includes(charName)) {
          currentScene.characters_present.push(charName);
        }
        currentSpeaker = charName;
        inDialogue = true;
        // Initialize character dialogue stats
        if (!dialogueByCharacter[charName]) {
          dialogueByCharacter[charName] = { lines: 0, words: 0 };
        }
      }
    } else if (currentScene && currentSpeaker && inDialogue && line.length > 0) {
      // Check if this looks like dialogue text (indented or follows character cue)
      // Dialogue is typically indented or lowercase/mixed case (not all caps action)
      const isLikelyDialogue = 
        rawLine.startsWith('  ') || // Indented
        rawLine.startsWith('\t') || // Tab indented
        (!/^[A-Z\s]+$/.test(line) && !SLUGLINE_RE.test(line)); // Not all caps and not a slugline
      
      // Exclude parentheticals (stage directions)
      const isParenthetical = /^\(.*\)$/.test(line);
      
      if (isLikelyDialogue && !isParenthetical) {
        const wordCount = line.split(/\s+/).filter(w => w.length > 0).length;
        
        // Update scene stats
        currentScene.dialogue_lines++;
        currentScene.dialogue_words += wordCount;
        
        // Update character stats
        dialogueByCharacter[currentSpeaker].lines++;
        dialogueByCharacter[currentSpeaker].words += wordCount;
        
        // Update totals
        totalDialogueLines++;
        totalDialogueWords += wordCount;
      }
      
      // Empty line or action line ends dialogue block
      if (line.length === 0 || /^[A-Z][A-Z\s]+[a-z]/.test(line)) {
        inDialogue = false;
      }
    } else if (line.length === 0) {
      // Empty line - reset dialogue state
      inDialogue = false;
    }
  }
  
  if (currentScene) scenes.push(currentScene);
  
  console.log('[extractScenesFromScript] Dialogue stats:', {
    total_lines: totalDialogueLines,
    total_words: totalDialogueWords,
    characters_with_dialogue: Object.keys(dialogueByCharacter).length,
  });
  
  return {
    scenes,
    dialogues: {
      total_lines: totalDialogueLines,
      total_words: totalDialogueWords,
      by_character: dialogueByCharacter,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC CHARACTER CLASSIFIER - UNIVERSAL VERSION
// Works for ANY screenplay without hardcoded name lists
// Applies universal screenplay format rules
// ═══════════════════════════════════════════════════════════════════════════════

export type CharBuckets = {
  cast: string[];
  featured_extras_with_lines: string[];
  voices_and_functional: string[];
  discarded: string[];
  debug?: Record<string, any>;
};

// ═══════════════════════════════════════════════════════════════════════════════
// POST-PROCESSOR SEMÁNTICO V1 - NORMALIZACIÓN ESTRUCTURADA
// 1. Normalizador de Personajes: Colapsa variantes técnicas
// 2. Normalizador de Localizaciones: Separa lugar/tiempo/estado/técnica
// 3. Clasificador Narrativo: Distingue cast principal de extras funcionales
// ═══════════════════════════════════════════════════════════════════════════════

// === 1. CHARACTER NORMALIZER ===
// Collapses technical variants: MAVERICK (CONT'D), MAVERICK (V.O.) → MAVERICK

interface NormalizedCharacter {
  canonical_name: string;
  aliases: string[];
  type: 'main' | 'supporting' | 'featured_extra' | 'voice';
  bio: string;
  scenes_count: number;
  confidence: 'high' | 'medium';
  narrative_weight: 'protagonist' | 'major' | 'minor' | 'functional';
}

const TECHNICAL_SUFFIXES_REGEX = /\s*\((CONT'?D?\.?|CONTINUED|V\.?O\.?|O\.?S\.?|O\.?C\.?|ON\s*RADIO|ON\s*SCREEN|ON\s*PHONE|OVER\s*RADIO|ALT|PRE-?LAP|INTERCOM|FILTERED|ECHO|WHISPERS?|YELLS?|SHOUTS?|SCREAMS?|QUIETLY|ANGRILY|NERVOUSLY|LAUGHING|CRYING)\)\s*$/gi;

function normalizeCharacterName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') return '';
  
  let name = rawName.trim().toUpperCase();
  
  // Remove technical suffixes repeatedly until clean
  let prevName = '';
  while (prevName !== name) {
    prevName = name;
    name = name.replace(TECHNICAL_SUFFIXES_REGEX, '').trim();
  }
  
  // Remove trailing parentheticals that are empty or numeric
  name = name.replace(/\s*\(\s*\)\s*$/, '').trim();
  name = name.replace(/\s*\(\s*#?\d+\s*\)\s*$/, '').trim();
  
  // Clean multiple spaces
  name = name.replace(/\s+/g, ' ').trim();
  
  return name;
}

function collapseCharacterVariants(characters: any[]): NormalizedCharacter[] {
  const canonicalMap = new Map<string, NormalizedCharacter>();
  
  for (const char of characters) {
    const rawName = char.canonical_name || char.name || '';
    const normalized = normalizeCharacterName(rawName);
    if (!normalized) continue;
    
    // Check existing canonical names for this normalized form
    const existing = canonicalMap.get(normalized);
    
    if (existing) {
      // Merge aliases
      const rawAliases = char.aliases || [];
      for (const alias of rawAliases) {
        const normAlias = normalizeCharacterName(alias);
        if (normAlias && !existing.aliases.includes(normAlias) && normAlias !== normalized) {
          existing.aliases.push(normAlias);
        }
      }
      // Keep higher scenes_count
      existing.scenes_count = Math.max(existing.scenes_count, char.scenes_count || 0);
      // Keep better type (main > supporting > featured_extra > voice)
      const typeRank = { main: 4, supporting: 3, featured_extra: 2, voice: 1 };
      if ((typeRank[char.type as keyof typeof typeRank] || 0) > (typeRank[existing.type] || 0)) {
        existing.type = char.type;
      }
    } else {
      // New canonical entry
      const aliases = (char.aliases || [])
        .map((a: string) => normalizeCharacterName(a))
        .filter((a: string) => a && a !== normalized);
      
      canonicalMap.set(normalized, {
        canonical_name: normalized,
        aliases: aliases,
        type: char.type || 'supporting',
        bio: char.bio || '',
        scenes_count: char.scenes_count || 0,
        confidence: char.confidence || 'high',
        narrative_weight: 'minor',
      });
    }
  }
  
  return Array.from(canonicalMap.values());
}

// === 2. LOCATION NORMALIZER ===
// Separates: lugar base, contexto temporal, estado técnico, metadata de guion

interface NormalizedLocation {
  base_name: string;              // "MAVERICK'S HOUSE"
  sub_location?: string;          // "KITCHEN", "BEDROOM"
  time_of_day?: string;           // "DAY", "NIGHT", "DAWN"
  temporal_context?: string;      // "CONTINUOUS", "LATER", "MOMENTS LATER"
  technical_state?: string;       // "LEVEL FLIGHT", "POP-UP", "INTERCUT"
  type: 'interior' | 'exterior' | 'both';
  scenes_count: number;
  raw_variants: string[];
}

const TIME_PATTERNS = /\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|AFTERNOON|EVENING|SUNRISE|SUNSET|DÍA|NOCHE|AMANECER|ATARDECER|CONTINUOUS|CONTINUA|LATER|MOMENTS?\s*LATER|MÁS\s*TARDE|SAME|MISMO|B&W|COLOR)\s*$/i;
const SUB_LOCATION_PATTERN = /\s*[-–—]\s*(KITCHEN|BEDROOM|LIVING\s*ROOM|BATHROOM|HALLWAY|OFFICE|LOBBY|COCKPIT|BRIDGE|DECK|INTERIOR|EXTERIOR|BACK\s*SEAT|FRONT\s*SEAT)\s*/i;
const TECHNICAL_STATE_PATTERN = /\s*\[([^\]]+)\]\s*/g;
const INTERCUT_PATTERN = /\s*[-–—]?\s*\(?INTERCUT\)?\s*/i;
const SORTIE_PATTERN = /\s*[-–—]\s*SORTIE\s*#?\d+/i;

function normalizeLocationName(rawLocation: string): NormalizedLocation {
  if (!rawLocation || typeof rawLocation !== 'string') {
    return { base_name: 'UNKNOWN', type: 'interior', scenes_count: 0, raw_variants: [] };
  }
  
  let loc = rawLocation.trim().toUpperCase();
  let timeOfDay: string | undefined;
  let temporalContext: string | undefined;
  let technicalState: string | undefined;
  let subLocation: string | undefined;
  
  // Extract time of day
  const timeMatch = loc.match(TIME_PATTERNS);
  if (timeMatch) {
    const extracted = timeMatch[1].toUpperCase();
    if (['DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'AFTERNOON', 'EVENING', 'SUNRISE', 'SUNSET', 'DÍA', 'NOCHE', 'AMANECER', 'ATARDECER'].includes(extracted)) {
      timeOfDay = extracted;
    } else {
      temporalContext = extracted;
    }
    loc = loc.replace(TIME_PATTERNS, '').trim();
  }
  
  // Extract technical state [LEVEL FLIGHT], [POP UP], etc.
  const technicalMatches: string[] = [];
  loc = loc.replace(TECHNICAL_STATE_PATTERN, (_, state) => {
    technicalMatches.push(state.trim());
    return ' ';
  }).trim();
  if (technicalMatches.length > 0) {
    technicalState = technicalMatches.join(', ');
  }
  
  // Extract INTERCUT
  if (INTERCUT_PATTERN.test(loc)) {
    technicalState = technicalState ? `${technicalState}, INTERCUT` : 'INTERCUT';
    loc = loc.replace(INTERCUT_PATTERN, '').trim();
  }
  
  // Extract SORTIE numbers
  loc = loc.replace(SORTIE_PATTERN, '').trim();
  
  // Extract sub-location
  const subMatch = loc.match(SUB_LOCATION_PATTERN);
  if (subMatch) {
    subLocation = subMatch[1].trim();
    loc = loc.replace(SUB_LOCATION_PATTERN, '').trim();
  }
  
  // Clean trailing dashes
  loc = loc.replace(/\s*[-–—]\s*$/, '').trim();
  
  // Determine type
  let type: 'interior' | 'exterior' | 'both' = 'interior';
  if (loc.startsWith('EXT')) type = 'exterior';
  else if (loc.startsWith('INT/EXT') || loc.startsWith('I/E')) type = 'both';
  
  // Remove INT./EXT. prefix from base_name
  const baseName = loc
    .replace(/^(INT\.?\/EXT\.?|I\/E\.?|INT\.?|EXT\.?)\s*[-–—.]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'UNKNOWN';
  
  return {
    base_name: baseName,
    sub_location: subLocation,
    time_of_day: timeOfDay,
    temporal_context: temporalContext,
    technical_state: technicalState,
    type,
    scenes_count: 0,
    raw_variants: [rawLocation],
  };
}

function collapseLocationVariants(scenes: any[]): NormalizedLocation[] {
  const locationMap = new Map<string, NormalizedLocation>();
  
  for (const scene of scenes) {
    const rawHeading = scene.heading || scene.location_raw || '';
    const normalized = normalizeLocationName(rawHeading);
    
    const key = normalized.base_name;
    const existing = locationMap.get(key);
    
    if (existing) {
      existing.scenes_count++;
      if (!existing.raw_variants.includes(rawHeading)) {
        existing.raw_variants.push(rawHeading);
      }
      // Merge sub-locations
      if (normalized.sub_location && !existing.sub_location) {
        existing.sub_location = normalized.sub_location;
      }
      // Update type if both found
      if (normalized.type !== existing.type && normalized.type !== 'both') {
        existing.type = 'both';
      }
    } else {
      normalized.scenes_count = 1;
      locationMap.set(key, normalized);
    }
  }
  
  return Array.from(locationMap.values())
    .sort((a, b) => b.scenes_count - a.scenes_count);
}

// === 3. NARRATIVE CLASSIFIER ===
// Determines narrative weight based on scene appearances and role patterns

interface NarrativeClassification {
  protagonists: NormalizedCharacter[];        // Main characters, drive the plot
  major_supporting: NormalizedCharacter[];    // Significant recurring roles
  minor_speaking: NormalizedCharacter[];      // Featured extras with lines
  functional_roles: NormalizedCharacter[];    // AIDE, OFFICER, WAITRESS type roles
  voices_systems: NormalizedCharacter[];      // TOWER, RADIO, COMMS
}

const FUNCTIONAL_ROLE_PATTERNS = [
  /\b(AIDE|ASSISTANT|ATTENDANT|GUARD|OFFICER|SOLDIER|PILOT\s*#?\d*|SAILOR|MARINE)\b/i,
  /\b(WAITRESS|WAITER|BARTENDER|SERVER|HOSTESS|CLERK|RECEPTIONIST)\b/i,
  /\b(DOCTOR|NURSE|MEDIC|PARAMEDIC|EMT)\b/i,
  /\b(COP|POLICE|DETECTIVE|AGENT|FBI|CIA)\b/i,
  /\b(DRIVER|CABBIE|TAXI)\b/i,
  /\b(TECHNICIAN|OPERATOR|CONTROLLER|ANNOUNCER)\b/i,
  /\b(MAN|WOMAN|PERSON|KID|CHILD|BOY|GIRL)\s*(#?\d+|IN\s|AT\s|WITH\s)/i,
  /\b(CROWD|GROUP|TEAM|CREW)\s*MEMBER/i,
];

const VOICE_SYSTEM_PATTERNS = [
  /\b(TOWER|CONTROL|RADIO|COMMS?|INTERCOM|SPEAKER|PA|ANNOUNCEMENT)\b/i,
  /\b(COMPUTER|SYSTEM|AI|VOICE|AUTOMATED)\b/i,
  /\b(NARRATOR|NEWSCASTER|ANCHOR|REPORTER)\s*\(V\.?O\.?\)/i,
];

function classifyNarrativeWeight(characters: NormalizedCharacter[], totalScenes: number): NarrativeClassification {
  const protagonists: NormalizedCharacter[] = [];
  const majorSupporting: NormalizedCharacter[] = [];
  const minorSpeaking: NormalizedCharacter[] = [];
  const functionalRoles: NormalizedCharacter[] = [];
  const voicesSystems: NormalizedCharacter[] = [];
  
  // Calculate thresholds based on total scenes
  const protagonistThreshold = Math.max(totalScenes * 0.15, 10);  // >15% of scenes or 10+
  const majorThreshold = Math.max(totalScenes * 0.05, 3);        // >5% of scenes or 3+
  
  for (const char of characters) {
    const name = char.canonical_name;
    const scenes = char.scenes_count;
    
    // Check for voice/system patterns first
    if (char.type === 'voice' || VOICE_SYSTEM_PATTERNS.some(p => p.test(name))) {
      char.narrative_weight = 'functional';
      voicesSystems.push(char);
      continue;
    }
    
    // Check for functional role patterns
    if (FUNCTIONAL_ROLE_PATTERNS.some(p => p.test(name))) {
      char.narrative_weight = 'functional';
      functionalRoles.push(char);
      continue;
    }
    
    // Classify by scene count and declared type
    if (char.type === 'main' || scenes >= protagonistThreshold) {
      char.narrative_weight = 'protagonist';
      protagonists.push(char);
    } else if (char.type === 'supporting' || scenes >= majorThreshold) {
      char.narrative_weight = 'major';
      majorSupporting.push(char);
    } else if (char.type === 'featured_extra' || scenes >= 1) {
      char.narrative_weight = 'minor';
      minorSpeaking.push(char);
    } else {
      char.narrative_weight = 'functional';
      functionalRoles.push(char);
    }
  }
  
  console.log('[classifyNarrativeWeight] Results:', {
    protagonists: protagonists.length,
    major: majorSupporting.length,
    minor: minorSpeaking.length,
    functional: functionalRoles.length,
    voices: voicesSystems.length,
    thresholds: { protagonist: protagonistThreshold, major: majorThreshold },
  });
  
  return {
    protagonists,
    major_supporting: majorSupporting,
    minor_speaking: minorSpeaking,
    functional_roles: functionalRoles,
    voices_systems: voicesSystems,
  };
}

// === UNIFIED POST-PROCESSOR ===

interface PostProcessorResult {
  characters: {
    cast: NormalizedCharacter[];
    featured_extras_with_lines: NormalizedCharacter[];
    voices_and_functional: NormalizedCharacter[];
    narrative_classification: NarrativeClassification;
    _collapsed_count: number;
    _original_count: number;
  };
  locations: {
    base: NormalizedLocation[];
    _collapsed_count: number;
    _original_count: number;
  };
  scenes: any[];
}

function runSemanticPostProcessor(
  rawCharacters: any[],
  rawScenes: any[],
  rawLocations: any[]
): PostProcessorResult {
  console.log('[PostProcessor] Starting semantic normalization...');
  console.log('[PostProcessor] Input:', {
    characters: rawCharacters.length,
    scenes: rawScenes.length,
    locations: rawLocations.length,
  });
  
  // 1. Normalize and collapse character variants
  const collapsedCharacters = collapseCharacterVariants(rawCharacters);
  
  // 2. Update scene counts from regex scenes
  const charAppearances = new Map<string, number>();
  for (const scene of rawScenes) {
    const chars = scene.characters_present || [];
    for (const charName of chars) {
      const normalized = normalizeCharacterName(charName);
      if (normalized) {
        charAppearances.set(normalized, (charAppearances.get(normalized) || 0) + 1);
      }
    }
  }
  
  // Update scenes_count for each character
  for (const char of collapsedCharacters) {
    char.scenes_count = charAppearances.get(char.canonical_name) || 0;
    // Also check aliases
    for (const alias of char.aliases) {
      char.scenes_count += charAppearances.get(alias) || 0;
    }
  }
  
  // 3. Classify by narrative weight
  const narrativeClassification = classifyNarrativeWeight(collapsedCharacters, rawScenes.length);
  
  // 4. Normalize and collapse locations
  const collapsedLocations = collapseLocationVariants(rawScenes);
  
  // 5. Build final character buckets
  const cast = [
    ...narrativeClassification.protagonists,
    ...narrativeClassification.major_supporting,
  ].sort((a, b) => b.scenes_count - a.scenes_count);
  
  const featuredExtras = narrativeClassification.minor_speaking
    .filter(c => c.scenes_count >= 1)
    .sort((a, b) => b.scenes_count - a.scenes_count);
  
  const voicesAndFunctional = [
    ...narrativeClassification.voices_systems,
    ...narrativeClassification.functional_roles,
  ];
  
  console.log('[PostProcessor] Output:', {
    cast: cast.length,
    extras: featuredExtras.length,
    voices: voicesAndFunctional.length,
    locations: collapsedLocations.length,
    collapsedCharacters: rawCharacters.length - collapsedCharacters.length,
    collapsedLocations: rawLocations.length - collapsedLocations.length,
  });
  
  return {
    characters: {
      cast,
      featured_extras_with_lines: featuredExtras,
      voices_and_functional: voicesAndFunctional,
      narrative_classification: narrativeClassification,
      _collapsed_count: rawCharacters.length - collapsedCharacters.length,
      _original_count: rawCharacters.length,
    },
    locations: {
      base: collapsedLocations,
      _collapsed_count: rawLocations.length - collapsedLocations.length,
      _original_count: rawLocations.length,
    },
    scenes: rawScenes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCENE-CHARACTER POPULATION SYSTEM
// Builds alias→canonical and canonical→id maps, populates scene characters
// ═══════════════════════════════════════════════════════════════════════════════

interface CharacterMapping {
  aliasToCanonical: Map<string, string>;  // "PETE" → "MAVERICK"
  canonicalToId: Map<string, string>;     // "MAVERICK" → "uuid"
  allCanonicals: Set<string>;
}

interface SceneWithCharacters {
  number: number;
  heading: string;
  characters_present: string[];
  character_ids: string[];
  [key: string]: any;
}

/**
 * Builds mappings from alias→canonical and canonical→id
 * Uses Sonnet semantic analysis for alias resolution
 */
function buildCharacterMappings(
  semanticCharacters: Record<string, { aliases?: string[]; role?: string }> | null,
  castList: Array<{ name: string; aliases?: string[]; id?: string }>,
  extrasList: Array<{ name: string; id?: string }>,
  voicesList: Array<{ name: string; id?: string }>
): CharacterMapping {
  const aliasToCanonical = new Map<string, string>();
  const canonicalToId = new Map<string, string>();
  const allCanonicals = new Set<string>();
  
  // 1) From Sonnet semantic analysis (best source for aliases)
  if (semanticCharacters && typeof semanticCharacters === 'object') {
    for (const [canonical, data] of Object.entries(semanticCharacters)) {
      const canonUpper = canonical.toUpperCase().trim();
      if (!canonUpper) continue;
      
      allCanonicals.add(canonUpper);
      aliasToCanonical.set(canonUpper, canonUpper);
      
      // Map aliases
      const aliases = data.aliases || [];
      for (const alias of aliases) {
        const aliasUpper = String(alias).toUpperCase().trim();
        if (aliasUpper && aliasUpper !== canonUpper) {
          aliasToCanonical.set(aliasUpper, canonUpper);
        }
      }
    }
  }
  
  // 2) From cast list (may have IDs)
  for (const char of castList) {
    const canonUpper = char.name.toUpperCase().trim();
    if (!canonUpper) continue;
    
    allCanonicals.add(canonUpper);
    aliasToCanonical.set(canonUpper, canonUpper);
    
    if (char.id) {
      canonicalToId.set(canonUpper, char.id);
    }
    
    // Handle aliases from Haiku
    const aliases = char.aliases || [];
    for (const alias of aliases) {
      const aliasUpper = String(alias).toUpperCase().trim();
      if (aliasUpper && aliasUpper !== canonUpper) {
        aliasToCanonical.set(aliasUpper, canonUpper);
      }
    }
  }
  
  // 3) From extras and voices (also valid character entities)
  for (const char of extrasList) {
    const canonUpper = char.name.toUpperCase().trim();
    if (canonUpper) {
      allCanonicals.add(canonUpper);
      aliasToCanonical.set(canonUpper, canonUpper);
      if (char.id) canonicalToId.set(canonUpper, char.id);
    }
  }
  
  for (const char of voicesList) {
    const canonUpper = char.name.toUpperCase().trim();
    if (canonUpper) {
      allCanonicals.add(canonUpper);
      aliasToCanonical.set(canonUpper, canonUpper);
      if (char.id) canonicalToId.set(canonUpper, char.id);
    }
  }
  
  console.log('[buildCharacterMappings] Built mappings:', {
    aliasCount: aliasToCanonical.size,
    canonicalCount: allCanonicals.size,
    withIds: canonicalToId.size,
  });
  
  return { aliasToCanonical, canonicalToId, allCanonicals };
}

/**
 * Resolves a raw speaker name to its canonical form
 */
function resolveToCanonical(rawName: string, mapping: CharacterMapping): string | null {
  const upper = stripTechnicalSuffixes(rawName).toUpperCase().trim();
  if (!upper) return null;
  
  // Direct match
  if (mapping.aliasToCanonical.has(upper)) {
    return mapping.aliasToCanonical.get(upper)!;
  }
  
  // Try without possessive/suffix
  const cleaned = upper.replace(/'S$/, '').replace(/S$/, '').trim();
  if (cleaned !== upper && mapping.aliasToCanonical.has(cleaned)) {
    return mapping.aliasToCanonical.get(cleaned)!;
  }
  
  // Fuzzy: check if any word matches a canonical
  const words = upper.split(/\s+/);
  for (const word of words) {
    if (mapping.allCanonicals.has(word)) {
      return word;
    }
    if (mapping.aliasToCanonical.has(word)) {
      return mapping.aliasToCanonical.get(word)!;
    }
  }
  
  return null;
}

/**
 * Populates characters_present and character_ids for each scene
 * Uses regex scenes extracted from script text
 */
function populateSceneCharacters(
  regexScenes: Array<{ number: number; heading: string; characters_present: string[]; [key: string]: any }>,
  mapping: CharacterMapping
): SceneWithCharacters[] {
  console.log('[populateSceneCharacters] Processing', regexScenes.length, 'scenes');
  
  const result: SceneWithCharacters[] = [];
  
  for (const scene of regexScenes) {
    const rawChars = scene.characters_present || [];
    const resolvedCanonicals = new Set<string>();
    const resolvedIds: string[] = [];
    
    for (const rawChar of rawChars) {
      const canonical = resolveToCanonical(rawChar, mapping);
      if (canonical && !resolvedCanonicals.has(canonical)) {
        resolvedCanonicals.add(canonical);
        
        // Get ID if available
        const charId = mapping.canonicalToId.get(canonical);
        if (charId) {
          resolvedIds.push(charId);
        }
      }
    }
    
    result.push({
      ...scene,
      characters_present: Array.from(resolvedCanonicals),
      character_ids: resolvedIds,
    });
  }
  
  console.log('[populateSceneCharacters] Sample scene characters:', 
    result.slice(0, 3).map(s => ({ scene: s.number, chars: s.characters_present.slice(0, 5) }))
  );
  
  return result;
}

/**
 * Counts character appearances across all scenes
 * Returns map of canonical_name → appearance_count
 */
function countCharacterAppearances(scenes: SceneWithCharacters[]): Map<string, number> {
  const counts = new Map<string, number>();
  
  for (const scene of scenes) {
    for (const char of scene.characters_present) {
      counts.set(char, (counts.get(char) || 0) + 1);
    }
  }
  
  return counts;
}

/**
 * Prunes cast to only characters appearing in ≥ minAppearances scenes
 * Moves "ghosts" (appearing in <2 scenes) to discarded or extras
 */
function pruneGhostCharacters(
  castList: Array<{ name: string; [key: string]: any }>,
  appearanceCounts: Map<string, number>,
  minAppearances: number = 2
): {
  kept: Array<{ name: string; scenes_count: number; [key: string]: any }>;
  pruned: Array<{ name: string; scenes_count: number; reason: string }>;
} {
  const kept: Array<{ name: string; scenes_count: number; [key: string]: any }> = [];
  const pruned: Array<{ name: string; scenes_count: number; reason: string }> = [];
  
  for (const char of castList) {
    const upper = char.name.toUpperCase().trim();
    const count = appearanceCounts.get(upper) || 0;
    
    if (count >= minAppearances) {
      kept.push({ ...char, scenes_count: count });
    } else {
      pruned.push({ 
        name: char.name, 
        scenes_count: count,
        reason: count === 0 
          ? 'No scene appearances detected' 
          : `Only ${count} scene appearance${count > 1 ? 's' : ''} (min: ${minAppearances})`
      });
    }
  }
  
  console.log('[pruneGhostCharacters] Results:', {
    kept: kept.length,
    pruned: pruned.length,
    prunedSamples: pruned.slice(0, 10).map(p => `${p.name} (${p.scenes_count})`),
  });
  
  return { kept, pruned };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: UNIVERSAL LINGUISTIC PATTERN DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detects if a word is a common descriptive adjective in English
 * These are NOT character names - they're parenthetical directions
 */
function isCommonAdjective(word: string): boolean {
  const word_lower = word.toLowerCase();
  
  // Emotions and states
  const emotions = [
    'angry', 'happy', 'sad', 'nervous', 'calm', 'anxious', 'excited',
    'tired', 'drunk', 'crying', 'laughing', 'screaming', 'whispering',
    'shouting', 'yelling', 'scared', 'terrified', 'annoyed', 'frustrated',
    'confused', 'surprised', 'shocked', 'worried', 'relieved', 'grateful'
  ];
  
  // Characteristics
  const characteristics = [
    'young', 'old', 'tall', 'short', 'thin', 'heavy', 'strong', 'weak',
    'quiet', 'loud', 'smart', 'dumb', 'wise', 'foolish', 'brave', 'coward'
  ];
  
  // Descriptive states
  const states = [
    'jaded', 'meek', 'bold', 'shy', 'proud', 'humble', 'eager', 'reluctant',
    'determined', 'hesitant', 'confident', 'insecure', 'bitter', 'sweet'
  ];
  
  // Genealogical suffixes (not adjectives but similar problem)
  const suffixes = ['senior', 'junior', 'jr', 'sr', 'iii', 'iv', 'ii'];
  
  return emotions.includes(word_lower) || 
         characteristics.includes(word_lower) || 
         states.includes(word_lower) ||
         suffixes.includes(word_lower);
}

/**
 * Detects if a word is likely a proper name
 * Based on linguistic patterns, not hardcoded lists
 * CRITICAL: Must FIRST filter out technical terms and stopwords
 */
function isProbablyProperName(word: string): boolean {
  // Must be in full caps in screenplays
  if (!/^[A-Z]+$/.test(word)) return false;
  
  // Too short (codes or initials)
  if (word.length < 2) return false;
  
  // Too long (probably description or error)
  if (word.length > 15) return false;
  
  // CRITICAL: Block technical terms FIRST
  if (isTechnicalTerm(word)) return false;
  
  // Block common Spanish/English stopwords
  const stopwords = new Set([
    'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'UN', 'UNA', 'UNOS', 'UNAS',
    'EN', 'CON', 'POR', 'PARA', 'SIN', 'SOBRE', 'BAJO', 'ENTRE',
    'THE', 'A', 'AN', 'OF', 'AT', 'BY', 'FOR', 'AS', 'IS', 'ARE', 'WAS', 'WERE',
    'PRUEBAS', 'PRUEBA', 'TEST', 'TESTING', 'TESTS',
    'AND', 'OR', 'BUT', 'NOT', 'NO', 'SI', 'YES',
    'QUE', 'QUIEN', 'CUAL', 'COMO', 'DONDE', 'CUANDO',
    'MAS', 'MENOS', 'MUCHO', 'POCO', 'TODO', 'NADA',
    'ESTE', 'ESTA', 'ESTO', 'ESE', 'ESA', 'ESO', 'AQUEL', 'AQUELLA'
  ]);
  if (stopwords.has(word)) return false;
  
  // Block common adjectives used as character modifiers
  if (isCommonAdjective(word)) return false;
  
  // Common English name start patterns
  // - Start with consonant followed by vowel: JOHN, MARY, PETER
  // - Or common patterns: TH-, CH-, SH-, BR-, TR-
  const commonStarts = /^(TH|CH|SH|BR|TR|CR|DR|FR|GR|PR|ST|SC|SL|SM|SN|SP|SW|PH|WH)/;
  if (commonStarts.test(word)) return true;
  
  // Has name structure (alternating consonant-vowel roughly)
  const hasVowels = /[AEIOUY]/.test(word);
  const hasConsonants = /[BCDFGHJKLMNPQRSTVWXZ]/.test(word);
  
  return hasVowels && hasConsonants;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATCH v21: SURGICAL SUFFIX STRIPPING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Strips technical suffixes from names BEFORE any other processing
 * Handles: PRE-LAP, PRE LAP, PRELAP, CONT'D, CONTD, VO, OS, etc.
 */
function stripTechnicalSuffixes(name: string): string {
  let s = name.trim();

  // Normalize spaces and dashes
  s = s.replace(/\s+/g, " ");
  s = s.replace(/[–—]/g, "-"); // Long dashes to hyphen

  // Remove quotes that might wrap the name
  s = s.replace(/^'+|'+$/g, "").trim();

  // Technical suffixes at end of name
  // Supports: PRE-LAP, PRELAP, PRE LAP, CONT'D, CONTD, CONT, V.O., O.S., O.C.
  const suffixRegex =
    /\s+(PRE[-\s]*LAP|POST[-\s]*LAP|CONT['']?\s*D|CONTD|CONT|V\.?O\.?|O\.?S\.?|O\.?C\.?)\s*$/i;

  s = s.replace(suffixRegex, "").trim();

  return s;
}

/**
 * Detects if a word is a screenplay technical term
 * Now also checks normalized (no space/hyphen) version
 */
function isTechnicalTerm(word: string): boolean {
  // Comprehensive list of technical terms, common words, and aviation/military terms
  // that should NEVER be treated as character names
  const technical = new Set([
    // Screenplay technical terms
    'CONT', 'CONTD', 'CONTINUED', 'VO', 'OS', 'OC', 'OOV',
    'PRE', 'LAP', 'PRELAP', 'POSTLAP', 'FILTERED', 'RADIO', 'PHONE',
    'WHISPER', 'SHOUT', 'YELL', 'TO', 'FROM', 'BEAT',
    'PAUSE', 'THEN', 'SUBTITLE', 'SINGING', 'READING',
    'D', 'V0', 'ALT', 'ALTS', 'CUT', 'FADE',
    'DISSOLVE', 'INTERCUT', 'MONTAGE', 'FLASHBACK', 'SERIES',
    'END', 'BEGINNING', 'LATER', 'CONTINUOUS', 'SAME', 'DAY', 'NIGHT',
    'MORNING', 'EVENING', 'DAWN', 'DUSK', 'ANGLE', 'POV', 'INSERT',
    'CLOSE', 'WIDE', 'MEDIUM', 'ESTABLISHING', 'TRACKING', 'DOLLY',
    'PAN', 'TILT', 'ZOOM', 'CRANE', 'STEADICAM', 'HANDHELD',
    
    // Common verbs/actions that slip through as "names"
    'BREAKING', 'BREAKS', 'BREAK', 'RUNNING', 'RUNS', 'RUN',
    'WALKING', 'WALKS', 'WALK', 'TURNING', 'TURNS', 'TURN',
    'LOOKING', 'LOOKS', 'LOOK', 'COMING', 'COMES', 'COME',
    'GOING', 'GOES', 'GO', 'MOVING', 'MOVES', 'MOVE',
    'FALLING', 'FALLS', 'FALL', 'JUMPING', 'JUMPS', 'JUMP',
    'FLYING', 'FLIES', 'FLY', 'DIVING', 'DIVES', 'DIVE',
    'CLIMBING', 'CLIMBS', 'CLIMB', 'DROPPING', 'DROPS', 'DROP',
    'PULLING', 'PULLS', 'PULL', 'PUSHING', 'PUSHES', 'PUSH',
    'STOPPING', 'STOPS', 'STOP', 'STARTING', 'STARTS', 'START',
    'ENTERING', 'ENTERS', 'ENTER', 'EXITING', 'EXITS', 'EXIT',
    'OPENING', 'OPENS', 'OPEN', 'CLOSING', 'CLOSES', 'CLOSE',
    'EJECT', 'EJECTS', 'EJECTING', 'IMPACT', 'IMPACTS',
    'WHISPERS', 'SHOUTS', 'YELLS', 'SCREAMS', 'SCREAM',
    
    // Dialogue fragments / contractions
    'THEYRE', 'THEYLL', 'THEYVE', 'DONT', 'DOESNT', 'DIDNT',
    'WONT', 'WOULDNT', 'COULDNT', 'SHOULDNT', 'CANT', 'ISNT',
    'WASNT', 'WERENT', 'HAVENT', 'HASNT', 'HADNT', 'ARENT',
    'YOURE', 'YOULL', 'YOUVE', 'YOUD', 'IVE', 'ILL', 'ID',
    'WEVE', 'WERE', 'WELL', 'WED', 'HERES', 'THERES', 'WHERES',
    'WHATS', 'WHOS', 'LETS', 'THATS', 'ITS', 'AINT',
    'GONNA', 'GOTTA', 'WANNA', 'KINDA', 'SORTA',
    'YEAH', 'YEP', 'NOPE', 'OKAY', 'SHIT', 'DAMN', 'HELL',
    'HOLY', 'JESUS', 'CHRIST', 'GOD', 'FUCK', 'FUCKING',
    
    // Aviation/Military technical terms
    'FLIGHT', 'LEVEL', 'ALTITUDE', 'SPEED', 'MACH', 'KNOTS',
    'FUEL', 'THRUST', 'AFTERBURNER', 'THROTTLE', 'CONTROL',
    'SURFACES', 'FLAPS', 'GEAR', 'BRAKE', 'CANOPY',
    'MISSILE', 'RADAR', 'LOCK', 'TARGET', 'BOGEY', 'BANDIT',
    'WEAPONS', 'ORDNANCE', 'PAYLOAD', 'SORTIE', 'MISSION',
    'FORMATION', 'WINGMAN', 'LEAD', 'TRAIL', 'ENGAGE',
    'DISENGAGE', 'RTB', 'BINGO', 'WINCHESTER', 'FOX', 'GUNS',
    'SPLASH', 'KILL', 'HIT', 'MISS', 'ABORT', 'WAVE', 'APPROACH',
    'LANDING', 'TAKEOFF', 'TAXI', 'RUNWAY', 'DECK', 'TOWER',
    'CLEARED', 'NEGATIVE', 'AFFIRMATIVE', 'COPY', 'ROGER', 'WILCO',
    'MAYDAY', 'EMERGENCY', 'BAILOUT', 'RESCUE', 'SAR',
    'LSO', 'CAG', 'AIRBOSS', 'HANDLER', 'CATAPULT', 'WIRE',
    'BALL', 'MEATBALL', 'CENTERLINE', 'GLIDESLOPE', 'AOA',
    'HEADING', 'BEARING', 'VECTOR', 'INTERCEPT',
    'ROUTE', 'WAYPOINT', 'CHECKPOINT', 'IP', 'INGRESS', 'EGRESS',
    'ZONE', 'SECTOR', 'AIRSPACE', 'PATTERN', 'CIRCUIT', 'HOLDING',
    'STANDBY', 'NOGO', 'STATUS', 'READY', 'PICTURE', 'TONE',
    'CAPTURED', 'COMANCHE', 'OVERBOARD',
    
    // Colors (often used for teams/codes, not names)
    'RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE', 'WHITE', 'BLACK',
    'GOLD', 'SILVER', 'BROWN', 'PINK', 'GREY', 'GRAY',
    
    // Numbers and codes
    'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF', 'HOTEL',
    'INDIA', 'JULIET', 'KILO', 'LIMA', 'MIKE', 'NOVEMBER', 'OSCAR', 'PAPA',
    'QUEBEC', 'ROMEO', 'SIERRA', 'TANGO', 'UNIFORM', 'VICTOR', 'WHISKEY',
    'XRAY', 'YANKEE', 'ZULU',
    
    // Common words that might appear but aren't names
    'ALL', 'TEAM', 'GROUP', 'UNIT', 'SQUAD', 'CLASS', 'CREW', 'STAFF',
    'EVERYONE', 'SOMEBODY', 'SOMEONE', 'NOBODY', 'ANYONE', 'EVERYBODY',
    'CROWD', 'AUDIENCE', 'PEOPLE', 'OTHERS', 'GUESTS', 'VISITORS',
    'SELF', 'BOTH', 'THEM', 'THEY', 'WE', 'US', 'YOU', 'HE', 'SHE', 'IT',
    'ALARM', 'ALERT', 'WARNING', 'SIREN', 'BELL', 'BUZZER', 'HORN',
    'SYSTEM', 'COMPUTER', 'SCREEN', 'DISPLAY', 'MONITOR', 'PANEL',
    'DOOR', 'WINDOW', 'WALL', 'FLOOR', 'CEILING', 'ROOM', 'HALL',
    'LIGHT', 'DARK', 'SHADOW', 'SOUND', 'NOISE', 'SILENCE', 'MUSIC',
    'VOICE', 'VOICES', 'SPEECH', 'TALK', 'SPEAK', 'SAY', 'SAID',
    'TOP', 'BOTTOM', 'LEFT', 'RIGHT', 'FRONT', 'BACK', 'SIDE',
    'UP', 'DOWN', 'IN', 'OUT', 'ON', 'OFF', 'OVER', 'UNDER',
    'FIRST', 'SECOND', 'THIRD', 'FOURTH', 'FIFTH', 'LAST', 'NEXT',
    'NEW', 'OLD', 'BIG', 'SMALL', 'LONG', 'SHORT', 'HIGH', 'LOW',
    'GOOD', 'BAD', 'BEST', 'WORST', 'MORE', 'LESS', 'MOST', 'LEAST',
    'MAIN', 'OTHER', 'ANOTHER', 'SAME', 'DIFFERENT', 'VARIOUS',
    'ONLY', 'JUST', 'EVEN', 'STILL', 'ALSO', 'TOO', 'VERY', 'MUCH',
    'NOW', 'HERE', 'THERE', 'WHERE', 'WHEN', 'HOW', 'WHY',
    'HIMSELF', 'HERSELF', 'ITSELF', 'THEMSELVES', 'MYSELF', 'YOURSELF',
    
    // Script/production terms
    'TITLE', 'CREDIT', 'CREDITS', 'SUPER', 'CHYRON', 'CRAWL',
    'SCENE', 'ACT', 'SEQUENCE', 'SHOT', 'TAKE', 'SETUP',
    'ACTION', 'REACTION', 'MOMENT', 'SILENCE',
    'TRANSITION', 'EFFECT', 'EFFECTS', 'VFX', 'SFX', 'CGI',
    
    // Time references
    'TIME', 'HOUR', 'MINUTE', 'SECOND', 'INSTANT',
    'TODAY', 'TOMORROW', 'YESTERDAY', 'YEAR', 'MONTH', 'WEEK',
    
    // Vehicles/objects (not characters)
    'CAR', 'TRUCK', 'PLANE', 'JET', 'HELICOPTER', 'SHIP', 'BOAT',
    'TRAIN', 'BUS', 'BIKE', 'MOTORCYCLE', 'VEHICLE', 'AIRCRAFT',
    
    // Body parts / exclamations often misread
    'MOM', 'DAD', 'JIBE', 'HO',
  ]);
  
  const upper = word.toUpperCase();
  // Check direct match AND normalized version (without spaces/hyphens)
  const normalized = upper.replace(/[\s\-]/g, "");
  return technical.has(upper) || technical.has(normalized);
}

/**
 * Detects if a word is a title (Dr, Captain, etc)
 */
function isTitle(word: string): boolean {
  const titles = [
    'DR', 'DOCTOR', 'MR', 'MRS', 'MS', 'MISS',
    'CAPTAIN', 'LIEUTENANT', 'SERGEANT', 'COLONEL', 'GENERAL',
    'PRIVATE', 'MAJOR', 'ADMIRAL', 'COMMANDER',
    'PROFESSOR', 'PROF', 'REV', 'REVEREND', 'FATHER', 'SISTER',
    'LORD', 'LADY', 'SIR', 'DUKE', 'BARON', 'COUNT',
    'KING', 'QUEEN', 'PRINCE', 'PRINCESS'
  ];
  
  return titles.includes(word.toUpperCase());
}

const CONJUNCTION_WORDS = ['AND', 'WITH', 'OR', 'PLUS', 'TO', 'FROM'];

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: UNIVERSAL CONCATENATION DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detects concatenated names using ONLY structural patterns
 * Does NOT use script-specific name lists
 * 
 * CRITICAL FIX: Two-word names like "PETE MITCHELL" are NORMAL character names.
 * We should NOT split them unless there's strong evidence of concatenation.
 */
function detectConcatenatedNames(name: string): string[] | null {
  // PATCH v21: First strip technical suffixes universally
  const strippedName = stripTechnicalSuffixes(name);
  
  const words = strippedName.split(/\s+/).filter(w => w.length > 0);
  
  // Case 1: Single name → Check if it's a technical term itself
  if (words.length === 1) {
    if (isTechnicalTerm(words[0])) {
      return []; // Discard pure technical terms
    }
    return null;
  }
  
  // Case 2: Two words where second is adjective
  // "JACK JADED" → ["JACK"]
  if (words.length === 2 && isCommonAdjective(words[1])) {
    console.log(`[detectConcat] Removing adjective: ${name} → ${words[0]}`);
    return [words[0]];
  }
  
  // Case 3: Two words where first is adjective (malformed)
  // "JADED JACK" → ["JACK"]
  if (words.length === 2 && isCommonAdjective(words[0])) {
    console.log(`[detectConcat] Removing leading adjective: ${name} → ${words[1]}`);
    return [words[1]];
  }
  
  // Case 4a: Two words where second is technical term
  // "MAVERICK CONTD" → ["MAVERICK"]
  if (words.length === 2 && isTechnicalTerm(words[1])) {
    console.log(`[detectConcat] Removing technical: ${name} → ${words[0]}`);
    return [words[0]];
  }
  
  // Case 4b: Three words where last two form a technical suffix (e.g., PRE LAP)
  if (words.length === 3 && isTechnicalTerm(words[1] + words[2])) {
    console.log(`[detectConcat] Removing technical (2-word suffix): ${name} → ${words[0]}`);
    return [words[0]];
  }
  
  // Case 4c: Two words where second has a hyphen but matches a technical suffix once normalized
  if (words.length === 2) {
    const norm2 = words[1].toUpperCase().replace(/[\s\-]/g, "");
    if (isTechnicalTerm(norm2)) {
      console.log(`[detectConcat] Removing technical (normalized): ${name} → ${words[0]}`);
      return [words[0]];
    }
  }
  
  // Case 5: Two words where first is technical term (malformed)
  // "CONTD MAVERICK" → ["MAVERICK"]
  if (words.length === 2 && isTechnicalTerm(words[0])) {
    console.log(`[detectConcat] Removing leading technical: ${name} → ${words[1]}`);
    return [words[1]];
  }
  
  // Case 6: Two-word name with title → KEEP AS IS (compound name)
  // "DR SMITH", "CAPTAIN MILLER" → null (keep "DR SMITH")
  if (words.length === 2 && isTitle(words[0])) {
    return null;
  }
  
  // Case 7: Two-word name with conjunction → DISCARD (error)
  if (words.length === 2) {
    const [first, second] = words;
    if (CONJUNCTION_WORDS.includes(first) || CONJUNCTION_WORDS.includes(second)) {
      console.log(`[detectConcat] Contains conjunction, discarding: ${name}`);
      return []; // Return empty to discard
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL: TWO-WORD NAMES ARE NORMAL!
  // "PETE MITCHELL", "JOHN SMITH", "MARY JONES" → KEEP AS IS
  // Only split if 3+ words or clear concatenation pattern
  // ═══════════════════════════════════════════════════════════════════════════
  if (words.length === 2) {
    // Two proper names = likely a first+last name, NOT concatenation
    // Examples: PETE MITCHELL, SARAH CONNOR, JOHN WICK
    return null; // Keep compound name
  }
  
  // Case 8: Three or more words → Check for concatenation
  // "JOHN MARY PETER" → likely 3 separate characters
  // "SARAH JANE SMITH" → could be one character with 3 names
  if (words.length >= 3) {
    // If first word is title, it's probably one character
    if (isTitle(words[0])) {
      // "DR JOHN SMITH" → keep as is
      return null;
    }
    
    // Filter valid words (not adjectives/technical terms)
    const validWords = words.filter(w => 
      !isCommonAdjective(w) &&
      !isTechnicalTerm(w) &&
      w.length > 1
    );
    
    // If 3+ valid words remain, it's likely concatenation
    if (validWords.length >= 3) {
      console.log(`[detectConcat] Splitting multi-name (3+): ${name} → [${validWords.join(', ')}]`);
      return validWords;
    }
    
    // If only 2 valid words remain after cleaning, keep as compound
    if (validWords.length === 2) {
      return null;
    }
    
    // If 1 valid word, return just that
    if (validWords.length === 1) {
      return validWords;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: STRUCTURAL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Validates that a name complies with standard screenplay format
 */
function isValidCharacterFormat(name: string): {
  valid: boolean;
  reason?: string;
} {
  // Length
  if (name.length < 2) {
    return { valid: false, reason: 'Too short' };
  }
  
  if (name.length > 50) {
    return { valid: false, reason: 'Too long (probably concatenation)' };
  }
  
  // Should not contain special characters (except apostrophe, hyphen, space)
  if (!/^[A-Z\s'\-]+$/.test(name)) {
    return { valid: false, reason: 'Invalid characters' };
  }
  
  // Should not have more than 4 words (extremely rare names)
  const wordCount = name.split(/\s+/).length;
  if (wordCount > 4) {
    return { valid: false, reason: 'Too many words (>4)' };
  }
  
  // Should not contain conjunctions (indicates concatenation)
  const hasConjunction = CONJUNCTION_WORDS.some(conj => 
    name.includes(` ${conj} `)
  );
  if (hasConjunction) {
    return { valid: false, reason: 'Contains conjunction (AND/OR/WITH)' };
  }
  
  // Should not be only numbers/codes
  if (/^[A-Z]?\d+[A-Z]?$/.test(name)) {
    return { valid: false, reason: 'Scene/shot code' };
  }
  
  return { valid: true };
}

/**
 * Detects dialogue/action patterns that are NOT characters
 */
function isDialogueOrActionPattern(name: string): boolean {
  // Patterns like "MAVERICK TO TOWER", "RADIO CHATTER", "CROWD MURMURS"
  const actionPatterns = [
    /TO\s+/,           // "TO TOWER", "TO SELF"
    /FROM\s+/,         // "FROM BASE"
    /OVER\s+/,         // "OVER RADIO"
    /\s+VOICE$/,       // "MAN VOICE", "WOMAN VOICE"
    /^ALL\s+/,         // "ALL UNITS"
    /\s+CHATTER$/,     // "CROWD CHATTER"
    /\s+MURMURS?$/,    // "CROWD MURMURS"
    /\s+SCREAMS?$/,    // "CROWD SCREAMS"
    /\s+CHEERS?$/,     // "CROWD CHEERS"
  ];
  
  return actionPatterns.some(pattern => pattern.test(name));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: CLEANING AND NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cleans a name according to master prompt rules
 */
function cleanCharacterName(raw: string): string | null {
  if (!raw) return null;
  
  let cleaned = raw.trim().toUpperCase();
  
  // 1. Remove descriptive parentheses: "JOHN (ANGRY)" → "JOHN"
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, '');
  
  // 2. Remove technical extensions: "JOHN (V.O.)" → "JOHN"
  cleaned = cleaned.replace(/\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONTINUED)\)/gi, '');
  
  // 3. Remove location technical prefixes badly parsed
  cleaned = cleaned.replace(/^\/?(INT\.|EXT\.|I\/E\.)\s*/i, '');
  
  // 4. Remove loose technical suffixes
  const technicalSuffixes = /\s+(CONT'?D|VO|OS|OC|PRELAP|FILTERED|D|V0|ALT|ALTS)\s*$/i;
  cleaned = cleaned.replace(technicalSuffixes, '');
  
  // 5. Clean multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned.length > 0 ? cleaned : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: AUXILIARY FUNCTIONS (voice/functional, generic roles)
// ═══════════════════════════════════════════════════════════════════════════════

function isVoiceFunctional(name: string): boolean {
  const patterns = [
    /VOICE$/,
    /^NARRATOR/,
    /^ANNOUNCER/,
    /^RADIO/,
    /^TV/,
    /^COMPUTER/,
    /^DISPATCH/,
    /^OPERATOR/,
    /^TOWER$/,
    /^CONTROL$/,
    /SPEAKER$/,
    /\bCOMMS\b/,
    /\bINTERCOM\b/,
    /\bLOUDSPEAKER\b/,
    /\bMISSION CONTROL\b/,
    /\bFLIGHT\s*DECK\b/,
    /\bPA\s*SYSTEM\b/,
  ];
  
  return patterns.some(p => p.test(name.toUpperCase()));
}

function isGenericRole(name: string): boolean {
  const upper = name.toUpperCase();
  
  // PATCH v21: Keyword-based detection (catches AIR CONTROL OFFICER, etc.)
  if (/\bOFFICER\b/i.test(upper) || /\bCOMMAND\b/i.test(upper) || /\bCONTROL\b/i.test(upper)) {
    return true;
  }
  
  const roles = [
    /^WAITER/,
    /^WAITRESS/,
    /^BARTENDER/,
    /^GUARD/,
    /^COP/,
    /^OFFICER/,
    /^NURSE/,
    /^DOCTOR/,
    /^PILOT/,
    /^SOLDIER/,
    /^AGENT/,
    /^DRIVER/,
    /^CLERK/,
    /^RECEPTIONIST/,
    /^CUSTOMER/,
    /^PASSENGER/,
    /^MAN\s*#?\d*/,
    /^WOMAN\s*#?\d*/,
    /^KID\s*#?\d*/,
    /^CHILD\s*#?\d*/,
    /^DETECTIVE/,
    /^POLICE/,
    /^AIDE/,
    /^CHAIRMAN/,
    /^COUNSEL/,
    /^CAPTAIN/,
    /^GENERAL/,
    /^SENATOR/,
    /^DIRECTOR/,
    /^PRODUCER/,
    /^TECH/,
    /^TECHNICIAN/,
    /^SCIENTIST/,
    /^SECURITY/,
  ];
  
  return roles.some(r => r.test(upper));
}

/**
 * PATCH v21: Detects role suffixes like "CAIN'S AIDE", "ADMIRAL'S AIDE"
 * These should be classified as extras, not cast
 */
function isRoleSuffix(name: string): boolean {
  const suffixes = [
    /\bAIDE$/i,
    /\bOFFICER$/i,
    /\bPILOT$/i,
    /\bTECH(NICIAN)?$/i,
    /\bCREW$/i,
    /\bCONTROLLER$/i,
    /\bOPERATOR$/i,
    /\bASSISTANT$/i,
    /\bSECRETARY$/i,
    /\bCOMMAND$/i,
    /\bREMAINING$/i,
  ];
  return suffixes.some(r => r.test(name.trim()));
}

/**
 * PATCH v21: Detects merged/concatenated names that are noise
 * E.g.: "MAVERICK SARAH", "ROOSTER PAYBACK", "PENNY D MAVERICK"
 */
function looksLikeMergedNames(name: string): boolean {
  const n = name.toUpperCase().trim();
  const parts = n.split(/\s+/);
  
  // Known callsigns for Top Gun (expandable for other scripts)
  const knownCallsigns = new Set([
    'MAVERICK', 'ROOSTER', 'HANGMAN', 'PHOENIX', 'BOB', 'COYOTE',
    'ICEMAN', 'WARLOCK', 'CYCLONE', 'HONDO', 'PAYBACK', 'FANBOY',
    'GOOSE', 'SLIDER', 'HOLLYWOOD', 'WOLFMAN', 'VIPER', 'JESTER',
    'MERLIN', 'COUGAR', 'SUNDOWN', 'CHIPPER'
  ]);
  
  // Bad connectors that indicate merge: "PENNY D MAVERICK"
  const badConnectors = new Set(['D', 'TO', 'WITH', 'AND', 'VS', 'Y']);
  if (parts.some(p => badConnectors.has(p))) {
    console.log(`[looksLikeMergedNames] Bad connector detected: ${name}`);
    return true;
  }
  
  // If 2+ parts are known callsigns, it's a merge: "ROOSTER MAVERICK"
  if (parts.length >= 2) {
    const hits = parts.filter(p => knownCallsigns.has(p)).length;
    if (hits >= 2) {
      console.log(`[looksLikeMergedNames] Multiple callsigns: ${name}`);
      return true;
    }
  }
  
  // If exactly 2 parts and one is a callsign + the other is a first name
  // "MAVERICK SARAH", "PENNY MAVERICK"
  if (parts.length === 2) {
    const [a, b] = parts;
    const commonFirstNames = new Set([
      'SARAH', 'PENNY', 'PETE', 'TOM', 'NICK', 'BRADLEY', 'JAKE', 
      'NATASHA', 'ROBERT', 'REUBEN', 'MICKEY', 'JAVY', 'AMELIA'
    ]);
    
    // Callsign + first name = merge
    if ((knownCallsigns.has(a) && commonFirstNames.has(b)) ||
        (knownCallsigns.has(b) && commonFirstNames.has(a))) {
      console.log(`[looksLikeMergedNames] Callsign + first name: ${name}`);
      return true;
    }
  }
  
  return false;
}

/**
 * PATCH v21: Combined role-ish detector for keywords anywhere in the name
 */
function isRoleish(name: string): boolean {
  const u = name.toUpperCase();
  return (
    /\bAIDE\b/.test(u) ||
    /\bOFFICER\b/.test(u) ||
    /\bPILOT\b/.test(u) ||
    /\bCONTROL\b/.test(u) ||
    /\bCOMMAND\b/.test(u) ||
    /\bREMAINING\b/.test(u) ||
    /\bAIRROL\b/.test(u) // typo variant
  );
}

function isSceneCode(name: string): boolean {
  const t = name.trim();
  // Patterns: A127, EE313, B56, etc.
  if (/^[A-Z]{1,3}\d{1,4}$/.test(t)) return true;
  if (/^[A-Z]+\d+[A-Z]?$/i.test(t)) return true;
  return false;
}

function addUnique(arr: string[], seen: Set<string>, value: string) {
  const key = value.toUpperCase();
  if (seen.has(key)) return;
  seen.add(key);
  arr.push(value);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: MAIN CLASSIFICATION (GENERIC VERSION)
// ═══════════════════════════════════════════════════════════════════════════════

function classifyCharacters(rawCandidates: string[]): CharBuckets {
  console.log('=== CLASSIFY CHARACTERS (GENERIC UNIVERSAL v21) ===');
  console.log('Input count:', rawCandidates?.length || 0);
  
  const buckets: CharBuckets = {
    cast: [],
    featured_extras_with_lines: [],
    voices_and_functional: [],
    discarded: [],
    debug: {
      input: rawCandidates?.length || 0,
      cleaned: 0,
      expanded: 0,
      validated: 0
    }
  };
  
  const seen = new Set<string>();
  
  // PHASE 1: Clean and expand
  const processedNames: string[] = [];
  
  for (const raw of rawCandidates || []) {
    // PATCH v21: Strip technical suffixes FIRST (before any other processing)
    let name = stripTechnicalSuffixes(raw);
    
    // Remove quotes
    name = name.replace(/^'+|'+$/g, "").trim();
    
    if (!name) {
      buckets.discarded.push(raw);
      continue;
    }
    
    // Clean
    const cleaned = cleanCharacterName(name);
    if (!cleaned) {
      buckets.discarded.push(raw);
      continue;
    }
    buckets.debug!.cleaned = (buckets.debug!.cleaned || 0) + 1;
    
    // PATCH v21: Check for technical terms EARLY
    if (isTechnicalTerm(cleaned)) {
      console.log(`[discard] ${cleaned}: technical term (early)`);
      buckets.discarded.push(raw);
      continue;
    }
    
    // PATCH v21: Check for merged names EARLY
    if (looksLikeMergedNames(cleaned)) {
      console.log(`[discard] ${cleaned}: merged names detected`);
      buckets.discarded.push(raw);
      continue;
    }
    
    // Detect concatenation
    const split = detectConcatenatedNames(cleaned);
    if (split) {
      // Filter out empty results from split
      const validSplits = split.filter(s => s && s.trim().length > 0);
      processedNames.push(...validSplits);
      buckets.debug!.expanded = (buckets.debug!.expanded || 0) + validSplits.length - 1;
    } else {
      processedNames.push(cleaned);
    }
  }
  
  console.log('After cleaning/expansion:', processedNames.length);
  
  // PHASE 2: Validate and classify (with CORRECT order)
  for (const name of processedNames) {
    // PATCH v21: Apply stripTechnicalSuffixes again for safety
    const cleanedName = stripTechnicalSuffixes(name).replace(/^'+|'+$/g, "").trim();
    if (!cleanedName) continue;
    
    // PATCH v21: Technical term check
    if (isTechnicalTerm(cleanedName)) {
      console.log(`[discard] ${cleanedName}: technical term`);
      buckets.discarded.push(cleanedName);
      continue;
    }
    
    // PATCH v21: Merged names check
    if (looksLikeMergedNames(cleanedName)) {
      console.log(`[discard] ${cleanedName}: merged names`);
      buckets.discarded.push(cleanedName);
      continue;
    }
    
    // Structural validation
    const validation = isValidCharacterFormat(cleanedName);
    if (!validation.valid) {
      console.log(`[discard] ${cleanedName}: ${validation.reason}`);
      buckets.discarded.push(cleanedName);
      continue;
    }
    buckets.debug!.validated = (buckets.debug!.validated || 0) + 1;
    
    // Avoid duplicates
    if (seen.has(cleanedName.toUpperCase())) continue;
    
    // Scene codes
    if (isSceneCode(cleanedName)) {
      console.log(`[discard] ${cleanedName}: scene code`);
      buckets.discarded.push(cleanedName);
      continue;
    }
    
    // Dialogue/action patterns
    if (isDialogueOrActionPattern(cleanedName)) {
      console.log(`[discard] ${cleanedName}: dialogue/action pattern`);
      buckets.discarded.push(cleanedName);
      continue;
    }
    
    // PATCH v21: Voice/functional detection
    if (isVoiceFunctional(cleanedName)) {
      addUnique(buckets.voices_and_functional, seen, cleanedName);
      continue;
    }
    
    // PATCH v21: Role-ish detection (AIR CONTROL OFFICER, COMMAND, etc.)
    if (isRoleish(cleanedName)) {
      console.log(`[extra] ${cleanedName}: role-ish keyword detected`);
      addUnique(buckets.featured_extras_with_lines, seen, cleanedName);
      continue;
    }
    
    // Generic roles
    if (isGenericRole(cleanedName)) {
      addUnique(buckets.featured_extras_with_lines, seen, cleanedName);
      continue;
    }
    
    // Role suffix detection (e.g., "CAIN'S AIDE", "ADMIRAL'S PILOT")
    if (isRoleSuffix(cleanedName)) {
      console.log(`[extra] ${cleanedName}: role suffix detected`);
      addUnique(buckets.featured_extras_with_lines, seen, cleanedName);
      continue;
    }
    
    // Proper names → cast
    const words = cleanedName.split(/\s+/);
    const hasProperName = words.some(w => isProbablyProperName(w));
    
    if (hasProperName) {
      addUnique(buckets.cast, seen, cleanedName);
    } else {
      addUnique(buckets.featured_extras_with_lines, seen, cleanedName);
    }
  }
  
  buckets.debug!.output = {
    cast: buckets.cast.length,
    featured: buckets.featured_extras_with_lines.length,
    voices: buckets.voices_and_functional.length,
    discarded: buckets.discarded.length
  };
  
  console.log('Output:', buckets.debug!.output);
  console.log('Sample discarded:', buckets.discarded.slice(0, 10));
  
  return buckets;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GENERIC LOCATION NORMALIZER - UNIVERSAL
// Works for ANY screenplay applying universal format rules
// ═══════════════════════════════════════════════════════════════════════════════

const TECHNICAL_KEYWORDS = [
  'INTERCUT', 'MONTAGE', 'SERIES OF SHOTS', 'STOCK FOOTAGE',
  'CONTINUED', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME',
  'CUT TO', 'FADE TO', 'DISSOLVE TO', 'MATCH CUT', 'SMASH CUT',
  'FLASHBACK', 'FLASH FORWARD', 'DREAM SEQUENCE', 'FANTASY',
  'TITLE SEQUENCE', 'END CREDITS', 'OPENING CREDITS',
  'POV', 'INSERT', 'ANGLE ON', 'CLOSE ON', 'WIDE SHOT',
  'ESTABLISHING', 'AERIAL', 'UNDERWATER', 'SPLIT SCREEN'
];

const TIME_OF_DAY_MARKERS = [
  'DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'AFTERNOON', 'EVENING',
  'SUNSET', 'SUNRISE', 'NOON', 'MIDNIGHT', 'TWILIGHT',
  'MAGIC HOUR', 'GOLDEN HOUR', 'BLUE HOUR'
];

const CONTINUITY_MARKERS = [
  'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME', 'MEANWHILE',
  'EARLIER', 'SECONDS LATER', 'MINUTES LATER', 'HOURS LATER',
  'DAYS LATER', 'WEEKS LATER', 'MONTHS LATER', 'YEARS LATER',
  'SAME'
];

const LOCATION_PREFIXES = ['INT.', 'EXT.', 'INT./EXT.', 'I/E.', 'I/E'];

/**
 * Detects if a line is a technical direction, not a location
 */
function isTechnicalDirection(line: string): boolean {
  const upper = line.toUpperCase();
  
  return TECHNICAL_KEYWORDS.some(keyword => {
    const pattern = new RegExp(`\\b${keyword}\\b|^${keyword}`);
    return pattern.test(upper);
  });
}

/**
 * Detects if it's a transition, not a location
 */
function isTransition(line: string): boolean {
  const upper = line.toUpperCase().trim();
  
  const transitions = [
    /^CUT TO:?\s*$/,
    /^FADE (TO|IN|OUT):?\s*$/,
    /^DISSOLVE TO:?\s*$/,
    /^SMASH CUT:?\s*$/,
    /^MATCH CUT:?\s*$/,
    /^FADE TO BLACK\.?$/,
    /^FADE IN:?\s*$/
  ];
  
  return transitions.some(pattern => pattern.test(upper));
}

/**
 * Detects sequence/scene labels that are not locations
 */
function isSequenceLabel(line: string): boolean {
  const upper = line.toUpperCase();
  
  const patterns = [
    /SORTIE\s+\d+/,           // SORTIE 1, SORTIE 2
    /SCENE\s+\d+/,            // SCENE 1, SCENE 2  
    /SEQUENCE\s+[A-Z0-9]/,    // SEQUENCE A, SEQUENCE 1
    /SHOT\s+\d+/,             // SHOT 1, SHOT 2
    /TAKE\s+\d+/,             // TAKE 1, TAKE 2
    /ACT\s+(ONE|TWO|THREE|I+|[0-9])/,  // ACT ONE, ACT I, ACT 1
    /TEASER$/,                // TEASER
    /TAG$/,                   // TAG
    /COLD OPEN/,              // COLD OPEN
    /\bMONT\w*\s*\w*$/        // MONTAGE, MONT AG7E9 (codes)
  ];
  
  return patterns.some(pattern => pattern.test(upper));
}

/**
 * Detects vehicle references with owners (specific shots, not locations)
 * E.g.: "MAVERICK'S F-18", "ROOSTER'S CAR" → NOT real locations
 */
function isVehicleWithOwner(line: string): boolean {
  return /^[A-Z]+('S|\/[A-Z]+)\s+(F-?\d+|CAR|TRUCK|PLANE|JET|HELICOPTER|BOAT|SHIP)/i.test(line);
}

/**
 * Cleans a raw location according to universal rules
 */
function cleanLocation(raw: string): string | null {
  if (!raw) return null;
  
  let cleaned = raw.trim();
  
  // 1. Remove technical prefixes with slash: "/INT. ROOM" → "INT. ROOM"
  cleaned = cleaned.replace(/^\/+/, '');
  
  // 2. Remove INT./EXT. prefixes
  const prefixPattern = new RegExp(`^(${LOCATION_PREFIXES.join('|')})\\s*`, 'i');
  cleaned = cleaned.replace(prefixPattern, '');
  
  // 3. Remove scene numbers at start/end
  cleaned = cleaned.replace(/^\d+[A-Z]?\s+/, '');  // At start: "12 HOUSE"
  cleaned = cleaned.replace(/\s+\d+[A-Z]?$/, '');  // At end: "HOUSE 12"
  
  // 4. Remove time of day and everything after
  const timePattern = new RegExp(
    `\\s*-\\s*(${TIME_OF_DAY_MARKERS.join('|')})(\\s|$).*`,
    'i'
  );
  cleaned = cleaned.replace(timePattern, '');
  
  // 5. Remove continuity markers
  const continuityPattern = new RegExp(
    `\\s*-\\s*(${CONTINUITY_MARKERS.join('|')}).*`,
    'i'
  );
  cleaned = cleaned.replace(continuityPattern, '');
  
  // 6. Remove sequence labels
  cleaned = cleaned.replace(/\s*-\s*SORTIE\s+\d+/i, '');
  cleaned = cleaned.replace(/\s*-\s*SCENE\s+\d+/i, '');
  cleaned = cleaned.replace(/\s*-\s*SHOT\s+\d+/i, '');
  
  // 7. Remove annotations in parentheses at end
  cleaned = cleaned.replace(/\s*\([^)]*\)\s*$/, '');
  
  // 8. Remove annotations in brackets
  cleaned = cleaned.replace(/\s*\[[^\]]*\]\s*$/, '');
  
  // 9. Clean multiple spaces and trailing dashes
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\s*-\s*$/, ''); // Trailing dash
  cleaned = cleaned.trim();
  
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Validates that a location is structurally valid
 */
function isValidLocation(location: string): {
  valid: boolean;
  reason?: string;
} {
  // Too short
  if (location.length < 2) {
    return { valid: false, reason: 'Too short' };
  }
  
  // Too long (probably includes extra description)
  if (location.length > 100) {
    return { valid: false, reason: 'Too long' };
  }
  
  // Is scene code
  if (isSceneCode(location)) {
    return { valid: false, reason: 'Scene code' };
  }
  
  // Is technical direction
  if (isTechnicalDirection(location)) {
    return { valid: false, reason: 'Technical direction' };
  }
  
  // Is transition
  if (isTransition(location)) {
    return { valid: false, reason: 'Transition' };
  }
  
  // Is sequence label
  if (isSequenceLabel(location)) {
    return { valid: false, reason: 'Sequence label' };
  }
  
  // Is vehicle with owner (specific shot)
  if (isVehicleWithOwner(location)) {
    return { valid: false, reason: 'Vehicle shot (not location)' };
  }
  
  return { valid: true };
}

/**
 * Extracts base location from a complete location
 * E.g.: "HOUSE - KITCHEN" → "HOUSE"
 */
function extractBaseLocation(location: string): string {
  const dashIndex = location.indexOf(' - ');
  if (dashIndex > 0) {
    return location.substring(0, dashIndex).trim();
  }
  return location;
}

/**
 * Extracts sub-location if exists
 * E.g.: "HOUSE - KITCHEN - DAY" → "KITCHEN"
 */
function extractSubLocation(location: string): string | null {
  const parts = location.split(' - ');
  if (parts.length >= 2) {
    return parts[1].trim();
  }
  return null;
}

interface LocationData {
  name: string;
  baseLocation: string;
  subLocations: string[];
  sceneCount: number;
  types: Set<string>; // INT, EXT, both
}

/**
 * Consolidates variations of the same location
 */
function consolidateLocations(locations: Array<{
  raw: string;
  type?: string; // INT/EXT
}>): Map<string, LocationData> {
  
  const consolidated = new Map<string, LocationData>();
  
  for (const loc of locations) {
    // Clean
    const cleaned = cleanLocation(loc.raw);
    if (!cleaned) continue;
    
    // Validate
    const validation = isValidLocation(cleaned);
    if (!validation.valid) {
      console.log(`[location] Discard: ${cleaned} (${validation.reason})`);
      continue;
    }
    
    // Extract base and sub
    const base = extractBaseLocation(cleaned);
    const sub = extractSubLocation(cleaned);
    
    // Create or update entry
    if (!consolidated.has(base)) {
      consolidated.set(base, {
        name: base,
        baseLocation: base,
        subLocations: [],
        sceneCount: 0,
        types: new Set()
      });
    }
    
    const entry = consolidated.get(base)!;
    entry.sceneCount++;
    
    if (loc.type) {
      entry.types.add(loc.type);
    }
    
    if (sub && !entry.subLocations.includes(sub)) {
      entry.subLocations.push(sub);
    }
  }
  
  return consolidated;
}

interface LocationResult {
  primary: Array<{
    name: string;
    sceneCount: number;
    subLocations: string[];
    intExt: string;
  }>;
  secondary: Array<{
    name: string;
    sceneCount: number;
  }>;
  brief: Array<{
    name: string;
    sceneCount: number;
  }>;
  discarded: string[];
}

function normalizeLocationsGeneric(rawLocations: Array<{
  text: string;
  type?: string;
}>): LocationResult {
  
  console.log('=== NORMALIZE LOCATIONS (GENERIC) ===');
  console.log('Input count:', rawLocations.length);
  
  // Consolidate
  const consolidated = consolidateLocations(
    rawLocations.map(l => ({ raw: l.text, type: l.type }))
  );
  
  console.log('After consolidation:', consolidated.size);
  
  // Classify by importance
  const locations = Array.from(consolidated.values());
  
  const primary = locations
    .filter(l => l.sceneCount >= 5)
    .sort((a, b) => b.sceneCount - a.sceneCount);
  
  const secondary = locations
    .filter(l => l.sceneCount >= 2 && l.sceneCount < 5)
    .sort((a, b) => b.sceneCount - a.sceneCount);
  
  const brief = locations
    .filter(l => l.sceneCount === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
  
  // Format output
  const result: LocationResult = {
    primary: primary.map(l => ({
      name: l.name,
      sceneCount: l.sceneCount,
      subLocations: l.subLocations,
      intExt: Array.from(l.types).join('/')
    })),
    secondary: secondary.map(l => ({
      name: l.name,
      sceneCount: l.sceneCount
    })),
    brief: brief.map(l => ({
      name: l.name,
      sceneCount: l.sceneCount
    })),
    discarded: []
  };
  
  console.log('Output:', {
    primary: result.primary.length,
    secondary: result.secondary.length,
    brief: result.brief.length
  });
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEGACY CHARACTER BANNED SET (for backward compatibility)
// ═══════════════════════════════════════════════════════════════════════════════
const CHARACTER_CUE_BANNED = new Set([
  'BLAM', 'CRASH', 'BANG', 'BOOM', 'SLAM', 'BAM', 'THUD', 'CLICK', 'POP', 'CRUNCH',
  'QUICK CUTS', 'CUT TO', 'FADE IN', 'FADE OUT', 'DISSOLVE', 'MONTAGE', 'INSERT',
  'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAWN', 'DUSK', 'DAY', 'CONTINUOUS', 'LATER',
  'BLACK', 'WHITE', 'THE END', 'END', 'CONTINUED', 'CREDITS', 'INTERCUT',
  'HEAR', 'WE SEE', 'WE HEAR', 'SOUND OF', 'MUSIC', 'SILENCE',
]);

// === CHARACTER ALIASES (for deduplication) ===
const CHARACTER_ALIASES: Record<string, string> = {
  'JOKER': 'JOKER',
  'ARTHUR': 'JOKER',
  'ARTHUR FLECK': 'JOKER',
  'HAPPY': 'JOKER',
  'MOM': 'PENNY',
  'PENNY': 'PENNY',
  'PENNY FLECK': 'PENNY',
  'MOTHER': 'PENNY',
  'GRANDMA': 'GRANDMOTHER',
  'GRANDPA': 'GRANDFATHER',
  'GRANNY': 'GRANDMOTHER',
  'MA': 'MOTHER',
  'PA': 'FATHER',
  'DAD': 'FATHER',
  'DADDY': 'FATHER',
  'MOMMY': 'MOTHER',
  'MAMA': 'MOTHER',
  'PAPA': 'FATHER',
};

// ═══════════════════════════════════════════════════════════════════════════════
// HARD FILTERS: Things that are NEVER character names
// ═══════════════════════════════════════════════════════════════════════════════

// Scene heading detector (numbered or not)
function isSceneHeading(text: string): boolean {
  const t = text.toUpperCase().trim();
  // Standard: INT. / EXT. / INT/EXT
  if (/^(INT[\./]|EXT[\./]|INT\/EXT|I\/E)/i.test(t)) return true;
  // Numbered: "32 INT." or "32. INT."
  if (/^\d+\s*\.?\s*(INT[\./]|EXT[\./]|INT\/EXT|I\/E)/i.test(t)) return true;
  // Contains INT./EXT. anywhere (malformed)
  if (/\bINT\.\s|EXT\.\s/i.test(t)) return true;
  return false;
}

// Comprehensive character name validator based on industry standards
function isInvalidCharacterName(text: string): boolean {
  const t = text.toUpperCase().trim();
  const original = text.trim();
  const words = t.split(/\s+/).filter(w => w.length > 0);
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1: Character names are 1-3 words maximum
  // ══════════════════════════════════════════════════════════════════════════
  if (words.length > 3) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: Reject empty or too short
  // ══════════════════════════════════════════════════════════════════════════
  if (t.length < 2) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: Reject pure punctuation or special characters
  // ══════════════════════════════════════════════════════════════════════════
  if (/^[.…\-–—*#_=+~`'"!?@$%^&(){}\[\]<>|\\/:;,]+$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4: Reject pure numbers (scene numbers like "102", "114")
  // ══════════════════════════════════════════════════════════════════════════
  if (/^\d+$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 5: Reject repeated letters (3+) - BLAMMMMM, CRAAAASH, NOOOOO
  // ══════════════════════════════════════════════════════════════════════════
  if (/(.)\1{2,}/.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 6: Reject lines containing -- or ... or — (dialogue fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/--|\.\.\.?|—|–/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 7: Reject questions (ends with ?)
  // ══════════════════════════════════════════════════════════════════════════
  if (/\?$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 8: Reject if ends with problematic punctuation
  // ══════════════════════════════════════════════════════════════════════════
  if (/[!?,;:'"\-]$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 9: Reject if starts with punctuation
  // ══════════════════════════════════════════════════════════════════════════
  if (/^[!?,;:'"\-.]/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 10: Scene headings
  // ══════════════════════════════════════════════════════════════════════════
  if (isSceneHeading(t)) return true;
  if (/\bINT\/|EXT\//.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 11: Time-of-day endings (scene heading fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|SAME)\s*$/i.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 12: Too long (real character names rarely exceed 30 chars)
  // ══════════════════════════════════════════════════════════════════════════
  if (t.length > 30) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 13: Starts with number + words (scene heading fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/^\d+\s+[A-Z]/.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 14: Technical camera/shot terms
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(ANGLE|CLOSE|WIDE|MEDIUM|EXTREME|SHOT|INSERT|POV|REVERSE|OVER|ON:|PUSH|PULL|TRACK|DOLLY|PAN|TILT|ZOOM|CRANE|AERIAL|HANDHELD|STEADICAM)/i.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 15: Action/instruction phrases
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(HEAR|WE SEE|WE HEAR|CUT|FADE|DISSOLVE|FLASH|TITLE|SUPER|BLACK|WHITE)/i.test(t)) return true;
  if (/\bHEAR\s+(LAUGHTER|MUSIC|SOUND|NOISE|VOICE|A\s)/i.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 16: Common sentence starters (dialogue fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(DID|DO|DOES|CAN|COULD|WOULD|SHOULD|WILL|ARE|IS|WAS|WERE|HAVE|HAS|HAD|THAT|THIS|THOSE|THESE|WHAT|WHERE|WHEN|WHY|HOW|GOOD|BAD|TURN|WATCH|LOOK|PLEASE|JUST|NOW|THEN|BUT|AND|OR|IF|SO|AS|TO|FOR|WITH|FROM|ABOUT)\s/i.test(t) && words.length > 2) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 17: Contains pronouns in multi-word context (dialogue)
  // ══════════════════════════════════════════════════════════════════════════
  if (/\b(YOU|I'M|I AM|WE'RE|THEY'RE|HE'S|SHE'S|IT'S|THAT'S|THERE'S|HERE'S|LET'S|WE'LL|YOU'LL|I'LL|DON'T|WON'T|CAN'T|ISN'T|AREN'T|WASN'T|WEREN'T|HAVEN'T|HASN'T)\b/i.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 18: Contains "SINGING" (lyrics indicator)
  // ══════════════════════════════════════════════════════════════════════════
  if (/\bSINGING\b/i.test(t) && words.length > 2) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 19: Single-word sound effects & onomatopoeia patterns
  // ══════════════════════════════════════════════════════════════════════════
  const ONOMATOPOEIA = /^(BLAM|BAM|BANG|BOOM|CRASH|SLAM|THUD|CLICK|BEEP|RING|WHOOSH|SCREECH|CLANG|WHAM|DING|HONK|BUZZ|HISS|POP|CRACK|SNAP|SPLASH|THUMP|CRUNCH|SIZZLE|RUMBLE|ROAR|SMASH|WHACK|THWACK|KAPOW|ZAP|WHIR|CLUNK|SQUEAK|GROWL|SHRIEK|YELL|SCREAM|GASP|SIGH|GROAN|MOAN|WAIL|HOWL|BARK|MEOW|CHIRP|TWEET|SQUAWK)/i;
  if (words.length === 1 && ONOMATOPOEIA.test(t)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 20: Blacklist check - exact match or any word matches (for >3 char words)
  // ══════════════════════════════════════════════════════════════════════════
  if (CHARACTER_CUE_BANNED.has(t)) return true;
  for (const word of words) {
    if (word.length > 3 && CHARACTER_CUE_BANNED.has(word)) return true;
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 21: Timestamps
  // ══════════════════════════════════════════════════════════════════════════
  if (/^\d{1,2}:\d{2}/.test(original)) return true;
  
  return false;
}

// Clean character name (remove technical suffixes)
function cleanCharacterNameFull(name: string): string {
  if (!name || typeof name !== 'string') return '';
  
  return name
    .replace(/\s*(V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D?\.?|CONTINUED|PRE-?LAP|POST-?LAP|\(.*\))$/gi, '')
    .replace(/\s+ON\s+(TV|SCREEN|PHONE|RADIO|MONITOR)$/gi, '')
    .replace(/\s+\d+$/g, '')
    .replace(/[#*@&]+/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Deduplicate characters using aliases
function deduplicateCharacters(candidates: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  for (const name of candidates) {
    const cleaned = cleanCharacterNameFull(name);
    if (!cleaned || isInvalidCharacterName(cleaned)) continue;
    
    const upper = cleaned.toUpperCase();
    const canonical = CHARACTER_ALIASES[upper] || upper;
    
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(cleaned);
    }
  }
  
  return result;
}

// Legacy compatibility wrapper
function isActionOrTechnicalLine(text: string): boolean {
  return isInvalidCharacterName(text);
}

function extractCharacterCandidatesFull(
  scriptText: string,
): { candidates: string[]; stats: { total: number; top10: string[] } } {
  const lines = scriptText.split(/\r?\n/);
  const candidateCounts = new Map<string, number>();

  // PASS A: strict-ish speaker cue scan with lookahead (good precision)
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // 🛡️ HARD FILTER: Skip if this looks like a scene heading or action
    if (isSceneHeading(trimmed)) continue;
    if (isActionOrTechnicalLine(trimmed)) continue;

    // Character cue detection criteria:
    // a) ALL CAPS (2-40 chars) - reduced from 50
    // b) Followed by something that is NOT a heading/transition (lookahead allows blank line)
    // c) Not a scene heading, transition, or parenthetical-only line

    // Find next non-empty line (lookahead up to 2 lines for blank line handling)
    let nextContent = "";
    for (let j = 1; j <= 2 && i + j < lines.length; j++) {
      const candidate = lines[i + j]?.trim() || "";
      if (candidate) {
        nextContent = candidate;
        break;
      }
    }

    if (
      trimmed === trimmed.toUpperCase() &&
      trimmed.length >= 2 &&
      trimmed.length <= 40 &&
      !/^(FADE|CUT|DISSOLVE|SMASH|WIPE|IRIS)/i.test(trimmed) &&
      !/^\([^)]+\)$/.test(trimmed) && // Not a parenthetical-only line
      nextContent &&
      !/^(INT\.|EXT\.|FADE|CUT)/i.test(nextContent) &&
      !isSceneHeading(nextContent)
    ) {
      // Normalize: remove parentheticals (V.O.), (O.S.), (CONT'D), etc.
      let charName = trimmed
        .replace(/\s*\([^)]*\)\s*$/g, "")
        .replace(/\bCONT['']?D\.?\b/gi, "")
        .replace(/\bCONT\.?\b/gi, "")
        .replace(/\bCONTINUED\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

      const canonicalKey = charName.toUpperCase();

      // Filter out non-characters (additional checks)
      if (!charName || charName.length < 2 || charName.length > 40) continue;
      if (CHARACTER_CUE_BANNED.has(canonicalKey)) continue;
      if (isSceneHeading(charName)) continue;
      if (isActionOrTechnicalLine(charName)) continue;
      // 🛡️ HARD FILTER: Reject pure numbers (scene numbers like "102", "114")
      if (/^\d+$/.test(charName.trim())) continue;

      candidateCounts.set(canonicalKey, (candidateCounts.get(canonicalKey) || 0) + 1);
    }
  }

  // PASS B: in-scene cue scan (captures cues that fail lookahead due to PDF/text extraction quirks)
  // This intentionally shares the same banned list, so it stays reasonably clean.
  try {
    const extractionResult = extractScenesFromScript(scriptText);
    for (const scene of extractionResult.scenes) {
      const present = Array.isArray((scene as any)?.characters_present)
        ? ((scene as any).characters_present as unknown[])
        : [];

      for (const rawName of present) {
        const cleaned = cleanCharacterCue(String(rawName));
        if (!cleaned) continue;
        
        // 🛡️ HARD FILTER
        if (isSceneHeading(cleaned)) continue;
        if (isActionOrTechnicalLine(cleaned)) continue;

        const charName = cleaned
          .replace(/\s*\([^)]*\)\s*$/g, "")
          .replace(/\bCONT['']?D\.?\b/gi, "")
          .replace(/\bCONT\.?\b/gi, "")
          .replace(/\bCONTINUED\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();

        const canonicalKey = charName.toUpperCase();

        if (!charName || charName.length < 2 || charName.length > 40) continue;
        if (CHARACTER_CUE_BANNED.has(canonicalKey)) continue;
        if (isSceneHeading(charName)) continue;
        if (isActionOrTechnicalLine(charName)) continue;
        // 🛡️ HARD FILTER: Reject pure numbers (scene numbers like "102", "114")
        if (/^\d+$/.test(charName.trim())) continue;

        candidateCounts.set(canonicalKey, (candidateCounts.get(canonicalKey) || 0) + 1);
      }
    }
  } catch (e) {
    console.warn("[script-breakdown] regexScenes character extraction failed", e);
  }

  // Sort by frequency (most dialogue lines first)
  const sorted = Array.from(candidateCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  return {
    candidates: sorted,
    stats: {
      total: sorted.length,
      top10: sorted.slice(0, 10),
    },
  };
}

function enrichBreakdownWithScriptData(data: any, scriptText: string): any {
  const out: any = (data && typeof data === 'object') ? data : {};
  const asArray = (v: any) => (Array.isArray(v) ? v : []);

  const expectedHeadings: string[] = [];
  const scriptLines = scriptText.split(/\r?\n/);
  
  // Extract scene headings
  for (const line of scriptLines) {
    const trimmed = line.trim();
    if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
      expectedHeadings.push(trimmed);
    }
  }
  
  const expectedSceneCount = expectedHeadings.length;
  console.log(`[script-breakdown] Expected scene count from regex: ${expectedSceneCount}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // DETERMINISTIC CHARACTER EXTRACTION - Full script scan (not truncated)
  // ═══════════════════════════════════════════════════════════════════════════
  const { candidates: characterCandidates, stats: candidateStats } = extractCharacterCandidatesFull(scriptText);
  console.log(`[script-breakdown] Character candidates extracted (deterministic): ${characterCandidates.length}`);
  console.log(`[script-breakdown] Top 10 speakers:`, candidateStats.top10);

  const aiScenesList = asArray(out.scenes?.list);
  const extractionResult = extractScenesFromScript(scriptText);
  const regexScenes = extractionResult.scenes;
  const dialogueStats = extractionResult.dialogues;
  const aiSceneCountTooLow = expectedSceneCount > 0 && aiScenesList.length < expectedSceneCount * 0.5;

  if (aiScenesList.length === 0 && regexScenes.length > 0) {
    console.warn('[script-breakdown] No scenes returned by model, falling back to regex extraction');
    out.scenes = { total: regexScenes.length, list: regexScenes };
  } else if (aiSceneCountTooLow && regexScenes.length >= aiScenesList.length) {
    console.warn('[script-breakdown] AI returned too few scenes, using regex fallback', {
      aiScenes: aiScenesList.length,
      expectedScenes: expectedSceneCount,
      regexScenes: regexScenes.length,
    });
    out.scenes = { total: regexScenes.length, list: regexScenes };
  } else if (!out.scenes || typeof out.scenes !== 'object') {
    out.scenes = { total: aiScenesList.length, list: aiScenesList };
  }
  
  // Add dialogue statistics
  out.dialogues = dialogueStats;

  if (out.scenes?.list) {
    out.scenes.total = out.scenes.list.length;
  }

  console.log(`[script-breakdown] Final scene count: ${out.scenes?.total || 0} (expected: ${expectedSceneCount})`);

  out.validation = {
    scene_headings_found: expectedSceneCount,
    scenes_total_equals_list_length: out.scenes?.total === out.scenes?.list?.length,
    used_source: expectedSceneCount > 0 ? 'screenplay' : 'unknown',
    source_reason: expectedSceneCount > 0 ? 'Found INT./EXT. scene headings' : 'No standard screenplay headings found'
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSIST character_candidates_full for normalizer fallback (P0)
  // ═══════════════════════════════════════════════════════════════════════════
  out.character_candidates = characterCandidates;
  out.character_candidates_stats = candidateStats;
  out.scene_headings_raw = expectedHeadings;
  // Keep enough raw_text for title extraction (first 10KB)
  out.raw_text = scriptText.slice(0, 10000);
  
  return out;
}

function tryParseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseKey) return null;

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Call Anthropic with diagnostic logging + Gateway fallback
// ═══════════════════════════════════════════════════════════════════════════════
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Model mapping: Anthropic -> Gateway equivalent
// Updated 2025-01: claude-3-5-sonnet-20241022 deprecated, use claude-sonnet-4-20250514
const MODEL_MAP: Record<string, { anthropic: string; gateway: string }> = {
  sonnet: { anthropic: 'claude-sonnet-4-20250514', gateway: 'google/gemini-2.5-pro' },
  haiku: { anthropic: 'claude-3-5-haiku-20241022', gateway: 'google/gemini-2.5-flash' },
};

type CallAIJsonArgs = {
  modelKey: 'sonnet' | 'haiku';
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  label: string;
};

type ProviderInfo = {
  provider: 'anthropic' | 'gateway';
  model: string;
  fallback_used: boolean;
  anthropic_error?: string;
};

async function callAIJson({ modelKey, systemPrompt, userPrompt, maxTokens, label }: CallAIJsonArgs): Promise<{ data: any; providerInfo: ProviderInfo }> {
  const models = MODEL_MAP[modelKey];
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIAGNOSTIC LOGGING
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[${label}] DIAGNOSTIC:`, {
    provider_attempt: 'anthropic',
    endpoint: ANTHROPIC_API_URL,
    model: models.anthropic,
    anthropic_key_present: !!ANTHROPIC_API_KEY,
    anthropic_key_length: ANTHROPIC_API_KEY?.length || 0,
    lovable_key_present: !!LOVABLE_API_KEY,
    supabase_project: Deno.env.get('SUPABASE_URL')?.split('//')[1]?.split('.')[0] || 'unknown',
  });
  
  let providerInfo: ProviderInfo = {
    provider: 'anthropic',
    model: models.anthropic,
    fallback_used: false,
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TRY ANTHROPIC FIRST (if key exists)
  // ═══════════════════════════════════════════════════════════════════════════
  if (ANTHROPIC_API_KEY) {
    try {
      console.log(`[${label}] Calling Anthropic: ${models.anthropic}`);
      
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: models.anthropic,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const content = data?.content?.[0]?.text;
        
        if (typeof content === 'string' && content.trim()) {
          console.log(`[${label}] Anthropic SUCCESS: ${content.length} chars`);
          // Log first/last 200 chars for truncation debugging
          console.log(`[${label}] Content preview: START=${content.slice(0, 200)}...END=${content.slice(-200)}`);
          
          const parsed = parseJsonSafe<any>(content, label);
          if (parsed.ok && parsed.json) {
            return { data: parsed.json, providerInfo };
          }
          // Log parse failure details
          console.error(`[${label}] JSON_PARSE_FAILED:`, { warnings: parsed.warnings, hash: parsed.rawSnippetHash });
          throw new Error('JSON_PARSE_FAILED');
        }
        throw new Error('NO_CONTENT_IN_RESPONSE');
      }
      
      // Anthropic returned error - log details
      const errorBody = await response.text();
      console.error(`[${label}] Anthropic ERROR ${response.status}:`, errorBody.slice(0, 500));
      
      providerInfo.anthropic_error = `${response.status}: ${errorBody.slice(0, 200)}`;
      
      // DON'T fallback for definitive auth/permission errors
      if (response.status === 401 || response.status === 403) {
        throw new Error(`ANTHROPIC_AUTH_INVALID_${response.status}: Check API key permissions`);
      }
      
      // 404 might be bad endpoint/model - log but allow fallback with warning
      if (response.status === 404) {
        console.warn(`[${label}] LIKELY_BAD_ENDPOINT_OR_MODEL - 404 from Anthropic, falling back but this should be investigated`);
      }
      
    } catch (anthropicError) {
      const errMsg = anthropicError instanceof Error ? anthropicError.message : String(anthropicError);
      console.error(`[${label}] Anthropic failed:`, errMsg);
      providerInfo.anthropic_error = errMsg;
      
      // If it's a definitive auth error, don't try gateway
      if (errMsg.includes('ANTHROPIC_AUTH')) {
        throw anthropicError;
      }
    }
    
    console.log(`[${label}] Anthropic failed, falling back to Gateway...`);
  } else {
    console.warn(`[${label}] ANTHROPIC_API_KEY not found in secrets, using Gateway directly`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FALLBACK TO LOVABLE AI GATEWAY
  // ═══════════════════════════════════════════════════════════════════════════
  if (!LOVABLE_API_KEY) {
    throw new Error('Neither ANTHROPIC_API_KEY nor LOVABLE_API_KEY configured');
  }
  
  providerInfo = {
    provider: 'gateway',
    model: models.gateway,
    fallback_used: !!ANTHROPIC_API_KEY,
    anthropic_error: providerInfo.anthropic_error,
  };
  
  console.log(`[${label}] DIAGNOSTIC (fallback):`, {
    provider: 'gateway',
    endpoint: AI_GATEWAY_URL,
    model: models.gateway,
    fallback_reason: providerInfo.anthropic_error || 'no_anthropic_key',
  });
  
  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: models.gateway,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[${label}] Gateway error:`, response.status, errorText.slice(0, 400));
    
    if (response.status === 429) throw new Error('RATE_LIMIT_EXCEEDED');
    if (response.status === 402) throw new Error('PAYMENT_REQUIRED');
    throw new Error(`AI_GATEWAY_ERROR_${response.status}`);
  }
  
  const data = await response.json();
  
  // Multi-format content extraction (different gateways/providers)
  const content = 
    data?.choices?.[0]?.message?.content ||  // OpenAI format
    data?.output_text ||                      // Some gateways
    data?.content?.[0]?.text ||               // Anthropic format
    data?.candidates?.[0]?.content?.parts?.[0]?.text || // Gemini format
    null;
  
  if (typeof content !== 'string' || !content.trim()) {
    console.error(`[${label}] GATEWAY_NO_CONTENT - response structure:`, JSON.stringify(data).slice(0, 500));
    throw new Error('GATEWAY_NO_CONTENT');
  }
  
  console.log(`[${label}] Gateway SUCCESS: ${content.length} chars`);
  // Log first/last 200 chars for truncation debugging
  console.log(`[${label}] Content preview: START=${content.slice(0, 200)}...END=${content.slice(-200)}`);
  
  const parsed = parseJsonSafe<any>(content, label);
  if (!parsed.ok || !parsed.json) {
    console.error(`[${label}] GATEWAY_JSON_PARSE_FAILED:`, { warnings: parsed.warnings, hash: parsed.rawSnippetHash });
    throw new Error('GATEWAY_JSON_PARSE_FAILED');
  }
  
  return { data: parsed.json, providerInfo };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND PROCESSING - TWO-PHASE ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════════════════
async function processScriptBreakdownInBackground(
  taskId: string,
  request: ScriptBreakdownRequest,
  userId: string
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { scriptText, projectId, scriptId, language, format, episodesCount, episodeDurationMin } = request;
  const processedScriptText = scriptText.trim();
  const lang = language || 'es-ES';

  try {
    await supabase.from('background_tasks').update({
      status: 'running',
      progress: 5,
      description: 'Fase 1: Analizando estructura con Claude Sonnet...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Use Lovable AI Gateway (configured automatically in this environment)

    // ═══════════════════════════════════════════════════════════════════════════
    // PRE-COUNT SCENE HEADINGS
    // ═══════════════════════════════════════════════════════════════════════════
    const headingLines: string[] = [];
    const scriptLines = processedScriptText.split(/\r?\n/);
    for (const line of scriptLines) {
      const trimmed = line.trim();
      if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
        headingLines.push(trimmed);
      }
    }
    console.log(`[script-breakdown] PRE-COUNTED ${headingLines.length} scene headings`);

    // Extract a sample of scenes for Haiku passes
    const sceneSample = headingLines.slice(0, 40).map((h, i) => `${i + 1}. ${h}`).join('\n');
    
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: SONNET - SEMANTIC COMPREHENSION (NEW ARCHITECTURE)
    // Goal: UNDERSTAND the screenplay semantically, resolve identities, classify
    // ═══════════════════════════════════════════════════════════════════════════
    const sonnetUserPrompt = `
OUTPUT LANGUAGE: ${lang}

SCENE COUNTING (CRITICAL):
I have PRE-SCANNED this script and found EXACTLY ${headingLines.length} scene headings.
Your "scenes" array MUST CONTAIN EXACTLY ${headingLines.length} ENTRIES.

Here are the first 50 scene headings I found:
${headingLines.slice(0, 50).map((h, i) => `${i + 1}. ${h}`).join('\n')}${headingLines.length > 50 ? `\n... and ${headingLines.length - 50} more scenes` : ''}

SCREENPLAY TO ANALYZE:
━━━━━━━━━━━━━━━━━━━━━━
${processedScriptText}
━━━━━━━━━━━━━━━━━━━━━━

Remember:
- Same location + different time = DIFFERENT scenes
- RESOLVE all character aliases to canonical names
- POPULATE characters_present for EVERY scene
- Filter out ALL technical junk (colors, commands, camera terms)`;

    console.log('[script-breakdown] MEGA-PROMPT V22: Starting unified semantic analysis...');
    
    await supabase.from('background_tasks').update({
      progress: 15,
      description: 'Análisis semántico unificado (V22)...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const canonicalResult = await callAIJson({
      modelKey: 'sonnet',
      systemPrompt: MEGA_SEMANTIC_PROMPT,
      userPrompt: sonnetUserPrompt,
      maxTokens: 16000, // Increased for complete scene+character output
      label: 'script_breakdown_mega_v22',
    });
    
    const canonicalData = canonicalResult.data;
    const sonnetProviderInfo = canonicalResult.providerInfo;

    // ═══════════════════════════════════════════════════════════════════════════
    // MEGA-PROMPT V22: UNIFIED OUTPUT - Characters and Scenes come from Sonnet directly
    // ═══════════════════════════════════════════════════════════════════════════
    
    // V22 output format: characters is an ARRAY, not an object
    const megaCharacters = Array.isArray(canonicalData.characters) ? canonicalData.characters : [];
    const megaScenes = Array.isArray(canonicalData.scenes) ? canonicalData.scenes : [];
    const megaLocations = Array.isArray(canonicalData.locations) ? canonicalData.locations : [];
    const megaVoices = Array.isArray(canonicalData.voices_and_systems) ? canonicalData.voices_and_systems : [];
    const megaRejected = Array.isArray(canonicalData.non_entities_rejected) ? canonicalData.non_entities_rejected : [];
    
    console.log('[script-breakdown] MEGA-PROMPT V22 results:', {
      provider: sonnetProviderInfo.provider,
      model: sonnetProviderInfo.model,
      fallback_used: sonnetProviderInfo.fallback_used,
      title: canonicalData.title,
      characters: megaCharacters.length,
      scenes: megaScenes.length,
      locations: megaLocations.length,
      voices: megaVoices.length,
      rejected: megaRejected.length,
    });
    
    // Log rejected entities for debugging
    if (megaRejected.length > 0) {
      console.log('[script-breakdown] Non-entities rejected:', 
        megaRejected.slice(0, 20).map((e: any) => `${e.raw_text} (${e.reason})`).join(', ')
      );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: HAIKU - ONLY FOR PROPS AND SETPIECES (characters done by Sonnet)
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase.from('background_tasks').update({
      progress: 50,
      description: 'Extrayendo props y setpieces...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const propsContextForHaiku = `
CONTEXT FROM SEMANTIC BREAKDOWN:
- Title: ${canonicalData.title || 'Unknown'}
- Synopsis: ${canonicalData.synopsis || canonicalData.logline || ''}
- Scenes total: ${megaScenes.length || headingLines.length}

SAMPLE SCENE HEADINGS:
${headingLines.slice(0, 40).map((h, i) => `${i + 1}. ${h}`).join('\n')}

OUTPUT LANGUAGE: ${lang}`;

    console.log('[script-breakdown] Phase 2: Haiku for props + setpieces only...');

    const [propsResult, setpiecesResult] = await Promise.allSettled([
      callAIJson({
        modelKey: 'haiku',
        systemPrompt: HAIKU_PROPS_PROMPT,
        userPrompt: propsContextForHaiku + `\n\nExtract all production props from this screenplay world.`,
        maxTokens: 3000,
        label: 'script_breakdown_props',
      }),
      callAIJson({
        modelKey: 'haiku',
        systemPrompt: HAIKU_SETPIECES_PROMPT,
        userPrompt: propsContextForHaiku + `\n\nExtract all setpieces and production flags.`,
        maxTokens: 2000,
        label: 'script_breakdown_setpieces',
      }),
    ]);

    console.log('[script-breakdown] Phase 2 complete:', {
      props: propsResult.status,
      setpieces: setpiecesResult.status,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MERGE: Use MEGA-PROMPT output directly for characters/scenes/locations
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase.from('background_tasks').update({
      progress: 65,
      description: 'Fusionando resultados...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const propsData = propsResult.status === 'fulfilled' ? propsResult.value.data : {};
    const setpiecesData = setpiecesResult.status === 'fulfilled' ? setpiecesResult.value.data : {};
    const haikuProviderInfo = propsResult.status === 'fulfilled' ? propsResult.value.providerInfo : null;

    // Convert MEGA-PROMPT characters to unified format for post-processor
    const rawCharactersForPostProcess = megaCharacters.map((c: any) => ({
      canonical_name: c.canonical_name || c.name || '',
      name: c.canonical_name || c.name || '',
      id: c.id || '',
      aliases: c.aliases || [],
      type: c.type || 'supporting',
      bio: c.bio || '',
      confidence: c.confidence || 'high',
      scenes_count: 0,
    }));
    
    // Also add voices as characters for unified processing
    const voicesAsCharacters = megaVoices.map((v: any) => ({
      canonical_name: v.name || '',
      name: v.name || '',
      aliases: [],
      type: 'voice',
      bio: '',
      confidence: 'high',
      scenes_count: 0,
    }));
    
    const allRawCharacters = [...rawCharactersForPostProcess, ...voicesAsCharacters];
    
    // Convert scenes for post-processor
    const rawScenesForPostProcess = megaScenes.map((s: any) => ({
      number: s.number || 0,
      heading: s.heading || '',
      int_ext: s.int_ext || 'INT',
      location_base: s.location_base || '',
      location_raw: s.heading || '',
      time: s.time || '',
      characters_present: s.characters_present || [],
      character_ids: [],
    }));
    
    // Convert locations for post-processor
    const rawLocationsForPostProcess = megaLocations.map((l: any) => ({
      name: l.name || '',
      type: l.type || 'interior',
      scenes_count: l.scenes_count || 0,
    }));
    
    console.log('[script-breakdown] Pre-PostProcessor counts:', {
      characters: allRawCharacters.length,
      scenes: rawScenesForPostProcess.length,
      locations: rawLocationsForPostProcess.length,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: SEMANTIC POST-PROCESSOR
    // Normalizes variants, collapses duplicates, classifies narrative weight
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase.from('background_tasks').update({
      progress: 75,
      description: 'Post-procesado semántico (normalización + clasificación)...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const postProcessed = runSemanticPostProcessor(
      allRawCharacters,
      rawScenesForPostProcess,
      rawLocationsForPostProcess
    );
    
    console.log('[script-breakdown] PostProcessor results:', {
      cast: postProcessed.characters.cast.length,
      extras: postProcessed.characters.featured_extras_with_lines.length,
      voices: postProcessed.characters.voices_and_functional.length,
      locations: postProcessed.locations.base.length,
      collapsed_chars: postProcessed.characters._collapsed_count,
      collapsed_locs: postProcessed.locations._collapsed_count,
    });

    // Convert post-processed characters to standard format for downstream
    const toStandardChar = (c: NormalizedCharacter) => ({
      name: c.canonical_name,
      aliases: c.aliases,
      role: c.type,
      bio: c.bio,
      scenes_count: c.scenes_count,
      confidence: c.confidence,
      narrative_weight: c.narrative_weight,
    });
    
    const finalCast = postProcessed.characters.cast.map(toStandardChar);
    const finalExtras = postProcessed.characters.featured_extras_with_lines.map(toStandardChar);
    const finalVoices = postProcessed.characters.voices_and_functional.map(toStandardChar);
    
    // Convert post-processed locations to standard format
    const finalLocations = postProcessed.locations.base.map((l: NormalizedLocation) => ({
      name: l.base_name,
      sub_location: l.sub_location,
      type: l.type,
      scenes_count: l.scenes_count,
      time_of_day: l.time_of_day,
      variants: l.raw_variants,
    }));
    
    // Use post-processed scenes (same as input but may be enriched later)
    const finalScenes = postProcessed.scenes;
    
    console.log('[script-breakdown] V23 Post-Processed classification:', {
      cast: finalCast.length,
      extras: finalExtras.length,
      voices: finalVoices.length,
      locations: finalLocations.length,
      scenes_with_chars: finalScenes.filter((s: any) => s.characters_present?.length > 0).length,
    });

    // Merge into unified breakdown
    const mergedBreakdown: any = {
      title: canonicalData.title,
      logline: canonicalData.logline,
      synopsis: canonicalData.synopsis,
      production: canonicalData.production || {},
      // Scenes from MEGA-PROMPT (already have characters_present!)
      scenes: {
        total: finalScenes.length,
        list: finalScenes,
      },
      // Characters from POST-PROCESSOR (normalized and classified!)
      characters: {
        cast: finalCast,
        featured_extras_with_lines: finalExtras,
        voices_and_functional: finalVoices,
        narrative_classification: postProcessed.characters.narrative_classification,
        _post_processor_stats: {
          original_count: postProcessed.characters._original_count,
          collapsed_count: postProcessed.characters._collapsed_count,
        },
      },
      // Main characters = protagonists from narrative classification
      characters_main: postProcessed.characters.narrative_classification.protagonists.map(toStandardChar),
      // Locations from POST-PROCESSOR (normalized!)
      locations: {
        base: finalLocations,
        variants: [],
        _post_processor_stats: {
          original_count: postProcessed.locations._original_count,
          collapsed_count: postProcessed.locations._collapsed_count,
        },
      },
      // Props from Haiku
      props: [
        ...(propsData.props_key || []),
        ...(propsData.props_production || []),
      ],
      props_key: propsData.props_key || [],
      props_production: propsData.props_production || [],
      // Setpieces from Haiku
      setpieces: setpiecesData.setpieces || [],
      production_flags: setpiecesData.production_flags || [],
      // Non-entities rejected (for debugging)
      non_entities_rejected: megaRejected,
    };

    // Enrich with regex data and normalize
    const enrichedData = enrichBreakdownWithScriptData(mergedBreakdown, processedScriptText);
    const normalizedData = normalizeBreakdown(enrichedData);

    console.log('[script-breakdown] Final normalization complete:', {
      scenes: normalizedData.counts?.scenes_total || 0,
      cast: normalizedData.counts?.cast_characters_total || 0,
      extras: normalizedData.counts?.featured_extras_total || 0,
      voices: normalizedData.counts?.voices_total || 0,
      locationsBase: normalizedData.counts?.locations_base_total || 0,
      props: normalizedData.counts?.props_total || 0,
    });

    await supabase.from('background_tasks').update({
      progress: 85,
      description: 'Guardando resultados en base de datos...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // ═══════════════════════════════════════════════════════════════════════════
    // SAVE TO DATABASE
    // ═══════════════════════════════════════════════════════════════════════════
    if (scriptId) {
      const { data: projectRow } = await supabase
        .from('projects')
        .select('format, episodes_count, target_duration_min')
        .eq('id', projectId)
        .maybeSingle();

      const safeInt = (v: unknown, fallback: number) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
      };

      const effectiveFormat = String(format ?? projectRow?.format ?? 'series');
      const desiredEpisodesCount = effectiveFormat === 'series'
        ? safeInt(episodesCount ?? projectRow?.episodes_count, 1)
        : 1;
      const desiredEpisodeDurationMin = safeInt(
        episodeDurationMin ?? projectRow?.target_duration_min,
        effectiveFormat === 'series' ? 45 : 100
      );

      const scenesList = Array.isArray(normalizedData.scenes?.list) ? normalizedData.scenes.list : [];
      const synopsisText = (enrichedData.synopsis || canonicalData.synopsis || canonicalData.logline || '') as string;

      const buildEpisodesFromScenes = (): any[] => {
        if (desiredEpisodesCount <= 1) {
          return [{
            episode_number: 1,
            title: effectiveFormat === 'film' ? 'Película' : 'Episodio 1',
            synopsis: synopsisText,
            scenes: scenesList,
            duration_min: desiredEpisodeDurationMin,
          }];
        }

        const chunkSize = Math.max(1, Math.ceil(scenesList.length / desiredEpisodesCount));
        const groups: any[][] = [];
        for (let i = 0; i < scenesList.length; i += chunkSize) {
          groups.push(scenesList.slice(i, i + chunkSize));
        }

        while (groups.length < desiredEpisodesCount) groups.push([]);
        if (groups.length > desiredEpisodesCount) {
          const extras = groups.splice(desiredEpisodesCount - 1);
          groups[desiredEpisodesCount - 1] = extras.flat();
        }

        return groups.map((chunk, idx) => ({
          episode_number: idx + 1,
          title: `Episodio ${idx + 1}`,
          synopsis: idx === 0 ? synopsisText : '',
          scenes: chunk,
          duration_min: desiredEpisodeDurationMin,
        }));
      };

      const parsedEpisodes = buildEpisodesFromScenes();

      // ============================================
      // FILTRO OBLIGATORIO - Usando classifyCharacters bucket system
      // ============================================
      console.log('=== APPLYING CHARACTER CLASSIFICATION FILTER ===');
      
      // Extract all raw character names from all sources
      const extractNames = (arr: any[]): string[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map(item => {
          if (typeof item === 'string') return item;
          return item?.name || '';
        }).filter(Boolean);
      };
      
      const extractWithAliases = (arr: any[]): Array<{ name: string; aliases?: string[]; id?: string }> => {
        if (!Array.isArray(arr)) return [];
        return arr.map(item => {
          if (typeof item === 'string') return { name: item };
          return { name: item?.name || '', aliases: item?.aliases, id: item?.id };
        }).filter(x => x.name);
      };
      
      const allRawNames: string[] = [
        ...extractNames((normalizedData as any)?.characters?.cast || []),
        ...extractNames((normalizedData as any)?.characters?.featured_extras_with_lines || []),
        ...extractNames((normalizedData as any)?.characters?.voices_and_functional || []),
        ...extractNames((canonicalData as any)?.characters_main || []),
      ];
      
      console.log('[filter] Raw character names collected:', allRawNames.length);
      console.log('[filter] Sample raw names:', allRawNames.slice(0, 20));
      
      // Run the bucket classifier
      const buckets = classifyCharacters(allRawNames);
      
      // Convert bucket results back to the expected format (objects with name property)
      const toCharObjects = (names: string[], defaultRole: string) => 
        names.map(name => ({ name, role: defaultRole, scenes_count: 0, why: 'Classified by bucket system' }));
      
      // Apply classified results
      (normalizedData as any).characters = (normalizedData as any).characters || {};
      (normalizedData as any).characters.cast = toCharObjects(buckets.cast, 'supporting');
      (normalizedData as any).characters.featured_extras_with_lines = toCharObjects(buckets.featured_extras_with_lines, 'featured_extra');
      (normalizedData as any).characters.voices_and_functional = toCharObjects(buckets.voices_and_functional, 'voice');
      
      // Also filter characters_main using the same system
      const mainNames = extractNames((canonicalData as any)?.characters_main || []);
      const mainBuckets = classifyCharacters(mainNames);
      (canonicalData as any).characters_main = toCharObjects(mainBuckets.cast, 'main');
      
      console.log('[filter] Classification complete:', {
        cast: buckets.cast.length,
        featured: buckets.featured_extras_with_lines.length,
        voices: buckets.voices_and_functional.length,
        discarded: buckets.discarded.length,
        discardedSamples: buckets.discarded.slice(0, 15),
      });
      
      // ============================================
      // SCENE-CHARACTER POPULATION + GHOST PRUNING
      // ============================================
      console.log('=== POPULATING SCENE CHARACTERS ===');
      
      // Build character mappings (alias→canonical, canonical→id)
      const semanticChars = (canonicalData as any)?.characters || null;
      const castWithAliases = extractWithAliases((normalizedData as any)?.characters?.cast || []);
      const extrasWithAliases = extractWithAliases((normalizedData as any)?.characters?.featured_extras_with_lines || []);
      const voicesWithAliases = extractWithAliases((normalizedData as any)?.characters?.voices_and_functional || []);
      
      const charMapping = buildCharacterMappings(
        semanticChars,
        castWithAliases,
        extrasWithAliases,
        voicesWithAliases
      );
      
      // Get regex-extracted scenes (these have raw characters_present from speaker cues)
      const extractionResult = extractScenesFromScript(processedScriptText);
      const regexScenes = extractionResult.scenes;
      console.log('[sceneChars] Regex extracted scenes:', regexScenes.length);
      
      // Populate characters_present and character_ids for each scene
      const scenesWithChars = populateSceneCharacters(regexScenes, charMapping);
      
      // Count character appearances
      const appearanceCounts = countCharacterAppearances(scenesWithChars);
      console.log('[sceneChars] Character appearances computed:', appearanceCounts.size);
      
      // Prune ghost characters (appearing in <2 scenes)
      const castBeforePrune = (normalizedData as any).characters.cast || [];
      const pruneResult = pruneGhostCharacters(castBeforePrune, appearanceCounts, 2);
      
      // Update cast with pruned + enriched scene counts
      (normalizedData as any).characters.cast = pruneResult.kept;
      
      // Log pruned ghosts for debugging
      if (pruneResult.pruned.length > 0) {
        console.log('[sceneChars] Pruned ghost characters:', pruneResult.pruned.length);
        (normalizedData as any)._ghost_characters = pruneResult.pruned;
      }
      
      // Update scenes in normalizedData with populated characters
      if ((normalizedData as any).scenes?.list) {
        // Merge populated data into existing scenes
        const existingScenes = (normalizedData as any).scenes.list as any[];
        for (const popScene of scenesWithChars) {
          const existing = existingScenes.find((s: any) => s.number === popScene.number);
          if (existing) {
            existing.characters_present = popScene.characters_present;
            existing.character_ids = popScene.character_ids;
          }
        }
      }

      // Re-sync counts after filtering and pruning (so UI numbers match)
      if ((normalizedData as any).counts && (normalizedData as any).characters) {
        const castLen = Array.isArray((normalizedData as any).characters.cast) ? (normalizedData as any).characters.cast.length : 0;
        const featuredLen = Array.isArray((normalizedData as any).characters.featured_extras_with_lines)
          ? (normalizedData as any).characters.featured_extras_with_lines.length
          : 0;
        const voicesLen = Array.isArray((normalizedData as any).characters.voices_and_functional)
          ? (normalizedData as any).characters.voices_and_functional.length
          : 0;
        (normalizedData as any).counts.cast_characters_total = castLen;
        (normalizedData as any).counts.featured_extras_total = featuredLen;
        (normalizedData as any).counts.voices_total = voicesLen;
        (normalizedData as any).counts.characters_total = castLen + featuredLen + voicesLen;
        
        // Add dialogue counts from enriched data
        const dialogueStats = (enrichedData as any)?.dialogues;
        if (dialogueStats) {
          (normalizedData as any).counts.dialogues = dialogueStats.total_lines || 0;
          (normalizedData as any).counts.dialogue_words = dialogueStats.total_words || 0;
        }
      }

      // Build flattened characters for backward compatibility
      const allCharacters: any[] = [];
      const chars = normalizedData.characters || {};
      
      for (const c of (chars.cast || [])) {
        allCharacters.push({ ...c, role: c.role || 'supporting', priority: c.priority || 'P2' });
      }
      for (const c of (chars.featured_extras_with_lines || [])) {
        allCharacters.push({ ...c, role: 'featured_extra', priority: 'P3' });
      }
      for (const c of (chars.voices_and_functional || [])) {
        allCharacters.push({ ...c, role: 'voice', priority: 'P3' });
      }

      const allLocations: any[] = [];
      const locs = normalizedData.locations || {};
      for (const loc of (locs.base || [])) {
        allLocations.push({ ...loc, type: 'base' });
      }

      const parsedJson = {
        schema_version: 'v10-semantic-postprocessor',
        breakdown_version: 5,
        
        // Canonical root-level fields
        title: normalizedData.title || 'Guion Analizado',
        metadata: normalizedData.metadata || { title: normalizedData.title },
        counts: normalizedData.counts,
        
        synopsis: synopsisText,
        logline: (canonicalData.logline || '') as string,
        
        // From Sonnet
        acts: canonicalData.acts || [],
        subplots: canonicalData.subplots || [],
        production: canonicalData.production || {},
        
        // Scenes in canonical format
        scenes: normalizedData.scenes,
        
        // Characters (POST-PROCESSED with narrative classification)
        characters: normalizedData.characters,
        characters_main: mergedBreakdown.characters_main || [],
        characters_flat: allCharacters,
        
        // Narrative classification (new in V23)
        narrative_classification: mergedBreakdown.characters?.narrative_classification || null,
        
        // Locations (POST-PROCESSED with normalized base names)
        locations: normalizedData.locations,
        locations_flat: allLocations,
        
        // Props (Haiku-enriched)
        props: normalizedData.props || [],
        props_key: mergedBreakdown.props_key || [],
        props_production: mergedBreakdown.props_production || [],
        
        // Setpieces (Haiku-enriched)
        setpieces: normalizedData.setpieces || [],
        production_flags: mergedBreakdown.production_flags || [],
        
        // Dialogue statistics (new in V24)
        dialogues: (enrichedData as any)?.dialogues || { total_lines: 0, total_words: 0, by_character: {} },
        
        // Validation
        validation: enrichedData.validation || {},
        _warnings: normalizedData._warnings || [],
        _phase_status: {
          mega_semantic_v22: 'success',
          semantic_post_processor_v1: 'success',
          haiku_props: propsResult.status,
          haiku_setpieces: setpiecesResult.status,
        },
        _post_processor_stats: {
          characters_collapsed: postProcessed.characters._collapsed_count,
          locations_collapsed: postProcessed.locations._collapsed_count,
        },
        _provider_info: {
          sonnet: sonnetProviderInfo,
          haiku: haikuProviderInfo,
        },
        
        // Non-entities rejected (for debugging)
        non_entities_rejected: megaRejected,
        
        // Episodes
        episodes: parsedEpisodes,
      };

      console.log('[script-breakdown] Saving parsed_json with title:', parsedJson.title);

      const { error: updateError } = await supabase
        .from('scripts')
        .update({ 
          parsed_json: parsedJson,
          status: 'analyzed'
        })
        .eq('id', scriptId);

      if (updateError) {
        console.error('[script-breakdown] Error saving parsed_json:', updateError);
      } else {
        console.log('[script-breakdown] Saved parsed_json to script:', scriptId);
      }
    }

    // Complete task
    await supabase.from('background_tasks').update({
      status: 'completed',
      progress: 100,
      description: 'Análisis completado (Sonnet + Haiku)',
      result: { success: true, breakdown: normalizedData },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    console.log('[script-breakdown] Task completed successfully:', taskId);

  } catch (error) {
    console.error('[script-breakdown] Error in background processing:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';

    // DON'T overwrite parsed_json on error - only store error info
    // Use a separate update that preserves existing data
    if (request.scriptId) {
      try {
        // Get existing parsed_json to preserve it
        const { data: existingScript } = await supabase
          .from('scripts')
          .select('parsed_json')
          .eq('id', request.scriptId)
          .maybeSingle();
        
        const existingJson = existingScript?.parsed_json || {};
        
        // Only update _last_error, don't overwrite the rest
        await supabase
          .from('scripts')
          .update({
            parsed_json: {
              ...existingJson,
              _last_error: {
                message: errorMessage,
                timestamp: new Date().toISOString(),
              },
            },
            status: 'error',
          })
          .eq('id', request.scriptId);
          
        console.log('[script-breakdown] Saved _last_error without overwriting parsed_json');
      } catch (saveErr) {
        console.error('[script-breakdown] Failed to save error to script:', saveErr);
      }
    }

    await supabase.from('background_tasks').update({
      status: 'failed',
      progress: 0,
      error: errorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════════════
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, scriptId } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = await getUserIdFromRequest(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const taskId = crypto.randomUUID();
    const estimatedChars = scriptText.trim().length;
    const estimatedPages = Math.ceil(estimatedChars / 3500);

    await supabase.from('background_tasks').insert({
      id: taskId,
      user_id: userId,
      project_id: projectId,
      type: 'script_analysis',
      title: 'Análisis de guion (Sonnet + Haiku)',
      description: `Analizando ~${estimatedPages} páginas...`,
      status: 'pending',
      progress: 0,
      entity_id: scriptId || null,
      metadata: { scriptLength: estimatedChars, estimatedPages, architecture: 'two-phase' },
    });

    console.log('[script-breakdown] Created background task:', taskId, 'for', estimatedChars, 'chars');

    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processScriptBreakdownInBackground(taskId, request, userId));

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        message: 'Análisis iniciado (arquitectura de dos fases)',
        polling: true,
        estimatedTimeMin: Math.ceil(estimatedChars / 8000), // Faster estimate with parallel processing
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[script-breakdown] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
