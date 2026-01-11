import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { 
  v3RequireAuth, 
  v3RequireProjectAccess,
  v3AcquireProjectLock,
  v3ReleaseProjectLock,
  v3CheckRateLimit,
  v3LogRunStart,
  v3LogRunComplete,
  v3Error,
  v3Success,
  corsHeaders,
  V3AuthContext
} from "../_shared/v3-enterprise.ts";

// =============================================================================
// STORY ARCHITECT v3.0 - BLUEPRINT MODE
// V3.0: Structures stories WITHOUT writing dialogue or defining technical specs
// =============================================================================
const STORY_ARCHITECT_PROMPT = `You are a Story Architect.

You DO NOT write dialogue.
You DO NOT define camera, lighting, or sound.

You structure stories.

---

ABSOLUTE RULES

1. Choose a narrative framework (Save the Cat, Hero's Journey, Dan Harmon's Story Circle, 3-Act Structure).
2. Define beats, not prose.
3. Suggest characters and locations with INCOMPLETE visual_dna (users will complete).
4. Identify unknowns explicitly in "assumptions" array.
5. NEVER silently resolve ambiguities - flag them.

---

OUTPUT JSON SCHEMA (STRICT):

{
  "structure_metadata": {
    "version": "3.0",
    "framework_used": "Save the Cat" | "Hero's Journey" | "Dan Harmon" | "3-Act Structure",
    "estimated_runtime_minutes": number
  },
  "logline": {
    "value": "One sentence that captures the story",
    "confidence": 0.0-1.0
  },
  "genre": {
    "primary": "Drama" | "Comedy" | "Thriller" | "Horror" | "Sci-Fi" | "Action" | "Romance",
    "secondary": "optional secondary genre",
    "confidence": 0.0-1.0
  },
  "tone": {
    "value": "Dark" | "Light" | "Satirical" | "Melancholic" | "Hopeful" | "Gritty" | "Whimsical",
    "references": ["similar films/shows for tone reference"],
    "confidence": 0.0-1.0
  },
  "suggested_characters": [
    {
      "name": "Suggested name",
      "role": "Protagonist" | "Antagonist" | "Mentor" | "Ally" | "Love Interest" | "Trickster",
      "function_in_story": "Brief description of their narrative purpose",
      "visual_dna": {
        "hard_traits": [],
        "soft_traits": ["suggested traits user should confirm"],
        "do_not_assume": ["exact face", "exact age", "exact ethnicity"]
      },
      "canon_level": "P3",
      "source": "GENERATED",
      "confidence": 0.5
    }
  ],
  "suggested_locations": [
    {
      "name": "Suggested location name",
      "function_in_story": "Why this location matters narratively",
      "visual_dna": {
        "hard_traits": [],
        "soft_traits": ["suggested visual elements"],
        "do_not_assume": ["exact architecture style", "exact color scheme"]
      },
      "canon_level": "P3",
      "source": "GENERATED",
      "confidence": 0.5
    }
  ],
  "beat_sheet": [
    {
      "beat_number": 1,
      "beat_name": "Opening Image" | "Theme Stated" | "Set-Up" | "Catalyst" | "Debate" | "Break into Two" | "B Story" | "Fun and Games" | "Midpoint" | "Bad Guys Close In" | "All Is Lost" | "Dark Night of the Soul" | "Break into Three" | "Finale" | "Final Image",
      "description": "What happens in this beat (no dialogue)",
      "characters_involved": ["character names"],
      "locations": ["location names"],
      "estimated_page_count": number,
      "emotional_arc": "rising" | "falling" | "stable" | "crisis"
    }
  ],
  "assumptions": [
    {
      "assumption": "Time period not specified",
      "default_value": "Contemporary",
      "user_action_required": true
    },
    {
      "assumption": "Technology level inferred as modern",
      "default_value": "Modern",
      "user_action_required": false
    }
  ],
  "thematic_elements": {
    "central_theme": "What the story is really about",
    "supporting_themes": ["secondary themes"],
    "moral_question": "The ethical dilemma at the heart of the story"
  },
  "world_building_notes": {
    "era": "When does this take place?",
    "setting_type": "Urban" | "Rural" | "Suburban" | "Fantasy" | "Sci-Fi" | "Historical",
    "cultural_context": "Any specific cultural elements?",
    "rules_of_the_world": ["Any special rules or logic that applies"]
  }
}

---

CRITICAL NOTES:

1. All suggested_characters and suggested_locations start at canon_level: "P3" with source: "GENERATED"
2. Users will upgrade to P1/P0 as they confirm or modify suggestions
3. Do NOT invent dialogue or specific action sequences
4. Do NOT define technical metadata (camera, lighting, etc.)
5. Focus on STRUCTURE and NARRATIVE FUNCTION only

Return ONLY valid JSON. No markdown, no commentary.`;

