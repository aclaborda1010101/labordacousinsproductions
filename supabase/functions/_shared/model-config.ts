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
    HOLLYWOOD: 'openai/gpt-5.2',      // Bible, Outline, Guion final
    PROFESIONAL: 'openai/gpt-5',       // Rewrites, variaciones
    RAPIDO: 'openai/gpt-5-mini',       // Borradores, beat-sheets
    NANO: 'openai/gpt-5-nano',         // Loglines, títulos, sinopsis cortas
    FALLBACK: 'google/gemini-2.5-flash', // Emergencia / inputs muy largos
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
    LOCATIONS: 'flux-1.1-pro-ultra',                   // FLUX - spatial composition
    PROPS: 'google/gemini-3-pro-image-preview',        // Nano Banana Pro - consistency
    KEYFRAMES: 'google/gemini-3-pro-image-preview',    // Nano Banana Pro - continuity
  },
  
  // === VIDEO ===
  VIDEO: {
    NARRATIVE: 'kling',      // Escenas narrativas
    CINEMATIC: 'veo-3.1',    // Ultra-definido
    TRANSITIONS: 'runway',   // Transiciones, abstractos
  },
  
  // === LIMITS (V11.1: Industrial pipeline with improved timeouts) ===
  LIMITS: {
    // Token limits per request type
    MAX_INPUT_TOKENS_SOFT: 10000,       // Conservative for reliability
    MAX_OUTPUT_TOKENS_SOFT: 3000,       // Standard requests
    MAX_OUTPUT_TOKENS_HARD: 6000,       // Episode final pass only
    
    // Chunking configuration (V11: overlap for entity preservation)
    CHUNK_SIZE_CHARS: 8000,             // V11: 8k chars per chunk (safer)
    CHUNK_OVERLAP_CHARS: 600,           // V11: Overlap for names/relationships
    CHUNK_PAGES_EXTRACT: 15,            // PDF extraction
    CHUNK_PAGES_WRITE: 5,               // Scene writing (1-3 scenes)
    MAX_SCENES_PER_REQUEST: 10,
    
    // Token estimation
    CHARS_PER_TOKEN: 4,
    
    // Timeout configuration (V11.1: INCREASED for reliability)
    TIMEOUT_MS: 70000,                  // 70s per AI request (was 55s)
    STAGE_TIMEOUT_MS: 85000,            // 85s stage timeout
    RETRY_COUNT: 2,                     // Max retries per substep
    RETRY_CHUNK_REDUCTION: 0.6,         // 60% chunk on retry 1
    RETRY_CHUNK_REDUCTION_2: 0.5,       // 50% chunk on retry 2
    
    // Per-task timeouts (V11.1: differentiated by task type)
    TIMEOUTS: {
      SUMMARIZE_MS: 70000,              // Summarize can take longer
      OUTLINE_ARC_MS: 65000,            // PART_A
      OUTLINE_EPISODES_MS: 75000,       // PART_B/C - more complex
      MERGE_MS: 45000,                  // Merge is faster
      QC_MS: 30000,                     // QC is deterministic
    },
    
    // Model fallback chain (V11: graceful degradation)
    RETRY_MODELS: {
      'openai/gpt-5.2': 'openai/gpt-5',
      'openai/gpt-5': 'openai/gpt-5-mini',
      'openai/gpt-5-mini': 'google/gemini-2.5-flash',
      'google/gemini-2.5-flash': 'google/gemini-2.5-flash-lite',
    } as Record<string, string>,
    
    // Output limits per task type
    OUTPUT_LIMITS: {
      BIBLE: 1800,
      OUTLINE: 1400,
      SCENE_LIST: 2000,
      SINGLE_SCENE: 1500,
      CONSOLIDATION: 6000,
      CHUNK_EXTRACTION: 1800,
      GLOBAL_CONSOLIDATION: 2500,
      PRODUCER_DIRECTOR: 1400,
      MICROSHOTS: 2000,
      THREADS: 3000,                    // V11: Thread generation
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
