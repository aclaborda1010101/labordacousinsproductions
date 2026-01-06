import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
// SIMPLE SCRIPT BREAKDOWN PROMPT (v7 - No Tools, Flexible JSON)
// ═══════════════════════════════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are a professional film/TV script breakdown analyst.

IMPORTANT:
- Output MUST be valid JSON only. No markdown, no explanations.
- Schema is flexible - include what you find.
- If uncertain, include it anyway rather than failing.

SOURCE RULE:
If multiple documents exist, use ONLY the full screenplay
(the one with repeated INT./EXT. scene headings).

SCENES:
- Each line starting with INT. or EXT. is ONE scene.
- Count all of them. List them in order.
- total MUST equal the number of scenes listed.

CHARACTERS:
Normalize names - remove CONT'D, (V.O.), (O.S.), etc.
Group into:
- cast (named characters with narrative weight)
- featured_extras (roles like SOLDIER, AIDE, SECRETARY)
- voices (VOICE, RADIO, ANNOUNCER)

LOCATIONS:
- Extract base locations (group variants by removing DAY/NIGHT/etc).
- Also extract full variants for production.

PROPS:
Include plot-critical, recurring, OR institutional/symbolic props.

SETPIECES:
Include action, trials, hearings, tests, chases, emotional peaks.

