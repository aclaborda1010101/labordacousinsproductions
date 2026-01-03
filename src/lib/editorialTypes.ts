/**
 * ESQUEMA DE DATOS - SISTEMA EDITORIAL MVP (v0.2)
 * Tipos, interfaces y modelos de datos mejorados
 */

// ─────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────

export type ProjectPhase = 'exploration' | 'production';
export type OutputType = 'image' | 'video' | 'text';
export type Engine = 'nano-banana' | 'flux';
export type EngineSelectionSource = 'auto' | 'user';

export type OutputStatus =
  | 'draft'
  | 'generated'
  | 'regenerating'
  | 'accepted'
  | 'rejected'
  | 'failed';

export type Verdict = 'approved' | 'warn' | 'regenerate' | 'reject_explain';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type RuleType = 'absolute' | 'contextual' | 'suggestion';

export type RuleAction =
  | 'reject_and_regenerate'
  | 'reject_and_explain'
  | 'warn'
  | 'warn_strong'
  | 'suggest'
  | 'prevent_in_prompt';

export type ValidationScope = 'prompt' | 'output_text' | 'output_image' | 'output_video';

export type ValidationMethod =
  | 'compare_character_reference'
  | 'compare_location_reference'
  | 'check_narrative_continuity'
  | 'detect_anatomical_anomalies'
  | 'ocr_verify'
  | 'detect_era_elements'
  | 'compare_lighting_sequence'
  | 'compare_wardrobe_sequence'
  | 'analyze_mood_palette'
  | 'classify_violence_level';

// ─────────────────────────────────────────────────────────────
// MODELOS PRINCIPALES
// ─────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  genre: string;
  tone: string;
  era: string;
  classification: 'family' | 'teen' | 'adult' | 'adult_plus';
  phase: ProjectPhase;
  characters: Character[];
  locations: Location[];
  facts?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  fixedTraits: string[];
  referenceImageUrl?: string;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  fixedElements: string[];
  referenceImageUrl?: string;
}

export interface OutputMetadata {
  width?: number;
  height?: number;
  seed?: string;
  model?: string;
  engine?: Engine;
  extra?: Record<string, unknown>;
}

export interface GenerationRun {
  id: string;
  prompt: string;
  context?: string;
  projectId: string;
  phase: ProjectPhase;
  outputType: OutputType;
  engine: Engine;
  engineSelectedBy: EngineSelectionSource;
  engineReason: string;
  outputUrl?: string;
  outputText?: string;
  outputMetadata?: OutputMetadata;
  validation: ValidationResult;
  status: OutputStatus;
  isCanon: boolean;
  createdAt: string;
  completedAt?: string;
  acceptedAt?: string;
  generationTimeMs?: number;
  regenerationCount: number;
  userEdited: boolean;
}

// ─────────────────────────────────────────────────────────────
// SELECCIÓN DE MOTOR
// ─────────────────────────────────────────────────────────────

export interface EngineSelection {
  engine: Engine;
  selectedBy: EngineSelectionSource;
  reason: string;
  confidence: number;
  alternativeEngine?: Engine;
  alternativeReason?: string;
}

export interface EngineConfig {
  id: Engine;
  name: string;
  bestFor: string[];
  phaseDefault: ProjectPhase;
  notes: string;
}

// ─────────────────────────────────────────────────────────────
// REGLAS EDITORIALES
// ─────────────────────────────────────────────────────────────

export interface BaseRule {
  id: string;
  name: string;
  description: string;
  appliesTo: OutputType[];
  scope?: ValidationScope[];
  validation: { method: ValidationMethod };
  negativePromptSnippets?: string[];
  mustIncludeSnippets?: string[];
}

export interface AbsoluteRule extends BaseRule {
  type?: 'absolute';
  action: Extract<RuleAction, 'reject_and_regenerate' | 'reject_and_explain' | 'warn' | 'prevent_in_prompt'>;
  messageUser: string;
}

