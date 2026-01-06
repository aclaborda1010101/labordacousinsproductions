/**
 * Canonical Breakdown Normalizer v4.0
 * Converts any LLM output shape into a stable schema for UI consumption.
 * 
 * REGLAS DEFINITIVAS:
 * 
 * 🔒 REGLA 1 - TÍTULO BLOQUEADO:
 *    Una vez definido (project.title o metadata.title válido), NO se toca.
 *    Sin LLM, sin heurística, sin fallback, sin normalizador.
 * 
 * 🎭 REGLA 2 - CANON DE PERSONAJES EN 3 CAPAS:
 *    A) Cast real: aparece ≥2 escenas O tiene diálogo, NO es verbo/acción/insert
 *    B) Extras con diálogo: SENATOR, AIDE, SOLDIER (sección aparte)
 *    C) Ruido/acciones/inserts: INSERT, CUT, LOUD, etc. → _discarded_candidates[]
 * 
 * 🧹 REGLA 3 - BLACKLIST DURA:
 *    Regex para acciones/inserts que NUNCA son personajes.
 * 
 * Garantías:
 * - characters_total = cast.length + featured_extras.length + voices.length
 * - Cast objetivo: 100-120 para scripts largos
 * - Total objetivo: 120-160
 * - No más "subir tolerancia"
 */

type AnyObj = Record<string, unknown>;

const TITLE_MAX_WORDS = 12;
const TITLE_MAX_CHARS = 80;

// ═══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER TITLES - These should NEVER be used as canonical_title
// ═══════════════════════════════════════════════════════════════════════════════
const PLACEHOLDER_TITLES = [
  "GADGET", "© 2022 SYNCOPY", "SYNCOPY", "UNTITLED", "DRAFT", "SCREENPLAY", "SCRIPT",
  "FINAL DRAFT", "REVISED", "NEW PROJECT", "PROJECT", "SHOOTING SCRIPT", "FINAL",
  "WHITE", "BLUE", "PINK", "YELLOW", "GREEN", "BUFF", "GOLDENROD", "SALMON",
  "CHERRY", "TAN", "2ND BLUE", "2ND PINK", "2ND YELLOW", "2ND GREEN",
  "PRODUCTION DRAFT", "SHOOTING DRAFT", "REVISED DRAFT",
];

const BAD_TITLE_PATTERNS = /^(©|COPYRIGHT|\d{4}$|SYNCOPY|WARNER|UNIVERSAL|NETFLIX|DISNEY|PARAMOUNT|SONY|FOX|MGM|LIONSGATE|A24|FOCUS|COLUMBIA|DREAMWORKS|AMBLIN|LEGENDARY|NEW LINE|HBO|AMAZON|APPLE|SEARCHLIGHT|WORKING TITLE)/i;

