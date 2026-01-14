/**
 * SCRIPT QC V11.2 - Structural Validation of Generated Scripts
 * 
 * Validates that a generated script adheres to its episode contract.
 * This is POST-GENERATION validation - the script must have executed
 * all structural contracts from the outline.
 * 
 * V11.1: Added density validation post-generation
 * V11.2: Added batch-level validation and repair prompt generation
 */

import type { EpisodeContract, TurningPointContract, ThreadContract } from "./episode-contracts.ts";
import { validateScriptDensity, type DensityProfile, type PostScriptDensityResult } from "./density-validator.ts";
import type { BatchPlan, BatchResult } from "./batch-planner.ts";

// ============================================================================
// QC RESULT TYPES
// ============================================================================

export interface ScriptQCResult {
  passed: boolean;
  score: number; // 0-100
  quality: 'excellent' | 'good' | 'acceptable' | 'poor' | 'failed';
  
  threads_coverage: {
    required: number;
    found: number;
    coverage_percent: number;
    missing: string[];
    details: Array<{ thread_id: string; found: boolean; mentions: number }>;
  };
  
  turning_points_executed: {
    required: number;
    executed: number;
    coverage_percent: number;
    missing: string[];
    details: Array<{ tp: number; agent_found: boolean; event_found: boolean; consequence_found: boolean }>;
  };
  
  cliffhanger_match: {
    present: boolean;
    type_match: boolean;
    description_similarity: number;
  };
  
  characters_coverage: {
    required: number;
    found: number;
    missing: string[];
  };
  
  setpiece_executed: {
    name_match: boolean;
    participants_present: number;
    stakes_mentioned: boolean;
  };
  
  faction_violations: string[];
  
  // V11.1: Density validation
  density_check?: PostScriptDensityResult;
  
  // V11.3: Scene depth validation
  scene_depth_issues: string[];
  
  blockers: string[];
  warnings: string[];
}

// ============================================================================
// BATCH-LEVEL VALIDATION (V11.2)
// ============================================================================

export interface BatchValidationResult {
  passed: boolean;
  blockers: string[];
  warnings: string[];
  canRepair: boolean;           // If failed, can we try repair?
  repairPriority: string[];     // What to prioritize in repair
}

/**
 * Validate a batch result against its assigned plan.
 * This is the HARD CONSTRAINT check - batch MUST fulfill its contract.
 */
