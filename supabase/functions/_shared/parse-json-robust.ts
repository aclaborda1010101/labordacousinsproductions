// ============================================================================
// ROBUST JSON PARSING UTILITY
// ============================================================================
// Multi-strategy JSON parsing with repair capabilities for LLM outputs.
// Strategies (in order of attempt):
// 1. Direct parse
// 2. Strip markdown JSON blocks
// 3. Extract first JSON object
// 4. Clean trailing commas, smart quotes, BOM
// 5. Repair truncation (balance braces/brackets)
// 6. Aggressive salvage (combine all repairs)
// ============================================================================

export type ParseStrategy = 
  | 'direct' 
  | 'strip_markdown' 
  | 'extract_object' 
  | 'clean_artifacts' 
  | 'repair_truncation' 
  | 'aggressive_salvage' 
  | 'failed';

export interface RobustParseResult<T = any> {
  ok: boolean;
  json: T | null;
  strategy: ParseStrategy;
  cleaned: string;
  warnings: string[];
  error?: string;
}

// ============================================================================
// Helper: Normalize smart quotes and special characters
// ============================================================================
function normalizeQuotes(s: string): string {
  return s
    .replace(/[\u2018\u2019\u0060\u00B4]/g, "'")   // Smart single quotes + backticks
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"')   // Smart double quotes + guillemets
    .replace(/\u00A0/g, ' ')                        // Non-breaking space
    .replace(/\uFEFF/g, '');                        // BOM
}

// ============================================================================
// Helper: Remove markdown code blocks
// ============================================================================
function stripMarkdownBlocks(s: string): string {
  // Remove ```json ... ``` blocks
  let cleaned = s.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').replace(/```/g, '');
  // Remove ``` at start/end
  cleaned = cleaned.replace(/^```\w*\s*/gm, '').replace(/\s*```$/gm, '');
  return cleaned.trim();
}

// ============================================================================
// Helper: Extract first JSON object/array from text
// ============================================================================
function extractFirstJsonObject(s: string): string | null {
  // Try to find the first { ... } block
  const objMatch = s.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  
  // Try to find the first [ ... ] block
  const arrMatch = s.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];
  
  return null;
}

// ============================================================================
// Helper: Clean common JSON artifacts
// ============================================================================
function cleanJsonArtifacts(s: string): string {
  let cleaned = s;
  
  // Remove BOM
  cleaned = cleaned.replace(/^\uFEFF/, '');
  
  // Normalize quotes
  cleaned = normalizeQuotes(cleaned);
  
  // Fix trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
  
  // Fix missing commas between array elements (common LLM error)
  // e.g., } { -> }, {
  cleaned = cleaned.replace(/}\s*{/g, '},{');
  
  // Fix escaped quotes that shouldn't be escaped
  cleaned = cleaned.replace(/\\\\"/g, '\\"');
  
  // Remove control characters except \n, \r, \t
  cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  
  return cleaned.trim();
}

// ============================================================================
// Helper: Repair truncated JSON (balance braces/brackets)
// ============================================================================
function repairTruncatedJson(s: string): string {
  let cleaned = s.trim();
  
  // Remove trailing incomplete patterns
  cleaned = cleaned
    .replace(/,\s*"[^"]*$/, '')           // Trailing incomplete key
    .replace(/:\s*"[^"]*$/, ': ""')       // Trailing incomplete string value
    .replace(/:\s*\[?[^,\]\}]*$/, ': []') // Trailing incomplete array
    .replace(/,\s*$/, '');                 // Trailing comma
  
  // Count braces and brackets
  const openBraces = (cleaned.match(/{/g) || []).length;
  const closeBraces = (cleaned.match(/}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/]/g) || []).length;
  
  // Balance brackets first, then braces
  const missingBrackets = openBrackets - closeBrackets;
  const missingBraces = openBraces - closeBraces;
  
  if (missingBrackets > 0) {
    cleaned += ']'.repeat(missingBrackets);
  }
  if (missingBraces > 0) {
    cleaned += '}'.repeat(missingBraces);
  }
  
  return cleaned;
}