OUTPUT THIS JSON STRUCTURE:
{
  "title": "string",
  "scenes": {
    "total": number,
    "list": [{"number": 1, "heading": "INT. LOCATION - DAY", "location_base": "LOCATION"}]
  },
  "characters": {
    "cast": [{"name": "CHARACTER", "scenes_count": 5}],
    "featured_extras": [],
    "voices": []
  },
  "locations": {
    "base": [{"name": "LOCATION", "scenes_count": 3}],
    "variants": [{"name": "INT. LOCATION - DAY", "base": "LOCATION"}]
  },
  "props": [{"name": "ITEM", "importance": "high"}],
  "setpieces": [{"name": "ACTION SEQUENCE", "type": "chase"}],
  "notes": "any production notes"
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
  // Remove CONT'D, V.O., O.S., etc.
  name = name.replace(/\s*(CONT['']?D?\.?|CONTINUED|CONT\.)\s*/gi, '').trim();
  name = name.replace(/\(V\.?O\.?\)|\(O\.?S\.?\)|\(O\.?C\.?\)|\(ON\s?SCREEN\)|\(OFF\)/gi, '').trim();
  name = name.replace(/[()]/g, '').trim();

  // Filter out common screenplay transitions / non-character cues
  const upper = name.toUpperCase();
  const banned = new Set([
    'CUT TO',
    'SMASH CUT',
    'DISSOLVE TO',
    'FADE IN',
    'FADE OUT',
    'FADE TO BLACK',
    'TITLE',
    'SUPER',
    'MONTAGE',
    'END',
    'CONTINUED',
    'THE END',
    'CREDITS',
    'BLACK',
    'FLASHBACK',
    'INTERCUT',
    'BACK TO',
    'MATCH CUT',
    'JUMP CUT',
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
      
      // Normalize base location (remove time suffixes)
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

// Normalize breakdown to ensure counts are consistent
function normalizeBreakdown(data: any, scriptText: string): any {
  const out: any = (data && typeof data === 'object') ? data : {};
  
  const asArray = (v: any) => (Array.isArray(v) ? v : []);

  // --- Pre-count expected scenes from script text ---
  const expectedHeadings: string[] = [];
  const scriptLines = scriptText.split(/\r?\n/);
  for (const line of scriptLines) {
    const trimmed = line.trim();
    if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
      expectedHeadings.push(trimmed);
    }
  }
  const expectedSceneCount = expectedHeadings.length;
  console.log(`[script-breakdown] Expected scene count from regex: ${expectedSceneCount}`);

  // --- Scenes ---
  const aiScenesList = asArray(out.scenes?.list);
  const regexScenes = extractScenesFromScript(scriptText);

  // Decide whether to use AI scenes or regex fallback
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

  // Ensure scenes.total matches scenes.list.length
  if (out.scenes?.list) {
    out.scenes.total = out.scenes.list.length;
  }

  console.log(`[script-breakdown] Final scene count: ${out.scenes?.total || 0} (expected: ${expectedSceneCount})`);

  // --- Derive characters from scenes if AI didn't provide them ---
  const derivedCharMap = new Map<string, { name: string; scenes_count: number; dialogue_lines: number }>();
  const derivedLocBaseMap = new Map<string, { name: string; scenes_count: number; variants_count: number }>();
  const derivedLocVariantMap = new Map<string, any>();

  for (const scene of asArray(out.scenes?.list)) {
    // Characters
    for (const charName of asArray(scene?.characters_present)) {
      if (typeof charName !== 'string') continue;
      const cleaned = cleanCharacterCue(charName);
      if (!cleaned) continue;
      const key = cleaned.toLowerCase();
      const existing = derivedCharMap.get(key);
      if (existing) {
        existing.scenes_count++;
        existing.dialogue_lines++;
      } else {
        derivedCharMap.set(key, { name: cleaned, scenes_count: 1, dialogue_lines: 1 });
      }
    }

    // Locations (base and variant)
    const locBase = (scene?.location_base || scene?.location_raw || '') as string;
    const locVariant = scene?.heading || '';
    
    if (locBase) {
      const baseKey = locBase.toLowerCase();
      const existing = derivedLocBaseMap.get(baseKey);
      if (existing) {
        existing.scenes_count++;
      } else {
        derivedLocBaseMap.set(baseKey, { name: locBase, scenes_count: 1, variants_count: 0 });
      }
      
      // Track variant
      if (locVariant && !derivedLocVariantMap.has(locVariant)) {
        derivedLocVariantMap.set(locVariant, {
          name: locVariant,
          base: locBase,
          int_ext: scene?.int_ext || 'INT',
          time: scene?.time || '',
          tags: scene?.tags || [],
          scenes: [scene?.number || 0]
        });
        const baseEntry = derivedLocBaseMap.get(baseKey);
        if (baseEntry) baseEntry.variants_count++;
      } else if (locVariant) {
        derivedLocVariantMap.get(locVariant)?.scenes?.push(scene?.number || 0);
      }
    }
  }

  // Build derived characters by role (simple heuristic)
  const derivedCharacters = Array.from(derivedCharMap.values());
  derivedCharacters.sort((a, b) => b.scenes_count - a.scenes_count);
  
  const protagonists: any[] = [];
  const secondary: any[] = [];
  const minor: any[] = [];
  const featuredExtras: any[] = [];
  
  derivedCharacters.forEach((c, idx) => {
    const charObj = { name: c.name, scenes_count: c.scenes_count, dialogue_lines: c.dialogue_lines };
    if (idx < 2 && c.scenes_count >= 5) {
      protagonists.push({ ...charObj, arc: 'Inferred from scene presence' });
    } else if (c.scenes_count >= 3) {
      secondary.push({ ...charObj, role_detail: 'Recurring character' });
    } else if (c.scenes_count >= 2) {
      minor.push(charObj);
    } else {
      featuredExtras.push(charObj);
    }
  });

  // --- Ensure characters object exists with proper structure ---
  // Support both old format (protagonists/secondary/etc) and new simplified format (cast/featured_extras/voices)
  const inputChars = out.characters || {};
  
  if (Array.isArray(inputChars.cast) || Array.isArray(inputChars.featured_extras)) {
    // New simplified format - convert to standard format for compatibility
    out.characters = {
      protagonists: [],
      co_protagonists: [],
      antagonists: [],
      secondary: asArray(inputChars.cast),
      minor: [],
      featured_extras_with_lines: asArray(inputChars.featured_extras),
      voices_and_functional: asArray(inputChars.voices)
    };
    console.log(`[script-breakdown] Using simplified character format: ${asArray(inputChars.cast).length} cast, ${asArray(inputChars.featured_extras).length} extras`);
  } else if (!inputChars.protagonists && !inputChars.secondary) {
    // No characters from AI - use derived
    out.characters = {
      protagonists: protagonists,
      co_protagonists: [],
      antagonists: [],
      secondary: secondary,
      minor: minor,
      featured_extras_with_lines: featuredExtras,
      voices_and_functional: []
    };
    console.log(`[script-breakdown] Built characters from scene data: ${derivedCharacters.length} total`);
  }

  // --- Ensure locations object exists with proper structure ---
  const inputLocs = out.locations || {};
  
  if (Array.isArray(inputLocs.base) && !inputLocs.base?.list) {
    // New simplified format - base is array directly
    out.locations = {
      base: { total: inputLocs.base.length, list: inputLocs.base },
      variants: { total: asArray(inputLocs.variants).length, list: asArray(inputLocs.variants) }
    };
    console.log(`[script-breakdown] Using simplified location format: ${inputLocs.base.length} base locations`);
  } else if (!inputLocs.base && !inputLocs.variants) {
    const baseList = Array.from(derivedLocBaseMap.values());
    const variantList = Array.from(derivedLocVariantMap.values());
    
    out.locations = {
      base: { total: baseList.length, list: baseList },
      variants: { total: variantList.length, list: variantList }
    };
    console.log(`[script-breakdown] Built locations from scene data: ${baseList.length} base, ${variantList.length} variants`);
  }

  // --- Ensure counts object exists and is consistent ---
  const chars = out.characters || {};
  const locs = out.locations || {};
  const props = asArray(out.props_key || out.props);
  const setpieces = asArray(out.setpieces);
  
  const castCount = 
    asArray(chars.protagonists).length +
    asArray(chars.co_protagonists).length +
    asArray(chars.antagonists).length +
    asArray(chars.secondary).length +
    asArray(chars.minor).length;
  
  const extrasCount = asArray(chars.featured_extras_with_lines).length;
  const voicesCount = asArray(chars.voices_and_functional).length;

  out.counts = {
    scenes_total: out.scenes?.total || out.scenes?.list?.length || 0,
    cast_characters_total: castCount,
    featured_extras_total: extrasCount,
    voices_total: voicesCount,
    locations_base_total: locs.base?.total || locs.base?.list?.length || asArray(locs.base).length || 0,
    locations_variants_total: locs.variants?.total || locs.variants?.list?.length || asArray(locs.variants).length || 0,
    props_total: props.length,
    setpieces_total: setpieces.length
  };
  
  // Also store props in standard location
  out.props_key = props;

  // --- Ensure validation object ---
  if (!out.validation) {
    out.validation = {
      scene_headings_found: expectedSceneCount,
      scenes_total_equals_list_length: out.scenes?.total === out.scenes?.list?.length,
      used_source: expectedSceneCount > 0 ? 'screenplay' : 'unknown',
      source_reason: expectedSceneCount > 0 ? 'Found INT./EXT. scene headings' : 'No standard screenplay headings found'
    };
  }

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

// ===== GET USER ID FROM AUTH HEADER =====
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

// ===== BACKGROUND PROCESSING FUNCTION =====
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

  try {
    // Update task to running
    await supabase.from('background_tasks').update({
      status: 'running',
      progress: 10,
      description: 'Analizando estructura narrativa con Claude Haiku...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    const isLongScript = processedScriptText.length > 40000;

    // ══════════════════════════════════════════════════════════════════════
    // PRE-COUNT SCENE HEADINGS (critical for accurate scene counting)
    // ══════════════════════════════════════════════════════════════════════
    const headingLines: string[] = [];
    const scriptLines = processedScriptText.split(/\r?\n/);
    for (const line of scriptLines) {
      const trimmed = line.trim();
      if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
        headingLines.push(trimmed);
      }
    }
    console.log(`[script-breakdown-bg] PRE-COUNTED ${headingLines.length} scene headings`);

    const userPrompt = `
═══════════════════════════════════════════════════════════════════════════════
SCENE COUNTING RULES (CRITICAL - READ BEFORE ANYTHING ELSE)
═══════════════════════════════════════════════════════════════════════════════

I have PRE-SCANNED this script and found EXACTLY ${headingLines.length} scene headings (lines starting with INT./EXT.).

YOUR scenes.list ARRAY MUST CONTAIN EXACTLY ${headingLines.length} ENTRIES.
YOUR scenes.total MUST EQUAL ${headingLines.length}.
YOUR counts.scenes_total MUST EQUAL ${headingLines.length}.

Here are the scene headings I found:
${headingLines.slice(0, 50).map((h, i) => `${i + 1}. ${h}`).join('\n')}${headingLines.length > 50 ? `\n... and ${headingLines.length - 50} more scenes` : ''}

RULES:
- RULE 1: Same location + different time = DIFFERENT scenes
- RULE 2: Same location + INT vs EXT = DIFFERENT scenes
- RULE 3: Do NOT merge, group, or summarize scenes. List ALL ${headingLines.length} individually.
- RULE 4: If your scenes array has fewer than ${headingLines.length} entries, you made an error.

═══════════════════════════════════════════════════════════════════════════════
PRODUCTION BREAKDOWN REQUEST
═══════════════════════════════════════════════════════════════════════════════

PROJECT ID: ${projectId}
RESPONSE LANGUAGE: ${language || 'es-ES'}
${isLongScript ? '\nNOTE: This is a long script. Analyze all available content exhaustively.\n' : ''}

SCRIPT TO ANALYZE:
---
${processedScriptText}
---

Perform an EXHAUSTIVE breakdown of this script. Extract ALL production entities following the JSON format specified.

IMPORTANT:
- Be exhaustive: don't miss any character, prop, or location
- COUNT EXACTLY ${headingLines.length} SCENES (one per INT./EXT. found)
- Normalize character names (remove CONT'D, V.O., O.S., etc.)
- Separate CAST characters from FEATURED EXTRAS from VOICES
- Group locations into BASE (for Bible) and VARIANTS (for Production)
- Assign realistic priorities
- Include useful production notes`;

    console.log('[script-breakdown-bg] Starting Claude Haiku analysis for task:', taskId, 'chars:', processedScriptText.length);

    await supabase.from('background_tasks').update({
      progress: 25,
      description: 'Enviando guion a Claude Haiku 3.5...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Use Claude 3.5 Haiku - NO TOOLS, just JSON output
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
        // NO TOOLS - just ask for JSON directly
      }),
    });

    await supabase.from('background_tasks').update({
      progress: 60,
      description: 'Procesando respuesta de Claude Haiku...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[script-breakdown-bg] Anthropic API error:', response.status, errorText.slice(0, 500));
      // DO NOT proceed - throw error to prevent overwriting good data
      throw new Error(`Anthropic API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();

    // Parse text response (no tools)
    let breakdownData: any = null;
    const textBlock = data.content?.find((block: any) => block.type === 'text');
    if (textBlock?.text) {
      breakdownData = tryParseJson(textBlock.text);
    }

    if (!breakdownData) {
      console.error('[script-breakdown-bg] Failed to parse JSON from response');
      // DO NOT overwrite existing data - throw error
      throw new Error('No se pudo interpretar la respuesta del modelo como JSON');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BACKEND NORMALIZATION (all validation happens here, not in Claude schema)
    // ═══════════════════════════════════════════════════════════════════════════
    breakdownData = normalizeBreakdown(breakdownData, processedScriptText);

    console.log('[script-breakdown-bg] Analysis complete:', {
      scenes: breakdownData.counts?.scenes_total || 0,
      cast: breakdownData.counts?.cast_characters_total || 0,
      extras: breakdownData.counts?.featured_extras_total || 0,
      voices: breakdownData.counts?.voices_total || 0,
      locationsBase: breakdownData.counts?.locations_base_total || 0,
      props: breakdownData.counts?.props_total || 0,
    });

    await supabase.from('background_tasks').update({
      progress: 80,
      description: 'Guardando resultados en base de datos...',
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    // Save to script if scriptId provided
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

      // Convert new scene format to flat array for episodes
      const scenesList = Array.isArray(breakdownData.scenes?.list) ? breakdownData.scenes.list : [];
      const synopsisText = breakdownData.synopsis?.summary || breakdownData.synopsis?.logline || '';

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

        // Simple even distribution for series
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

      // Extract title from metadata
      const extractedTitle = breakdownData.metadata?.title || null;
      const extractedWriters = breakdownData.metadata?.writers || [];

      // Flatten characters for backward compatibility
      const allCharacters: any[] = [];
      const chars = breakdownData.characters || {};
      
      for (const c of (chars.protagonists || [])) {
        allCharacters.push({ ...c, role: 'protagonist', priority: 'P1' });
      }
      for (const c of (chars.co_protagonists || [])) {
        allCharacters.push({ ...c, role: 'co_protagonist', priority: 'P1' });
      }
      for (const c of (chars.antagonists || [])) {
        allCharacters.push({ ...c, role: 'antagonist', priority: 'P1' });
      }
      for (const c of (chars.secondary || [])) {
        allCharacters.push({ ...c, role: 'secondary', priority: 'P2' });
      }
      for (const c of (chars.minor || [])) {
        allCharacters.push({ ...c, role: 'minor', priority: 'P3' });
      }
      for (const c of (chars.featured_extras_with_lines || [])) {
        allCharacters.push({ ...c, role: 'featured_extra', priority: 'P3' });
      }
      for (const c of (chars.voices_and_functional || [])) {
        allCharacters.push({ ...c, role: 'voice', priority: 'P3' });
      }

      // Flatten locations for backward compatibility
      const allLocations: any[] = [];
      const locs = breakdownData.locations || {};
      for (const loc of (locs.base?.list || [])) {
        allLocations.push({ ...loc, type: 'base' });
      }

      const parsedJson = {
        // Schema version for future migrations
        schema_version: 'v6-hollywood',
        breakdown_version: 1,
        
        // Core metadata
        title: extractedTitle || 'Guion Analizado',
        writers: extractedWriters,
        metadata: breakdownData.metadata || null,
        synopsis: synopsisText,
        logline: breakdownData.synopsis?.logline || '',
        
        // Production counts (new v6 format)
        counts: breakdownData.counts,
        
        // Scenes in new format
        scenes: breakdownData.scenes,
        
        // Characters in new categorized format + flat array for compatibility
        characters_categorized: breakdownData.characters,
        characters: allCharacters,
        
        // Locations in new format + flat array for compatibility
        locations_structured: breakdownData.locations,
        locations: allLocations,
        
        // Props and setpieces
        props_key: breakdownData.props_key || [],
        props: breakdownData.props_key || [],
        setpieces: breakdownData.setpieces || [],
        
        // Production info
        production: breakdownData.production || {},
        validation: breakdownData.validation || {},
        
        // Episodes for series format
        episodes: parsedEpisodes,
      };

      console.log('[script-breakdown-bg] Extracted title:', extractedTitle, 'writers:', extractedWriters);
      console.log('[script-breakdown-bg] Counts:', breakdownData.counts);

      const { error: updateError } = await supabase
        .from('scripts')
        .update({ 
          parsed_json: parsedJson,
          status: 'analyzed'
        })
        .eq('id', scriptId);

      if (updateError) {
        console.error('[script-breakdown-bg] Error saving parsed_json:', updateError);
      } else {
        console.log('[script-breakdown-bg] Saved parsed_json to script:', scriptId);
      }
    }

    // Complete task with result
    await supabase.from('background_tasks').update({
      status: 'completed',
      progress: 100,
      description: 'Análisis completado',
      result: { success: true, breakdown: breakdownData },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);

    console.log('[script-breakdown-bg] Task completed successfully:', taskId);

  } catch (error) {
    console.error('[script-breakdown-bg] Error in background processing:', error);

    await supabase.from('background_tasks').update({
      status: 'failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Error desconocido',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
  }
}

// ===== MAIN HANDLER =====
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

    // Get user ID from auth header
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

    // Create background task
    const taskId = crypto.randomUUID();
    const estimatedChars = scriptText.trim().length;
    const estimatedPages = Math.ceil(estimatedChars / 3500);

    await supabase.from('background_tasks').insert({
      id: taskId,
      user_id: userId,
      project_id: projectId,
      type: 'script_analysis',
      title: 'Análisis de guion con Claude Haiku',
      description: `Analizando ~${estimatedPages} páginas con IA...`,
      status: 'pending',
      progress: 0,
      entity_id: scriptId || null,
      metadata: { scriptLength: estimatedChars, estimatedPages },
    });

    console.log('[script-breakdown] Created background task:', taskId, 'for', estimatedChars, 'chars');

    // Start background processing with waitUntil
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    EdgeRuntime.waitUntil(processScriptBreakdownInBackground(taskId, request, userId));

    // Return immediately with task ID
    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        message: 'Análisis iniciado en segundo plano',
        polling: true,
        estimatedTimeMin: Math.ceil(estimatedChars / 5000),
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