export function validateBatchAgainstPlan(
  batchResult: BatchResult | Record<string, unknown>,
  plan: BatchPlan
): BatchValidationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const repairPriority: string[] = [];
  
  // Extract declared coverage from batch result
  const declaredThreads = (batchResult.threads_advanced as string[]) || [];
  const declaredTPs = (batchResult.turning_points_executed as string[]) || [];
  const declaredChars = (batchResult.characters_appeared as string[]) || [];
  const scenes = (batchResult.scenes as any[]) || [];
  
  // 1. Check threads coverage
  if (plan.requiredThreads.length > 0) {
    const coveredThreads = plan.requiredThreads.filter(t => 
      declaredThreads.some(dt => 
        dt.toLowerCase().includes(t.toLowerCase()) || 
        t.toLowerCase().includes(dt.toLowerCase())
      )
    );
    
    if (coveredThreads.length === 0) {
      blockers.push(`BATCH_CONTRACT: Ningún thread cubierto (requeridos: ${plan.requiredThreads.join(', ')})`);
      repairPriority.push(`thread:${plan.requiredThreads[0]}`);
    } else if (coveredThreads.length < plan.requiredThreads.length) {
      warnings.push(`THREADS: ${coveredThreads.length}/${plan.requiredThreads.length} cubiertos`);
    }
  }
  
  // 2. Check turning points coverage
  if (plan.requiredTurningPoints.length > 0) {
    const coveredTPs = plan.requiredTurningPoints.filter(tp =>
      declaredTPs.some(dtp => 
        dtp.toLowerCase().includes(tp.toLowerCase()) || 
        tp.toLowerCase().includes(dtp.toLowerCase())
      )
    );
    
    if (coveredTPs.length === 0) {
      blockers.push(`BATCH_CONTRACT: Ningún TP ejecutado (requeridos: ${plan.requiredTurningPoints.join(', ')})`);
      repairPriority.push(`tp:${plan.requiredTurningPoints[0]}`);
    } else if (coveredTPs.length < plan.requiredTurningPoints.length) {
      warnings.push(`TPS: ${coveredTPs.length}/${plan.requiredTurningPoints.length} ejecutados`);
    }
  }
  
  // 3. Check characters coverage (warning only, not blocker)
  if (plan.requiredCharacters.length > 0) {
    const coveredChars = plan.requiredCharacters.filter(c =>
      declaredChars.some(dc => dc.toLowerCase() === c.toLowerCase()) ||
      scenes.some((s: any) => 
        s.characters_present?.some((cp: any) => 
          (cp.name || cp).toLowerCase() === c.toLowerCase()
        )
      )
    );
    
    if (coveredChars.length < plan.requiredCharacters.length) {
      const missing = plan.requiredCharacters.filter(c => 
        !coveredChars.map(cc => cc.toLowerCase()).includes(c.toLowerCase())
      );
      warnings.push(`PERSONAJES: Faltan ${missing.join(', ')}`);
    }
  }
  
  // 4. Check cliffhanger if required (last batch)
  if (plan.mustIncludeCliffhanger && scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    const hasCliffhangerMarker = 
      lastScene?.conflict?.toLowerCase().includes('cliffhanger') ||
      lastScene?.mood?.toLowerCase().includes('suspense') ||
      lastScene?.raw_content?.toLowerCase().includes('continuará') ||
      lastScene?.raw_content?.toLowerCase().includes('to be continued');
    
    if (!hasCliffhangerMarker) {
      warnings.push('CLIFFHANGER: No detectado en última escena del episodio');
    }
  }
  
  // 5. Check scene count
  if (scenes.length < plan.sceneCount - 1) {
    warnings.push(`ESCENAS: Solo ${scenes.length}/${plan.sceneCount} generadas`);
  }
  
  // Determine if repair is possible
  const canRepair = blockers.length > 0 && blockers.length <= 2;
  
  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    canRepair,
    repairPriority
  };
}

/**
 * Build a repair prompt for a batch that failed contract validation.
 */
export function buildRepairPrompt(
  failedBatch: BatchResult | Record<string, unknown>,
  plan: BatchPlan,
  blockers: string[]
): string {
  const scenes = (failedBatch.scenes as any[]) || [];
  const scenesSummary = scenes.slice(0, 4).map((s: any) => 
    `  - ${s.slugline || 'Sin slugline'}: ${(s.action_summary || '').slice(0, 100)}`
  ).join('\n') || '  (sin escenas)';
  
  return `
═══════════════════════════════════════════════════════════════
🔧 REPAIR MODE - REESCRIBIR BATCH FALLIDO
═══════════════════════════════════════════════════════════════

El batch anterior FALLÓ el contrato. Debes REESCRIBIRLO.

❌ FALLOS DETECTADOS:
${blockers.map(b => `   • ${b}`).join('\n')}

📝 ESCENAS A REESCRIBIR (mantener continuidad):
${scenesSummary}

🎯 OBJETIVO DE LA REESCRITURA:
- Mantener mismos personajes y localizaciones
- Mantener continuidad de acciones ya establecidas
${plan.requiredThreads.length > 0 ? `- INSERTAR beat del thread: ${plan.requiredThreads[0]}` : ''}
${plan.requiredTurningPoints.length > 0 ? `- EJECUTAR turning point: ${plan.requiredTurningPoints[0]}` : ''}

📋 INSTRUCCIONES:
1. NO añadas escenas nuevas - reescribe las ${scenes.length || 4} existentes
2. Mantén sluglines y localizaciones similares
3. Introduce un beat explícito del thread requerido en acción o diálogo
4. Cierra con consecuencia ligada al turning point
5. Declara cumplimiento en JSON final

📤 Devuelve JSON con:
- scenes: [...escenas reescritas con thread/TP integrados...]
- threads_advanced: [...]
- turning_points_executed: [...]
- characters_appeared: [...]

⚠️ NO justifiques, NO expliques. Solo reescribe.
═══════════════════════════════════════════════════════════════`;
}

// ============================================================================
// HELPERS
// ============================================================================

