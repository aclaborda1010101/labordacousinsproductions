/**
 * HOLLYWOOD QA V1.1
 * 
 * Automated quality assurance checks for generated scripts
 * Runs before marking an episode as "final"
 * 
 * P1.3 ADDITIONS:
 * - generateFixPrompt: Creates specific fix prompts per issue type
 * - runAutoFix: Orchestrates light fixes before escalating to rescue-block
 */

// =============================================================================
// TYPES
// =============================================================================

export type QACheckType = 'consistency' | 'format' | 'rhythm' | 'repetition';
export type QASeverity = 'error' | 'warning' | 'info';

export interface QAIssue {
  type: QACheckType;
  severity: QASeverity;
  description: string;
  location?: string;
  suggestion?: string;
}

export interface QAResult {
  passed: boolean;
  score: number; // 0-100
  issues: QAIssue[];
  checks: {
    consistency: { passed: boolean; score: number; issues: QAIssue[] };
    format: { passed: boolean; score: number; issues: QAIssue[] };
    rhythm: { passed: boolean; score: number; issues: QAIssue[] };
    repetition: { passed: boolean; score: number; issues: QAIssue[] };
  };
  polishInstructions?: string[];
}

// P1.3: Fix templates for auto-fix
export interface FixPrompt {
  type: QACheckType;
  prompt: string;
  priority: number;
}

export interface AutoFixResult {
  fixed: boolean;
  fixedText?: string;
  appliedFixes: string[];
  remainingIssues: QAIssue[];
  escalateToRescue: boolean;
}

// =============================================================================
// CONSISTENCY CHECK
// =============================================================================

const NAME_VARIATIONS_PATTERNS = [
  /\b(Maria|María)\b/gi,
  /\b(Jose|José)\b/gi,
  /\b(Sofia|Sofía)\b/gi,
  /\b(Ramon|Ramón)\b/gi,
  /\b(Angel|Ángel)\b/gi,
  /\b(Jesus|Jesús)\b/gi,
  /\b(Sebastian|Sebastián)\b/gi,
  /\b(Adrian|Adrián)\b/gi,
];

function checkConsistency(scriptText: string, characterNames: string[]): QAIssue[] {
  const issues: QAIssue[] = [];
  
  // Check for name variations
  for (const pattern of NAME_VARIATIONS_PATTERNS) {
    const matches = scriptText.match(pattern);
    if (matches && matches.length > 1) {
      const unique = [...new Set(matches.map(m => m.toLowerCase()))];
      if (unique.length > 1) {
        issues.push({
          type: 'consistency',
          severity: 'error',
          description: `Nombre inconsistente: ${unique.join(' vs ')}`,
          suggestion: `Unificar a una sola forma`
        });
      }
    }
  }

  // Check for provided character name variations
  for (const name of characterNames) {
    if (name.length > 3) {
      const variations = scriptText.match(new RegExp(`\\b${name}\\b`, 'gi')) || [];
      const uniqueVars = [...new Set(variations)];
      if (uniqueVars.length > 1) {
        issues.push({
          type: 'consistency',
          severity: 'warning',
          description: `Variaciones de "${name}": ${uniqueVars.join(', ')}`,
          suggestion: 'Unificar capitalización'
        });
      }
    }
  }

  // Check for timeline consistency (basic)
  const dayNightMixed = (() => {
    const lines = scriptText.split('\n');
    let lastTime: string | null = null;
    let suspiciousTransitions = 0;
    
    for (const line of lines) {
      const dayMatch = line.match(/\s+-\s+(DAY|NIGHT|DAWN|DUSK)/i);
      if (dayMatch) {
        const currentTime = dayMatch[1].toUpperCase();
        // Check for abrupt DAY→NIGHT without CONTINUOUS/LATER
        if (lastTime && lastTime !== currentTime && 
            !line.includes('LATER') && !line.includes('CONTINUOUS')) {
          suspiciousTransitions++;
        }
        lastTime = currentTime;
      }
    }
    return suspiciousTransitions;
  })();

  if (dayNightMixed > 5) {
    issues.push({
      type: 'consistency',
      severity: 'info',
      description: `${dayNightMixed} transiciones de tiempo potencialmente abruptas`,
      suggestion: 'Verificar continuidad temporal entre escenas'
    });
  }

  return issues;
}

// =============================================================================
// FORMAT CHECK
// =============================================================================

