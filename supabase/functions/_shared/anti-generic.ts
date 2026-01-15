/**
 * ANTI-GENERIC DETECTOR V2.0 - Hollywood Architecture
 * 
 * Detecta y bloquea lenguaje vago, genérico y no cinematográfico.
 * Implementa validación estructural de eventos para garantizar dramaticidad.
 * 
 * V2.0: Added validateGenericity with scoring and gates
 * 
 * Filosofía: "Si no se puede filmar, no se puede escribir"
 */

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORIZED RED FLAGS - Spanish patterns
// ═══════════════════════════════════════════════════════════════════════════

// A) VAGUEDAD NARRATIVA - Generic narrative phrases
const VAGUEDAD_NARRATIVA: RegExp[] = [
  /algo\s+cambia/gi,
  /todo\s+cambia/gi,
  /las\s+cosas\s+cambian/gi,
  /las\s+cosas\s+se\s+complican/gi,
  /surge\s+un\s+conflicto/gi,
  /aparecen?\s+(amenazas|problemas)/gi,
  /se\s+revela\s+un\s+secreto/gi,
  /descubren?\s+la\s+verdad/gi,
  /la\s+tensi[oó]n\s+(aumenta|crece)/gi,
  /la\s+situaci[oó]n\s+(empeora|escala|se\s+complica)/gi,
  /hay\s+consecuencias/gi,
  /nada\s+volver[aá]\s+a\s+ser\s+igual/gi,
  /se\s+acerca\s+el\s+peligro/gi,
  /todo\s+se\s+descontrola/gi,
  /el\s+caos\s+se\s+desata/gi,
  /se\s+enfrentan?\s+a\s+desaf[ií]os/gi,
  /intenta\s+arreglarlo/gi,
  /busca\s+respuestas/gi,
];

// B) TURNING POINTS ABSTRACTOS - Abstract realizations without trigger
const TP_ABSTRACTOS: RegExp[] = [
  /\b(se\s+da\s+cuenta|se\s+dan\s+cuenta)\b/gi,
  /\bcomprende\s+que\b/gi,
  /\bentiende\s+que\b/gi,
  /\breflexiona\s+sobre\b/gi,
  /\bacepta\s+que\b/gi,
  /\bdecide\s+que\b/gi,  // Without observable action
  /\bse\s+siente\s+(triste|feliz|enfadado|preocupado|angustiado)\b/gi,
  /\bse\s+preocupa\s+por\b/gi,
  /\bse\s+enfada\s+con\b/gi,
  /\bse\s+entristece\b/gi,
  /\bexperimenta\s+un\b/gi,
  /\ble\s+invade\s+un\b/gi,
  /\bsiente\s+una?\s+profund[ao]\b/gi,
];

// C) CLIFFHANGERS VACÍOS - Empty cliffhangers
const CLIFFHANGERS_VACIOS: RegExp[] = [
  /nada\s+volver[aá]\s+a\s+ser\s+igual/gi,
  /la\s+amenaza\s+es\s+real/gi,
  /se\s+acerca\s+el\s+peligro/gi,
  /un\s+nuevo\s+enemigo\s+aparece/gi,  // Without identity
  /todo\s+est[aá]\s+a\s+punto\s+de/gi,
  /las\s+cosas\s+van\s+a\s+cambiar/gi,
];

// D) ACCIONES INCOMPLETAS - Incomplete actions
const ACCIONES_INCOMPLETAS: RegExp[] = [
  /empiezan?\s+a\s+[a-záéíóú]+(?:\s|$|\.)/gi,
  /comienzan?\s+a\s+[a-záéíóú]+(?:\s|$|\.)/gi,
  /intentan?\s+[a-záéíóú]+(?:\s|$|\.)/gi,
];

// E) DESCRIPCIONES VACÍAS - Empty descriptions
const DESCRIPCIONES_VACIAS: RegExp[] = [
  /de\s+alguna\s+manera/gi,
  /por\s+alguna\s+raz[oó]n/gi,
  /sin\s+saber\s+c[oó]mo/gi,
  /misteriosamente/gi,
  /inexplicablemente/gi,
];

// Combine all patterns
const FORBIDDEN_PATTERNS: RegExp[] = [
  ...VAGUEDAD_NARRATIVA,
  ...TP_ABSTRACTOS,
  ...CLIFFHANGERS_VACIOS,
  ...ACCIONES_INCOMPLETAS,
  ...DESCRIPCIONES_VACIAS,
];