function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textContains(haystack: string, needle: string, fuzzyThreshold = 0.7): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  
  // Exact substring match
  if (h.includes(n)) return true;
  
  // Word-by-word partial match for longer strings
  if (n.length > 15) {
    const needleWords = n.split(' ').filter(w => w.length > 3);
    const matchedWords = needleWords.filter(word => h.includes(word));
    return matchedWords.length / needleWords.length >= fuzzyThreshold;
  }
  
  return false;
}

function countMentions(text: string, terms: string[]): number {
  const normalized = normalizeText(text);
  let count = 0;
  for (const term of terms) {
    const termNorm = normalizeText(term);
    const regex = new RegExp(termNorm.replace(/\s+/g, '\\s*'), 'gi');
    const matches = normalized.match(regex);
    count += matches?.length || 0;
  }
  return count;
}

function extractScriptFullText(script: Record<string, unknown>): string {
  const parts: string[] = [];
  
  // Synopsis
  if (script.synopsis) parts.push(script.synopsis as string);
  
  // Scenes
  const scenes = script.scenes as Array<Record<string, unknown>> || [];
  for (const scene of scenes) {
    if (scene.slugline) parts.push(scene.slugline as string);
    if (scene.action_summary) parts.push(scene.action_summary as string);
    if (scene.raw_content) parts.push(scene.raw_content as string);
    
    // Dialogue
    const dialogue = scene.dialogue as Array<Record<string, unknown>> || [];
    for (const d of dialogue) {
      if (d.character) parts.push(d.character as string);
      if (d.line) parts.push(d.line as string);
    }
    
    // Characters present
    const chars = scene.characters_present as Array<Record<string, unknown>> || [];
    for (const c of chars) {
      if (c.name) parts.push(c.name as string);
    }
  }
  
  return parts.join(' ');
}

// ============================================================================
// THREAD COVERAGE VALIDATION
// ============================================================================

function validateThreadsCoverage(
  scriptText: string,
  threads: ThreadContract[]
): ScriptQCResult['threads_coverage'] {
  const details: Array<{ thread_id: string; found: boolean; mentions: number }> = [];
  const missing: string[] = [];
  let found = 0;
  
  for (const thread of threads) {
    // Search for thread-related terms
    const searchTerms = [
      thread.question,
      thread.engine,
      thread.stake,
      thread.id
    ].filter(Boolean);
    
    const mentions = countMentions(scriptText, searchTerms);
    const isFound = mentions >= 2 || textContains(scriptText, thread.question);
    
    details.push({
      thread_id: thread.id,
      found: isFound,
      mentions
    });
    
    if (isFound) {
      found++;
    } else {
      missing.push(`${thread.id}: "${thread.question.substring(0, 50)}..."`);
    }
  }
  
  return {
    required: threads.length,
    found,
    coverage_percent: threads.length > 0 ? Math.round((found / threads.length) * 100) : 100,
    missing,
    details
  };
}

// ============================================================================
// TURNING POINTS VALIDATION
// ============================================================================

function validateTurningPoints(
  scriptText: string,
  turningPoints: TurningPointContract[]
): ScriptQCResult['turning_points_executed'] {
  const details: Array<{ tp: number; agent_found: boolean; event_found: boolean; consequence_found: boolean }> = [];
  const missing: string[] = [];
  let executed = 0;
  
  for (const tp of turningPoints) {
    const agentFound = textContains(scriptText, tp.agent);
    const eventFound = textContains(scriptText, tp.event, 0.6);
    const consequenceFound = tp.consequence ? textContains(scriptText, tp.consequence, 0.5) : true;
    
    // TP is executed if agent + event are present
    const isExecuted = agentFound && eventFound;
    
    details.push({
      tp: tp.tp,
      agent_found: agentFound,
      event_found: eventFound,
      consequence_found: consequenceFound
    });
    
    if (isExecuted) {
      executed++;
    } else {
      const missingParts: string[] = [];
      if (!agentFound) missingParts.push(`agente "${tp.agent}"`);
      if (!eventFound) missingParts.push(`evento "${tp.event.substring(0, 30)}..."`);
      missing.push(`TP${tp.tp}: falta ${missingParts.join(' y ')}`);
    }
  }
  
  return {
    required: turningPoints.length,
    executed,
    coverage_percent: turningPoints.length > 0 ? Math.round((executed / turningPoints.length) * 100) : 100,
    missing,
    details
  };
}

