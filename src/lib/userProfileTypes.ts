// ============= USER EXPERIENCE PROFILE SYSTEM =============
// Defines user profiles for adaptive UX (parallel to Creative Modes)
// EXPLORER = needs guidance, CREATOR = has clear goal, PROFESSIONAL = max efficiency

export type UserProfile = 'EXPLORER' | 'CREATOR' | 'PROFESSIONAL';

export interface UserProfileConfig {
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const USER_PROFILE_CONFIG: Record<UserProfile, UserProfileConfig> = {
  EXPLORER: {
    label: 'Explorador',
    shortLabel: 'Explorador',
    description: 'Busco inspiración y quiero descubrir las posibilidades del sistema',
    icon: '🧭',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    borderColor: 'border-sky-200 dark:border-sky-800',
  },
  CREATOR: {
    label: 'Creador',
    shortLabel: 'Creador',
    description: 'Tengo un objetivo claro y quiero control con criterio',
    icon: '✨',
    color: 'text-violet-600 dark:text-violet-400',
    bgColor: 'bg-violet-50 dark:bg-violet-950/30',
    borderColor: 'border-violet-200 dark:border-violet-800',
  },
  PROFESSIONAL: {
    label: 'Profesional',
    shortLabel: 'Pro',
    description: 'Conozco narrativa y producción, priorizo eficiencia',
    icon: '🎬',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
};

// UX behavior configuration per profile
export interface ProfileUXBehavior {
  // Flow control
  flowType: 'guided' | 'recommended' | 'direct';
  showStepNumbers: boolean;
  showNextStepSuggestion: boolean;
  allowSkipSteps: boolean;
  
  // Messaging
  messageVerbosity: 'detailed' | 'balanced' | 'concise';
  showEducationalHints: boolean;
  showReassurance: boolean;
  
  // Warnings
  warningLevel: 'all' | 'important' | 'critical-only';
  blockOnWarnings: boolean;
  
  // Help
  showContextualHelp: boolean;
  autoExpandHelp: boolean;
}

export const PROFILE_UX_BEHAVIOR: Record<UserProfile, ProfileUXBehavior> = {
  EXPLORER: {
    flowType: 'guided',
    showStepNumbers: true,
    showNextStepSuggestion: true,
    allowSkipSteps: false,
    messageVerbosity: 'detailed',
    showEducationalHints: true,
    showReassurance: true,
    warningLevel: 'all',
    blockOnWarnings: true,
    showContextualHelp: true,
    autoExpandHelp: true,
  },
  CREATOR: {
    flowType: 'recommended',
    showStepNumbers: true,
    showNextStepSuggestion: true,
    allowSkipSteps: true,
    messageVerbosity: 'balanced',
    showEducationalHints: false,
    showReassurance: false,
    warningLevel: 'important',
    blockOnWarnings: false,
    showContextualHelp: true,
    autoExpandHelp: false,
  },
  PROFESSIONAL: {
    flowType: 'direct',
    showStepNumbers: false,
    showNextStepSuggestion: false,
    allowSkipSteps: true,
    messageVerbosity: 'concise',
    showEducationalHints: false,
    showReassurance: false,
    warningLevel: 'critical-only',
    blockOnWarnings: false,
    showContextualHelp: false,
    autoExpandHelp: false,
  },
};

// Microcopy templates per profile
export interface MicrocopyContext {
  phase?: string;
  action?: string;
  consequence?: string;
}

export const getMicrocopy = (
  profile: UserProfile,
  type: 'progress' | 'warning' | 'success' | 'guidance' | 'transition',
  context?: MicrocopyContext
): string => {
  const templates: Record<UserProfile, Record<string, string[]>> = {
    EXPLORER: {
      progress: [
        'Estamos construyendo los cimientos de tu historia',
        'Cada paso que das fortalece tu proyecto',
        'El sistema está aprendiendo tu visión',
      ],
      warning: [
        'Este paso evita incoherencias después',
        'Te recomendamos revisar esto antes de continuar',
        'No te preocupes, esto se puede ajustar más adelante',
      ],
      success: [
        '¡Excelente! Has completado esta fase con éxito',
        'Tu proyecto está tomando forma',
        'Estás avanzando muy bien',
      ],
      guidance: [
        'El siguiente paso te ayudará a definir...',
        'Ahora vamos a trabajar en...',
        'Te guiaré en el proceso de...',
      ],
      transition: [
        'Pasemos al siguiente paso cuando estés listo',
        'Tómate tu tiempo, no hay prisa',
        'Cuando te sientas cómodo, continuamos',
      ],
    },
    CREATOR: {
      progress: [
        'Fase en progreso',
        'Avanzando en la estructura narrativa',
        'Consolidando decisiones creativas',
      ],
      warning: [
        'Este cambio puede afectar a elementos ya definidos',
        'Recomendamos cerrar esta fase antes de avanzar',
        'Esta decisión fija el tono global del proyecto',
      ],
      success: [
        'Fase completada',
        'Estructura validada',
        'Listo para producción',
      ],
      guidance: [
        'Próximo paso recomendado:',
        'Considera revisar:',
        'Opciones disponibles:',
      ],
      transition: [
        'Puedes continuar o ajustar',
        'Fase estable, siguiente disponible',
        'Validación completa',
      ],
    },
    PROFESSIONAL: {
      progress: [
        'Procesando...',
        'En curso',
        'Generando',
      ],
      warning: [
        'Conflicto de continuidad detectado',
        'Elemento bloqueado por dependencia narrativa',
        'Advertencia: cambio estructural',
      ],
      success: [
        'Completado',
        'Validado',
        'OK',
      ],
      guidance: [
        'Siguiente:',
        'Pendiente:',
        'Disponible:',
      ],
      transition: [
        'Continuar',
        'Siguiente fase',
        'Avanzar',
      ],
    },
  };

  const messages = templates[profile][type] || templates[profile].progress;
  return messages[Math.floor(Math.random() * messages.length)];
};

// Onboarding questions for profile detection
export interface OnboardingQuestion {
  id: string;
  question: string;
  options: {
    label: string;
    value: string;
    profileWeight: Record<UserProfile, number>;
  }[];
}

export const ONBOARDING_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 'experience',
    question: '¿Cuál es tu experiencia con narrativa o producción audiovisual?',
    options: [
      {
        label: 'Soy curioso, quiero explorar',
        value: 'beginner',
        profileWeight: { EXPLORER: 3, CREATOR: 1, PROFESSIONAL: 0 },
      },
      {
        label: 'He escrito historias o guiones antes',
        value: 'intermediate',
        profileWeight: { EXPLORER: 1, CREATOR: 3, PROFESSIONAL: 1 },
      },
      {
        label: 'Trabajo profesionalmente en cine/TV/streaming',
        value: 'professional',
        profileWeight: { EXPLORER: 0, CREATOR: 1, PROFESSIONAL: 3 },
      },
    ],
  },
  {
    id: 'objective',
    question: '¿Qué quieres lograr con este proyecto?',
    options: [
      {
        label: 'Experimentar y ver qué surge',
        value: 'explore',
        profileWeight: { EXPLORER: 3, CREATOR: 1, PROFESSIONAL: 0 },
      },
      {
        label: 'Desarrollar una idea específica que tengo',
        value: 'develop',
        profileWeight: { EXPLORER: 1, CREATOR: 3, PROFESSIONAL: 1 },
      },
      {
        label: 'Producir contenido listo para distribución',
        value: 'produce',
        profileWeight: { EXPLORER: 0, CREATOR: 1, PROFESSIONAL: 3 },
      },
    ],
  },
  {
    id: 'guidance',
    question: '¿Cuánta guía esperas del sistema?',
    options: [
      {
        label: 'Que me acompañe paso a paso',
        value: 'full',
        profileWeight: { EXPLORER: 3, CREATOR: 1, PROFESSIONAL: 0 },
      },
      {
        label: 'Sugerencias útiles pero libertad para decidir',
        value: 'balanced',
        profileWeight: { EXPLORER: 1, CREATOR: 3, PROFESSIONAL: 1 },
      },
      {
        label: 'Mínima intervención, máximo control',
        value: 'minimal',
        profileWeight: { EXPLORER: 0, CREATOR: 1, PROFESSIONAL: 3 },
      },
    ],
  },
  {
    id: 'complexity',
    question: '¿Cómo prefieres las interfaces?',
    options: [
      {
        label: 'Simples y claras, solo lo esencial',
        value: 'simple',
        profileWeight: { EXPLORER: 3, CREATOR: 2, PROFESSIONAL: 0 },
      },
      {
        label: 'Equilibradas, opciones visibles cuando las necesito',
        value: 'balanced',
        profileWeight: { EXPLORER: 1, CREATOR: 3, PROFESSIONAL: 1 },
      },
      {
        label: 'Completas, acceso inmediato a todo',
        value: 'complete',
        profileWeight: { EXPLORER: 0, CREATOR: 1, PROFESSIONAL: 3 },
      },
    ],
  },
];

