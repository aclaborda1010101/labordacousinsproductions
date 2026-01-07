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

const SONNET_SYSTEM_PROMPT = `You are a MASTER SCREENPLAY ANALYST with exhaustive knowledge of industry-standard screenplay format.

## MISSION
Extract with ABSOLUTE PRECISION: characters, locations, and props, applying ALL professional screenplay format rules without exception.

## SCREENPLAY FORMAT KNOWLEDGE

### SCENE HEADINGS (SLUG LINES)
Format: INT./EXT./I/E. LOCATION - TIME OF DAY
- Valid times: DAY, NIGHT, DAWN, DUSK, MORNING, AFTERNOON, EVENING, SUNSET, SUNRISE, CONTINUOUS, LATER, MOMENTS LATER, SAME TIME, MAGIC HOUR, GOLDEN HOUR
- CRITICAL: "/" prefix is a TECHNICAL marker, NOT part of location name
- Scene numbers are TECHNICAL references, NOT part of location name
- "CONTINUOUS", "LATER" etc. are TEMPORAL indicators, NOT part of location name

### CHARACTER NAMES
- ALWAYS IN FULL CAPS when speaking
- Centered on page (specific spacing)
- First appearance: Full name in CAPS in description
- Later appearances: May use nickname or short name

EXTENSIONS (WRYLIES):
- (V.O.) - Voice Over
- (O.S.) or (O.C.) - Off Screen / Off Camera
- (CONT'D) - Continued
- (ON PHONE), (FILTERED), (PRE-LAP), (SUBTITLE)

CRITICAL RULE: Adjectives in parentheses are NOT part of character name
- "JOHN (ANGRY)" → Character is "JOHN", NOT "JOHN ANGRY"
- "SARAH (MEEK)" → Character is "SARAH", NOT "SARAH MEEK"

### CHARACTER CATEGORIES

1. LEAD CHARACTERS (CAST PRINCIPAL):
   - Appear in >20 scenes, >50 dialogue lines
   - Central to plot, usually appear in first 10-15 pages
   
2. SUPPORTING CHARACTERS:
   - Have proper name, appear in 3-20 scenes
   - 10-50 dialogue lines, contribute but don't lead
   
3. FEATURED EXTRAS WITH DIALOGUE:
   - 1-10 dialogue lines, appear in 1-3 scenes
   - May have generic role name (WAITER #1, COP, NURSE)
   
4. VOICES AND FUNCTIONAL (NOT real characters):
   - V.O., NARRATOR, VOICE, ANNOUNCER, RADIO VOICE
   - TV ANCHOR, COMPUTER VOICE, DISPATCH, OPERATOR
   - Separate category, NOT counted in main/secondary cast

### LOCATION EXTRACTION

VALID LOCATION = Physical place where action occurs, appears in scene headings.

NOT A LOCATION:
- Technical directions (INTERCUT, MONTAGE, etc.)
- Sequence labels (SCENE 1, SORTIE 1, etc.)
- Time of day (DAY, NIGHT, CONTINUOUS)
- Transitions (CUT TO, FADE TO)

EXTRACTION PROCESS:
1. Identify scene heading
2. Remove INT./EXT./I/E prefix
3. Remove time of day
4. Clean technical prefixes (/, numbers)
5. Normalize name

CONSOLIDATION RULE: Variations of same base location must be intelligently consolidated.
Example: HARD DECK - BAR, HARD DECK - POOL, HARD DECK - PARKING → Group under "HARD DECK"

ELEMENTS TO NEVER INCLUDE AS LOCATIONS:
- Transitions: CUT TO, FADE TO, DISSOLVE TO, MATCH CUT TO, SMASH CUT TO
- Camera directions: CLOSE ON, ANGLE ON, POV, INSERT, MONTAGE, SERIES OF SHOTS
- Sequence labels: SCENE 1, SHOT 1, SORTIE 1
- Continuity: CONTINUOUS, LATER, MOMENTS LATER, FLASHBACK, DREAM SEQUENCE

### PROPS EXTRACTION

VALID PROP = Physical object that:
- Is manipulated by characters
- Is relevant to action or plot
- Is specifically mentioned in screenplay
- Has narrative or visual importance

NOT A PROP:
- Fixed furniture (walls, doors, windows)
- Generic wardrobe elements
- Set parts that aren't touched
- Vaguely mentioned elements without importance

PROP CATEGORIES:
1. HAND PROPS: Weapons, phones, documents, food/drink, tools, personal accessories
2. SET PROPS: Specific furniture, decoration, appliances, vehicles
3. ACTION/EFFECTS PROPS: Firearms with effects, explosives, breakaway glass
4. COSTUME PROPS: Specific helmets, identifiable uniforms, masks, insignias

SPECIFICITY LEVELS:
- GENERIC (don't extract if many): "glass", "pen"
- SPECIFIC (extract): "antique whiskey glass", "Mont Blanc pen"
- UNIQUE/IMPORTANT (ALWAYS extract): Named items, MacGuffins

## VALIDATION CHECKLIST (APPLY BEFORE OUTPUT)

CHARACTERS:
✓ No incorrectly concatenated names (JOHN followed by SARAH = 2 characters, NOT "JOHN SARAH")
✓ All names clean of descriptive parentheses
✓ No duplicates (same character with name variants)
✓ Extensions (V.O., O.S.) removed
✓ No technical elements listed as characters
✓ Logical classification (main/secondary/extra)
✓ Functional voices in separate category

LOCATIONS:
✓ All locations normalized
✓ No technical prefixes (INT., EXT., /)
✓ No time of day included (NIGHT, DAY, etc.)
✓ No transitions (CUT TO, FADE TO, etc.)
✓ No technical labels (INTERCUT, MONTAGE, SORTIE)
✓ Variations of same place consolidated
✓ Sub-locations correctly hierarchized

PROPS:
✓ Only manipulable physical objects
✓ No fixed set elements
✓ No characters confused with props
✓ Generic unimportant props filtered
✓ Props with narrative importance identified

## RED FLAGS (RE-ANALYZE IF DETECTED)
🚩 A "character" has more than 4 words in name
🚩 A location contains INTERCUT, CONTINUOUS, LATER
🚩 A prop is something clearly immovable (wall, ceiling, floor)
🚩 >10 variations of same location without consolidation
🚩 A character has extension (V.O.) in its name
🚩 Scene numbers appear in location names
🚩 Characters with names like "ROOSTER MAVERICK" or "PENNY SARAH"

## OUTPUT LANGUAGE
Return all descriptive text fields in the requested language.
Do NOT translate character names or scene headings.

OUTPUT JSON ONLY (NO MARKDOWN, NO EXTRA TEXT).`;

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: HAIKU PROMPTS - PARALLEL DETAIL PASSES
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