// ============================================================================
// Helper: Try to parse JSON with specific strategy
// ============================================================================
function tryParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

// ============================================================================
// MAIN: parseJsonRobust - Multi-strategy JSON parsing
// ============================================================================
export function parseJsonRobust<T = any>(raw: string, context: string = 'unknown'): RobustParseResult<T> {
  const warnings: string[] = [];
  
  if (!raw || typeof raw !== 'string') {
    return {
      ok: false,
      json: null,
      strategy: 'failed',
      cleaned: '',
      warnings: ['Empty or non-string input'],
      error: `${context}: Empty or non-string input`
    };
  }
  
  const originalLength = raw.length;
  let cleaned = raw.trim();
  
  // ========================================
  // STRATEGY 1: Direct parse
  // ========================================
  let result = tryParse<T>(cleaned);
  if (result !== null) {
    return {
      ok: true,
      json: result,
      strategy: 'direct',
      cleaned,
      warnings: []
    };
  }
  
  // ========================================
  // STRATEGY 2: Strip markdown blocks
  // ========================================
  cleaned = stripMarkdownBlocks(raw);
  result = tryParse<T>(cleaned);
  if (result !== null) {
    warnings.push('Stripped markdown code blocks');
    return {
      ok: true,
      json: result,
      strategy: 'strip_markdown',
      cleaned,
      warnings
    };
  }
  
  // ========================================
  // STRATEGY 3: Extract first JSON object
  // ========================================
  const extracted = extractFirstJsonObject(raw);
  if (extracted) {
    result = tryParse<T>(extracted);
    if (result !== null) {
      warnings.push('Extracted embedded JSON object');
      return {
        ok: true,
        json: result,
        strategy: 'extract_object',
        cleaned: extracted,
        warnings
      };
    }
    // Continue with extracted content for further cleaning
    cleaned = extracted;
  }
  
  // ========================================
  // STRATEGY 4: Clean artifacts (BOM, smart quotes, trailing commas)
  // ========================================
  const cleanedArtifacts = cleanJsonArtifacts(cleaned);
  result = tryParse<T>(cleanedArtifacts);
  if (result !== null) {
    warnings.push('Cleaned JSON artifacts (quotes, commas, BOM)');
    return {
      ok: true,
      json: result,
      strategy: 'clean_artifacts',
      cleaned: cleanedArtifacts,
      warnings
    };
  }
  
  // ========================================
  // STRATEGY 5: Repair truncation
  // ========================================
  const repaired = repairTruncatedJson(cleanedArtifacts);
  result = tryParse<T>(repaired);
  if (result !== null) {
    warnings.push('Repaired truncated JSON (balanced braces/brackets)');
    return {
      ok: true,
      json: result,
      strategy: 'repair_truncation',
      cleaned: repaired,
      warnings
    };
  }
  
  // ========================================
  // STRATEGY 6: Aggressive salvage (all repairs combined)
  // ========================================
  // Try all combinations
  let salvaged = stripMarkdownBlocks(raw);
  salvaged = extractFirstJsonObject(salvaged) || salvaged;
  salvaged = cleanJsonArtifacts(salvaged);
  salvaged = repairTruncatedJson(salvaged);
  
  result = tryParse<T>(salvaged);
  if (result !== null) {
    warnings.push('Aggressive salvage: combined all repair strategies');
    return {
      ok: true,
      json: result,
      strategy: 'aggressive_salvage',
      cleaned: salvaged,
      warnings
    };
  }
  
  // ========================================
  // FAILED: Return structured error
  // ========================================
  const preview = raw.length > 200 ? raw.substring(0, 200) + '...' : raw;
  const errorMsg = `${context}: All parse strategies failed. Input length: ${originalLength}. Preview: ${preview}`;
  
  console.warn(`[parseJsonRobust] ${errorMsg}`);
  
  return {
    ok: false,
    json: null,
    strategy: 'failed',
    cleaned: salvaged,
    warnings: [...warnings, 'All parse strategies exhausted'],
    error: errorMsg
  };
}

