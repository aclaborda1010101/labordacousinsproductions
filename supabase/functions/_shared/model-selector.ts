/**
 * MODEL SELECTOR V2 - Production-Ready
 * 
 * Single source of truth for model selection in the Writer's Room pipeline.
 * Backend only - frontend should sync for preview but NOT make final decisions.
 * 
 * Key features:
 * - Context-aware scaling (Gemini 3 for large inputs to avoid timeouts)
 * - QA escalation (GPT-5.2 for poor quality recovery)
 * - Provider health fallback (circuit breaker pattern)
 * - Post-rescue stabilization
 */

export type ModelId =
  | "openai/gpt-5-mini"
  | "openai/gpt-5"
  | "openai/gpt-5.2"
  | "google/gemini-3-flash-preview"
  | "google/gemini-2.5-flash";

export type ModelReason =
  | "RESCUE_DRIFT"
  | "POST_RESCUE_STABILIZE"
  | "CRITICAL_BEAT"
  | "REVEAL_DIALOGUE"
  | "VISUAL_SETPIECE"
  | "EPISODE_BOOKEND"
  | "HUGE_CONTEXT"
  | "LARGE_CONTEXT"
  | "QA_ESCALATION"
  | "STANDARD_BLOCK"
  | "CHEAP_BLOCK"
  | "TIER_OVERRIDE"
  | "FALLBACK";

export type QualityTier = "rapido" | "profesional" | "hollywood";

export interface SceneCard {
  id?: string;
  scene_number?: number;
  beat_executed?: string;
  reveal?: boolean;
  setpiece?: boolean;
  dialogue_intensity?: number;
  duration_seconds?: number;
  objective?: string;
  conflict?: string;
}

export interface ProviderHealth {
  openaiOk: boolean;
  geminiOk: boolean;
}

export interface SelectModelInput {
  tier: QualityTier;
  sceneCards: SceneCard[];
  blockIndex: number;
  totalBlocks: number;
  driftWarnings: number;
  prevWasRescue: boolean;
  lastQaScore?: number;
  lastQaFlags?: string[];
  estimatedInputTokens: number;
  providerHealth: ProviderHealth;
}

export interface SelectModelOutput {
  model: ModelId;
  reason: ModelReason;
  notes?: string;
}

// =============================================================================
// THRESHOLDS - Adjust based on telemetry
// =============================================================================
const HUGE_CONTEXT_TOKENS = 120_000;
const LARGE_CONTEXT_TOKENS = 60_000;
const MEDIUM_CONTEXT_TOKENS = 15_000;

// Critical beats that always require premium model
const CRITICAL_BEATS = new Set([
  "cold_open",
  "teaser",
  "inciting_incident",
  "first_plot_point",
  "midpoint",
  "midpoint_reversal",
  "all_is_lost",
  "dark_night_of_soul",
  "climax",
  "resolution",
  "cliffhanger",
  "season_finale",
]);

// QA flags that trigger escalation
const SEVERE_QA_FLAGS = new Set([
  "CONSISTENCY_FAIL",
  "FORMAT_FAIL",
  "CANON_DRIFT",
  "THREAD_BREAK",
  "CONTINUITY_ERROR",
  "CHARACTER_VOICE_DRIFT",
]);

// Reveal keywords for detecting intense dialogue scenes
const REVEAL_KEYWORDS = ["reveal", "confession", "twist", "secret", "truth", "discover"];

/**
 * Main model selection function.
 * 
 * Priority order:
 * 1. Context size (avoid timeouts)
 * 2. Rescue/drift recovery
 * 3. QA escalation
 * 4. Narrative criticality
 * 5. Tier defaults
 */
