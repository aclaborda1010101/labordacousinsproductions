// ============= USER EXPERIENCE PROFILE SYSTEM =============
// Defines user profiles aligned with Creative Modes (ASSISTED / PRO)
// ASSISTED = guided experience, PRO = full control

export type UserProfile = 'ASSISTED' | 'PRO';

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
  ASSISTED: {
    label: 'Asistido',
    shortLabel: 'Asistido',
    description: 'El sistema te guía paso a paso y protege la coherencia',
    icon: '🧭',
    color: 'text-sky-600 dark:text-sky-400',
    bgColor: 'bg-sky-50 dark:bg-sky-950/30',
    borderColor: 'border-sky-200 dark:border-sky-800',
  },
  PRO: {
    label: 'Profesional',
    shortLabel: 'Pro',
    description: 'Control total sobre técnica y decisiones creativas',
    icon: '🎬',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800',
  },
};

// UX behavior configuration per profile
export interface ProfileUXBehavior {
  // Flow control
  flowType: 'guided' | 'direct';
  showStepNumbers: boolean;
  showNextStepSuggestion: boolean;
  allowSkipSteps: boolean;
  
  // Messaging
  messageVerbosity: 'detailed' | 'concise';
  showEducationalHints: boolean;
  showReassurance: boolean;
  
  // Warnings
  warningLevel: 'all' | 'critical-only';
  blockOnWarnings: boolean;
  
  // Help
  showContextualHelp: boolean;
  autoExpandHelp: boolean;
}

export const PROFILE_UX_BEHAVIOR: Record<UserProfile, ProfileUXBehavior> = {
  ASSISTED: {
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
  PRO: {
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
    ASSISTED: {
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
    PRO: {
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
        label: 'Soy curioso, quiero aprender',
        value: 'beginner',
        profileWeight: { ASSISTED: 3, PRO: 0 },
      },
      {
        label: 'Trabajo profesionalmente en cine/TV/streaming',
        value: 'professional',
        profileWeight: { ASSISTED: 0, PRO: 3 },
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
        profileWeight: { ASSISTED: 3, PRO: 0 },
      },
      {
        label: 'Mínima intervención, máximo control',
        value: 'minimal',
        profileWeight: { ASSISTED: 0, PRO: 3 },
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
        profileWeight: { ASSISTED: 3, PRO: 0 },
      },
      {
        label: 'Completas, acceso inmediato a todo',
        value: 'complete',
        profileWeight: { ASSISTED: 0, PRO: 3 },
      },
    ],
  },
];

// Calculate profile from onboarding answers
export function calculateProfileFromAnswers(
  answers: Record<string, string>
): { profile: UserProfile; confidence: number } {
  const scores: Record<UserProfile, number> = {
    ASSISTED: 0,
    PRO: 0,
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
  let detectedProfile: UserProfile = 'ASSISTED';

  for (const [profile, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedProfile = profile as UserProfile;
    }
  }

  // Calculate confidence (0-1) based on how clear the preference is
  const sortedScores = Object.values(scores).sort((a, b) => b - a);
  const spread = sortedScores[0] - sortedScores[1];
  const maxPossibleSpread = totalWeight / 2; // Theoretical max difference (now 2 profiles)
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