// ============================================================================
// CLIFFHANGER VALIDATION
// ============================================================================

function validateCliffhanger(
  script: Record<string, unknown>,
  contract: EpisodeContract
): ScriptQCResult['cliffhanger_match'] {
  const scenes = script.scenes as Array<Record<string, unknown>> || [];
  const lastScene = scenes[scenes.length - 1];
  
  if (!lastScene) {
    return { present: false, type_match: false, description_similarity: 0 };
  }
  
  const lastSceneText = [
    lastScene.raw_content,
    lastScene.action_summary,
    lastScene.mood,
    lastScene.conflict
  ].filter(Boolean).join(' ');
  
  // Check if cliffhanger description is present in last scene
  const descriptionMatch = textContains(lastSceneText, contract.cliffhanger.description, 0.5);
  
  // Check type indicators
  const typeIndicators: Record<string, string[]> = {
    revelation: ['revela', 'descubre', 'aparece', 'verdad', 'secreto'],
    danger: ['peligro', 'amenaza', 'muerte', 'ataque', 'riesgo'],
    decision: ['decide', 'elección', 'dilema', 'elegir', 'optar'],
    arrival: ['llega', 'aparece', 'entra', 'viene', 'regresa'],
    betrayal: ['traición', 'traiciona', 'engaña', 'miente', 'falso']
  };
  
  const expectedIndicators = typeIndicators[contract.cliffhanger.type] || [];
  const typeMatch = expectedIndicators.some(ind => textContains(lastSceneText, ind));
  
  // Calculate similarity score
  let similarity = 0;
  if (descriptionMatch) similarity += 50;
  if (typeMatch) similarity += 30;
  if (lastSceneText.length > 100) similarity += 20; // Has substantial content
  
  return {
    present: lastSceneText.length > 50,
    type_match: typeMatch,
    description_similarity: similarity
  };
}

// ============================================================================
// CHARACTERS COVERAGE VALIDATION
// ============================================================================

function validateCharactersCoverage(
  scriptText: string,
  characters: string[]
): ScriptQCResult['characters_coverage'] {
  const missing: string[] = [];
  let found = 0;
  
  for (const char of characters) {
    if (textContains(scriptText, char)) {
      found++;
    } else {
      missing.push(char);
    }
  }
  
  return {
    required: characters.length,
    found,
    missing
  };
}

// ============================================================================
// SETPIECE VALIDATION
// ============================================================================

function validateSetpiece(
  scriptText: string,
  contract: EpisodeContract
): ScriptQCResult['setpiece_executed'] {
  const setpiece = contract.setpiece;
  
  const nameMatch = textContains(scriptText, setpiece.name, 0.6);
  
  let participantsPresent = 0;
  for (const p of setpiece.participants) {
    if (textContains(scriptText, p)) participantsPresent++;
  }
  
  const stakesMentioned = textContains(scriptText, setpiece.stakes, 0.5);
  
  return {
    name_match: nameMatch,
    participants_present: participantsPresent,
    stakes_mentioned: stakesMentioned
  };
}

// ============================================================================
// FACTION RULES VALIDATION
// ============================================================================

function validateFactionRules(
  scriptText: string,
  contract: EpisodeContract
): string[] {
  const violations: string[] = [];
  
  for (const faction of contract.factions_in_play) {
    // Check if faction's red_line is violated
    if (faction.red_line) {
      // If the red_line action appears in the script, it's a violation
      if (textContains(scriptText, faction.red_line, 0.7)) {
        violations.push(`${faction.name}: violó red_line "${faction.red_line.substring(0, 40)}..."`);
      }
    }
  }
  
  return violations;
}

// ============================================================================
// V11.3: SCENE DEPTH VALIDATION
// ============================================================================

const MINIMUM_RAW_CONTENT_LENGTH = 300; // ~6-8 lines of rich description
const MINIMUM_ACTION_SUMMARY_LENGTH = 80; // At least 1-2 sentences

/**
 * Validate that scenes have sufficient depth (not just placeholders).
 * Returns list of issues for scenes that are too shallow.
 */
