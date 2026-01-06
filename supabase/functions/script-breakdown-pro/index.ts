import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BreakdownProRequest {
  scriptText: string;
  projectId: string;
  scriptId?: string;
  language?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTION BREAKDOWN ANALYST PROMPT
// ═══════════════════════════════════════════════════════════════════════════════
const PRODUCTION_ANALYST_PROMPT = `You are a PROFESSIONAL SCRIPT BREAKDOWN ANALYST (film/TV production).

═══════════════════════════════════════════════════════════════════════════════
TASK: Script breakdown. Count scenes and extract data.
═══════════════════════════════════════════════════════════════════════════════

STEP 1 - COUNT SCENES (CRITICAL - DO THIS FIRST):
Search for EVERY line starting with "INT." or "EXT." (including "INT/EXT", "I/E").
Each one = 1 scene. You MUST list them all.

Example from a typical script:
- "INT. CASA DEL DIRECTOR – NOCHE" = scene 1
- "EXT. CASA DEL DIRECTOR – NOCHE" = scene 2  
- "INT. COBERTIZO – NOCHE" = scene 3
- etc.

Count ALL of them. Do NOT return 0 or a low number if there are more headings.
scenes.total MUST match the exact number of INT./EXT. lines found.

STEP 2 - EXTRACT METADATA:
From the beginning of the script (before first INT./EXT.):
- Title (look for title page)
- Writers/Authors
- Draft version
- Date

STEP 3 - EXTRACT CHARACTERS:
Every name in UPPERCASE before dialogue = character.
Example: "MIGUEL" and "EL DIRECTOR" are characters.
Classify them by narrative weight:
- PROTAGONIST: Drives the main story, has a full character arc, appears in most scenes
- CO_PROTAGONIST: Has significant independent arc, shares narrative weight
- SECONDARY: Recurring character that affects plot (5+ scenes)
- MINOR: Appears in 2-4 scenes with some dialogue
- BACKGROUND: Extras, crowd, non-speaking

STEP 4 - EXTRACT LOCATIONS:
From scene headings. Example: "CASA DEL DIRECTOR", "COBERTIZO", "CALLE"
List each unique location with its INT/EXT variants.

STEP 5 - EXTRACT KEY PROPS:
Objects important to plot: weapons, documents, vehicles, devices, etc.
Mark importance as: critical (plot-essential) | high (recurring) | medium (notable)

STEP 6 - IDENTIFY SETPIECES:
Standout sequences: action, chase, musical, confrontation, emotional climax, montage

STEP 7 - PRODUCTION SIGNALS:
- Dialogue density: low (under 40%) | medium (40-60%) | high (over 60%)
- Cast size: small (<10) | medium (10-25) | large (>25)
- Complexity: low | medium | high
- Safety flags: cars, weapons, fire, water, heights, pyro, animals, children

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STRICT JSON):
═══════════════════════════════════════════════════════════════════════════════
Return ONLY valid JSON with this exact structure:

{
  "source": {
    "type": "screenplay|outline|treatment|unknown",
    "confidence": "high|medium|low",
    "reason": "why this classification"
  },
  "metadata": {
    "title": "string or null",
    "writers": ["array of writer names"],
    "draft": "string or null",
    "date": "string or null"
  },
  "counts": {
    "scenes": number,
    "locations": number,
    "characters": number
  },
  "scene_list": ["INT. LOCATION - TIME", "EXT. LOCATION - TIME", ...],
  "characters": {
    "protagonists": [
      {"name": "string", "reason": "1-sentence justification", "scenes_count": number}
    ],
    "co_protagonists": [
      {"name": "string", "reason": "string", "scenes_count": number}
    ],
    "secondary": [
      {"name": "string", "role_detail": "string", "scenes_count": number}
    ],
    "minor": [
      {"name": "string", "scenes_count": number}
    ],
    "background_count": number
  },
  "locations": [
    {
      "name": "string (location name from heading)",
      "int_ext": "INT|EXT|INT/EXT",
      "scenes": [1, 2, 5],
      "time_variants": ["DAY", "NIGHT"]
    }
  ],
  "props": [
    {
      "name": "string",
      "importance": "critical|high|medium",
      "scenes_used": [1, 3, 7],
      "narrative_function": "string"
    }
  ],
  "setpieces": [
    {
      "name": "string (descriptive title)",
      "type": "action|chase|musical|confrontation|emotional|montage|spectacle",
      "scenes": [5, 6],
      "description": "string"
    }
  ],
  "production": {
    "dialogue_density": "low|medium|high",
    "cast_size": "small|medium|large",
    "complexity": "low|medium|high",
    "safety_flags": ["cars", "weapons", "fire"],
    "estimated_runtime_min": number,
    "shooting_days_estimate": "string (e.g., '15-20 days')",
    "notes": "string (any production-relevant observations)"
  },
  "synopsis": {
    "logline": "string (1-2 sentences)",
    "summary": "string (3-5 sentences faithful to text)"
  }
}

═══════════════════════════════════════════════════════════════════════════════
CRITICAL RULES:
═══════════════════════════════════════════════════════════════════════════════
1. counts.scenes MUST equal scene_list.length
2. Do NOT return scenes: 0 if the script has INT./EXT. headings
3. Do NOT invent scenes, characters, props, or locations
4. Be exhaustive: extract ALL characters and ALL scene headings
5. If you found 11 scene headings, total must be 11, not 2 or 0`;

const BREAKDOWN_TOOL = {
  type: 'function' as const,
  function: {
    name: 'return_production_breakdown',
    description: 'Returns the structured production breakdown analysis',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['screenplay', 'outline', 'treatment', 'unknown'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: { type: 'string' }
          },
          required: ['type', 'confidence']
        },
        counts: {
          type: 'object',
          properties: {
            scenes: { type: 'number' },
            locations: { type: 'number' },
            characters: { type: 'number' }
          },
          required: ['scenes', 'locations', 'characters']
        },
        characters: {
          type: 'object',
          properties: {
            protagonists: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  reason: { type: 'string' },
                  scenes_count: { type: 'number' }
                }
              }
            },
            co_protagonists: { type: 'array', items: { type: 'object' } },
            secondary: { type: 'array', items: { type: 'object' } },
            minor: { type: 'array', items: { type: 'object' } },
            background_count: { type: 'number' }
          }
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              int_ext: { type: 'string' },
              scenes: { type: 'array', items: { type: 'number' } },
              time_variants: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        props: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              importance: { type: 'string' },
              scenes_used: { type: 'array', items: { type: 'number' } },
              narrative_function: { type: 'string' }
            }
          }
        },
        setpieces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              scenes: { type: 'array', items: { type: 'number' } },
              description: { type: 'string' }
            }
          }
        },
        production: {
          type: 'object',
          properties: {
            dialogue_density: { type: 'string' },
            cast_size: { type: 'string' },
            complexity: { type: 'string' },
            safety_flags: { type: 'array', items: { type: 'string' } },
            estimated_runtime_min: { type: 'number' },
            shooting_days_estimate: { type: 'string' },
            notes: { type: 'string' }
          }
        },
        synopsis: {
          type: 'object',
          properties: {
            logline: { type: 'string' },
            summary: { type: 'string' }
          }
        }
      },
      required: ['source', 'counts', 'characters', 'locations', 'production']
    }
  }
};