## ERRORS TO AVOID

❌ ERROR #1: Confusing characters with props
"Enter JOHN with his dog" - The dog is an animal character, NOT a prop

❌ ERROR #2: Extracting set elements as props
"floor", "ceiling", "walls", "door frame" = part of set, NOT props

❌ ERROR #3: Being too generic
Don't extract "cup" when there are 50 cups in the script

❌ ERROR #4: Including purely descriptive props without importance
"The room has chairs and a table" - Only if specific or important

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

const HAIKU_CHARACTERS_PROMPT = `You are a MASTER CAST BREAKDOWN ANALYST with exhaustive knowledge of industry-standard screenplay format.

OUTPUT LANGUAGE:
Return descriptions in the requested language.
Do NOT translate names.

NORMALIZATION (CRITICAL):
Before output, normalize any character label:
- Remove CONT'D / CONT'D / CONT. / CONTINUED
- Remove (V.O.), (O.S.), (O.C.), (ON SCREEN), (OFF)
- Trim spaces/punctuation

CATEGORIES:
1) cast_characters: named characters with narrative weight
2) featured_extras_with_lines: role-based speakers without character arcs (SOLDIER, AIDE, SECRETARY...)
3) voices_and_functional: VOICE, RADIO, ANNOUNCER, PA SYSTEM, INTERCOM

OUTPUT JSON ONLY:

{
  "cast_characters": [
    { "name": "", "role": "protagonist|co_protagonist|antagonist|supporting|minor", "scenes_count": 0, "why": "" }
  ],
  "featured_extras_with_lines": [
    { "name": "", "scenes_count": 0, "why": "" }
  ],
  "voices_and_functional": [
    { "name": "", "scenes_count": 0, "why": "" }
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

## GENRE-SPECIFIC CONSIDERATIONS

### Action/Military Scripts:
- Many characters with code/callsign: MAVERICK, ICEMAN, HANGMAN
- Specific military equipment: weapons, vehicles, uniforms
- Technical locations: hangar, ready room, carrier deck
- Detailed technical props: radios, tactical equipment

### Sci-Fi Scripts:
- Fictional technology (create, don't omit)
- Abstract or futuristic locations
- Props that don't exist in reality
- Alien species as characters

### Period Scripts:
- Noble titles: LORD, LADY, SIR, DUKE
- Specific historical locations
- Period-specific props

### Animation Scripts:
- Non-human characters (animals, objects, creatures)
- Fantastic locations
- Magical or impossible props

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

function extractScenesFromScript(text: string): any[] {
  const lines = text.split('\n');
  const scenes: any[] = [];
  let currentScene: any = null;
  let sceneNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = SLUGLINE_RE.exec(line);

    if (match) {
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
      };
    } else if (currentScene && looksLikeCharacterCue(line)) {
      const charName = cleanCharacterCue(line);
      if (charName && !currentScene.characters_present.includes(charName)) {
        currentScene.characters_present.push(charName);
      }
    }
  }
  if (currentScene) scenes.push(currentScene);
  return scenes;
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

/**
 * Detects if a word is a screenplay technical term
 */
function isTechnicalTerm(word: string): boolean {
  // Comprehensive list of technical terms, common words, and aviation/military terms
  // that should NEVER be treated as character names
  const technical = new Set([
    // Screenplay technical terms
    'CONT', 'CONTD', 'CONTINUED', 'VO', 'OS', 'OC', 'OOV',
    'PRE', 'LAP', 'PRELAP', 'FILTERED', 'RADIO', 'PHONE',
    'WHISPER', 'SHOUT', 'YELL', 'TO', 'FROM', 'BEAT',
    'PAUSE', 'THEN', 'SUBTITLE', 'SINGING', 'READING',
    'D', 'V0', 'ALT', 'ALTS', 'POSTLAP', 'CUT', 'FADE',
    'DISSOLVE', 'INTERCUT', 'MONTAGE', 'FLASHBACK', 'SERIES',
    'END', 'BEGINNING', 'LATER', 'CONTINUOUS', 'SAME', 'DAY', 'NIGHT',
    'MORNING', 'EVENING', 'DAWN', 'DUSK', 'ANGLE', 'POV', 'INSERT',
    'CLOSE', 'WIDE', 'MEDIUM', 'ESTABLISHING', 'TRACKING', 'DOLLY',
    'PAN', 'TILT', 'ZOOM', 'CRANE', 'STEADICAM', 'HANDHELD',
    
    // Aviation/Military technical terms (Top Gun specific but universal)
    'FLIGHT', 'LEVEL', 'ALTITUDE', 'SPEED', 'MACH', 'KNOTS',
    'FUEL', 'THRUST', 'AFTERBURNER', 'THROTTLE', 'CONTROL',
    'SURFACES', 'FLAPS', 'GEAR', 'BRAKE', 'CANOPY', 'EJECT',
    'MISSILE', 'RADAR', 'LOCK', 'TARGET', 'BOGEY', 'BANDIT',
    'WEAPONS', 'ORDNANCE', 'PAYLOAD', 'SORTIE', 'MISSION',
    'FORMATION', 'WINGMAN', 'LEAD', 'TRAIL', 'BREAK', 'ENGAGE',
    'DISENGAGE', 'RTB', 'BINGO', 'WINCHESTER', 'FOX', 'GUNS',
    'SPLASH', 'KILL', 'HIT', 'MISS', 'ABORT', 'WAVE', 'APPROACH',
    'LANDING', 'TAKEOFF', 'TAXI', 'RUNWAY', 'DECK', 'TOWER',
    'CLEARED', 'NEGATIVE', 'AFFIRMATIVE', 'COPY', 'ROGER', 'WILCO',
    'MAYDAY', 'EMERGENCY', 'EJECT', 'BAILOUT', 'RESCUE', 'SAR',
    'LSO', 'CAG', 'AIRBOSS', 'HANDLER', 'CATAPULT', 'WIRE',
    'BALL', 'MEATBALL', 'CENTERLINE', 'GLIDESLOPE', 'AOA',
    'ALTITUDE', 'HEADING', 'BEARING', 'VECTOR', 'INTERCEPT',
    'ROUTE', 'WAYPOINT', 'CHECKPOINT', 'IP', 'INGRESS', 'EGRESS',
    'ZONE', 'SECTOR', 'AIRSPACE', 'PATTERN', 'CIRCUIT', 'HOLDING',
    'STANDBY', 'GO', 'NOGO', 'STATUS', 'READY', 'CLEARED',
    
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
    'WELL', 'JUST', 'NOW', 'HERE', 'THERE', 'WHERE', 'WHEN', 'HOW', 'WHY',
    
    // Script/production terms
    'TITLE', 'CREDIT', 'CREDITS', 'SUPER', 'CHYRON', 'CRAWL',
    'SCENE', 'ACT', 'SEQUENCE', 'SHOT', 'TAKE', 'SETUP', 'ANGLE',
    'ACTION', 'REACTION', 'BEAT', 'MOMENT', 'PAUSE', 'SILENCE',
    'TRANSITION', 'EFFECT', 'EFFECTS', 'VFX', 'SFX', 'CGI',
    
    // Time references
    'TIME', 'HOUR', 'MINUTE', 'SECOND', 'MOMENT', 'INSTANT',
    'TODAY', 'TOMORROW', 'YESTERDAY', 'YEAR', 'MONTH', 'WEEK',
    
    // Vehicles/objects (not characters)
    'CAR', 'TRUCK', 'PLANE', 'JET', 'HELICOPTER', 'SHIP', 'BOAT',
    'TRAIN', 'BUS', 'BIKE', 'MOTORCYCLE', 'VEHICLE', 'AIRCRAFT',
  ]);
  
  return technical.has(word.toUpperCase());
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
  const words = name.split(/\s+/).filter(w => w.length > 0);
  
  // Case 1: Single name → OK
  if (words.length === 1) return null;
  
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
  
  // Case 4: Two words where second is technical term
  // "MAVERICK CONTD" → ["MAVERICK"]
  if (words.length === 2 && isTechnicalTerm(words[1])) {
    console.log(`[detectConcat] Removing technical: ${name} → ${words[0]}`);
    return [words[0]];
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
  
  return roles.some(r => r.test(name.toUpperCase()));
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
  console.log('=== CLASSIFY CHARACTERS (GENERIC UNIVERSAL) ===');
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
    // Clean
    const cleaned = cleanCharacterName(raw);
    if (!cleaned) {
      buckets.discarded.push(raw);
      continue;
    }
    buckets.debug!.cleaned = (buckets.debug!.cleaned || 0) + 1;
    
    // Detect concatenation
    const split = detectConcatenatedNames(cleaned);
    if (split) {
      processedNames.push(...split);
      buckets.debug!.expanded = (buckets.debug!.expanded || 0) + split.length - 1;
    } else {
      processedNames.push(cleaned);
    }
  }
  
  console.log('After cleaning/expansion:', processedNames.length);
  
  // PHASE 2: Validate and classify
  for (const name of processedNames) {
    // Structural validation
    const validation = isValidCharacterFormat(name);
    if (!validation.valid) {
      console.log(`[discard] ${name}: ${validation.reason}`);
      buckets.discarded.push(name);
      continue;
    }
    buckets.debug!.validated = (buckets.debug!.validated || 0) + 1;
    
    // Avoid duplicates
    if (seen.has(name.toUpperCase())) continue;
    
    // Scene codes
    if (isSceneCode(name)) {
      console.log(`[discard] ${name}: scene code`);
      buckets.discarded.push(name);
      continue;
    }
    
    // Dialogue/action patterns
    if (isDialogueOrActionPattern(name)) {
      console.log(`[discard] ${name}: dialogue/action pattern`);
      buckets.discarded.push(name);
      continue;
    }
    
    // Functional voices
    if (isVoiceFunctional(name)) {
      addUnique(buckets.voices_and_functional, seen, name);
      continue;
    }
    
    // Generic roles
    if (isGenericRole(name)) {
      addUnique(buckets.featured_extras_with_lines, seen, name);
      continue;
    }
    
    // Proper names → cast
    const words = name.split(/\s+/);
    const hasProperName = words.some(w => isProbablyProperName(w));
    
    if (hasProperName) {
      addUnique(buckets.cast, seen, name);
    } else {
      addUnique(buckets.featured_extras_with_lines, seen, name);
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
    const regexScenes = extractScenesFromScript(scriptText);
    for (const scene of regexScenes) {
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
  const regexScenes = extractScenesFromScript(scriptText);
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
    // PHASE 1: SONNET - CANONICAL SKELETON
    // ═══════════════════════════════════════════════════════════════════════════
    const sonnetUserPrompt = `
