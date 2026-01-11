import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface ExpandSceneRequest {
  projectId: string;
  sceneCard: SceneCard;
  language?: string;
  tone?: string;
  era?: string;
}

const EXPAND_SCENE_PROMPT = `Generate a scene in professional screenplay format from the SceneCard.

RULES:
- Use EXACTLY the slugline as provided.
- DO NOT add characters outside of characters_present.
- DO NOT add props outside of props_used.
- Action: 4-10 lines, visual, concrete, no summaries. Use present tense.
- Dialogue: minimum 8 lines total if there are speaking_characters. If no speaking_characters, dialogue = 0.
- Character names in ALL CAPS when they first appear in action, and for dialogue cues.
- Maintain the tone and era specified.
- No camera directions unless essential.
- No narrator voice.

OUTPUT:
Only the screenplay text of the scene (no comments, no explanations).

SCREENPLAY FORMAT:
INT./EXT. LOCATION - SUB-LOCATION - TIME

Action describing what we see. CHARACTER NAME enters. More visual action.

CHARACTER NAME
(parenthetical if needed)
Dialogue line.

ANOTHER CHARACTER
Response dialogue.

More action to close the scene.`;

// Model configuration
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const AI_GATEWAY_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const MODEL_MAP = {
  primary: { anthropic: 'claude-sonnet-4-20250514', gateway: 'openai/gpt-5' },
};

async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (ANTHROPIC_API_KEY) {
    try {
      console.log('[expand-scene-card] Calling Anthropic Claude Sonnet');
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_MAP.primary.anthropic,
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.content?.[0]?.text || '';
      }
      console.warn('[expand-scene-card] Anthropic failed, falling back to gateway');
    } catch (err) {
      console.warn('[expand-scene-card] Anthropic error:', err);
    }
  }
  
  if (!LOVABLE_API_KEY) {
    throw new Error('Neither ANTHROPIC_API_KEY nor LOVABLE_API_KEY configured');
  }
  
  console.log('[expand-scene-card] Calling Gateway GPT-4o');
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
      max_tokens: 4000,
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gateway error: ${response.status} - ${errText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Extract entities from generated screenplay for QA
function extractEntitiesFromScreenplay(text: string): {
  slugline: string;
  characters_detected: string[];
  dialogue_lines: number;
  action_lines: number;
} {
  const lines = text.split('\n').filter(l => l.trim());
  
  // Extract slugline
  const sluglineMatch = text.match(/^(INT\.|EXT\.).*$/m);
  const slugline = sluglineMatch ? sluglineMatch[0] : '';
  
  // Detect character names (ALL CAPS, 2-30 chars, not common words)
  const characterPattern = /^([A-Z][A-Z\s]{1,29})$/;
  const commonWords = new Set(['THE', 'AND', 'BUT', 'FOR', 'INT', 'EXT', 'DAY', 'NIGHT', 'CONTINUOUS', 'LATER', 'CONT', 'CUT', 'FADE', 'TO', 'FROM', 'ANGLE', 'ON', 'CLOSE', 'UP', 'POV']);
  
  const characters = new Set<string>();
  let dialogueLines = 0;
  let actionLines = 0;
  let inDialogue = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Check if it's a character cue (dialogue header)
    if (characterPattern.test(trimmed) && !commonWords.has(trimmed)) {
      characters.add(trimmed);
      inDialogue = true;
      continue;
    }
    
    // Count dialogue vs action
    if (inDialogue) {
      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        // Parenthetical, still in dialogue
        continue;
      } else if (trimmed && !trimmed.startsWith('INT.') && !trimmed.startsWith('EXT.')) {
        dialogueLines++;
        inDialogue = false;
      }
    } else {
      if (trimmed && !trimmed.startsWith('INT.') && !trimmed.startsWith('EXT.')) {
        actionLines++;
      }
    }
  }
  
  return {
    slugline,
    characters_detected: Array.from(characters),
    dialogue_lines: dialogueLines,
    action_lines: actionLines,
  };
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

    const { projectId, sceneCard, language = 'es', tone = 'realistic', era } = await req.json() as ExpandSceneRequest;

    if (!projectId || !sceneCard) {
      return new Response(JSON.stringify({ error: 'projectId and sceneCard are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch project style for tone/era
    const { data: project } = await supabase
      .from('projects')
      .select('title, style_config')
      .eq('id', projectId)
      .single();

    const projectEra = era || (project?.style_config as any)?.era || '';
    const projectTone = tone || (project?.style_config as any)?.tone || 'realistic';

    // Build user prompt
    const userPrompt = `
SceneCard:
${JSON.stringify(sceneCard, null, 2)}

Context:
- Project: ${project?.title || 'Untitled'}
- Tone: ${projectTone}
- Era: ${projectEra}
- Language: ${language === 'es' ? 'Spanish' : 'English'}

Generate the full screenplay scene following the format exactly.
`;

    console.log(`[expand-scene-card] Expanding scene ${sceneCard.scene}: ${sceneCard.slugline}`);
    const screenplay = await callAI(EXPAND_SCENE_PROMPT, userPrompt);
    
    // QA: Extract entities for validation
    const extracted = extractEntitiesFromScreenplay(screenplay);
    
    // QA checks
    const qaWarnings: string[] = [];
    
    // Check slugline matches
    if (!extracted.slugline.includes('INT.') && !extracted.slugline.includes('EXT.')) {
      qaWarnings.push('Missing proper slugline (INT./EXT.)');
    }
    
    // Check dialogue minimum
    if (sceneCard.speaking_characters.length > 0 && extracted.dialogue_lines < 4) {
      qaWarnings.push(`Low dialogue count: ${extracted.dialogue_lines} lines for ${sceneCard.speaking_characters.length} speaking characters`);
    }
    
    // Check action minimum
    if (extracted.action_lines < 2) {
      qaWarnings.push(`Low action: only ${extracted.action_lines} action lines`);
    }
    
    // Check for characters not in card
    const cardCharsUpper = sceneCard.characters_present.map(c => c.toUpperCase());
    const unexpectedChars = extracted.characters_detected.filter(c => !cardCharsUpper.includes(c));
    if (unexpectedChars.length > 0) {
      qaWarnings.push(`Unexpected characters detected: ${unexpectedChars.join(', ')}`);
    }

    console.log(`[expand-scene-card] Generated screenplay: ${extracted.action_lines} action, ${extracted.dialogue_lines} dialogue`);

    return new Response(JSON.stringify({
      success: true,
      screenplay,
      extracted,
      qa: {
        passed: qaWarnings.length === 0,
        warnings: qaWarnings,
      },
      scene_number: sceneCard.scene,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[expand-scene-card] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
