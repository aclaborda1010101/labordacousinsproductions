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
// PHASE 1: SONNET - CANONICAL SKELETON (compact, fast)
// ═══════════════════════════════════════════════════════════════════════════════
const SONNET_SYSTEM_PROMPT = `You are a CANONICAL SCREENPLAY ANALYST for Film/TV production.

GOAL:
Produce a stable, compact canonical breakdown that NEVER requires huge output.
You must extract structure and an index, not every detail.

OUTPUT LANGUAGE:
Return all descriptive text fields in the requested language.
Do NOT translate character names or scene headings.

SOURCE RULE:
Use ONLY the full screenplay text (the document that contains many scene headings).
Ignore outlines/treatments for counting.

SCENE COUNTING (NON-NEGOTIABLE):
A SCENE = any line that begins with:
INT. / EXT. / INT/EXT / EXT/INT (case-insensitive)
Count EVERY heading. Do not merge scenes.
scenes.total MUST equal scenes.list.length.

TITLE:
Prefer the screenplay title on the first page (top, before first INT/EXT).
If uncertain, keep title empty rather than inventing.

CHARACTERS (CANONICAL ONLY):
Return only the main cast (protagonists, co-protagonists, antagonists, key supporting).
Do NOT enumerate every minor role here.

LOCATIONS:
Return BASE locations (group variants). Do NOT return all variants.

ACTS:
If the screenplay does not explicitly label acts, infer 3-5 acts.
Keep act summaries short.

SUBPLOTS:
Return 2–6 subplots (name + 1-line description).

PRODUCTION FLAGS (HIGH LEVEL):
Return only top-level flags: period, VFX, crowds, night shoots, stunts/safety.

OUTPUT JSON ONLY (NO MARKDOWN, NO EXTRA TEXT).`;

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: HAIKU PROMPTS - PARALLEL DETAIL PASSES
// ═══════════════════════════════════════════════════════════════════════════════
const HAIKU_PROPS_PROMPT = `You are a PRODUCTION PROPS BREAKDOWN ANALYST.

OUTPUT LANGUAGE:
Return all descriptive text fields in the requested language.
Do NOT translate character names or scene headings.

TASK:
Return TWO prop lists:

1) props_key (8–15 items for feature-length scripts):
- plot-critical OR recurring OR iconic OR institutional/symbolic
- institutional examples: classified documents, hearing microphones, badges/IDs, lab equipment, scientific apparatus, military vehicles, radios, period newspapers, briefcases, typewriters, telephones

2) props_production (20–60 items for feature-length scripts):
- department-relevant props that recur or define the world
- avoid trivial one-off clutter

MINIMUMS:
- If scenes_total >= 80: props_key must be >= 10 and props_production >= 25.
- If scenes_total < 80: props_key >= 6 and props_production >= 15.

OUTPUT JSON ONLY:

{
  "props_key": [
    { "name": "", "importance": "critical|high|medium", "why": "" }
  ],
  "props_production": [
    { "name": "", "department": "art|costume|props|special|transport|sound|other", "why": "" }
  ]
}`;

const HAIKU_CHARACTERS_PROMPT = `You are a CAST BREAKDOWN ANALYST.

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

const HAIKU_SETPIECES_PROMPT = `You are a SETPIECE + PRODUCTION FLAGS ANALYST.

OUTPUT LANGUAGE:
Return descriptions in the requested language.
Do NOT translate scene headings.

SETPIECES:
Include not only action, also:
- hearings/trials/interrogations with high dramatic weight
- scientific tests/demonstrations
- chases/escapes
- emotional peaks
- montages

PRODUCTION FLAGS:
List practical concerns:
- stunts, fire/explosions, weapons, water, heights
- VFX, period, crowds, animals, children, night shoots

OUTPUT JSON ONLY:

