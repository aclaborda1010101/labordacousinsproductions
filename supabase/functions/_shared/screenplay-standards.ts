/**
 * SCREENPLAY STANDARDS - Industry-standard rules for script generation
 * These rules apply to ALL script generation, regardless of project
 */

// =============================================================================
// DENSITY STANDARDS (scenes per runtime)
// =============================================================================

export interface DensityStandards {
  scenesPerMinute: number;
  minScenesFor90Min: number;
  maxScenesFor90Min: number;
  avgWordsPerScene: number;
  avgPagesPerScene: number;
  wordsPerPage: number;
}

export const DENSITY_BY_FORMAT: Record<string, DensityStandards> = {
  // Films
  'film': {
    scenesPerMinute: 0.55,  // ~1 scene every 1.8 minutes
    minScenesFor90Min: 45,
    maxScenesFor90Min: 60,
    avgWordsPerScene: 200,  // 150-250 words per scene
    avgPagesPerScene: 1.2,  // 1-1.5 pages per scene
    wordsPerPage: 180       // Industry standard: ~180 words/page
  },
  'film_comedy': {
    scenesPerMinute: 0.9,   // Comedies are faster paced - based on Superbad, Hangover analysis
    minScenesFor90Min: 80,  // Multi-protagonist comedies need more scenes
    maxScenesFor90Min: 100,
    avgWordsPerScene: 150,  // Shorter, punchier scenes
    avgPagesPerScene: 0.9,
    wordsPerPage: 180
  },
  'film_comedy_ensemble': {
    scenesPerMinute: 1.1,   // Ensemble comedies (3+ protagonists) need even more
    minScenesFor90Min: 90,
    maxScenesFor90Min: 120,
    avgWordsPerScene: 140,
    avgPagesPerScene: 0.8,
    wordsPerPage: 180
  },
  'film_thriller': {
    scenesPerMinute: 0.5,
    minScenesFor90Min: 40,
    maxScenesFor90Min: 55,
    avgWordsPerScene: 220,
    avgPagesPerScene: 1.3,
    wordsPerPage: 180
  },
  'film_drama': {
    scenesPerMinute: 0.45,
    minScenesFor90Min: 38,
    maxScenesFor90Min: 50,
    avgWordsPerScene: 250,
    avgPagesPerScene: 1.4,
    wordsPerPage: 180
  },
  // Series
  'series': {
    scenesPerMinute: 0.7,   // TV is faster
    minScenesFor90Min: 55,  // For 45-min episode: 28-35 scenes
    maxScenesFor90Min: 75,
    avgWordsPerScene: 150,
    avgPagesPerScene: 0.9,
    wordsPerPage: 180
  }
};

// =============================================================================
// STRUCTURE STANDARDS (act breakdown)
// =============================================================================

export interface ActStructure {
  act1Percent: number;  // % of total runtime
  act2Percent: number;
  act3Percent: number;
  act1Scenes: number;   // % of total scenes
  act2Scenes: number;
  act3Scenes: number;
}

export const STRUCTURE_FILM: ActStructure = {
  act1Percent: 0.25,    // 25% of runtime (~22 min for 90 min film)
  act2Percent: 0.50,    // 50% of runtime (~45 min)
  act3Percent: 0.25,    // 25% of runtime (~22 min)
  act1Scenes: 0.28,     // 28% of scenes (~14 for 50-scene film)
  act2Scenes: 0.50,     // 50% of scenes (~25)
  act3Scenes: 0.22      // 22% of scenes (~11)
};

export const STRUCTURE_SERIES: ActStructure = {
  act1Percent: 0.20,    // TV is front-loaded
  act2Percent: 0.55,
  act3Percent: 0.25,
  act1Scenes: 0.22,
  act2Scenes: 0.55,
  act3Scenes: 0.23
};

// =============================================================================
// SCENE STANDARDS
// =============================================================================

