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
    CONSOLIDATOR: 'openai/gpt-5.2',          // Unificación final
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
    CHARACTERS: 'google/gemini-2.5-flash-image',  // Nano Banana - identity lock
    LOCATIONS: 'flux-1.1-pro-ultra',              // FLUX - spatial composition
    PROPS: 'google/gemini-2.5-flash-image',       // Nano Banana - consistency
    KEYFRAMES: 'google/gemini-2.5-flash-image',   // Nano Banana - continuity
  },
  
  // === VIDEO ===
  VIDEO: {
    NARRATIVE: 'kling',      // Escenas narrativas
    CINEMATIC: 'veo-3.1',    // Ultra-definido
    TRANSITIONS: 'runway',   // Transiciones, abstractos
  },
  
  // === LIMITS (V10: Industrial pipeline with 4 substeps) ===
  LIMITS: {
    // Token limits per request type
    MAX_INPUT_TOKENS_SOFT: 10000,       // Conservative for reliability
    MAX_OUTPUT_TOKENS_SOFT: 3000,       // Standard requests
    MAX_OUTPUT_TOKENS_HARD: 6000,       // Episode final pass only
    
    // Chunking configuration
    CHUNK_SIZE_CHARS: 10000,            // V10: 10k chars per chunk
    CHUNK_PAGES_EXTRACT: 15,            // PDF extraction
    CHUNK_PAGES_WRITE: 5,               // Scene writing (1-3 scenes)
    MAX_SCENES_PER_REQUEST: 10,
    
    // Token estimation
    CHARS_PER_TOKEN: 4,
    
    // Timeout configuration (V10: tuned for 4-substep pipeline)
    TIMEOUT_MS: 55000,                  // 55s per AI request
    STAGE_TIMEOUT_MS: 80000,            // 80s stage, 10s margin before gateway
    RETRY_COUNT: 2,                     // Max retries per substep
    RETRY_CHUNK_REDUCTION: 0.6,         // 60% chunk on retry
    
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
  // Retry 3: fallback to different model tier
  if (attempt >= 3) {
    if (currentModel.includes('gpt-5.2')) return MODEL_CONFIG.SCRIPT.PROFESIONAL;
    if (currentModel.includes('gpt-5-mini')) return MODEL_CONFIG.SCRIPT.PROFESIONAL;
    return MODEL_CONFIG.SCRIPT.FALLBACK;
  }
  return currentModel;
}

export function getRetryChunkSize(originalSize: number, attempt: number): number {
  // Retry 2: reduce chunk by 50%
  if (attempt >= 2) return Math.floor(originalSize / 2);
  return originalSize;
}
