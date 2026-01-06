import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeBreakdown, type NormalizedBreakdown } from "../_shared/normalizeBreakdown.ts";

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

// Add scriptText info to breakdown for the shared normalizer
function enrichBreakdownWithScriptData(data: any, scriptText: string): any {
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

  // --- Scenes fallback logic ---
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

  // Ensure scenes.total matches scenes.list.length
  if (out.scenes?.list) {
    out.scenes.total = out.scenes.list.length;
  }

  console.log(`[script-breakdown] Final scene count: ${out.scenes?.total || 0} (expected: ${expectedSceneCount})`);

  // Add validation metadata
  out.validation = {
    scene_headings_found: expectedSceneCount,
    scenes_total_equals_list_length: out.scenes?.total === out.scenes?.list?.length,
    used_source: expectedSceneCount > 0 ? 'screenplay' : 'unknown',
    source_reason: expectedSceneCount > 0 ? 'Found INT./EXT. scene headings' : 'No standard screenplay headings found'
  };

  // Add raw text for title extraction fallback
  out.raw_text = scriptText.slice(0, 5000);

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
    // Step 1: Enrich with regex-extracted scenes and validation metadata
    const enrichedData = enrichBreakdownWithScriptData(breakdownData, processedScriptText);
    // Step 2: Normalize into canonical schema (title, counts, characters split, etc.)
    const normalizedData = normalizeBreakdown(enrichedData);

    console.log('[script-breakdown-bg] Analysis complete:', {
      scenes: normalizedData.counts?.scenes_total || 0,
      cast: normalizedData.counts?.cast_characters_total || 0,
      extras: normalizedData.counts?.featured_extras_total || 0,
      voices: normalizedData.counts?.voices_total || 0,
      locationsBase: normalizedData.counts?.locations_base_total || 0,
      props: normalizedData.counts?.props_total || 0,
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
      const scenesList = Array.isArray(normalizedData.scenes?.list) ? normalizedData.scenes.list : [];
      const synopsisText = (enrichedData.synopsis?.summary || enrichedData.synopsis?.logline || '') as string;

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

      // Build flattened characters for backward compatibility
      const allCharacters: any[] = [];
      const chars = normalizedData.characters || {};
      
      // New canonical format: cast, featured_extras_with_lines, voices_and_functional
      for (const c of (chars.cast || [])) {
        allCharacters.push({ ...c, role: c.role || 'supporting', priority: c.priority || 'P2' });
      }
      for (const c of (chars.featured_extras_with_lines || [])) {
        allCharacters.push({ ...c, role: 'featured_extra', priority: 'P3' });
      }
      for (const c of (chars.voices_and_functional || [])) {
        allCharacters.push({ ...c, role: 'voice', priority: 'P3' });
      }

      // Flatten locations for backward compatibility
      const allLocations: any[] = [];
      const locs = normalizedData.locations || {};
      for (const loc of (locs.base || [])) {
        allLocations.push({ ...loc, type: 'base' });
      }

      const parsedJson = {
        // Schema version for future migrations
        schema_version: 'v7-canonical',
        breakdown_version: 2,
        
        // ═══════════════════════════════════════════════════════════════════════════
        // CANONICAL ROOT-LEVEL FIELDS (UI reads from here)
        // ═══════════════════════════════════════════════════════════════════════════
        title: normalizedData.title || 'Guion Analizado',
        metadata: normalizedData.metadata || { title: normalizedData.title },
        counts: normalizedData.counts,
        
        // Synopsis (from enrichedData since normalizer doesn't touch it)
        synopsis: synopsisText,
        logline: (enrichedData.synopsis?.logline || '') as string,
        
        // Scenes in canonical format
        scenes: normalizedData.scenes,
        
        // Characters in CANONICAL format (UI should use this)
        characters: normalizedData.characters,
        // Also keep flat array for backward compatibility
        characters_flat: allCharacters,
        
        // Locations in CANONICAL format
        locations: normalizedData.locations,
        // Also keep flat array for backward compatibility
        locations_flat: allLocations,
        
        // Props and setpieces
        props: normalizedData.props || [],
        setpieces: normalizedData.setpieces || [],
        
        // Validation and warnings
        validation: enrichedData.validation || {},
        _warnings: normalizedData._warnings || [],
        
        // Episodes for series format
        episodes: parsedEpisodes,
      };

      console.log('[script-breakdown-bg] Canonical title:', parsedJson.title);
      console.log('[script-breakdown-bg] Counts:', parsedJson.counts);

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
      result: { success: true, breakdown: normalizedData },
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
