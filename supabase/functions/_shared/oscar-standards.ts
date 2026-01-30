/**
 * OSCAR STANDARDS - Métricas extraídas de análisis de guiones ganadores del Oscar
 * Fuente: Análisis de Pulp Fiction, Good Will Hunting, American Beauty,
 *         The Godfather, The Social Network, Juno (memory/screenplay-patterns.md)
 * 
 * Estas métricas complementan screenplay-standards.ts con datos reales.
 */

// =============================================================================
// DIALOGUE STANDARDS (basado en análisis de 6 Oscar winners)
// =============================================================================

export const OSCAR_DIALOGUE_METRICS = {
  // Words per minute in dialogue
  avgWPM: 108,              // Media de los 6 guiones
  minWPM: 80,               // The Godfather (deliberado, operático)
  maxWPM: 180,              // The Social Network (Sorkin hiperrrápido)
  
  // Dialogue to action ratio (for drama)
  dialogueRatio: {
    drama: 0.74,            // 74% diálogo
    comedy: 0.75,           // 75% diálogo
    thriller: 0.65,         // 65% diálogo
    action: 0.40,           // 40% diálogo
  },
  
  // Subtext ratio (meaning conveyed indirectly)
  subtextTarget: 0.4,       // 40% del significado via subtexto
  
  // Monologue allowance
  maxMonologuePercent: 0.15, // 15% puede ser monólogo
  maxMonologueWords: 250,    // ~2 min de monólogo máximo
};

// =============================================================================
// STRUCTURE STANDARDS (basado en análisis de 6 Oscar winners)
// =============================================================================

export const OSCAR_STRUCTURE = {
  // Page counts
  avgPages: 136,            // Media: 135.6 páginas
  minPages: 105,            // Juno
  maxPages: 165,            // The Godfather / The Social Network
  
  // Scene counts
  avgScenes: 76,            // Media de escenas
  minScenes: 45,            // Pulp Fiction (escenas largas)
  maxScenes: 140,           // The Social Network (escenas ultra-cortas)
  
  // Pages per scene
  avgPagesPerScene: 2.1,
  
  // INT/EXT ratio for drama
  intExtRatio: 0.71,        // 71% INT / 29% EXT
  
  // Act structure (still classic 3-act)
  act1Percent: 0.25,        // 25%
  act2Percent: 0.50,        // 50%
  act3Percent: 0.25,        // 25%
  
  // Plot points per film
  avgPlotPoints: 5,         // 4-6 principales
};

// =============================================================================
// CHARACTER STANDARDS
// =============================================================================

export const OSCAR_CHARACTER_STANDARDS = {
  // Number of main characters
  avgMainCharacters: 5.5,
  minMainCharacters: 4,
  maxMainCharacters: 10,    // Ensemble cast (Godfather)
  
  // Protagonist requirements
  requiresTransformation: true,
  transformationTypes: ['moral', 'emotional', 'success/isolation', 'maturity', 'corruption'],
  
  // Voice distinctiveness
  requiresUniqueVoice: true,
  voiceTraits: [
    'vocabulary',           // Unique word choices
    'rhythm',               // Sentence length patterns
    'catchphrases',         // Recurring expressions
    'subtext_style',        // How they avoid direct meaning
  ]
};

// =============================================================================
// SETUP/PAYOFF STANDARDS
// =============================================================================

export const OSCAR_SETUP_PAYOFF = {
  // Frequency
  majorSetupEveryPages: 12,   // 1 setup mayor cada 10-15 páginas
  
  // Distance to payoff
  avgPayoffDistance: 25,      // ~25 minutos promedio
  minPayoffDistance: 10,      // Mínimo 10 min (no inmediato)
  maxPayoffDistance: 60,      // Máximo 60 min (no olvidado)
  
  // Types
  visualSetupPayoff: true,    // Objetos recurrentes (roses, maletín)
  verbalSetupPayoff: true,    // Líneas que se repiten con nuevo significado
  
  // Final payoff rule
  finalPayoffResolvesOpening: true, // El payoff final debe conectar con el setup del opening
};

// =============================================================================
// PACING STANDARDS
// =============================================================================

export const OSCAR_PACING = {
  // Scene duration variance
  allowLongScenes: true,      // Algunas escenas de 8-15 min OK
  avgSceneDuration: 3.8,      // 3.8 minutos promedio
  
  // Contrast required
  requiresContrastSequences: true, // Alternar drama/humor, calma/tensión
  
  // Action percentage (for drama)
  maxActionPercent: 0.25,     // 25% máximo de secuencias de acción
  
  // Pacing types by genre
  pacingProfiles: {
    drama: 'medio',           // Character-driven
    comedy: 'rapido',         // Setup/payoff rhythm
    thriller: 'variable',     // Slow build + explosive moments
    action: 'rapido',         // Setpiece chain
  }
};

