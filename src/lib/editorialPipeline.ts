/**
 * MVP Sistema Editorial - Pipeline de Generación
 * Flujo: Entrada → Decisión → Traducción → Ejecución → Validación → Salida
 */

import type {
  EditorialProject,
  EditorialRule,
  ProjectBible,
  AssetCharacter,
  AssetLocation,
  ProjectRuleOverride,
  GenerationContext,
  RulePlan,
  ComposedPrompt,
  ValidationResult,
  GenerationVerdict,
  PHASE_LIMITS
} from './editorialMVPTypes';

/**
 * A) Motor de Decisión: Genera el RulePlan según fase y toggles
 */
export function buildRulePlan(
  rules: EditorialRule[],
  overrides: ProjectRuleOverride[],
  phase: 'exploracion' | 'produccion'
): RulePlan {
  const overrideMap = new Map(overrides.map(o => [o.ruleId, o]));
  const activeRules: RulePlan['activeRules'] = [];
  
  const toleranceLevel = phase === 'exploracion' ? 'high' : 'low';

  for (const rule of rules) {
    // Verificar si aplica en esta fase
    const appliesToPhase = phase === 'exploracion' 
      ? rule.appliesInExploration 
      : rule.appliesInProduction;
    
    if (!appliesToPhase) continue;

    // Verificar override del proyecto
    const override = overrideMap.get(rule.id);
    const isActive = override ? override.isActive : rule.activeDefault;
    
    if (!isActive) continue;

    // Determinar acción según fase
    let action = rule.actionOnFail;
    if (phase === 'produccion' && rule.actionOnFailProduction) {
      action = rule.actionOnFailProduction;
    }

    // En exploración, suavizar acciones
    if (phase === 'exploracion') {
      if (action === 'reject_regenerate' && rule.ruleType !== 'A') {
        action = 'warn';
      }
    }

    activeRules.push({
      ruleCode: rule.ruleCode,
      ruleType: rule.ruleType,
      action,
      reason: rule.description
    });
  }

  // Ordenar por tipo (A > B > D) y severidad
  activeRules.sort((a, b) => {
    const typeOrder = { A: 0, B: 1, D: 2 };
    if (typeOrder[a.ruleType] !== typeOrder[b.ruleType]) {
      return typeOrder[a.ruleType] - typeOrder[b.ruleType];
    }
    return 0;
  });

  return {
    activeRules,
    phase,
    toleranceLevel
  };
}

/**
 * B) Traducción: Componer prompt con estructura fija
 */
export function composePrompt(
  context: GenerationContext,
  rules: EditorialRule[],
  rulePlan: RulePlan
): ComposedPrompt {
  const mustInclude: string[] = [];
  const negativeSnippets: string[] = [];
  const promptParts: string[] = [];

  // 1. Añadir intención del usuario
  promptParts.push(context.intent);

  // 2. Añadir traits de personajes seleccionados
  const selectedCharacters = context.characters.filter(c => 
    context.selectedAssetIds.includes(c.id)
  );
  for (const char of selectedCharacters) {
    if (char.fixedTraits.length > 0) {
      mustInclude.push(...char.fixedTraits);
      promptParts.push(`Character "${char.name}": ${char.fixedTraits.join(', ')}`);
    }
    if (char.traitsText) {
      promptParts.push(char.traitsText);
    }
  }

  // 3. Añadir elementos de locaciones seleccionadas
  const selectedLocations = context.locations.filter(l => 
    context.selectedAssetIds.includes(l.id)
  );
  for (const loc of selectedLocations) {
    if (loc.fixedElements.length > 0) {
      mustInclude.push(...loc.fixedElements);
      promptParts.push(`Location "${loc.name}": ${loc.fixedElements.join(', ')}`);
    }
    if (loc.traitsText) {
      promptParts.push(loc.traitsText);
    }
  }

  // 4. Añadir contexto narrativo si existe
  if (context.narrativeContext) {
    promptParts.push(`Context: ${context.narrativeContext}`);
  }

  // 5. Añadir contexto de Bible
  if (context.bible) {
    const bibleContext: string[] = [];
    if (context.bible.tone) bibleContext.push(`Tone: ${context.bible.tone}`);
    if (context.bible.period) bibleContext.push(`Period: ${context.bible.period}`);
    if (context.bible.rating) bibleContext.push(`Rating: ${context.bible.rating}`);
    if (bibleContext.length > 0) {
      promptParts.push(bibleContext.join(', '));
    }
  }

  // 6. Recopilar negative prompt snippets de reglas activas
  const activeRuleCodes = new Set(rulePlan.activeRules.map(r => r.ruleCode));
  for (const rule of rules) {
    if (activeRuleCodes.has(rule.ruleCode) && rule.negativePromptSnippets.length > 0) {
      negativeSnippets.push(...rule.negativePromptSnippets);
    }
    if (activeRuleCodes.has(rule.ruleCode) && rule.mustAvoid.length > 0) {
      negativeSnippets.push(...rule.mustAvoid);
    }
  }

  // 7. Añadir sufijo de calidad
  promptParts.push('professional quality, high detail, cinematic');

  return {
    mainPrompt: promptParts.join('. '),
    negativePrompt: [...new Set(negativeSnippets)].join(', '),
    mustInclude,
    context: {
      tone: context.bible?.tone,
      period: context.bible?.period,
      rating: context.bible?.rating
    }
  };
}