const SLUGLINE_PATTERN = /^(INT\.|EXT\.|INT\.\/EXT\.|I\/E\.)\s+[A-ZÁÉÍÓÚÑ][^-]+\s*-\s*(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER|MOMENTS LATER|SAME TIME)/gim;
const ACTION_LINE_MAX_CHARS = 350; // ~4 lines
const DIALOGUE_MAX_LINES = 5;

function checkFormat(scriptText: string): QAIssue[] {
  const issues: QAIssue[] = [];
  const lines = scriptText.split('\n');

  // Check sluglines
  const sluglines = scriptText.match(SLUGLINE_PATTERN) || [];
  const potentialSluglines = scriptText.match(/^(INT|EXT)/gim) || [];
  
  if (potentialSluglines.length > sluglines.length) {
    const diff = potentialSluglines.length - sluglines.length;
    issues.push({
      type: 'format',
      severity: diff > 3 ? 'error' : 'warning',
      description: `Posibles sluglines mal formateados: ${diff}`,
      suggestion: 'Verificar formato: INT./EXT. LOCACIÓN - MOMENTO'
    });
  }

  // Check CONT'D usage - character speaks, interrupted, speaks again
  const charDialoguePattern = /^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)$/gm;
  const characterLines = [...scriptText.matchAll(charDialoguePattern)].map(m => m[1].trim());
  
  let lastChar = '';
  let interruptedChars: string[] = [];
  for (const char of characterLines) {
    if (char === lastChar && !char.includes("CONT'D")) {
      interruptedChars.push(char);
    }
    lastChar = char;
  }
  
  if (interruptedChars.length > 3) {
    issues.push({
      type: 'format',
      severity: 'warning',
      description: `Posible falta de (CONT'D) en ${interruptedChars.length} diálogos`,
      suggestion: 'Añadir (CONT\'D) cuando un personaje continúa hablando después de interrupción'
    });
  }

  // Check action paragraph length
  const actionParagraphs = scriptText.split(/\n\n/).filter(p => 
    !p.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+$/) && // Not character name
    !p.match(/^\(.*\)$/) && // Not parenthetical
    !p.match(/^(INT\.|EXT\.)/) // Not slugline
  );

  const longParagraphs = actionParagraphs.filter(p => p.length > ACTION_LINE_MAX_CHARS);
  if (longParagraphs.length > 0) {
    issues.push({
      type: 'format',
      severity: 'warning',
      description: `${longParagraphs.length} párrafos de acción demasiado largos (>4 líneas)`,
      location: longParagraphs[0]?.slice(0, 50) + '...',
      suggestion: 'Dividir en párrafos más cortos'
    });
  }

  // Check for V.O. and O.S. usage
  const hasVO = scriptText.includes('(V.O.)') || scriptText.includes('(VO)');
  const hasOS = scriptText.includes('(O.S.)') || scriptText.includes('(OS)');
  
  if (scriptText.match(/\(voice over\)/gi) || scriptText.match(/\(off screen\)/gi)) {
    issues.push({
      type: 'format',
      severity: 'warning',
      description: 'Usar abreviaciones estándar: (V.O.) y (O.S.)',
      suggestion: 'Reemplazar "voice over" por (V.O.) y "off screen" por (O.S.)'
    });
  }

  return issues;
}

// =============================================================================
// RHYTHM CHECK
// =============================================================================

