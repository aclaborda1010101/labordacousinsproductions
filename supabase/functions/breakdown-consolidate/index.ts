import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/v3-enterprise.ts";
import { MODEL_CONFIG, getOutputLimit } from "../_shared/model-config.ts";
import { GLOBAL_CONSOLIDATION_PROMPT } from "../_shared/production-prompts.ts";
import { parseJsonSafe } from "../_shared/llmJson.ts";

/**
 * BREAKDOWN CONSOLIDATE - Deduplicates and normalizes all chunk results
 * Model: gpt-5.2 | Max output: 2500 tokens
 */

interface ConsolidateRequest {
  jobId: string;
  chunkResults: any[];
  projectId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { jobId, chunkResults, projectId }: ConsolidateRequest = await req.json();

    if (!jobId || !chunkResults?.length) {
      return new Response(
        JSON.stringify({ error: 'Se requiere jobId y chunkResults' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    console.log(`[breakdown-consolidate] Consolidating job ${jobId}, ${chunkResults.length} chunks`);

    // Build prompts using centralized production prompts
    const userPrompt = GLOBAL_CONSOLIDATION_PROMPT.buildUserPrompt({
      jobId,
      allChunksResultsJsonArray: JSON.stringify(chunkResults),
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_CONFIG.ANALYSIS.CONSOLIDATOR, // gpt-5.2 for quality consolidation
        messages: [
          { role: 'system', content: GLOBAL_CONSOLIDATION_PROMPT.system },
          { role: 'user', content: userPrompt },
        ],
        max_completion_tokens: getOutputLimit('GLOBAL_CONSOLIDATION'),
        temperature: 0.2, // Very low for deterministic consolidation
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
      console.error('[breakdown-consolidate] AI error:', response.status, errorText);
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
      console.error('[breakdown-consolidate] JSON parse failed');
      throw new Error('Invalid consolidation format');
    }

    const consolidation = parseResult.json;

    console.log(`[breakdown-consolidate] Consolidated: ${consolidation.characters_master?.length || 0} chars, ${consolidation.locations_master?.length || 0} locs, ${consolidation.scene_index?.length || 0} scenes`);

    return new Response(
      JSON.stringify(consolidation),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[breakdown-consolidate] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
