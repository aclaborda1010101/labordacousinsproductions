/**
 * outlineStages.ts - Helper for mapping outline generation stages to user-friendly info
 */

export interface OutlineStageInfo {
  label: string;
  description: string;
  progressRange: [number, number];
  timeoutSeconds: number;
}

export const OUTLINE_STAGES: Record<string, OutlineStageInfo> = {
  summarize: {
    label: 'Analizando texto...',
    description: 'Procesando y resumiendo el contenido',
    progressRange: [0, 30],
    timeoutSeconds: 90,
  },
  outline: {
    label: 'Construyendo estructura...',
    description: 'Diseñando episodios y arcos narrativos',
    progressRange: [30, 80],
    timeoutSeconds: 180,
  },
  merge: {
    label: 'Finalizando...',
    description: 'Normalizando y validando outline',
    progressRange: [80, 95],
    timeoutSeconds: 60,
  },
  done: {
    label: 'Completado',
    description: 'Outline listo para revisar',
    progressRange: [95, 100],
    timeoutSeconds: 0,
  },
} as const;

/**
 * Get stage info with fallback to summarize stage
 */
export function getStageInfo(stage: string | null | undefined): OutlineStageInfo {
  if (!stage) return OUTLINE_STAGES.summarize;
  return OUTLINE_STAGES[stage] || OUTLINE_STAGES.summarize;
}

/**
 * Derive progress percentage from stage and raw progress
 * If rawProgress is available and > 0, use it directly
 * Otherwise, return the minimum of the stage's progress range
 */
export function deriveProgress(stage: string | null | undefined, rawProgress: number | null | undefined): number {
  if (rawProgress !== null && rawProgress !== undefined && rawProgress > 0) {
    return Math.min(100, Math.max(0, rawProgress));
  }
  const info = getStageInfo(stage);
  return info.progressRange[0];
}

/**
 * Get timeout for a specific stage in seconds
 */
export function getStageTimeout(stage: string | null | undefined): number {
  return getStageInfo(stage).timeoutSeconds;
}
