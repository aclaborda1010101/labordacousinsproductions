/**
 * SCRIPT QC V11 - Structural Validation of Generated Scripts
 * 
 * Validates that a generated script adheres to its episode contract.
 * This is POST-GENERATION validation - the script must have executed
 * all structural contracts from the outline.
 */

import type { EpisodeContract, TurningPointContract, ThreadContract } from "./episode-contracts.ts";

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
  
  blockers: string[];
  warnings: string[];
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
    blockers,
    warnings
  };
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
