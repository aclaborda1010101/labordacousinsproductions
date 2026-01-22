/**
 * MODEL SELECTOR V2 - Frontend Preview
 * 
 * ⚠️ DISCLAIMER: This selector is for UI PREVIEW and cost estimation only.
 * The REAL model decision is made by the backend in generate-script.
 * Do NOT rely on this for actual generation logic.
 * 
 * Key features:
 * - Context-aware scaling (Gemini 3 for large inputs)
 * - QA escalation visualization
 * - Cost estimation
 */

// =============================================================================
// TYPES
// =============================================================================

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

export type ModelTier = "hollywood" | "professional" | "fast";
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

export interface ModelSelectionContext {
  sceneCards: SceneCard[];
  blockIndex: number;
  totalBlocks: number;
  driftWarnings: number;
  episodeNumber?: number;
  totalEpisodes?: number;
  qualityTier?: ModelTier;
  previousBlockWasRescue?: boolean;
  lastQaScore?: number;
  lastQaFlags?: string[];
  estimatedInputTokens?: number;
  providerHealth?: ProviderHealth;
}

export interface ModelSelectionResult {
  model: ModelId;
  reason: ModelReason;
  tier: ModelTier;
  notes?: string;
}

// =============================================================================
// DISCLAIMER
// =============================================================================
export const MODEL_SELECTOR_DISCLAIMER = 
  'Este selector es solo para preview UI. El modelo final lo decide el backend.';

// =============================================================================
// CONSTANTS
// =============================================================================
const HUGE_CONTEXT_TOKENS = 120_000;
const LARGE_CONTEXT_TOKENS = 60_000;
const MEDIUM_CONTEXT_TOKENS = 15_000;

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
  "reveal",
  "confession",
  "twist",
  "confrontation",
]);

const REVEAL_KEYWORDS = ["reveal", "confession", "twist", "secret", "truth", "discover"];
const INTENSE_DIALOGUE_KEYWORDS = ["confronta", "revela", "enfrenta", "acusa", "confiesa"];
const SETPIECE_KEYWORDS = ["setpiece", "action", "chase", "fight", "escape", "explosion"];

const SEVERE_QA_FLAGS = new Set([
  "CONSISTENCY_FAIL",
  "FORMAT_FAIL",
  "CANON_DRIFT",
  "THREAD_BREAK",
  "CONTINUITY_ERROR",
]);

// =============================================================================
// MAIN SELECTOR (for preview/estimation only)
// =============================================================================

/**
 * Select appropriate model for a script block based on context.
 * ⚠️ This is for UI preview only - backend makes the real decision.
 */
