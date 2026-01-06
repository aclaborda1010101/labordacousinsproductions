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
  // Project planning hints (optional). If not provided, we load them from the project.
  format?: 'film' | 'series' | string;
  episodesCount?: number;
  episodeDurationMin?: number;
}

const SYSTEM_PROMPT = `You are a PROFESSIONAL SCRIPT BREAKDOWN ANALYST
with experience in film production, screenwriting, and story development.

You are analyzing a FULL HOLLYWOOD SCREENPLAY (feature film or series episode),
written in standard industry format (INT./EXT., dialogue blocks, action blocks).

Your task is NOT to summarize.
Your task is to PERFORM A PROFESSIONAL SCRIPT BREAKDOWN
as it would be done by a film production team or script editor.

━━━━━━━━━━━━━━━━━━━━━━
CORE DEFINITIONS (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━

Use these definitions strictly:

PROTAGONIST:
Character with a complete narrative arc who drives the main story.

CO-PROTAGONIST:
Character with a significant independent arc that shares narrative weight
with the protagonist.

SECONDARY CHARACTER:
Recurring character who influences the plot across multiple scenes.

MINOR CHARACTER:
Appears briefly with limited narrative impact.

SCENE:
Every individual block identified by INT. or EXT. counts as ONE SCENE.
Do NOT group scenes together.

PROP (KEY PROP):
A physical or symbolic object that is narratively important, recurring,
or visually iconic (vehicles, clothing, symbolic items, tools, etc.).

SETPIECE:
A standout narrative sequence due to visual, musical, emotional,
or conceptual impact.
Setpieces are NOT limited to action scenes.

DIALOGUE:
Any spoken line attributed to a named character.

━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — LITERAL EXTRACTION
━━━━━━━━━━━━━━━━━━━━━━

Extract the following directly from the screenplay:

1. CHARACTERS
- List all characters found in the script
- Identify frequency of appearance
- Identify dialogue presence

2. LOCATIONS
- List all unique locations
- Group variations of the same place when appropriate

3. SCENES
- Count ALL scenes by counting every INT./EXT. heading

4. DIALOGUE DATA
- Estimate total dialogue density (low / medium / high)
- Identify top 5 characters with most dialogue

5. PROPS
- List recurring or narratively important objects

━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — NARRATIVE INFERENCE
━━━━━━━━━━━━━━━━━━━━━━

Based on the extracted data, infer:

1. PROTAGONISTS
- Identify protagonist(s) and co-protagonist(s)
- Justify briefly based on narrative arc and presence

2. SECONDARY CHARACTERS
- Identify key secondary characters

3. SETPIECES
- Identify major setpieces (musical numbers, chases, confrontations,
  conceptual sequences, montages, etc.)

━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — PRODUCTION ESTIMATES
━━━━━━━━━━━━━━━━━━━━━━

Provide realistic industry estimates:
- Total number of scenes (exact if possible, otherwise range)
- Narrative density (low / medium / high)
- Dialogue density (low / medium / high)
- Cast size category (small / medium / large)
- Production complexity (low / medium / high)

━━━━━━━━━━━━━━━━━━━━━━
IMPORTANT RULES
━━━━━━━━━━━━━━━━━━━━━━

- Do NOT invent characters or scenes.
- Do NOT undercount scenes.
- Do NOT collapse multiple INT./EXT. into one.
- Use narrative reasoning, not superficial keyword matching.
- Treat this as a real Hollywood screenplay.

━━━━━━━━━━━━━━━━━━━━━━
CHARACTER ROLE CLASSIFICATION
━━━━━━━━━━━━━━━━━━━━━━

Classify each character using these roles:
- protagonist: Drives the main story with a complete arc (max 1-2)
- co_protagonist: Shares narrative weight with protagonist
- supporting: Key secondary characters with significant screen time
- recurring: Appears multiple times but no major arc
- cameo: Brief memorable appearance
- extra_with_line: Minor speaking role
- background: Non-speaking extras

LANGUAGE: Respond in the language indicated.`;

