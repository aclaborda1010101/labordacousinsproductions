/**
 * RECOMMENDATIONS v1 - Engine + Preset recommendations based on real metrics
 * No ML, pure metrics-based scoring with phase bias + style bias (EKB v1)
 * 
 * Engines for IMAGE:
 * - nano-banana: exploration/variants/identity packs, fast keyframes
 * - flux: production/canon, locations/hero shots
 */

import { supabase } from '@/integrations/supabase/client';
import type { VisualStyle, FormatProfile } from './editorialKnowledgeBase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type AssetType = 'character' | 'location' | 'keyframe';
export type Phase = 'exploration' | 'production';

export interface PresetMetrics {
  presetId: string;
  totalRuns: number;
  acceptedCount: number;
  acceptRate: number;
  avgRegenerationsChain: number;
  avgTimeToAccept: number; // seconds
}

export interface EngineMetrics {
  engine: string;
  presetId: string;
  totalRuns: number;
  acceptedCount: number;
  acceptRate: number;
  avgRegenerationsChain: number;
  avgTimeToAccept: number;
}

export interface EngineGlobalMetrics {
  engine: string;
  totalRuns: number;
  acceptedCount: number;
  acceptRate: number;
  avgRegenerationsChain: number;
  avgTimeToAccept: number;
}

export interface Recommendation {
  recommendedEngine: string;
  recommendedPreset: string;
  score: number;
  confidence: 'low' | 'medium' | 'high';
  basedOnRuns: number;
  acceptRate: number;
  avgRegenerations: number;
  reason: string;
}

export interface PresetWithMetrics {
  presetId: string;
  label: string;
  isRecommended: boolean;
  hasLowData: boolean;      // < 5 runs
  hasHighFriction: boolean; // avgRegenerationsChain >= 2.5
  metrics: PresetMetrics | null;
  score: number;
}

export interface RecommendationsResult {
  presetMetrics: PresetMetrics[];
  engineMetrics: EngineMetrics[];
  engineGlobalMetrics: EngineGlobalMetrics[];
  recommendation: Recommendation | null;
  orderedPresets: PresetWithMetrics[];
}

export interface StyleBias {
  visualStyle?: VisualStyle;
  formatProfile?: FormatProfile;
  presetBias?: Record<string, number>;
  engineBias?: Record<string, number>;
}

// ─────────────────────────────────────────────────────────────
// ENGINE CONSTANTS
// ─────────────────────────────────────────────────────────────

export const ENGINES = {
  NANO_BANANA: 'nano-banana',
  FLUX: 'flux-1.1-pro-ultra'
} as const;

// Fallback engines per asset type
const DEFAULT_ENGINES: Record<AssetType, string> = {
  character: ENGINES.NANO_BANANA,
  location: ENGINES.FLUX,
  keyframe: ENGINES.NANO_BANANA
};

// Fallback presets per asset type
const DEFAULT_PRESETS: Record<AssetType, string> = {
  character: 'frontal',
  location: 'establishing',
  keyframe: 'initial'
};

// Phase bias: +0.05 score bonus
const PHASE_ENGINE_BIAS: Record<Phase, string> = {
  exploration: ENGINES.NANO_BANANA,
  production: ENGINES.FLUX
};

const PHASE_BIAS_SCORE = 0.05;
const STYLE_BIAS_SCORE = 0.03; // Lower than phase bias

// ─────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * Calculate regeneration chain length for a run
 */
async function getRegenerationChainLength(runId: string): Promise<number> {
  let length = 1;
  let currentId = runId;
  
  while (true) {
    const { data } = await supabase
      .from('generation_runs')
      .select('parent_run_id')
      .eq('id', currentId)
      .maybeSingle();
    
    if (!data?.parent_run_id) break;
    currentId = data.parent_run_id;
    length++;
    
    if (length > 50) break;
  }
  
  return length;
}