export function selectModelForBlock(context: ModelSelectionContext): ModelSelectionResult {
  const {
    sceneCards,
    blockIndex,
    totalBlocks,
    driftWarnings,
    episodeNumber,
    totalEpisodes,
    qualityTier = "professional",
    previousBlockWasRescue = false,
    lastQaScore,
    lastQaFlags,
    estimatedInputTokens = 0,
    providerHealth = { openaiOk: true, geminiOk: true },
  } = context;

  const { openaiOk, geminiOk } = providerHealth;

  // Map qualityTier to internal tier
  const tier: QualityTier = 
    qualityTier === "hollywood" ? "hollywood" :
    qualityTier === "professional" ? "profesional" : "rapido";

  // 1. Context size (avoid timeouts)
  if (estimatedInputTokens >= HUGE_CONTEXT_TOKENS) {
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "HUGE_CONTEXT", tier: "hollywood" };
    }
    return { model: "google/gemini-2.5-flash", reason: "HUGE_CONTEXT", tier: "hollywood", notes: "Fallback" };
  }

  if (estimatedInputTokens >= LARGE_CONTEXT_TOKENS && geminiOk) {
    return { model: "google/gemini-3-flash-preview", reason: "LARGE_CONTEXT", tier: "hollywood" };
  }

  // 2. Rescue / drift recovery
  if (driftWarnings >= 2) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "RESCUE_DRIFT", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "RESCUE_DRIFT", tier: "hollywood" };
  }

  if (previousBlockWasRescue) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "POST_RESCUE_STABILIZE", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "POST_RESCUE_STABILIZE", tier: "hollywood" };
  }

  // 3. QA escalation
  const hasBadQa = typeof lastQaScore === "number" && lastQaScore < 80;
  const hasSevereQaFlag = (lastQaFlags ?? []).some(f => SEVERE_QA_FLAGS.has(f));

  if (hasBadQa || hasSevereQaFlag) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "QA_ESCALATION", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "QA_ESCALATION", tier: "hollywood" };
  }

  // 4. Narrative criticality
  const hasCriticalBeat = sceneCards.some(sc => {
    const beat = (sc.beat_executed || "").toLowerCase();
    return CRITICAL_BEATS.has(beat);
  });

  if (hasCriticalBeat) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "CRITICAL_BEAT", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "CRITICAL_BEAT", tier: "hollywood" };
  }

  // Check for reveal + intense dialogue
  const hasReveal = sceneCards.some(sc => {
    const beat = (sc.beat_executed || "").toLowerCase();
    const objective = (sc.objective || "").toLowerCase();
    return sc.reveal === true || REVEAL_KEYWORDS.some(kw => beat.includes(kw) || objective.includes(kw));
  });

  const hasIntenseDialogue = sceneCards.some(sc => {
    const objective = (sc.objective || "").toLowerCase();
    const conflict = (sc.conflict || "").toLowerCase();
    return (sc.dialogue_intensity ?? 0) >= 4 || 
      INTENSE_DIALOGUE_KEYWORDS.some(kw => objective.includes(kw) || conflict.includes(kw));
  });

  if (hasReveal && hasIntenseDialogue) {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "REVEAL_DIALOGUE", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "REVEAL_DIALOGUE", tier: "hollywood" };
  }

  // Visual setpiece
  const hasSetpiece = sceneCards.some(sc => {
    const beat = (sc.beat_executed || "").toLowerCase();
    const duration = sc.duration_seconds || 0;
    const isLongScene = duration > 240;
    const isSetpieceBeat = SETPIECE_KEYWORDS.some(kw => beat.includes(kw));
    return sc.setpiece === true || isLongScene || isSetpieceBeat;
  });

  if (hasSetpiece && tier !== "rapido") {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "VISUAL_SETPIECE", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "VISUAL_SETPIECE", tier: "hollywood" };
  }

  // Episode bookends
  const isBookend = blockIndex === 0 || blockIndex === totalBlocks - 1;
  if (isBookend && tier !== "rapido") {
    if (openaiOk) {
      return { model: "openai/gpt-5.2", reason: "EPISODE_BOOKEND", tier: "hollywood" };
    }
    return { model: "google/gemini-3-flash-preview", reason: "EPISODE_BOOKEND", tier: "hollywood" };
  }

  // 5. Tier defaults
  if (tier === "hollywood") {
    if (geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "STANDARD_BLOCK", tier: "hollywood" };
    }
    return { model: "openai/gpt-5.2", reason: "STANDARD_BLOCK", tier: "hollywood" };
  }

  if (tier === "profesional") {
    if (estimatedInputTokens > MEDIUM_CONTEXT_TOKENS && geminiOk) {
      return { model: "google/gemini-3-flash-preview", reason: "STANDARD_BLOCK", tier: "professional" };
    }
    return { model: "openai/gpt-5-mini", reason: "CHEAP_BLOCK", tier: "fast" };
  }

  // rapido
  return { model: "openai/gpt-5-mini", reason: "CHEAP_BLOCK", tier: "fast" };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Estimate tokens from string parts.
 * Conservative estimate: ~4 chars per token for English/Spanish.
 */
export function estimateTokensFromStrings(parts: Array<string | undefined | null>): number {
  const chars = parts.reduce((sum, s) => sum + (s?.length ?? 0), 0);
  return Math.ceil(chars / 4);
}

/**
 * Calculate scenes per block based on scene characteristics.
 */
export function calculateScenesPerBlock(sceneCards: SceneCard[]): number {
  if (!sceneCards.length) return 2;
  
  const avgDuration = sceneCards.reduce((sum, sc) => 
    sum + (sc.duration_seconds || 120), 0
  ) / sceneCards.length;
  
  if (avgDuration < 90) return 3;
  if (avgDuration > 180) return 1;
  return 2;
}

