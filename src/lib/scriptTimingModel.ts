export type ScriptTimingComplexity = 'simple' | 'medium' | 'high';

export interface ScriptTimingModelV1 {
  version: 1;
  outline_ms_per_episode: number;
  episode_ms_per_minute: number;
  samples_outline: number;
  samples_episode: number;
  updated_at: number;
}

const STORAGE_KEY = 'script_timing_model_v1';

const DEFAULT_MODEL: ScriptTimingModelV1 = {
  version: 1,
  // Outline suele ser rápido; lo aproximamos por episodio para escalar con N episodios.
  outline_ms_per_episode: 1600,
  // Tiempo por minuto de duración objetivo del episodio (se ajusta con “aprendizaje”).
  // Default conservador: ~90s para un episodio de 45 min.
  episode_ms_per_minute: 2000,
  samples_outline: 0,
  samples_episode: 0,
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

export function loadScriptTimingModel(): ScriptTimingModelV1 {
  if (typeof window === 'undefined') return DEFAULT_MODEL;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MODEL;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1) return DEFAULT_MODEL;

    return {
      ...DEFAULT_MODEL,
      ...parsed,
      outline_ms_per_episode: clamp(Number(parsed.outline_ms_per_episode ?? DEFAULT_MODEL.outline_ms_per_episode), 200, 30000),
      episode_ms_per_minute: clamp(Number(parsed.episode_ms_per_minute ?? DEFAULT_MODEL.episode_ms_per_minute), 200, 60000),
      samples_outline: clamp(Number(parsed.samples_outline ?? 0), 0, 100000),
      samples_episode: clamp(Number(parsed.samples_episode ?? 0), 0, 100000),
      updated_at: Number(parsed.updated_at ?? Date.now()),
    };
  } catch {
    return DEFAULT_MODEL;
  }
}

export function saveScriptTimingModel(model: ScriptTimingModelV1) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...model, updated_at: Date.now() }));
  } catch {
    // ignore
  }
}

const ema = (prev: number, next: number, alpha: number) => alpha * next + (1 - alpha) * prev;

export function updateOutlineTiming(
  prev: ScriptTimingModelV1,
  params: { episodesCount: number; durationMs: number },
): ScriptTimingModelV1 {
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

export function updateEpisodeTiming(
  prev: ScriptTimingModelV1,
  params: { episodeDurationMin: number; complexity: ScriptTimingComplexity; durationMs: number },
): ScriptTimingModelV1 {
  const alpha = 0.25;
  const mult = getComplexityMultiplier(params.complexity);
  const perMinute = params.durationMs / Math.max(1, params.episodeDurationMin) / mult;
  const nextVal = clamp(perMinute, 200, 60000);

  return {
    ...prev,
    episode_ms_per_minute: prev.samples_episode === 0 ? nextVal : ema(prev.episode_ms_per_minute, nextVal, alpha),
    samples_episode: prev.samples_episode + 1,
    updated_at: Date.now(),
  };
}

export function estimateOutlineMs(model: ScriptTimingModelV1, episodesCount: number) {
  return model.outline_ms_per_episode * Math.max(1, episodesCount);
}

export function estimateEpisodeMs(
  model: ScriptTimingModelV1,
  params: { episodeDurationMin: number; complexity: ScriptTimingComplexity },
) {
  const mult = getComplexityMultiplier(params.complexity);
  return model.episode_ms_per_minute * Math.max(1, params.episodeDurationMin) * mult;
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
