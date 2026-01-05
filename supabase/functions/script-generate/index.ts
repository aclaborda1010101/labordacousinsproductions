import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// HOLLYWOOD SCREENWRITER v2.0 - SYSTEM PROMPT
// This function CREATES NEW content based on user ideas.
// =============================================================================
const SCREENWRITER_PROMPT = `You are an expert Hollywood Screenwriter (WGA) with 30 years of experience writing for major studios.

YOUR ROLE: Create NEW, original screenplay content based on user prompts. You write in standard industry format.

WRITING STYLE:
- VISUAL: Write what we SEE and HEAR, not what characters think
- ECONOMICAL: Short action lines (max 3-4 lines per paragraph)
- RHYTHMIC: Vary sentence length for pacing (like Nolan or Sorkin)
- CINEMATIC: Not theatrical - think in shots, not stage directions

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

5. TRANSITIONS:
   - CUT TO:, FADE OUT., SMASH CUT TO:, MATCH CUT TO:
   - Use sparingly - hard cuts are assumed

CONTENT RULES:
- Show don't tell: Visual action, not exposition
- Every scene needs CONFLICT (internal or external)
- Subtext in dialogue - characters rarely say exactly what they mean
- Character arcs must be clear and trackable
- Avoid clichés, tropes, and generic "AI voice"

WHAT TO AVOID:
- Flowery descriptions ("The beautiful sunset painted the sky...")
- Expository dialogue ("As you know, we've been friends for 20 years...")
- Telling emotions ("She felt a wave of sadness wash over her...")
- Purple prose - keep it tight and visual
- Generic characters without distinct voices

OUTPUT FORMAT:
Return screenplay text formatted exactly as industry standard, ready to be shot.

EXAMPLE OF EXPECTED QUALITY:
---
INT. HOUSE PARTY - NIGHT

OPPENHEIMER (40s, intense eyes behind wire-rim glasses) navigates through a crowd of academics. Smoke curls. Jazz plays.

He spots a tray of martinis.

KITTY (O.S.)
I thought physicists drank tea.

Oppenheimer turns. KITTY HARRISON (30s, sharp features, sharper wit) emerges from shadow.

OPPENHEIMER
Only the boring ones.

He takes a glass. The ICE CLINKS.

KITTY
And you're not boring?

OPPENHEIMER
(beat)
I'm about to find out.

Their eyes lock. Something dangerous passes between them.

CUT TO:
---`;

// =============================================================================
// JSON STRUCTURE PROMPT (for structured output mode)
// =============================================================================
const JSON_STRUCTURE_PROMPT = `${SCREENWRITER_PROMPT}

OUTPUT FORMAT (JSON):
{
  "title": "string",
  "logline": "string (1-2 sentences summarizing the story)",
  "synopsis": "string (executive summary 200-500 words)",
  "genre": "string",
  "tone": "string",
  "themes": ["array of main themes"],
  "beat_sheet": [
    {
      "beat": "Opening Image | Theme Stated | Set-Up | Catalyst | Debate | Break Into Two | B Story | Fun and Games | Midpoint | Bad Guys Close In | All Is Lost | Dark Night of the Soul | Break Into Three | Finale | Final Image",
      "description": "string",
      "page_range": "string (e.g., 1-10)"
    }
  ],
  "episodes": [
    {
      "episode_number": 1,
      "title": "string",
      "synopsis": "string (detailed episode summary 150-300 words)",
      "summary": "string (brief 2-3 sentence summary)",
      "duration_min": number,
      "scenes": [
        {
          "scene_number": 1,
          "slugline": "INT./EXT. LOCATION - TIME",
          "description": "string (scene description)",
          "characters": ["character names present"],
          "action": "string (detailed action description)",
          "dialogue": [
            {
              "character": "NAME",
              "parenthetical": "(optional: tone or action)",
              "line": "The dialogue text"
            }
          ],
          "music_cue": "string (optional)",
          "sfx": ["array of sound effects"],
          "vfx": ["array of visual effects if applicable"],
          "mood": "string (scene atmosphere)"
        }
      ],
      "screenplay_text": "string (full formatted screenplay for episode)"
    }
  ],
  "characters": [
    {
      "name": "string",
      "role": "protagonist | antagonist | supporting | recurring | episodic",
      "description": "string (detailed physical description)",
      "personality": "string (personality traits)",
      "arc": "string (character arc throughout story)",
      "first_appearance": "string (scene where introduced)",
      "relationships": "string (relationships with other characters)",
      "voice_notes": "string (how they speak, accent, vocabulary)"
    }
  ],
  "locations": [
    {
      "name": "string",
      "type": "INT | EXT",
      "description": "string (detailed visual description)",
      "atmosphere": "string (lighting, sounds, mood)",
      "scenes_count": number,
      "time_variants": ["day", "night", "dawn", "dusk"]
    }
  ],
  "props": [
    {
      "name": "string",
      "importance": "key | recurring | background",
      "description": "string (detailed description)",
      "scenes": ["scenes where it appears"]
    }
  ],
  "music_design": [
    {
      "name": "string (e.g., Main Theme, Villain Theme)",
      "type": "theme | ambient | action | emotional",
      "description": "string",
      "scenes": ["where it's used"]
    }
  ],
  "sfx_design": [
    {
      "category": "string (ambient, foley, impact)",
      "description": "string",
      "scenes": ["where it's used"]
    }
  ],
  "screenplay": "string (full formatted screenplay - for films or pilot episode)"
}`;

