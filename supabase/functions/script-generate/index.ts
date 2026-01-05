import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// HOLLYWOOD SCREENWRITER v2.1 - SYSTEM PROMPT
// This function CREATES NEW content based on user ideas.
// Output MUST match Parser schema for database compatibility.
// =============================================================================
const SCREENWRITER_PROMPT = `You are an elite Hollywood Screenwriter (Christopher Nolan / Aaron Sorkin style) with 30 years of studio experience.

YOUR ROLE: Create NEW, original screenplay content based on user prompts. You write in standard industry format.

WRITING STYLE:
- VISUAL: Write what we SEE and HEAR, not what characters think
- ECONOMICAL: Short action lines (max 3-4 lines per paragraph)
- RHYTHMIC: Vary sentence length for pacing
- CINEMATIC: Think in shots, not stage directions

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
- Generic characters without distinct voices`;

// =============================================================================
// JSON STRUCTURE PROMPT - Matches Parser Output Schema for DB Compatibility
// =============================================================================
const JSON_STRUCTURE_PROMPT = `${SCREENWRITER_PROMPT}

CRITICAL OUTPUT FORMAT:
You MUST return a JSON object that matches our Parser database schema. This ensures consistency between parsed and generated scripts.

{
  "scenes": [
    {
      "scene_number": 1,
      "slugline": { 
        "value": "INT. KITCHEN - NIGHT", 
        "source": "Generated based on user prompt: '[prompt excerpt]'"
      },
      "visual_style": {
        "value": "COLOR" | "MONOCHROME" | "SEPIA",
        "details": "Neon-Noir, High Contrast (if applicable)",
        "confidence": 1.0,
        "source": "Creative decision based on genre/mood"
      },
      "standardized_location": {
        "value": "KITCHEN",
        "confidence": 1.0
      },
      "standardized_time": {
        "value": "NIGHT",
        "confidence": 1.0
      },
      "location_type": {
        "value": "INT" | "EXT" | "INT/EXT",
        "confidence": 1.0
      },
      "audio_cues": {
        "explicit": [
          { "value": "HUM of refrigerator", "confidence": 1.0, "source": "Written into action" }
        ],
        "inferred": [
          { "value": "City ambient noise", "confidence": 0.8, "source": "Implied by urban setting" }
        ],
        "confidence_score": 0.9
      },
      "visual_fx_cues": [
        { "value": "Neon light flickering on wet surfaces", "confidence": 1.0, "source": "Action line" }
      ],
      "action_summary": {
        "value": "Jack cleans a wound under the tap. Water runs RED.",
        "confidence": 1.0
      },
      "characters_present": [
        { "value": "Jack", "confidence": 1.0, "source": "Main character in scene" }
      ],
      "dialogue_count": 4,
      "mood": {
        "value": "tense, noir",
        "confidence": 1.0,
        "source": "Genre and action dictate mood"
      },
      "lighting_hints": {
        "value": "neon glow, harsh shadows",
        "confidence": 1.0,
        "source": "Visual style description"
      },
      "technical_notes": {
        "value": "CLOSE ON the dripping faucet",
        "confidence": 1.0,
        "source": "Camera direction in script"
      },
      "script_content": "JACK (40s, ragged, blood on his shirt) leans over the sink...\\n\\nThe faucet DRIPS. Each drop echoes.\\n\\nJACK\\n(whispering)\\nDamn it.\\n\\nHe winces. Presses a towel to the wound. It immediately soaks RED."
    }
  ],
  "canon_suggestions": [
    {
      "type": "CHARACTER" | "PROP" | "LOCATION",
      "name": { "value": "Jack", "confidence": 1.0, "source": "Main protagonist" },
      "visual_traits": [
        { "value": "40s, rugged, weathered face", "confidence": 1.0, "source": "Character description" }
      ],
      "appearances": 1,
      "suggest_canon": true,
      "reason": "Key character requiring visual consistency"
    }
  ],
  "project_metadata": {
    "type": { "value": "MOVIE" | "SERIES", "confidence": 1.0, "source": "User specification" },
    "detected_language": { "value": "en" | "es", "confidence": 1.0 },
    "title": { "value": "Scene Title", "confidence": 1.0, "source": "Generated" },
    "genre": { "value": "Noir Thriller", "confidence": 1.0 },
    "tone": { "value": "Gritty, Atmospheric", "confidence": 1.0 }
  }
}

IMPORTANT: 
- All confidence scores for generated content should be 1.0 (you created it, you're certain)
- Include "source" as "Generated based on [reason]" to distinguish from parsed content
- script_content MUST be properly formatted screenplay text with \\n for line breaks`;