/**
 * Estimate model distribution for cost estimation.
 */
export function estimateModelDistribution(
  totalBlocks: number,
  totalEpisodes: number,
  qualityTier: ModelTier = "professional"
): { 
  gpt52Blocks: number; 
  gemini3Blocks: number;
  gpt5MiniBlocks: number; 
  estimatedSavings: number 
} {
  if (qualityTier === "hollywood") {
    // Hollywood uses Gemini 3 as workhorse, GPT-5.2 for critical
    const criticalBlocks = Math.ceil(totalBlocks * 0.25); // bookends + critical beats
    return {
      gpt52Blocks: criticalBlocks,
      gemini3Blocks: totalBlocks - criticalBlocks,
      gpt5MiniBlocks: 0,
      estimatedSavings: 40, // vs all GPT-5.2
    };
  }

  // Professional: mix of all three
  const bookendBlocks = totalEpisodes * 2;
  const criticalBlocks = Math.ceil(totalBlocks * 0.15);
  const rescueBlocks = Math.ceil(totalBlocks * 0.10);
  
  const gpt52Blocks = Math.min(totalBlocks, bookendBlocks + criticalBlocks + rescueBlocks);
  const gemini3Blocks = Math.ceil((totalBlocks - gpt52Blocks) * 0.3);
  const gpt5MiniBlocks = Math.max(0, totalBlocks - gpt52Blocks - gemini3Blocks);

  const allGpt52Cost = totalBlocks * 10;
  const mixedCost = (gpt52Blocks * 10) + (gemini3Blocks * 3) + (gpt5MiniBlocks * 1);
  const estimatedSavings = Math.round((1 - mixedCost / allGpt52Cost) * 100);

  return { gpt52Blocks, gemini3Blocks, gpt5MiniBlocks, estimatedSavings };
}

/**
 * Get model for specific task types (for preview).
 */
export function getModelForTask(taskType: 
  "bible" | "outline" | "scene_cards" | "script_block" | "polish" | "rescue" | "drift_check" | "auto_fix"
): ModelId {
  switch (taskType) {
    case "bible":
    case "outline":
    case "polish":
    case "rescue":
      return "openai/gpt-5.2";
    
    case "scene_cards":
    case "drift_check":
    case "auto_fix":
      return "openai/gpt-5-mini";
    
    case "script_block":
    default:
      return "openai/gpt-5-mini"; // Selected dynamically
  }
}

/**
 * Get model display name for UI.
 */
export function getModelDisplayName(model: ModelId): string {
  const names: Record<ModelId, string> = {
    "openai/gpt-5-mini": "GPT-5 Mini",
    "openai/gpt-5": "GPT-5",
    "openai/gpt-5.2": "GPT-5.2 Premium",
    "google/gemini-3-flash-preview": "Gemini 3 Flash",
    "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  };
  return names[model] || model;
}

/**
 * Get reason display name for UI.
 */
export function getReasonDisplayName(reason: ModelReason): string {
  const names: Record<ModelReason, string> = {
    RESCUE_DRIFT: "🚨 Rescue - Corrigiendo deriva",
    POST_RESCUE_STABILIZE: "🔒 Estabilización post-rescue",
    CRITICAL_BEAT: "⭐ Beat crítico (climax, midpoint...)",
    REVEAL_DIALOGUE: "💬 Revelación + diálogo intenso",
    VISUAL_SETPIECE: "🎬 Setpiece visual",
    EPISODE_BOOKEND: "📍 Apertura/cierre de episodio",
    HUGE_CONTEXT: "📊 Contexto muy grande (>120k tokens)",
    LARGE_CONTEXT: "📈 Contexto grande (>60k tokens)",
    QA_ESCALATION: "📉 Escalado por QA bajo",
    STANDARD_BLOCK: "✅ Bloque estándar",
    CHEAP_BLOCK: "💰 Bloque económico",
    TIER_OVERRIDE: "🎯 Override por tier",
    FALLBACK: "⚠️ Fallback",
  };
  return names[reason] || reason;
}