export interface ContextualRule extends BaseRule {
  type?: 'contextual';
  activeByDefault: boolean;
  disableable: boolean;
  disableReasons: string[];
  action: Extract<RuleAction, 'warn' | 'warn_strong' | 'prevent_in_prompt'>;
  messageUser: string;
}

export interface SuggestionRule {
  id: string;
  type?: 'suggestion';
  name: string;
  description: string;
  appliesTo: OutputType[];
  phases: ProjectPhase[];
  triggerCondition: string;
  message: string;
  category: 'composition' | 'consistency' | 'technical' | 'narrative';
}

// ─────────────────────────────────────────────────────────────
// VALIDACIÓN
// ─────────────────────────────────────────────────────────────

export interface ValidationWarning {
  ruleId: string;
  type: Exclude<RuleType, 'suggestion'>;
  message: string;
  action: RuleAction;
  severity: Severity;
  details?: string;
}

export interface ValidationSuggestion {
  ruleId: string;
  message: string;
  category: SuggestionRule['category'];
}

export interface SkippedRule {
  ruleId: string;
  reason: 'needs_vision' | 'needs_ocr' | 'missing_references' | 'missing_facts' | 'not_applicable';
  details?: string;
}

export interface PromptPatches {
  addNegative?: string[];
  addMustInclude?: string[];
  notes?: string[];
}

export interface ValidationResult {
  verdict: Verdict;
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  validatedAt: string;
  rulesEvaluated: string[];
  rulesTriggered: string[];
  rulesSkipped: SkippedRule[];
  promptPatches?: PromptPatches;
}

export interface PhaseConfig {
  rulesA: 'apply_always';
  rulesB: 'ignore' | 'apply_as_warning' | 'apply_strictly';
  suggestions: 'hide' | 'show_selectively' | 'show_all_relevant';
  tolerance: 'high' | 'low';
  messageTone: 'exploratory' | 'professional';
  maxWarnings: number;
  maxSuggestions: number;
}

export type DisabledRulesMap = Record<
  string,
  { reason: string; note?: string; disabledAt: string }
>;

// ─────────────────────────────────────────────────────────────
// KEYWORDS Y CONFIGS
// ─────────────────────────────────────────────────────────────

export const EXPLORATION_KEYWORDS = [
  'variantes', 'variaciones', 'opciones', 'pruebas', 'moodboard', 'ideas',
  'estilos', 'explorar', 'inspiración', 'concept', 'boceto', 'look'
];

export const PRODUCTION_KEYWORDS = [
  'definitivo', 'canon', 'keyframe', 'continuidad', 'mantener identidad',
  'consistente', 'misma cara', 'misma ropa', 'exacto', 'producción'
];

export const ENGINE_CONFIGS: EngineConfig[] = [
  {
    id: 'nano-banana',
    name: 'nano-banana',
    bestFor: ['Exploración', 'Variaciones', 'Ideación rápida'],
    phaseDefault: 'exploration',
    notes: 'Úsalo para explorar estilos y variantes. Puede ser menos consistente.'
  },
  {
    id: 'flux',
    name: 'FLUX',
    bestFor: ['Producción', 'Keyframes canon', 'Consistencia'],
    phaseDefault: 'production',
    notes: 'Úsalo para outputs "definitivos" y coherencia visual.'
  }
];

// ─────────────────────────────────────────────────────────────
// PHASE CONFIG
// ─────────────────────────────────────────────────────────────

export const PHASE_CONFIGS: Record<ProjectPhase, PhaseConfig> = {
  exploration: {
    rulesA: 'apply_always',
    rulesB: 'apply_as_warning',
    suggestions: 'show_selectively',
    tolerance: 'high',
    messageTone: 'exploratory',
    maxWarnings: 2,
    maxSuggestions: 1
  },
  production: {
    rulesA: 'apply_always',
    rulesB: 'apply_strictly',
    suggestions: 'show_all_relevant',
    tolerance: 'low',
    messageTone: 'professional',
    maxWarnings: 3,
    maxSuggestions: 3
  }
};
