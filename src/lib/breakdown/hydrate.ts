// src/lib/breakdown/hydrate.ts
// Shared hydration helpers for v10+/v23/Vxx nested + legacy flat structures

export type AnyObj = Record<string, any>;
export type Counts = Record<string, any>;

export const pickArray = <T = any>(...candidates: any[]): T[] => {
  for (const c of candidates) if (Array.isArray(c)) return c as T[];
  return [];
};

export const getBreakdownPayload = (raw: any): AnyObj | null => {
  const r = raw ?? null;
  if (!r || typeof r !== "object") return null;
  return (r.breakdown ?? r) as AnyObj;
};

export const hydrateCharacters = (raw: any): any[] => {
  const p = getBreakdownPayload(raw);
  if (!p) return [];

  const ch = p.characters;

  // Helper to normalize name from various fields
  const normalizeName = (c: any): string =>
    c?.name ?? c?.canonical_name ?? c?.label ?? c?.id ?? 'Unknown';

  // Priority 1: narrative_classification (most complete format from script-breakdown v25+)
  if (ch && typeof ch === "object" && !Array.isArray(ch) && ch.narrative_classification) {
    const nc = ch.narrative_classification;
    const result: any[] = [];

    // Protagonists → cast bucket
    for (const c of pickArray(nc.protagonists)) {
      result.push({ ...c, name: normalizeName(c), __bucket: 'cast', role: c.role ?? 'protagonist' });
    }
    // Major supporting → cast bucket
    for (const c of pickArray(nc.major_supporting)) {
      result.push({ ...c, name: normalizeName(c), __bucket: 'cast', role: c.role ?? 'supporting' });
    }
    // Minor speaking → featured bucket
    for (const c of pickArray(nc.minor_speaking)) {
      result.push({ ...c, name: normalizeName(c), __bucket: 'featured', role: c.role ?? 'minor' });
    }
    // Voices/systems → voice bucket
    for (const c of pickArray(nc.voices_systems, nc.voices_and_functional)) {
      result.push({ ...c, name: normalizeName(c), __bucket: 'voice', role: c.role ?? 'voice' });
    }

    if (result.length) return result;
  }

  // Priority 2: PRO format (protagonists, co_protagonists, secondary, minor at top level of characters)
  if (ch && typeof ch === "object" && !Array.isArray(ch)) {
    const hasProFormat = ch.protagonists || ch.co_protagonists || ch.secondary || ch.minor;
    if (hasProFormat) {
      const result: any[] = [];
      for (const c of pickArray(ch.protagonists)) {
        result.push({ ...c, name: normalizeName(c), __bucket: 'cast', role: 'protagonist' });
      }
      for (const c of pickArray(ch.co_protagonists)) {
        result.push({ ...c, name: normalizeName(c), __bucket: 'cast', role: 'co_protagonist' });
      }
      for (const c of pickArray(ch.secondary)) {
        result.push({ ...c, name: normalizeName(c), __bucket: 'cast', role: 'secondary' });
      }
      for (const c of pickArray(ch.minor)) {
        result.push({ ...c, name: normalizeName(c), __bucket: 'featured', role: 'minor' });
      }
      if (result.length) return result;
    }

    // Priority 3: v10+ nested object (cast, extras, voices)
    const cast = pickArray(ch.cast);
    const extras = pickArray(ch.featured_extras_with_lines, ch.extras);
    const voices = pickArray(ch.voices_and_functional, ch.voices);
    const flat = pickArray(ch.all, ch.items);

    // Add bucket markers
    const taggedCast = cast.map((c: any) => ({ ...c, name: normalizeName(c), __bucket: 'cast' }));
    const taggedExtras = extras.map((c: any) => ({ ...c, name: normalizeName(c), __bucket: 'featured' }));
    const taggedVoices = voices.map((c: any) => ({ ...c, name: normalizeName(c), __bucket: 'voice' }));

    const merged = [...taggedCast, ...taggedExtras, ...taggedVoices];
    if (merged.length) return merged;

    // Flat arrays with bucket markers
    return flat.map((c: any) => ({ ...c, name: normalizeName(c), __bucket: 'cast' }));
  }

  // Priority 4: legacy arrays (main_characters, characters as array)
  const legacy = pickArray(p.main_characters, p.characters);
  return legacy.map((c: any) => ({ ...c, name: normalizeName(c), __bucket: 'cast' }));
};

