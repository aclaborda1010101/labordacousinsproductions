/**
 * Editorial Engine - Transforms user intent into engine-optimized prompts
 * Following the hierarchical decision system:
 * Central → Engine → Bible → User Intent
 */

import type {
  AIEngineId,
  CentralEditorialRule,
  EngineEditorialRule,
  HierarchyContext,
  TransformedPrompt,
  OutputValidation,
  ProjectEditorialConfig,
  ENGINE_CAPABILITIES
} from './editorialSourcesTypes';

// Default central rules (fallback if DB not available)
const DEFAULT_CENTRAL_RULES: Partial<CentralEditorialRule>[] = [
  {
    ruleKey: 'character_identity_lock',
    category: 'narrative',
    priority: 100,
    enforcementLevel: 'required',
    description: 'Los rasgos físicos definidos en Visual DNA nunca pueden cambiar'
  },
  {
    ruleKey: 'temporal_continuity',
    category: 'narrative',
    priority: 90,
    enforcementLevel: 'required',
    description: 'Iluminación, clima y hora deben ser coherentes en cada escena'
  },
  {
    ruleKey: 'tone_alignment',
    category: 'style',
    priority: 85,
    enforcementLevel: 'required',
    description: 'El estilo visual debe coincidir con el tono narrativo'
  }
];

// Engine-specific prompt modifiers
const ENGINE_PROMPT_MODIFIERS: Record<AIEngineId, (prompt: string) => string> = {
  'nano-banana': (prompt) => {
    // Subject-first ordering, add technical suffix
    const parts = prompt.split(',').map(p => p.trim());
    const subjectParts = parts.filter(p => 
      p.toLowerCase().includes('person') || 
      p.toLowerCase().includes('character') ||
      p.toLowerCase().includes('man') ||
      p.toLowerCase().includes('woman')
    );
    const otherParts = parts.filter(p => !subjectParts.includes(p));
    const reordered = [...subjectParts, ...otherParts].join(', ');
    return `${reordered}, professional photography, 8K resolution, highly detailed, sharp focus`;
  },
  
  'flux-ultra': (prompt) => {
    // Add atmospheric and lighting descriptors if missing
    const hasLighting = /\b(light|lighting|lit|illuminat|shadow|sun|moon)\b/i.test(prompt);
    const lightingSuffix = hasLighting ? '' : ', cinematic lighting, soft shadows';
    return `${prompt}${lightingSuffix}, ultra high resolution, photorealistic`;
  },
  
  'kling-v2': (prompt) => {
    // Emphasize action and movement, add motion descriptors
    const hasMotion = /\b(walk|run|move|turn|look|gesture|action)\b/i.test(prompt);
    const motionPrefix = hasMotion ? '' : 'subtle natural movement, ';
    return `${motionPrefix}${prompt}, smooth motion, cinematic quality`;
  },
  
  'kling-o1': (prompt) => {
    // O1 (Omni) optimized for highest quality
    return `${prompt}, 4K quality, smooth motion, cinematic quality, professional production`;
  },
  
  'veo': (prompt) => {
    // Use cinematic terminology
    return `Cinematic shot: ${prompt}, film grain, professional color grading, atmospheric`;
  },
  
  'chatgpt': (prompt) => prompt,
  'claude': (prompt) => prompt,
  'gemini': (prompt) => prompt,
  'lovable-ai': (prompt) => prompt
};

// Engine-specific negative patterns
const ENGINE_NEGATIVE_PATTERNS: Record<AIEngineId, string[]> = {
  'nano-banana': [
    'deformed', 'distorted', 'disfigured', 'bad anatomy', 'wrong proportions',
    'extra limbs', 'mutated', 'ugly', 'blurry', 'low quality',
    'asymmetric face', 'crossed eyes', 'multiple heads'
  ],
  'flux-ultra': [
    'text', 'watermark', 'signature', 'letters', 'words',
    'low quality', 'blurry', 'pixelated', 'cropped',
    'bad hands', 'extra fingers', 'missing fingers'
  ],
  'kling-v2': [
    'static', 'frozen', 'still image', 'no movement',
    'morphing', 'glitching', 'flickering', 'jittery',
    'face distortion', 'identity change'
  ],
  'kling-o1': [
    'static', 'frozen', 'still image', 'no movement',
    'morphing', 'glitching', 'flickering', 'jittery',
    'face distortion', 'identity change', 'low resolution'
  ],
  'veo': [
    'text overlay', 'subtitles', 'watermark',
    'face morphing', 'identity drift', 'unstable faces',
    'low quality', 'pixelated'
  ],
  'chatgpt': [],
  'claude': [],
  'gemini': [],
  'lovable-ai': []
};

