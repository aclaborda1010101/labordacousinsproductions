/**
 * VALIDADOR EDITORIAL - Evaluación MVP-safe (v0.2)
 * - Sin azar en reglas A/B
 * - Veredicto explícito (approved|warn|regenerate|reject_explain)
 * - Skipped rules cuando requieren visión/OCR
 * - Prompt patches para prevención/regeneración
 */

import {
  ValidationResult,
  ValidationWarning,
  ValidationSuggestion,
  SkippedRule,
  PromptPatches,
  Project,
  ProjectPhase,
  GenerationRun,
  AbsoluteRule,
  ContextualRule,
  SuggestionRule,
  PhaseConfig,
  DisabledRulesMap,
  OutputType,
  ValidationMethod,
  Verdict,
  PHASE_CONFIGS
} from './editorialTypes';

// ─────────────────────────────────────────────────────────────
// FUENTE EDITORIAL (Embedida para MVP)
// ─────────────────────────────────────────────────────────────

const ABSOLUTE_RULES: AbsoluteRule[] = [
  {
    id: 'A-001',
    name: 'Identidad visual de personajes',
    description: 'Los personajes deben mantener características físicas fundamentales',
    appliesTo: ['image', 'video'],
    validation: { method: 'compare_character_reference' },
    action: 'reject_and_regenerate',
    messageUser: 'El personaje no coincide con su definición. Regenerando para mantener consistencia.'
  },
  {
    id: 'A-002',
    name: 'Coherencia de espacios',
    description: 'Localizaciones deben mantener arquitectura y elementos permanentes',
    appliesTo: ['image', 'video'],
    validation: { method: 'compare_location_reference' },
    action: 'reject_and_regenerate',
    messageUser: 'El espacio no coincide con la localización definida.'
  },
  {
    id: 'A-003',
    name: 'Continuidad narrativa',
    description: 'No contradecir hechos establecidos en el proyecto',
    appliesTo: ['image', 'video', 'text'],
    validation: { method: 'check_narrative_continuity' },
    action: 'reject_and_explain',
    messageUser: 'Esto contradice algo establecido en tu proyecto.'
  },
  {
    id: 'A-004',
    name: 'Integridad anatómica',
    description: 'Anatomía correcta (dedos, extremidades, ojos)',
    appliesTo: ['image', 'video'],
    validation: { method: 'detect_anatomical_anomalies' },
    action: 'prevent_in_prompt',
    negativePromptSnippets: [
      'no extra fingers, no missing fingers, no deformed hands, no mutated limbs',
      'avoid anatomical errors, avoid distorted face, avoid asymmetry'
    ],
    messageUser: 'Posibles errores anatómicos: aplicando prevención en el prompt.'
  },
  {
    id: 'A-005',
    name: 'Legibilidad de texto',
    description: 'Texto en imágenes debe ser legible y correcto',
    appliesTo: ['image'],
    validation: { method: 'ocr_verify' },
    action: 'prevent_in_prompt',
    negativePromptSnippets: [
      'avoid illegible text, avoid gibberish letters, avoid misspellings'
    ],
    messageUser: 'Si pides texto en imagen, puede fallar. Aplicando prevención en el prompt.'
  }
];

const CONTEXTUAL_RULES: ContextualRule[] = [
  {
    id: 'B-001',
    name: 'Coherencia de época',
    description: 'Elementos visuales coherentes con la época del proyecto',
    appliesTo: ['image', 'video'],
    activeByDefault: true,
    disableable: true,
    disableReasons: ['Proyecto con anacronismos intencionales', 'Ciencia ficción / Fantasía'],
    validation: { method: 'detect_era_elements' },
    action: 'warn',
    messageUser: 'Detectado posible anacronismo. ¿Es intencional?'
  },
  {
    id: 'B-002',
    name: 'Coherencia lumínica',
    description: 'Iluminación consistente dentro de una secuencia',
    appliesTo: ['image', 'video'],
    activeByDefault: true,
    disableable: true,
    disableReasons: ['Escena con salto temporal', 'Efecto narrativo intencional'],
    validation: { method: 'compare_lighting_sequence' },
    action: 'warn',
    messageUser: 'La iluminación difiere de otras imágenes de esta secuencia.'
  },
  {
    id: 'B-003',
    name: 'Vestuario consistente',
    description: 'Mantener vestuario dentro de una escena',
    appliesTo: ['image', 'video'],
    activeByDefault: true,
    disableable: true,
    disableReasons: ['Escena incluye cambio de ropa', 'Montaje con elipsis'],
    validation: { method: 'compare_wardrobe_sequence' },
    action: 'warn',
    messageUser: 'El vestuario cambió respecto a la imagen anterior de esta escena.'
  },
  {
    id: 'B-004',
    name: 'Coherencia tonal',
    description: 'Tono visual acorde al definido en el proyecto',
    appliesTo: ['image', 'video'],
    activeByDefault: true,
    disableable: true,
    disableReasons: ['Contraste tonal intencional', 'Escena que rompe tono deliberadamente'],
    validation: { method: 'analyze_mood_palette' },
    action: 'warn',
    messageUser: 'El tono visual no coincide con el definido para tu proyecto.'
  },
  {
    id: 'B-005',
    name: 'Nivel de violencia apropiado',
    description: 'Violencia acorde a la clasificación del proyecto',
    appliesTo: ['image', 'video'],
    activeByDefault: true,
    disableable: true,
    disableReasons: ['Proyecto para adultos', 'Género requiere violencia explícita'],
    validation: { method: 'classify_violence_level' },
    action: 'warn_strong',
    messageUser: 'El nivel de violencia puede exceder la clasificación de tu proyecto.'
  }
];