interface ScriptGenerateRequest {
  idea: string;
  genre?: string;
  tone?: string;
  references?: string[];
  format?: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  language?: string;
  outputFormat?: 'json' | 'screenplay';
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
      outputFormat = 'json',
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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('AI service not configured');
    }

    // Choose system prompt based on output format
    const systemPrompt = outputFormat === 'screenplay' ? SCREENWRITER_PROMPT : JSON_STRUCTURE_PROMPT;

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
      // Single scene generation mode
      userPrompt = `Write a single scene based on this prompt:

${scenePrompt}
${contextBlock}

${outputFormat === 'json' 
  ? 'Return JSON matching the schema with script_content containing the formatted screenplay.'
  : 'Output ONLY the formatted screenplay scene. No JSON, no commentary.'}`;
    } else {
      // Full script generation mode
      userPrompt = `
SCRIPT REQUEST:

IDEA: ${idea}

GENRE: ${genre || 'Drama'}
TONE: ${tone || 'Cinematic realism'}
FORMAT: ${format === 'series' ? `Series of ${episodesCount || 6} episodes, ${episodeDurationMin || 45} minutes each` : 'Feature film 90-120 minutes'}
LANGUAGE: ${language}

${references?.length ? `REFERENCES (for inspiration, DO NOT copy): ${references.join(', ')}` : ''}
${contextBlock}

${outputFormat === 'json' 
  ? 'Generate scene(s) following the JSON structure specified. Include full screenplay in script_content fields.'
  : 'Generate the complete screenplay in industry-standard format.'}

CRITICAL: Write cinematically - visual, with conflict and subtext. No AI clichés.`;
    }

    console.log('[script-generate] v2.1 SCREENWRITER generating:', {
      hasIdea: !!idea,
      hasScenePrompt: !!scenePrompt,
      format,
      outputFormat,
      language,
      hasContext: !!bibleContext,
      canonCharacters: canonCharacters?.length || 0,
      canonLocations: canonLocations?.length || 0
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

    // Handle plain text screenplay output
    if (outputFormat === 'screenplay') {
      console.log('[script-generate] Returning plain screenplay text');
      return new Response(
        JSON.stringify({
          success: true,
          screenplay: content,
          format: 'screenplay',
          metadata: {
            generator_version: '2.1',
            model_used: model,
            timestamp: new Date().toISOString()
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON structured output
    let scriptData;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        scriptData = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: wrap raw content in expected structure
        scriptData = {
          scenes: [{
            scene_number: 1,
            slugline: { value: 'UNTITLED SCENE', source: 'Fallback' },
            script_content: content,
            visual_style: { value: 'COLOR', confidence: 1.0, source: 'Default' }
          }],
          project_metadata: {
            type: { value: format === 'series' ? 'SERIES' : 'MOVIE', confidence: 1.0 },
            detected_language: { value: language, confidence: 1.0 }
          },
          canon_suggestions: []
        };
      }
    } catch (parseError) {
      console.error('[script-generate] JSON parse error:', parseError);
      // Create structured fallback
      scriptData = {
        scenes: [{
          scene_number: 1,
          slugline: { value: 'GENERATED SCENE', source: 'Parse error fallback' },
          script_content: content,
          visual_style: { value: 'COLOR', confidence: 1.0, source: 'Default' },
          action_summary: { value: 'See script_content', confidence: 0.5 }
        }],
        project_metadata: {
          type: { value: format === 'series' ? 'SERIES' : 'MOVIE', confidence: 1.0 },
          detected_language: { value: language, confidence: 1.0 }
        },
        canon_suggestions: [],
        _parse_error: String(parseError)
      };
    }

    // Add generator metadata (distinguishes from parsed content)
    scriptData.analysis_metadata = {
      parser_version: '2.1-GENERATOR',
      extraction_timestamp: new Date().toISOString(),
      source_type: 'GENERATED',
      generator_model: model,
      total_confidence_score: 1.0, // Generated content has full confidence
      input_params: {
        idea: idea?.substring(0, 100),
        genre,
        tone,
        format,
        language,
        scenePrompt: scenePrompt?.substring(0, 100)
      }
    };

    console.log('[script-generate] Script generated successfully:', {
      scenes: scriptData.scenes?.length || 0,
      canonSuggestions: scriptData.canon_suggestions?.length || 0,
      hasMetadata: !!scriptData.project_metadata
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...scriptData
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