/**
 * Transform user intent into engine-optimized prompt
 */
export function transformPromptForEngine(
  userIntent: string,
  engineId: AIEngineId,
  context: HierarchyContext,
  projectConfig?: ProjectEditorialConfig
): TransformedPrompt {
  const rulesApplied: TransformedPrompt['rulesApplied'] = [];
  const warnings: TransformedPrompt['warnings'] = [];
  const blockers: TransformedPrompt['blockers'] = [];
  
  let transformedPrompt = userIntent;
  const negativePatterns: string[] = [];

  // 1. Apply Central Rules (highest priority)
  const activeCentralRules = context.centralRules
    .filter(r => r.isActive)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeCentralRules) {
    // Check if rule is overridden at project level
    const override = projectConfig?.centralRuleOverrides[rule.ruleKey];
    if (override?.active === false) continue;

    // Apply rule based on enforcement level
    if (rule.enforcementLevel === 'required') {
      // Check for violations
      const violation = checkCentralRuleViolation(transformedPrompt, rule, context.bibleConstraints);
      if (violation) {
        if (rule.priority >= 90) {
          blockers.push({
            message: violation.message,
            ruleKey: rule.ruleKey
          });
        } else {
          warnings.push({
            level: 'critical',
            message: violation.message,
            ruleKey: rule.ruleKey
          });
        }
      }
    }

    rulesApplied.push({
      level: 'central',
      ruleKey: rule.ruleKey,
      modification: 'Regla central aplicada'
    });
  }

  // 2. Apply Engine-Specific Rules
  const activeEngineRules = context.engineRules
    .filter(r => r.isActive && r.engineId === engineId)
    .sort((a, b) => b.priority - a.priority);

  for (const rule of activeEngineRules) {
    // Check project override
    const engineOverrides = projectConfig?.engineRuleOverrides[engineId];
    if (engineOverrides?.[rule.ruleKey]?.active === false) continue;

    // Apply prompt modification if specified
    if (rule.promptModification) {
      rulesApplied.push({
        level: 'engine',
        ruleKey: rule.ruleKey,
        modification: rule.promptModification
      });
    }

    // Collect negative patterns
    if (rule.negativePatterns) {
      negativePatterns.push(...rule.negativePatterns);
    }

    // Check for common errors
    if (rule.category === 'common_errors' || rule.category === 'limitations') {
      const issue = checkEngineRuleIssue(transformedPrompt, rule);
      if (issue) {
        warnings.push({
          level: 'warning',
          message: issue,
          ruleKey: rule.ruleKey
        });
      }
    }
  }

  // 3. Apply Bible Constraints (if available)
  if (context.bibleConstraints) {
    const bibleModifications = applyBibleConstraints(transformedPrompt, context.bibleConstraints);
    if (bibleModifications.modifications.length > 0) {
      transformedPrompt = bibleModifications.modifiedPrompt;
      for (const mod of bibleModifications.modifications) {
        rulesApplied.push({
          level: 'bible',
          ruleKey: mod.key,
          modification: mod.description
        });
      }
    }
    negativePatterns.push(...bibleModifications.negativeAdditions);
  }

  // 4. Apply Engine Modifier
  const modifier = ENGINE_PROMPT_MODIFIERS[engineId];
  if (modifier) {
    transformedPrompt = modifier(transformedPrompt);
    rulesApplied.push({
      level: 'engine',
      ruleKey: 'engine_optimization',
      modification: `Optimizado para ${engineId}`
    });
  }

  // 5. Build final negative prompt
  const baseNegatives = ENGINE_NEGATIVE_PATTERNS[engineId] || [];
  const allNegatives = [...new Set([...baseNegatives, ...negativePatterns])];

  return {
    originalIntent: userIntent,
    transformedPrompt,
    negativePrompt: allNegatives.length > 0 ? allNegatives.join(', ') : undefined,
    rulesApplied,
    warnings,
    blockers,
    canProceed: blockers.length === 0
  };
}

