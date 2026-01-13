/**
 * EXTRACTION QC V1 - Gating determinista para validar extracción de guiones
 * Sin LLM - solo validación estructural
 */

export type ExtractionQuality = 'excellent' | 'good' | 'degraded' | 'rejected';

export interface ExtractionQCResult {
  passed: boolean;
  quality: ExtractionQuality;
  blockers: string[];
  warnings: string[];
  score: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function isNonEmptyStr(v: any, minLen = 1): boolean {
  return typeof v === 'string' && v.trim().length >= minLen;
}

function isNonEmptyArr(v: any, minLen = 1): boolean {
  return Array.isArray(v) && v.length >= minLen;
}

// =============================================================================
// MAIN QC FUNCTION
// =============================================================================

export function runExtractionQC(extraction: any, expectedFormat: 'film' | 'series' = 'series'): ExtractionQCResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // ==========================================================================
  // BLOCKERS (impiden continuar)
  // ==========================================================================
  
  // 1. Scene count validation
  const scenes = extraction?.scenes || [];
  const minScenes = expectedFormat === 'film' ? 20 : 5;
  if (scenes.length < minScenes) {
    blockers.push(`SCENES:${scenes.length}/${minScenes}_minimum`);
    score -= 30;
  }

  // 2. Characters count
  const characters = extraction?.characters || [];
  if (characters.length < 2) {
    blockers.push(`CHARACTERS:${characters.length}/2_minimum`);
    score -= 20;
  }

  // 3. Scenes without slugline (>20% = problem)
  const scenesNoSlugline = scenes.filter((s: any) => !isNonEmptyStr(s.slugline_raw, 5));
  if (scenes.length > 0 && scenesNoSlugline.length > scenes.length * 0.2) {
    blockers.push(`SCENES_NO_SLUGLINE:${scenesNoSlugline.length}/${scenes.length}`);
    score -= 15;
  }

  // 4. Characters without valid names
  const charsNoName = characters.filter((c: any) => !isNonEmptyStr(c.name, 2));
  if (charsNoName.length > 0) {
    blockers.push(`CHARACTERS_INVALID_NAMES:${charsNoName.length}`);
    score -= 10;
  }

  // ==========================================================================
  // WARNINGS (no bloquean, pero degradan calidad)
  // ==========================================================================
  
  // 1. Threads validation (for series)
  const threads = extraction?.threads || [];
  if (expectedFormat === 'series') {
    if (threads.length < 3) {
      warnings.push(`THREADS:${threads.length}/3_minimum_for_series`);
      score -= 5;
    }
    if (threads.length > 8) {
      warnings.push(`THREADS:${threads.length}/8_maximum_exceeded`);
      score -= 3;
    }
  }

  // 2. Threads without evidence
  const threadsNoEvidence = threads.filter((t: any) => !isNonEmptyArr(t.evidence_scenes, 2));
  if (threadsNoEvidence.length > 0) {
    warnings.push(`THREADS_NO_EVIDENCE:${threadsNoEvidence.length}`);
    score -= 5;
  }

  // 3. Ambiguous aliases (too many aliases per character)
  const aliasCount = characters.reduce((sum: number, c: any) => sum + (c.aliases?.length || 0), 0);
  if (aliasCount > characters.length * 2) {
    warnings.push(`ALIAS_OVERFLOW:${aliasCount}_aliases_for_${characters.length}_characters`);
    score -= 3;
  }

  // 4. Locations with too many variants
  const locations = extraction?.locations || [];
  const locationsHighVariants = locations.filter((l: any) => (l.variants?.length || 0) > 10);
  if (locationsHighVariants.length > 0) {
    warnings.push(`LOCATIONS_HIGH_VARIANTS:${locationsHighVariants.length}`);
    score -= 2;
  }

  // 5. Characters without dialogue (silent characters >50% = unusual)
  const charsNoDialogue = characters.filter((c: any) => !c.dialogue_lines || c.dialogue_lines === 0);
  if (characters.length > 0 && charsNoDialogue.length > characters.length * 0.5) {
    warnings.push(`CHARACTERS_NO_DIALOGUE:${charsNoDialogue.length}/${characters.length}`);
    score -= 3;
  }