function validateSceneDepth(script: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const scenes = script.scenes as Array<Record<string, unknown>> || [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneNum = scene.scene_number || (i + 1);
    const rawContent = (scene.raw_content as string) || '';
    const actionSummary = (scene.action_summary as string) || '';
    const slugline = (scene.slugline as string) || '';
    
    // Check raw_content depth
    if (rawContent.length < MINIMUM_RAW_CONTENT_LENGTH) {
      issues.push(`Scene ${sceneNum} raw_content too shallow: ${rawContent.length}/${MINIMUM_RAW_CONTENT_LENGTH} chars`);
    }
    
    // Check action_summary depth
    if (actionSummary.length < MINIMUM_ACTION_SUMMARY_LENGTH) {
      issues.push(`Scene ${sceneNum} action_summary too short: ${actionSummary.length}/${MINIMUM_ACTION_SUMMARY_LENGTH} chars`);
    }
    
    // Check for vague placeholder patterns
    const vaguePatterns = [
      'por generar',
      'placeholder',
      'tbd',
      'to be determined',
      'pendiente',
      'ver outline',
      'según outline'
    ];
    
    const combinedText = (slugline + ' ' + actionSummary + ' ' + rawContent).toLowerCase();
    for (const pattern of vaguePatterns) {
      if (combinedText.includes(pattern)) {
        issues.push(`Scene ${sceneNum} contains placeholder pattern: "${pattern}"`);
        break;
      }
    }
  }
  
  return issues;
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

/**
 * Validate a generated script against its episode contract.
 * Returns detailed QC results with pass/fail status.
 */
export function validateScriptAgainstContract(
  script: Record<string, unknown>,
  contract: EpisodeContract
): ScriptQCResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // Extract full text for analysis
  const scriptText = extractScriptFullText(script);
  
  if (scriptText.length < 500) {
    blockers.push('SCRIPT_TOO_SHORT: menos de 500 caracteres');
    score -= 50;
  }
  
  // 1. Validate threads coverage
  const threadsCoverage = validateThreadsCoverage(scriptText, contract.threads_required);
  if (threadsCoverage.coverage_percent < 50) {
    blockers.push(`THREADS: ${threadsCoverage.found}/${threadsCoverage.required} (${threadsCoverage.coverage_percent}%)`);
    score -= 25;
  } else if (threadsCoverage.coverage_percent < 80) {
    warnings.push(`THREADS: ${threadsCoverage.found}/${threadsCoverage.required} threads cubiertos`);
    score -= 10;
  }
  
  // 2. Validate turning points
  const tpExecuted = validateTurningPoints(scriptText, contract.turning_points);
  if (tpExecuted.coverage_percent < 50) {
    blockers.push(`TURNING_POINTS: ${tpExecuted.executed}/${tpExecuted.required} ejecutados`);
    score -= 25;
  } else if (tpExecuted.coverage_percent < 75) {
    warnings.push(`TURNING_POINTS: ${tpExecuted.executed}/${tpExecuted.required} ejecutados`);
    score -= 10;
  }
  
  // 3. Validate cliffhanger
  const cliffhangerMatch = validateCliffhanger(script, contract);
  if (!cliffhangerMatch.present) {
    blockers.push('CLIFFHANGER: no detectado en última escena');
    score -= 15;
  } else if (cliffhangerMatch.description_similarity < 50) {
    warnings.push(`CLIFFHANGER: baja similitud con planificado (${cliffhangerMatch.description_similarity}%)`);
    score -= 8;
  }
  
  // 4. Validate characters
  const charsCoverage = validateCharactersCoverage(scriptText, contract.characters_required);
  if (charsCoverage.found < charsCoverage.required * 0.5) {
    blockers.push(`PERSONAJES: ${charsCoverage.found}/${charsCoverage.required} requeridos presentes`);
    score -= 15;
  } else if (charsCoverage.missing.length > 0) {
    warnings.push(`PERSONAJES: faltan ${charsCoverage.missing.join(', ')}`);
    score -= 5;
  }
  
  // 5. Validate setpiece
  const setpieceExec = validateSetpiece(scriptText, contract);
  if (!setpieceExec.name_match && setpieceExec.participants_present < contract.setpiece.participants.length / 2) {
    warnings.push(`SETPIECE: "${contract.setpiece.name}" no claramente ejecutado`);
    score -= 10;
  }
  
  // 6. Validate faction rules
  const factionViolations = validateFactionRules(scriptText, contract);
  if (factionViolations.length > 0) {
    for (const v of factionViolations) {
      warnings.push(`FACCIÓN: ${v}`);
    }
    score -= factionViolations.length * 5;
  }
  
  // 7. Check moral dilemma if required
  if (contract.moral_dilemma?.choice) {
    if (!textContains(scriptText, contract.moral_dilemma.choice, 0.5)) {
      warnings.push(`DILEMA: "${contract.moral_dilemma.choice.substring(0, 30)}..." no dramatizado`);
      score -= 8;
    }
  }
  
  // 8. Check crossover event
  if (contract.crossover_event) {
    if (!textContains(scriptText, contract.crossover_event, 0.5)) {
      warnings.push(`CROSSOVER: evento de cruce de tramas no detectado`);
      score -= 5;
    }
  }
  
  // 9. V11.3: Validate scene depth
  const sceneDepthIssues = validateSceneDepth(script);
  if (sceneDepthIssues.length > 0) {
    const shallowSceneCount = sceneDepthIssues.length;
    const scenes = script.scenes as Array<Record<string, unknown>> || [];
    const totalScenes = scenes.length || 1;
    const shallowPercent = Math.round((shallowSceneCount / totalScenes) * 100);
    
    if (shallowPercent > 50) {
      blockers.push(`SCENE_DEPTH: ${shallowPercent}% de escenas demasiado superficiales`);
      score -= 20;
    } else if (shallowPercent > 25) {
      warnings.push(`SCENE_DEPTH: ${shallowSceneCount} escenas con descripción insuficiente`);
      score -= 10;
    }
  }
  
  // Clamp score
  score = Math.max(0, Math.min(100, score));
  
  // Determine quality level
  let quality: ScriptQCResult['quality'];
  if (blockers.length > 0) {
    quality = score >= 50 ? 'poor' : 'failed';
  } else if (score >= 90) {
    quality = 'excellent';
  } else if (score >= 75) {
    quality = 'good';
  } else if (score >= 60) {
    quality = 'acceptable';
  } else {
    quality = 'poor';
  }
  
  return {
    passed: blockers.length === 0 && score >= 50,
    score,
    quality,
    threads_coverage: threadsCoverage,
    turning_points_executed: tpExecuted,
    cliffhanger_match: cliffhangerMatch,
    characters_coverage: charsCoverage,
    setpiece_executed: setpieceExec,
    faction_violations: factionViolations,
    scene_depth_issues: sceneDepthIssues,
    blockers,
    warnings
  };
}

