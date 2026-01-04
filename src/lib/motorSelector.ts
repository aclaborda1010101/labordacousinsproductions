/**
 * MOTOR SELECTOR v1 - Engine/Preset recommendations based on real metrics
 * No ML, pure metrics-based scoring
 * 
 * Engines for IMAGE:
 * - nano-banana: exploration/variants/identity packs, fast keyframes
 * - flux: production/canon, locations/hero shots
 */

import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type AssetType = 'character' | 'location' | 'keyframe';
export type Phase = 'exploration' | 'production';

export interface EnginePresetMetrics {
  engine: string;
  presetId: string;
  runs: number;
  acceptedCount: number;
  acceptRate: number;
  avgRegenerationsChain: number;
  avgTimeToAccept: number; // in seconds
}

export interface MotorRecommendation {
  recommendedEngine: string;
  recommendedPreset: string;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  basedOnRuns: number;
  acceptRate: number;
  avgRegenerations: number;
  reason: string;
}

export interface MetricsResult {
  metrics: EnginePresetMetrics[];
  recommendation: MotorRecommendation | null;
}

// ─────────────────────────────────────────────────────────────
// ENGINE CONSTANTS
// ─────────────────────────────────────────────────────────────

export const ENGINES = {
  NANO_BANANA: 'nano-banana',
  FLUX: 'flux-1.1-pro-ultra'
} as const;

// ─────────────────────────────────────────────────────────────
// FALLBACK PRESETS (when < 5 runs)
// ─────────────────────────────────────────────────────────────

const SAFE_PRESETS: Record<AssetType, string> = {
  character: 'frontal',
  location: 'establishing',
  keyframe: 'initial'
};

// Fallback engines per asset type
const DEFAULT_ENGINES: Record<AssetType, string> = {
  character: ENGINES.NANO_BANANA,  // nano-banana for characters
  location: ENGINES.FLUX,           // flux for locations
  keyframe: ENGINES.NANO_BANANA    // nano-banana for keyframes
};

// Phase bias: +0.05 score bonus
const PHASE_ENGINE_BIAS: Record<Phase, string> = {
  exploration: ENGINES.NANO_BANANA,
  production: ENGINES.FLUX
};

const PHASE_BIAS_SCORE = 0.05;

// ─────────────────────────────────────────────────────────────
// METRICS CALCULATION
// ─────────────────────────────────────────────────────────────

/**
 * Calculate regeneration chain length for a run
 */
async function getRegenerationChainLength(runId: string): Promise<number> {
  let length = 1;
  let currentId = runId;
  
  // Walk up the parent chain
  while (true) {
    const { data } = await supabase
      .from('generation_runs')
      .select('parent_run_id')
      .eq('id', currentId)
      .maybeSingle();
    
    if (!data?.parent_run_id) break;
    currentId = data.parent_run_id;
    length++;
    
    // Safety limit
    if (length > 50) break;
  }
  
  return length;
}

/**
 * Get metrics grouped by (engine, presetId) for a project and asset type
 */
