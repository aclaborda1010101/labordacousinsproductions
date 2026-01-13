export type ScriptTimingComplexity = 'simple' | 'medium' | 'high';

export interface ScriptTimingModelV2 {
  version: 2;
  outline_ms_per_episode: number;
  batch_ms_avg: number;  // Tiempo promedio por batch (5 escenas)
  samples_outline: number;
  samples_batch: number;
  updated_at: number;
}

const STORAGE_KEY = 'script_timing_model_v2';

const DEFAULT_MODEL: ScriptTimingModelV2 = {
  version: 2,
  outline_ms_per_episode: 1600,
  batch_ms_avg: 25000, // ~25s por batch de 5 escenas (conservador)
  samples_outline: 0,
  samples_batch: 0,
  updated_at: Date.now(),
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function getComplexityMultiplier(complexity: ScriptTimingComplexity): number {
  switch (complexity) {
    case 'simple':
      return 0.85;
    case 'high':
      return 1.25;
    case 'medium':
    default:
      return 1;
  }
}

export function loadScriptTimingModel(): ScriptTimingModelV2 {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 2) return DEFAULT_MODEL;

    return {
      ...DEFAULT_MODEL,
      ...parsed,
      outline_ms_per_episode: clamp(Number(parsed.outline_ms_per_episode ?? DEFAULT_MODEL.outline_ms_per_episode), 200, 60000),
      batch_ms_avg: clamp(Number(parsed.batch_ms_avg ?? DEFAULT_MODEL.batch_ms_avg), 5000, 120000),
      samples_outline: clamp(Number(parsed.samples_outline ?? 0), 0, 100000),
      samples_batch: clamp(Number(parsed.samples_batch ?? 0), 0, 100000),
      updated_at: Number(parsed.updated_at ?? Date.now()),
    };
  } catch {
    return DEFAULT_MODEL;
  }
}

export function saveScriptTimingModel(model: ScriptTimingModelV2) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...model, updated_at: Date.now() }));
  } catch {
    // ignore
  }
}

const ema = (prev: number, next: number, alpha: number) => alpha * next + (1 - alpha) * prev;

export function updateOutlineTiming(
  prev: ScriptTimingModelV2,
  params: { episodesCount: number; durationMs: number },
): ScriptTimingModelV2 {
  const alpha = 0.25;
  const perEpisode = params.durationMs / Math.max(1, params.episodesCount);
  const nextVal = clamp(perEpisode, 200, 60000);

  return {
    ...prev,
    outline_ms_per_episode: prev.samples_outline === 0 ? nextVal : ema(prev.outline_ms_per_episode, nextVal, alpha),
    samples_outline: prev.samples_outline + 1,
    updated_at: Date.now(),
  };
}

export function updateBatchTiming(
  prev: ScriptTimingModelV2,
  params: { durationMs: number; complexity: ScriptTimingComplexity },
): ScriptTimingModelV2 {
  const alpha = 0.3; // Aprende más rápido ya que es por batch
  const mult = getComplexityMultiplier(params.complexity);
  const normalizedMs = params.durationMs / mult;
  const nextVal = clamp(normalizedMs, 5000, 120000);

  return {
    ...prev,
    batch_ms_avg: prev.samples_batch === 0 ? nextVal : ema(prev.batch_ms_avg, nextVal, alpha),
    samples_batch: prev.samples_batch + 1,
    updated_at: Date.now(),
  };
}

// Legacy compatibility
export function updateEpisodeTiming(
  prev: ScriptTimingModelV2,
  params: { episodeDurationMin: number; complexity: ScriptTimingComplexity; durationMs: number },
): ScriptTimingModelV2 {
  // Convert to batch timing (3 batches per episode)
  const batchMs = params.durationMs / 3;
  return updateBatchTiming(prev, { durationMs: batchMs, complexity: params.complexity });
}

export function estimateOutlineMs(model: ScriptTimingModelV2, episodesCount: number) {
  return model.outline_ms_per_episode * Math.max(1, episodesCount);
}

export function estimateBatchMs(
  model: ScriptTimingModelV2,
  complexity: ScriptTimingComplexity,
) {
  const mult = getComplexityMultiplier(complexity);
  return model.batch_ms_avg * mult;
}

export function estimateEpisodeMs(
  model: ScriptTimingModelV2,
  params: { episodeDurationMin: number; complexity: ScriptTimingComplexity },
) {
  // 3 batches per episode
  return estimateBatchMs(model, params.complexity) * 3;
}

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `~${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `~${minutes}m ${seconds}s`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `~${hours}h ${remMin}m`;
}

/**
 * Estimate total script generation time for the full pipeline.
 * Includes episodes + dialogues + teasers + save overhead.
 */
export function estimateFullScriptMs(
  model: ScriptTimingModelV2,
  params: {
    episodesCount: number;
    batchesPerEpisode: number;
    complexity: ScriptTimingComplexity;
  }
): number {
  const { episodesCount, batchesPerEpisode, complexity } = params;
  const perBatchMs = estimateBatchMs(model, complexity);
  const totalBatches = episodesCount * batchesPerEpisode;
  
  // Episode generation: ~75% of total time
  const episodesMs = totalBatches * perBatchMs;
  
  // Dialogue generation: ~15% of total time (1 call per episode)
  const dialoguesMs = episodesCount * 8000; // ~8s per episode for dialogues
  
  // Teasers + save: ~10% overhead
  const overheadMs = 5000;
  
  return episodesMs + dialoguesMs + overheadMs;
}

/**
 * Calculate estimated remaining time based on current progress.
 */
export function estimateRemainingMs(
  model: ScriptTimingModelV2,
  params: {
    totalBatches: number;
    completedBatches: number;
    complexity: ScriptTimingComplexity;
    currentBatchStartedAt?: number;
    phase: 'episodes' | 'dialogues' | 'teasers' | 'save';
  }
): number {
  const { totalBatches, completedBatches, complexity, currentBatchStartedAt, phase } = params;
  const perBatchMs = estimateBatchMs(model, complexity);
  
  if (phase === 'save') return 2000;
  if (phase === 'teasers') return 4000;
  if (phase === 'dialogues') return 8000;
  
  // Episodes phase
  const remainingBatches = Math.max(0, totalBatches - completedBatches);
  const remainingBatchesMs = remainingBatches * perBatchMs;
  
  // Account for current batch progress
  const elapsedCurrent = currentBatchStartedAt 
    ? Math.max(0, Date.now() - currentBatchStartedAt) 
    : 0;
  const remainingCurrent = Math.max(0, perBatchMs - elapsedCurrent);
  
  // Add phases after episodes
  const dialoguesMs = Math.ceil(totalBatches / 3) * 8000; // Approx episodes
  const teasersMs = 4000;
  const saveMs = 2000;
  
  return remainingCurrent + (remainingBatches > 0 ? remainingBatchesMs - perBatchMs : 0) + dialoguesMs + teasersMs + saveMs;
}

// Export V2 as V1 for backwards compat
export type ScriptTimingModelV1 = ScriptTimingModelV2;