const SUGGESTION_RULES: SuggestionRule[] = [
  {
    id: 'D-001',
    name: 'Regla de tercios',
    description: 'Composición con puntos de interés',
    appliesTo: ['image'],
    phases: ['exploration', 'production'],
    triggerCondition: 'composition_centered',
    message: '💡 Considera descentrar el sujeto para una composición más dinámica.',
    category: 'composition'
  },
  {
    id: 'D-002',
    name: 'Espacio para mirada',
    description: 'Dar aire en la dirección de la mirada',
    appliesTo: ['image'],
    phases: ['production'],
    triggerCondition: 'subject_looking_edge',
    message: '💡 El personaje mira hacia el borde. Considera dar más "aire" en esa dirección.',
    category: 'composition'
  },
  {
    id: 'D-003',
    name: 'Profundidad de planos',
    description: 'Primer plano, medio y fondo',
    appliesTo: ['image'],
    phases: ['exploration'],
    triggerCondition: 'flat_composition',
    message: '💡 Añadir un elemento en primer plano puede dar más profundidad.',
    category: 'composition'
  },
  {
    id: 'D-004',
    name: 'Punto de interés claro',
    description: 'Foco visual definido',
    appliesTo: ['image'],
    phases: ['exploration', 'production'],
    triggerCondition: 'no_focal_point',
    message: '💡 ¿Cuál es el foco principal de esta imagen?',
    category: 'composition'
  },
  {
    id: 'D-005',
    name: 'Paleta del proyecto',
    description: 'Mantener paleta establecida',
    appliesTo: ['image', 'video'],
    phases: ['production'],
    triggerCondition: 'palette_differs',
    message: '💡 Los colores difieren de tu paleta habitual. Verifica que es intencional.',
    category: 'consistency'
  },
  {
    id: 'D-006',
    name: 'Contraste suficiente',
    description: 'Evitar imagen lavada',
    appliesTo: ['image'],
    phases: ['production'],
    triggerCondition: 'low_contrast',
    message: '💡 Bajo contraste: puede verse lavada en algunas pantallas.',
    category: 'technical'
  }
];

// ─────────────────────────────────────────────────────────────
// TIPOS INTERNOS
// ─────────────────────────────────────────────────────────────

type RuleCheckResult =
  | { status: 'ok' }
  | { status: 'violated'; details?: string }
  | { status: 'skipped'; reason: SkippedRule['reason']; details?: string };

export interface ValidateOptions {
  project: Project;
  phase: ProjectPhase;
  outputType: OutputType;
  previousOutputsInSequence?: GenerationRun[];
  disabledRules?: DisabledRulesMap;
  capabilities?: {
    vision: boolean;
    ocr: boolean;
  };
}

// ─────────────────────────────────────────────────────────────
// FUNCIONES AUXILIARES
// ─────────────────────────────────────────────────────────────

function needsVision(method: ValidationMethod): boolean {
  return [
    'compare_character_reference',
    'compare_location_reference',
    'detect_anatomical_anomalies',
    'detect_era_elements',
    'compare_lighting_sequence',
    'compare_wardrobe_sequence',
    'analyze_mood_palette',
    'classify_violence_level'
  ].includes(method);
}

function needsOCR(method: ValidationMethod): boolean {
  return method === 'ocr_verify';
}

function extractPossibleName(fact: string): string | null {
  const m = fact.match(/\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\b/);
  return m?.[1] ?? null;
}

