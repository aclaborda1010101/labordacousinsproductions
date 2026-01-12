/**
 * outlineStages.ts - V10 Industrial Pipeline with 4 Substeps
 * 
 * Architecture:
 * - PART_A: arc, cast, locations, rules (35-50%)
 * - PART_B: episodes 1-5 (55-68%)
 * - PART_C: episodes 6-10 (72-82%)
 * - MERGE+QC: unify + validate (85-100%)
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
    timeoutSeconds: 70,
  },
  outline: {
    label: 'Construyendo estructura...',
    description: 'Diseñando episodios y arcos narrativos',
    progressRange: [30, 85],
    timeoutSeconds: 200, // 4 substeps × ~50s each
  },
  merge: {
    label: 'Finalizando...',
    description: 'Validando calidad y normalizando',
    progressRange: [85, 100],
    timeoutSeconds: 30,
  },
  done: {
    label: 'Completado',
    description: 'Outline listo para revisar',
    progressRange: [100, 100],
    timeoutSeconds: 0,
  },
} as const;

// Substages for granular progress tracking (V10: 4-substep pipeline)
export const OUTLINE_SUBSTAGES: Record<string, { label: string; progressOffset: number }> = {
  // Summarize substages
  processing: { label: 'Procesando texto...', progressOffset: 15 },
  
  // Outline substages (fan-out: PART_A, PART_B, PART_C)
  arc: { label: 'Generando arco de temporada...', progressOffset: 40 },
  episodes_1: { label: 'Generando episodios 1-5...', progressOffset: 58 },
  episodes_2: { label: 'Generando episodios 6-10...', progressOffset: 75 },
  
  // Merge substages
  merging: { label: 'Unificando partes...', progressOffset: 85 },
  qc: { label: 'Validando calidad...', progressOffset: 92 },
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