export async function getMetrics(
  projectId: string,
  assetType: AssetType
): Promise<EnginePresetMetrics[]> {
  // Fetch runs for this project and type
  const { data: runs, error } = await supabase
    .from('generation_runs')
    .select('id, engine, preset_id, status, created_at, accepted_at, parent_run_id')
    .eq('project_id', projectId)
    .eq('run_type', assetType)
    .order('created_at', { ascending: false })
    .limit(200); // Last 200 runs for efficiency

  if (error || !runs || runs.length === 0) {
    return [];
  }

  // Group by engine + presetId
  const groups = new Map<string, typeof runs>();
  
  for (const run of runs) {
    const key = `${run.engine || 'unknown'}::${run.preset_id || 'unknown'}`;
    const existing = groups.get(key) || [];
    existing.push(run);
    groups.set(key, existing);
  }

  // Calculate metrics per group
  const metrics: EnginePresetMetrics[] = [];
  
  for (const [key, groupRuns] of groups.entries()) {
    const [engine, presetId] = key.split('::');
    
    const acceptedRuns = groupRuns.filter(r => r.accepted_at !== null);
    const acceptedCount = acceptedRuns.length;
    const totalRuns = groupRuns.length;
    const acceptRate = totalRuns > 0 ? acceptedCount / totalRuns : 0;
    
    // Calculate average time to accept (in seconds)
    let avgTimeToAccept = 0;
    if (acceptedRuns.length > 0) {
      const times = acceptedRuns
        .filter(r => r.created_at && r.accepted_at)
        .map(r => {
          const created = new Date(r.created_at).getTime();
          const accepted = new Date(r.accepted_at!).getTime();
          return (accepted - created) / 1000; // seconds
        });
      
      if (times.length > 0) {
        avgTimeToAccept = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }
    
    // Calculate average regeneration chain length
    // For efficiency, sample up to 10 recent accepted runs
    const sampleRuns = acceptedRuns.slice(0, 10);
    let avgRegenerationsChain = 1;
    
    if (sampleRuns.length > 0) {
      const chainLengths = await Promise.all(
        sampleRuns.map(r => getRegenerationChainLength(r.id))
      );
      avgRegenerationsChain = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
    }
    
    metrics.push({
      engine,
      presetId,
      runs: totalRuns,
      acceptedCount,
      acceptRate,
      avgRegenerationsChain,
      avgTimeToAccept
    });
  }
  
  return metrics;
}

// ─────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Calculate recommendation score for an engine/preset combination
 * score = (acceptRate * 0.6) - (avgRegenerationsChain * 0.25) - (avgTimeToAccept_norm * 0.15)
 */
function calculateScore(metric: EnginePresetMetrics, phase?: Phase): number {
  // Normalize avgTimeToAccept (assume max reasonable time is 1 hour = 3600s)
  const maxTimeSeconds = 3600;
  const normalizedTime = Math.min(metric.avgTimeToAccept, maxTimeSeconds) / maxTimeSeconds;
  
  // Normalize avgRegenerationsChain (assume max reasonable chain is 10)
  const normalizedChain = Math.min(metric.avgRegenerationsChain, 10) / 10;
  
  let score = 
    (metric.acceptRate * 0.6) - 
    (normalizedChain * 0.25) - 
    (normalizedTime * 0.15);
  
  // Apply phase bias
  if (phase && PHASE_ENGINE_BIAS[phase] === metric.engine) {
    score += PHASE_BIAS_SCORE;
  }
  
  return score;
}

/**
 * Get recommendation based on metrics
 */
export function getRecommendation(
  metrics: EnginePresetMetrics[],
  assetType: AssetType,
  phase?: Phase
): MotorRecommendation | null {
  // Filter metrics with enough data (at least 5 runs)
  const validMetrics = metrics.filter(m => m.runs >= 5);
  
  if (validMetrics.length === 0) {
    // Fallback: not enough data
    return {
      recommendedEngine: DEFAULT_ENGINES[assetType],
      recommendedPreset: SAFE_PRESETS[assetType],
      score: 0,
      confidence: 'low',
      basedOnRuns: 0,
      acceptRate: 0,
      avgRegenerations: 1,
      reason: 'Recomendación por defecto (historial insuficiente)'
    };
  }
  
  // Calculate scores with phase bias
  const scoredMetrics = validMetrics.map(m => ({
    ...m,
    score: calculateScore(m, phase)
  }));
  
  // Sort by score descending
  scoredMetrics.sort((a, b) => b.score - a.score);
  
  const best = scoredMetrics[0];
  
  // Determine confidence
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (best.runs >= 20 && best.acceptRate >= 0.5) {
    confidence = 'high';
  } else if (best.runs >= 10 || (best.runs >= 5 && best.acceptRate >= 0.4)) {
    confidence = 'medium';
  }
  
  return {
    recommendedEngine: best.engine,
    recommendedPreset: best.presetId,
    score: best.score,
    confidence,
    basedOnRuns: best.runs,
    acceptRate: best.acceptRate,
    avgRegenerations: best.avgRegenerationsChain,
    reason: `Basado en ${best.runs} generaciones. Aceptación ${(best.acceptRate * 100).toFixed(0)}%. Regeneraciones medias ${best.avgRegenerationsChain.toFixed(1)}.`
  };
}

// ─────────────────────────────────────────────────────────────
// MAIN API
// ─────────────────────────────────────────────────────────────

/**
 * Get full metrics result including recommendation
 */
export async function getMotorRecommendation(
  projectId: string,
  assetType: AssetType,
  phase?: Phase
): Promise<MetricsResult> {
  const metrics = await getMetrics(projectId, assetType);
  const recommendation = getRecommendation(metrics, assetType, phase);
  
  return { metrics, recommendation };
}

/**
 * Check if user selection differs from recommendation
 */
export function isOverride(
  selectedEngine: string,
  selectedPreset: string,
  recommendation: MotorRecommendation | null
): boolean {
  if (!recommendation || recommendation.confidence === 'low') {
    return false; // No meaningful recommendation to override
  }
  
  return (
    selectedEngine !== recommendation.recommendedEngine ||
    selectedPreset !== recommendation.recommendedPreset
  );
}

/**
 * Log recommendation events to editorial_events
 */
export async function logRecommendationEvent(
  projectId: string,
  assetType: AssetType,
  eventType: 'recommendation_shown' | 'recommendation_overridden' | 'recommendation_followed',
  recommendation: MotorRecommendation | null,
  selectedEngine?: string,
  selectedPreset?: string
): Promise<void> {
  try {
    await supabase.from('editorial_events').insert({
      project_id: projectId,
      asset_type: assetType,
      event_type: eventType,
      payload: {
        recommendedEngine: recommendation?.recommendedEngine,
        recommendedPreset: recommendation?.recommendedPreset,
        confidence: recommendation?.confidence,
        basedOnRuns: recommendation?.basedOnRuns,
        acceptRate: recommendation?.acceptRate,
        avgRegenerations: recommendation?.avgRegenerations,
        selectedEngine,
        selectedPreset
      }
    });
  } catch (err) {
    console.error('[MotorSelector] Error logging event:', err);
  }
}
