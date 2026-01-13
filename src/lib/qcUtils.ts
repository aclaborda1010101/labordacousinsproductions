/**
 * QC Utilities for V11 Pipeline UI
 * Human-readable messages and icons for QC blockers/warnings
 */

export type PipelineStage = 'light' | 'operational' | 'threaded' | 'showrunner';

export interface QCStatus {
  pipelineStage: PipelineStage;
  blockers: string[];
  warnings: string[];
  score: number;
  canGenerateEpisodes: boolean;
}

// Badge colors per stage
export const STAGE_CONFIG: Record<PipelineStage, {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  light: {
    label: 'Básico',
    emoji: '🟡',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
  },
  operational: {
    label: 'Operativo',
    emoji: '🟠',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
  },
  threaded: {
    label: 'Listo para episodios',
    emoji: '🟢',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  showrunner: {
    label: 'Showrunner',
    emoji: '🔵',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
};

// Human-readable blocker messages
const BLOCKER_MESSAGES: Record<string, string> = {
  // Season arc
  'SEASON_ARC:inciting_incident_missing': 'Falta el incidente incitador del arco',
  'SEASON_ARC:first_turn_missing': 'Falta el primer giro del arco',
  'SEASON_ARC:midpoint_reversal_missing': 'Falta el punto medio del arco',
  'SEASON_ARC:all_is_lost_missing': 'Falta el momento "todo está perdido"',
  'SEASON_ARC:final_choice_missing': 'Falta la elección final del arco',
  
  // Episodes
  'EPISODES:episode_beats_missing': 'No hay episodios definidos',
  
  // Outline incomplete (pipeline didn't finish)
  'OUTLINE_INCOMPLETE:no_episodes_generated': '⚠️ El outline no tiene episodios. Regenera el outline para continuar.',
  
  // Title/cast
  'TITLE:missing': 'Falta el título del proyecto',
  
  // Thread usage
  'thread_usage_invalid': 'Los episodios necesitan asignación de tramas (A/B/C)',
  
  // Threads
  'threads:needs_5-8': 'Faltan threads narrativos (mínimo 5)',
  
  // Factions
  'factions:less_than_2': 'Faltan facciones en conflicto (mínimo 2)',
  
  // Entity rules
  'entity_rules:missing_but_entities_detected': 'Se detectaron entidades pero faltan reglas operativas',
};

/**
 * Convert a blocker code to human-readable message
 */
export function humanizeBlocker(code: string): string {
  // Check direct match
  if (BLOCKER_MESSAGES[code]) {
    return BLOCKER_MESSAGES[code];
  }
  
  // Pattern matching for dynamic blockers
  
  // OUTLINE_INCOMPLETE - pipeline didn't complete all episodes
  if (code.startsWith('OUTLINE_INCOMPLETE:')) {
    const episodesMatch = code.match(/OUTLINE_INCOMPLETE:(\d+)\/(\d+)_episodes/);
    if (episodesMatch) {
      return `⚠️ Outline incompleto: solo ${episodesMatch[1]} de ${episodesMatch[2]} episodios generados. Regenera el outline.`;
    }
    // Generic fallback for no episodes
    if (code.includes('no_episodes')) {
      return '⚠️ El outline no tiene episodios. Regenera el outline para continuar.';
    }
  }
  
  if (code.startsWith('EPISODES:')) {
    const match = code.match(/EPISODES:(\d+)\/(\d+)/);
    if (match) {
      return `Episodios incompletos: ${match[1]} de ${match[2]}`;
    }
  }
  
  if (code.startsWith('CAST:')) {
    const match = code.match(/CAST:(\d+)\/(\d+)/);
    if (match) {
      return `Personajes insuficientes: ${match[1]} de ${match[2]} mínimo`;
    }
  }
  
  if (code.match(/EP\d+:/)) {
    const epMatch = code.match(/EP(\d+):(.+)/);
    if (epMatch) {
      const epNum = epMatch[1];
      const issue = epMatch[2];
      
      if (issue === 'central_conflict_invalid') {
        return `Episodio ${epNum}: falta conflicto central`;
      }
      if (issue.startsWith('turning_points_')) {
        const tpMatch = issue.match(/turning_points_(\d+)\/4/);
        if (tpMatch) {
          return `Episodio ${epNum}: solo ${tpMatch[1]} de 4 turning points`;
        }
      }
      if (issue === 'setpiece_invalid') {
        return `Episodio ${epNum}: setpiece incompleto (falta stakes o participantes)`;
      }
      if (issue === 'cliffhanger_missing') {
        return `Episodio ${epNum}: falta cliffhanger`;
      }
      if (issue === 'thread_usage_invalid') {
        return `Episodio ${epNum}: falta asignación de threads (A + crossover)`;
      }
    }
  }
  
  if (code.match(/EP\d+_TP\d+:/)) {
    const tpMatch = code.match(/EP(\d+)_TP(\d+):(.+)/);
    if (tpMatch) {
      const [, epNum, tpNum, issue] = tpMatch;
      if (issue === 'is_string_must_be_object') {
        return `Ep${epNum} TP${tpNum}: debe ser objeto con agent/event/consequence`;
      }
      if (issue === 'agent_missing') {
        return `Ep${epNum} TP${tpNum}: falta el agente`;
      }
      if (issue === 'event_missing') {
        return `Ep${epNum} TP${tpNum}: falta el evento`;
      }
      if (issue === 'consequence_missing') {
        return `Ep${epNum} TP${tpNum}: falta la consecuencia`;
      }
      if (issue === 'generic_phrase') {
        return `Ep${epNum} TP${tpNum}: frase genérica detectada`;
      }
    }
  }
  
  // Fallback: clean up the code
  return code.replace(/_/g, ' ').replace(/:/g, ': ');
}

/**
 * Get the suggested action based on current blockers
 */
export function getSuggestedAction(blockers: string[], pipelineStage: PipelineStage): {
  action: 'enrich' | 'threads' | 'showrunner' | 'ready';
  label: string;
  description: string;
} {
  // Check for arc/setpiece/turning point issues -> needs enrich
  const needsEnrich = blockers.some(b => 
    b.includes('SEASON_ARC:') || 
    b.includes('setpiece') || 
    b.includes('turning_points') ||
    b.includes('factions')
  );
  
  if (needsEnrich || pipelineStage === 'light') {
    return {
      action: 'enrich',
      label: 'Añadir Carne Operativa',
      description: 'Añade hitos, facciones, setpieces y turning points estructurados',
    };
  }
  
  // Check for thread issues
  const needsThreads = blockers.some(b => 
    b.includes('thread') || 
    b.includes('threads')
  );
  
  if (needsThreads || pipelineStage === 'operational') {
    return {
      action: 'threads',
      label: 'Generar Tramas y Subtramas',
      description: 'Crea carriles narrativos y asigna cruces por episodio',
    };
  }
  
  if (pipelineStage === 'threaded' && blockers.length === 0) {
    return {
      action: 'ready',
      label: 'Generar Episodios',
      description: 'El outline está listo para producción',
    };
  }
  
  return {
    action: 'showrunner',
    label: 'Pulir con Showrunner',
    description: 'Mejora precisión y coherencia sin cambiar la estructura',
  };
}

/**
 * Group blockers by category for better UI
 */
export function groupBlockers(blockers: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    'Arco de Temporada': [],
    'Episodios': [],
    'Threads': [],
    'Otros': [],
  };
  
  for (const blocker of blockers) {
    if (blocker.includes('OUTLINE_INCOMPLETE:')) {
      // OUTLINE_INCOMPLETE goes first and as its own category
      groups['Outline Incompleto'] = groups['Outline Incompleto'] || [];
      groups['Outline Incompleto'].push(humanizeBlocker(blocker));
    } else if (blocker.includes('SEASON_ARC:')) {
      groups['Arco de Temporada'].push(humanizeBlocker(blocker));
    } else if (blocker.match(/EP\d+/) || blocker.includes('EPISODES:')) {
      groups['Episodios'].push(humanizeBlocker(blocker));
    } else if (blocker.includes('thread')) {
      groups['Threads'].push(humanizeBlocker(blocker));
    } else {
      groups['Otros'].push(humanizeBlocker(blocker));
    }
  }
  
  // Remove empty groups
  return Object.fromEntries(
    Object.entries(groups).filter(([, items]) => items.length > 0)
  );
}
