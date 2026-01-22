/**
 * PRODUCTION MODEL ARCHITECTURE
 * Centralized configuration for all AI models
 * 
 * Based on Executive Producer + AI CTO recommendations:
 * - Script writing: GPT-5.2 for narrative coherence
 * - Analysis: GPT-5-mini for precise extraction
 * - Director: GPT-5.2 for technical decisions
 * - Shots: GPT-5-mini for micro-decomposition
 * - Images: Nano Banana for characters, FLUX for locations
 */

export const MODEL_CONFIG = {
  // === ESCRITURA (máxima calidad narrativa) ===
  SCRIPT: {
    HOLLYWOOD: 'openai/gpt-5.2',        // Bible, Outline, Guion final
    PROFESIONAL: 'openai/gpt-5',         // Rewrites, variaciones
    RAPIDO: 'openai/gpt-5-mini',         // Borradores, beat-sheets
    NANO: 'openai/gpt-5-nano',           // Loglines, títulos, sinopsis cortas
    FALLBACK: 'google/gemini-2.5-flash', // Emergencia estable
    // V2: Gemini 3 Flash Preview como workhorse para contexto grande y evitar timeouts
    WORKHORSE: 'google/gemini-3-flash-preview',
  },
  
  // === CONTEXT THRESHOLDS (for model selection) ===
  CONTEXT_THRESHOLDS: {
    HUGE: 120_000,    // Use Gemini workhorse unconditionally
    LARGE: 60_000,    // Prefer Gemini workhorse
    MEDIUM: 15_000,   // Consider upgrading from mini
  },
  
  // === ANÁLISIS (precisión JSON, no creatividad) ===
  ANALYSIS: {
    CHUNK_EXTRACTOR: 'openai/gpt-5-mini',   // Parsing por chunks
    CONSOLIDATOR: 'openai/gpt-5-mini',       // Merge determinístico, mini suficiente
    POLISH: 'openai/gpt-5.2',                // Para mejoras de calidad narrativa
    FALLBACK: 'google/gemini-2.5-flash',     // Emergencia
  },
  
  // === PRODUCCIÓN (director técnico) ===
  DIRECTOR: {
    PRIMARY: 'openai/gpt-5.2',       // Decisiones de cámara, luz, ritmo
    FAST: 'openai/gpt-5',            // Variantes rápidas
  },
  
  // === PLANOS (micro-shots, muchos bloques) ===
  SHOTS: {
    PRIMARY: 'openai/gpt-5-mini',    // Preciso, rápido, barato
    FALLBACK: 'google/gemini-2.5-flash',
  },
  
  // === IMAGEN ===
  IMAGE: {
    CHARACTERS: 'google/gemini-3-pro-image-preview',  // Nano Banana Pro - identity lock
    LOCATIONS: 'google/gemini-3-pro-image-preview',   // Nano Banana Pro - unified
    PROPS: 'google/gemini-3-pro-image-preview',        // Nano Banana Pro - consistency
    KEYFRAMES: 'google/gemini-3-pro-image-preview',    // Nano Banana Pro - continuity
  },
  
  // === VIDEO ===
  VIDEO: {
    NARRATIVE: 'kling',      // Escenas narrativas
    CINEMATIC: 'veo-3.1',    // Ultra-definido
    TRANSITIONS: 'runway',   // Transiciones, abstractos
  },
  
  // === LIMITS (V12: Hollywood-Grade Pipeline) ===
  LIMITS: {
    // Token limits per request type (INCREASED for Hollywood quality)
    MAX_INPUT_TOKENS_SOFT: 12000,       // Increased for rich context
    MAX_OUTPUT_TOKENS_SOFT: 4500,       // V12: 2 scenes per block
    MAX_OUTPUT_TOKENS_HARD: 8000,       // Polish/consolidation only
    
    // Chunking configuration (V12: 2 scenes per block for quality)
    CHUNK_SIZE_CHARS: 8000,             // V11: 8k chars per chunk (safer)
    CHUNK_OVERLAP_CHARS: 600,           // V11: Overlap for names/relationships
    CHUNK_PAGES_EXTRACT: 15,            // PDF extraction
    CHUNK_PAGES_WRITE: 2,               // V12: 2 scenes per block (Hollywood standard)
    MAX_SCENES_PER_REQUEST: 3,          // V12: Reduced from 10 for quality
    
    // Token estimation
    CHARS_PER_TOKEN: 4,
    
    // Timeout configuration (V12: Task-specific for Hollywood reliability)
    TIMEOUT_MS: 70000,                  // 70s per AI request
    STAGE_TIMEOUT_MS: 85000,            // 85s stage timeout
    RETRY_COUNT: 2,                     // Max retries per substep
    RETRY_CHUNK_REDUCTION: 0.6,         // 60% chunk on retry 1
    RETRY_CHUNK_REDUCTION_2: 0.5,       // 50% chunk on retry 2
    
    // Per-task timeouts (V12: Hollywood differentiated)
    TIMEOUTS: {
      BIBLE_MS: 90000,                  // V12: 90s for complete Bible
      OUTLINE_MASTER_MS: 120000,        // V12: 120s for master outline (max Edge)
      OUTLINE_EPISODE_MS: 60000,        // V12: 60s per episode outline
      SCENE_CARDS_MS: 50000,            // V12: 50s per block of cards
      SCRIPT_BLOCK_MS: 70000,           // V12: 70s per script block (2 scenes)
      POLISH_MS: 80000,                 // V12: 80s for polish pass
      SUMMARIZE_MS: 70000,              // Summarize can take longer
      OUTLINE_ARC_MS: 65000,            // PART_A
      OUTLINE_EPISODES_MS: 75000,       // PART_B/C - more complex
      MERGE_MS: 45000,                  // Merge is faster
      QC_MS: 30000,                     // QC is deterministic
    },
    
    // Model fallback chain (V12: graceful degradation)
    RETRY_MODELS: {
      'openai/gpt-5.2': 'openai/gpt-5',
      'openai/gpt-5': 'openai/gpt-5-mini',
      'openai/gpt-5-mini': 'google/gemini-2.5-flash',
      'google/gemini-2.5-flash': 'google/gemini-2.5-flash-lite',
    } as Record<string, string>,
    
    // Output limits per task type (V12: Hollywood-grade)
    OUTPUT_LIMITS: {
      // Level 0: Bible (single call, high density)
      BIBLE: 6000,                      // V12: Was 1800 → 6000 for complete characters
      
      // Level 1: Outline Master
      OUTLINE_MASTER: 12000,            // V12: NEW - 30+ detailed beats
      OUTLINE: 12000,                   // Alias for compatibility
      
      // Level 2: Scene Cards (8-12 cards per call)
      SCENE_CARDS: 4000,                // V12: NEW
      SCENE_LIST: 4000,                 // Updated
      
      // Level 3: Script Blocks (2 scenes per block)
      SCRIPT_BLOCK: 4500,               // V12: NEW - 2 scenes with creative room
      SCRIPT_BLOCK_HARD: 8000,          // Only for polish/consolidation
      SINGLE_SCENE: 2500,               // V12: Was 1500 → 2500
      
      // Consolidation and polish
      CONSOLIDATION: 8000,              // Maintained
      POLISH_EPISODE: 8000,             // V12: NEW - polish per episode
      
      // Other
      CHUNK_EXTRACTION: 1800,
      GLOBAL_CONSOLIDATION: 3000,
      PRODUCER_DIRECTOR: 1400,
      MICROSHOTS: 2000,
      THREADS: 3000,
      CONTINUITY_SUMMARY: 400,          // V12: NEW - summary between blocks
    },
  }
} as const;

