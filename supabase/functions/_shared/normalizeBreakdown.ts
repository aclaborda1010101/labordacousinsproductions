/**
 * Canonical Breakdown Normalizer v1.0
 * Converts any LLM output shape into a stable schema for UI consumption.
 * 
 * Guarantees:
 * - root.title always present
 * - characters separated into cast / featured_extras_with_lines / voices_and_functional
 * - collapses CONT'D duplicates
 * - counts always present and consistent
 * - props minimum enforcement for features (with warnings)
 */

type AnyObj = Record<string, unknown>;

const TITLE_MAX_WORDS = 12;
const TITLE_MAX_CHARS = 80;

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

function pickTitle(input: AnyObj): string {
  const candidates = [
    (input?.title as string | undefined),
    ((input?.metadata as AnyObj)?.title as string | undefined),
    (((input?.breakdown_pro as AnyObj)?.metadata as AnyObj)?.title as string | undefined),
    ((input?.outline as AnyObj)?.title as string | undefined),
    ((input?.script as AnyObj)?.title as string | undefined),
  ];

  for (const c of candidates) {
    if (isProbablyTitle(c)) return c.trim();
  }

  // Fallback: try to derive from first lines if text exists
  const rawText: string | undefined =
    (input?.raw_text as string) || (input?.text as string) || (input?.script_text as string);
  if (typeof rawText === "string" && rawText.trim()) {
    const head = rawText.split("\n").slice(0, 25).map(l => l.trim()).filter(Boolean);
    for (const line of head) {
      const isAllCapsish =
        line.length <= TITLE_MAX_CHARS &&
        /[A-Z]/.test(line) &&
        line === line.toUpperCase() &&
        !/^INT\.|^EXT\.|^INT\/EXT/i.test(line);
      if (isAllCapsish && isProbablyTitle(line)) return line.trim();
    }
  }

  return "";
}

function normalizeCharacterName(nameRaw: unknown): string {
  if (typeof nameRaw !== "string") return "";
  let n = nameRaw.trim();

  // Strip common screenplay suffixes
  n = n
    .replace(/\bCONT['']?D\.?\b/gi, "")
    .replace(/\bCONT\.?\b/gi, "")
    .replace(/\bCONTINUED\b/gi, "")
    .replace(/\((V\.O\.|O\.S\.|O\.C\.|VO|OS|OC|ON SCREEN|OFF)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  return n;
}

function isVoiceOrFunctional(name: string): boolean {
  const u = name.toUpperCase();
  return (
    u.includes("VOICE") ||
    u.includes("RADIO") ||
    u.includes("ANNOUNCER") ||
    u.includes("PA SYSTEM") ||
    u.includes("INTERCOM") ||
    u.includes("NARRATOR")
  );
}

function isFeaturedExtraRole(name: string): boolean {
  const u = name.toUpperCase();
  const roleKeywords = [
    "SOLDIER", "AIDE", "SECRETARY", "STUDENT", "SCIENTIST", "OFFICER",
    "GUARD", "DRIVER", "WAITER", "BARTENDER", "DOCTOR", "NURSE",
    "REPORTER", "POLICEMAN", "POLICE", "AGENT", "CLERK", "JUDGE",
    "SENATOR", "CONGRESSMAN", "TECH", "OPERATOR", "MR.", "MRS."
  ];

  const looksLabel = u === name && name.length <= 35 && !/[a-z]/.test(name);
  const hasKeyword = roleKeywords.some(k => u.includes(k));
  const hasCommaProper = /,/.test(name) && /[A-Z][a-z]/.test(name);
  if (hasCommaProper) return false;

  return looksLabel && hasKeyword;
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

export function normalizeBreakdown(input: AnyObj): NormalizedBreakdown {
  const out: AnyObj = { ...input };

  // Scenes
  const inputScenes = input.scenes as AnyObj | undefined;
  out.scenes = out.scenes || {};
  (out.scenes as AnyObj).list = safeArray((inputScenes?.list));
  const scenesTotal = typeof (inputScenes?.total) === "number"
    ? inputScenes.total as number
    : safeArray(inputScenes?.list).length;
  (out.scenes as AnyObj).total = scenesTotal;

  // Title (root)
  out.title = pickTitle(input);

  // Metadata passthrough
  out.metadata = (out.metadata as AnyObj) || {};
  if (!(out.metadata as AnyObj).title && out.title) {
    (out.metadata as AnyObj).title = out.title;
  }

  // Locations: support both flat array and new shape
  const inputLocations = input.locations;
  const flatLocations = safeArray(inputLocations);
  const baseLocationsInput = (inputLocations as AnyObj)?.base;
  const baseLocations = safeArray(baseLocationsInput).length 
    ? safeArray(baseLocationsInput) 
    : flatLocations;

  out.locations = out.locations || {};
  (out.locations as AnyObj).base = safeArray(baseLocations).map((l: unknown) => {
    const loc = l as AnyObj;
    const name = typeof loc?.name === "string" ? (loc.name as string).trim() : "";
    const variants = safeArray(loc?.variants).map((v: unknown) => String(v));
    return { name, variants };
  }).filter((l: NormalizedLocation) => l.name);

  (out.locations as AnyObj).variants = safeArray((inputLocations as AnyObj)?.variants);

  // Characters: normalize from flat array into 3 groups
  const flatChars = safeArray<CharacterInput>(input.characters).map((c) => ({
    ...c,
    name_raw: c?.name ?? "",
    name: normalizeCharacterName(c?.name ?? ""),
  })).filter((c) => c.name);

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

  out.characters = {
    cast: uniqueBy(cast, (c) => c.name.toUpperCase()),
    featured_extras_with_lines: uniqueBy(featured, (c) => c.name.toUpperCase()),
    voices_and_functional: uniqueBy(voices, (c) => c.name.toUpperCase()),
  };

  // Props: prefer input.props; fallback props_key
  const propsInput = safeArray(input.props).length ? safeArray(input.props) : safeArray(input.props_key);
  out.props = propsInput;

  // Enforce minimum props for feature scripts
  const minProps = isFeatureLength((out.scenes as AnyObj).total as number) ? 8 : 4;
  if ((out.props as unknown[]).length > 0 && (out.props as unknown[]).length < minProps) {
    out._warnings = out._warnings || [];
    (out._warnings as BreakdownWarning[]).push({
      code: "PROPS_TOO_FEW",
      message: `Props count (${(out.props as unknown[]).length}) below minimum (${minProps}) for this script length.`,
    });
  }

  // Setpieces
  out.setpieces = safeArray(input.setpieces);

  // Counts: always compute
  const computedCounts = computeCounts(out);
  out.counts = computedCounts;

  return out as NormalizedBreakdown;
}
