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

import { 
  SERIES_BIBLE_PROMPT, 
  SERIES_BIBLE_TOOL_SCHEMA 
} from "../_shared/production-prompts.ts";
import { MODEL_CONFIG, getOutputLimit } from "../_shared/model-config.ts";

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

    // Build prompt using centralized production prompts
    const userPrompt = SERIES_BIBLE_PROMPT.buildUserPrompt({
      title: undefined,
      genre: genre || 'Auto-detectar',
      tone: tone || 'Auto-detectar',
      audience: format === 'series' ? `Series de ${episodesCount || 6} episodios` : 'Película',
      logline: undefined,
      idea: `${idea}${contextBlock}`,
    });

    console.log('[develop-structure] v3.0 PRODUCTION PROMPTS (gpt-5.2):', {
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
        model: MODEL_CONFIG.SCRIPT.HOLLYWOOD,
        messages: [
          { role: 'system', content: SERIES_BIBLE_PROMPT.system },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_completion_tokens: getOutputLimit('BIBLE'),
        tools: [{
          type: 'function',
          function: {
            name: 'deliver_series_bible',
            description: 'Deliver structured series bible',
            parameters: SERIES_BIBLE_TOOL_SCHEMA
          }
        }],
        tool_choice: { type: 'function', function: { name: 'deliver_series_bible' } }
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