// Type exports
export type ScriptTier = keyof typeof MODEL_CONFIG.SCRIPT;
export type ImageAssetType = keyof typeof MODEL_CONFIG.IMAGE;
export type VideoType = keyof typeof MODEL_CONFIG.VIDEO;
export type OutputLimitType = keyof typeof MODEL_CONFIG.LIMITS.OUTPUT_LIMITS;

// Helper functions
export function getScriptModel(tier: 'hollywood' | 'profesional' | 'rapido' | 'nano' | 'fallback'): string {
  const key = tier.toUpperCase() as keyof typeof MODEL_CONFIG.SCRIPT;
  return MODEL_CONFIG.SCRIPT[key] || MODEL_CONFIG.SCRIPT.FALLBACK;
}

export function getAnalysisModel(type: 'chunk' | 'consolidator' | 'fallback'): string {
  switch (type) {
    case 'chunk': return MODEL_CONFIG.ANALYSIS.CHUNK_EXTRACTOR;
    case 'consolidator': return MODEL_CONFIG.ANALYSIS.CONSOLIDATOR;
    default: return MODEL_CONFIG.ANALYSIS.FALLBACK;
  }
}

export function getDirectorModel(fast: boolean = false): string {
  return fast ? MODEL_CONFIG.DIRECTOR.FAST : MODEL_CONFIG.DIRECTOR.PRIMARY;
}