const BREAKDOWN_TOOL = {
  type: 'function',
  function: {
    name: 'return_script_breakdown',
    description: 'Devuelve el desglose completo del guion en un objeto estructurado.',
    parameters: {
      type: 'object',
      properties: {
        synopsis: {
          type: 'object',
          properties: {
            faithful_summary: { type: 'string' },
            conflict_type: { type: 'string' },
            narrative_scope: { type: 'string' },
            temporal_span: { type: 'string' },
            tone: { type: 'string' },
            themes: { type: 'array', items: { type: 'string' } },
          },
          required: ['faithful_summary'],
          additionalProperties: true,
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              scene_number: { type: 'number' },
              slugline: { type: 'string' },
              location_name: { type: 'string' },
              location_type: { type: 'string' },
              time_of_day: { type: 'string' },
              era: { type: 'string' },
              summary: { type: 'string' },
              objective: { type: 'string' },
              mood: { type: 'string' },
              page_range: { type: 'string' },
              estimated_duration_sec: { type: 'number' },
              characters_present: { type: 'array', items: { type: 'string' } },
              props_used: { type: 'array', items: { type: 'string' } },
              continuity_notes: { type: 'string' },
              priority: { type: 'string' },
              complexity: { type: 'string' },
            },
            required: ['scene_number', 'slugline', 'summary'],
            additionalProperties: true,
          },
        },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              entity_type: { type: 'string' },
              role: { type: 'string' },
              role_detail: { type: 'string' },
              description: { type: 'string' },
              personality: { type: 'string' },
              arc: { type: 'string' },
              scale: { type: 'string' },
              first_appearance: { type: 'string' },
              scenes: { type: 'array', items: { type: 'number' } },
              scenes_count: { type: 'number' },
              dialogue_lines: { type: 'number' },
              priority: { type: 'string' },
              notes: { type: 'string' },
              explicitly_described: { type: 'boolean' },
            },
            required: ['name'],
            additionalProperties: true,
          },
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              scale: { type: 'string' },
              era: { type: 'string' },
              description: { type: 'string' },
              scenes: { type: 'array', items: { type: 'number' } },
              scenes_count: { type: 'number' },
              priority: { type: 'string' },
              explicitly_described: { type: 'boolean' },
            },
            required: ['name'],
            additionalProperties: true,
          },
        },
        props: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              description: { type: 'string' },
              importance: { type: 'string' },
              scenes: { type: 'array', items: { type: 'number' } },
              scenes_count: { type: 'number' },
              priority: { type: 'string' },
              explicitly_mentioned: { type: 'boolean' },
            },
            required: ['name'],
            additionalProperties: true,
          },
        },
        set_pieces: { type: 'array', items: { type: 'object', additionalProperties: true } },
        subplots: { type: 'array', items: { type: 'object', additionalProperties: true } },
        plot_twists: { type: 'array', items: { type: 'object', additionalProperties: true } },
        continuity_anchors: { type: 'array', items: { type: 'object', additionalProperties: true } },
        summary: {
          type: 'object',
          properties: {
            total_scenes: { type: 'number' },
            total_characters: { type: 'number' },
            total_locations: { type: 'number' },
            total_props: { type: 'number' },
            estimated_runtime_min: { type: 'number' },
            analysis_confidence: { type: 'string' },
            production_notes: { type: 'string' },
          },
          required: ['total_scenes', 'total_characters', 'total_locations', 'total_props'],
          additionalProperties: true,
        },
      },
      required: ['synopsis', 'scenes', 'characters', 'locations', 'props', 'summary'],
      additionalProperties: true,
    },
  },
};

const SLUGLINE_RE = /^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|INT\.|EXT\.|I\/E\.|EST\.)\b/i;