// ============================================================================
// VALIDATION HELPERS: Minimal validation for EXPAND_ACT results
// ============================================================================
export interface ExpandActMinimalResult {
  act: string;
  beats: Array<{
    beat_number: number;
    event: string;
    consequence: string;
    agent?: string;
    situation_detail?: any;
  }>;
  key_moments?: any;
  dramatic_goal?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateExpandActMinimal(result: any, expectedAct: string): ValidationResult {
  const issues: string[] = [];
  
  if (!result || typeof result !== 'object') {
    issues.push('Result is not an object');
    return { valid: false, issues };
  }
  
  // Check act matches
  if (!result.act || result.act !== expectedAct) {
    issues.push(`act mismatch: expected ${expectedAct}, got ${result.act}`);
  }
  
  // Check beats exist and have minimum count
  if (!result.beats || !Array.isArray(result.beats)) {
    issues.push('beats missing or not array');
  } else if (result.beats.length < 4) {
    issues.push(`too few beats: ${result.beats.length} (min 4)`);
  } else {
    // Validate each beat has required fields
    result.beats.forEach((beat: any, i: number) => {
      if (beat.beat_number === undefined && beat.beat_number !== 0) {
        issues.push(`beat ${i} missing beat_number`);
      }
      if (!beat.event) {
        issues.push(`beat ${i} missing event`);
      }
      if (!beat.consequence) {
        issues.push(`beat ${i} missing consequence`);
      }
    });
  }
  
  return { 
    valid: issues.length === 0, 
    issues 
  };
}

// ============================================================================
// DEFAULT FILL: Fill missing optional fields with defaults
// ============================================================================
const DEFAULT_SITUATION_DETAIL = {
  physical_context: "Por determinar",
  action: "Acción pendiente de detalle",
  goal: "Objetivo por definir",
  obstacle: "Obstáculo por definir",
  state_change: "Cambio de estado por definir"
};

export function fillExpandActDefaults(result: any, act: string): any {
  if (!result) return result;
  
  // Ensure act is set
  const filled = {
    ...result,
    act: result.act || act,
    dramatic_goal: result.dramatic_goal || `Objetivo del Acto ${act}`,
    key_moments: result.key_moments || {}
  };
  
  // Fill defaults for each beat
  if (filled.beats && Array.isArray(filled.beats)) {
    filled.beats = filled.beats.map((beat: any, index: number) => ({
      beat_number: beat.beat_number ?? (index + 1),
      event: beat.event || 'Evento por definir',
      consequence: beat.consequence || 'Consecuencia por definir',
      agent: beat.agent || 'Protagonista',
      situation_detail: beat.situation_detail || { ...DEFAULT_SITUATION_DETAIL },
      ...beat  // Preserve any other fields
    }));
  }
  
  return filled;
}

// ============================================================================
// RAW STORAGE: Structure for persisting raw model outputs
// ============================================================================
export interface RawOutputDebug {
  last_raw_content?: string;      // Model content (first 5000 chars)
  last_raw_tool_args?: string;    // Tool args if present
  parse_strategy?: ParseStrategy;
  attempt_count?: number;
  last_error?: string;
  timestamp?: string;
}

export function buildRawDebug(
  content: string | null | undefined,
  toolArgs: string | null | undefined,
  strategy: ParseStrategy,
  attempt: number,
  error?: string
): RawOutputDebug {
  return {
    last_raw_content: content?.substring(0, 5000),
    last_raw_tool_args: toolArgs?.substring(0, 5000),
    parse_strategy: strategy,
    attempt_count: attempt,
    last_error: error,
    timestamp: new Date().toISOString()
  };
}
