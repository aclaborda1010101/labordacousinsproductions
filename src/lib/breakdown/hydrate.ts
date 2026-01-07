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

  // v10+ nested object
  if (ch && typeof ch === "object" && !Array.isArray(ch)) {
    const cast = pickArray(ch.cast);
    const extras = pickArray(ch.featured_extras_with_lines, ch.extras);
    const voices = pickArray(ch.voices_and_functional, ch.voices);
    const flat = pickArray(ch.all, ch.items);
    const merged = [...cast, ...extras, ...voices];
    return merged.length ? merged : flat;
  }

  // legacy arrays
  return pickArray(p.main_characters, p.characters);
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

  const protagonists =
    existingCounts?.protagonists ??
    (Array.isArray(payload?.characters?.protagonists) ? payload.characters.protagonists.length : null) ??
    chars.filter((c: any) => c?.role === "protagonist" || c?.priority === "P0").length;

  const supporting =
    existingCounts?.supporting ??
    (Array.isArray(payload?.characters?.major_supporting) ? payload.characters.major_supporting.length : null) ??
    chars.filter((c: any) => c?.role === "supporting" || c?.priority === "P1").length;

  const heroProps =
    existingCounts?.hero_props ??
    propsArr.filter((p: any) => p?.importance === "hero" || p?.priority === "P0").length;

  const totalScenes =
    existingCounts?.total_scenes ??
    (scenes.length || episodesArr.reduce((sum: number, ep: any) => sum + (ep?.scenes?.length || 0), 0) || 0);

  return {
    ...(existingCounts || {}),
    protagonists,
    supporting,
    characters_total: existingCounts?.characters_total ?? chars.length,
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