function isPlaceholderTitle(s: string): boolean {
  if (!s || typeof s !== "string") return true;
  const upper = s.toUpperCase().trim();
  
  // Check exact matches
  if (PLACEHOLDER_TITLES.includes(upper)) return true;
  
  // Check bad patterns (copyright, studios, years)
  if (BAD_TITLE_PATTERNS.test(s.trim())) return true;
  
  // Check if it's mostly punctuation/symbols
  if (/^[©®™\d\s\-_.]+$/.test(s.trim())) return true;
  
  // Check for common draft indicators
  if (/\b(DRAFT|REVISION|REV\.?)\s*\d*\s*$/i.test(s.trim())) return true;
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧹 REGLA 3 - BLACKLIST DURA: Expanded ~200+ terms
// ═══════════════════════════════════════════════════════════════════════════════
const CHARACTER_BLACKLIST = new Set([
  // === EFECTOS DE SONIDO ===
  'BLAM', 'BLAMMMMMMM', 'CRASH', 'BANG', 'WHOOSH', 'THUD', 'CLANG',
  'WHAM', 'BOOM', 'RING', 'BEEP', 'DING', 'HONK', 'SCREECH', 'BAM',
  'CRAAAASSSHHHHHH', 'BLAMMMMMM', 'SLAM', 'CLICK', 'POP', 'SPLASH',
  'CRACK', 'SNAP', 'THUMP', 'CLUNK', 'BUZZ', 'HISS', 'ROAR', 'RUMBLE',
  'WHIR', 'CREAK', 'SQUEAK', 'RATTLE', 'CLATTER', 'THWACK', 'SMACK',
  'WHACK', 'PLOP', 'DRIP', 'SWOOSH', 'ZOOM', 'VROOM', 'SCREEEECH',
  'CRUNCH', 'SIZZLE', 'GROWL', 'SHRIEK', 'YELL', 'SCREAM', 'GASP',
  'SIGH', 'GROAN', 'MOAN', 'WAIL', 'HOWL', 'BARK', 'MEOW', 'CHIRP',
  'TWEET', 'SQUAWK', 'KAPOW', 'ZAP', 'SMASH',
  
  // === INSTRUCCIONES DE CÁMARA/EDICIÓN ===
  'QUICK CUTS', 'JUMP CUT', 'MATCH CUT', 'SMASH CUT', 'TIME CUT',
  'CUT TO', 'FADE IN', 'FADE OUT', 'DISSOLVE', 'FLASH', 'IRIS OUT',
  'PUSH IN', 'PULL BACK', 'TRACKING', 'HANDHELD', 'POV',
  'CLOSE ON', 'ANGLE ON', 'WE SEE', 'FROM BEHIND', 'WIDER ANGLE',
  'STAY ON', 'HOLD', 'BEAT', 'SUPER', 'TITLE', 'INSERT', 'MONTAGE',
  'EXTREME CLOSE', 'WIDE SHOT', 'MEDIUM SHOT', 'TWO SHOT',
  'ESTABLISHING', 'AERIAL', 'UNDERWATER', 'CRANE SHOT', 'DOLLY',
  'STEADICAM', 'FREEZE FRAME', 'SLOW MOTION', 'SPLIT SCREEN',
  'REVERSE ANGLE', 'OVER SHOULDER', 'CLOSE UP', 'MEDIUM CLOSE',
  'FULL SHOT', 'LONG SHOT', 'EXTREME LONG', 'INSERT SHOT',
  'CUTAWAY', 'REACTION SHOT', 'MASTER SHOT', 'COVERAGE',
  'RACK FOCUS', 'PULL FOCUS', 'FOCUS ON', 'REVEAL',
  'WIPE TO', 'IRIS IN', 'FADE TO BLACK', 'FADE TO WHITE',
  'PRELAP', 'PRE-LAP', 'SERIES OF SHOTS', 'QUICK CUT',
  'DISSOLVE TO', 'BEGIN TITLES', 'END TITLES', 'MAIN TITLES',
  'OPENING CREDITS', 'CLOSING CREDITS', 'MORE',
  
  // === INDICADORES DE TIEMPO ===
  'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'DAWN', 'DUSK', 'DAY',
  'MAGIC HOUR', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME',
  'NEXT', 'NEXT DAY', 'NEXT AFTERNOON', 'FLASHBACK', 'PRESENT DAY',
  'EARLY MORNING', 'LATE NIGHT', 'SUNSET', 'SUNRISE', 'MIDDAY',
  'MIDNIGHT', 'GOLDEN HOUR', 'BLUE HOUR', 'PRE-DAWN', 'TWILIGHT',
  'HOURS LATER', 'DAYS LATER', 'WEEKS LATER', 'MONTHS LATER',
  'YEARS LATER', 'THE NEXT DAY', 'THE FOLLOWING', 'SOMETIME LATER',
  'A MOMENT LATER', 'SECONDS LATER', 'MINUTES LATER',
  'NEXT MORNING', 'THE NEXT', 'THAT NIGHT', 'THAT DAY', 'THAT EVENING',
  
  // === TEXTO DE PANTALLA/TÉCNICO ===
  'PLEASE STAND BY', 'BLACK', 'WHITE', 'COLOUR', 'COLOR', 'B&W',
  'WIDE', 'CLOSE', 'MEDIUM', 'TIGHT', 'OVER BLACK', 'THE END',
  'TITLE CARD', 'END CREDITS', 'SUPER TITLE', 'CHYRON',
  'LOWER THIRD', 'GRAPHIC', 'TEXT ON SCREEN',
  'STAND BY', 'WE INTERRUPT', 'BREAKING NEWS',
  
  // === LÍNEAS DE ACCIÓN ===
  'HEAR LAUGHTER', 'WE HEAR', 'SUDDENLY', 'MEANWHILE', 'SILENCE',
  'SOUND OF', 'SOUNDS OF', 'THE SOUND', 'A SOUND', 'NOISE OF',
  'WE FOLLOW', 'WE MOVE', 'WE TRACK', 'WE PAN', 'WE TILT',
  'WE DOLLY', 'WE CRANE', 'WE PUSH', 'WE PULL', 'WE ZOOM',
  'CAMERA MOVES', 'CAMERA FOLLOWS', 'CAMERA TRACKS', 'CAMERA PANS',
  
  // === ONOMATOPEYAS Y EXCLAMACIONES ===
  'WHAT', 'YES', 'NO', 'OKAY', 'OH', 'AH', 'HEY', 'STOP', 'GO',
  'WAIT', 'LOOK', 'LISTEN', 'HELP', 'RUN', 'COME', 'HERE',
  'UGH', 'OOH', 'AAH', 'EEK', 'OW', 'OUCH', 'YIKES', 'WHOA',
  'WOW', 'GEE', 'GOSH', 'DAMN', 'DAMMIT',
  'HMM', 'HUH', 'EH', 'UM', 'UH', 'ER',
  
  // === OTROS INVÁLIDOS ===
  'APPLAUSE', 'LAUGHTER', 'PAUSE', 'BLACKOUT', 'DARKNESS',
  'LIGHT', 'SHADOW', 'QUIET', 'STILLNESS',
  'END OF ACT', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'SCENE',
  'OPENING', 'CLOSING', 'TEASER', 'TAG', 'COLD OPEN',
  'PREVIOUSLY', 'RECAP', 'FLASHFORWARD', 'DREAM SEQUENCE',
  'FANTASY', 'IMAGINATION', 'MEMORY', 'VISION',
  'END', 'CONTINUED', 'CREDITS', 'INTERCUT', 'BACK TO',
]);

// 🛡️ Scene heading detector (numbered or not) - prevents "32 INT. GOTHAM..." from being a character
function isSceneHeading(text: string): boolean {
  const t = text.toUpperCase().trim();
  // Standard: INT. / EXT. / INT/EXT
  if (/^(INT[\./]|EXT[\./]|INT\/EXT|I\/E)/i.test(t)) return true;
  // Numbered: "32 INT." or "32. INT."
  if (/^\d+\s*\.?\s*(INT[\./]|EXT[\./]|INT\/EXT|I\/E)/i.test(t)) return true;
  // Contains INT./EXT. anywhere (malformed)
  if (/\bINT\.\s|EXT\.\s/i.test(t)) return true;
  // Contains time of day at end (scene heading fragment)
  if (/\s*[-–—]\s*(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|SAME)\s*$/i.test(t)) return true;
  return false;
}

function isActionOrInsert(name: string): boolean {
  const u = name.toUpperCase().trim();
  const original = name.trim();
  const words = u.split(/\s+/).filter(w => w.length > 0);
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 1: Character names are 1-3 words maximum
  // ══════════════════════════════════════════════════════════════════════════
  if (words.length > 3) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 2: Too short
  // ══════════════════════════════════════════════════════════════════════════
  if (u.length < 2) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 3: 🛡️ Scene headings are NEVER characters
  // ══════════════════════════════════════════════════════════════════════════
  if (isSceneHeading(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 4: 🛡️ Pure numbers are scene numbers, NOT characters
  // ══════════════════════════════════════════════════════════════════════════
  if (/^\d+$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 5: Repeated letters (3+) - BLAMMMMM, CRAAAASH, NOOOOO
  // ══════════════════════════════════════════════════════════════════════════
  if (/(.)\1{2,}/.test(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 6: Contains -- or ... (dialogue fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/--|\.\.\.?|—|–/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 7: Pure punctuation
  // ══════════════════════════════════════════════════════════════════════════
  if (/^[.…\-–—*#_=+~`'"!?@$%^&(){}\[\]<>|\\/:;,]+$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 8: Ends with problematic punctuation
  // ══════════════════════════════════════════════════════════════════════════
  if (/[!?,;:'"\-]$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 9: Starts with punctuation
  // ══════════════════════════════════════════════════════════════════════════
  if (/^[!?,;:'"\-.]/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 10: Starts with number + words (scene heading fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/^\d+\s+[A-Z]/.test(u) && u.length > 15) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 11: Too long (real character names rarely exceed 35 chars)
  // ══════════════════════════════════════════════════════════════════════════
  if (u.length > 35) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 12: Technical camera/shot terms
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(ANGLE|CLOSE|WIDE|MEDIUM|EXTREME|SHOT|INSERT|POV|REVERSE|OVER|ON:|PUSH|PULL|TRACK|DOLLY|PAN|TILT|ZOOM|CRANE|AERIAL|HANDHELD|STEADICAM)/i.test(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 13: Action/instruction phrases
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(HEAR|WE SEE|WE HEAR|CUT|FADE|DISSOLVE|FLASH|TITLE|SUPER|BLACK|WHITE)/i.test(u)) return true;
  if (/\bHEAR\s+(LAUGHTER|MUSIC|SOUND|NOISE|VOICE|A\s)/i.test(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 14: Common sentence starters (dialogue fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/^(DID|DO|DOES|CAN|COULD|WOULD|SHOULD|WILL|ARE|IS|WAS|WERE|HAVE|HAS|HAD|THAT|THIS|THOSE|THESE|WHAT|WHERE|WHEN|WHY|HOW|GOOD|BAD|TURN|WATCH|LOOK|PLEASE|JUST|NOW|THEN|BUT|AND|OR|IF|SO|AS|TO|FOR|WITH|FROM|ABOUT)\s/i.test(u) && words.length > 2) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 15: Contains pronouns (dialogue fragments)
  // ══════════════════════════════════════════════════════════════════════════
  if (/\b(YOU|I'M|I AM|WE'RE|THEY'RE|HE'S|SHE'S|IT'S|THAT'S|THERE'S|HERE'S|LET'S|WE'LL|YOU'LL|I'LL|DON'T|WON'T|CAN'T|ISN'T|AREN'T|WASN'T|WEREN'T|HAVEN'T|HASN'T)\b/i.test(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 16: Blacklist exact match
  // ══════════════════════════════════════════════════════════════════════════
  if (CHARACTER_BLACKLIST.has(u)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 17: Any word in blacklist (for >3 char words)
  // ══════════════════════════════════════════════════════════════════════════
  for (const word of words) {
    if (word.length > 3 && CHARACTER_BLACKLIST.has(word)) return true;
  }
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 18: All lowercase (likely description, not character)
  // ══════════════════════════════════════════════════════════════════════════
  if (/^[a-z\s]+$/.test(original)) return true;
  
  // ══════════════════════════════════════════════════════════════════════════
  // RULE 19: Single-word onomatopoeia
  // ══════════════════════════════════════════════════════════════════════════
  const ONOMATOPOEIA = /^(BLAM|BAM|BANG|BOOM|CRASH|SLAM|THUD|CLICK|BEEP|RING|WHOOSH|SCREECH|CLANG|WHAM|DING|HONK|BUZZ|HISS|POP|CRACK|SNAP|SPLASH|THUMP|CRUNCH|SIZZLE|RUMBLE|ROAR|SMASH|WHACK|THWACK|KAPOW|ZAP|WHIR|CLUNK|SQUEAK|GROWL|SHRIEK|YELL|SCREAM|GASP|SIGH|GROAN|MOAN|WAIL|HOWL|BARK|MEOW|CHIRP|TWEET|SQUAWK)$/i;
  if (words.length === 1 && ONOMATOPOEIA.test(u)) return true;
  
  return false;
}

function isFeatureLength(scenesTotal: number): boolean {
  return scenesTotal >= 80;
}

function safeArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? v : [];
}

function isProbablyTitle(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  if (t.length > TITLE_MAX_CHARS) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > TITLE_MAX_WORDS) return false;
  const hasSentencePunctuation = /[.!?]/.test(t);
  if (hasSentencePunctuation && words.length > 8) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TITLE CANONICALIZATION - resolveTitle() with strict precedence
// ═══════════════════════════════════════════════════════════════════════════════
interface TitleContext {
  projectTitle?: string;
  metadataTitle?: string;
  filename?: string;
  rawText?: string;
}

interface ResolvedTitle {
  canonical_title: string;
  working_title?: string;
  source: 'project' | 'metadata' | 'filename' | 'frontmatter' | 'fallback';
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function resolveTitle(ctx: TitleContext): ResolvedTitle {
  let working_title: string | undefined;
  
  // 1) project.title (if exists and not empty/placeholder)
  if (ctx.projectTitle && ctx.projectTitle.trim() && !isPlaceholderTitle(ctx.projectTitle)) {
    return { 
      canonical_title: ctx.projectTitle.trim(), 
      working_title,
      source: 'project' 
    };
  }
  
  // 2) metadata.title (if not placeholder)
  if (ctx.metadataTitle && ctx.metadataTitle.trim()) {
    if (isPlaceholderTitle(ctx.metadataTitle)) {
      // Save as working_title but don't use as canonical
      working_title = ctx.metadataTitle.trim();
    } else if (isProbablyTitle(ctx.metadataTitle)) {
      return { 
        canonical_title: ctx.metadataTitle.trim(), 
        working_title,
        source: 'metadata' 
      };
    }
  }
  
  // 3) filename -> Title Case
  if (ctx.filename && ctx.filename.trim()) {
    const cleanName = ctx.filename
      .replace(/\.(pdf|txt|fountain|fdx|docx?)$/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    
    if (cleanName && cleanName.length >= 2 && !isPlaceholderTitle(cleanName)) {
      return { 
        canonical_title: toTitleCase(cleanName), 
        working_title,
        source: 'filename' 
      };
    }
  }
  
  // 4) Try to extract from front-matter (before first INT/EXT)
  if (ctx.rawText && typeof ctx.rawText === "string" && ctx.rawText.trim()) {
    const firstSceneMatch = ctx.rawText.match(/^(INT\.|EXT\.|INT\/EXT)/im);
    const frontMatter = firstSceneMatch 
      ? ctx.rawText.slice(0, firstSceneMatch.index).trim()
      : ctx.rawText.slice(0, 2000);
    
    const lines = frontMatter.split("\n").map(l => l.trim()).filter(Boolean);
    
    for (const line of lines) {
      // Skip obvious non-title lines
      if (/^(FADE IN|FADE OUT|CUT TO|WRITTEN BY|BY\s|DRAFT|REVISION|BASED ON)/i.test(line)) continue;
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(line)) continue; // dates
      if (/^page\s+\d/i.test(line)) continue;
      if (isPlaceholderTitle(line)) continue;
      
      const isAllCapsish =
        line.length <= TITLE_MAX_CHARS &&
        /[A-Z]/.test(line) &&
        line === line.toUpperCase() &&
        !/^INT\.|^EXT\.|^INT\/EXT/i.test(line);
      
      if (isAllCapsish && isProbablyTitle(line)) {
        return { 
          canonical_title: line.trim(), 
          working_title,
          source: 'frontmatter' 
        };
      }
    }
  }
  
  // 5) Fallback
  return { 
    canonical_title: "Untitled Script", 
    working_title,
    source: 'fallback' 
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1: LOCATION EXTRACTION - From scene headings (no AI needed)
// ═══════════════════════════════════════════════════════════════════════════════
interface ParsedSceneHeading {
  intExt: 'INT' | 'EXT' | 'INT/EXT';
  locationBase: string;
  timeOfDay: string;
  fullHeading: string;
}

function parseSceneHeading(heading: string): ParsedSceneHeading | null {
  if (!heading || typeof heading !== 'string') return null;
  
  const h = heading.trim().toUpperCase();
  
  // Match INT./EXT. patterns
  const match = h.match(/^(INT|EXT|INT\/EXT|EXT\/INT)[\.\s]+(.+)$/i);
  if (!match) return null;
  
  const intExt = match[1].replace('EXT/INT', 'INT/EXT') as 'INT' | 'EXT' | 'INT/EXT';
  let rest = match[2].trim();
  
  // Extract time of day (after last dash or at end)
  let timeOfDay = 'DAY';
  const timeMatch = rest.match(/[-–—]\s*(DAY|NIGHT|MORNING|EVENING|AFTERNOON|DAWN|DUSK|LATER|CONTINUOUS|SAME|SUNSET|SUNRISE)\s*$/i);
  if (timeMatch) {
    timeOfDay = timeMatch[1].toUpperCase();
    rest = rest.slice(0, timeMatch.index).trim();
  }
  
  // Clean up trailing dashes
  rest = rest.replace(/[-–—]+\s*$/, '').trim();
  
  // Location base is what remains
  const locationBase = rest || 'UNKNOWN LOCATION';
  
  return {
    intExt,
    locationBase,
    timeOfDay,
    fullHeading: heading,
  };
}

function extractLocationsFromHeadings(headings: string[]): { base: NormalizedLocation[]; variants: string[] } {
  const locationMap = new Map<string, Set<string>>();
  
  for (const heading of headings) {
    const parsed = parseSceneHeading(heading);
    if (!parsed) continue;
    
    const baseKey = parsed.locationBase.toUpperCase();
    if (!locationMap.has(baseKey)) {
      locationMap.set(baseKey, new Set());
    }
    
    // Track the variant (INT/EXT + time)
    const variant = `${parsed.intExt}. ${parsed.locationBase} - ${parsed.timeOfDay}`;
    locationMap.get(baseKey)!.add(variant);
  }
  
  const base: NormalizedLocation[] = [];
  const allVariants: string[] = [];
  
  for (const [name, variants] of locationMap) {
    const variantsArr = Array.from(variants);
    base.push({
      name,
      variants: variantsArr,
    });
    allVariants.push(...variantsArr);
  }
  
  // Sort by number of variants (most used first)
  base.sort((a, b) => b.variants.length - a.variants.length);
  
  return { base, variants: allVariants };
}

// Helper to get all headings from multiple possible sources
function collectHeadings(obj: AnyObj): string[] {
  // Priority 1: scenes.list[].heading (already normalized in out.scenes.list)
  const scenesList = safeArray((obj?.scenes as AnyObj)?.list);
  const fromScenesList = scenesList
    .map((s: unknown) => {
      const scene = s as AnyObj;
      return (scene?.heading as string) || (scene?.slugline as string) || (scene?.scene_heading as string) || '';
    })
    .filter((h): h is string => typeof h === 'string' && h.trim().length > 0);
  
  if (fromScenesList.length > 0) {
    console.log(`[collectHeadings] Found ${fromScenesList.length} headings from scenes.list`);
    return fromScenesList;
  }
  
  // Priority 2: scene_headings_raw[]
  const sceneHeadingsRaw = safeArray(obj?.scene_headings_raw);
  if (sceneHeadingsRaw.length > 0) {
    const filtered = sceneHeadingsRaw.filter((h): h is string => typeof h === 'string' && h.trim().length > 0);
    console.log(`[collectHeadings] Found ${filtered.length} headings from scene_headings_raw`);
    return filtered;
  }
  
  // Priority 3: scene_headings[]
  const sceneHeadings = safeArray(obj?.scene_headings);
  if (sceneHeadings.length > 0) {
    const filtered = sceneHeadings.filter((h): h is string => typeof h === 'string' && h.trim().length > 0);
    console.log(`[collectHeadings] Found ${filtered.length} headings from scene_headings`);
    return filtered;
  }
  
  console.log(`[collectHeadings] No headings found in any source`);
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2A: CHARACTER EXTRACTION - From raw text (heuristic, no AI)
// ═══════════════════════════════════════════════════════════════════════════════
function extractCharacterCandidatesFromText(rawText: string): string[] {
  if (!rawText || typeof rawText !== 'string') return [];
  
  const lines = rawText.split('\n');
  const candidates = new Set<string>();
  
  // Pattern: lines in ALL CAPS that precede dialogue
  // Typically: CHARACTER NAME (optionally with parenthetical)
  // Then next line is dialogue
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || '';
    
    // Skip empty lines
    if (!line) continue;
    
    // Must be ALL CAPS (or mostly)
    if (line !== line.toUpperCase()) continue;
    
    // Must not be a scene heading
    if (/^(INT\.|EXT\.|INT\/EXT)/i.test(line)) continue;
    
    // Must not be a transition
    if (/^(FADE|CUT|DISSOLVE|SMASH|MATCH|WIPE|IRIS)/i.test(line)) continue;
    
    // Must not be too long (character names are typically short)
    if (line.length > 40) continue;
    
    // Must not be a parenthetical only
    if (/^\([^)]+\)$/.test(line)) continue;
    
    // Next line should have content (dialogue)
    if (!nextLine || /^(INT\.|EXT\.|FADE|CUT)/i.test(nextLine)) continue;
    
    // Extract character name (before any parenthetical)
    let charName = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    // Clean up CONT'D, V.O., etc.
    charName = normalizeCharacterName(charName);
    
    if (charName && charName.length >= 2 && charName.length <= 35) {
      candidates.add(charName);
    }
  }
  
  return Array.from(candidates);
}

function normalizeCharacterName(nameRaw: unknown): string {
  if (typeof nameRaw !== "string") return "";
  let n = nameRaw.trim();

  // Strip common screenplay suffixes
  n = n
    .replace(/\bCONT['']?D\.?\b/gi, "")
    .replace(/\bCONT\.?\b/gi, "")
    .replace(/\bCONTINUED\b/gi, "")
    .replace(/\((V\.O\.|O\.S\.|O\.C\.|VO|OS|OC|ON SCREEN|OFF|CONT'D|CONTD)\)/gi, "")
    .replace(/\(V\.O\.\)/gi, "")
    .replace(/\(O\.S\.\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return n;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER CLASSIFICATION - Generic role detection
// ═══════════════════════════════════════════════════════════════════════════════
const VOICE_FUNCTIONAL_KEYWORDS = [
  "VOICE", "RADIO", "ANNOUNCER", "PA SYSTEM", "INTERCOM", "NARRATOR",
  "SUPER:", "TITLE:", "CHYRON", "TELEPHONE", "PHONE", "LOUDSPEAKER",
  "SPEAKER", "BROADCAST", "RECORDING", "TAPE", "TV ", "TELEVISION",
];

const GENERIC_ROLE_KEYWORDS = [
  "SOLDIER", "AIDE", "SECRETARY", "STUDENT", "SCIENTIST", "OFFICER",
  "GUARD", "DRIVER", "WAITER", "BARTENDER", "DOCTOR", "NURSE",
  "REPORTER", "POLICEMAN", "POLICE", "AGENT", "CLERK", "JUDGE",
  "SENATOR", "CONGRESSMAN", "TECH", "OPERATOR", "MR.", "MRS.",
  "MAN", "WOMAN", "BOY", "GIRL", "KID", "WORKER", "CROWD", "GROUP",
  "STAFF", "CREW", "ATTENDANT", "OFFICIAL", "LAWYER", "WITNESS",
  "PILOT", "COP", "DETECTIVE", "INSPECTOR", "CHIEF", "CAPTAIN",
  "GENERAL", "COLONEL", "MAJOR", "LIEUTENANT", "SERGEANT", "CORPORAL",
  "PRIVATE", "SAILOR", "MARINE", "AIRMAN", "MP", "SECURITY",
];

function isVoiceOrFunctional(name: string): boolean {
  const u = name.toUpperCase();
  return VOICE_FUNCTIONAL_KEYWORDS.some(k => u.includes(k));
}

function isFeaturedExtraRole(name: string): boolean {
  const u = name.toUpperCase();
  
  // Must be ALL CAPS (screenplay convention for extras)
  const looksLabel = u === name && name.length <= 35 && !/[a-z]/.test(name);
  if (!looksLabel) return false;
  
  // Comma with proper noun = named character, not extra
  const hasCommaProper = /,/.test(name) && /[A-Z][a-z]/.test(name);
  if (hasCommaProper) return false;
  
  const hasGenericKeyword = GENERIC_ROLE_KEYWORDS.some(k => u.includes(k));
  const hasNumber = /#?\d+/.test(name); // "SOLDIER #1", "GUARD 2"
  const isGenericPair = /^(MAN|WOMAN|BOY|GIRL)\s*\d*$/i.test(name);
  
  return hasGenericKeyword || hasNumber || isGenericPair;
}

function uniqueBy<T>(arr: T[], keyFn: (x: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

interface BreakdownCounts {
  scenes_total: number;
  cast_characters_total: number;
  featured_extras_total: number;
  voices_total: number;
  locations_base_total: number;
  locations_variants_total: number;
  props_total: number;
  setpieces_total: number;
}

function computeCounts(normalized: AnyObj): BreakdownCounts {
  const scenes = normalized?.scenes as AnyObj | undefined;
  const scenesTotal = (scenes?.total as number) ?? safeArray(scenes?.list).length ?? 0;

  const characters = normalized?.characters as AnyObj | undefined;
  const castTotal = safeArray(characters?.cast).length;
  const featuredTotal = safeArray(characters?.featured_extras_with_lines).length;
  const voicesTotal = safeArray(characters?.voices_and_functional).length;

  const locations = normalized?.locations as AnyObj | undefined;
  const locationsBaseTotal = safeArray(locations?.base).length;
  const locationsVariantsTotal = safeArray(locations?.variants).length;

  const propsTotal = safeArray(normalized?.props).length;
  const setpiecesTotal = safeArray(normalized?.setpieces).length;

  return {
    scenes_total: scenesTotal,
    cast_characters_total: castTotal,
    featured_extras_total: featuredTotal,
    voices_total: voicesTotal,
    locations_base_total: locationsBaseTotal,
    locations_variants_total: locationsVariantsTotal,
    props_total: propsTotal,
    setpieces_total: setpiecesTotal,
  };
}

interface CharacterInput {
  name?: string;
  role?: string;
  priority?: string;
  scenes_count?: number;
  [key: string]: unknown;
}

interface NormalizedCharacter {
  name: string;
  role?: string;
  priority?: string;
  scenes_count: number;
}

interface NormalizedLocation {
  name: string;
  variants: string[];
}

interface BreakdownWarning {
  code: string;
  message: string;
}

export interface NormalizedBreakdown {
  title: string;
  metadata: { title: string; [key: string]: unknown };
  scenes: { total: number; list: unknown[] };
  characters: {
    cast: NormalizedCharacter[];
    featured_extras_with_lines: NormalizedCharacter[];
    voices_and_functional: NormalizedCharacter[];
  };
  locations: {
    base: NormalizedLocation[];
    variants: unknown[];
  };
  props: unknown[];
  setpieces: unknown[];
  counts: BreakdownCounts;
  _warnings?: BreakdownWarning[];
  [key: string]: unknown;
}

export function normalizeBreakdown(input: AnyObj, filename?: string, projectTitle?: string): NormalizedBreakdown {
  const out: AnyObj = { ...input };
  const warnings: BreakdownWarning[] = [];
  const discardedCandidates: string[] = []; // 🧹 REGLA 3: Track noise/actions

  // Scenes
  const inputScenes = input.scenes as AnyObj | undefined;
  out.scenes = out.scenes || {};
  (out.scenes as AnyObj).list = safeArray((inputScenes?.list));
  const scenesTotal = typeof (inputScenes?.total) === "number"
    ? inputScenes.total as number
    : safeArray(inputScenes?.list).length;
  (out.scenes as AnyObj).total = scenesTotal;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔒 REGLA 1: TÍTULO BLOQUEADO
  // Una vez definido, NO se toca. Sin LLM, sin heurística, sin fallback.
  // ═══════════════════════════════════════════════════════════════════════════
  const existingLockedTitle = (input?._title_locked as string) || null;
  
  if (existingLockedTitle && !isPlaceholderTitle(existingLockedTitle)) {
    // 🔒 TÍTULO YA BLOQUEADO - No tocar
    out.title = existingLockedTitle;
    out._title_source = "locked";
    out._title_locked = existingLockedTitle;
    out.metadata = (out.metadata as AnyObj) || {};
    (out.metadata as AnyObj).title = existingLockedTitle;
    console.log(`[normalizeBreakdown] 🔒 TÍTULO BLOQUEADO: "${existingLockedTitle}" (no se modifica)`);
  } else {
    // Primera vez: resolver y bloquear
    const rawText: string | undefined =
      (input?.raw_text as string) || (input?.text as string) || (input?.script_text as string);
    
    const metadataTitle = 
      (input?.title as string) ||
      ((input?.metadata as AnyObj)?.title as string) ||
      (((input?.breakdown_pro as AnyObj)?.metadata as AnyObj)?.title as string);
    
    const resolved = resolveTitle({
      projectTitle,
      metadataTitle,
      filename,
      rawText,
    });
    
    out.title = resolved.canonical_title;
    out._title_source = resolved.source;
    out._title_locked = resolved.canonical_title; // 🔒 BLOQUEAR
    
    // Metadata passthrough + working_title preservation
    out.metadata = (out.metadata as AnyObj) || {};
    (out.metadata as AnyObj).title = resolved.canonical_title;
    
    if (resolved.working_title) {
      (out.metadata as AnyObj).working_title = resolved.working_title;
      console.log(`[normalizeBreakdown] Working title preserved: "${resolved.working_title}" (not shown as main title)`);
    }
    
    console.log(`[normalizeBreakdown] 🔒 TÍTULO BLOQUEADO: "${resolved.canonical_title}" (source: ${resolved.source})`);
    
    if (resolved.source === 'fallback') {
      warnings.push({
        code: "TITLE_FALLBACK",
        message: `Could not determine script title from project, metadata, or filename. Using "${resolved.canonical_title}".`,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASO 1: Locations - extract from scene headings if empty
  // ═══════════════════════════════════════════════════════════════════════════
  const inputLocations = input.locations;
  const flatLocations = safeArray(inputLocations);
  const baseLocationsInput = (inputLocations as AnyObj)?.base;
  let baseLocations = safeArray(baseLocationsInput).length 
    ? safeArray(baseLocationsInput) 
    : flatLocations;

  // Collect headings from all possible sources (use `out` which has scenes.list populated)
  const allHeadings = collectHeadings(out);

  // Normalize locations payload (it can come as flat array or as { base, variants })
  let derivedLocationsBase: NormalizedLocation[] = safeArray(baseLocations)
    .map((l: unknown) => {
      const loc = l as AnyObj;
      const name = typeof loc?.name === "string" ? (loc.name as string).trim() : "";
      const variants = safeArray(loc?.variants).map((v: unknown) => String(v));
      return { name, variants } as NormalizedLocation;
    })
    .filter((l: NormalizedLocation) => l.name);

  let derivedLocationVariants: unknown[] = safeArray((inputLocations as AnyObj)?.variants);

  // HARD RULE: If scenes > 0 but we still have 0 locations, rebuild from headings
  if (scenesTotal > 0 && derivedLocationsBase.length === 0) {
    if (allHeadings.length > 0) {
      console.log(
        `[normalizeBreakdown] HARD RULE: Rebuilding locations from ${allHeadings.length} headings`,
      );
      const extracted = extractLocationsFromHeadings(allHeadings);
      derivedLocationsBase = extracted.base;
      derivedLocationVariants = extracted.variants;

      (out as AnyObj)._locations_rebuilt = true;
      warnings.push({
        code: "LOCATIONS_REBUILT",
        message: `Locations were empty despite ${scenesTotal} scenes. Rebuilt ${extracted.base.length} locations from ${allHeadings.length} scene headings.`,
      });
    } else {
      warnings.push({
        code: "NO_SCENE_HEADINGS",
        message: `scenes_total=${scenesTotal} but no scenes.list[].heading nor scene_headings_raw found. Cannot derive locations.`,
      });
    }
  }

  // IMPORTANT: write into the FINAL object (out) and do not overwrite good data with empties
  const prevLocations = out.locations as AnyObj | undefined;
  out.locations = out.locations ?? {};
  (out.locations as AnyObj).base =
    safeArray(prevLocations?.base).length > 0
      ? safeArray(prevLocations?.base)
      : derivedLocationsBase;
  (out.locations as AnyObj).variants =
    safeArray(prevLocations?.variants).length > 0
      ? safeArray(prevLocations?.variants)
      : derivedLocationVariants;

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎭 REGLA 2: Characters - normalize from flat array into 3 groups
  // Con blacklist dura para acciones/inserts
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get raw text for fallback extraction (declare here for scope)
  const rawTextForChars: string | undefined =
    (input?.raw_text as string) || (input?.text as string) || (input?.script_text as string);
  
  let flatChars = safeArray<CharacterInput>(input.characters).map((c) => ({
    ...c,
    name_raw: c?.name ?? "",
    name: normalizeCharacterName(c?.name ?? ""),
  })).filter((c) => c.name && !isActionOrInsert(c.name)); // 🧹 REGLA 3: Filter noise

  // HARD RULE: If scenes > 50 but no characters, try multiple sources
  // Priority 1: character_candidates[] (already extracted)
  const characterCandidatesRaw = safeArray(input?.character_candidates);
  const characterCandidatesNormalized = characterCandidatesRaw
    .map((c: unknown) => normalizeCharacterName(c))
    .filter((n): n is string => !!n && !isActionOrInsert(n)); // 🧹 REGLA 3: Filter noise

  // Used to ensure the dashboard doesn't show 0 when candidates exist
  const candidatesForPromotion: string[] = characterCandidatesNormalized.length
    ? characterCandidatesNormalized
    : typeof rawTextForChars === "string" && rawTextForChars.trim()
      ? extractCharacterCandidatesFromText(rawTextForChars).filter(n => !isActionOrInsert(n))
      : [];

  if (scenesTotal > 50 && flatChars.length === 0) {
    let candidates: string[] = [];
    let source = "";

    if (characterCandidatesNormalized.length > 0) {
      // Use pre-extracted candidates
      candidates = characterCandidatesNormalized;
      source = "character_candidates";
      console.log(
        `[normalizeBreakdown] Using ${candidates.length} pre-extracted character_candidates`,
      );
    } else if (typeof rawTextForChars === "string" && rawTextForChars.trim()) {
      // Fallback: extract from raw text
      candidates = extractCharacterCandidatesFromText(rawTextForChars).filter(n => !isActionOrInsert(n));
      source = "raw_text";
      console.log(`[normalizeBreakdown] Extracted ${candidates.length} characters from raw_text`);
    } else {
      warnings.push({
        code: "NO_CHARACTER_INPUT",
        message: `scenes_total=${scenesTotal} but no characters array, character_candidates, or raw_text found.`,
      });
    }

    if (candidates.length > 0) {
      flatChars = candidates.map((name) => ({
        name,
        name_raw: name,
        role: "unknown",
        priority: "P5",
        scenes_count: 0,
      }));

      (out as AnyObj)._characters_extracted = true;
      (out as AnyObj)._characters_source = source;
      warnings.push({
        code: "CHARACTERS_EXTRACTED",
        message: `Characters were empty despite ${scenesTotal} scenes. Extracted ${candidates.length} candidates from ${source}.`,
      });
    }
  }

  // Merge duplicates by normalized name
  const mergedMap = new Map<string, CharacterInput & { name_raw: string }>();
  for (const c of flatChars) {
    const key = c.name.toUpperCase();
    const prev = mergedMap.get(key);
    if (!prev) {
      mergedMap.set(key, c);
      continue;
    }
    mergedMap.set(key, {
      ...prev,
      scenes_count: Math.max(prev.scenes_count ?? 0, c.scenes_count ?? 0),
      priority: (prev.priority ?? "P9") < (c.priority ?? "P9") ? prev.priority : c.priority,
      role: prev.role || c.role,
      name_raw: prev.name_raw || c.name_raw,
    });
  }

  const mergedChars = Array.from(mergedMap.values());

  const cast: NormalizedCharacter[] = [];
  const featured: NormalizedCharacter[] = [];
  const voices: NormalizedCharacter[] = [];

  for (const c of mergedChars) {
    const name = c.name as string;

    if (isVoiceOrFunctional(name)) {
      voices.push({ name, scenes_count: c.scenes_count ?? 0 });
      continue;
    }
    if (isFeaturedExtraRole(name)) {
      featured.push({ name, scenes_count: c.scenes_count ?? 0 });
      continue;
    }
    cast.push({
      name,
      role: c.role || "supporting",
      priority: c.priority || "P3",
      scenes_count: c.scenes_count ?? 0,
    });
  }

  // IMPORTANT: write into FINAL object (out) and do not overwrite good data with empties
  const prevCharacters = out.characters as AnyObj | undefined;
  out.characters = out.characters ?? {};

  // Classify ALL character_candidates into 3 categories (not just cast)
  const classifiedFromCandidates = {
    cast: [] as NormalizedCharacter[],
    featured: [] as NormalizedCharacter[],
    voices: [] as NormalizedCharacter[],
  };
  
  for (const name of candidatesForPromotion) {
    const cleanName = normalizeCharacterName(name);
    if (!cleanName || cleanName.length < 2) continue;
    
    if (isVoiceOrFunctional(cleanName)) {
      classifiedFromCandidates.voices.push({ name: cleanName, scenes_count: 0 });
    } else if (isFeaturedExtraRole(cleanName)) {
      classifiedFromCandidates.featured.push({ name: cleanName, scenes_count: 0 });
    } else {
      classifiedFromCandidates.cast.push({ name: cleanName, role: 'supporting', priority: 'P3', scenes_count: 0 });
    }
  }
  
  // Use LLM results if available, otherwise fallback to classified candidates
  (out.characters as AnyObj).cast =
    safeArray(prevCharacters?.cast).length > 0
      ? safeArray(prevCharacters?.cast)
      : cast.length > 0 
        ? uniqueBy(cast, (c) => c.name.toUpperCase())
        : uniqueBy(classifiedFromCandidates.cast, (c) => c.name.toUpperCase());

  (out.characters as AnyObj).featured_extras_with_lines =
    safeArray(prevCharacters?.featured_extras_with_lines).length > 0
      ? safeArray(prevCharacters?.featured_extras_with_lines)
      : featured.length > 0
        ? uniqueBy(featured, (c) => c.name.toUpperCase())
        : uniqueBy(classifiedFromCandidates.featured, (c) => c.name.toUpperCase());

  (out.characters as AnyObj).voices_and_functional =
    safeArray(prevCharacters?.voices_and_functional).length > 0
      ? safeArray(prevCharacters?.voices_and_functional)
      : voices.length > 0
        ? uniqueBy(voices, (c) => c.name.toUpperCase())
        : uniqueBy(classifiedFromCandidates.voices, (c) => c.name.toUpperCase());

  // ═══════════════════════════════════════════════════════════════════════════
  // 🎭 SCALED TOLERANCE: Augment if below expected counts
  // Cast objetivo: 100-120 para scripts largos
  // Total objetivo: 120-160
  // ═══════════════════════════════════════════════════════════════════════════
  
  const cleanCharNameForPromotion = (s: string): string => {
    if (!s) return "";
    let n = normalizeCharacterName(s);
    // Extra cleaning
    n = n.replace(/[^\p{L}\p{N}\s\-'.]/gu, "").replace(/\s+/g, " ").trim();
    return n;
  };

  // 🧹 REGLA 3: Filter all promotable candidates through blacklist
  const promotableAll = uniqueBy(
    candidatesForPromotion
      .map((n) => cleanCharNameForPromotion(String(n)))
      .filter((n): n is string => !!n && n.length >= 2 && n.length <= 50)
      .filter((n) => !isActionOrInsert(n)), // 🧹 Use new blacklist
    (n) => n.toUpperCase(),
  );

  const promotableCast = uniqueBy(
    promotableAll
      .filter((n) => !isVoiceOrFunctional(n) && !isFeaturedExtraRole(n))
      .map((name) => ({
        name,
        scenes_count: 0,
        source: "character_candidates",
      }) as NormalizedCharacter & { source: string }),
    (c) => c.name.toUpperCase(),
  );

  const promotableFeatured = uniqueBy(
    promotableAll
      .filter((n) => isFeaturedExtraRole(n))
      .map((name) => ({ name, scenes_count: 0, source: "character_candidates" }) as any),
    (c) => String((c as AnyObj)?.name || "").toUpperCase(),
  );

  const promotableVoices = uniqueBy(
    promotableAll
      .filter((n) => isVoiceOrFunctional(n))
      .map((name) => ({ name, scenes_count: 0, source: "character_candidates" }) as any),
    (c) => String((c as AnyObj)?.name || "").toUpperCase(),
  );

  // Objetivos profesionales:
  // Cast: 100-120 para scripts largos (200+ scenes)
  // Total: 120-160
  const minCharactersExpected =
    scenesTotal >= 200 ? 100 :
    scenesTotal >= 100 ? 70 :
    scenesTotal >= 50 ? 35 :
    15;

  const currentCast = safeArray((out.characters as AnyObj).cast) as AnyObj[];
  const currentFeatured = safeArray((out.characters as AnyObj).featured_extras_with_lines) as AnyObj[];
  const currentVoices = safeArray((out.characters as AnyObj).voices_and_functional) as AnyObj[];

  const currentNamesUpper = [
    ...currentCast.map((c) => String((c as AnyObj)?.name || "").toUpperCase()),
    ...currentFeatured.map((c) => String((c as AnyObj)?.name || "").toUpperCase()),
    ...currentVoices.map((c) => String((c as AnyObj)?.name || "").toUpperCase()),
  ].filter(Boolean);

  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hasDigitsOrHash = (s: string) => /[0-9#]/.test(s);

  const isCovered = (candUpper: string) => {
    if (currentNamesUpper.includes(candUpper)) return true;
    // Don't aggressively collapse numbered roles (GUARD #1 vs GUARD #2)
    if (hasDigitsOrHash(candUpper)) return false;
    const rx = new RegExp(`\\b${escapeRegExp(candUpper)}\\b`, "i");
    return currentNamesUpper.some((n) => rx.test(n));
  };

  const currentTotal = currentNamesUpper.length;

  // If the overall character set is suspiciously small for the number of scenes,
  // augment ALL categories from deterministic extraction.
  if (currentTotal < minCharactersExpected && promotableAll.length > 0) {
    const missingCast = promotableCast.filter((c) => !isCovered(c.name.toUpperCase()));
    const missingFeatured = promotableFeatured.filter((c: AnyObj) => !isCovered(String(c.name || "").toUpperCase()));
    const missingVoices = promotableVoices.filter((c: AnyObj) => !isCovered(String(c.name || "").toUpperCase()));

    const injectedCast = missingCast.map((c) => ({
      name: c.name,
      priority: "P3",
      role: "minor",
      scenes_count: c.scenes_count ?? 0,
      source: "character_candidates",
    }));

    const injectedFeatured = missingFeatured.map((c: AnyObj) => ({
      name: String(c.name || ""),
      scenes_count: 0,
      source: "character_candidates",
    }));

    const injectedVoices = missingVoices.map((c: AnyObj) => ({
      name: String(c.name || ""),
      scenes_count: 0,
      source: "character_candidates",
    }));

    const before = {
      cast: currentCast.length,
      featured: currentFeatured.length,
      voices: currentVoices.length,
      total: currentTotal,
    };

    if (injectedCast.length > 0) {
      (out.characters as AnyObj).cast = uniqueBy(
        [...currentCast, ...injectedCast] as AnyObj[],
        (x) => String((x as AnyObj)?.name || "").toUpperCase(),
      );
    }

    if (injectedFeatured.length > 0) {
      (out.characters as AnyObj).featured_extras_with_lines = uniqueBy(
        [...currentFeatured, ...injectedFeatured] as AnyObj[],
        (x) => String((x as AnyObj)?.name || "").toUpperCase(),
      );
    }

    if (injectedVoices.length > 0) {
      (out.characters as AnyObj).voices_and_functional = uniqueBy(
        [...currentVoices, ...injectedVoices] as AnyObj[],
        (x) => String((x as AnyObj)?.name || "").toUpperCase(),
      );
    }

    const afterTotal =
      safeArray((out.characters as AnyObj).cast).length +
      safeArray((out.characters as AnyObj).featured_extras_with_lines).length +
      safeArray((out.characters as AnyObj).voices_and_functional).length;

    console.log(
      `[normalizeBreakdown] SCALED AUGMENT (ALL): scenes=${scenesTotal}, minExpected=${minCharactersExpected}, before=${before.total}, after=${afterTotal}, addCast=${injectedCast.length}, addFeatured=${injectedFeatured.length}, addVoices=${injectedVoices.length}, candidates=${promotableAll.length}`,
    );

    (out as AnyObj)._characters_augmented_from_candidates = true;
    warnings.push({
      code: "CHARACTERS_AUGMENTED_FROM_CANDIDATES",
      message: `Characters total (${before.total}) below minimum expected (${minCharactersExpected}) for ${scenesTotal} scenes. Added cast(+${injectedCast.length}), featured(+${injectedFeatured.length}), voices(+${injectedVoices.length}) from deterministic extraction.`,
    });
  }
  
  // 🧹 REGLA 3: Store discarded candidates for debugging
  if (discardedCandidates.length > 0) {
    (out as AnyObj)._discarded_candidates = discardedCandidates;
  }

  // Props: prefer input.props; fallback props_key
  const propsInput = safeArray(input.props).length ? safeArray(input.props) : safeArray(input.props_key);
  out.props = propsInput;

  // Enforce minimum props for feature scripts
  const minProps = isFeatureLength((out.scenes as AnyObj).total as number) ? 8 : 4;
  if ((out.props as unknown[]).length > 0 && (out.props as unknown[]).length < minProps) {
    warnings.push({
      code: "PROPS_TOO_FEW",
      message: `Props count (${(out.props as unknown[]).length}) below minimum (${minProps}) for this script length.`,
    });
  }

  // Setpieces
  out.setpieces = safeArray(input.setpieces);

  // Counts: always compute (characters_total = cast + featured + voices)
  const computedCounts = computeCounts(out);
  out.counts = computedCounts;

  // Add warnings if any
  if (warnings.length > 0) {
    out._warnings = [...(safeArray(out._warnings) as BreakdownWarning[]), ...warnings];
  }

  // FINAL LOG: cast, featured, voices, total
  const finalCast = safeArray(((out.characters as AnyObj) ?? {})?.cast).length;
  const finalFeatured = safeArray(((out.characters as AnyObj) ?? {})?.featured_extras_with_lines).length;
  const finalVoices = safeArray(((out.characters as AnyObj) ?? {})?.voices_and_functional).length;
  const finalTotal = finalCast + finalFeatured + finalVoices;
  
  console.log("[FINAL COUNTS CHECK]", {
    scenes: (out.scenes as AnyObj)?.total,
    locations: safeArray(((out.locations as AnyObj) ?? {})?.base).length,
    cast: finalCast,
    featured: finalFeatured,
    voices: finalVoices,
    characters_total: finalTotal,
  });

  return out as NormalizedBreakdown;
}