// =============================================================================
// VOICE PROFILES (de autores específicos)
// =============================================================================

export type VoiceProfile = {
  id: string;
  name: string;
  wpm: number;
  dialoguePace: 'slow' | 'medium' | 'fast' | 'hyperfast';
  signatureDevices: string[];
  writingRules: string[];
  avoidPatterns: string[];
};

export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  sorkin: {
    id: 'sorkin',
    name: 'Aaron Sorkin',
    wpm: 160,
    dialoguePace: 'hyperfast',
    signatureDevices: [
      'walk-and-talk',
      'overlapping dialogue',
      'intellectual sparring',
      'repetition with escalation',
      'rapid-fire comebacks'
    ],
    writingRules: [
      'Characters speak in complete, articulate sentences',
      'Arguments are debates with clear positions',
      'Exposition delivered through conflict',
      'Every scene has a winner and loser'
    ],
    avoidPatterns: [
      'ums and ahs',
      'trailing off...',
      'simple one-word responses'
    ]
  },
  
  tarantino: {
    id: 'tarantino',
    name: 'Quentin Tarantino',
    wpm: 110,
    dialoguePace: 'medium',
    signatureDevices: [
      'pop culture references',
      'mundane conversations with hidden tension',
      'chapter structure',
      'non-linear timeline',
      'sudden violence after calm'
    ],
    writingRules: [
      'Characters discuss trivial topics at length',
      'Violence is sudden and graphic',
      'Conversations reveal character through opinion',
      'Music cues are specific and intentional'
    ],
    avoidPatterns: [
      'generic action descriptions',
      'obvious exposition',
      'predictable sequence of events'
    ]
  },
  
  cody: {
    id: 'cody',
    name: 'Diablo Cody',
    wpm: 130,
    dialoguePace: 'fast',
    signatureDevices: [
      'invented slang',
      'pop culture fluency',
      'sardonic observations',
      'emotional truth under irony'
    ],
    writingRules: [
      'Teens speak smarter than expected',
      'Humor masks vulnerability',
      'Cultural references are specific, not generic',
      'Voice is consistent but not realistic'
    ],
    avoidPatterns: [
      'generic teen speak',
      'obvious emotional statements',
      'earnest without irony'
    ]
  },
  
  ball: {
    id: 'ball',
    name: 'Alan Ball (American Beauty)',
    wpm: 110,
    dialoguePace: 'medium',
    signatureDevices: [
      'voiceover with irony',
      'suburban satire',
      'visual symbolism',
      'dark comedy in mundane settings'
    ],
    writingRules: [
      'Subtext > text always',
      'Characters say one thing, mean another',
      'Beauty found in unexpected places',
      'Death/mortality as backdrop'
    ],
    avoidPatterns: [
      'characters saying how they feel',
      'obvious symbolism',
      'simple good/evil dynamics'
    ]
  }
};

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

export function validateDialogueWPM(wordCount: number, durationMinutes: number): { valid: boolean; wpm: number; feedback: string } {
  const wpm = wordCount / durationMinutes;
  
  if (wpm < OSCAR_DIALOGUE_METRICS.minWPM) {
    return { valid: false, wpm, feedback: `Diálogo demasiado lento (${wpm.toFixed(0)} WPM). Mínimo: ${OSCAR_DIALOGUE_METRICS.minWPM}` };
  }
  if (wpm > OSCAR_DIALOGUE_METRICS.maxWPM) {
    return { valid: false, wpm, feedback: `Diálogo demasiado rápido (${wpm.toFixed(0)} WPM). Máximo: ${OSCAR_DIALOGUE_METRICS.maxWPM}` };
  }
  
  return { valid: true, wpm, feedback: 'WPM dentro de rango Oscar' };
}

export function validateStructure(pages: number, scenes: number): { valid: boolean; feedback: string[] } {
  const feedback: string[] = [];
  let valid = true;
  
  if (pages < OSCAR_STRUCTURE.minPages) {
    feedback.push(`Muy corto: ${pages} páginas (mínimo ${OSCAR_STRUCTURE.minPages})`);
    valid = false;
  }
  if (pages > OSCAR_STRUCTURE.maxPages) {
    feedback.push(`Muy largo: ${pages} páginas (máximo ${OSCAR_STRUCTURE.maxPages})`);
    valid = false;
  }
  
  const pagesPerScene = pages / scenes;
  if (pagesPerScene < 1) {
    feedback.push(`Escenas muy cortas: ${pagesPerScene.toFixed(1)} págs/escena`);
  }
  if (pagesPerScene > 4) {
    feedback.push(`Escenas muy largas: ${pagesPerScene.toFixed(1)} págs/escena`);
  }
  
  return { valid, feedback };
}

export function getVoiceProfile(voiceId: string): VoiceProfile | null {
  return VOICE_PROFILES[voiceId] || null;
}
