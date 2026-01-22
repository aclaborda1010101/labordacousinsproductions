/**
 * SCRIPT QC V11.4 - Structural Validation of Generated Scripts
 * 
 * Validates that a generated script adheres to its episode contract.
 * This is POST-GENERATION validation - the script must have executed
 * all structural contracts from the outline.
 * 
 * V11.1: Added density validation post-generation
 * V11.2: Added batch-level validation and repair prompt generation
 * V11.3: Added scene depth validation
 * V11.4: Added anti-generic phrase detection
 */

import type { EpisodeContract, TurningPointContract, ThreadContract } from "./episode-contracts.ts";
import { validateScriptDensity, type DensityProfile, type PostScriptDensityResult } from "./density-validator.ts";
import type { BatchPlan, BatchResult } from "./batch-planner.ts";
import { detectGenericPhrases, validateEventStructure, validateGenericity, type GenericDetectionResult } from "./anti-generic.ts";

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
  
  // V11.4: Anti-generic validation
  generic_language_issues: string[];
  generic_phrases_found: string[];
  
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
// V11.3: SCENE DEPTH VALIDATION - Hollywood Standard (8-12 lines per scene)
// ============================================================================

const MINIMUM_RAW_CONTENT_LENGTH = 300; // ~8-12 lines of rich description (Hollywood standard)
const MINIMUM_RAW_CONTENT_LINES = 8;    // Minimum 8 lines per scene description
const MINIMUM_ACTION_SUMMARY_LENGTH = 80; // At least 1-2 sentences
const MINIMUM_WORDS_PER_SCENE = 80;     // Minimum word count for meaningful description

/**
 * V15: Validate scene description density meets Hollywood standards.
 * Returns warnings for scenes that don't meet the 8-12 line minimum.
 */
export function validateSceneDescriptionDensity(
  scene: Record<string, unknown>,
  sceneIndex: number
): { valid: boolean; warning?: string } {
  const rawContent = (scene.raw_content as string) || '';
  const sceneNum = scene.scene_number || (sceneIndex + 1);
  
  // Count actual content lines (non-empty, non-whitespace)
  const lines = rawContent.split('\n').filter(l => l.trim().length > 0).length;
  const wordCount = rawContent.split(/\s+/).filter(w => w.length > 0).length;
  const charCount = rawContent.length;
  
  // Check against Hollywood standards
  if (charCount < MINIMUM_RAW_CONTENT_LENGTH) {
    return {
      valid: false,
      warning: `SCENE_${sceneNum}_DESCRIPTION_SHORT: ${charCount}/${MINIMUM_RAW_CONTENT_LENGTH} chars (need ${MINIMUM_RAW_CONTENT_LENGTH}+)`
    };
  }
  
  if (lines < MINIMUM_RAW_CONTENT_LINES) {
    return {
      valid: false,
      warning: `SCENE_${sceneNum}_DESCRIPTION_SHALLOW: ${lines}/${MINIMUM_RAW_CONTENT_LINES} lines (Hollywood standard: 8-12 lines)`
    };
  }
  
  if (wordCount < MINIMUM_WORDS_PER_SCENE) {
    return {
      valid: false,
      warning: `SCENE_${sceneNum}_WORD_COUNT_LOW: ${wordCount}/${MINIMUM_WORDS_PER_SCENE} words`
    };
  }
  
  return { valid: true };
}

// ============================================================================
// V14: LITERARY SCRIPT QC - Anti-Impoverishment Validation (GENERIC)
// ============================================================================

// Generic phrases that indicate weak/summary writing (not genre-specific)
const GENERIC_SCENE_WEAK_PHRASES = [
  'hablan de', 'discuten', 'comentan', 'recuerdan', 'reflexionan',
  'la tensión aumenta', 'se miran en silencio', 'algo cambia',
  'todo se complica', 'empiezan a', 'surge un conflicto',
  'se dan cuenta de que', 'nada volverá a ser igual',
  'todo cambia', 'las cosas se complican', 'la situación empeora',
  'hay un momento de', 'se genera tensión', 'aumenta la presión'
];

function countWeakPhrases(text: string): number {
  const lower = text.toLowerCase();
  return GENERIC_SCENE_WEAK_PHRASES.filter(p => lower.includes(p)).length;
}

function hasActionVerbs(text: string): boolean {
  return /(entra|sale|agarra|rompe|golpea|huye|avanza|retrocede|apunta|empuja|enciende|apaga|corre|salta|grita|susurra|lanza|atrapa|abre|cierra|esconde|revela|dispara|corta|abraza|empuja)/i.test(text);
}

