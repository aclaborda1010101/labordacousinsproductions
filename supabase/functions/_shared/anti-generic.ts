/**
 * ANTI-GENERIC DETECTOR
 * 
 * Detecta y bloquea lenguaje vago, genérico y no cinematográfico.
 * Implementa validación estructural de eventos para garantizar dramaticidad.
 * 
 * Filosofía: "Si no se puede filmar, no se puede escribir"
 */

// ═══════════════════════════════════════════════════════════════════════════
// PATRONES PROHIBIDOS - Frases genéricas que matan la dramaticidad
// ═══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_PATTERNS: RegExp[] = [
  // Cambios vagos
  /todo\s+cambia/gi,
  /algo\s+cambia/gi,
  /las\s+cosas\s+cambian/gi,
  /nada\s+volver[aá]\s+a\s+ser\s+igual/gi,
  
  // Realizaciones abstractas
  /se\s+dan?\s+cuenta\s+de\s+que/gi,
  /comprenden?\s+que/gi,
  /entienden?\s+que/gi,
  /descubren?\s+que\s+todo/gi,
  
  // Tensión genérica
  /la\s+tensi[oó]n\s+aumenta/gi,
  /la\s+situaci[oó]n\s+se\s+complica/gi,
  /las\s+cosas\s+se\s+complican/gi,
  /surge\s+un\s+conflicto/gi,
  /aparece\s+una?\s+amenaza/gi,
  /aparecen?\s+problemas/gi,
  
  // Acciones incompletas
  /empiezan?\s+a\s+[a-záéíóú]+(?:\s|$)/gi,
  /comienzan?\s+a\s+[a-záéíóú]+(?:\s|$)/gi,
  
  // Descripciones vacías
  /de\s+alguna\s+manera/gi,
  /por\s+alguna\s+raz[oó]n/gi,
  /sin\s+saber\s+c[oó]mo/gi,
  /misteriosamente/gi,
  
  // Emociones no mostradas
  /siente\s+una?\s+profund[ao]/gi,
  /experimenta\s+un/gi,
  /le\s+invade\s+un/gi,
  
  // Resúmenes narrativos
  /pasan?\s+muchas\s+cosas/gi,
  /todo\s+se\s+descontrola/gi,
  /el\s+caos\s+se\s+desata/gi,
];

// ═══════════════════════════════════════════════════════════════════════════
// FRASES PROHIBIDAS EXACTAS (case-insensitive)
// ═══════════════════════════════════════════════════════════════════════════

const FORBIDDEN_PHRASES: string[] = [
  'todo cambia',
  'nada será igual',
  'la tensión aumenta',
  'surge un conflicto',
  'se dan cuenta',
  'empiezan a',
  'comienzan a',
  'las cosas se complican',
  'aparece una amenaza',
  'el mundo se derrumba',
  'todo se viene abajo',
  'la situación empeora',
  'los problemas aumentan',
];

// ═══════════════════════════════════════════════════════════════════════════
// VERBOS DE ACCIÓN FÍSICA (requeridos para eventos válidos)
// ═══════════════════════════════════════════════════════════════════════════

const PHYSICAL_ACTION_VERBS = [
  // Violencia/Conflicto
  'mata', 'matan', 'dispara', 'disparan', 'golpea', 'golpean', 'apuñala', 
  'ataca', 'atacan', 'destruye', 'destruyen', 'incendia', 'explota',
  
  // Descubrimiento
  'descubre', 'descubren', 'encuentra', 'encuentran', 'revela', 'revelan',
  'intercepta', 'interceptan', 'roba', 'roban', 'abre', 'abren',
  
  // Confrontación
  'confronta', 'confrontan', 'acusa', 'acusan', 'amenaza', 'amenazan',
  'chantajea', 'chantajean', 'traiciona', 'traicionan', 'abandona', 'abandonan',
  
  // Movimiento
  'escapa', 'escapan', 'huye', 'huyen', 'persigue', 'persiguen',
  'entra', 'entran', 'sale', 'salen', 'corre', 'corren',
  
  // Comunicación física
  'besa', 'besan', 'abraza', 'abrazan', 'golpea', 'empuja', 'empujan',
  'agarra', 'agarran', 'suelta', 'sueltan',
  
  // Decisión observable
  'firma', 'firman', 'rompe', 'rompen', 'quema', 'queman',
  'entrega', 'entregan', 'acepta', 'aceptan', 'rechaza', 'rechazan',
  
  // Creación/Destrucción
  'construye', 'construyen', 'crea', 'crean', 'fabrica', 'fabrican',
  'demuele', 'demuelen', 'derriba', 'derriban',
];

export interface GenericDetectionResult {
  isGeneric: boolean;
  violations: string[];
  violationCount: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  suggestions: string[];
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
      found.push(...matches.map(m => m.trim()));
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
  if (violations.some(v => /todo\s+cambia/i.test(v))) {
    suggestions.push('Reemplaza "todo cambia" por un EVENTO CONCRETO: "X descubre Y" o "X destruye Z"');
  }
  if (violations.some(v => /se\s+dan?\s+cuenta/i.test(v))) {
    suggestions.push('En lugar de "se dan cuenta", describe QUÉ ACCIÓN OBSERVABLE provoca la revelación');
  }
  if (violations.some(v => /tensi[oó]n\s+aumenta/i.test(v))) {
    suggestions.push('La tensión no "aumenta" sola. Describe la acción que genera tensión: "X amenaza a Y con Z"');
  }
  if (violations.some(v => /empiezan?\s+a/i.test(v))) {
    suggestions.push('"Empiezan a" es incompleto. Describe la acción completa: "X hace Y, lo que provoca Z"');
  }
  
  return {
    isGeneric: count > 0,
    violations,
    violationCount: count,
    severity,
    suggestions
  };
}

export interface EventValidationResult {
  valid: boolean;
  hasSubject: boolean;
  hasPhysicalVerb: boolean;
  hasConsequence: boolean;
  reason?: string;
  detectedVerb?: string;
}

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
                     /\b(el|la|los|las)\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+/i.test(event);
  
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
  
  // Detectar consecuencia (marcadores de causa-efecto)
  const hasConsequence = /\b(provocando|causando|lo\s+que|por\s+lo\s+que|resultando|dejando|haciendo\s+que)\b/i.test(event) ||
                         /[,;]\s*\w+/.test(event); // Tiene cláusula adicional
  
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

━━━━━━━━━━━━━━━━━━━━━━━━━━
REGLA DE ORO: ACCIÓN OBSERVABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━
Cada evento DEBE tener:
1. SUJETO: ¿QUIÉN? (nombre propio, no "alguien" o "ellos")
2. VERBO FÍSICO: ¿QUÉ HACE? (mata, roba, besa, destruye, revela...)
3. CONSECUENCIA: ¿QUÉ PROVOCA?

❌ INCORRECTO: "Todo cambia cuando descubren la verdad"
✅ CORRECTO: "María encuentra el diario de su padre, revelando que él ordenó el asesinato de su madre"

❌ INCORRECTO: "La tensión aumenta entre los hermanos"
✅ CORRECTO: "Carlos golpea a Pedro en público, acusándolo de robar la herencia"
`;
}
