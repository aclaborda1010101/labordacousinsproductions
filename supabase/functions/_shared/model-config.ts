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
  
  // === LIMITS (anti-timeout) ===
  LIMITS: {
    CHUNK_SIZE_CHARS: 15000,         // ~10-15 páginas
    MAX_SCENES_PER_REQUEST: 10,
    TIMEOUT_MS: 90000,               // 90s por request
    RETRY_COUNT: 2,
  }
} as const;

// Type exports
export type ScriptTier = keyof typeof MODEL_CONFIG.SCRIPT;
export type ImageAssetType = keyof typeof MODEL_CONFIG.IMAGE;
export type VideoType = keyof typeof MODEL_CONFIG.VIDEO;

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