export function getShotModel(): string {
  return MODEL_CONFIG.SHOTS.PRIMARY;
}

export function getImageEngine(assetType: 'character' | 'location' | 'prop' | 'keyframe'): string {
  const typeMap: Record<string, keyof typeof MODEL_CONFIG.IMAGE> = {
    'character': 'CHARACTERS',
    'location': 'LOCATIONS',
    'prop': 'PROPS',
    'keyframe': 'KEYFRAMES',
  };
  const key = typeMap[assetType] || 'CHARACTERS';
  return MODEL_CONFIG.IMAGE[key];
}

export function getVideoEngine(type: 'narrative' | 'cinematic' | 'transitions'): string {
  const key = type.toUpperCase() as keyof typeof MODEL_CONFIG.VIDEO;
  return MODEL_CONFIG.VIDEO[key] || MODEL_CONFIG.VIDEO.NARRATIVE;
}

// Anti-timeout helpers
export function shouldChunk(inputChars: number): boolean {
  return inputChars > MODEL_CONFIG.LIMITS.CHUNK_SIZE_CHARS;
}

export function shouldForceSummarize(inputChars: number): boolean {
  // Force summarize if estimated tokens > 85% of soft limit
  // Prevents timeouts when prompt overhead pushes total over limits
  const estimatedTokens = estimateTokens(inputChars);
  const threshold = MODEL_CONFIG.LIMITS.MAX_INPUT_TOKENS_SOFT * 0.85;
  return estimatedTokens > threshold;
}

export function getChunkSize(): number {
  return MODEL_CONFIG.LIMITS.CHUNK_SIZE_CHARS;
}

export function getTimeout(): number {
  return MODEL_CONFIG.LIMITS.TIMEOUT_MS;
}

export function getOutputLimit(taskType: OutputLimitType): number {
  return MODEL_CONFIG.LIMITS.OUTPUT_LIMITS[taskType];
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / MODEL_CONFIG.LIMITS.CHARS_PER_TOKEN);
}

// Retry policy helpers
export function getRetryModel(currentModel: string, attempt: number): string {
  // Retry 2+: fallback to different model tier (aligned with RETRY_COUNT=2)
  if (attempt >= 2) {
    if (currentModel.includes('gpt-5.2')) return MODEL_CONFIG.SCRIPT.PROFESIONAL; // gpt-5
    if (currentModel.includes('gpt-5-mini')) return MODEL_CONFIG.SCRIPT.PROFESIONAL; // gpt-5
    return MODEL_CONFIG.SCRIPT.FALLBACK; // gemini-2.5-flash
  }
  return currentModel;
}

export function getRetryChunkSize(originalSize: number, attempt: number): number {
  // Retry 2+: reduce chunk using configured reduction factor
  if (attempt >= 2) {
    return Math.floor(originalSize * MODEL_CONFIG.LIMITS.RETRY_CHUNK_REDUCTION);
  }
  return originalSize;
}

// =============================================================================
// TOKEN FIELD HELPER (OpenAI vs otros proveedores)
// =============================================================================

/**
 * Returns the correct token limit field name based on model provider.
 * OpenAI GPT-5.x models require "max_completion_tokens" (NOT max_tokens).
 * Other providers (Gemini, Claude) still use "max_tokens".
 */
export function getMaxTokensField(model: string): 'max_completion_tokens' | 'max_tokens' {
  if (model.startsWith('openai/')) {
    return 'max_completion_tokens';
  }
  return 'max_tokens';
}

/**
 * Build the token limit object for AI request body.
 * Use this instead of hardcoding max_tokens to ensure compatibility.
 * 
 * @example
 * const payload = {
 *   model,
 *   messages,
 *   ...buildTokenLimit(model, 4000),
 * };
 */
export function buildTokenLimit(model: string, maxTokens: number): Record<string, number> {
  const field = getMaxTokensField(model);
  return { [field]: maxTokens };
}

/**
 * Runtime guard - throws if max_tokens is used with OpenAI model.
 * Add this before fetch() calls during development to catch misconfigurations.
 */
export function validateTokenPayload(model: string, payload: any): void {
  if (model.startsWith('openai/') && payload.max_tokens !== undefined) {
    throw new Error(`FATAL: OpenAI model "${model}" requires max_completion_tokens, not max_tokens. Fix the API call.`);
  }
}
