/**
 * Canonical Breakdown Normalizer v3.0
 * Converts any LLM output shape into a stable schema for UI consumption.
 * 
 * Guarantees:
 * - root.title always present via resolveTitle() with strict precedence
 * - characters separated into cast / featured_extras_with_lines / voices_and_functional
 * - collapses CONT'D duplicates
 * - counts always present and consistent
 * - props minimum enforcement for features (with warnings)
 * 
 * v3.0 HARD RULES:
 * - resolveTitle(): project.title > metadata.title (if not placeholder) > filename > "Untitled Script"
 * - character_candidates_full extracted deterministically from FULL script
 * - If scenes_total > 0 and locations_base_total === 0 → rebuild from scene headings
 * - If cast < minExpected for scene count → inject from character_candidates
 * - Never overwrite good data with empty arrays
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

  // Scenes
  const inputScenes = input.scenes as AnyObj | undefined;
  out.scenes = out.scenes || {};
  (out.scenes as AnyObj).list = safeArray((inputScenes?.list));
  const scenesTotal = typeof (inputScenes?.total) === "number"
    ? inputScenes.total as number
    : safeArray(inputScenes?.list).length;
  (out.scenes as AnyObj).total = scenesTotal;

  // ═══════════════════════════════════════════════════════════════════════════
  // TITLE CANONICALIZATION (P0) - resolveTitle() with strict precedence
  // ═══════════════════════════════════════════════════════════════════════════
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
  
  // Metadata passthrough + working_title preservation
  out.metadata = (out.metadata as AnyObj) || {};
  (out.metadata as AnyObj).title = resolved.canonical_title;
  
  if (resolved.working_title) {
    (out.metadata as AnyObj).working_title = resolved.working_title;
    console.log(`[normalizeBreakdown] Working title preserved: "${resolved.working_title}" (not shown as main title)`);
  }
  
  console.log(`[normalizeBreakdown] Title resolved: "${resolved.canonical_title}" (source: ${resolved.source})`);
  
  if (resolved.source === 'fallback') {
    warnings.push({
      code: "TITLE_FALLBACK",
      message: `Could not determine script title from project, metadata, or filename. Using "${resolved.canonical_title}".`,
    });
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
  // PASO 2: Characters - normalize from flat array into 3 groups
  // ═══════════════════════════════════════════════════════════════════════════
  let flatChars = safeArray<CharacterInput>(input.characters).map((c) => ({
    ...c,
    name_raw: c?.name ?? "",
    name: normalizeCharacterName(c?.name ?? ""),
  })).filter((c) => c.name);

  // HARD RULE: If scenes > 50 but no characters, try multiple sources
  // Priority 1: character_candidates[] (already extracted)
  const characterCandidatesRaw = safeArray(input?.character_candidates);
  const characterCandidatesNormalized = characterCandidatesRaw
    .map((c: unknown) => normalizeCharacterName(c))
    .filter((n): n is string => !!n);

  // Used to ensure the dashboard doesn't show 0 when candidates exist
  // Note: rawText already declared above for title resolution
  const candidatesForPromotion: string[] = characterCandidatesNormalized.length
    ? characterCandidatesNormalized
    : typeof rawText === "string" && rawText.trim()
      ? extractCharacterCandidatesFromText(rawText)
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
    } else if (typeof rawText === "string" && rawText.trim()) {
      // Fallback: extract from raw text
      candidates = extractCharacterCandidatesFromText(rawText);
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

  (out.characters as AnyObj).cast =
    safeArray(prevCharacters?.cast).length > 0
      ? safeArray(prevCharacters?.cast)
      : uniqueBy(cast, (c) => c.name.toUpperCase());

  (out.characters as AnyObj).featured_extras_with_lines =
    safeArray(prevCharacters?.featured_extras_with_lines).length > 0
      ? safeArray(prevCharacters?.featured_extras_with_lines)
      : uniqueBy(featured, (c) => c.name.toUpperCase());

  (out.characters as AnyObj).voices_and_functional =
    safeArray(prevCharacters?.voices_and_functional).length > 0
      ? safeArray(prevCharacters?.voices_and_functional)
      : uniqueBy(voices, (c) => c.name.toUpperCase());

  // ═══════════════════════════════════════════════════════════════════════════
  // HARD FALLBACK: Scaled tolerance based on scene count
  // For Oppenheimer-sized scripts (279 scenes), we expect 120+ characters
  // ═══════════════════════════════════════════════════════════════════════════
  const bannedNames = /^(CUT TO|DISSOLVE TO|FADE|INT\.|EXT\.|TITLE|SUPER|MONTAGE|CONTINUOUS|LATER|SAME|DAY|NIGHT|MORNING|EVENING|DAWN|DUSK|INTERCUT|FLASHBACK|BACK TO|END OF|THE END|CONTINUED|MORE|BLACK|ANGLE ON|CLOSE ON|INSERT|POV|WIDE|TIGHT|OVER|MATCH CUT|JUMP CUT|SMASH CUT)$/i;
  
  const cleanCharNameForPromotion = (s: string): string => {
    if (!s) return "";
    let n = normalizeCharacterName(s);
    // Extra cleaning
    n = n.replace(/[^\p{L}\p{N}\s\-'.]/gu, '').replace(/\s+/g, ' ').trim();
    return n;
  };

  const promotableCandidates = uniqueBy(
    candidatesForPromotion
      .map((n) => cleanCharNameForPromotion(String(n)))
      .filter((n): n is string => !!n && n.length >= 2 && n.length <= 35)
      .filter((n) => !bannedNames.test(n))
      .filter((n) => !isVoiceOrFunctional(n) && !isFeaturedExtraRole(n))
      .map((name) => ({ name, scenes_count: 0, source: 'character_candidates' } as NormalizedCharacter & { source: string })),
    (c) => c.name.toUpperCase(),
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALED TOLERANCE: min cast expected based on scene count
  // ═══════════════════════════════════════════════════════════════════════════
  const currentCastLen = safeArray((out.characters as AnyObj).cast).length;
  const minCastExpected =
    scenesTotal >= 200 ? 120 :
    scenesTotal >= 100 ? 80 :
    scenesTotal >= 50 ? 40 :
    20;

  const shouldInjectCandidates = promotableCandidates.length > currentCastLen && currentCastLen < minCastExpected;

  if (shouldInjectCandidates) {
    console.log(
      `[normalizeBreakdown] SCALED FALLBACK: scenes=${scenesTotal}, minExpected=${minCastExpected}, current=${currentCastLen}, candidates=${promotableCandidates.length}`,
    );
    (out.characters as AnyObj).cast = promotableCandidates.map((c) => ({
      name: c.name,
      priority: "P2",
      role: "supporting",
      scenes_count: c.scenes_count ?? 0,
      source: 'character_candidates',
    }));
    (out as AnyObj)._cast_promoted_from_candidates = true;
    warnings.push({
      code: "CAST_INJECTED_FROM_CANDIDATES",
      message: `LLM returned ${currentCastLen} cast (min expected ${minCastExpected} for ${scenesTotal} scenes). Injected ${promotableCandidates.length} from character_candidates.`,
    });
  } else if (currentCastLen === 0 && promotableCandidates.length > 0) {
    // Original fallback for completely empty cast
    (out.characters as AnyObj).cast = promotableCandidates.map((c) => ({
      name: c.name,
      priority: "P2",
      role: "supporting",
      scenes_count: c.scenes_count ?? 0,
      source: 'character_candidates',
    }));
    (out as AnyObj)._cast_promoted_from_candidates = true;
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

  // Counts: always compute
  const computedCounts = computeCounts(out);
  out.counts = computedCounts;

  // Add warnings if any
  if (warnings.length > 0) {
    out._warnings = [...(safeArray(out._warnings) as BreakdownWarning[]), ...warnings];
  }

  // TEMP: verification log (remove after confirming counts are non-zero)
  console.log("[FINAL COUNTS CHECK]", {
    scenes: (out.scenes as AnyObj)?.total,
    locations: safeArray(((out.locations as AnyObj) ?? {})?.base).length,
    characters: safeArray(((out.characters as AnyObj) ?? {})?.cast).length,
  });

  return out as NormalizedBreakdown;
}

