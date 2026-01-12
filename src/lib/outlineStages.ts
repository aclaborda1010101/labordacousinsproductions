/**
 * outlineStages.ts - V9 with substages for fan-out/fan-in architecture
 */

export interface OutlineStageInfo {
  label: string;
  description: string;
  progressRange: [number, number];
  timeoutSeconds: number;
}

// Main stages
export const OUTLINE_STAGES: Record<string, OutlineStageInfo> = {
  summarize: {
    label: 'Analizando texto...',
    description: 'Procesando y resumiendo el contenido',
    progressRange: [0, 30],
    timeoutSeconds: 70, // Aligned with STAGE_TIMEOUT_MS
  },
  outline: {
    label: 'Construyendo estructura...',
    description: 'Diseñando episodios y arcos narrativos',
    progressRange: [30, 75],
    timeoutSeconds: 140, // 2x stage timeout for complex generation
  },
  merge: {
    label: 'Finalizando...',
    description: 'Validando calidad y normalizando',
    progressRange: [75, 95],
    timeoutSeconds: 40,
  },
  done: {
    label: 'Completado',
    description: 'Outline listo para revisar',
    progressRange: [95, 100],
    timeoutSeconds: 0,
  },
} as const;

// Substages for more granular progress tracking
export const OUTLINE_SUBSTAGES: Record<string, { label: string; progressOffset: number }> = {
  // Summarize substages
  processing: { label: 'Procesando texto...', progressOffset: 10 },
  
  // Outline substages (fan-out)
  arc: { label: 'Generando arco de temporada...', progressOffset: 35 },
  episodes_1: { label: 'Generando episodios (parte 1)...', progressOffset: 50 },
  episodes_2: { label: 'Generando episodios (parte 2)...', progressOffset: 65 },
  generating: { label: 'Generando outline completo...', progressOffset: 45 },
  
  // Merge substages
  qc: { label: 'Validando calidad...', progressOffset: 85 },
  normalizing: { label: 'Normalizando datos...', progressOffset: 90 },
};

/**
 * Get stage info with fallback to summarize stage
 */
export function getStageInfo(stage: string | null | undefined): OutlineStageInfo {
  if (!stage) return OUTLINE_STAGES.summarize;
  return OUTLINE_STAGES[stage] || OUTLINE_STAGES.summarize;
}

/**
 * Get substage label for display
 */
export function getSubstageLabel(substage: string | null | undefined): string | null {
  if (!substage) return null;
  return OUTLINE_SUBSTAGES[substage]?.label || null;
}

/**
 * Derive progress percentage from stage, substage, and raw progress
 */
export function deriveProgress(
  stage: string | null | undefined, 
  rawProgress: number | null | undefined,
  substage?: string | null
): number {
  // If we have raw progress, use it directly
  if (rawProgress !== null && rawProgress !== undefined && rawProgress > 0) {
    return Math.min(100, Math.max(0, rawProgress));
  }
  
  // If we have a substage, use its offset
  if (substage && OUTLINE_SUBSTAGES[substage]) {
    return OUTLINE_SUBSTAGES[substage].progressOffset;
  }
  
  // Otherwise use stage minimum
  const info = getStageInfo(stage);
  return info.progressRange[0];
}

/**
 * Get timeout for a specific stage in seconds
 */
export function getStageTimeout(stage: string | null | undefined): number {
  return getStageInfo(stage).timeoutSeconds;
}