export const SCENE_RULES = {
  // Length limits
  maxWordsPerScene: 350,      // Hard cap
  minWordsPerScene: 80,       // Too short = not a scene
  maxDialogueLinesPerScene: 15,
  maxActionLinesPerBlock: 3,  // Max consecutive action lines
  maxDialogueWordsPerLine: 25, // ~2 lines on page
  
  // Content rules
  maxParentheticalWords: 4,   // (whispers) not (whispers angrily while looking away)
  requireConflict: true,      // Every scene needs conflict
  requireObjective: true,     // POV character needs goal
  
  // Pacing
  maxConsecutiveDialogueExchanges: 6, // Then action/description needed
  minScenesBetweenSameLocation: 3     // Avoid repetition
};

// =============================================================================
// QUALITY RULES (anti-generic)
// =============================================================================

export const FORBIDDEN_PHRASES = [
  // Spanish
  "algo cambia", "todo cambia", "se da cuenta", "la tensión aumenta",
  "empiezan a", "surge un conflicto", "nada volverá a ser igual",
  "algo en su interior", "una determinación", "siente que",
  "por primera vez", "de repente", "sin saber por qué",
  "la atmósfera se vuelve", "el ambiente cambia",
  // English
  "something changes", "everything changes", "realizes that",
  "tension rises", "nothing will ever be the same",
  "for the first time", "suddenly", "without knowing why"
];