OUTPUT LANGUAGE: ${lang}

SCENE COUNTING (CRITICAL):
I have PRE-SCANNED this script and found EXACTLY ${headingLines.length} scene headings.
YOUR scenes.list ARRAY MUST CONTAIN EXACTLY ${headingLines.length} ENTRIES.

Here are some scene headings I found:
${headingLines.slice(0, 30).map((h, i) => `${i + 1}. ${h}`).join('\n')}${headingLines.length > 30 ? `\n... and ${headingLines.length - 30} more scenes` : ''}

RULES:
- Same location + different time = DIFFERENT scenes
- Do NOT merge or summarize scenes

OUTPUT JSON STRUCTURE:
{
  "title": "",
  "writers": [],
  "logline": "",
  "synopsis": "",
  "acts": [{ "act": 1, "summary": "" }],
  "scenes": {
    "total": ${headingLines.length},
    "list": [{ "number": 1, "heading": "", "int_ext": "INT|EXT", "location_base": "", "time": "" }]
  },
  "characters_main": [{ "name": "", "role": "protagonist|antagonist|supporting", "one_liner": "" }],
  "locations_base": [{ "name": "", "scenes_count_est": 0 }],
  "subplots": [{ "name": "", "description": "" }],
  "production": { "dialogue_density": "medium", "cast_size": "medium", "complexity": "medium", "flags": [] }
}