// ═══════════════════════════════════════════════════════════════════════════
// FRASES PROHIBIDAS EXACTAS (case-insensitive)
// ═══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_PHRASES: string[] = [
  'todo cambia',
  'algo cambia',
  'nada será igual',
  'nada volverá a ser igual',
  'la tensión aumenta',
  'surge un conflicto',
  'se dan cuenta',
  'empiezan a',
  'comienzan a',
  'las cosas se complican',
  'aparece una amenaza',
  'aparecen problemas',
  'el mundo se derrumba',
  'todo se viene abajo',
  'la situación empeora',
  'los problemas aumentan',
  'descubren la verdad',
  'se revela un secreto',
  'investiga el caso',
  'busca respuestas',
];

// ═══════════════════════════════════════════════════════════════════════════
// VERBOS DE ACCIÓN FÍSICA (requeridos para eventos válidos)
// ═══════════════════════════════════════════════════════════════════════════

export const PHYSICAL_ACTION_VERBS = [
  // Violencia/Conflicto
  'mata', 'matan', 'dispara', 'disparan', 'golpea', 'golpean', 'apuñala', 
  'ataca', 'atacan', 'destruye', 'destruyen', 'incendia', 'explota',
  
  // Descubrimiento/Revelación
  'descubre', 'descubren', 'encuentra', 'encuentran', 'revela', 'revelan',
  'intercepta', 'interceptan', 'roba', 'roban', 'abre', 'abren',
  
  // Comunicación con acción
  'publica', 'publican', 'filtra', 'filtran', 'confiesa', 'confiesan',
  'denuncia', 'denuncian', 'expone', 'exponen', 'grita', 'gritan',
  
  // Legal/Oficial
  'firma', 'firman', 'detiene', 'detienen', 'arresta', 'arrestan',
  'demanda', 'demandan', 'hereda', 'heredan',
  
  // Confrontación
  'confronta', 'confrontan', 'acusa', 'acusan', 'amenaza', 'amenazan',
  'chantajea', 'chantajean', 'traiciona', 'traicionan', 'abandona', 'abandonan',
  
  // Movimiento/Escape
  'escapa', 'escapan', 'huye', 'huyen', 'persigue', 'persiguen',
  'entra', 'entran', 'sale', 'salen', 'corre', 'corren', 'irrumpe',
  'secuestra', 'secuestran', 'encierra', 'encierran', 'libera', 'liberan',
  
  // Contacto físico
  'besa', 'besan', 'abraza', 'abrazan', 'empuja', 'empujan',
  'agarra', 'agarran', 'suelta', 'sueltan', 'toca', 'tocan',
  
  // Destrucción/Creación
  'rompe', 'rompen', 'quema', 'queman', 'corta', 'cortan',
  'construye', 'construyen', 'crea', 'crean', 'fabrica', 'fabrican',
  'demuele', 'demuelen', 'derriba', 'derriban',
  
  // Transacciones
  'entrega', 'entregan', 'compra', 'compran', 'vende', 'venden',
  'paga', 'pagan', 'soborna', 'sobornan',
  
  // Control
  'apaga', 'apagan', 'enciende', 'encienden', 'bloquea', 'bloquean',
  'cierra', 'cierran', 'abre', 'abren', 'activa', 'activan',
];

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GenericDetectionResult {
  isGeneric: boolean;
  violations: string[];
  violationCount: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  suggestions: string[];
}

export interface GenericityValidationResult {
  status: 'PASS' | 'FAIL';
  genericity_score: number;        // 0-100, FAIL if > 25
  observability_score: number;     // 0-1, FAIL if < 0.70
  generic_hits: number;
  abstract_hits: number;
  cliffhanger_hits: number;
  errors: string[];
  gate_code?: 'GENERICITY_GATE_FAILED' | 'OBSERVABILITY_GATE_FAILED';
  phrases_found: string[];
}

export interface EventValidationResult {
  valid: boolean;
  hasSubject: boolean;
  hasPhysicalVerb: boolean;
  hasConsequence: boolean;
  reason?: string;
  detectedVerb?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CORE DETECTION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Count matches for a list of patterns in text.
 */
function countPatternMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((acc, rx) => {
    const matches = text.match(rx);
    return acc + (matches?.length || 0);
  }, 0);
}

/**
 * Detecta frases genéricas en el texto proporcionado.
 * Retorna lista de todas las violaciones encontradas.
 */
export function detectGenericPhrases(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  
  const found: string[] = [];
  
  // Buscar patrones regex
  for (const pattern of FORBIDDEN_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      found.push(...matches.map(m => m.trim().toLowerCase()));
    }
  }
  
  // Buscar frases exactas
  const lowerText = text.toLowerCase();
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }
  
  return [...new Set(found)]; // Deduplicate
}

/**
 * Check if text contains any action verb from our list.
 */
function hasActionVerb(text: string): boolean {
  const t = text.toLowerCase();
  return PHYSICAL_ACTION_VERBS.some(v => t.includes(v));
}