/**
 * C) Validación MVP: Verificar prompt y generar veredicto
 */
export function validatePrompt(
  composedPrompt: ComposedPrompt,
  rules: EditorialRule[],
  rulePlan: RulePlan,
  bible?: ProjectBible
): ValidationResult {
  const warnings: ValidationResult['warnings'] = [];
  const suggestions: ValidationResult['suggestions'] = [];
  const blockers: ValidationResult['blockers'] = [];
  const triggeredRules: string[] = [];

  const promptLower = composedPrompt.mainPrompt.toLowerCase();

  for (const plannedRule of rulePlan.activeRules) {
    const rule = rules.find(r => r.ruleCode === plannedRule.ruleCode);
    if (!rule) continue;

    let ruleTriggered = false;
    let message = rule.userMessageTemplate;

    // Validación según método
    switch (rule.validationMethod) {
      case 'prompt_check':
        // Verificar must_include
        for (const required of rule.mustInclude) {
          if (!promptLower.includes(required.toLowerCase())) {
            ruleTriggered = true;
            message = message.replace('{missing}', required);
          }
        }
        // Verificar must_avoid
        for (const avoided of rule.mustAvoid) {
          if (promptLower.includes(avoided.toLowerCase())) {
            ruleTriggered = true;
            message = message.replace('{detected}', avoided);
          }
        }
        break;

      case 'bible_contradiction_check':
        // Verificar contradicciones con hechos de Bible
        if (bible?.facts && bible.facts.length > 0) {
          // MVP: solo advertencia si hay hechos definidos
          // En producción real, esto usaría NLP/AI para detectar contradicciones
        }
        // Verificar coherencia de tono
        if (rule.ruleCode === 'B-005' && bible?.tone) {
          message = message.replace('{tone}', bible.tone);
        }
        break;

      case 'none':
        // Reglas preventivas (A-004, A-005) - siempre se aplican como advertencia
        if (rule.negativePromptSnippets.length > 0) {
          // Ya se aplicaron en el negative prompt, solo informar
          ruleTriggered = true;
        }
        break;
    }

    // Aplicar sustituciones en mensaje
    if (composedPrompt.context.rating) {
      message = message.replace('{rating}', composedPrompt.context.rating);
    }
    if (composedPrompt.context.period) {
      message = message.replace('{period}', composedPrompt.context.period);
    }
    if (composedPrompt.context.tone) {
      message = message.replace('{tone}', composedPrompt.context.tone);
    }

    // Si la regla se activó, registrar según acción
    if (ruleTriggered || rule.validationMethod === 'none') {
      triggeredRules.push(rule.ruleCode);

      const entry = { ruleCode: rule.ruleCode, message };

      switch (plannedRule.action) {
        case 'reject_regenerate':
        case 'reject_explain':
          blockers.push(entry);
          break;
        case 'warn':
          warnings.push(entry);
          break;
        case 'suggest':
          suggestions.push(entry);
          break;
      }
    }
  }

  // Determinar veredicto
  let verdict: GenerationVerdict = 'approved';
  if (blockers.length > 0) {
    verdict = 'regenerate';
  } else if (warnings.length > 0) {
    verdict = 'warn';
  }

  // Aplicar límites de fase
  const limits = rulePlan.toleranceLevel === 'high' 
    ? { maxWarnings: 3, maxSuggestions: 2 }
    : { maxWarnings: 3, maxSuggestions: 3 };

  return {
    passed: blockers.length === 0,
    verdict,
    triggeredRules,
    warnings: warnings.slice(0, limits.maxWarnings),
    suggestions: suggestions.slice(0, limits.maxSuggestions),
    blockers
  };
}

/**
 * D) Generar mensaje de usuario amigable
 */
export function formatUserMessage(
  validation: ValidationResult,
  phase: 'exploracion' | 'produccion'
): string {
  if (validation.verdict === 'approved') {
    return '✓ La generación cumple con los criterios editoriales del proyecto.';
  }

  const messages: string[] = [];

  if (validation.blockers.length > 0) {
    messages.push('↻ Se detectaron elementos que requieren ajuste antes de continuar:');
    for (const blocker of validation.blockers) {
      messages.push(`  • ${blocker.message}`);
    }
  }

  if (validation.warnings.length > 0) {
    messages.push('⚠ Considera revisar:');
    for (const warning of validation.warnings) {
      messages.push(`  • ${warning.message}`);
    }
  }

  if (validation.suggestions.length > 0) {
    messages.push('💡 Sugerencias para mejorar:');
    for (const suggestion of validation.suggestions) {
      messages.push(`  • ${suggestion.message}`);
    }
  }

  if (phase === 'exploracion') {
    messages.push('\n(En fase de exploración, puedes continuar aunque existan advertencias)');
  }

  return messages.join('\n');
}

/**
 * E) Obtener ícono de veredicto
 */
export function getVerdictIcon(verdict: GenerationVerdict): string {
  switch (verdict) {
    case 'approved': return '✓';
    case 'warn': return '⚠';
    case 'regenerate': return '↻';
  }
}

/**
 * F) Obtener color de veredicto para UI
 */
export function getVerdictColor(verdict: GenerationVerdict): string {
  switch (verdict) {
    case 'approved': return 'text-green-600';
    case 'warn': return 'text-amber-600';
    case 'regenerate': return 'text-red-600';
  }
}