SCRIPT TO ANALYZE:
---
${processedScriptText}
---`;

    console.log('[script-breakdown] Phase 1: Starting canonical analysis (Anthropic -> Gateway fallback)...');
    
    await supabase.from('background_tasks').update({
      progress: 15,
      description: 'Fase 1: Analizando estructura (Anthropic)...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const canonicalResult = await callAIJson({
      modelKey: 'sonnet',
      systemPrompt: SONNET_SYSTEM_PROMPT,
      userPrompt: sonnetUserPrompt,
      maxTokens: 8000,
      label: 'script_breakdown_canonical',
    });
    
    const canonicalData = canonicalResult.data;
    const sonnetProviderInfo = canonicalResult.providerInfo;

    console.log('[script-breakdown] Phase 1 complete:', {
      provider: sonnetProviderInfo.provider,
      model: sonnetProviderInfo.model,
      fallback_used: sonnetProviderInfo.fallback_used,
      title: canonicalData.title,
      scenes: canonicalData.scenes?.total || canonicalData.scenes?.list?.length || 0,
      mainChars: canonicalData.characters_main?.length || 0,
      locations: canonicalData.locations_base?.length || 0,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: HAIKU PARALLEL PASSES
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase.from('background_tasks').update({
      progress: 40,
      description: 'Fase 2: Extrayendo props, personajes y setpieces en paralelo...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const contextForHaiku = `