// ─────────────────────────────────────────────────────────────
// METRICS CALCULATION
// ─────────────────────────────────────────────────────────────

/**
 * Get preset metrics grouped by preset_id
 */
export async function getPresetMetrics(
  projectId: string,
  assetType: AssetType
): Promise<PresetMetrics[]> {
  const { data: runs, error } = await supabase
    .from('generation_runs')
    .select('id, preset_id, created_at, accepted_at, parent_run_id')
    .eq('project_id', projectId)
    .eq('run_type', assetType)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !runs || runs.length === 0) return [];

  // Group by preset_id
  const groups = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = run.preset_id || 'unknown';
    const existing = groups.get(key) || [];
    existing.push(run);
    groups.set(key, existing);
  }

  const metrics: PresetMetrics[] = [];
  
  for (const [presetId, groupRuns] of groups.entries()) {
    const acceptedRuns = groupRuns.filter(r => r.accepted_at !== null);
    const totalRuns = groupRuns.length;
    const acceptedCount = acceptedRuns.length;
    const acceptRate = totalRuns > 0 ? acceptedCount / totalRuns : 0;

    // Avg time to accept
    let avgTimeToAccept = 0;
    if (acceptedRuns.length > 0) {
      const times = acceptedRuns
        .filter(r => r.created_at && r.accepted_at)
        .map(r => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000);
      if (times.length > 0) {
        avgTimeToAccept = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    // Avg regeneration chain (sample up to 10)
    const sampleRuns = acceptedRuns.slice(0, 10);
    let avgRegenerationsChain = 1;
    if (sampleRuns.length > 0) {
      const chainLengths = await Promise.all(sampleRuns.map(r => getRegenerationChainLength(r.id)));
      avgRegenerationsChain = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
    }

    metrics.push({
      presetId,
      totalRuns,
      acceptedCount,
      acceptRate,
      avgRegenerationsChain,
      avgTimeToAccept
    });
  }

  return metrics;
}

/**
 * Get engine metrics grouped by (engine, preset_id)
 */
export async function getEngineMetrics(
  projectId: string,
  assetType: AssetType
): Promise<{ byPreset: EngineMetrics[]; global: EngineGlobalMetrics[] }> {
  const { data: runs, error } = await supabase
    .from('generation_runs')
    .select('id, engine, preset_id, created_at, accepted_at, parent_run_id')
    .eq('project_id', projectId)
    .eq('run_type', assetType)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error || !runs || runs.length === 0) {
    return { byPreset: [], global: [] };
  }

  // Group by engine + preset
  const presetGroups = new Map<string, typeof runs>();
  const engineGroups = new Map<string, typeof runs>();
  
  for (const run of runs) {
    const engine = run.engine || 'unknown';
    const presetKey = `${engine}::${run.preset_id || 'unknown'}`;
    
    // By preset
    const existingPreset = presetGroups.get(presetKey) || [];
    existingPreset.push(run);
    presetGroups.set(presetKey, existingPreset);
    
    // Global by engine
    const existingEngine = engineGroups.get(engine) || [];
    existingEngine.push(run);
    engineGroups.set(engine, existingEngine);
  }

  // Calculate metrics per engine+preset
  const byPreset: EngineMetrics[] = [];
  for (const [key, groupRuns] of presetGroups.entries()) {
    const [engine, presetId] = key.split('::');
    const acceptedRuns = groupRuns.filter(r => r.accepted_at !== null);
    const totalRuns = groupRuns.length;
    const acceptedCount = acceptedRuns.length;
    const acceptRate = totalRuns > 0 ? acceptedCount / totalRuns : 0;

    let avgTimeToAccept = 0;
    if (acceptedRuns.length > 0) {
      const times = acceptedRuns
        .filter(r => r.created_at && r.accepted_at)
        .map(r => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000);
      if (times.length > 0) {
        avgTimeToAccept = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    const sampleRuns = acceptedRuns.slice(0, 10);
    let avgRegenerationsChain = 1;
    if (sampleRuns.length > 0) {
      const chainLengths = await Promise.all(sampleRuns.map(r => getRegenerationChainLength(r.id)));
      avgRegenerationsChain = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
    }

    byPreset.push({
      engine,
      presetId,
      totalRuns,
      acceptedCount,
      acceptRate,
      avgRegenerationsChain,
      avgTimeToAccept
    });
  }

  // Calculate global engine metrics
  const global: EngineGlobalMetrics[] = [];
  for (const [engine, groupRuns] of engineGroups.entries()) {
    const acceptedRuns = groupRuns.filter(r => r.accepted_at !== null);
    const totalRuns = groupRuns.length;
    const acceptedCount = acceptedRuns.length;
    const acceptRate = totalRuns > 0 ? acceptedCount / totalRuns : 0;

    let avgTimeToAccept = 0;
    if (acceptedRuns.length > 0) {
      const times = acceptedRuns
        .filter(r => r.created_at && r.accepted_at)
        .map(r => (new Date(r.accepted_at!).getTime() - new Date(r.created_at).getTime()) / 1000);
      if (times.length > 0) {
        avgTimeToAccept = times.reduce((a, b) => a + b, 0) / times.length;
      }
    }

    const sampleRuns = acceptedRuns.slice(0, 10);
    let avgRegenerationsChain = 1;
    if (sampleRuns.length > 0) {
      const chainLengths = await Promise.all(sampleRuns.map(r => getRegenerationChainLength(r.id)));
      avgRegenerationsChain = chainLengths.reduce((a, b) => a + b, 0) / chainLengths.length;
    }

    global.push({
      engine,
      totalRuns,
      acceptedCount,
      acceptRate,
      avgRegenerationsChain,
      avgTimeToAccept
    });
  }

  return { byPreset, global };
}

// ─────────────────────────────────────────────────────────────
// SCORING
// ─────────────────────────────────────────────────────────────

/**
 * Calculate score for engine/preset
 * score = (acceptRate * 0.65) - (avgRegenerationsChain * 0.25) - (timeToAccept_norm * 0.10)
 */
function calculateScore(
  acceptRate: number,
  avgRegenerationsChain: number,
  avgTimeToAccept: number,
  engine?: string,
  phase?: Phase,
  presetId?: string,
  styleBias?: StyleBias
): number {
  const maxTimeSeconds = 3600;
  const normalizedTime = Math.min(avgTimeToAccept, maxTimeSeconds) / maxTimeSeconds;
  const normalizedChain = Math.min(avgRegenerationsChain, 10) / 10;
  
  let score = 
    (acceptRate * 0.65) - 
    (normalizedChain * 0.25) - 
    (normalizedTime * 0.10);
  
  // Apply phase bias
  if (phase && engine && PHASE_ENGINE_BIAS[phase] === engine) {
    score += PHASE_BIAS_SCORE;
  }

  // Apply style bias from EKB
  if (styleBias) {
    // Engine bias from style
    if (engine && styleBias.engineBias?.[engine]) {
      score += styleBias.engineBias[engine];
    }
    // Preset bias from style
    if (presetId && styleBias.presetBias?.[presetId]) {
      score += styleBias.presetBias[presetId];
    }
  }
  
  return score;
}

// ─────────────────────────────────────────────────────────────
// MAIN RECOMMENDATION API
// ─────────────────────────────────────────────────────────────

/**
 * Get full recommendations for a project and asset type
 */
export async function getRecommendations(
  projectId: string,
  assetType: AssetType,
  availablePresets: string[],
  phase?: Phase,
  styleBias?: StyleBias
): Promise<RecommendationsResult> {
  const presetMetrics = await getPresetMetrics(projectId, assetType);
  const { byPreset: engineMetrics, global: engineGlobalMetrics } = await getEngineMetrics(projectId, assetType);

  // Find best engine+preset combination
  const validMetrics = engineMetrics.filter(m => m.totalRuns >= 5);
  
  let recommendation: Recommendation | null = null;
  
  if (validMetrics.length === 0) {
    // Fallback
    recommendation = {
      recommendedEngine: DEFAULT_ENGINES[assetType],
      recommendedPreset: DEFAULT_PRESETS[assetType],
      score: 0,
      confidence: 'low',
      basedOnRuns: 0,
      acceptRate: 0,
      avgRegenerations: 1,
      reason: 'Recomendación por defecto (historial insuficiente)'
    };
  } else {
    // Score and sort with style bias
    const scoredMetrics = validMetrics.map(m => ({
      ...m,
      score: calculateScore(m.acceptRate, m.avgRegenerationsChain, m.avgTimeToAccept, m.engine, phase, m.presetId, styleBias)
    }));
    scoredMetrics.sort((a, b) => b.score - a.score);
    
    const best = scoredMetrics[0];
    
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (best.totalRuns >= 20 && best.acceptRate >= 0.5) {
      confidence = 'high';
    } else if (best.totalRuns >= 10 || (best.totalRuns >= 5 && best.acceptRate >= 0.4)) {
      confidence = 'medium';
    }
    
    recommendation = {
      recommendedEngine: best.engine,
      recommendedPreset: best.presetId,
      score: best.score,
      confidence,
      basedOnRuns: best.totalRuns,
      acceptRate: best.acceptRate,
      avgRegenerations: best.avgRegenerationsChain,
      reason: `Aceptación ${(best.acceptRate * 100).toFixed(0)}% | Regens medias ${best.avgRegenerationsChain.toFixed(1)} | ${best.totalRuns} runs`
    };
  }

  // Build ordered presets with scores
  const orderedPresets: PresetWithMetrics[] = availablePresets.map(presetId => {
    const metrics = presetMetrics.find(m => m.presetId === presetId) || null;
    const engineMetric = engineMetrics.find(m => m.presetId === presetId);
    
    const hasLowData = !metrics || metrics.totalRuns < 5;
    const hasHighFriction = metrics ? metrics.avgRegenerationsChain >= 2.5 : false;
    const isRecommended = recommendation?.recommendedPreset === presetId;
    
    const score = metrics 
      ? calculateScore(metrics.acceptRate, metrics.avgRegenerationsChain, metrics.avgTimeToAccept, engineMetric?.engine, phase, presetId, styleBias)
      : -1;
    
    return {
      presetId,
      label: presetId,
      isRecommended,
      hasLowData,
      hasHighFriction,
      metrics,
      score
    };
  });

  // Sort: recommended first, then by score descending, unknowns last
  orderedPresets.sort((a, b) => {
    if (a.isRecommended) return -1;
    if (b.isRecommended) return 1;
    if (a.score === -1) return 1;
    if (b.score === -1) return -1;
    return b.score - a.score;
  });

  return {
    presetMetrics,
    engineMetrics,
    engineGlobalMetrics,
    recommendation,
    orderedPresets
  };
}

/**
 * Check if user selection differs from recommendation
 */
export function isOverride(
  selectedEngine: string,
  selectedPreset: string,
  recommendation: Recommendation | null
): boolean {
  if (!recommendation || recommendation.confidence === 'low') {
    return false;
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
  recommendation: Recommendation | null,
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
        chosenEngine: selectedEngine,
        chosenPreset: selectedPreset
      }
    });
  } catch (err) {
    console.error('[Recommendations] Error logging event:', err);
  }
}

/**
 * Format engine name for display
 */
export function formatEngineName(engine: string): string {
  if (engine === ENGINES.NANO_BANANA || engine.includes('nano')) {
    return 'Nano Banana';
  }
  if (engine === ENGINES.FLUX || engine.includes('flux')) {
    return 'FLUX Pro';
  }
  return engine;
}