const looksLikeCharacterCue = (line: string) => {
  // Typical screenplay character cues are mostly uppercase and short.
  const t = line.trim();
  if (!t) return false;
  if (t.length < 2 || t.length > 35) return false;
  if (SLUGLINE_RE.test(t)) return false;
  if (/^(CUT TO:|FADE IN:|FADE OUT\.|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|THE END)\b/i.test(t)) return false;
  // Must be mostly uppercase letters/spaces with optional punctuation.
  return /^[A-Z0-9][A-Z0-9 '\-.()]+$/.test(t) && t === t.toUpperCase();
};

const cleanCharacterCue = (line: string) => {
  let t = line.trim();
  // Remove common suffixes like (V.O.), (O.S.), (CONT'D)
  t = t.replace(/\((V\.O\.|O\.S\.|CONT\.?D?|OFF)\)\s*$/i, '').trim();
  t = t.replace(/\bCONT\.?D?\b\s*$/i, '').trim();
  // Remove trailing punctuation
  t = t.replace(/[:.]+$/g, '').trim();
  return t;
};

const extractScenesFromScript = (raw: string) => {
  const lines = (raw || '').split(/\r?\n/);

  const scenes: any[] = [];
  let current: any | null = null;
  let sceneIndex = 0;

  const pushCurrent = () => {
    if (!current) return;
    // Ensure required fields exist
    current.scene_number = current.scene_number ?? (sceneIndex + 1);
    current.slugline = String(current.slugline || '').trim() || `ESCENA ${current.scene_number}`;
    current.summary = String(current.summary || '').trim() || '—';
    current.characters_present = Array.from(new Set(current.characters_present || [])).filter(Boolean);
    current.props_used = Array.from(new Set(current.props_used || [])).filter(Boolean);
    scenes.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, ' ').trimEnd();
    const trimmed = line.trim();

    if (!trimmed) continue;

    // New scene slugline
    if (SLUGLINE_RE.test(trimmed)) {
      pushCurrent();
      sceneIndex++;

      const slugline = trimmed;
      const typeMatch = slugline.match(/^(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|INT\.|EXT\.|I\/E\.|EST\.)/i);
      const locationType = (typeMatch?.[1] || 'INT').toUpperCase();

      const rest = slugline.replace(typeMatch?.[0] || '', '').trim();
      const parts = rest.split(/\s*[-—]\s*/);
      const locationName = (parts[0] || rest).trim();
      const timeOfDay = (parts[1] || '').trim();

      current = {
        scene_number: sceneIndex,
        slugline,
        location_name: locationName,
        location_type: locationType,
        time_of_day: timeOfDay,
        era: '',
        summary: '',
        objective: '',
        mood: '',
        page_range: '',
        estimated_duration_sec: 60,
        characters_present: [] as string[],
        props_used: [] as string[],
        continuity_notes: '',
        priority: 'P1',
        complexity: 'medium',
      };
      continue;
    }

    if (!current) continue; // ignore pre-slugline content

    // Character cue inside the current scene
    if (looksLikeCharacterCue(trimmed)) {
      const name = cleanCharacterCue(trimmed);
      if (name && name.length <= 40) current.characters_present.push(name);
      continue;
    }

    // First action line becomes a minimal summary fallback
    if (!current.summary) {
      // Avoid using transitions or centered titles as summary
      if (!/^(CUT TO:|FADE IN:|FADE OUT\.|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:)\b/i.test(trimmed)) {
        current.summary = trimmed.slice(0, 180);
      }
    }
  }

  pushCurrent();
  return scenes;
};

