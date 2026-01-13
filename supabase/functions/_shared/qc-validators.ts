/**
 * QC VALIDATORS V11 - Deterministic Quality Control
 * 
 * Hard gating for "Generate Episodes" button
 * No AI calls, pure code validation
 * 
 * Usage:
 * - needsX() functions for conditional UI (show enrichment buttons)
 * - runStructuralQC() for hard gating before episode generation
 */

export type QCLevel = "ok" | "degraded" | "rejected";

export interface QCResult {
  passed: boolean;
  quality: QCLevel;
  blockers: string[];
  warnings: string[];
  score: number; // 0-100
}

// ============================================================================
// HELPERS
// ============================================================================

function isNonEmptyStr(v: unknown, minLen = 1): boolean {
  return typeof v === "string" && v.trim().length >= minLen;
}

function isNonEmptyArr(v: unknown, minLen = 1): boolean {
  return Array.isArray(v) && v.length >= minLen;
}

// ============================================================================
// NEED CHECKERS (for conditional UI buttons)
// ============================================================================

/**
 * Returns true if outline needs threads enrichment
 * Checks: 5-8 threads exist AND all episodes have valid thread_usage
 */
export function needsThreads(outline: Record<string, unknown> | null): boolean {
  if (!outline) return false;
  
  const threads = outline.threads as unknown[];
  if (!Array.isArray(threads) || threads.length < 5) return true;
  if (threads.length > 8) return true; // Too many
  
  // Check thread_usage in episodes
  const episodes = outline.episode_beats as Array<Record<string, unknown>>;
  if (!Array.isArray(episodes)) return true;
  
  return !episodes.every((ep) => {
    const tu = ep.thread_usage as Record<string, unknown>;
    return tu?.A && isNonEmptyStr(tu?.crossover_event as string, 12);
  });
}

/**
 * Returns true if outline needs factions (< 2)
 */
export function needsFactions(outline: Record<string, unknown> | null): boolean {
  if (!outline) return false;
  const factions = outline.factions as unknown[];
  return !Array.isArray(factions) || factions.length < 2;
}

/**
 * Returns true if outline needs entity rules
 * Uses regex heuristic to detect special entities in the JSON
 */
export function needsEntityRules(outline: Record<string, unknown> | null): boolean {
  if (!outline) return false;
  
  const entityRulesCount = (outline.entity_rules as unknown[])?.length ?? 0;
  if (entityRulesCount >= 1) return false;
  
  // Heuristic: detect entity-like terms in the entire outline
  const hayEntidadMencionada = /entidad|ia\b|post-?humana|artefacto|material\b|poder\b|origen desconocido|anomal|alien|mágic|sobrenatural|robot|android|criatura|ser\b|ente\b/i
    .test(JSON.stringify(outline));
  
  return hayEntidadMencionada;
}

/**
 * Returns true if season_arc is missing any of the 5 hitos
 */
export function needs5Hitos(outline: Record<string, unknown> | null): boolean {
  if (!outline) return true;
  
  const arc = outline.season_arc as Record<string, unknown> || {};
  return !isNonEmptyStr(arc.inciting_incident as string, 12) ||
         !isNonEmptyStr(arc.first_turn as string, 12) ||
         !isNonEmptyStr(arc.midpoint_reversal as string, 20) ||
         !isNonEmptyStr(arc.all_is_lost as string, 12) ||
         !isNonEmptyStr(arc.final_choice as string, 12);
}

/**
 * Returns true if any episode is missing a valid setpiece
 */
export function needsSetpieces(outline: Record<string, unknown> | null): boolean {
  if (!outline) return false;
  
  const episodes = outline.episode_beats as Array<Record<string, unknown>>;
  if (!Array.isArray(episodes)) return false;
  
  return !episodes.every((ep) => {
    const sp = ep.setpiece as Record<string, unknown>;
    return sp?.stakes && isNonEmptyStr(sp.stakes as string, 12) && 
           isNonEmptyArr(sp?.participants, 1);
  });
}

// ============================================================================
// GENERIC PHRASE DETECTOR (anti-vagueness)
// ============================================================================

const GENERIC_PHRASES = [
  "aparece", "surge", "amenaza", "algo cambia", "se complica", 
  "tensión aumenta", "todo cambia", "las cosas", "se enfrenta",
  "aparecen amenazas", "surge un conflicto", "pasan cosas",
  "sucede algo", "hay problemas", "surgen dificultades",
  "se revela información", "descubre la verdad", "algo sucede",
  "fuerzas ocultas", "intereses externos", "enfrenta consecuencias"
];

export function detectGenericPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return GENERIC_PHRASES.filter(phrase => lower.includes(phrase));
}

// ============================================================================
// STRUCTURAL QC: Hard gating for "Generate Episodes"
// ============================================================================