{
  "setpieces": [
    { "name": "", "type": "action|trial|test|montage|emotional|other", "why": "" }
  ],
  "production_flags": [
    { "flag": "", "severity": "low|medium|high", "why": "" }
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
// DETERMINISTIC CHARACTER EXTRACTION (P0) - Full script scan
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// EXPANDED CHARACTER BLACKLIST (~200+ terms from script-analysis-utils)
// ═══════════════════════════════════════════════════════════════════════════════
const CHARACTER_CUE_BANNED = new Set([
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
  'WE SEE', 'HEAR',
  
  // === ONOMATOPEYAS Y EXCLAMACIONES ===
  'WHAT', 'YES', 'NO', 'OKAY', 'OH', 'AH', 'HEY', 'STOP', 'GO',
  'WAIT', 'LOOK', 'LISTEN', 'HELP', 'RUN', 'COME', 'HERE',
  'UGH', 'OOH', 'AAH', 'EEK', 'OW', 'OUCH', 'YIKES', 'WHOA',
  'WOW', 'GEE', 'GOSH', 'DAMN', 'DAMMIT', 'SHIT', 'FUCK',
  'HMM', 'HUH', 'EH', 'UM', 'UH', 'ER',
  
  // === TÉRMINOS TÉCNICOS SOLOS ===
  'VOICE', 'SCREEN', 'MONITOR', 'TV', 'TELEVISION', 'RADIO',
  'PHONE', 'INTERCOM', 'CAMERA', 'MUSIC', 'SOUND', 'NOISE',
  'LOUDSPEAKER', 'SPEAKER', 'RECORDER', 'MICROPHONE', 'MIC',
  'EARPIECE', 'HEADSET', 'WALKIE', 'TALKIE', 'COMM', 'COMMS',
  
  // === OTROS INVÁLIDOS ===
  'APPLAUSE', 'LAUGHTER', 'PAUSE', 'BLACKOUT', 'DARKNESS',
  'LIGHT', 'SHADOW', 'QUIET', 'STILLNESS',
  'END OF ACT', 'ACT ONE', 'ACT TWO', 'ACT THREE', 'SCENE',
  'OPENING', 'CLOSING', 'TEASER', 'TAG', 'COLD OPEN',
  'PREVIOUSLY', 'RECAP', 'FLASHFORWARD', 'DREAM SEQUENCE',
  'FANTASY', 'IMAGINATION', 'MEMORY', 'VISION',
  'END', 'CONTINUED', 'CREDITS', 'INTERCUT', 'BACK TO',
  
  // === GENÉRICOS (solo si están solos) ===
  'MAN', 'WOMAN', 'PERSON', 'FIGURE', 'SILHOUETTE', 'SHAPE',
  'SOMEONE', 'SOMEBODY', 'ANYONE', 'ANYBODY', 'EVERYONE', 'EVERYBODY',
  'PEOPLE', 'CROWD', 'GROUP', 'THEY', 'THEM', 'IT',
  'GUY', 'GIRL', 'BOY', 'KID', 'CHILD', 'MALE', 'FEMALE', 'BODY',
  
  // === COMBINACIONES INVÁLIDAS ===
  'JOKER RANDALL', 'JOKER D', 'MOM V0', 'CLERK D', 'JOKER ON TV',
  'GOOD NIGHT', 'THAT NOISE', 'DID YOU HEAR', 'WHAT THE',
  'ON TV', 'ON SCREEN', 'ON PHONE', 'ON RADIO', 'ON MONITOR',
  'AND ALWAYS REMEMBER', 'ALWAYS REMEMBER', 'REMEMBER THAT',
  'TO BE CONTINUED', 'HEAR A', 'HEAR THE',
  'WIDE ON', 'PUSH IN ON', 'PULL BACK TO',
  'RETURN TO', 'MEANWHILE IN', 'ELSEWHERE',
  'QUICK CUTS OF', 'SERIES OF', 'MONTAGE OF', 'FLASH OF',
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
