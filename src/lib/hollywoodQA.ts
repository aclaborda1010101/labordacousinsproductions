/**
 * HOLLYWOOD QA V1.0
 * 
 * Automated quality assurance checks for generated scripts
 * Runs before marking an episode as "final"
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

// =============================================================================
// CONSISTENCY CHECK
// =============================================================================

const NAME_VARIATIONS_PATTERNS = [
  /\b(Maria|María)\b/gi,
  /\b(Jose|José)\b/gi,
  /\b(Sofia|Sofía)\b/gi,
  /\b(Ramon|Ramón)\b/gi,
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

  // Check for timeline consistency (basic)
  const dayNightPatterns = [
    { pattern: /INT\.\s+[^-]+\s*-\s*DAY/gi, type: 'DAY' },
    { pattern: /INT\.\s+[^-]+\s*-\s*NIGHT/gi, type: 'NIGHT' },
    { pattern: /EXT\.\s+[^-]+\s*-\s*DAY/gi, type: 'DAY' },
    { pattern: /EXT\.\s+[^-]+\s*-\s*NIGHT/gi, type: 'NIGHT' },
  ];

  // Check for props mentioned but never introduced
  const propMentions = scriptText.match(/\b(pistola|arma|cuchillo|carta|llave|teléfono|maleta)\b/gi);
  if (propMentions) {
    const uniqueProps = [...new Set(propMentions.map(p => p.toLowerCase()))];
    // This is a basic check - would need more context for full validation
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
    issues.push({
      type: 'format',
      severity: 'warning',
      description: `Posibles sluglines mal formateados: ${potentialSluglines.length - sluglines.length}`,
      suggestion: 'Verificar formato: INT./EXT. LOCACIÓN - MOMENTO'
    });
  }

  // Check CONT'D usage
  const dialogueBlocks = scriptText.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+(\(CONT'D\))?$/gim) || [];
  // Would need more context to fully validate CONT'D usage

  // Check action paragraph length
  const actionParagraphs = scriptText.split(/\n\n/).filter(p => 
    !p.match(/^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+$/) && // Not character name
    !p.match(/^\(.*\)$/) && // Not parenthetical
    !p.match(/^(INT\.|EXT\.)/) // Not slugline
  );

  for (const para of actionParagraphs) {
    if (para.length > ACTION_LINE_MAX_CHARS) {
      issues.push({
        type: 'format',
        severity: 'warning',
        description: 'Párrafo de acción demasiado largo (>4 líneas)',
        location: para.slice(0, 50) + '...',
        suggestion: 'Dividir en párrafos más cortos'
      });
    }
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
    '?', '...', 'CONTINUARÁ'
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
        severity: 'warning',
        description: `Muletilla repetida: "${crutch.name}" (${matches.length} veces)`,
        suggestion: `Variar con acciones más específicas`
      });
    }
  }

  // Check for repeated sentence structures
  // This would require more sophisticated analysis

  // Check for repeated words in close proximity
  const words = scriptText.toLowerCase().split(/\s+/);
  const wordFreq: Record<string, number[]> = {};
  
  words.forEach((word, index) => {
    if (word.length > 6) { // Only check longer words
      if (!wordFreq[word]) wordFreq[word] = [];
      wordFreq[word].push(index);
    }
  });

  for (const [word, positions] of Object.entries(wordFreq)) {
    if (positions.length >= 3) {
      // Check if occurrences are too close together
      for (let i = 1; i < positions.length; i++) {
        if (positions[i] - positions[i-1] < 50) { // Within 50 words
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

  return {
    passed,
    score: Math.round(overallScore),
    issues: allIssues,
    checks,
    polishInstructions: polishInstructions.length > 0 ? polishInstructions : undefined
  };
}

// =============================================================================
// HELPER: Generate Polish Instructions
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
    'ensure continuity threads resolved': 'Verificar que hilos narrativos tengan cierre o continuidad'
  };

  return `
## INSTRUCCIONES DE POLISH (basadas en QA automático)

${qaResult.polishInstructions.map((inst, i) => 
  `${i + 1}. **${inst}**: ${instructionDetails[inst] || inst}`
).join('\n')}

### Issues específicos a corregir:
${qaResult.issues.filter(i => i.severity !== 'info').map(i => 
  `- [${i.type.toUpperCase()}] ${i.description}${i.suggestion ? ` → ${i.suggestion}` : ''}`
).join('\n')}
`.trim();
}