const normalizeBreakdown = (input: any, rawScriptText?: string) => {
  const obj = (input && typeof input === 'object') ? input : {};
  let scenes = Array.isArray(obj.scenes) ? obj.scenes : [];

  // If the model returns an empty breakdown (common when output budget is tight),
  // recover at least the scene skeleton from the raw screenplay text.
  if (scenes.length === 0 && rawScriptText && rawScriptText.trim().length > 0) {
    const extracted = extractScenesFromScript(rawScriptText);
    if (extracted.length > 0) {
      console.log(`[normalizeBreakdown] No scenes from model, extracted ${extracted.length} scenes from raw text fallback`);
      scenes = extracted;
    }
  }

  // Extract characters from the model response, or infer from scenes if empty
  let characters = Array.isArray(obj.characters) ? obj.characters : [];
  if (characters.length === 0 && scenes.length > 0) {
    console.log('[normalizeBreakdown] No characters array from model, extracting from scenes...');
    const charMap = new Map<string, { name: string; scenes: number[]; scenes_count: number; dialogue_lines: number }>();
    
    for (const scene of scenes) {
      const sceneNum = scene.scene_number ?? 0;
      const charsInScene = Array.isArray(scene.characters_present) ? scene.characters_present : [];
      
      for (const charName of charsInScene) {
        const normalized = String(charName).trim();
        if (!normalized) continue;
        
        if (charMap.has(normalized)) {
          const existing = charMap.get(normalized)!;
          if (!existing.scenes.includes(sceneNum)) {
            existing.scenes.push(sceneNum);
            existing.scenes_count++;
          }
        } else {
          charMap.set(normalized, {
            name: normalized,
            scenes: [sceneNum],
            scenes_count: 1,
            dialogue_lines: 0,
          });
        }
      }
    }
    
    // Convert to array and assign roles based on appearance frequency
    characters = Array.from(charMap.values())
      .sort((a, b) => b.scenes_count - a.scenes_count)
      .map((c, idx) => ({
        ...c,
        entity_type: 'individual',
        role: idx < 3 ? 'protagonist' : (c.scenes_count >= 5 ? 'supporting' : (c.scenes_count >= 2 ? 'recurring' : 'cameo')),
        priority: idx < 3 ? 'P0' : (c.scenes_count >= 5 ? 'P1' : 'P2'),
        description: '',
        arc: '',
        explicitly_described: false,
      }));
    
    console.log(`[normalizeBreakdown] Extracted ${characters.length} characters from scenes`);
  }
  
  // Extract locations from the model response, or infer from scenes if empty
  let locations = Array.isArray(obj.locations) ? obj.locations : [];
  if (locations.length === 0 && scenes.length > 0) {
    console.log('[normalizeBreakdown] No locations array from model, extracting from scenes...');
    const locMap = new Map<string, { name: string; type: string; scenes: number[]; scenes_count: number }>();
    
    for (const scene of scenes) {
      const sceneNum = scene.scene_number ?? 0;
      const locName = String(scene.location_name ?? scene.slugline ?? '').trim();
      const locType = String(scene.location_type ?? 'INT').trim();
      
      if (!locName) continue;
      
      if (locMap.has(locName)) {
        const existing = locMap.get(locName)!;
        if (!existing.scenes.includes(sceneNum)) {
          existing.scenes.push(sceneNum);
          existing.scenes_count++;
        }
      } else {
        locMap.set(locName, {
          name: locName,
          type: locType,
          scenes: [sceneNum],
          scenes_count: 1,
        });
      }
    }
    
    // Convert to array
    locations = Array.from(locMap.values())
      .sort((a, b) => b.scenes_count - a.scenes_count)
      .map((l, idx) => ({
        ...l,
        scale: 'building',
        priority: idx < 5 ? 'P0' : (l.scenes_count >= 3 ? 'P1' : 'P2'),
        description: '',
        explicitly_described: false,
      }));
    
    console.log(`[normalizeBreakdown] Extracted ${locations.length} locations from scenes`);
  }
  
  // Extract props from scenes if not provided
  let props = Array.isArray(obj.props) ? obj.props : [];
  if (props.length === 0 && scenes.length > 0) {
    const propMap = new Map<string, { name: string; scenes: number[]; scenes_count: number }>();
    
    for (const scene of scenes) {
      const sceneNum = scene.scene_number ?? 0;
      const propsInScene = Array.isArray(scene.props_used) ? scene.props_used : [];
      
      for (const propName of propsInScene) {
        const normalized = String(propName).trim();
        if (!normalized) continue;
        
        if (propMap.has(normalized)) {
          const existing = propMap.get(normalized)!;
          if (!existing.scenes.includes(sceneNum)) {
            existing.scenes.push(sceneNum);
            existing.scenes_count++;
          }
        } else {
          propMap.set(normalized, {
            name: normalized,
            scenes: [sceneNum],
            scenes_count: 1,
          });
        }
      }
    }
    
    props = Array.from(propMap.values())
      .sort((a, b) => b.scenes_count - a.scenes_count)
      .map(p => ({
        ...p,
        type: 'object',
        importance: p.scenes_count >= 3 ? 'key' : (p.scenes_count >= 2 ? 'recurring' : 'background'),
        priority: p.scenes_count >= 3 ? 'P0' : 'P1',
        description: '',
        explicitly_mentioned: true,
      }));
  }
  
  return {
    synopsis: obj.synopsis ?? { faithful_summary: '' },
    scenes,
    characters,
    locations,
    props,
    set_pieces: Array.isArray(obj.set_pieces) ? obj.set_pieces : [],
    subplots: Array.isArray(obj.subplots) ? obj.subplots : [],
    plot_twists: Array.isArray(obj.plot_twists) ? obj.plot_twists : [],
    continuity_anchors: Array.isArray(obj.continuity_anchors) ? obj.continuity_anchors : [],
    summary: obj.summary ?? {
      total_scenes: scenes.length,
      total_characters: characters.length,
      total_locations: locations.length,
      total_props: props.length,
      production_notes: '',
    },
  };
};