function checkRhythm(scriptText: string, expectedBeats?: string[]): QAIssue[] {
  const issues: QAIssue[] = [];

  // Check for cliffhanger at end
  const lastParagraphs = scriptText.split('\n\n').slice(-3).join('\n');
  const cliffhangerIndicators = [
    'FADE OUT', 'CORTE A NEGRO', 'END OF EPISODE',
    '?', '...', 'CONTINUARÁ', 'TO BE CONTINUED',
    'SMASH CUT TO BLACK', 'CUT TO BLACK'
  ];
  
  const hasCliffhanger = cliffhangerIndicators.some(ind => 
    lastParagraphs.toUpperCase().includes(ind.toUpperCase())
  );

  if (!hasCliffhanger) {
    issues.push({
      type: 'rhythm',
      severity: 'warning',
      description: 'Posible falta de cliffhanger al final del episodio',
      suggestion: 'Considerar añadir gancho o suspense final'
    });
  }

  // Check scene count vs expected
  const sceneCount = (scriptText.match(/^(INT\.|EXT\.)/gim) || []).length;
  if (sceneCount < 10) {
    issues.push({
      type: 'rhythm',
      severity: 'info',
      description: `Episodio con pocas escenas (${sceneCount})`,
      suggestion: 'Verificar que el ritmo sea adecuado para el formato'
    });
  } else if (sceneCount > 60) {
    issues.push({
      type: 'rhythm',
      severity: 'info',
      description: `Episodio con muchas escenas (${sceneCount})`,
      suggestion: 'Considerar consolidar escenas cortas'
    });
  }

  // Check for expected beats if provided
  if (expectedBeats && expectedBeats.length > 0) {
    const scriptLower = scriptText.toLowerCase();
    const missingBeats = expectedBeats.filter(beat => 
      !scriptLower.includes(beat.toLowerCase())
    );
    
    if (missingBeats.length > 0) {
      issues.push({
        type: 'rhythm',
        severity: 'warning',
        description: `Beats esperados no encontrados: ${missingBeats.join(', ')}`,
        suggestion: 'Verificar que todos los turning points estén presentes'
      });
    }
  }

  return issues;
}

// =============================================================================
// REPETITION CHECK
// =============================================================================

const COMMON_CRUTCHES = [
  { pattern: /suspira/gi, name: 'suspira' },
  { pattern: /asiente/gi, name: 'asiente' },
  { pattern: /niega con la cabeza/gi, name: 'niega con la cabeza' },
  { pattern: /mira fijamente/gi, name: 'mira fijamente' },
  { pattern: /se gira/gi, name: 'se gira' },
  { pattern: /se levanta/gi, name: 'se levanta' },
  { pattern: /se sienta/gi, name: 'se sienta' },
  { pattern: /toma un trago/gi, name: 'toma un trago' },
  { pattern: /enciende un cigarr/gi, name: 'enciende cigarrillo' },
  { pattern: /sonríe/gi, name: 'sonríe' },
  { pattern: /frunce el ceño/gi, name: 'frunce el ceño' },
  { pattern: /traga saliva/gi, name: 'traga saliva' },
];

const MAX_CRUTCH_OCCURRENCES = 3;

function checkRepetition(scriptText: string): QAIssue[] {
  const issues: QAIssue[] = [];

  // Check for overused crutch phrases
  for (const crutch of COMMON_CRUTCHES) {
    const matches = scriptText.match(crutch.pattern);
    if (matches && matches.length > MAX_CRUTCH_OCCURRENCES) {
      issues.push({
        type: 'repetition',
        severity: matches.length > 6 ? 'error' : 'warning',
        description: `Muletilla repetida: "${crutch.name}" (${matches.length} veces)`,
        suggestion: `Variar con acciones más específicas del personaje`
      });
    }
  }

  // Check for repeated sentence structures
  const sentences = scriptText.split(/[.!?]\s+/).filter(s => s.length > 20);
  const startingPatterns: Record<string, number> = {};
  
  for (const sentence of sentences) {
    const firstThreeWords = sentence.trim().split(/\s+/).slice(0, 3).join(' ').toLowerCase();
    startingPatterns[firstThreeWords] = (startingPatterns[firstThreeWords] || 0) + 1;
  }

  for (const [pattern, count] of Object.entries(startingPatterns)) {
    if (count > 4) {
      issues.push({
        type: 'repetition',
        severity: 'info',
        description: `Patrón de inicio repetido: "${pattern}..." (${count} veces)`,
        suggestion: 'Variar estructura de oraciones'
      });
    }
  }

  // Check for repeated words in close proximity
  const words = scriptText.toLowerCase().split(/\s+/);
  const wordFreq: Record<string, number[]> = {};
  
  words.forEach((word, index) => {
    if (word.length > 6) {
      if (!wordFreq[word]) wordFreq[word] = [];
      wordFreq[word].push(index);
    }
  });

  for (const [word, positions] of Object.entries(wordFreq)) {
    if (positions.length >= 3) {
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] - positions[i-1] < 50) {
          issues.push({
            type: 'repetition',
            severity: 'info',
            description: `Palabra "${word}" repetida frecuentemente en proximidad`,
            suggestion: 'Considerar sinónimos o reestructurar'
          });
          break;
        }
      }
    }
  }

  return issues;
}