export function selectModelForBlock(input: SelectModelInput): SelectModelOutput {
  const {
    tier,
    sceneCards,
    blockIndex,
    totalBlocks,
    driftWarnings,
    prevWasRescue,
    lastQaScore,
    lastQaFlags,
    estimatedInputTokens,
    providerHealth,
  } = input;

  const { openaiOk, geminiOk } = providerHealth;

  // =========================================================================
  // 1. CONTEXT SIZE - Use Gemini for large inputs to avoid timeouts
  // =========================================================================
  if (estimatedInputTokens >= HUGE_CONTEXT_TOKENS) {
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "HUGE_CONTEXT" };
    }
    return { 
      model: "google/gemini-2.5-flash", 
      reason: "HUGE_CONTEXT", 
      notes: "Fallback: gemini-3-flash-preview no disponible" 
    };
  }

  if (estimatedInputTokens >= LARGE_CONTEXT_TOKENS) {
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "LARGE_CONTEXT" };
    }
  }

  // =========================================================================
  // 2. RESCUE / DRIFT RECOVERY - Premium model to fix continuity
  // =========================================================================
  if (driftWarnings >= 2) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "RESCUE_DRIFT" };
    }
    return { 
      model: "google/gemini-3-flash-preview", 
      reason: "RESCUE_DRIFT", 
      notes: "Fallback: openai no disponible" 
    };
  }

  // Post-rescue stabilization: keep premium for 1 more block
  if (prevWasRescue) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "POST_RESCUE_STABILIZE" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "POST_RESCUE_STABILIZE" };
  }

  // =========================================================================
  // 3. QA ESCALATION - If previous block had poor quality
  // =========================================================================
  const hasBadQa = typeof lastQaScore === "number" && lastQaScore < 80;
  const hasSevereQaFlag = (lastQaFlags ?? []).some(f => SEVERE_QA_FLAGS.has(f));

  if (hasBadQa || hasSevereQaFlag) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "QA_ESCALATION" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "QA_ESCALATION" };
  }

  // =========================================================================
  // 4. NARRATIVE CRITICALITY
  // =========================================================================
  
  // Check for critical beats
  const hasCriticalBeat = sceneCards.some(sc => {
    const beat = sc.beat_executed?.toLowerCase() || "";
    return CRITICAL_BEATS.has(beat);
  });

  if (hasCriticalBeat) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "CRITICAL_BEAT" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "CRITICAL_BEAT" };
  }

  // Check for reveal + intense dialogue combination
  const hasReveal = sceneCards.some(sc => {
    const beat = (sc.beat_executed || "").toLowerCase();
    const objective = (sc.objective || "").toLowerCase();
    return sc.reveal === true || REVEAL_KEYWORDS.some(kw => beat.includes(kw) || objective.includes(kw));
  });

  const hasIntenseDialogue = sceneCards.some(sc => (sc.dialogue_intensity ?? 0) >= 4);

  if (hasReveal && hasIntenseDialogue) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "REVEAL_DIALOGUE" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "REVEAL_DIALOGUE" };
  }

  // Check for visual setpiece
  const hasVisualSetpiece = sceneCards.some(sc => sc.setpiece === true);
  if (hasVisualSetpiece && tier !== "rapido") {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "VISUAL_SETPIECE" };
    }
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "VISUAL_SETPIECE" };
    }
  }

  // Episode bookends (first and last block)
  const isBookend = blockIndex === 0 || blockIndex === totalBlocks - 1;
  if (isBookend && tier !== "rapido") {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "EPISODE_BOOKEND" };
    }
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "EPISODE_BOOKEND" };
    }
  }

  // =========================================================================
  // 5. TIER DEFAULTS
  // =========================================================================
  if (tier === "hollywood") {
    // Hollywood: Gemini as workhorse to avoid timeouts, GPT-5.2 triggered by rules above
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "STANDARD_BLOCK" };
    }
    return { 
      model: "openai/gpt-5.2", 
      reason: "STANDARD_BLOCK", 
      notes: "Fallback: gemini no disponible" 
    };
  }

  if (tier === "profesional") {
    // Profesional: Gemini for medium context, mini for small
    if (estimatedInputTokens > MEDIUM_CONTEXT_TOKENS && geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "STANDARD_BLOCK" };
    }
    return { model: "openai/gpt-5-mini", reason: "CHEAP_BLOCK" };
  }

  // rapido tier: always cheapest
  return { model: "openai/gpt-5-mini", reason: "CHEAP_BLOCK" };
}

/**
 * Estimate tokens from string parts.
 * Conservative estimate: ~4 chars per token for English/Spanish.
 */
export function estimateTokensFromStrings(parts: Array<string | undefined | null>): number {
  const chars = parts.reduce((sum, s) => sum + (s?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}

/**
 * Get model for specific task types (non-block tasks).
 * 
 * V3: Gemini 3 Flash as PRIMARY workhorse for long-running tasks (bible, outline)
 * to avoid timeouts. GPT-5.2 reserved for polish/rescue where quality > speed.
 */
export function getModelForTask(
  taskType: "bible" | "outline" | "scene_cards" | "script_block" | "polish" | "rescue" | "drift_check" | "auto_fix",
  providerHealth: ProviderHealth = { openaiOk: true, geminiOk: true }
): ModelId {
  const { openaiOk, geminiOk } = providerHealth;

  switch (taskType) {
    case "bible":
    case "outline":
      // V3: Use Gemini as PRIMARY to avoid timeouts (faster, higher context)
      // GPT-5.2 caused frequent timeouts on these long-running tasks
      if (geminiOk) return "google/gemini-3-flash-preview";
      if (openaiOk) return "openai/gpt-5.2";
      return "google/gemini-2.5-flash";

    case "polish":
    case "rescue":
      // Quality-critical tasks: prefer GPT-5.2 for narrative coherence
      if (openaiOk) return "openai/gpt-5.2";
      if (geminiOk) return "google/gemini-3-flash-preview";
      return "google/gemini-2.5-flash";

    case "scene_cards":
    case "drift_check":
    case "auto_fix":
      // Light tasks
      return "openai/gpt-5-mini";

    case "script_block":
    default:
      // Decided dynamically by selectModelForBlock
      return "openai/gpt-5-mini";
  }
}
