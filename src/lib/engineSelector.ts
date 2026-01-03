/**
 * ENGINE SELECTOR - Selección automática de motor (MVP v0.2)
 * nano-banana para exploración/variantes, FLUX para producción/canon
 */

import {
  Engine,
  EngineSelection,
  ProjectPhase,
  EXPLORATION_KEYWORDS,
  PRODUCTION_KEYWORDS
} from './editorialTypes';

function normalize(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const t = normalize(text);
  return keywords.some(k => t.includes(normalize(k)));
}

/**
 * Selecciona motor según:
 * 1) override del usuario
 * 2) keywords en intención/contexto
 * 3) fase del proyecto
 */
export function selectEngine(
  intent: string,
  projectPhase: ProjectPhase,
  userOverride: Engine | null = null,
  context: string = ''
): EngineSelection {
  const merged = `${intent}\n${context}`;

  // 1) Override
  if (userOverride) {
    return {
      engine: userOverride,
      selectedBy: 'user',
      reason: 'Selección manual del usuario',
      confidence: 1
    };
  }

  // 2) Keywords
  const isProductionish = containsAnyKeyword(merged, PRODUCTION_KEYWORDS);
  const isExplorationish = containsAnyKeyword(merged, EXPLORATION_KEYWORDS);

  if (isProductionish && !isExplorationish) {
    return {
      engine: 'flux',
      selectedBy: 'auto',
      reason: 'Detectado intento de producción/canon/consistencia',
      confidence: 0.9,
      alternativeEngine: 'nano-banana',
      alternativeReason: 'Usar para ideación/variaciones si es necesario'
    };
  }

  if (isExplorationish && !isProductionish) {
    return {
      engine: 'nano-banana',
      selectedBy: 'auto',
      reason: 'Detectado intento de exploración/variaciones/ideación',
      confidence: 0.9,
      alternativeEngine: 'flux',
      alternativeReason: 'Usar para fijar una variante como canon'
    };
  }

  // 3) Default por fase
  if (projectPhase === 'production') {
    return {
      engine: 'flux',
      selectedBy: 'auto',
      reason: 'Fase de producción (FLUX por defecto)',
      confidence: 0.7,
      alternativeEngine: 'nano-banana',
      alternativeReason: 'Usar para ideación rápida o alternativas'
    };
  }

  return {
    engine: 'nano-banana',
    selectedBy: 'auto',
    reason: 'Fase de exploración (nano-banana por defecto)',
    confidence: 0.7,
    alternativeEngine: 'flux',
    alternativeReason: 'Usar para fijar una variante seleccionada como canon'
  };
}

/**
 * Obtiene la razón de selección formateada para UI
 */
export function getEngineSelectionExplanation(selection: EngineSelection): string {
  const base = `Motor: ${selection.engine.toUpperCase()} (${selection.reason})`;
  
  if (selection.alternativeEngine && selection.alternativeReason) {
    return `${base}\n💡 Alternativa: ${selection.alternativeEngine} - ${selection.alternativeReason}`;
  }
  
  return base;
}

/**
 * Verifica si el motor es apropiado para la fase
 */
export function isEngineRecommendedForPhase(engine: Engine, phase: ProjectPhase): boolean {
  if (phase === 'production') {
    return engine === 'flux';
  }
  return engine === 'nano-banana';
}

export default {
  selectEngine,
  getEngineSelectionExplanation,
  isEngineRecommendedForPhase
};