// =============================================================================
// MAIN QA FUNCTION
// =============================================================================

export function runHollywoodQA(
  scriptText: string,
  options: {
    characterNames?: string[];
    expectedBeats?: string[];
    strictMode?: boolean;
  } = {}
): QAResult {
  const { characterNames = [], expectedBeats, strictMode = false } = options;

  // Run all checks
  const consistencyIssues = checkConsistency(scriptText, characterNames);
  const formatIssues = checkFormat(scriptText);
  const rhythmIssues = checkRhythm(scriptText, expectedBeats);
  const repetitionIssues = checkRepetition(scriptText);

  // Calculate scores
  const calculateScore = (issues: QAIssue[]): number => {
    const errorCount = issues.filter(i => i.severity === 'error').length;
    const warningCount = issues.filter(i => i.severity === 'warning').length;
    const infoCount = issues.filter(i => i.severity === 'info').length;
    
    return Math.max(0, 100 - (errorCount * 20) - (warningCount * 5) - (infoCount * 1));
  };

  const checks = {
    consistency: {
      passed: consistencyIssues.filter(i => i.severity === 'error').length === 0,
      score: calculateScore(consistencyIssues),
      issues: consistencyIssues
    },
    format: {
      passed: formatIssues.filter(i => i.severity === 'error').length === 0,
      score: calculateScore(formatIssues),
      issues: formatIssues
    },
    rhythm: {
      passed: rhythmIssues.filter(i => i.severity === 'error').length === 0,
      score: calculateScore(rhythmIssues),
      issues: rhythmIssues
    },
    repetition: {
      passed: repetitionIssues.filter(i => i.severity === 'error').length === 0,
      score: calculateScore(repetitionIssues),
      issues: repetitionIssues
    }
  };

  const allIssues = [...consistencyIssues, ...formatIssues, ...rhythmIssues, ...repetitionIssues];
  const overallScore = (checks.consistency.score + checks.format.score + checks.rhythm.score + checks.repetition.score) / 4;
  
  const errorCount = allIssues.filter(i => i.severity === 'error').length;
  const passed = strictMode 
    ? errorCount === 0 && overallScore >= 80
    : errorCount === 0;

  // Generate polish instructions based on issues
  const polishInstructions: string[] = [];
  
  if (checks.repetition.issues.length > 2) {
    polishInstructions.push('reduce repetition');
  }
  if (checks.rhythm.issues.some(i => i.description.includes('cliffhanger'))) {
    polishInstructions.push('strengthen ending hook');
  }
  if (checks.format.issues.some(i => i.description.includes('párrafo'))) {
    polishInstructions.push('break long action paragraphs');
  }
  if (checks.consistency.issues.length > 0) {
    polishInstructions.push('ensure name consistency');
  }
  if (checks.format.issues.some(i => i.description.includes("CONT'D"))) {
    polishInstructions.push('add missing CONT\'D markers');
  }

  return {
    passed,
    score: Math.round(overallScore),
    issues: allIssues,
    checks,
    polishInstructions: polishInstructions.length > 0 ? polishInstructions : undefined
  };
}

// =============================================================================
// P1.3: FIX PROMPT GENERATION
// =============================================================================

const FIX_TEMPLATES: Record<QACheckType, { prompt: string; priority: number }> = {
  format: {
    prompt: `Corrige SOLO problemas de formato:
- Sluglines: INT./EXT. LOCACIÓN - MOMENTO
- Añade (CONT'D) cuando un personaje continúa tras interrupción
- Usa (V.O.) y (O.S.) correctamente
- Divide párrafos de acción >4 líneas
NO cambies contenido narrativo ni diálogo.`,
    priority: 1
  },
  consistency: {
    prompt: `Corrige SOLO inconsistencias de nombres:
- Unifica variaciones del mismo nombre (María/Maria → María)
- Mantén capitalización consistente
- Verifica timeline lógico (DAY/NIGHT)
NO cambies contenido ni estructura.`,
    priority: 2
  },
  repetition: {
    prompt: `Elimina SOLO muletillas y repeticiones:
- Reemplaza acciones genéricas (suspira, asiente) por acciones específicas del personaje
- Varía estructuras de oraciones repetidas
- Usa sinónimos para palabras muy repetidas
NO cambies la trama ni diálogos principales.`,
    priority: 3
  },
  rhythm: {
    prompt: `Ajusta SOLO ritmo y estructura:
- Asegura cliffhanger o gancho al final
- Verifica turning points en posiciones correctas
- Ajusta 2-4 líneas máximo para mejorar ritmo
NO reescribas escenas completas.`,
    priority: 4
  }
};