/**
 * Analiza un texto completo y retorna un resultado estructurado.
 */
export function analyzeForGenericLanguage(text: string): GenericDetectionResult {
  const violations = detectGenericPhrases(text);
  const count = violations.length;
  
  let severity: GenericDetectionResult['severity'] = 'none';
  if (count >= 5) severity = 'critical';
  else if (count >= 3) severity = 'high';
  else if (count >= 2) severity = 'medium';
  else if (count >= 1) severity = 'low';
  
  const suggestions: string[] = [];
  if (violations.some(v => /todo\s+cambia/i.test(v) || v === 'todo cambia')) {
    suggestions.push('Reemplaza "todo cambia" por un EVENTO CONCRETO: "X descubre Y" o "X destruye Z"');
  }
  if (violations.some(v => /se\s+dan?\s+cuenta/i.test(v) || v === 'se dan cuenta')) {
    suggestions.push('En lugar de "se dan cuenta", describe QUÉ ACCIÓN OBSERVABLE provoca la revelación');
  }
  if (violations.some(v => /tensi[oó]n\s+aumenta/i.test(v))) {
    suggestions.push('La tensión no "aumenta" sola. Describe la acción que genera tensión: "X amenaza a Y con Z"');
  }
  if (violations.some(v => /empiezan?\s+a/i.test(v) || v === 'empiezan a')) {
    suggestions.push('"Empiezan a" es incompleto. Describe la acción completa: "X hace Y, lo que provoca Z"');
  }
  if (violations.some(v => /descubren?\s+la\s+verdad/i.test(v) || v === 'descubren la verdad')) {
    suggestions.push('Especifica QUÉ verdad descubren y CÓMO: "X encuentra el documento que prueba Y"');
  }
  
  return {
    isGeneric: count > 0,
    violations,
    violationCount: count,
    severity,
    suggestions
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// V2.0: GENERICITY VALIDATION WITH SCORING AND GATES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate genericity and observability with scoring.
 * Returns structured result with gate codes for 422 responses.
 */
export function validateGenericity(payload: any): GenericityValidationResult {
  const blob = typeof payload === 'string' ? payload : JSON.stringify(payload);
  
  // Count pattern matches by category
  const genericHits = countPatternMatches(blob, VAGUEDAD_NARRATIVA);
  const abstractHits = countPatternMatches(blob, TP_ABSTRACTOS);
  const cliffhangerHits = countPatternMatches(blob, CLIFFHANGERS_VACIOS);
  
  // Detect all generic phrases
  const phrasesFound = detectGenericPhrases(blob);
  
  // Calculate GenericityScore (0-100, higher = worse)
  // Scale: each generic hit = 8 points, abstract = 6, cliffhanger = 4
  const genericityScore = Math.min(100, 
    (genericHits * 8) + (abstractHits * 6) + (cliffhangerHits * 4) + (phrasesFound.length * 3)
  );
  
  // Validate turning points observability
  const turningPoints = payload?.turning_points || payload?.episodes?.flatMap((e: any) => e?.turning_points || []) || [];
  let obsOK = 0;
  
  for (const tp of turningPoints) {
    if (!tp || typeof tp !== 'object') continue;
    
    const event = String(tp?.event || '');
    const agent = String(tp?.agent || '');
    const consequence = String(tp?.consequence || '');
    
    // Valid TP: has substantive event (18+ chars), named agent (2+ chars), consequence (18+ chars), and action verb
    const isValid = 
      event.length >= 18 && 
      agent.length >= 2 && 
      consequence.length >= 18 && 
      hasActionVerb(event);
    
    if (isValid) obsOK++;
  }
  
  const observabilityScore = turningPoints.length > 0 
    ? obsOK / turningPoints.length 
    : 1; // If no TPs, don't fail on observability
  
  // Determine errors and gate codes
  const errors: string[] = [];
  let gateCode: GenericityValidationResult['gate_code'];
  
  if (genericityScore > 25) {
    errors.push(`GENERICITY too high: ${genericityScore}/100 (max 25)`);
    gateCode = 'GENERICITY_GATE_FAILED';
  }
  
  if (observabilityScore < 0.70 && turningPoints.length > 0) {
    errors.push(`OBSERVABILITY too low: ${Math.round(observabilityScore * 100)}% (min 70%)`);
    if (!gateCode) gateCode = 'OBSERVABILITY_GATE_FAILED';
  }
  
  return {
    status: errors.length === 0 ? 'PASS' : 'FAIL',
    genericity_score: genericityScore,
    observability_score: observabilityScore,
    generic_hits: genericHits,
    abstract_hits: abstractHits,
    cliffhanger_hits: cliffhangerHits,
    errors,
    gate_code: gateCode,
    phrases_found: phrasesFound
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVENT STRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valida que un evento tenga estructura cinematográfica válida:
 * SUJETO + VERBO FÍSICO + CONSECUENCIA
 */
export function validateEventStructure(event: string): EventValidationResult {
  if (!event || typeof event !== 'string' || event.length < 10) {
    return { 
      valid: false, 
      hasSubject: false, 
      hasPhysicalVerb: false, 
      hasConsequence: false,
      reason: 'Evento demasiado corto o vacío' 
    };
  }
  
  // Detectar sujeto (nombre propio al inicio o después de artículo)
  const hasSubject = /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s/.test(event) || 
                     /\b(el|la|los|las)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/i.test(event) ||
                     /^[A-Z][a-z]+/.test(event); // English names too
  
  // Detectar verbo de acción física
  let hasPhysicalVerb = false;
  let detectedVerb: string | undefined;
  
  const lowerEvent = event.toLowerCase();
  for (const verb of PHYSICAL_ACTION_VERBS) {
    if (lowerEvent.includes(verb)) {
      hasPhysicalVerb = true;
      detectedVerb = verb;
      break;
    }
  }
  
  // Detectar consecuencia (marcadores de causa-efecto o cláusula adicional)
  const hasConsequence = 
    /\b(provocando|causando|lo\s+que|por\s+lo\s+que|resultando|dejando|haciendo\s+que|obligando|forzando)\b/i.test(event) ||
    /[,;]\s*\w+/.test(event) || // Tiene cláusula adicional
    event.length > 60; // Long enough to likely have consequence
  
  // Construir resultado
  const valid = hasSubject && hasPhysicalVerb;
  
  let reason: string | undefined;
  if (!hasSubject) reason = 'Falta sujeto identificable (¿QUIÉN hace la acción?)';
  else if (!hasPhysicalVerb) reason = 'Falta verbo de acción física observable (¿QUÉ HACE concretamente?)';
  else if (!hasConsequence) reason = 'Considerar añadir consecuencia (¿QUÉ PROVOCA?)';
  
  return {
    valid,
    hasSubject,
    hasPhysicalVerb,
    hasConsequence,
    reason,
    detectedVerb
  };
}

/**
 * Valida múltiples eventos y retorna un resumen.
 */
export function validateEvents(events: string[]): {
  valid: boolean;
  validCount: number;
  invalidCount: number;
  issues: Array<{ event: string; reason: string }>;
} {
  const issues: Array<{ event: string; reason: string }> = [];
  let validCount = 0;
  
  for (const event of events) {
    const result = validateEventStructure(event);
    if (result.valid) {
      validCount++;
    } else if (result.reason) {
      issues.push({ event: event.substring(0, 50) + '...', reason: result.reason });
    }
  }
  
  return {
    valid: issues.length === 0,
    validCount,
    invalidCount: events.length - validCount,
    issues
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT BLOCK GENERATORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera un bloque de prompt con las reglas anti-genérico.
 * Para inyectar en los system prompts de generación.
 */
export function getAntiGenericPromptBlock(): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━
LENGUAJE PROHIBIDO (RECHAZO AUTOMÁTICO)
━━━━━━━━━━━━━━━━━━━━━━━━━━
Si usas cualquiera de estas frases, el sistema RECHAZARÁ tu respuesta:
- "todo cambia" / "algo cambia"
- "se dan cuenta de que..."
- "la tensión aumenta"
- "surge un conflicto" / "aparece una amenaza"
- "empiezan a..." / "comienzan a..."
- "las cosas se complican"
- "nada volverá a ser igual"
- "descubren la verdad" (sin especificar cuál)
- "se revela un secreto" (sin contenido)

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE ORO: EVENTO OBSERVABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada evento/turning point DEBE tener:
1. SUJETO: ¿QUIÉN? (nombre propio, no "alguien" o "ellos")
2. VERBO FÍSICO: ¿QUÉ HACE? (mata, roba, besa, destruye, revela, firma, publica...)
3. CONSECUENCIA: ¿QUÉ PROVOCA? (pérdida, exposición, ruptura, captura...)

❌ INCORRECTO: "Todo cambia cuando descubren la verdad"
✅ CORRECTO: "María encuentra el diario de su padre, revelando que él ordenó el asesinato de su madre"

❌ INCORRECTO: "La tensión aumenta entre los hermanos"
✅ CORRECTO: "Carlos golpea a Pedro en público, acusándolo de robar la herencia"

❌ INCORRECTO: "Surge un conflicto en la familia"
✅ CORRECTO: "Elena publica las fotos comprometedoras de su hermano en redes sociales, arruinando su campaña política"
`;
}