/**
 * Check if prompt violates a central rule
 */
function checkCentralRuleViolation(
  prompt: string,
  rule: CentralEditorialRule,
  bibleConstraints?: Record<string, unknown>
): { message: string } | null {
  switch (rule.ruleKey) {
    case 'character_identity_lock':
      // Check if prompt tries to change locked character attributes
      if (bibleConstraints?.lockedAttributes) {
        const locked = bibleConstraints.lockedAttributes as string[];
        for (const attr of locked) {
          if (prompt.toLowerCase().includes(`change ${attr}`) || 
              prompt.toLowerCase().includes(`different ${attr}`)) {
            return { message: `No se permite modificar "${attr}" - atributo bloqueado en Visual DNA` };
          }
        }
      }
      return null;

    case 'content_boundaries':
      // Basic content safety check
      const unsafePatterns = ['violence', 'gore', 'explicit', 'nsfw'];
      for (const pattern of unsafePatterns) {
        if (prompt.toLowerCase().includes(pattern)) {
          return { message: `Contenido potencialmente restringido detectado: "${pattern}"` };
        }
      }
      return null;

    default:
      return null;
  }
}

/**
 * Check for engine-specific issues
 */
function checkEngineRuleIssue(prompt: string, rule: EngineEditorialRule): string | null {
  if (rule.negativePatterns) {
    for (const pattern of rule.negativePatterns) {
      if (prompt.toLowerCase().includes(pattern.toLowerCase())) {
        return `${rule.ruleName}: El prompt contiene "${pattern}" que puede causar problemas con ${rule.engineDisplayName}`;
      }
    }
  }
  return null;
}

/**
 * Apply Bible constraints to prompt
 */
function applyBibleConstraints(
  prompt: string,
  constraints: Record<string, unknown>
): {
  modifiedPrompt: string;
  modifications: Array<{ key: string; description: string }>;
  negativeAdditions: string[];
} {
  const modifications: Array<{ key: string; description: string }> = [];
  const negativeAdditions: string[] = [];
  let modifiedPrompt = prompt;

  // Apply character visual DNA if available
  if (constraints.characterVisualDNA) {
    const dna = constraints.characterVisualDNA as Record<string, string>;
    
    // Ensure key attributes are in the prompt
    if (dna.eyeColor && !prompt.toLowerCase().includes('eyes')) {
      modifiedPrompt += `, ${dna.eyeColor} eyes`;
      modifications.push({
        key: 'eye_color',
        description: `Añadido color de ojos del Visual DNA: ${dna.eyeColor}`
      });
    }
    
    if (dna.hairColor && !prompt.toLowerCase().includes('hair')) {
      modifiedPrompt += `, ${dna.hairColor} hair`;
      modifications.push({
        key: 'hair_color',
        description: `Añadido color de pelo del Visual DNA: ${dna.hairColor}`
      });
    }
  }

  // Apply must_avoid constraints
  if (constraints.mustAvoid) {
    const avoids = constraints.mustAvoid as string[];
    negativeAdditions.push(...avoids);
    modifications.push({
      key: 'must_avoid',
      description: `Añadidos ${avoids.length} elementos a evitar de la Biblia`
    });
  }

  return { modifiedPrompt, modifications, negativeAdditions };
}

/**
 * Validate output against editorial rules
 */