interface ScriptGenerateRequest {
  idea: string;
  genre: string;
  tone: string;
  references?: string[];
  format: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  language?: string;
  outputFormat?: 'json' | 'screenplay'; // New option for plain text output
  scenePrompt?: string; // For generating individual scenes
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
      format, 
      episodesCount, 
      episodeDurationMin, 
      language,
      outputFormat = 'json',
      scenePrompt 
    } = request;

    if (!idea && !scenePrompt) {
      return new Response(
        JSON.stringify({ error: 'Se requiere una idea o prompt de escena para generar el guion' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('AI service not configured');
    }

    // Choose system prompt based on output format
    const systemPrompt = outputFormat === 'screenplay' ? SCREENWRITER_PROMPT : JSON_STRUCTURE_PROMPT;

    // Build user prompt based on whether it's a full script or single scene
    let userPrompt: string;
    
    if (scenePrompt) {
      // Single scene generation mode
      userPrompt = `Write a single scene based on this prompt:

${scenePrompt}

Output ONLY the formatted screenplay scene. No JSON, no commentary.`;
    } else {
      // Full script generation mode
      userPrompt = `
SCRIPT REQUEST:

IDEA: ${idea}

GENRE: ${genre || 'Drama'}
TONE: ${tone || 'Cinematic realism'}
FORMAT: ${format === 'series' ? `Series of ${episodesCount || 6} episodes, ${episodeDurationMin || 45} minutes each` : 'Feature film 90-120 minutes'}
LANGUAGE: ${language || 'es-ES'}

${references?.length ? `REFERENCES (for inspiration, DO NOT copy): ${references.join(', ')}` : ''}

${outputFormat === 'json' 
  ? 'Generate a complete professional script following the JSON structure specified. For series, include full screenplay for first episode and synopses for others. For films, include complete screenplay.'
  : 'Generate the complete screenplay in industry-standard format. Use proper sluglines, action, dialogue formatting.'}

CRITICAL: Write cinematically - visual, with conflict and subtext. No AI clichés.`;
    }

    console.log('[script-generate] v2.0 SCREENWRITER generating:', {
      hasIdea: !!idea,
      hasScenePrompt: !!scenePrompt,
      format,
      outputFormat,
      language
    });

    // Use appropriate model based on task complexity
    const model = scenePrompt ? 'google/gemini-2.5-flash' : 'google/gemini-2.5-pro';

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7, // Higher temperature for creative writing
        ...(outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {})
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required. Please add credits to your workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('[script-generate] AI error:', response.status, errorText);
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Handle different output formats
    if (outputFormat === 'screenplay' || scenePrompt) {
      // Plain text screenplay output
      console.log('[script-generate] Returning plain screenplay text');
      return new Response(
        JSON.stringify({
          success: true,
          screenplay: content,
          format: 'screenplay',
          metadata: {
            generator_version: '2.0',
            model_used: model,
            timestamp: new Date().toISOString()
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // JSON structured output
    let scriptData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0]);
      } else {
        scriptData = {
          title: 'Untitled Script',
          screenplay: content,
          characters: [],
          locations: [],
          props: [],
          beat_sheet: [],
          episodes: format === 'series' ? [{ 
            episode_number: 1, 
            title: 'Pilot', 
            synopsis: '', 
            duration_min: episodeDurationMin || 45 
          }] : []
        };
      }
    } catch (parseError) {
      console.error('[script-generate] JSON parse error:', parseError);
      scriptData = {
        title: 'Generated Script',
        screenplay: content,
        raw_response: true,
        parse_error: String(parseError)
      };
    }

    // Add generator metadata
    scriptData.metadata = {
      generator_version: '2.0',
      model_used: model,
      timestamp: new Date().toISOString(),
      input_params: {
        genre,
        tone,
        format,
        episodesCount: format === 'series' ? episodesCount : undefined,
        language
      }
    };

    console.log('[script-generate] Script generated successfully:', {
      title: scriptData.title,
      episodeCount: scriptData.episodes?.length || 0,
      characterCount: scriptData.characters?.length || 0
    });

    return new Response(
      JSON.stringify({
        success: true,
        script: scriptData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[script-generate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
