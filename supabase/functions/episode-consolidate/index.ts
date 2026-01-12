import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { MODEL_CONFIG, getOutputLimit } from "../_shared/model-config.ts";
import { EPISODE_CONSOLIDATION_PROMPT } from "../_shared/production-prompts.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";

/**
 * EPISODE CONSOLIDATE - Joins all scenes and returns patches (not full rewrite)
 * Model: gpt-5-mini | Max output: 6000 tokens
 */

interface ConsolidateRequest {
  episodeNumber: number;
  episodeScriptText: string;
  projectId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { episodeNumber, episodeScriptText, projectId }: ConsolidateRequest = await req.json();

    if (!episodeScriptText || !episodeNumber) {
      return new Response(
        JSON.stringify({ error: 'Se requiere episodeNumber y episodeScriptText' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`[episode-consolidate] Consolidating episode ${episodeNumber}, ${episodeScriptText.length} chars`);

    // Build prompts using centralized production prompts
    const userPrompt = EPISODE_CONSOLIDATION_PROMPT.buildUserPrompt({
      episodeNumber,
      episodeScriptText,
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.SCRIPT.RAPIDO, // gpt-5-mini for patches
        messages: [
          { role: 'system', content: EPISODE_CONSOLIDATION_PROMPT.system },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: getOutputLimit('CONSOLIDATION'),
        temperature: 0.3, // Low temp for consistent patches
        response_format: { type: 'json_object' },
      }),
    });

    if (response.status === 429) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded, try again later' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (response.status === 402) {
      return new Response(
        JSON.stringify({ error: 'Payment required - add credits to Lovable AI workspace' }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[episode-consolidate] AI error:', response.status, errorText);
      throw new Error(`AI service error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No consolidation result returned');
    }

    // Parse JSON result
    const parseResult = parseJsonSafe(content, 'consolidation');
    if (!parseResult.ok) {
      console.error('[episode-consolidate] JSON parse failed');
      throw new Error('Invalid consolidation format');
    }

    const consolidation = parseResult.json;

    console.log(`[episode-consolidate] Found ${consolidation.issues?.length || 0} issues, ${consolidation.global_patches?.length || 0} patches`);

    return new Response(
      JSON.stringify(consolidation),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[episode-consolidate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