const tryParseJson = (raw: string) => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fallback: try to extract the first JSON object
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptBreakdownRequest = await req.json();
    const { scriptText, projectId, scriptId, language, format, episodesCount, episodeDurationMin } = request;

    if (!scriptText || scriptText.trim().length < 100) {
      return new Response(
        JSON.stringify({ error: 'Se requiere un guion con al menos 100 caracteres para analizar' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log warning for very long scripts that may hit timeout
    // Edge Functions have ~60s timeout, Claude needs ~1s per 500 chars
    const processedScriptText = scriptText.trim();
    const estimatedProcessingTimeSec = Math.ceil(processedScriptText.length / 500);
    const isLongScript = processedScriptText.length > 40000;
    
    if (isLongScript) {
      console.warn(`[script-breakdown] Long script detected: ${processedScriptText.length} chars, estimated ${estimatedProcessingTimeSec}s processing time`);
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY no está configurada');
    }

    const userPrompt = `
DESGLOSE DE PRODUCCIÓN SOLICITADO:

PROJECT ID: ${projectId}
IDIOMA DE RESPUESTA: ${language || 'es-ES'}
${isLongScript ? '\nNOTA: Este es un guion extenso. Analiza todo el contenido disponible de forma exhaustiva.\n' : ''}
GUION A DESGLOSAR:
---
${processedScriptText}
---

Realiza un desglose EXHAUSTIVO de este guion. Extrae TODAS las entidades de producción siguiendo el formato JSON especificado.

IMPORTANTE:
- Sé exhaustivo: no dejes ningún personaje, prop o localización sin detectar
- Mantén consistencia en los nombres (mismo personaje = mismo nombre exacto)
- Detecta variantes de localizaciones y agrúpalas
- Identifica riesgos de continuidad
- Asigna prioridades realistas
- Incluye notas de producción útiles`;

    console.log('Breaking down script, length:', processedScriptText.length, 'projectId:', projectId, 'isLongScript:', isLongScript);

    // Use Claude 3.5 Sonnet via direct Anthropic API for superior script understanding
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Claude 3.5 Haiku - fast and cost-effective
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
        // Use tool calling for structured JSON output
        tools: [{
          name: 'return_script_breakdown',
          description: 'Returns the structured script breakdown analysis',
          input_schema: BREAKDOWN_TOOL.function.parameters,
        }],
        tool_choice: { type: 'tool', name: 'return_script_breakdown' },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();

    // Anthropic returns tool use in content array with type: 'tool_use'
    let breakdownData: any | null = null;
    
    // Check for tool_use blocks in Anthropic response format
    const toolUseBlock = data.content?.find((block: any) => block.type === 'tool_use');
    if (toolUseBlock?.input) {
      breakdownData = toolUseBlock.input;
      console.log('Parsed breakdown from Anthropic tool_use block');
    }

    // Fallback: check for text content and try to parse JSON
    if (!breakdownData) {
      const textBlock = data.content?.find((block: any) => block.type === 'text');
      if (textBlock?.text) {
        breakdownData = tryParseJson(textBlock.text);
        console.log('Parsed breakdown from Anthropic text block');
      }
    }

    if (!breakdownData) {
      console.error('Could not parse breakdown from Anthropic response', {
        contentTypes: data.content?.map((b: any) => b.type),
        stopReason: data.stop_reason,
      });
      return new Response(
        JSON.stringify({ error: 'No se pudo interpretar la respuesta del modelo. Reintenta.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    breakdownData = normalizeBreakdown(breakdownData, processedScriptText);

    console.log('Script breakdown complete:', {
      scenes: breakdownData.scenes?.length || 0,
      characters: breakdownData.characters?.length || 0,
      locations: breakdownData.locations?.length || 0,
      props: breakdownData.props?.length || 0
    });

    // Save parsed_json directly to the script if scriptId is provided
    if (scriptId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        // Load project settings to respect episode count + duration
        const { data: projectRow, error: projectRowError } = await supabase
          .from('projects')
          .select('format, episodes_count, target_duration_min')
          .eq('id', projectId)
          .maybeSingle();

        if (projectRowError) {
          console.warn('Could not load project settings for breakdown:', projectRowError);
        }

        const safeInt = (v: unknown, fallback: number) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
        };

        const safeFloat = (v: unknown, fallback: number) => {
          const n = Number(v);
          return Number.isFinite(n) && n > 0 ? n : fallback;
        };

        const effectiveFormat = String(format ?? projectRow?.format ?? 'series');
        const desiredEpisodesCount = effectiveFormat === 'series'
          ? safeInt(episodesCount ?? projectRow?.episodes_count, 1)
          : 1;

        const desiredEpisodeDurationMin = safeInt(
          episodeDurationMin ?? projectRow?.target_duration_min,
          effectiveFormat === 'series' ? 45 : 100
        );

        const scenes = Array.isArray(breakdownData.scenes) ? breakdownData.scenes : [];
        const synopsisText = breakdownData.synopsis?.faithful_summary || '';

        const buildEpisodesFromScenes = (): any[] => {
          if (desiredEpisodesCount <= 1) {
            return [{
              episode_number: 1,
              title: effectiveFormat === 'film' ? 'Película' : 'Episodio 1',
              synopsis: synopsisText,
              scenes,
              duration_min: safeInt(breakdownData.summary?.estimated_runtime_min, desiredEpisodeDurationMin),
            }];
          }

          const defaultSceneSec = 60;
          const getSceneSec = (s: any) => safeFloat(s?.estimated_duration_sec, defaultSceneSec);

          const targetEpisodeSec = desiredEpisodeDurationMin * 60;
          const totalSec = scenes.reduce((acc: number, s: any) => acc + getSceneSec(s), 0);

          const groups: any[][] = [];
          if (totalSec > 0 && targetEpisodeSec > 0) {
            let bucket: any[] = [];
            let bucketSec = 0;

            for (const s of scenes) {
              bucket.push(s);
              bucketSec += getSceneSec(s);

              if (bucketSec >= targetEpisodeSec && groups.length < desiredEpisodesCount - 1) {
                groups.push(bucket);
                bucket = [];
                bucketSec = 0;
              }
            }
            groups.push(bucket);
          } else {
            const chunkSize = Math.max(1, Math.ceil(scenes.length / desiredEpisodesCount));
            for (let i = 0; i < scenes.length; i += chunkSize) {
              groups.push(scenes.slice(i, i + chunkSize));
            }
          }

          // Ensure exactly N episodes (pad or merge)
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

        // Build parsed_json structure for ScriptSummaryPanel
        const parsedJson = {
          title: breakdownData.synopsis?.faithful_summary?.slice(0, 50) || 'Guion Analizado',
          synopsis: synopsisText,
          episodes: parsedEpisodes,
          characters: breakdownData.characters || [],
          locations: breakdownData.locations || [],
          scenes,
          props: breakdownData.props || [],
          subplots: breakdownData.subplots || [],
          plot_twists: breakdownData.plot_twists || [],
          teasers: breakdownData.teasers,
          counts: {
            total_scenes: scenes.length || 0,
            total_dialogue_lines: 0,
          },
        };

        const { error: updateError } = await supabase
          .from('scripts')
          .update({ 
            parsed_json: parsedJson,
            status: 'analyzed'
          })
          .eq('id', scriptId);

        if (updateError) {
          console.error('Error saving parsed_json to script:', updateError);
        } else {
          console.log('Successfully saved parsed_json to script:', scriptId);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        breakdown: breakdownData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in script-breakdown:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