export const FORBIDDEN_PATTERNS = [
  /suspira (internamente|para sí)/i,
  /piensa (en|que|sobre)/i,
  /siente (una|que|como)/i,
  /nota (que|como|una)/i,
  /percibe (que|como|una)/i,
  /algo (parece|ha cambiado|es) diferente/i
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate required scenes for a given runtime
 */
export function calculateRequiredScenes(
  runtimeMinutes: number, 
  format: string,
  genre?: string
): { min: number; max: number; target: number } {
  const key = genre ? `${format}_${genre.toLowerCase()}` : format;
  const standards = DENSITY_BY_FORMAT[key] || DENSITY_BY_FORMAT[format] || DENSITY_BY_FORMAT['film'];
  
  const target = Math.round(runtimeMinutes * standards.scenesPerMinute);
  const min = Math.round(target * 0.85);
  const max = Math.round(target * 1.15);
  
  return { min, max, target };
}

/**
 * Calculate act breakdown for scene count
 */
export function calculateActBreakdown(
  totalScenes: number,
  format: string = 'film'
): { act1: number; act2: number; act3: number } {
  const structure = format === 'series' ? STRUCTURE_SERIES : STRUCTURE_FILM;
  
  return {
    act1: Math.round(totalScenes * structure.act1Scenes),
    act2: Math.round(totalScenes * structure.act2Scenes),
    act3: Math.round(totalScenes * structure.act3Scenes)
  };
}

/**
 * Build density requirements prompt block
 */
export function buildDensityPromptBlock(
  runtimeMinutes: number,
  format: string,
  genre?: string
): string {
  const scenes = calculateRequiredScenes(runtimeMinutes, format, genre);
  const acts = calculateActBreakdown(scenes.target, format);
  const key = genre ? `${format}_${genre.toLowerCase()}` : format;
  const standards = DENSITY_BY_FORMAT[key] || DENSITY_BY_FORMAT[format] || DENSITY_BY_FORMAT['film'];
  
  return `
═══════════════════════════════════════════════════════════════════
⚠️ DENSIDAD OBLIGATORIA (ESTÁNDAR INDUSTRIA)
═══════════════════════════════════════════════════════════════════

DURACIÓN: ${runtimeMinutes} minutos
ESCENAS REQUERIDAS: ${scenes.min}-${scenes.max} (objetivo: ${scenes.target})

DISTRIBUCIÓN POR ACTOS:
- Acto 1: ~${acts.act1} escenas (setup, presentación)
- Acto 2: ~${acts.act2} escenas (confrontación, desarrollo)
- Acto 3: ~${acts.act3} escenas (resolución)

LONGITUD POR ESCENA:
- Máximo: ${SCENE_RULES.maxWordsPerScene} palabras
- Objetivo: ${standards.avgWordsPerScene} palabras
- Mínimo: ${SCENE_RULES.minWordsPerScene} palabras

RITMO:
- 1 escena cada ~${Math.round(runtimeMinutes / scenes.target * 10) / 10} minutos
- Escenas cortas y punzantes
- Si una escena supera 2 páginas, DIVIDIR

═══════════════════════════════════════════════════════════════════
`;
}

/**
 * Build quality rules prompt block
 */
export function buildQualityRulesBlock(): string {
  return `
═══════════════════════════════════════════════════════════════════
⚠️ FORMATO DE ESCENA OBLIGATORIO (NO NEGOCIABLE)
═══════════════════════════════════════════════════════════════════

CADA ESCENA DEBE TENER:
1. SLUGLINE: INT./EXT. LUGAR - MOMENTO (primera línea, siempre)
2. DESCRIPCIÓN: 4-8 líneas de acción/ambiente (NO opcional)
3. DIÁLOGO: 3-6 intercambios mínimo por escena
4. LONGITUD: 120-250 palabras POR ESCENA (OBLIGATORIO)

EJEMPLO DE ESCENA CORRECTA:
---
INT. URGENCIAS HOSPITAL - NOCHE

Luz de fluorescentes. BALTASAR (45, negro, bata blanca) firma papeles 
en el mostrador. Las ojeras delatan un turno de catorce horas. 
Un BORRACHO (60s, barba descuidada) se acerca tambaleándose.

BORRACHO
¿Tú eres el Rey Mago? ¿El Baltasar?

Baltasar no levanta la vista. Sigue escribiendo.

BALTASAR
Soy el doctor Nkosi. ¿En qué puedo ayudarle?

BORRACHO
(acercándose demasiado)
Mi nieto quiere una bici. ¿Se la vas a traer o qué?

Baltasar cierra el expediente. Lo mira directamente.

BALTASAR
Vuelva a su cama, señor.

El borracho parpadea. Se da la vuelta y camina hacia su 
habitación sin decir nada más.
---

═══════════════════════════════════════════════════════════════════
⚠️ PROHIBICIONES ABSOLUTAS (RECHAZO AUTOMÁTICO)
═══════════════════════════════════════════════════════════════════

FORMATO:
- NO markdown, NO asteriscos, NO formateo especial
- NO escenas de menos de 100 palabras
- SOLO texto plano con formato de guión

FRASES PROHIBIDAS:
${FORBIDDEN_PHRASES.slice(0, 8).map(p => `- "${p}"`).join('\n')}

PATRONES PROHIBIDOS:
- "(para sí mismo)" → ELIMINAR
- "piensa que..." → ELIMINAR
- "siente una..." → mostrar con ACCIÓN
- "algo cambia" → mostrar QUÉ cambia específicamente

═══════════════════════════════════════════════════════════════════
`;
}

/**
 * Validate scene against standards
 */
export function validateSceneStandards(sceneText: string): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  const wordCount = sceneText.split(/\s+/).length;
  
  // Check length
  if (wordCount > SCENE_RULES.maxWordsPerScene) {
    errors.push(`Escena demasiado larga: ${wordCount} palabras (máx ${SCENE_RULES.maxWordsPerScene})`);
  }
  if (wordCount < SCENE_RULES.minWordsPerScene) {
    warnings.push(`Escena muy corta: ${wordCount} palabras (mín ${SCENE_RULES.minWordsPerScene})`);
  }
  
  // Check forbidden phrases
  for (const phrase of FORBIDDEN_PHRASES) {
    if (sceneText.toLowerCase().includes(phrase.toLowerCase())) {
      errors.push(`Frase prohibida encontrada: "${phrase}"`);
    }
  }
  
  // Check forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(sceneText)) {
      errors.push(`Patrón prohibido encontrado: ${pattern.toString()}`);
    }
  }
  
  // Check slugline
  if (!/^(INT\.|EXT\.|INT\.\/EXT\.)/.test(sceneText.trim())) {
    errors.push('Falta slugline válido (INT./EXT.)');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