export const hydrateLocations = (raw: any): any[] => {
  const p = getBreakdownPayload(raw);
  if (!p) return [];

  const loc = p.locations;

  if (loc && typeof loc === "object" && !Array.isArray(loc)) {
    const base = pickArray(loc.base, loc.items, loc.list);
    if (base.length) return base;
  }

  return pickArray(p.locations);
};

export const hydrateScenes = (raw: any): any[] => {
  const p = getBreakdownPayload(raw);
  if (!p) return [];

  const sc = p.scenes;

  if (sc && typeof sc === "object" && !Array.isArray(sc)) {
    const list = pickArray(sc.list, sc.items);
    if (list.length) return list;
  }

  return pickArray(p.scenes);
};

export const hydrateProps = (raw: any): any[] => {
  const p = getBreakdownPayload(raw);
  if (!p) return [];
  return pickArray(p.props);
};

// Helper to build robust counts from hydrated data
export const buildRobustCounts = (
  payload: any,
  chars: any[],
  locs: any[],
  scenes: any[],
  propsArr: any[],
  episodesArr: any[]
): Record<string, any> => {
  const existingCounts = (payload?.counts ?? null) as Record<string, any> | null;

  // Recalculate character counts from hydrated data (with __bucket markers)
  const castChars = chars.filter((c: any) => c?.__bucket === 'cast');
  const featuredChars = chars.filter((c: any) => c?.__bucket === 'featured');
  const voiceChars = chars.filter((c: any) => c?.__bucket === 'voice');

  // Calculate protagonists and supporting from hydrated data
  const protagonists =
    chars.filter((c: any) => c?.role === "protagonist" || c?.priority === "P0").length ||
    existingCounts?.protagonists ||
    0;

  const supporting =
    chars.filter((c: any) => c?.role === "supporting" || c?.role === "co_protagonist" || c?.priority === "P1").length ||
    existingCounts?.supporting ||
    0;

  const heroProps =
    existingCounts?.hero_props ??
    propsArr.filter((p: any) => p?.importance === "hero" || p?.priority === "P0").length;

  const totalScenes =
    existingCounts?.total_scenes ??
    (scenes.length || episodesArr.reduce((sum: number, ep: any) => sum + (ep?.scenes?.length || 0), 0) || 0);

  // ALWAYS recalculate characters_total from hydrated data (don't trust existingCounts)
  const charactersTotal = chars.length;

  return {
    ...(existingCounts || {}),
    protagonists,
    supporting,
    characters_total: charactersTotal,
    cast_characters_total: castChars.length,
    featured_extras_total: featuredChars.length,
    voices_total: voiceChars.length,
    locations: locs.length,
    total_scenes: totalScenes,
    hero_props: heroProps,
    props: propsArr.length,
    setpieces:
      typeof existingCounts?.setpieces === "number"
        ? existingCounts.setpieces
        : Array.isArray(payload?.setpieces)
          ? payload.setpieces.length
          : 0,
    dialogues:
      typeof existingCounts?.dialogues === "number"
        ? existingCounts.dialogues
        : typeof payload?.dialogues?.total_lines === "number"
          ? payload.dialogues.total_lines
          : typeof payload?.dialogue_count === "number"
            ? payload.dialogue_count
            : scenes.reduce((sum: number, sc: any) => sum + (sc?.dialogue_lines || sc?.dialogue_blocks?.length || 0), 0),
  };
};

// Helper to extract title from various possible locations
export const extractTitle = (payload: any): string | null => {
  return (
    payload?.title ??
    payload?.metadata?.title ??
    payload?.synopsis?.title ??
    payload?.breakdown_pro?.metadata?.title ??
    null
  );
};

// Helper to extract writers from various possible locations
export const extractWriters = (payload: any): string[] => {
  return (
    payload?.writers ??
    payload?.metadata?.writers ??
    payload?.breakdown_pro?.metadata?.writers ??
    []
  );
};
