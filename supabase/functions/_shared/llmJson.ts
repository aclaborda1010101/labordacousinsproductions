/**
 * Universal LLM JSON Sanitizer v3.0
 * 
 * Implements hardened parsing that NEVER throws on malformed JSON.
 * Returns structured result with warnings instead of crashing.
 */

export interface ParseResult<T = any> {
  ok: boolean;
  json: T | null;
  degraded: boolean;
  warnings: string[];
  rawSnippetHash: string | null;
}

/**
 * Simple hash for logging (not cryptographic)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).slice(0, 12);
}

/**
 * Detect truncation signals in JSON string
 */
function detectTruncation(s: string): boolean {
  const trimmed = s.trim();
  
  // Common truncation patterns
  const truncationPatterns = [
    /,\s*"[^"]*":\s*$/,           // Ends with incomplete key
    /,\s*"[^"]*"\s*$/,            // Ends with incomplete key-value
    /,\s*$/,                       // Ends with trailing comma
    /"[^"]*$/,                     // Ends with unclosed string
    /:\s*$/,                       // Ends with colon
    /\[\s*$/,                      // Ends with open bracket
    /\{\s*$/,                      // Ends with open brace
  ];
  
  return truncationPatterns.some(p => p.test(trimmed));
}

/**
 * Clean common LLM artifacts from JSON string
 */
function cleanLLMArtifacts(raw: string): string {
  let s = (raw ?? '').trim();
  
  // Remove markdown fences
  s = s.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  
  // Fix union-type artifacts: "field": "a" | "b"
  s = s.replace(/"([^"]+)"\s*\|\s*"[^"]+"/g, '"$1"');
  s = s.replace(/:\s*"([^"]*)\s*\|\s*([^"]*)"/g, ': "$1"');
  
  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1');
  
  // Fix common escape issues
  s = s.replace(/\\\n/g, '\\n');
  
  return s.trim();
}

/**
 * Extract the largest JSON structure from text
 */
function extractLargestJson(s: string): string {
  const cleaned = cleanLLMArtifacts(s);
  
  // Try markdown-fenced JSON first
  const mdMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/i) || 
                  cleaned.match(/```\s*([\s\S]*?)\s*```/i);
  if (mdMatch?.[1]) return mdMatch[1].trim();
  
  // Find first { and extract
  const firstBrace = cleaned.indexOf('{');
  if (firstBrace !== -1) {
    return cleaned.substring(firstBrace);
  }
  
  // Try array
  const firstBracket = cleaned.indexOf('[');
  if (firstBracket !== -1) {
    return cleaned.substring(firstBracket);
  }
  
  return cleaned;
}

/**
 * Repair truncated JSON by balancing braces/brackets
 */
