/**
 * MVP Sistema Editorial Jerárquico - Tipos
 */

// Fases del proyecto
export type EditorialProjectPhase = 'exploracion' | 'produccion';

// Tipos de regla editorial
export type EditorialRuleType = 'A' | 'B' | 'D';

// Severidad de regla (1-5, 5 = más crítico)
export type EditorialRuleSeverity = '1' | '2' | '3' | '4' | '5';

// Método de validación
export type EditorialValidationMethod = 
  | 'prompt_check' 
  | 'output_text_check' 
  | 'output_vision_check' 
  | 'bible_contradiction_check'
  | 'none';

// Acción en caso de fallo
export type EditorialActionOnFail = 
  | 'reject_regenerate' 
  | 'reject_explain' 
  | 'warn' 
  | 'suggest';

// Veredicto de generación
export type GenerationVerdict = 'approved' | 'warn' | 'regenerate';

// Tipo de evento de telemetría
export type TelemetryEventType = 'accept' | 'reject' | 'regenerate' | 'edit';

// Proyecto Editorial
export interface EditorialProject {
  id: string;
  name: string;
  phase: EditorialProjectPhase;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

// Asset: Personaje
export interface AssetCharacter {
  id: string;
  projectId: string;
  name: string;
  traitsText: string;
  referenceImageUrl?: string;
  fixedTraits: string[];
  createdAt: string;
  updatedAt: string;
}

// Asset: Locación
export interface AssetLocation {
  id: string;
  projectId: string;
  name: string;
  traitsText: string;
  referenceImageUrl?: string;
  fixedElements: string[];
  createdAt: string;
  updatedAt: string;
}

// Biblia del Proyecto
export interface ProjectBible {
  id: string;
  projectId: string;
  tone?: string;
  period?: string;
  rating?: string;
  facts: string[];
  createdAt: string;
  updatedAt: string;
}

// Regla Editorial
export interface EditorialRule {
  id: string;
  ruleCode: string;
  ruleType: EditorialRuleType;
  name: string;
  description: string;
  appliesTo: string[];
  scope: string[];
  severity: EditorialRuleSeverity;
  activeDefault: boolean;
  toggleable: boolean;
  disableReasons: string[];
  validationMethod: EditorialValidationMethod;
  mustInclude: string[];
  mustAvoid: string[];
  negativePromptSnippets: string[];
  actionOnFail: EditorialActionOnFail;
  actionOnFailProduction?: EditorialActionOnFail;
  userMessageTemplate: string;
  appliesInExploration: boolean;
  appliesInProduction: boolean;
}

// Override de regla por proyecto
export interface ProjectRuleOverride {
  id: string;
  projectId: string;
  ruleId: string;
  isActive: boolean;
  disableReason?: string;
}

// Ejecución de generación
export interface GenerationRun {
  id: string;
  projectId: string;
  engine: string;
  inputIntent: string;
  context?: string;
  usedAssetIds: string[];
  composedPrompt: string;
  negativePrompt?: string;
  outputUrl?: string;
  outputText?: string;
  verdict: GenerationVerdict;
  triggeredRules: string[];
  warnings: Array<{ ruleCode: string; message: string }>;
  suggestions: Array<{ ruleCode: string; message: string }>;
  rulePlan?: RulePlan;
  createdAt: string;
}

// Plan de reglas a aplicar
export interface RulePlan {
  activeRules: Array<{
    ruleCode: string;
    ruleType: EditorialRuleType;
    action: EditorialActionOnFail;
    reason: string;
  }>;
  phase: EditorialProjectPhase;
  toleranceLevel: 'high' | 'low';
}

// Evento de telemetría
export interface TelemetryEvent {
  id: string;
  projectId: string;
  runId?: string;
  eventType: TelemetryEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

// Contexto de generación (para el pipeline)
export interface GenerationContext {
  project: EditorialProject;
  bible?: ProjectBible;
  characters: AssetCharacter[];
  locations: AssetLocation[];
  selectedAssetIds: string[];
  intent: string;
  narrativeContext?: string;
}

// Resultado de validación
export interface ValidationResult {
  passed: boolean;
  verdict: GenerationVerdict;
  triggeredRules: string[];
  warnings: Array<{ ruleCode: string; message: string }>;
  suggestions: Array<{ ruleCode: string; message: string }>;
  blockers: Array<{ ruleCode: string; message: string }>;
}

// Prompt compuesto
export interface ComposedPrompt {
  mainPrompt: string;
  negativePrompt: string;
  mustInclude: string[];
  context: {
    tone?: string;
    period?: string;
    rating?: string;
  };
}

// Límites de mensajes por fase
export const PHASE_LIMITS = {
  exploracion: {
    maxWarnings: 3,
    maxSuggestions: 2,
    toleranceLevel: 'high' as const
  },
  produccion: {
    maxWarnings: 3,
    maxSuggestions: 3,
    toleranceLevel: 'low' as const
  }
};

// Engines disponibles en MVP
export const MVP_ENGINES = [
  { id: 'nano-banana', name: 'Nano Banana Pro', type: 'image' as const },
  { id: 'flux-ultra', name: 'FLUX Pro Ultra', type: 'image' as const }
] as const;

// Tono predefinidos
export const PRESET_TONES = [
  'Oscuro', 'Esperanzador', 'Satírico', 'Melancólico', 
  'Épico', 'Íntimo', 'Surrealista', 'Documental', 'Noir'
];

// Épocas predefinidas
export const PRESET_PERIODS = [
  'Contemporáneo', 'Medieval', 'Victoriano', 'Años 20',
  'Años 50', 'Años 80', 'Futurista', 'Post-apocalíptico', 'Atemporal'
];

// Clasificaciones
export const PRESET_RATINGS = ['G', 'PG', 'PG-13', 'R', 'NC-17'];