export function validateOutput(
  outputDescription: string,
  engineId: AIEngineId,
  context: HierarchyContext
): OutputValidation {
  const issues: OutputValidation['issues'] = [];
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  let score = 100;

  // Check central rule compliance
  for (const rule of context.centralRules.filter(r => r.isActive)) {
    const violation = checkCentralRuleViolation(outputDescription, rule, context.bibleConstraints);
    if (violation) {
      score -= rule.priority >= 90 ? 30 : 15;
      failedChecks.push(rule.ruleKey);
      issues.push({
        severity: rule.enforcementLevel === 'required' ? 'critical' : 'major',
        ruleKey: rule.ruleKey,
        description: violation.message
      });
    } else {
      passedChecks.push(rule.ruleKey);
    }
  }

  // Check engine-specific quality
  const engineRules = context.engineRules.filter(r => 
    r.isActive && 
    r.engineId === engineId && 
    r.category === 'quality_control'
  );

  for (const rule of engineRules) {
    if (rule.validationChecks) {
      // Run validation checks
      const checkResult = runValidationCheck(outputDescription, rule.validationChecks);
      if (!checkResult.passed) {
        score -= 10;
        failedChecks.push(rule.ruleKey);
        issues.push({
          severity: 'major',
          ruleKey: rule.ruleKey,
          description: checkResult.issue || 'Error de calidad detectado',
          suggestion: rule.promptModification
        });
      } else {
        passedChecks.push(rule.ruleKey);
      }
    }
  }

  return {
    isValid: score >= 60 && !issues.some(i => i.severity === 'critical'),
    score: Math.max(0, score),
    issues,
    passedChecks,
    failedChecks
  };
}

/**
 * Run specific validation check
 */
function runValidationCheck(
  output: string,
  checks: Record<string, unknown>
): { passed: boolean; issue?: string } {
  // Placeholder for actual validation logic
  // In production, this would analyze the output (image/video metadata, AI analysis, etc.)
  return { passed: true };
}

/**
 * Get recommended engine for a specific purpose
 */
export function getRecommendedEngine(
  purpose: 'character_portrait' | 'location' | 'keyframe' | 'video' | 'script',
  projectConfig?: ProjectEditorialConfig
): AIEngineId {
  // Check project preference first
  if (projectConfig?.preferredEngines[purpose]) {
    return projectConfig.preferredEngines[purpose];
  }

  // Default recommendations
  const defaults: Record<string, AIEngineId> = {
    character_portrait: 'nano-banana',
    location: 'flux-ultra',
    keyframe: 'flux-ultra',
    video: 'kling-v2',
    script: 'claude'
  };

  return defaults[purpose] || 'lovable-ai';
}

/**
 * Suggest rule adjustments based on telemetry
 */
export function suggestRuleAdjustments(
  decisions: Array<{ ruleKey: string; userAction: string; outcome: string }>
): Array<{ ruleKey: string; suggestion: string; confidence: number }> {
  const suggestions: Array<{ ruleKey: string; suggestion: string; confidence: number }> = [];
  
  // Group decisions by rule
  const ruleStats: Record<string, { overridden: number; accepted: number }> = {};
  
  for (const decision of decisions) {
    if (!ruleStats[decision.ruleKey]) {
      ruleStats[decision.ruleKey] = { overridden: 0, accepted: 0 };
    }
    if (decision.userAction === 'overridden') {
      ruleStats[decision.ruleKey].overridden++;
    } else if (decision.userAction === 'accepted') {
      ruleStats[decision.ruleKey].accepted++;
    }
  }

  // Generate suggestions
  for (const [ruleKey, stats] of Object.entries(ruleStats)) {
    const total = stats.overridden + stats.accepted;
    if (total < 5) continue; // Need enough data

    const overrideRate = stats.overridden / total;
    
    if (overrideRate > 0.7) {
      suggestions.push({
        ruleKey,
        suggestion: 'Considerar desactivar esta regla - el usuario la ignora frecuentemente',
        confidence: overrideRate
      });
    } else if (overrideRate < 0.2 && total > 10) {
      suggestions.push({
        ruleKey,
        suggestion: 'Regla muy efectiva - considerar aumentar prioridad',
        confidence: 1 - overrideRate
      });
    }
  }

  return suggestions;
}