  // 6. Main characters without sufficient scenes
  const mainChars = characters.filter((c: any) => c.type === 'main');
  const mainCharsLowScenes = mainChars.filter((c: any) => (c.scenes_count || 0) < 3);
  if (mainCharsLowScenes.length > 0) {
    warnings.push(`MAIN_CHARS_LOW_SCENES:${mainCharsLowScenes.length}`);
    score -= 2;
  }

  // 7. Props validation (optional, but if present should be valid)
  const props = extraction?.props || [];
  const propsInvalid = props.filter((p: any) => !isNonEmptyStr(p.name, 2));
  if (propsInvalid.length > props.length * 0.3) {
    warnings.push(`PROPS_INVALID:${propsInvalid.length}/${props.length}`);
    score -= 2;
  }

  // 8. Scene summaries (if mostly empty, it's a warning)
  const scenesNoSummary = scenes.filter((s: any) => !isNonEmptyStr(s.summary, 10));
  if (scenes.length > 0 && scenesNoSummary.length > scenes.length * 0.7) {
    warnings.push(`SCENES_NO_SUMMARY:${scenesNoSummary.length}/${scenes.length}`);
    score -= 2;
  }

  // ==========================================================================
  // SCORE NORMALIZATION & QUALITY DETERMINATION
  // ==========================================================================
  
  score = Math.max(0, Math.min(100, score));

  let quality: ExtractionQuality = 'excellent';
  if (blockers.length > 0) {
    quality = score >= 60 ? 'degraded' : 'rejected';
  } else if (warnings.length > 0) {
    quality = score >= 85 ? 'good' : 'degraded';
  }

  return {
    passed: blockers.length === 0,
    quality,
    blockers,
    warnings,
    score,
  };
}

// =============================================================================
// NEEDS CHECKERS (for UI conditional display)
// =============================================================================

export function needsThreads(extraction: any): boolean {
  const threads = extraction?.threads || [];
  if (threads.length < 3) return true;
  
  // Check if threads have evidence
  const threadsWithEvidence = threads.filter((t: any) => 
    Array.isArray(t.evidence_scenes) && t.evidence_scenes.length >= 2
  );
  return threadsWithEvidence.length < 3;
}

export function needsCharacterEnrichment(extraction: any): boolean {
  const characters = extraction?.characters || [];
  if (characters.length < 2) return true;
  
  // Check if main characters have proper data
  const mainChars = characters.filter((c: any) => c.type === 'main');
  return mainChars.length < 1 || mainChars.some((c: any) => !c.scenes_count);
}

export function needsLocationNormalization(extraction: any): boolean {
  const locations = extraction?.locations || [];
  
  // Check for too many variants
  const totalVariants = locations.reduce((sum: number, l: any) => sum + (l.variants?.length || 0), 0);
  return totalVariants > locations.length * 3;
}

// =============================================================================
// MERGE QC FROM CHUNKS
// =============================================================================

export function mergeChunkQCResults(chunkResults: any[]): ExtractionQCResult {
  const allBlockers: string[] = [];
  const allWarnings: string[] = [];
  let totalScore = 0;
  let successfulChunks = 0;

  for (const result of chunkResults) {
    if (result?.qc) {
      allBlockers.push(...(result.qc.blockers || []).map((b: string) => `${result.chunk_id}:${b}`));
      allWarnings.push(...(result.qc.warnings || []).map((w: string) => `${result.chunk_id}:${w}`));
      totalScore += result.qc.score || 0;
      successfulChunks++;
    }
  }

  const avgScore = successfulChunks > 0 ? Math.round(totalScore / successfulChunks) : 0;
  
  // Check for chunk failures
  const failedChunks = chunkResults.filter(r => !r || r.error);
  if (failedChunks.length > chunkResults.length * 0.3) {
    allBlockers.push(`CHUNK_FAILURES:${failedChunks.length}/${chunkResults.length}`);
  }

  let quality: ExtractionQuality = 'excellent';
  if (allBlockers.length > 0) {
    quality = avgScore >= 60 ? 'degraded' : 'rejected';
  } else if (allWarnings.length > 0) {
    quality = avgScore >= 85 ? 'good' : 'degraded';
  }

  return {
    passed: allBlockers.length === 0,
    quality,
    blockers: [...new Set(allBlockers)], // Dedupe
    warnings: [...new Set(allWarnings)],
    score: avgScore,
  };
}