function checkNarrativeContinuity(run: GenerationRun, project: Project): RuleCheckResult {
  const facts = project.facts ?? [];
  if (!facts.length) {
    return { status: 'skipped', reason: 'missing_facts', details: 'No hay facts/timeline para validar continuidad' };
  }

  const text = `${run.prompt}\n${run.context ?? ''}\n${run.outputText ?? ''}`.toLowerCase();
  const deathFacts = facts.filter(f => /mur(i|ió)|falleci(o|ó)|muerto/i.test(f));
  
  for (const f of deathFacts) {
    const name = extractPossibleName(f);
    if (name && text.includes(name.toLowerCase()) && /vivo|aparece|habla|sonr(í|i)e/i.test(text)) {
      return { status: 'violated', details: `Posible contradicción con fact: "${f}"` };
    }
  }

  return { status: 'ok' };
}

function checkRule(
  method: ValidationMethod,
  run: GenerationRun,
  project: Project,
  _previousOutputs: GenerationRun[],
  capabilities: { vision: boolean; ocr: boolean }
): RuleCheckResult {
  if (method === 'check_narrative_continuity') {
    return checkNarrativeContinuity(run, project);
  }

  if (needsOCR(method) && !capabilities.ocr) {
    return { status: 'skipped', reason: 'needs_ocr', details: 'OCR no disponible en MVP' };
  }

  if (needsVision(method) && !capabilities.vision) {
    return { status: 'skipped', reason: 'needs_vision', details: 'Visión/analítica de imagen no disponible en MVP' };
  }

  return { status: 'ok' };
}

function checkSuggestionTrigger(_rule: SuggestionRule, _run: GenerationRun, _project: Project): boolean {
  // MVP: disparadores suaves con probabilidad baja
  return Math.random() < 0.15;
}

function finalizeResult(args: {
  verdict: Verdict;
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  rulesEvaluated: string[];
  rulesTriggered: string[];
  rulesSkipped: SkippedRule[];
  promptPatches: PromptPatches;
  config: PhaseConfig;
}): ValidationResult {
  const { verdict, warnings, suggestions, rulesEvaluated, rulesTriggered, rulesSkipped, promptPatches, config } = args;

  const critical = warnings.filter(w => w.severity === 'critical');
  const nonCritical = warnings.filter(w => w.severity !== 'critical');
  const capped = [
    ...critical,
    ...nonCritical.slice(0, Math.max(0, config.maxWarnings - critical.length))
  ];

  const finalSuggestions = suggestions.slice(0, config.maxSuggestions);
  const finalVerdict: Verdict = verdict === 'approved' && (capped.length > 0) ? 'warn' : verdict;

  const patches =
    (promptPatches.addNegative?.length || promptPatches.addMustInclude?.length || promptPatches.notes?.length)
      ? promptPatches
      : undefined;

  return {
    verdict: finalVerdict,
    warnings: capped,
    suggestions: finalSuggestions,
    validatedAt: new Date().toISOString(),
    rulesEvaluated,
    rulesTriggered,
    rulesSkipped,
    promptPatches: patches
  };
}

