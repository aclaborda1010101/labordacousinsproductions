import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SceneCardsRequest {
  projectId: string;
  logline?: string;
  synopsis?: string;
  outline?: string;
  scenesCount?: number;
  language?: string;
}

interface SceneCard {
  scene: number;
  slugline: string;
  characters_present: string[];
  speaking_characters: string[];
  props_used: string[];
  beat_goal: string;
  conflicts: string[];
  continuity_notes: string[];
}

interface SceneCardsResponse {
  scenes: SceneCard[];
  new_suggestions: {
    characters: string[];
    locations: string[];
    props: string[];
  };
}

const SCENE_CARDS_PROMPT = `You are a technical screenplay assistant. Convert the outline into a list of Scene Cards.

RULES:
- Return ONLY valid JSON: {"scenes":[...], "new_suggestions":{...}} with no extra text.
- Each scene MUST have a complete slugline: INT./EXT. + MASTER LOCATION + SUB-LOCATION + TIME OF DAY.
- DO NOT invent characters outside of canonicalCharacters. If a new character is needed, add it to "new_suggestions.characters".
- DO NOT invent locations outside of canonicalLocations. If a new location is needed, add it to "new_suggestions.locations".
- Props: use only canonicalProps. If a new prop is needed, add it to "new_suggestions.props".
- speaking_characters must be a subset of characters_present.
- Maintain continuity notes from the story context.
- beat_goal should be 1 sentence describing the scene's narrative purpose.
- conflicts should list 1-3 tensions or obstacles in the scene.

OUTPUT JSON SCHEMA:
{
  "scenes": [
    {
      "scene": 1,
      "slugline": "INT. LOCATION - SUB-LOCATION - TIME",
      "characters_present": ["CHARACTER_NAME"],
      "speaking_characters": ["CHARACTER_NAME"],
      "props_used": ["prop_name"],
      "beat_goal": "One sentence describing the scene's purpose",
      "conflicts": ["tension or obstacle"],
      "continuity_notes": ["relevant continuity detail"]
    }
  ],
  "new_suggestions": {
    "characters": [],
    "locations": [],
    "props": []
  }
}`;

// Model configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const MODEL_MAP = {
  primary: { anthropic: 'claude-sonnet-4-20250514', gateway: 'openai/gpt-5' },
};

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  // Try Anthropic first
  if (ANTHROPIC_API_KEY) {
    try {
      console.log('[generate-scene-cards] Calling Anthropic Claude Sonnet');
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_MAP.primary.anthropic,
          max_tokens: 16000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.content?.[0]?.text || '';
      }
      console.warn('[generate-scene-cards] Anthropic failed, falling back to gateway');
    } catch (err) {
      console.warn('[generate-scene-cards] Anthropic error:', err);
    }
  }
  
  // Fallback to Lovable Gateway (GPT-4o)
  if (!LOVABLE_API_KEY) {
    throw new Error('Neither ANTHROPIC_API_KEY nor LOVABLE_API_KEY configured');
  }
  
  console.log('[generate-scene-cards] Calling Gateway GPT-4o');
  const response = await fetch(AI_GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_MAP.primary.gateway,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 16000,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gateway error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJsonSafe(text: string): SceneCardsResponse | null {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {}
  
  // Try extracting from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }
  
  // Try finding JSON object
  const jsonMatch = text.match(/\{[\s\S]*"scenes"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {}
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { projectId, logline, synopsis, outline, scenesCount = 28, language = 'es' } = await req.json() as SceneCardsRequest;

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch canonical entities from Bible
    console.log('[generate-scene-cards] Fetching canon from Bible...');
    
    const [charactersRes, locationsRes, propsRes, projectRes] = await Promise.all([
      supabase.from('characters').select('name, role, bio').eq('project_id', projectId),
      supabase.from('locations').select('name, description').eq('project_id', projectId),
      supabase.from('props').select('name, description').eq('project_id', projectId),
      supabase.from('projects').select('title, logline, synopsis, style_config').eq('id', projectId).single(),
    ]);

    const canonicalCharacters = (charactersRes.data || []).map(c => c.name);
    const canonicalLocations = (locationsRes.data || []).map(l => l.name);
    const canonicalProps = (propsRes.data || []).map(p => p.name);
    const project = projectRes.data;

    const effectiveLogline = logline || project?.logline || '';
    const effectiveSynopsis = synopsis || project?.synopsis || '';

    // Build user prompt
    const userPrompt = `
INPUT:
- Project Title: ${project?.title || 'Untitled'}
- Logline: ${effectiveLogline}
- Synopsis: ${effectiveSynopsis}
- Outline/Structure: ${outline || 'Not provided - generate based on logline and synopsis'}
- canonicalCharacters: ${JSON.stringify(canonicalCharacters)}
- canonicalLocations: ${JSON.stringify(canonicalLocations)}
- canonicalProps: ${JSON.stringify(canonicalProps)}
- Scenes to generate: ${scenesCount}
- Language for beat_goal and conflicts: ${language === 'es' ? 'Spanish' : 'English'}

Generate ${scenesCount} Scene Cards following the schema exactly.
`;

    console.log(`[generate-scene-cards] Generating ${scenesCount} scene cards...`);
    const rawResponse = await callAI(SCENE_CARDS_PROMPT, userPrompt);
    
    const parsed = parseJsonSafe(rawResponse);
    if (!parsed) {
      console.error('[generate-scene-cards] Failed to parse AI response');
      return new Response(JSON.stringify({ 
        error: 'Failed to parse AI response',
        raw: rawResponse.substring(0, 500),
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate and normalize
    const scenes = (parsed.scenes || []).map((s, idx) => ({
      scene: s.scene || idx + 1,
      slugline: s.slugline || `INT. SCENE ${idx + 1} - DAY`,
      characters_present: Array.isArray(s.characters_present) ? s.characters_present : [],
      speaking_characters: Array.isArray(s.speaking_characters) ? s.speaking_characters : [],
      props_used: Array.isArray(s.props_used) ? s.props_used : [],
      beat_goal: s.beat_goal || '',
      conflicts: Array.isArray(s.conflicts) ? s.conflicts : [],
      continuity_notes: Array.isArray(s.continuity_notes) ? s.continuity_notes : [],
    }));

    const result: SceneCardsResponse = {
      scenes,
      new_suggestions: {
        characters: parsed.new_suggestions?.characters || [],
        locations: parsed.new_suggestions?.locations || [],
        props: parsed.new_suggestions?.props || [],
      },
    };

    console.log(`[generate-scene-cards] Generated ${scenes.length} scene cards`);

    return new Response(JSON.stringify({
      success: true,
      data: result,
      stats: {
        total_scenes: scenes.length,
        new_characters_suggested: result.new_suggestions.characters.length,
        new_locations_suggested: result.new_suggestions.locations.length,
        new_props_suggested: result.new_suggestions.props.length,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-scene-cards] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