export function runStructuralQC(outline: Record<string, unknown>, expectedEpisodes: number): QCResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  // =========================================================================
  // BLOCKERS (prevent "Generate Episodes")
  // =========================================================================
  
  // 1. Season arc 5 hitos
  const arc = outline.season_arc as Record<string, unknown> || {};
  const arcFields: Array<{ field: string; minLen: number }> = [
    { field: "inciting_incident", minLen: 12 },
    { field: "first_turn", minLen: 12 },
    { field: "midpoint_reversal", minLen: 20 },
    { field: "all_is_lost", minLen: 12 },
    { field: "final_choice", minLen: 12 }
  ];
  
  for (const { field, minLen } of arcFields) {
    if (!isNonEmptyStr(arc[field] as string, minLen)) {
      blockers.push(`SEASON_ARC:${field}_missing`);
      score -= 12;
    }
  }

  // 2. Episodes count
  const episodes = outline.episode_beats as Array<Record<string, unknown>>;
  if (!Array.isArray(episodes)) {
    blockers.push("EPISODES:episode_beats_missing");
    score -= 35;
  } else if (episodes.length !== expectedEpisodes) {
    blockers.push(`EPISODES:${episodes.length}/${expectedEpisodes}`);
    score -= 20;
  }

  // 3. Per-episode validation
  if (Array.isArray(episodes)) {
    episodes.forEach((ep, idx) => {
      const epN = (ep.episode as number) ?? (idx + 1);

      // central_conflict >= 12 chars
      if (!isNonEmptyStr(ep.central_conflict as string, 12)) {
        blockers.push(`EP${epN}:central_conflict_invalid`);
        score -= 6;
      }

      // turning_points: 4+ as OBJECTS with agent/event/consequence
      const tps = ep.turning_points as unknown[];
      if (!Array.isArray(tps) || tps.length < 4) {
        blockers.push(`EP${epN}:turning_points_${Array.isArray(tps) ? tps.length : 0}/4`);
        score -= 10;
      } else {
        tps.forEach((tp: unknown, j: number) => {
          // Detect string (chapucero) instead of object
          if (typeof tp === "string") {
            blockers.push(`EP${epN}_TP${j + 1}:is_string_must_be_object`);
            score -= 5;
          } else if (typeof tp === "object" && tp !== null) {
            const tpObj = tp as Record<string, unknown>;
            if (!isNonEmptyStr(tpObj.agent as string, 3)) {
              blockers.push(`EP${epN}_TP${j + 1}:agent_missing`);
              score -= 3;
            }
            if (!isNonEmptyStr(tpObj.event as string, 6)) {
              blockers.push(`EP${epN}_TP${j + 1}:event_missing`);
              score -= 3;
            }
            if (!isNonEmptyStr(tpObj.consequence as string, 6)) {
              blockers.push(`EP${epN}_TP${j + 1}:consequence_missing`);
              score -= 3;
            }
            
            // Detect generic phrases (warning, not blocker)
            const joined = `${tpObj.agent ?? ""} ${tpObj.event ?? ""} ${tpObj.consequence ?? ""}`.toLowerCase();
            const foundGeneric = GENERIC_PHRASES.find(g => joined.includes(g));
            if (foundGeneric) {
              warnings.push(`EP${epN}_TP${j + 1}:generic_phrase`);
              score -= 1;
            }
          }
        });
      }

      // setpiece: name + stakes + participants
      const sp = ep.setpiece as Record<string, unknown>;
      if (!sp || !isNonEmptyStr(sp.name as string, 6) || !isNonEmptyStr(sp.stakes as string, 12) || !isNonEmptyArr(sp.participants, 1)) {
        blockers.push(`EP${epN}:setpiece_invalid`);
        score -= 8;
      }

      // cliffhanger >= 12 chars
      if (!isNonEmptyStr(ep.cliffhanger as string, 12)) {
        blockers.push(`EP${epN}:cliffhanger_missing`);
        score -= 5;
      }

      // thread_usage: A + crossover_event mandatory
      const tu = ep.thread_usage as Record<string, unknown>;
      if (!tu || !isNonEmptyStr(tu.A as string, 2) || !isNonEmptyStr(tu.crossover_event as string, 12)) {
        blockers.push(`EP${epN}:thread_usage_invalid`);
        score -= 8;
      }
    });
  }

  // =========================================================================
  // WARNINGS (don't block, but degrade quality)
  // =========================================================================
  
  if (needsThreads(outline)) {
    warnings.push("threads:needs_5-8");
    score -= 5;
  }
  if (needsFactions(outline)) {
    warnings.push("factions:less_than_2");
    score -= 3;
  }
  if (needsEntityRules(outline)) {
    warnings.push("entity_rules:missing_but_entities_detected");
    score -= 3;
  }

  // Title check
  if (!isNonEmptyStr(outline.title as string, 3)) {
    blockers.push("TITLE:missing");
    score -= 5;
  }

  // Cast check
  const charCount = (outline.main_characters as unknown[])?.length ?? 0;
  if (charCount < 3) {
    blockers.push(`CAST:${charCount}/3_minimum`);
    score -= 10;
  } else if (charCount < 4) {
    warnings.push(`CAST:${charCount}_recommended_4`);
    score -= 2;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  // Determine quality level
  let quality: QCLevel = "ok";
  if (blockers.length > 0) {
    quality = score >= 60 ? "degraded" : "rejected";
  } else if (warnings.length > 0) {
    quality = score >= 80 ? "ok" : "degraded";
  }

  return {
    passed: blockers.length === 0,
    quality,
    blockers,
    warnings,
    score
  };
}

// ============================================================================
// SEMANTIC QC: Detects generic phrases across outline
// ============================================================================

export function runSemanticQC(outline: Record<string, unknown>): { warnings: string[]; genericCount: number; score: number } {
  const warnings: string[] = [];
  let genericCount = 0;
  let score = 100;

  // Scan all text fields for generic phrases
  const textToScan = JSON.stringify(outline);
  const found = detectGenericPhrases(textToScan);
  
  if (found.length > 0) {
    genericCount = found.length;
    warnings.push(`generic_phrases_detected:${found.slice(0, 5).join(",")}`);
    score -= Math.min(found.length * 2, 20);
  }

  return { warnings, genericCount, score: Math.max(score, 50) };
}