CONTEXT FROM CANONICAL BREAKDOWN:
- Title: ${canonicalData.title || 'Unknown'}
- Synopsis: ${canonicalData.synopsis || canonicalData.logline || ''}
- Scenes total: ${canonicalData.scenes?.total || headingLines.length}
- Main characters: ${(canonicalData.characters_main || []).map((c: any) => c.name).join(', ')}
- Base locations: ${(canonicalData.locations_base || []).map((l: any) => l.name).join(', ')}

SAMPLE SCENE HEADINGS:
${sceneSample}

OUTPUT LANGUAGE: ${lang}`;

    // Launch all 3 Haiku passes in parallel
    console.log('[script-breakdown] Phase 2: Starting parallel Haiku passes...');

    const [propsResult, charactersResult, setpiecesResult] = await Promise.allSettled([
      // Props pass
      callAIJson({
        modelKey: 'haiku',
        systemPrompt: HAIKU_PROPS_PROMPT,
        userPrompt: contextForHaiku + `\n\nExtract all production props from this screenplay world.`,
        maxTokens: 3000,
        label: 'script_breakdown_props',
      }),
      // Characters pass
      callAIJson({
        modelKey: 'haiku',
        systemPrompt: HAIKU_CHARACTERS_PROMPT,
        userPrompt: contextForHaiku + `\n\nExtract ALL characters categorized properly. Include minor roles.`,
        maxTokens: 3000,
        label: 'script_breakdown_characters',
      }),
      // Setpieces pass
      callAIJson({
        modelKey: 'haiku',
        systemPrompt: HAIKU_SETPIECES_PROMPT,
        userPrompt: contextForHaiku + `\n\nExtract all setpieces and production flags.`,
        maxTokens: 2000,
        label: 'script_breakdown_setpieces',
      }),
    ]);

    console.log('[script-breakdown] Phase 2 complete:', {
      props: propsResult.status,
      characters: charactersResult.status,
      setpieces: setpiecesResult.status,
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // MERGE ALL RESULTS
    // ═══════════════════════════════════════════════════════════════════════════
    await supabase.from('background_tasks').update({
      progress: 70,
      description: 'Fusionando resultados y normalizando...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Extract results (use empty objects for failed passes)
    // Extract results (use empty objects for failed passes)
    const propsData = propsResult.status === 'fulfilled' ? propsResult.value.data : {};
    const charactersData = charactersResult.status === 'fulfilled' ? charactersResult.value.data : {};
    const setpiecesData = setpiecesResult.status === 'fulfilled' ? setpiecesResult.value.data : {};
    
    // Collect provider info for telemetry
    const haikuProviderInfo = propsResult.status === 'fulfilled' ? propsResult.value.providerInfo : null;

    // Merge into unified breakdown
    const mergedBreakdown: any = {
      ...canonicalData,
      // Props from Haiku
      props: [
        ...(propsData.props_key || []),
        ...(propsData.props_production || []),
      ],
      props_key: propsData.props_key || [],
      props_production: propsData.props_production || [],
      // Characters from Haiku (more complete than Sonnet's characters_main)
      characters: {
        cast: charactersData.cast_characters || [],
        featured_extras_with_lines: charactersData.featured_extras_with_lines || [],
        voices_and_functional: charactersData.voices_and_functional || [],
      },
      // Keep Sonnet's main characters for reference
      characters_main: canonicalData.characters_main || [],
      // Setpieces from Haiku
      setpieces: setpiecesData.setpieces || [],
      production_flags: setpiecesData.production_flags || [],
      // Locations from Sonnet
      locations: {
        base: (canonicalData.locations_base || []).map((l: any) => ({
          name: l.name,
          scenes_count: l.scenes_count_est || 0,
          variants: [],
        })),
        variants: [],
      },
    };

    // Enrich with regex data and normalize
    const enrichedData = enrichBreakdownWithScriptData(mergedBreakdown, processedScriptText);
    const normalizedData = normalizeBreakdown(enrichedData);

    console.log('[script-breakdown] Normalization complete:', {
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

      // Re-sync counts after filtering (so UI numbers match)
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
        schema_version: 'v8-two-phase',
        breakdown_version: 3,
        
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
        
        // Characters (Haiku-enriched)
        characters: normalizedData.characters,
        characters_main: canonicalData.characters_main || [],
        characters_flat: allCharacters,
        
        // Locations
        locations: normalizedData.locations,
        locations_flat: allLocations,
        
        // Props (Haiku-enriched)
        props: normalizedData.props || [],
        props_key: mergedBreakdown.props_key || [],
        props_production: mergedBreakdown.props_production || [],
        
        // Setpieces (Haiku-enriched)
        setpieces: normalizedData.setpieces || [],
        production_flags: mergedBreakdown.production_flags || [],
        
        // Validation
        validation: enrichedData.validation || {},
        _warnings: normalizedData._warnings || [],
        _phase_status: {
          sonnet: 'success',
          haiku_props: propsResult.status,
          haiku_characters: charactersResult.status,
          haiku_setpieces: setpiecesResult.status,
        },
        _provider_info: {
          sonnet: sonnetProviderInfo,
          haiku: haikuProviderInfo,
        },
        
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