// Calculate profile from onboarding answers
export function calculateProfileFromAnswers(
  answers: Record<string, string>
): { profile: UserProfile; confidence: number } {
  const scores: Record<UserProfile, number> = {
    EXPLORER: 0,
    CREATOR: 0,
    PROFESSIONAL: 0,
  };

  let totalWeight = 0;

  for (const question of ONBOARDING_QUESTIONS) {
    const answer = answers[question.id];
    if (!answer) continue;

    const option = question.options.find((o) => o.value === answer);
    if (!option) continue;

    for (const profile of Object.keys(scores) as UserProfile[]) {
      scores[profile] += option.profileWeight[profile];
      totalWeight += option.profileWeight[profile];
    }
  }

  // Find highest scoring profile
  let maxScore = 0;
  let detectedProfile: UserProfile = 'EXPLORER';

  for (const [profile, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedProfile = profile as UserProfile;
    }
  }

  // Calculate confidence (0-1) based on how clear the preference is
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const spread = sortedScores[0] - sortedScores[1];
  const maxPossibleSpread = totalWeight / 3; // Theoretical max difference
  const confidence = Math.min(1, spread / Math.max(1, maxPossibleSpread));

  return {
    profile: detectedProfile,
    confidence: Math.round(confidence * 100) / 100,
  };
}

// Telemetry signal types for adaptive behavior
export type TelemetrySignalType =
  | 'help_request'
  | 'warning_ignored'
  | 'warning_accepted'
  | 'phase_completed_solo'
  | 'advanced_feature_used'
  | 'structural_reversion'
  | 'coherence_violation'
  | 'time_anomaly'
  | 'editorial_intervention';

export interface TelemetrySignal {
  type: TelemetrySignalType;
  context?: Record<string, unknown>;
  weight?: number; // 1-10, default 5
}