function repairTruncatedJson(s: string): string {
  let t = cleanLLMArtifacts(s);
  
  // Find last valid closing character
  let lastValid = -1;
  for (let i = t.length - 1; i >= 0; i--) {
    if (t[i] === '}' || t[i] === ']' || t[i] === '"' || /[a-zA-Z0-9]/.test(t[i])) {
      lastValid = i;
      break;
    }
  }
  
  if (lastValid > 0 && lastValid < t.length - 1) {
    t = t.substring(0, lastValid + 1);
  }
  
  // Remove trailing incomplete patterns
  t = t.replace(/,\s*"[^"]*":\s*\{[^}]*$/g, '');  // incomplete nested object
  t = t.replace(/,\s*"[^"]*":\s*\[[^\]]*$/g, ''); // incomplete array
  t = t.replace(/,\s*"[^"]*":\s*"[^"]*$/g, '');   // incomplete string value
  t = t.replace(/,\s*"[^"]*":\s*$/g, '');         // key with no value
  t = t.replace(/,\s*"[^"]*"\s*$/g, '');          // incomplete key
  t = t.replace(/,\s*$/g, '');                     // trailing comma
  
  // Count and balance brackets/braces
  const openBraces = (t.match(/\{/g) || []).length;
  const closeBraces = (t.match(/\}/g) || []).length;
  const openBrackets = (t.match(/\[/g) || []).length;
  const closeBrackets = (t.match(/\]/g) || []).length;
  
  // Close unclosed strings (heuristic)
  const quotes = (t.match(/"/g) || []).length;
  if (quotes % 2 !== 0) {
    t += '"';
  }
  
  // Add missing brackets first (inner), then braces (outer)
  t += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
  t += '}'.repeat(Math.max(0, openBraces - closeBraces));
  
  return t;
}

/**
 * Parse JSON with multiple fallback strategies
 * NEVER throws - always returns ParseResult
 */
export function parseJsonSafe<T = any>(raw: string, label: string = 'unknown'): ParseResult<T> {
  const warnings: string[] = [];
  const input = (raw ?? '').trim();
  
  if (!input) {
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: ['EMPTY_INPUT'],
      rawSnippetHash: null
    };
  }
  
  const rawSnippetHash = simpleHash(input.slice(0, 2000));
  
  // PASS 1: Direct parse
  try {
    const cleaned = cleanLLMArtifacts(input);
    const parsed = JSON.parse(cleaned);
    return {
      ok: true,
      json: parsed as T,
      degraded: false,
      warnings: [],
      rawSnippetHash
    };
  } catch (err1) {
    warnings.push('DIRECT_PARSE_FAILED');
    console.warn(`[llmJson] Direct parse failed (${label})`);
  }
  
  // PASS 2: Extract JSON structure and parse
  try {
    const extracted = extractLargestJson(input);
    const cleaned = cleanLLMArtifacts(extracted);
    const parsed = JSON.parse(cleaned);
    warnings.push('EXTRACTION_REQUIRED');
    return {
      ok: true,
      json: parsed as T,
      degraded: true,
      warnings,
      rawSnippetHash
    };
  } catch (err2) {
    warnings.push('EXTRACTION_FAILED');
    console.warn(`[llmJson] Extraction failed (${label})`);
  }
  
  // PASS 3: Detect truncation and repair
  const extracted = extractLargestJson(input);
  const isTruncated = detectTruncation(extracted);
  
  if (isTruncated) {
    try {
      const repaired = repairTruncatedJson(extracted);
      const cleaned = cleanLLMArtifacts(repaired);
      const parsed = JSON.parse(cleaned);
      warnings.push('TRUNCATION_REPAIRED');
      return {
        ok: true,
        json: parsed as T,
        degraded: true,
        warnings,
        rawSnippetHash
      };
    } catch (err3) {
      warnings.push('REPAIR_FAILED');
      console.warn(`[llmJson] Repair failed (${label})`);
    }
  }
  
  // PASS 4: Aggressive salvage - try to get partial data
  try {
    let salvage = extracted;
    
    // Remove potentially corrupt tail
    const lastGoodClose = Math.max(
      salvage.lastIndexOf('}'),
      salvage.lastIndexOf(']')
    );
    
    if (lastGoodClose > 0) {
      salvage = salvage.substring(0, lastGoodClose + 1);
      salvage = repairTruncatedJson(salvage);
      
      const parsed = JSON.parse(salvage);
      warnings.push('AGGRESSIVE_SALVAGE');
      return {
        ok: true,
        json: parsed as T,
        degraded: true,
        warnings,
        rawSnippetHash
      };
    }
  } catch (err4) {
    warnings.push('SALVAGE_FAILED');
    console.warn(`[llmJson] Salvage failed (${label})`);
  }
  
  // All parsing attempts failed
  console.error(`[llmJson] All parse attempts failed for ${label}`);
  console.error(`[llmJson] Raw snippet (first 500 chars):`, input.slice(0, 500));
  
  return {
    ok: false,
    json: null,
    degraded: true,
    warnings: [...warnings, 'ALL_ATTEMPTS_FAILED'],
    rawSnippetHash
  };
}

/**
 * Parse tool call arguments from OpenAI response
 */
export function parseToolCallArgs<T = any>(
  toolCall: any,
  expectedFunctionName: string,
  label: string = 'tool_call'
): ParseResult<T> {
  if (!toolCall) {
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: ['NO_TOOL_CALL'],
      rawSnippetHash: null
    };
  }
  
  if (toolCall.function?.name !== expectedFunctionName) {
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: [`WRONG_FUNCTION: expected ${expectedFunctionName}, got ${toolCall.function?.name}`],
      rawSnippetHash: null
    };
  }
  
  const args = toolCall.function?.arguments;
  if (typeof args !== 'string') {
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: ['ARGUMENTS_NOT_STRING'],
      rawSnippetHash: null
    };
  }
  
  return parseJsonSafe<T>(args, label);
}

/**
 * Parse Anthropic tool use response
 */
export function parseAnthropicToolUse<T = any>(
  content: any[],
  expectedToolName: string,
  label: string = 'anthropic_tool'
): ParseResult<T> {
  if (!content || !Array.isArray(content)) {
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: ['NO_CONTENT_ARRAY'],
      rawSnippetHash: null
    };
  }
  
  const toolUse = content.find(
    (c: any) => c?.type === 'tool_use' && c?.name === expectedToolName
  );
  
  if (!toolUse) {
    // Try to extract from text block as fallback
    const textBlock = content.find((c: any) => c?.type === 'text');
    if (textBlock?.text) {
      return parseJsonSafe<T>(textBlock.text, `${label}_text_fallback`);
    }
    
    return {
      ok: false,
      json: null,
      degraded: true,
      warnings: ['NO_TOOL_USE_FOUND'],
      rawSnippetHash: null
    };
  }
  
  // Anthropic usually returns parsed object directly
  if (toolUse.input && typeof toolUse.input === 'object') {
    return {
      ok: true,
      json: toolUse.input as T,
      degraded: false,
      warnings: [],
      rawSnippetHash: null
    };
  }
  
  // If input is string, parse it
  if (typeof toolUse.input === 'string') {
    return parseJsonSafe<T>(toolUse.input, label);
  }
  
  return {
    ok: false,
    json: null,
    degraded: true,
    warnings: ['INVALID_TOOL_INPUT'],
    rawSnippetHash: null
  };
}

/**
 * Build a fallback/degraded result structure
 */
export function buildFallbackResult<T>(template: T, warnings: string[]): ParseResult<T> {
  return {
    ok: false,
    json: template,
    degraded: true,
    warnings: [...warnings, 'USING_FALLBACK'],
    rawSnippetHash: null
  };
}
