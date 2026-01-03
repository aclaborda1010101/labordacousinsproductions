import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Cost estimates per service (USD)
const COST_ESTIMATES = {
  // Image generation (FAL.ai)
  'fal-ai/nano-banana-pro': 0.02,
  'fal-ai/flux-pro/v1.1-ultra': 0.05,
  'black-forest-labs/flux-1.1-pro-ultra': 0.05,
  
  // Text generation (Claude/Anthropic)
  'claude-sonnet-4-20250514': 0.015, // per 1k tokens approx
  
  // Gemini (via Lovable AI Gateway - free but track usage)
  'google/gemini-2.5-flash': 0.001,
  'google/gemini-2.5-pro': 0.002,
  
  // Video generation
  'kling': 0.15,
  'veo': 0.20,
  
  // Default fallback
  'default': 0.01
};

export interface CostLogEntry {
  userId: string;
  projectId?: string;
  characterId?: string;
  slotId?: string;
  slotType: string;
  engine: string;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

/**
 * Logs a generation cost to the database
 */
export async function logGenerationCost(entry: CostLogEntry): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate cost based on engine
    const costPerUnit = COST_ESTIMATES[entry.engine as keyof typeof COST_ESTIMATES] 
      || COST_ESTIMATES.default;
    
    // Estimate cost - could be refined based on actual usage
    let estimatedCost = costPerUnit;
    
    // For text models, estimate based on duration (longer = more tokens)
    if (entry.engine.includes('claude') || entry.engine.includes('sonnet')) {
      // Rough estimate: 1 second of processing ≈ 500 tokens at fast speed
      const estimatedTokens = Math.max(1000, (entry.durationMs / 1000) * 500);
      estimatedCost = (estimatedTokens / 1000) * costPerUnit;
    }
    
    // Cap at reasonable maximum
    estimatedCost = Math.min(estimatedCost, 1.0);

    const { error } = await supabase.from('generation_logs').insert({
      user_id: entry.userId,
      project_id: entry.projectId || null,
      character_id: entry.characterId || null,
      slot_id: entry.slotId || null,
      slot_type: entry.slotType,
      engine: entry.engine,
      cost_usd: estimatedCost,
      duration_ms: entry.durationMs,
      success: entry.success,
      error_message: entry.errorMessage || null,
      metadata: entry.metadata || {},
      created_at: new Date().toISOString()
    });

    if (error) {
      console.error('[COST LOG] Failed to log cost:', error);
    } else {
      console.log(`[COST LOG] Logged ${entry.slotType} generation: $${estimatedCost.toFixed(4)}`);
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
