/**
 * Hierarchical Editorial Sources System
 * Controls AI engine behavior through layered rules
 */

// Supported AI Engines
export type AIEngineId = 
  | 'nano-banana' 
  | 'flux-ultra' 
  | 'kling-v2' 
  | 'veo' 
  | 'chatgpt' 
  | 'claude' 
  | 'gemini'
  | 'lovable-ai';

export const AI_ENGINE_DISPLAY_NAMES: Record<AIEngineId, string> = {
  'nano-banana': 'Nano Banana Pro',
  'flux-ultra': 'FLUX Pro Ultra',
  'kling-v2': 'Kling v2',
  'veo': 'Google Veo',
  'chatgpt': 'ChatGPT',
  'claude': 'Claude',
  'gemini': 'Gemini',
  'lovable-ai': 'Lovable AI'
};

// Engine capabilities
export interface EngineCapabilities {
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsText: boolean;
  supportsKeyframeAnchor: boolean;
  maxDurationSec?: number;
  strengthAreas: string[];
  weaknessAreas: string[];
}

export const ENGINE_CAPABILITIES: Record<AIEngineId, EngineCapabilities> = {
  'nano-banana': {
    supportsImage: true,
    supportsVideo: false,
    supportsText: false,
    supportsKeyframeAnchor: false,
    strengthAreas: ['character consistency', 'face quality', 'reference matching'],
    weaknessAreas: ['complex scenes', 'multiple subjects', 'text rendering']
  },
  'flux-ultra': {
    supportsImage: true,
    supportsVideo: false,
    supportsText: false,
    supportsKeyframeAnchor: false,
    strengthAreas: ['photorealism', 'architecture', 'landscapes', 'lighting'],
    weaknessAreas: ['text', 'hands', 'complex poses']
  },
  'kling-v2': {
    supportsImage: false,
    supportsVideo: true,
    supportsText: false,
    supportsKeyframeAnchor: true,
    maxDurationSec: 10,
    strengthAreas: ['motion quality', 'keyframe consistency', 'action sequences'],
    weaknessAreas: ['long durations', 'face stability', 'rapid movements']
  },
  'veo': {
    supportsImage: false,
    supportsVideo: true,
    supportsText: false,
    supportsKeyframeAnchor: false,
    maxDurationSec: 8,
    strengthAreas: ['cinematic quality', 'atmospheric scenes', 'camera movements'],
    weaknessAreas: ['face consistency', 'text', 'precise timing']
  },
  'chatgpt': {
    supportsImage: false,
    supportsVideo: false,
    supportsText: true,
    supportsKeyframeAnchor: false,
    strengthAreas: ['structured output', 'technical precision', 'formatting'],
    weaknessAreas: ['verbosity', 'creative subtlety']
  },
  'claude': {
    supportsImage: false,
    supportsVideo: false,
    supportsText: true,
    supportsKeyframeAnchor: false,
    strengthAreas: ['narrative depth', 'nuance', 'creative writing', 'consistency'],
    weaknessAreas: ['structured data', 'brevity']
  },
  'gemini': {
    supportsImage: true,
    supportsVideo: false,
    supportsText: true,
    supportsKeyframeAnchor: false,
    strengthAreas: ['multimodal', 'analysis', 'context understanding'],
    weaknessAreas: ['creative risks', 'edge cases']
  },
  'lovable-ai': {
    supportsImage: true,
    supportsVideo: false,
    supportsText: true,
    supportsKeyframeAnchor: false,
    strengthAreas: ['general purpose', 'fast iteration', 'cost effective'],
    weaknessAreas: ['specialized tasks', 'highest quality']
  }
};

// Editorial Rule Categories
export type CentralRuleCategory = 'narrative' | 'quality' | 'coherence' | 'style' | 'safety';
export type EngineRuleCategory = 'prompt_style' | 'common_errors' | 'quality_control' | 'limitations';
export type EnforcementLevel = 'required' | 'recommended' | 'optional';

// Central Editorial Rule
export interface CentralEditorialRule {
  id: string;
  category: CentralRuleCategory;
  ruleKey: string;
  ruleName: string;
  description: string;
  priority: number; // 1-100
  isActive: boolean;
  enforcementLevel: EnforcementLevel;
}

// Engine-Specific Editorial Rule
export interface EngineEditorialRule {
  id: string;
  engineId: AIEngineId;
  engineDisplayName: string;
  category: EngineRuleCategory;
  ruleKey: string;
  ruleName: string;
  description: string;
  promptModification?: string;
  negativePatterns?: string[];
  validationChecks?: Record<string, unknown>;
  priority: number;
  isActive: boolean;
}

// Project Editorial Configuration
export interface ProjectEditorialConfig {
  projectId: string;
  centralRuleOverrides: Record<string, { active?: boolean; priority?: number }>;
  engineRuleOverrides: Record<string, Record<string, { active?: boolean }>>;
  customCentralRules: CentralEditorialRule[];
  customEngineRules: Record<string, EngineEditorialRule[]>;
  preferredEngines: Record<string, AIEngineId>;
}

// Editorial Decision (for logging)
export interface EditorialDecision {
  projectId: string;
  engineId: AIEngineId;
  decisionType: 'prompt_modified' | 'output_rejected' | 'warning_issued' | 'rule_applied';
  originalIntent: string;
  modifiedPrompt?: string;
  rulesApplied: string[];
  outcome: 'accepted' | 'rejected' | 'warning_shown';
  userAction?: 'accepted' | 'overridden' | 'modified';
  metadata?: Record<string, unknown>;
}

// Hierarchy levels for decision making
export type HierarchyLevel = 'central' | 'engine' | 'bible' | 'user';

export interface HierarchyContext {
  centralRules: CentralEditorialRule[];
  engineRules: EngineEditorialRule[];
  bibleConstraints?: Record<string, unknown>;
  userIntent: string;
}

// Prompt transformation result
export interface TransformedPrompt {
  originalIntent: string;
  transformedPrompt: string;
  negativePrompt?: string;
  rulesApplied: Array<{
    level: HierarchyLevel;
    ruleKey: string;
    modification: string;
  }>;
  warnings: Array<{
    level: 'info' | 'warning' | 'critical';
    message: string;
    ruleKey: string;
  }>;
  blockers: Array<{
    message: string;
    ruleKey: string;
  }>;
  canProceed: boolean;
}

// Validation result for outputs
export interface OutputValidation {
  isValid: boolean;
  score: number; // 0-100
  issues: Array<{
    severity: 'minor' | 'major' | 'critical';
    ruleKey: string;
    description: string;
    suggestion?: string;
  }>;
  passedChecks: string[];
  failedChecks: string[];
}