// ============================================================================
// V11.1: DENSITY VALIDATION POST-SCRIPT
// ============================================================================

/**
 * Validate a generated script against density requirements.
 * This is called AFTER generation to ensure the script didn't "shrink" the outline.
 */
export function validateScriptDensityPost(
  script: Record<string, unknown>,
  densityProfile?: DensityProfile
): PostScriptDensityResult {
  // Use default profile if none provided
  const profile: DensityProfile = densityProfile || {
    min_characters_total: 6,
    min_supporting_characters: 2,
    min_antagonists: 1,
    min_locations: 4,
    min_scenes_per_episode: 8,
    min_threads_total: 3,
    min_secondary_threads: 1
  };

  return validateScriptDensity(script, profile);
}

/**
 * Get a summary string for display in UI
 */
export function getQCSummary(result: ScriptQCResult): string {
  const emoji = result.passed ? '✅' : '❌';
  const parts = [
    `${emoji} Score: ${result.score}/100 (${result.quality})`,
    `Threads: ${result.threads_coverage.found}/${result.threads_coverage.required}`,
    `TPs: ${result.turning_points_executed.executed}/${result.turning_points_executed.required}`,
    `Cliffhanger: ${result.cliffhanger_match.present ? '✓' : '✗'}`
  ];
  
  if (result.blockers.length > 0) {
    parts.push(`Blockers: ${result.blockers.length}`);
  }
  
  return parts.join(' | ');
}