// V14: runLiteraryScriptQC moved to V15 section below (unified with runNarrativeMaturityQC)

/**
 * V15: Validate that scenes have sufficient depth (not just placeholders).
 * Uses Hollywood standard validation for description density.
 * Returns list of issues for scenes that are too shallow.
 */
function validateSceneDepth(script: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const scenes = script.scenes as Array<Record<string, unknown>> || [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneNum = scene.scene_number || (i + 1);
    const actionSummary = (scene.action_summary as string) || '';
    const slugline = (scene.slugline as string) || '';
    
    // V15: Use Hollywood standard density validation
    const densityResult = validateSceneDescriptionDensity(scene, i);
    if (!densityResult.valid && densityResult.warning) {
      issues.push(densityResult.warning);
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
    
    const rawContent = (scene.raw_content as string) || '';
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
// V11.4: ANTI-GENERIC LANGUAGE VALIDATION
// ============================================================================

/**
 * Validate that script doesn't contain generic/vague language.
 * Returns list of issues for scenes with problematic language.
 */
function validateAntiGeneric(script: Record<string, unknown>): { issues: string[]; phrasesFound: string[] } {
  const issues: string[] = [];
  const allPhrasesFound: string[] = [];
  const scenes = script.scenes as Array<Record<string, unknown>> || [];
  
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneNum = scene.scene_number || (i + 1);
    const rawContent = (scene.raw_content as string) || '';
    const actionSummary = (scene.action_summary as string) || '';
    const conflict = (scene.conflict as string) || '';
    
    // Combine all text for analysis
    const combinedText = `${rawContent} ${actionSummary} ${conflict}`;
    
    // Check for generic phrases - detectGenericPhrases returns string[]
    const phrasesFound = detectGenericPhrases(combinedText);
    if (phrasesFound.length > 0) {
      allPhrasesFound.push(...phrasesFound);
      issues.push(`Scene ${sceneNum}: Generic language detected: "${phrasesFound.join('", "')}"`);
    }
    
    // Check action summary for proper structure (subject + verb + consequence)
    if (actionSummary.length > 20) {
      const eventValidation = validateEventStructure(actionSummary);
      if (!eventValidation.valid) {
        issues.push(`Scene ${sceneNum}: Action lacks structure - ${eventValidation.reason}`);
      }
    }
  }
  
  return { issues, phrasesFound: [...new Set(allPhrasesFound)] };
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
  
  // 10. V11.4: Validate anti-generic language
  const antiGenericResult = validateAntiGeneric(script);
  const genericLanguageIssues = antiGenericResult.issues;
  const genericPhrasesFound = antiGenericResult.phrasesFound;
  
  if (genericPhrasesFound.length >= 5) {
    blockers.push(`GENERIC_LANGUAGE: ${genericPhrasesFound.length} frases genéricas críticas detectadas`);
    score -= 25;
  } else if (genericPhrasesFound.length >= 3) {
    warnings.push(`GENERIC_LANGUAGE: ${genericPhrasesFound.length} frases genéricas detectadas - revisar calidad`);
    score -= 15;
  } else if (genericPhrasesFound.length > 0) {
    warnings.push(`GENERIC_LANGUAGE: ${genericPhrasesFound.length} frase(s) genérica(s) menor(es)`);
    score -= 5;
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
    generic_language_issues: genericLanguageIssues,
    generic_phrases_found: genericPhrasesFound,
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

// ============================================================================
// V13: UNIFIED QC RUNNER - Single entry point for all QC validations
// ============================================================================

export interface UnifiedQCResult {
  status: 'PASS' | 'FAIL';
  score: number;
  blockers: string[];
  warnings: string[];
  genericity: {
    genericity_score: number;
    observability_score: number;
    generic_hits: number;
    abstract_hits: number;
    errors: string[];
  };
}

/**
 * Run all QC checks on a payload (outline, batch, or full script).
 * Unified entry point for QC validation.
 * 
 * @param payload - The data to validate (outline, script, or batch)
 * @param options - Optional configuration
 * @returns UnifiedQCResult with comprehensive validation data
 */
export function runScriptQC(payload: any, options?: { mode?: 'batch' | 'full' | 'outline' }): UnifiedQCResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;
  
  // 1. GENERICITY / OBSERVABILITY GATE (Hollywood-grade)
  const gen = validateGenericity(payload);
  if (gen.status === 'FAIL') {
    blockers.push(...gen.errors);
    score -= 25;
  } else if (gen.genericity_score > 15) {
    // Not a blocker but concerning
    warnings.push(`GENERICITY: score ${gen.genericity_score} (borderline)`);
    score -= 10;
  }
  
  // 2. Anti-generic language check (if has scenes)
  if (payload?.scenes) {
    const antiGenResult = validateAntiGeneric(payload);
    if (antiGenResult.phrasesFound.length >= 5) {
      blockers.push(`GENERIC_LANGUAGE: ${antiGenResult.phrasesFound.length} critical phrases`);
      score -= 25;
    } else if (antiGenResult.phrasesFound.length >= 3) {
      warnings.push(`GENERIC_LANGUAGE: ${antiGenResult.phrasesFound.length} phrases detected`);
      score -= 15;
    }
  }
  
  // 3. Scene depth check (if has scenes)
  if (payload?.scenes) {
    const depthIssues = validateSceneDepth(payload);
    if (depthIssues.length > 0) {
      const scenes = payload.scenes as Array<Record<string, unknown>> || [];
      const shallowPercent = Math.round((depthIssues.length / (scenes.length || 1)) * 100);
      if (shallowPercent > 50) {
        blockers.push(`SCENE_DEPTH: ${shallowPercent}% too shallow`);
        score -= 20;
      } else if (shallowPercent > 25) {
        warnings.push(`SCENE_DEPTH: ${depthIssues.length} scenes need more detail`);
        score -= 10;
      }
    }
  }
  
  // 4. Event structure validation (if has turning_points)
  if (payload?.turning_points && Array.isArray(payload.turning_points)) {
    let invalidTPs = 0;
    for (const tp of payload.turning_points) {
      const event = String(tp?.event || '');
      const agent = String(tp?.agent || '');
      const consequence = String(tp?.consequence || '');
      
      // Check for filmable structure
      const hasAgent = agent.length > 2;
      const hasEvent = event.length > 15;
      const hasConsequence = consequence.length > 15;
      
      if (!hasAgent || !hasEvent || !hasConsequence) {
        invalidTPs++;
      }
    }
    
    if (invalidTPs > payload.turning_points.length * 0.3) {
      blockers.push(`TURNING_POINTS: ${invalidTPs}/${payload.turning_points.length} incomplete`);
      score -= 20;
    } else if (invalidTPs > 0) {
      warnings.push(`TURNING_POINTS: ${invalidTPs} incomplete structure`);
      score -= 5;
    }
  }
  
  const status = blockers.length ? 'FAIL' : 'PASS';
  
  return {
    status,
    score: Math.max(0, score),
    blockers,
    warnings,
    genericity: {
      genericity_score: gen.genericity_score,
      observability_score: gen.observability_score,
      generic_hits: gen.generic_hits,
      abstract_hits: gen.abstract_hits,
      errors: gen.errors
    }
  };
}

// ============================================================================
// V15: NARRATIVE MATURITY QC - Setup/Payoff, Callbacks, Causality, Dialogue
// ============================================================================

// ─────────────────────────────────────────────
// UNIVERSAL NARRATIVE HEURISTICS (ALL GENRES)
// ─────────────────────────────────────────────

const SETUP_MARKERS = [
  'presenta', 'introduce', 'por primera vez', 'se establece',
  'queda claro que', 'descubrimos que', 'aparece', 'muestra',
  'revela', 'vemos que', 'se menciona'
];

const PAYOFF_MARKERS = [
  'regresa', 'vuelve a', 'ahora', 'finalmente',
  'como consecuencia', 'esto provoca', 'por eso',
  'resulta que', 'se cumple', 'paga el precio'
];

const CALLBACK_MARKERS = [
  'recuerda', 'otra vez', 'de nuevo', 'tal como antes', 'igual que',
  'como aquella vez', 'al igual que', 'repite'
];

const CAUSALITY_MARKERS = [
  'porque', 'por lo tanto', 'debido a', 'como resultado', 'provoca que',
  'en consecuencia', 'por eso', 'lo cual', 'gracias a', 'a causa de'
];

// ─────────────────────────────────────────────
// DIALOGUE HEURISTICS (ALL GENRES)
// ─────────────────────────────────────────────

const EXPLICIT_EMOTION_PHRASES = [
  'estoy triste', 'estoy enfadado', 'tengo miedo',
  'me siento mal', 'me duele', 'no puedo más',
  'estoy feliz', 'me siento bien', 'estoy preocupado',
  'tengo rabia', 'estoy nervioso', 'me da miedo'
];

const GENERIC_DIALOGUE_PHRASES = [
  'tenemos que hablar', 'esto no es lo que parece',
  'no sabes de lo que hablas', 'todo ha cambiado',
  'no lo entiendes', 'es complicado', 'no puedo explicarlo',
  'confía en mí', 'es lo mejor para todos', 'no tenemos opción'
];

function countNarrativeMarkers(text: string, markers: string[]): number {
  const lower = text.toLowerCase();
  return markers.filter(m => lower.includes(m)).length;
}

export interface NarrativeMaturityResult {
  score: number;
  blockers: string[];
  warnings: string[];
  metrics: {
    setups: number;
    payoffs: number;
    callbacks: number;
    causality: number;
    explicit_emotions: number;
    generic_dialogue: number;
    static_dialogue_percent: number;
  };
}

/**
 * Run comprehensive narrative maturity validation.
 * Checks Setup/Payoff balance, Callbacks, Causality, and Dialogue quality.
 * Universal for all genres.
 */
export function runNarrativeMaturityQC(scriptText: string): NarrativeMaturityResult {
  let score = 100;
  const blockers: string[] = [];
  const warnings: string[] = [];
  const metrics: NarrativeMaturityResult['metrics'] = {
    setups: 0,
    payoffs: 0,
    callbacks: 0,
    causality: 0,
    explicit_emotions: 0,
    generic_dialogue: 0,
    static_dialogue_percent: 0
  };

  // ─────────────────────────────────────────────
  // SETUP → PAYOFF VALIDATION
  // ─────────────────────────────────────────────
  
  const setupCount = countNarrativeMarkers(scriptText, SETUP_MARKERS);
  const payoffCount = countNarrativeMarkers(scriptText, PAYOFF_MARKERS);
  
  metrics.setups = setupCount;
  metrics.payoffs = payoffCount;
  
  if (setupCount > payoffCount + 3) {
    warnings.push(`SETUP_SIN_PAYOFF: ${setupCount} setups vs ${payoffCount} payoffs - ideas no pagadas`);
    score -= Math.min((setupCount - payoffCount) * 3, 15);
  }

  // ─────────────────────────────────────────────
  // CALLBACK VALIDATION
  // ─────────────────────────────────────────────
  
  const callbackCount = countNarrativeMarkers(scriptText, CALLBACK_MARKERS);
  metrics.callbacks = callbackCount;
  
  // For long scripts, callbacks are expected
  if (callbackCount === 0 && scriptText.length > 15000) {
    warnings.push('SIN_CALLBACKS: El guion no reutiliza elementos previos - falta eco narrativo');
    score -= 10;
  }

  // ─────────────────────────────────────────────
  // CAUSALITY CHECK
  // ─────────────────────────────────────────────
  
  const causalityCount = countNarrativeMarkers(scriptText, CAUSALITY_MARKERS);
  metrics.causality = causalityCount;
  
  // Scripts should have explicit causal connections
  if (causalityCount < 5 && scriptText.length > 12000) {
    warnings.push('BAJA_CAUSALIDAD: Muchos eventos sin conexión causal clara');
    score -= 10;
  } else if (causalityCount < 3 && scriptText.length > 8000) {
    warnings.push('CAUSALIDAD_DEBIL: Pocos conectores causales explícitos');
    score -= 5;
  }

  // ─────────────────────────────────────────────
  // DIALOGUE QUALITY CHECKS
  // ─────────────────────────────────────────────
  
  const explicitEmotionCount = countNarrativeMarkers(scriptText, EXPLICIT_EMOTION_PHRASES);
  metrics.explicit_emotions = explicitEmotionCount;
  
  if (explicitEmotionCount > 6) {
    blockers.push(`DIALOGO_EXPLICATIVO: ${explicitEmotionCount} emociones verbalizadas - falta subtexto`);
    score -= 20;
  } else if (explicitEmotionCount > 3) {
    warnings.push(`DIALOGO_EXPLICATIVO: ${explicitEmotionCount} emociones expresadas verbalmente`);
    score -= Math.min(explicitEmotionCount * 2, 10);
  }
  
  const genericDialogueCount = countNarrativeMarkers(scriptText, GENERIC_DIALOGUE_PHRASES);
  metrics.generic_dialogue = genericDialogueCount;
  
  if (genericDialogueCount > 5) {
    blockers.push(`DIALOGO_GENERICO: ${genericDialogueCount} frases intercambiables - diálogo sin personalidad`);
    score -= 15;
  } else if (genericDialogueCount > 3) {
    warnings.push(`DIALOGO_GENERICO: ${genericDialogueCount} frases intercambiables entre personajes`);
    score -= Math.min(genericDialogueCount * 3, 10);
  }

  // ─────────────────────────────────────────────
  // DIALOGUE FUNCTIONALITY (SCENE IMPACT)
  // ─────────────────────────────────────────────
  
  // Find dialogue lines (CHARACTER: or CHARACTER\n patterns)
  const dialogueLines = scriptText.split('\n').filter(l => {
    const trimmed = l.trim();
    return /^[A-ZÁÉÍÓÚÑ]{2,}:/.test(trimmed) || /^[A-ZÁÉÍÓÚÑ]{2,}\s*$/.test(trimmed);
  });
  
  let staticDialogueCount = 0;
  if (dialogueLines.length > 0) {
    // Check if dialogue lines have consequence indicators
    for (const line of dialogueLines) {
      const hasConsequenceIndicator = 
        line.includes('porque') || 
        line.includes('si') || 
        line.includes('entonces') ||
        line.includes('pero') ||
        line.includes('aunque');
      
      if (!hasConsequenceIndicator) {
        staticDialogueCount++;
      }
    }
    
    const staticPercent = Math.round((staticDialogueCount / dialogueLines.length) * 100);
    metrics.static_dialogue_percent = staticPercent;
    
    if (staticPercent > 70 && dialogueLines.length > 20) {
      warnings.push('DIALOGO_SIN_IMPACTO: Mayoría del diálogo no cambia la situación');
      score -= 10;
    }
  }

  // ─────────────────────────────────────────────
  // FINAL NORMALIZATION
  // ─────────────────────────────────────────────
  
  score = Math.max(0, Math.min(100, score));
  
  return {
    score,
    blockers,
    warnings,
    metrics
  };
}

/**
 * Run literary script QC - comprehensive quality check for finished literary scripts.
 * Combines anti-impoverishment checks with narrative maturity.
 */
export function runLiteraryScriptQC(scriptText: string): NarrativeMaturityResult {
  let score = 100;
  const blockers: string[] = [];
  const warnings: string[] = [];
  
  // Start with narrative maturity
  const maturity = runNarrativeMaturityQC(scriptText);
  blockers.push(...maturity.blockers);
  warnings.push(...maturity.warnings);
  score = Math.min(score, maturity.score);
  
  // Additional anti-impoverishment checks
  
  // Scene count for feature films
  const sceneHeaders = (scriptText.match(/\n(INT\.|EXT\.)/gi) || []).length;
  if (sceneHeaders < 10 && scriptText.length > 5000) {
    blockers.push(`POCAS_ESCENAS: Solo ${sceneHeaders} escenas detectadas para un largometraje`);
    score -= 25;
  }
  
  // Check for action verbs (filmability)
  const hasActionVerbs = /(entra|sale|agarra|rompe|golpea|huye|avanza|retrocede|apunta|empuja|enciende|apaga|corre|salta|grita|susurra|lanza|atrapa|mira|camina|cruza|abre|cierra)/i.test(scriptText);
  if (!hasActionVerbs && scriptText.length > 3000) {
    blockers.push('SIN_ACCION_VISIBLE: El guion describe estados, no acciones filmables');
    score -= 30;
  }
  
  // Check for short scenes (symptom of summarization)
  const sceneBlocks = scriptText.split(/\n(INT\.|EXT\.)/i).slice(1);
  if (sceneBlocks.length > 5) {
    const shortScenes = sceneBlocks.filter(s => s.split(' ').length < 100).length;
    const shortPercent = Math.round((shortScenes / sceneBlocks.length) * 100);
    
    if (shortPercent > 50) {
      warnings.push('ESCENAS_RESUMIDAS: Más del 50% de escenas son muy cortas - posible empobrecimiento');
      score -= 15;
    } else if (shortPercent > 30) {
      warnings.push(`ESCENAS_CORTAS: ${shortPercent}% de escenas son breves`);
      score -= 8;
    }
  }
  
  return {
    score: Math.max(0, score),
    blockers,
    warnings,
    metrics: maturity.metrics
  };
}