interface DevelopStructureRequest {
  idea: string;
  projectId?: string;
  genre?: string;
  tone?: string;
  format?: 'film' | 'series';
  episodesCount?: number;
  episodeDurationMin?: number;
  language?: string;
  existingCharacters?: Array<{ name: string; role?: string }>;
  existingLocations?: Array<{ name: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // =======================================================================
  // V3.0 ENTERPRISE AUTHENTICATION
  // =======================================================================
  const authResult = await v3RequireAuth(req);
  if (authResult instanceof Response) {
    return authResult;
  }
  const auth: V3AuthContext = authResult;

  // Track for logging and cleanup
  let projectId: string | null = null;
  let lockAcquired = false;
  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const request: DevelopStructureRequest = await req.json();
    projectId = request.projectId || null;
    
    const { 
      idea, 
      genre, 
      tone, 
      format = 'film', 
      episodesCount, 
      episodeDurationMin, 
      language = 'es',
      existingCharacters,
      existingLocations
    } = request;

    if (!idea) {
      return v3Error('VALIDATION_ERROR', 'Se requiere una idea para desarrollar la estructura', 400);
    }

    // =======================================================================
    // V3.0 PROJECT ACCESS + LOCKING + RATE LIMIT
    // =======================================================================
    if (projectId) {
      const accessResult = await v3RequireProjectAccess(auth, projectId);
      if (accessResult instanceof Response) {
        return accessResult;
      }

      // Acquire project lock
      const lockResult = await v3AcquireProjectLock(
        auth.supabase,
        projectId,
        auth.userId,
        'structure_development',
        300
      );

      if (!lockResult.acquired) {
        return v3Error('PROJECT_BUSY', 'Este proyecto ya está procesando una solicitud', 409, lockResult.retryAfter);
      }
      lockAcquired = true;

      // Check rate limit
      const rateLimitResult = await v3CheckRateLimit(projectId, auth.userId, 'develop-structure', 5);
      if (!rateLimitResult.allowed) {
        await v3ReleaseProjectLock(auth.supabase, projectId);
        lockAcquired = false;
        return v3Error('RATE_LIMIT_EXCEEDED', 'Demasiadas solicitudes, espera un momento', 429, rateLimitResult.retryAfter);
      }
    }

    // Log run start
    runId = await v3LogRunStart({
      userId: auth.userId,
      projectId: projectId || undefined,
      functionName: 'develop-structure',
      provider: 'openai',
      model: 'gpt-4o',
    });

    // Use Lovable AI Gateway with GPT-5.2 for superior structure generation
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Build context from existing entities
    let contextBlock = '';
    if (existingCharacters?.length) {
      contextBlock += `\nEXISTING CHARACTERS (integrate these into structure):\n`;
      existingCharacters.forEach(char => {
        contextBlock += `- ${char.name}${char.role ? ` (${char.role})` : ''}\n`;
      });
    }
    
    if (existingLocations?.length) {
      contextBlock += `\nEXISTING LOCATIONS (integrate these into structure):\n`;
      existingLocations.forEach(loc => {
        contextBlock += `- ${loc.name}\n`;
      });
    }

    const userPrompt = `
DEVELOP STORY STRUCTURE FOR:

IDEA: ${idea}

GENRE: ${genre || 'Not specified - suggest one'}
TONE: ${tone || 'Not specified - suggest one'}
FORMAT: ${format === 'series' ? `Series of ${episodesCount || 6} episodes, ${episodeDurationMin || 45} minutes each` : 'Feature film 90-120 minutes'}
LANGUAGE: ${language}

${contextBlock}

Generate a complete story structure following the JSON schema. 
Flag all assumptions explicitly.
Do NOT write dialogue or technical specs.`;

    console.log('[develop-structure] v3.0 BLUEPRINT MODE (Lovable AI Gateway - gpt-5.2):', {
      idea: idea.substring(0, 100),
      format,
      hasExistingCharacters: !!existingCharacters?.length,
      hasExistingLocations: !!existingLocations?.length
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.2',
        messages: [
          { role: 'system', content: STORY_ARCHITECT_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 8000,
        response_format: { type: 'json_object' }
      }),
    });

    // Handle rate limits and payment required
    if (response.status === 429) {
      return v3Error('RATE_LIMIT_EXCEEDED', 'Rate limit exceeded, try again later', 429);
    }
    if (response.status === 402) {
      return v3Error('INTERNAL_ERROR', 'Payment required - add credits to Lovable AI workspace', 402);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[develop-structure] Lovable AI Gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI service error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const structureJson = data.choices?.[0]?.message?.content;

    if (!structureJson) {
      return new Response(
        JSON.stringify({ error: 'No structure generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate the structure
    let parsedStructure;
    try {
      parsedStructure = JSON.parse(structureJson);
    } catch (parseError) {
      console.error('[develop-structure] JSON parse error:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid structure format returned' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[develop-structure] Structure generated:', {
      framework: parsedStructure.structure_metadata?.framework_used,
      beats: parsedStructure.beat_sheet?.length,
      characters: parsedStructure.suggested_characters?.length,
      locations: parsedStructure.suggested_locations?.length,
      assumptions: parsedStructure.assumptions?.length
    });

    // Log success
    if (runId) {
      await v3LogRunComplete(runId, 'success');
    }

    return new Response(
      JSON.stringify(parsedStructure),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[develop-structure] Error:', error);
    
    // Log failure
    if (runId) {
      await v3LogRunComplete(runId, 'failed', undefined, undefined, 'GENERATION_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }

    return v3Error('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unknown error', 500);
  } finally {
    // =======================================================================
    // V3.0 LOCK RELEASE - Always release lock on exit
    // =======================================================================
    if (lockAcquired && projectId) {
      await v3ReleaseProjectLock(auth.supabase, projectId);
      console.log('[develop-structure] Lock released for project:', projectId);
    }
  }
});