/**
 * Generate a specific fix prompt for an issue type
 */
export function generateFixPrompt(issue: QAIssue): FixPrompt {
  const template = FIX_TEMPLATES[issue.type];
  
  return {
    type: issue.type,
    prompt: `
## FIX ESPECÍFICO: ${issue.type.toUpperCase()}

${template.prompt}

### Problema detectado:
${issue.description}
${issue.suggestion ? `Sugerencia: ${issue.suggestion}` : ''}
${issue.location ? `Ubicación: ${issue.location}` : ''}

SOLO corrige este issue específico. NO toques nada más.
`.trim(),
    priority: template.priority
  };
}

/**
 * Generate grouped fix prompts by type for efficiency
 */
export function generateGroupedFixPrompts(issues: QAIssue[]): FixPrompt[] {
  const groupedByType = issues.reduce((acc, issue) => {
    if (!acc[issue.type]) acc[issue.type] = [];
    acc[issue.type].push(issue);
    return acc;
  }, {} as Record<QACheckType, QAIssue[]>);

  const prompts: FixPrompt[] = [];

  for (const [type, typeIssues] of Object.entries(groupedByType)) {
    const checkType = type as QACheckType;
    const template = FIX_TEMPLATES[checkType];
    
    prompts.push({
      type: checkType,
      prompt: `
## FIX: ${checkType.toUpperCase()} (${typeIssues.length} issues)

${template.prompt}

### Problemas detectados:
${typeIssues.map((i, idx) => `${idx + 1}. ${i.description}${i.suggestion ? ` → ${i.suggestion}` : ''}`).join('\n')}

Corrige TODOS estos issues del mismo tipo. NO toques nada más.
`.trim(),
      priority: template.priority
    });
  }

  return prompts.sort((a, b) => a.priority - b.priority);
}

/**
 * Determine if issues should escalate to rescue-block
 */
export function shouldEscalateToRescue(qaResult: QAResult, fixAttempts: number): boolean {
  // Escalate if:
  // 1. Score is very low (<50)
  // 2. Multiple errors remain after 2 fix attempts
  // 3. Consistency errors (drift) remain
  
  if (qaResult.score < 50) return true;
  if (fixAttempts >= 2 && qaResult.issues.filter(i => i.severity === 'error').length > 0) return true;
  if (fixAttempts >= 1 && qaResult.checks.consistency.issues.filter(i => i.severity === 'error').length > 0) return true;
  
  return false;
}

// =============================================================================
// HELPER: Generate Polish Instructions from QA
// =============================================================================

export function generatePolishPromptFromQA(qaResult: QAResult): string {
  if (!qaResult.polishInstructions?.length) {
    return '';
  }

  const instructionDetails: Record<string, string> = {
    'reduce repetition': 'Eliminar muletillas repetidas y variar estructura de oraciones',
    'strengthen ending hook': 'Reforzar el gancho final del episodio para crear suspense',
    'break long action paragraphs': 'Dividir párrafos de acción en bloques de máximo 4 líneas',
    'ensure name consistency': 'Unificar la escritura de nombres de personajes',
    'tighten dialogue': 'Acortar diálogos y añadir subtexto',
    'ensure continuity threads resolved': 'Verificar que hilos narrativos tengan cierre o continuidad',
    "add missing CONT'D markers": 'Añadir (CONT\'D) cuando un personaje continúa hablando después de una interrupción'
  };

  return `
## INSTRUCCIONES DE POLISH (basadas en QA automático)

Score actual: ${qaResult.score}/100
${qaResult.passed ? '✓ APROBADO' : '✗ REQUIERE CORRECCIÓN'}

${qaResult.polishInstructions.map((inst, i) => 
  `${i + 1}. **${inst}**: ${instructionDetails[inst] || inst}`
).join('\n')}

### Issues específicos a corregir:
${qaResult.issues.filter(i => i.severity !== 'info').map(i => 
  `- [${i.severity.toUpperCase()}] ${i.description}${i.suggestion ? ` → ${i.suggestion}` : ''}`
).join('\n')}
`.trim();
}