// ─────────────────────────────────────────────────────────────
// VALIDADOR PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function validateOutput(
  run: GenerationRun,
  options: ValidateOptions
): ValidationResult {
  const {
    project,
    phase,
    outputType,
    previousOutputsInSequence = [],
    disabledRules = {},
    capabilities = { vision: false, ocr: false }
  } = options;

  const config = PHASE_CONFIGS[phase];
  const warnings: ValidationWarning[] = [];
  const suggestions: ValidationSuggestion[] = [];
  const rulesEvaluated: string[] = [];
  const rulesTriggered: string[] = [];
  const rulesSkipped: SkippedRule[] = [];
  const promptPatches: PromptPatches = { addNegative: [], addMustInclude: [], notes: [] };
  let verdict: Verdict = 'approved';

  // A) ABSOLUTAS (siempre)
  for (const rule of ABSOLUTE_RULES) {
    if (!rule.appliesTo.includes(outputType)) {
      rulesSkipped.push({ ruleId: rule.id, reason: 'not_applicable' });
      continue;
    }

    rulesEvaluated.push(rule.id);
    const evalResult = checkRule(rule.validation.method, run, project, previousOutputsInSequence, capabilities);

    if (evalResult.status === 'skipped') {
      rulesSkipped.push({ ruleId: rule.id, reason: evalResult.reason, details: evalResult.details });
      
      if (rule.negativePromptSnippets?.length) {
        promptPatches.addNegative?.push(...rule.negativePromptSnippets);
        rulesTriggered.push(rule.id);
        warnings.push({
          ruleId: rule.id,
          type: 'absolute',
          message: rule.messageUser,
          action: 'prevent_in_prompt',
          severity: 'medium',
          details: 'Regla no validable automáticamente en MVP: se aplica prevención.'
        });
        verdict = verdict === 'approved' ? 'warn' : verdict;
      }
      continue;
    }

    if (evalResult.status === 'violated') {
      rulesTriggered.push(rule.id);
      const isHardReject = rule.action === 'reject_and_regenerate' || rule.action === 'reject_and_explain';

      if (isHardReject) {
        verdict = rule.action === 'reject_and_regenerate' ? 'regenerate' : 'reject_explain';
        warnings.push({
          ruleId: rule.id,
          type: 'absolute',
          message: rule.messageUser,
          action: rule.action,
          severity: 'critical',
          details: evalResult.details
        });

        return finalizeResult({
          verdict,
          warnings,
          suggestions: [],
          rulesEvaluated,
          rulesTriggered,
          rulesSkipped,
          promptPatches,
          config
        });
      }

      warnings.push({
        ruleId: rule.id,
        type: 'absolute',
        message: rule.messageUser,
        action: rule.action,
        severity: 'high',
        details: evalResult.details
      });
      verdict = verdict === 'approved' ? 'warn' : verdict;
    }
  }

  // B) CONTEXTUALES (según config y disabledRules)
  if (config.rulesB !== 'ignore') {
    for (const rule of CONTEXTUAL_RULES) {
      if (!rule.appliesTo.includes(outputType)) continue;
      if (!rule.activeByDefault) continue;
      if (disabledRules[rule.id]) continue;

      rulesEvaluated.push(rule.id);
      const evalResult = checkRule(rule.validation.method, run, project, previousOutputsInSequence, capabilities);

      if (evalResult.status === 'skipped') {
        rulesSkipped.push({ ruleId: rule.id, reason: evalResult.reason, details: evalResult.details });
        continue;
      }

      if (evalResult.status === 'violated') {
        rulesTriggered.push(rule.id);
        const severity = config.rulesB === 'apply_strictly' ? 'high' : 'medium';
        const action = config.rulesB === 'apply_strictly' ? 'warn_strong' : 'warn';

        warnings.push({
          ruleId: rule.id,
          type: 'contextual',
          message: rule.messageUser,
          action,
          severity,
          details: evalResult.details
        });

        if (phase === 'production' && action === 'warn_strong') {
          promptPatches.notes?.push(`Considera ajustar el prompt para cumplir la regla ${rule.id}.`);
        }
        verdict = verdict === 'approved' ? 'warn' : verdict;
      }
    }
  }

  // D) SUGERENCIAS
  if (config.suggestions !== 'hide') {
    const applicable = SUGGESTION_RULES.filter(s =>
      s.appliesTo.includes(outputType) && s.phases.includes(phase)
    );

    const triggered = applicable
      .filter(rule => checkSuggestionTrigger(rule, run, project))
      .slice(0, config.maxSuggestions);

    for (const rule of triggered) {
      suggestions.push({ ruleId: rule.id, message: rule.message, category: rule.category });
    }
  }

  return finalizeResult({
    verdict,
    warnings,
    suggestions,
    rulesEvaluated,
    rulesTriggered,
    rulesSkipped,
    promptPatches,
    config
  });
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES EXPORTADAS
// ─────────────────────────────────────────────────────────────

export function getAllRules() {
  return {
    absolute: ABSOLUTE_RULES,
    contextual: CONTEXTUAL_RULES,
    suggestions: SUGGESTION_RULES
  };
}

export function getRuleById(ruleId: string) {
  const all = [...ABSOLUTE_RULES, ...CONTEXTUAL_RULES, ...SUGGESTION_RULES];
  return all.find(r => r.id === ruleId) || null;
}

export function isRuleDisableable(ruleId: string): boolean {
  const rule = CONTEXTUAL_RULES.find(r => r.id === ruleId);
  return rule?.disableable ?? false;
}

export function getDisableReasons(ruleId: string): string[] {
  const rule = CONTEXTUAL_RULES.find(r => r.id === ruleId);
  return rule?.disableReasons ?? [];
}

export function getPhaseConfig(phase: ProjectPhase): PhaseConfig {
  return PHASE_CONFIGS[phase];
}

export function getVerdictIcon(verdict: Verdict): string {
  switch (verdict) {
    case 'approved': return '✓';
    case 'warn': return '⚠';
    case 'regenerate': return '↻';
    case 'reject_explain': return '✕';
  }
}

export function getVerdictColor(verdict: Verdict): string {
  switch (verdict) {
    case 'approved': return 'text-green-600';
    case 'warn': return 'text-amber-600';
    case 'regenerate': return 'text-orange-600';
    case 'reject_explain': return 'text-red-600';
  }
}

export default {
  validateOutput,
  getAllRules,
  getRuleById,
  isRuleDisableable,
  getDisableReasons,
  getPhaseConfig,
  getVerdictIcon,
  getVerdictColor
};
