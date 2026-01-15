// ============================================================================
// V17: CANONICAL MODEL TEXT EXTRACTOR
// ============================================================================
// Handles all common response formats from AI models to extract the text content.
// This prevents "Empty or non-string input" errors caused by unexpected response shapes.
// ============================================================================

export interface ExtractionResult {
  text: string | null;
  strategy: 'toolArgs' | 'toolArgs.arguments' | 'output_text' | 'choices.content.string' | 'choices.content.blocks' | 'choices.content.tool_use' | 'alt.content' | 'none';
  rawType: string;
  preview: string | null;
}

/**
 * Extracts text content from various AI model response formats.
 * Handles OpenAI, Anthropic, and other common response structures.
 * 
 * @param resp - The raw response object from the AI model
 * @returns ExtractionResult with the extracted text and metadata
 */
export function extractModelText(resp: any): ExtractionResult {
  const rawType = resp === null ? 'null' : Array.isArray(resp) ? 'array' : typeof resp;
  
  // Handle null/undefined
  if (!resp) {
    return { text: null, strategy: 'none', rawType, preview: null };
  }
  
  // 1) Tool arguments from OpenAI-style tool_calls
  const toolCall = resp?.choices?.[0]?.message?.tool_calls?.[0];
  const toolArgs = toolCall?.function?.arguments;
  if (typeof toolArgs === 'string' && toolArgs.trim()) {
    return { text: toolArgs, strategy: 'toolArgs', rawType, preview: toolArgs.slice(0, 300) };
  }
  
  // 2) Tool arguments as object (some SDKs pre-parse)
  if (toolArgs && typeof toolArgs === 'object') {
    try {
      const argsStr = JSON.stringify(toolArgs);
      if (argsStr && argsStr !== '{}') {
        return { text: argsStr, strategy: 'toolArgs.arguments', rawType, preview: argsStr.slice(0, 300) };
      }
    } catch { /* ignore stringify errors */ }
  }

  // 3) output_text style (some models like older Anthropic)
  const outText = resp?.output_text;
  if (typeof outText === 'string' && outText.trim()) {
    return { text: outText, strategy: 'output_text', rawType, preview: outText.slice(0, 300) };
  }

  // 4) OpenAI choices content as string
  const c1 = resp?.choices?.[0]?.message?.content;
  if (typeof c1 === 'string' && c1.trim()) {
    return { text: c1, strategy: 'choices.content.string', rawType, preview: c1.slice(0, 300) };
  }

  // 5) Content as array of blocks (Anthropic-style or OpenAI vision)
  if (Array.isArray(c1)) {
    // Try text blocks first
    const textBlock = c1.find((b: any) => b?.type === 'text' && typeof b?.text === 'string' && b.text.trim());
    if (textBlock) {
      return { text: textBlock.text, strategy: 'choices.content.blocks', rawType, preview: textBlock.text.slice(0, 300) };
    }
    
    // Try tool_use blocks (Anthropic style)
    const toolBlock = c1.find((b: any) => b?.type === 'tool_use' && b?.input);
    if (toolBlock?.input) {
      const inputStr = typeof toolBlock.input === 'string' ? toolBlock.input : JSON.stringify(toolBlock.input);
      if (inputStr && inputStr.trim() && inputStr !== '{}') {
        return { text: inputStr, strategy: 'choices.content.tool_use', rawType, preview: inputStr.slice(0, 300) };
      }
    }
  }
  
  // 6) Direct message.content array (Anthropic responses)
  if (Array.isArray(resp?.content)) {
    const textBlock = resp.content.find((b: any) => b?.type === 'text' && typeof b?.text === 'string' && b.text.trim());
    if (textBlock) {
      return { text: textBlock.text, strategy: 'choices.content.blocks', rawType, preview: textBlock.text.slice(0, 300) };
    }
    
    const toolBlock = resp.content.find((b: any) => b?.type === 'tool_use' && b?.input);
    if (toolBlock?.input) {
      const inputStr = typeof toolBlock.input === 'string' ? toolBlock.input : JSON.stringify(toolBlock.input);
      if (inputStr && inputStr.trim() && inputStr !== '{}') {
        return { text: inputStr, strategy: 'choices.content.tool_use', rawType, preview: inputStr.slice(0, 300) };
      }
    }
  }

  // 7) Fallback: common alternative fields
  const alt = resp?.content ?? resp?.message?.content ?? resp?.text ?? resp?.response?.text;
  if (typeof alt === 'string' && alt.trim()) {
    return { text: alt, strategy: 'alt.content', rawType, preview: alt.slice(0, 300) };
  }

  return { text: null, strategy: 'none', rawType, preview: null };
}

/**
 * Logs extraction diagnostic info to console
 */
export function logExtractionDiagnostic(
  extraction: ExtractionResult,
  context: { phase?: string; model?: string; attempt?: number }
): void {
  const { phase = 'unknown', model = 'unknown', attempt = 1 } = context;
  
  if (extraction.text) {
    console.log(`[EXTRACT] ✓ ${phase} (${model}, attempt ${attempt}): strategy=${extraction.strategy}, len=${extraction.text.length}`);
  } else {
    console.warn(`[EXTRACT] ✗ ${phase} (${model}, attempt ${attempt}): EMPTY - rawType=${extraction.rawType}, strategy=${extraction.strategy}`);
  }
}
