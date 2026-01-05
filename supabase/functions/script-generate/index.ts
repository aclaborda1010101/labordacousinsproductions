import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// HOLLYWOOD SCREENWRITER v3.0 - SYMMETRIC MODE (Streaming Edition)
// V3.0: Output schema MUST match parse-script for bidirectional compatibility
// =============================================================================
const SCREENWRITER_PROMPT = `You are a Professional Screenwriter.

Your job is to generate screenplay scenes that EXACTLY MATCH the parse-script schema for symmetric data flow.

---

WRITING STYLE (Hollywood Standard):
- VISUAL: Write what we SEE and HEAR, not what characters think
- ECONOMICAL: Short action lines (max 3-4 lines per paragraph)
- RHYTHMIC: Vary sentence length for pacing
- CINEMATIC: Think in shots, not stage directions

---

STRICT FORMATTING RULES:

1. SLUGLINES (Scene Headings):
   - Format: INT./EXT. LOCATION - TIME
   - Include visual style markers when relevant: (BLACK-AND-WHITE), (SEPIA), (FLASHBACK)
   - Examples: "INT. KITCHEN - NIGHT", "EXT. ROOFTOP - DAWN (B&W)"

2. ACTION LINES (The Eye):
   - Write in PRESENT TENSE
   - CAPITALIZE: SOUNDS (BANG, FOOTSTEPS), KEY PROPS (POISONED APPLE), NEW CHARACTERS on first appearance
   - Keep paragraphs SHORT - speed kills
   - NEVER write feelings ("He feels sad") - write behavior ("He stares at the floor, hands trembling")

3. DIALOGUE (The Ear):
   - Character names centered, ALL CAPS
   - Use parentheticals sparingly: (O.S.) Off-Screen, (V.O.) Voice Over, (CONT'D) Continuing
   - Characters must sound DISTINCT - give each a unique voice
   - Avoid "on the nose" dialogue - use subtext, deflection, lies

4. CAMERA DIRECTION (Subtle):
   - Use sparingly: INSERT CUT:, CLOSE ON:, ANGLE ON:
   - Let action imply the shot when possible
   - Save explicit directions for critical moments

5. SOUND DESIGN:
   - CAPITALIZE key sounds: "The door SLAMS", "THUNDER rumbles"
   - Include ambient sounds that establish mood: "Rain PATTERS on glass"

---

V3.0 SYMMETRY RULES (CRITICAL):

1. Use standard screenplay formatting so the script can be parsed back into the same schema.

2. Populate technical_metadata ONLY if obvious from the scene:
   - _status = "EMPTY" → nothing technical implied
   - _status = "PARTIAL" → inferred from context (e.g., NIGHT = dim lighting)
   - _status = "EXPLICIT" → clearly stated (e.g., "CLOSE ON:", "B&W")

3. Leave technical fields null if uncertain. DO NOT invent camera/lighting.

4. NEVER contradict existing Canon P0 or P1 traits provided in context.

5. ALWAYS echo existing hard_traits verbatim for characters, even if not mentioned in the beat.

6. If a script is parsed then generated (or vice versa), the internal JSON representation must be indistinguishable.

---

CONTENT RULES:
- Show don't tell: Visual action, not exposition
- Every scene needs CONFLICT (internal or external)
- Subtext in dialogue - characters rarely say exactly what they mean
- Avoid clichés, tropes, and generic "AI voice"

WHAT TO AVOID:
- Flowery descriptions ("The beautiful sunset painted the sky...")
- Expository dialogue ("As you know, we've been friends for 20 years...")
- Telling emotions ("She felt a wave of sadness wash over her...")
- Purple prose - keep it tight and visual
- Generic characters without distinct voices

OUTPUT: Write ONLY the screenplay text in industry format. No JSON, no commentary, no markdown. Just pure screenplay.`;

interface ScriptGenerateRequest {
  idea: string;
  genre?: string;
  tone?: string;
  references?: string[];
  format?: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  language?: string;
  stream?: boolean;
  scenePrompt?: string;
  bibleContext?: {
    tone?: string;
    period?: string;
    visualStyle?: string;
  };
  canonCharacters?: Array<{
    name: string;
    visualTrigger?: string;
    fixedTraits?: string[];
  }>;
  canonLocations?: Array<{
    name: string;
    visualTrigger?: string;
    fixedElements?: string[];
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: ScriptGenerateRequest = await req.json();
    const { 
      idea, 
      genre, 
      tone, 
      references, 
      format = 'film', 
      episodesCount, 
      episodeDurationMin, 
      language = 'es',
      stream = true, // Default to streaming
      scenePrompt,
      bibleContext,
      canonCharacters,
      canonLocations
    } = request;

    if (!idea && !scenePrompt) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una idea o prompt de escena para generar el guion' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use Claude 3.5 Sonnet via Anthropic API for superior creative writing
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build context from Bible and Canon if provided
    let contextBlock = '';
    if (bibleContext) {
      contextBlock += `\nPROJECT BIBLE:
- Tone: ${bibleContext.tone || 'Cinematic'}
- Period: ${bibleContext.period || 'Contemporary'}
- Visual Style: ${bibleContext.visualStyle || 'Naturalistic'}`;
    }
    
    if (canonCharacters?.length) {
      contextBlock += `\n\nCANON CHARACTERS (use these exact descriptions):`;
      canonCharacters.forEach(char => {
        contextBlock += `\n- ${char.name}: ${char.visualTrigger || ''} ${char.fixedTraits?.join(', ') || ''}`;
      });
    }
    
    if (canonLocations?.length) {
      contextBlock += `\n\nCANON LOCATIONS (use these exact settings):`;
      canonLocations.forEach(loc => {
        contextBlock += `\n- ${loc.name}: ${loc.visualTrigger || ''} ${loc.fixedElements?.join(', ') || ''}`;
      });
    }

    // Build user prompt
    let userPrompt: string;
    
    if (scenePrompt) {
      userPrompt = `Write a single scene based on this prompt:

${scenePrompt}
${contextBlock}

Output ONLY the formatted screenplay scene. No JSON, no commentary.`;
    } else {
      userPrompt = `
SCRIPT REQUEST:

IDEA: ${idea}

GENRE: ${genre || 'Drama'}
TONE: ${tone || 'Cinematic realism'}
FORMAT: ${format === 'series' ? `Series of ${episodesCount || 6} episodes, ${episodeDurationMin || 45} minutes each` : 'Feature film 90-120 minutes'}
LANGUAGE: ${language}

${references?.length ? `REFERENCES (for inspiration, DO NOT copy): ${references.join(', ')}` : ''}
${contextBlock}

Generate the complete screenplay in industry-standard format.

CRITICAL: Write cinematically - visual, with conflict and subtext. No AI clichés.`;
    }

    console.log('[script-generate] v2.2 STREAMING Screenwriter generating:', {
      hasIdea: !!idea,
      hasScenePrompt: !!scenePrompt,
      format,
      language,
      stream,
      hasContext: !!bibleContext,
      canonCharacters: canonCharacters?.length || 0,
      canonLocations: canonLocations?.length || 0
    });

    // Make streaming request to Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        stream: true,
        system: SCREENWRITER_PROMPT,
        messages: [
          { role: 'user', content: userPrompt },
        ],
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
      console.error('[script-generate] Anthropic API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI service error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return the stream directly to the client
    console.log('[script-generate] Starting stream to client');
    
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('[script-generate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
