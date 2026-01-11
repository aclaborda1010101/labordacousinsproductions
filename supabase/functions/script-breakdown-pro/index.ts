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
// PRODUCTION BREAKDOWN ANALYST PROMPT (v2 - Improved scene counting)
// ═══════════════════════════════════════════════════════════════════════════════
const PRODUCTION_ANALYST_PROMPT = `You are a SCRIPT BREAKDOWN ANALYST. Extract production data from screenplays.

═══════════════════════════════════════════════════════════════════════════════
SCENE COUNTING RULES (CRITICAL - READ CAREFULLY)
═══════════════════════════════════════════════════════════════════════════════

Each line starting with "INT." or "EXT." = ONE SCENE. No exceptions.

RULE 1: Same location + different time = DIFFERENT scenes
  - "INT. COBERTIZO – NOCHE" = scene A
  - "INT. COBERTIZO – DÍA" = scene B (DIFFERENT)

RULE 2: Same location + INT vs EXT = DIFFERENT scenes
  - "INT. CASA – NOCHE" = scene A
  - "EXT. CASA – NOCHE" = scene B (DIFFERENT)

RULE 3: Do NOT merge, group, or summarize scenes. Count ALL individually.

RULE 4: If you find N scene headings, counts.scenes MUST equal N.

═══════════════════════════════════════════════════════════════════════════════
EXTRACTION TASKS
═══════════════════════════════════════════════════════════════════════════════

1. METADATA (from text before first INT./EXT.):
   - title: Bold/caps text at start
   - writers: Names after "Guión de", "Written by", "Screenplay by"
   - draft: Version info if present
   - date: Date if present

2. SCENES:
   - List EVERY scene heading found (copy exactly as written)
   - Count total

3. CHARACTERS:
   - Name in CAPS before dialogue = character
   - Classify: protagonist (drives story), co_protagonist, secondary, minor, background

4. LOCATIONS:
   - Extract unique locations from scene headings
   - Include INT/EXT and time (DÍA/NOCHE/DAY/NIGHT) variants

5. KEY PROPS:
   - Objects critical to plot
   - Objects that appear in multiple scenes
   - Iconic/symbolic objects
   Mark importance: critical | high | medium

6. SETPIECES:
   - Action sequences
   - Chase scenes
   - Confrontations
   - Musical moments
   - Emotional peaks

7. PRODUCTION FLAGS:
   - Stunts: cars, crashes, falls, fights
   - Safety: fire, weapons, water, heights
   - Complexity: VFX, crowds, animals, children, night shoots

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (JSON ONLY - NO OTHER TEXT)
═══════════════════════════════════════════════════════════════════════════════

{
  "source": {
    "type": "screenplay|outline|treatment|unknown",
    "confidence": "high|medium|low",
    "reason": "why this classification"
  },
  "metadata": {
    "title": "",
    "writers": [],
    "draft": "",
    "date": ""
  },
  "counts": {
    "scenes": 0,
    "locations": 0,
    "characters": 0
  },
  "scene_list": [
    {"number": 1, "heading": "INT. LOCATION – TIME", "location": "", "int_ext": "INT", "time": ""},
    {"number": 2, "heading": "EXT. LOCATION – TIME", "location": "", "int_ext": "EXT", "time": ""}
  ],
  "characters": {
    "protagonists": [{"name": "", "reason": "", "scenes_count": 0}],
    "co_protagonists": [{"name": "", "reason": "", "scenes_count": 0}],
    "secondary": [{"name": "", "role_detail": "", "scenes_count": 0}],
    "minor": [{"name": "", "scenes_count": 0}],
    "background_count": 0
  },
  "locations": [
    {"name": "", "int_ext": "INT|EXT|BOTH", "scenes": [], "time_variants": []}
  ],
  "props": [
    {"name": "",
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
VALIDATION CHECK (DO THIS BEFORE RESPONDING)
═══════════════════════════════════════════════════════════════════════════════

Before outputting JSON:
1. Count how many "INT." and "EXT." lines you found
2. Verify counts.scenes matches that count
3. Verify scene_list has that many entries
4. If counts.scenes = 0 but text has INT./EXT., you made an error

CRITICAL RULES:
- counts.scenes MUST equal scene_list.length
- Do NOT return scenes: 0 if the script has INT./EXT. headings
- Do NOT invent scenes, characters, props, or locations
- Be exhaustive: extract ALL characters and ALL scene headings
- If you found 6 scene headings, total must be 6, not 2 or 0

Output ONLY the JSON. No explanations, no markdown, no comments.`;

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

    // ══════════════════════════════════════════════════════════════════════
    // PRE-COUNT SCENE HEADINGS (for debugging and prompt anchoring)
    // ══════════════════════════════════════════════════════════════════════
    const intMatches = scriptText.match(/\bINT[\./]/gi) || [];
    const extMatches = scriptText.match(/\bEXT[\./]/gi) || [];
    const intExtMatches = scriptText.match(/\b(INT\/EXT|I\/E)[\./]?/gi) || [];
    const headingCount = intMatches.length + extMatches.length + intExtMatches.length;
    
    console.log(`[breakdown-pro] PRE-COUNT HEADINGS: INT=${intMatches.length}, EXT=${extMatches.length}, INT/EXT=${intExtMatches.length}, TOTAL=${headingCount}`);
    
    // Extract actual heading lines for reference
    const headingLines: string[] = [];
    const lines = scriptText.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^(INT[\./]|EXT[\./]|INT\/EXT[\./]?|I\/E[\./]?)/i.test(trimmed)) {
        headingLines.push(trimmed);
      }
    }
    console.log(`[breakdown-pro] Extracted ${headingLines.length} scene heading lines`);
    if (headingLines.length > 0) {
      console.log(`[breakdown-pro] First 5 headings:`, headingLines.slice(0, 5));
    }

    // Use Lovable AI Gateway for professional analysis
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const userPrompt = `Analyze this screenplay/script and provide a COMPLETE production breakdown.

LANGUAGE: Respond in ${language === 'es' ? 'Spanish' : 'English'} for synopsis and descriptions.

CRITICAL: I have pre-scanned this script and found EXACTLY ${headingLines.length} scene headings (INT./EXT. lines).
Your scene_list MUST contain exactly ${headingLines.length} entries.
If you return fewer or more, your analysis is WRONG.

HERE ARE THE FIRST 10 HEADINGS I FOUND (for verification):
${headingLines.slice(0, 10).map((h, i) => `${i + 1}. ${h}`).join('\n')}

SCRIPT TEXT:
---
${scriptText.slice(0, 100000)}
---

Remember:
1. COUNT EVERY scene heading (INT./EXT.) individually - there are ${headingLines.length} of them
2. EACH unique heading is ONE scene, even if the location repeats with different time of day
3. "INT. COBERTIZO - NOCHE" and "INT. COBERTIZO - DÍA" are TWO separate scenes
4. Extract ALL characters, classify by narrative weight
5. List ALL unique locations
6. Identify key props and setpieces
7. Assess production complexity and safety requirements

Return ONLY the JSON breakdown. counts.scenes MUST equal ${headingLines.length}.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-5',
        messages: [
          { role: 'system', content: PRODUCTION_ANALYST_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        tools: [BREAKDOWN_TOOL],
        tool_choice: { type: 'function', function: { name: 'return_production_breakdown' } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[breakdown-pro] Lovable AI error:', response.status, errorText);
      
      // Handle rate limits and payment errors
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add credits to your Lovable workspace.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`Lovable AI error: ${response.status}`);
    }

    const aiResponse = await response.json();
    
    // Extract from tool call or content
    let parsed: any = null;
    const toolCall = aiResponse.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      parsed = tryParseJson(toolCall.function.arguments);
    }
    
    if (!parsed) {
      const rawContent = aiResponse.choices?.[0]?.message?.content || '';
      console.log(`[breakdown-pro] AI response length: ${rawContent.length}`);
      parsed = tryParseJson(rawContent);
    }
    
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