// Regex for scene headings
const SLUGLINE_RE = /^(INT\.?|EXT\.?|INT\/EXT\.?|I\/E\.?|INTERIOR|EXTERIOR)\s*[.:\-–—]?\s*(.+?)(?:\s*[.:\-–—]\s*(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER))?$/i;

function extractScenesFromScript(text: string): any[] {
  const lines = text.split('\n');
  const scenes: any[] = [];
  let sceneNumber = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const match = SLUGLINE_RE.exec(trimmed);
    if (match) {
      sceneNumber++;
      scenes.push({
        scene_number: sceneNumber,
        slugline: trimmed,
        location_name: match[2]?.trim() || 'UNKNOWN',
        int_ext: match[1].toUpperCase().replace('.', ''),
        time_of_day: match[3]?.toUpperCase() || 'NOT_SPECIFIED',
      });
    }
  }
  return scenes;
}

function normalizeBreakdown(data: any, scriptText: string): any {
  const out = (data && typeof data === 'object') ? { ...data } : {};
  
  // Ensure arrays exist
  const asArray = (v: any) => Array.isArray(v) ? v : [];
  
  // Get regex-extracted scenes as fallback
  const regexScenes = extractScenesFromScript(scriptText);
  
  // If AI returned 0 or very few scenes but regex found many, use regex count
  const aiSceneCount = out.counts?.scenes || 0;
  if (aiSceneCount < 5 && regexScenes.length >= 10) {
    console.log(`[breakdown-pro] AI returned ${aiSceneCount} scenes, regex found ${regexScenes.length}. Using regex count.`);
    out.counts = {
      ...out.counts,
      scenes: regexScenes.length,
    };
    
    // Also build locations from regex if AI didn't provide enough
    if (asArray(out.locations).length < 3) {
      const locMap = new Map<string, { name: string; int_ext: string; scenes: number[]; time_variants: Set<string> }>();
      for (const scene of regexScenes) {
        const key = scene.location_name.toLowerCase();
        if (!locMap.has(key)) {
          locMap.set(key, {
            name: scene.location_name,
            int_ext: scene.int_ext,
            scenes: [],
            time_variants: new Set(),
          });
        }
        const loc = locMap.get(key)!;
        loc.scenes.push(scene.scene_number);
        if (scene.time_of_day !== 'NOT_SPECIFIED') {
          loc.time_variants.add(scene.time_of_day);
        }
      }
      out.locations = Array.from(locMap.values()).map(l => ({
        ...l,
        time_variants: Array.from(l.time_variants),
      }));
      out.counts = { ...out.counts, locations: out.locations.length };
    }
  }
  
  // Ensure characters structure
  if (!out.characters || typeof out.characters !== 'object') {
    out.characters = {
      protagonists: [],
      co_protagonists: [],
      secondary: [],
      minor: [],
      background_count: 0,
    };
  }
  
  // Ensure all character arrays exist
  out.characters.protagonists = asArray(out.characters.protagonists);
  out.characters.co_protagonists = asArray(out.characters.co_protagonists);
  out.characters.secondary = asArray(out.characters.secondary);
  out.characters.minor = asArray(out.characters.minor);
  out.characters.background_count = out.characters.background_count || 0;
  
  // Calculate total characters
  const totalChars = 
    out.characters.protagonists.length +
    out.characters.co_protagonists.length +
    out.characters.secondary.length +
    out.characters.minor.length +
    out.characters.background_count;
  
  out.counts = {
    ...out.counts,
    characters: totalChars,
  };
  
  // Ensure other arrays
  out.locations = asArray(out.locations);
  out.props = asArray(out.props);
  out.setpieces = asArray(out.setpieces);
  
  // Ensure production object
  if (!out.production || typeof out.production !== 'object') {
    out.production = {};
  }
  out.production.safety_flags = asArray(out.production.safety_flags);
  
  // Ensure synopsis
  if (!out.synopsis || typeof out.synopsis !== 'object') {
    out.synopsis = { logline: '', summary: '' };
  }
  
  return out;
}

function tryParseJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // continue
      }
    }
    
    // Try to find JSON object in text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // continue
      }
    }
    
    return null;
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: BreakdownProRequest = await req.json();
    const { scriptText, projectId, scriptId, language = 'es' } = body;

    if (!scriptText || scriptText.length < 200) {
      return new Response(JSON.stringify({ error: 'Script text too short (min 200 chars)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[breakdown-pro] Starting analysis for project ${projectId}, script length: ${scriptText.length}`);

    // Use Claude for professional analysis
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const userPrompt = `Analyze this screenplay/script and provide a COMPLETE production breakdown.

LANGUAGE: Respond in ${language === 'es' ? 'Spanish' : 'English'} for synopsis and descriptions.

SCRIPT TEXT:
---
${scriptText.slice(0, 100000)}
---

Remember:
1. Count EVERY scene heading (INT./EXT.) individually
2. Extract ALL characters, classify by narrative weight
3. List ALL unique locations
4. Identify key props and setpieces
5. Assess production complexity and safety requirements

Return ONLY the JSON breakdown.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 8000,
        messages: [
          { role: 'user', content: PRODUCTION_ANALYST_PROMPT + '\n\n' + userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[breakdown-pro] Anthropic API error:', response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const rawContent = aiResponse.content?.[0]?.text || '';
    
    console.log(`[breakdown-pro] AI response length: ${rawContent.length}`);
    
    let parsed = tryParseJson(rawContent);
    if (!parsed) {
      console.error('[breakdown-pro] Failed to parse AI response as JSON');
      // Use regex fallback
      const regexScenes = extractScenesFromScript(scriptText);
      parsed = {
        source: { type: 'screenplay', confidence: 'low', reason: 'Fallback to regex extraction' },
        counts: { scenes: regexScenes.length, locations: 0, characters: 0 },
        characters: { protagonists: [], co_protagonists: [], secondary: [], minor: [], background_count: 0 },
        locations: [],
        props: [],
        setpieces: [],
        production: { dialogue_density: 'medium', cast_size: 'medium', complexity: 'medium', safety_flags: [] },
        synopsis: { logline: '', summary: '' },
        _fallback: true,
      };
    }

    // Normalize and validate
    const breakdown = normalizeBreakdown(parsed, scriptText);
    breakdown._analyzed_at = new Date().toISOString();
    breakdown._script_length = scriptText.length;

    // Save to script if scriptId provided
    if (scriptId) {
      const { data: existingScript, error: fetchError } = await supabase
        .from('scripts')
        .select('id, project_id, parsed_json')
        .eq('id', scriptId)
        .maybeSingle();

      if (fetchError) {
        console.error('[breakdown-pro] Error loading existing script:', fetchError);
      } else if (!existingScript) {
        console.warn('[breakdown-pro] Script not found, cannot persist breakdown:', scriptId);
      } else if (existingScript.project_id !== projectId) {
        console.warn('[breakdown-pro] Project mismatch, refusing to persist breakdown', {
          scriptId,
          expectedProjectId: projectId,
          actualProjectId: existingScript.project_id,
        });
      } else {
        const existingParsed =
          existingScript.parsed_json && typeof existingScript.parsed_json === 'object'
            ? (existingScript.parsed_json as Record<string, unknown>)
            : {};

        const mergedParsed = {
          ...existingParsed,
          breakdown_pro: breakdown,
          // Keep a canonical copy of screenplay-derived counts for the Master Script dashboard
          counts: {
            ...(((existingParsed as any).counts && typeof (existingParsed as any).counts === 'object') ? (existingParsed as any).counts : {}),
            total_scenes: typeof breakdown?.counts?.scenes === 'number' ? breakdown.counts.scenes : (existingParsed as any)?.counts?.total_scenes,
            locations: typeof breakdown?.counts?.locations === 'number' ? breakdown.counts.locations : (existingParsed as any)?.counts?.locations,
            setpieces: Array.isArray(breakdown?.setpieces) ? breakdown.setpieces.length : (existingParsed as any)?.counts?.setpieces,
          },
        };

        const { error: updateError } = await supabase
          .from('scripts')
          .update({ parsed_json: mergedParsed })
          .eq('id', scriptId);

        if (updateError) {
          console.error('[breakdown-pro] Error saving to script:', updateError);
        } else {
          console.log('[breakdown-pro] Saved breakdown to script', scriptId);
        }
      }
    }

    console.log(`[breakdown-pro] Complete. Scenes: ${breakdown.counts?.scenes}, Locations: ${breakdown.counts?.locations}, Characters: ${breakdown.counts?.characters}`);

    return new Response(JSON.stringify({ 
      success: true, 
      breakdown,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[breakdown-pro] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
