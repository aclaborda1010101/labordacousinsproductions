import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Token pricing per model (USD per 1000 tokens)
const TOKEN_PRICING = {
  // Anthropic Claude models
  'claude-sonnet-4-20250514': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  
  // OpenAI models
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4': { input: 0.03, output: 0.06 },
  
  // Image generation (per image, not per token)
  'fal-ai/nano-banana-pro': { perImage: 0.02 },
  'fal-ai/flux-pro/v1.1-ultra': { perImage: 0.05 },
  'black-forest-labs/flux-1.1-pro-ultra': { perImage: 0.05 },
  
  // Video generation (per video)
  'kling': { perVideo: 0.15 },
  'veo': { perVideo: 0.20 },
  
  // Default fallback
  'default': { input: 0.001, output: 0.002, perImage: 0.01 }
} as const;

export interface CostLogEntry {
  userId: string;
  projectId?: string;
  characterId?: string;
  slotId?: string;
  slotType: string;
  engine: string;
  model?: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  // Token tracking
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  // Context
  episodeId?: string;
  sceneId?: string;
  category?: 'script' | 'character' | 'location' | 'keyframe' | 'shot' | 'other';
}

/**
 * Calculate cost from token usage
 */
export function calculateTokenCost(
  model: string,
  inputTokens?: number,
  outputTokens?: number
): number {
  const pricing = TOKEN_PRICING[model as keyof typeof TOKEN_PRICING] || TOKEN_PRICING.default;
  
  // If it's per-image or per-video pricing
  if ('perImage' in pricing) return pricing.perImage;
  if ('perVideo' in pricing) return pricing.perVideo;
  
  // Token-based pricing
  if ('input' in pricing && 'output' in pricing) {
    const inputCost = ((inputTokens || 0) / 1000) * pricing.input;
    const outputCost = ((outputTokens || 0) / 1000) * pricing.output;
    return inputCost + outputCost;
  }
  
  return 0.01; // Default fallback
}

/**
 * Determine cost category from slot type
 */
export function getCostCategory(slotType: string): CostLogEntry['category'] {
  const lower = slotType.toLowerCase();
  
  if (lower.includes('script') || lower.includes('episode') || lower.includes('outline') || lower.includes('teaser')) {
    return 'script';
  }
  if (lower.includes('character') || lower.includes('portrait') || lower.includes('turnaround') || lower.includes('identity')) {
    return 'character';
  }
  if (lower.includes('location') || lower.includes('environment')) {
    return 'location';
  }
  if (lower.includes('keyframe')) {
    return 'keyframe';
  }
  if (lower.includes('shot') || lower.includes('render') || lower.includes('video')) {
    return 'shot';
  }
  
  return 'other';
}

/**
 * Logs a generation cost to the database with token tracking
 */
export async function logGenerationCost(entry: CostLogEntry): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate cost from tokens if available, otherwise estimate
    let estimatedCost: number;
    
    if (entry.inputTokens !== undefined || entry.outputTokens !== undefined) {
      // Real token-based calculation
      estimatedCost = calculateTokenCost(
        entry.model || entry.engine,
        entry.inputTokens,
        entry.outputTokens
      );
    } else {
      // Legacy estimate based on duration (backwards compatibility)
      const pricing = TOKEN_PRICING[entry.engine as keyof typeof TOKEN_PRICING] || TOKEN_PRICING.default;
      
      if ('perImage' in pricing) {
        estimatedCost = pricing.perImage;
      } else if ('perVideo' in pricing) {
        estimatedCost = pricing.perVideo;
      } else if ('input' in pricing) {
        // Rough estimate: 1 second ≈ 500 tokens at fast speed
        const estimatedTokens = Math.max(1000, (entry.durationMs / 1000) * 500);
        estimatedCost = (estimatedTokens / 1000) * pricing.input;
      } else {
        estimatedCost = 0.01;
      }
    }
    
    // Cap at reasonable maximum
    estimatedCost = Math.min(estimatedCost, 2.0);
    
    // Determine category
    const category = entry.category || getCostCategory(entry.slotType);

    const { error } = await supabase.from('generation_logs').insert({
      user_id: entry.userId,
      project_id: entry.projectId || null,
      character_id: entry.characterId || null,
      slot_id: entry.slotId || null,
      slot_type: entry.slotType,
      engine: entry.engine,
      model: entry.model || entry.engine,
      cost_usd: estimatedCost,
      duration_ms: entry.durationMs,
      success: entry.success,
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || {},
      input_tokens: entry.inputTokens || null,
      output_tokens: entry.outputTokens || null,
      total_tokens: entry.totalTokens || (entry.inputTokens && entry.outputTokens ? entry.inputTokens + entry.outputTokens : null),
      episode_id: entry.episodeId || null,
      scene_id: entry.sceneId || null,
      category,
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('[COST LOG] Failed to log cost:', error);
    } else {
      const tokenInfo = entry.inputTokens !== undefined 
        ? ` (${entry.inputTokens} in / ${entry.outputTokens || 0} out tokens)` 
        : '';
      console.log(`[COST LOG] ${entry.slotType} [${category}]: $${estimatedCost.toFixed(4)}${tokenInfo}`);
    }

    // Update user usage stats
    try {
      const month = new Date().toISOString().slice(0, 7) + '-01';
      await supabase.rpc('increment_user_usage', {
        p_user_id: entry.userId,
        p_month: month,
        p_cost: estimatedCost
      });
    } catch (usageErr) {
      console.error('[COST LOG] Error updating user usage:', usageErr);
    }
  } catch (err) {
    // Don't fail the main operation if cost logging fails
    console.error('[COST LOG] Error logging cost:', err);
  }
}

/**
 * Extract user ID from authorization header
 */
export function extractUserId(authHeader: string | null): string | null {
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

/**
 * Extract token usage from Anthropic API response
 */
export function extractAnthropicTokens(response: any): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: response?.usage?.input_tokens || 0,
    outputTokens: response?.usage?.output_tokens || 0
  };
}

/**
 * Extract token usage from OpenAI API response
 */
export function extractOpenAITokens(response: any): { inputTokens: number; outputTokens: number } {
  return {
    inputTokens: response?.usage?.prompt_tokens || 0,
    outputTokens: response?.usage?.completion_tokens || 0
  };
}
