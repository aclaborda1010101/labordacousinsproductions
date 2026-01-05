import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// FORENSIC SCRIPT ANALYST v2.0 - SYSTEM PROMPT
// CRITICAL: This function NEVER invents content. It ONLY extracts data.
// =============================================================================
const FORENSIC_ANALYST_PROMPT = `You are a Forensic Script Analyst. Your job is DATA EXTRACTION, NOT creative writing.

Analyze the provided screenplay text and output a JSON object with rich metadata and confidence scoring.

CRITICAL RULES:
1. NEVER invent content - only extract what exists in the source
2. For every extracted field, provide a confidence score (0.0-1.0) based on how clearly it was stated
3. Provide source text snippets that triggered each extraction
4. Flag ambiguous or unclear data with low confidence

LANGUAGE AGNOSTICISM:
- Detect the script language automatically
- Recognize scene headers in ANY format: 'INT.', 'EXT.', 'INTERIOR', 'EXTERIOR', 'INT/EXT', 'I/E', 'INTERNO', 'EXTERNO'
- Translate time/location cues to standardized English in metadata:
  * 'NOCHE' -> 'NIGHT', 'DÍA' -> 'DAY', 'AMANECER' -> 'DAWN', 'ATARDECER' -> 'DUSK'
  * 'NUIT' -> 'NIGHT', 'JOUR' -> 'DAY'
- Keep original text in 'slugline.value'

FORMAT DETECTION:
- Scan for 'Episode', 'Chapter', 'Episodio', 'Capítulo', 'Pilot', 'Teaser'
- If detected, set project_type to 'SERIES' and extract episode_number
- Otherwise, assume project_type: 'MOVIE' with episode_number: 1

CANON SCOUTING:
- CHARACTERS: Extract all speaking/described characters. Flag suggest_canon: true if appearances > 3
- PROPS: Extract objects with specific visual descriptors (e.g., 'ancient silver dagger')
- LOCATIONS: Group by recurring locations. Flag suggest_canon: true if used multiple times

VISUAL & AUDIO EXTRACTION:
- visual_style: Look for explicit markers '(B&W)', '(BLACK AND WHITE)', '(SEPIA)', '(FLASHBACK)', '(BLANCO Y NEGRO)'
- audio_cues:
  * explicit: CAPITALIZED SOUNDS or 'SFX:', 'SOUND OF...'
  * inferred: Ambient sounds implied by location/action
- visual_fx_cues: 'INSERT CUT:', 'VFX:', 'CGI:', rapid montage descriptions
- technical_notes: Camera directions found (CLOSE ON:, ZOOM, PAN, TRAVELLING, TRACKING SHOT)

OUTPUT JSON SCHEMA:
{
  "analysis_metadata": {
    "parser_version": "2.0",
    "extraction_timestamp": "ISO timestamp",
    "source_type": "PDF" | "TEXT",
    "total_confidence_score": 0.0-1.0
  },
  "project_metadata": {
    "type": { "value": "MOVIE" | "SERIES", "confidence": 0.0-1.0, "source": "..." },
    "detected_language": { "value": "es" | "en" | "fr", "confidence": 0.0-1.0 },
    "title": { "value": "...", "confidence": 0.0-1.0, "source": "..." },
    "estimated_runtime_minutes": { "value": number, "confidence": 0.0-1.0 }
  },
  "canon_suggestions": [
    {
      "type": "CHARACTER" | "PROP" | "LOCATION",
      "name": { "value": "...", "confidence": 0.0-1.0, "source": "..." },
      "visual_traits": [{ "value": "...", "confidence": 0.0-1.0, "source": "..." }],
      "appearances": number,
      "suggest_canon": boolean,
      "reason": "..."
    }
  ],
  "scenes": [
    {
      "scene_number": number,
      "episode_number": number,
      "slugline": {
        "value": "INT. COCINA - NOCHE",
        "source": "Line 45"
      },
      "standardized_location": {
        "value": "KITCHEN",
        "confidence": 0.95
      },
      "standardized_time": {
        "value": "NIGHT",
        "confidence": 0.95
      },
      "location_type": {
        "value": "INT" | "EXT" | "INT/EXT",
        "confidence": 0.0-1.0
      },
      "visual_style": {
        "value": "COLOR" | "MONOCHROME" | "SEPIA",
        "confidence": 0.0-1.0,
        "source": "Parenthetical '(B&W SEQUENCE)' found at line 12"
      },
      "action_summary": {
        "value": "Brief summary of what happens",
        "confidence": 0.0-1.0
      },
      "characters_present": [
        { "value": "Frank", "confidence": 0.0-1.0, "source": "Dialogue at line 50" }
      ],
      "audio_cues": {
        "explicit": [{ "value": "LOUD BANG", "confidence": 1.0, "source": "Line 55" }],
        "inferred": [{ "value": "Rain ambience", "confidence": 0.7, "source": "Action describes rain" }],
        "confidence_score": 0.85
      },
      "visual_fx_cues": [
        { "value": "Lightning flash", "confidence": 0.9, "source": "Action line 60" }
      ],
      "technical_notes": {
        "value": "CLOSE ON the knife",
        "confidence": 1.0,
        "source": "Explicit direction at line 52"
      },
      "dialogue_count": number,
      "mood": {
        "value": "tense",
        "confidence": 0.0-1.0,
        "source": "Inferred from action: 'He grips the gun tightly'"
      },
      "lighting_hints": {
        "value": "dim candlelight",
        "confidence": 0.0-1.0,
        "source": "Action: 'A single candle flickers'"
      },
      "raw_content": "Original scene text extracted verbatim (first 500 chars)"
    }
  ]
}

CONFIDENCE SCORING GUIDE:
- 1.0: Explicitly stated in script (exact quote found)
- 0.8-0.9: Very clearly implied with strong evidence
- 0.6-0.7: Reasonably inferred from context
- 0.4-0.5: Educated guess based on genre/tone
- 0.2-0.3: Weak inference, may need user verification
- 0.0-0.1: Unable to determine, placeholder value

CRITICAL: Return ONLY valid JSON. No markdown, no commentary, no creative additions.`;

// =============================================================================
// CONFIGURATION
// =============================================================================
interface ProcessingConfig {
  model: string;
  timeoutMs: number;
  maxTokens: number;
  extractionPrompt: string;
  isLarge: boolean;
  estimatedPages: number;
}

function getProcessingConfig(fileSizeBytes: number): ProcessingConfig {
  const estimatedPages = Math.ceil(fileSizeBytes / 3500);
  
  if (fileSizeBytes < 100000) {
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 60000,
      maxTokens: 50000,
      isLarge: false,
      estimatedPages,
      extractionPrompt: `Extract ALL text from this PDF screenplay VERBATIM. Preserve exact formatting:
- Scene headings (INT./EXT./INTERIOR/EXTERIOR)
- Character names in CAPS before dialogue
- Dialogue and parentheticals
- Action lines
- Any camera directions (CLOSE ON, INSERT, etc.)
- Any visual style markers (B&W, FLASHBACK, etc.)
Return the complete verbatim text. DO NOT summarize or interpret.`
    };
  } else if (fileSizeBytes < 300000) {
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 120000,
      maxTokens: 80000,
      isLarge: false,
      estimatedPages,
      extractionPrompt: `Extract the complete screenplay text VERBATIM. Preserve:
- All scene headings (INT./EXT. in any language)
- Character names and dialogue exactly as written
- Action descriptions
- Sound cues (CAPITALIZED sounds)
- Visual markers (B&W, FLASHBACK, SEPIA)
Return verbatim text in screenplay format. DO NOT interpret or add content.`
    };
  } else if (fileSizeBytes < 600000) {
    return {
      model: "google/gemini-2.5-flash-lite",
      timeoutMs: 180000,
      maxTokens: 60000,
      isLarge: true,
      estimatedPages,
      extractionPrompt: `Extract screenplay text focusing on:
- Scene headings (INT./EXT.)
- Character names and key dialogue
- Main action beats
- Any visual style indicators (B&W, FLASHBACK)
Preserve original text. Return in screenplay format.`
    };
  } else {
    return {
      model: "google/gemini-2.5-flash-lite",
      timeoutMs: 240000,
      maxTokens: 50000,
      isLarge: true,
      estimatedPages,
      extractionPrompt: `Extract key screenplay elements:
- All scene headings with locations
- Character names and essential dialogue
- Key plot points and action
- Visual style markers (B&W, COLOR)
Skip detailed descriptions. Return structured screenplay format.`
    };
  }
}

// =============================================================================
// PDF EXTRACTION
// =============================================================================
async function extractTextWithAI(pdfBytes: Uint8Array, config: ProcessingConfig): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("AI service not configured");
  }

  console.log(`[parse-script] Extracting PDF: model=${config.model}, timeout=${config.timeoutMs}ms, ~${config.estimatedPages} pages`);
  
  const pdfBase64 = encodeBase64(pdfBytes);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "You are a professional screenplay text extractor. Output ONLY the extracted text VERBATIM. Never add commentary or interpretation."
          },
          {
            role: "user",
            content: [
              {
                type: "file",
                file: {
                  filename: "script.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`
                }
              },
              {
                type: "text",
                text: config.extractionPrompt
              }
            ]
          }
        ],
        temperature: 0.0, // Zero temperature for pure extraction
        max_tokens: config.maxTokens
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-script] AI extraction error:", response.status, errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || "";
    
    console.log(`[parse-script] AI extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timeout: el PDF (~${config.estimatedPages} páginas) tardó demasiado`);
    }
    throw error;
  }
}

function extractTextFromPdfBytes(pdfBytes: Uint8Array): string {
  const decoder = new TextDecoder('latin1');
  const rawContent = decoder.decode(pdfBytes);
  
  let extractedText = '';
  const textBlocks = rawContent.match(/BT[\s\S]*?ET/g) || [];
  
  for (const block of textBlocks) {
    const tjMatches = block.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g) || [];
    for (const tj of tjMatches) {
      const match = tj.match(/\(([^)\\]*(?:\\.[^)\\]*)*)\)/);
      if (match) {
        let text = match[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\\(/g, '(')
          .replace(/\\\)/g, ')')
          .replace(/\\\\/g, '\\');
        extractedText += text;
      }
    }
  }
  
  return extractedText
    .replace(/\x00/g, '')
    .replace(/[^\x20-\x7E\n\r\táéíóúñÁÉÍÓÚÑüÜ¿¡àèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöüÄËÏÖÜçÇ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { scriptText, pdfUrl, projectId, parseMode } = body;

    console.log("[parse-script] v2.0 FORENSIC ANALYST called:", { 
      hasPdfUrl: !!pdfUrl, 
      hasScriptText: !!scriptText, 
      projectId, 
      parseMode,
      textLength: scriptText?.length 
    });

    let textToProcess = scriptText;
    let sourceType: "PDF" | "TEXT" = scriptText ? "TEXT" : "PDF";
    let extractionStats: Record<string, unknown> = {};

    // Handle PDF extraction
    if (pdfUrl && !scriptText) {
      console.log("[parse-script] Fetching PDF from:", pdfUrl);
      
      try {
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
        }
        
        const pdfBuffer = await pdfResponse.arrayBuffer();
        const pdfBytes = new Uint8Array(pdfBuffer);
        const fileSizeKB = Math.round(pdfBytes.length / 1024);
        console.log(`[parse-script] PDF downloaded: ${pdfBytes.length} bytes (${fileSizeKB}KB)`);
        
        const config = getProcessingConfig(pdfBytes.length);
        extractionStats = {
          originalSizeKB: fileSizeKB,
          estimatedPages: config.estimatedPages,
          wasLargeFile: config.isLarge,
          modelUsed: config.model
        };
        
        let extractedText = "";
        try {
          extractedText = await extractTextWithAI(pdfBytes, config);
        } catch (aiError) {
          console.warn("[parse-script] AI extraction failed, falling back to regex:", aiError);
          extractedText = extractTextFromPdfBytes(pdfBytes);
          
          if (config.isLarge && extractedText.length < 1000) {
            return new Response(
              JSON.stringify({ 
                error: `Este guión (~${config.estimatedPages} páginas) es muy extenso. Por favor, copia el texto y pégalo directamente.`,
                rawText: "",
                needsManualInput: true,
                hint: "Puedes procesar el guión por partes: primero el primer acto, luego el segundo, etc.",
                stats: extractionStats
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
        
        if (extractedText.length < 50) {
          return new Response(
            JSON.stringify({ 
              error: "El PDF parece ser escaneado o tiene un formato no compatible. Por favor, copia y pega el texto directamente.",
              rawText: "",
              needsManualInput: true
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        textToProcess = extractedText;
        extractionStats.extractedChars = extractedText.length;
        
        // If parseMode is 'extract_only', just return raw text
        if (parseMode === 'extract_only') {
          return new Response(
            JSON.stringify({ 
              rawText: textToProcess,
              success: true,
              stats: extractionStats
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
      } catch (pdfError) {
        console.error("[parse-script] PDF processing error:", pdfError);
        
        const errorMessage = pdfError instanceof Error ? pdfError.message : "Unknown error";
        const isTimeout = errorMessage.toLowerCase().includes("timeout");
        
        return new Response(
          JSON.stringify({ 
            error: isTimeout 
              ? errorMessage
              : "Error al procesar el PDF. Intenta copiar y pegar el texto directamente.",
            rawText: "",
            needsManualInput: true,
            hint: isTimeout ? "Puedes dividir el guión en partes (Acto 1, Acto 2, etc.) y procesarlas por separado." : undefined
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (!textToProcess) {
      return new Response(
        JSON.stringify({ error: "Script text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // FORENSIC ANALYSIS v2.0 - PURE EXTRACTION WITH CONFIDENCE SCORES
    // =============================================================================
    console.log("[parse-script] Running Forensic Analysis v2.0...");
    console.log(`[parse-script] Text to analyze: ${textToProcess.length} chars`);
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: FORENSIC_ANALYST_PROMPT },
          { 
            role: "user", 
            content: `Perform forensic analysis on this screenplay. Extract data with confidence scores. DO NOT invent content.

SOURCE TEXT:
${textToProcess}` 
          }
        ],
        temperature: 0.1, // Low temperature for analytical accuracy
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("[parse-script] AI analysis error:", response.status, errorText);
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No analysis content received from AI");
    }

    // Parse and validate JSON
    let analysisResult;
    try {
      analysisResult = JSON.parse(content);
    } catch (parseError) {
      console.error("[parse-script] JSON parse error:", parseError);
      console.log("[parse-script] Raw content:", content.substring(0, 500));
      
      // Try to extract JSON from markdown blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error("Failed to parse analysis result as JSON");
      }
    }

    // Add analysis metadata
    analysisResult.analysis_metadata = {
      parser_version: "2.0",
      extraction_timestamp: new Date().toISOString(),
      source_type: sourceType,
      extraction_stats: extractionStats,
      total_confidence_score: calculateAverageConfidence(analysisResult)
    };

    console.log("[parse-script] Forensic analysis complete:", {
      scenes: analysisResult.scenes?.length || 0,
      canonSuggestions: analysisResult.canon_suggestions?.length || 0,
      avgConfidence: analysisResult.analysis_metadata.total_confidence_score
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...analysisResult,
        rawText: textToProcess.substring(0, 5000) // Include first 5000 chars for reference
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[parse-script] Fatal error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// =============================================================================
// UTILITY: Calculate average confidence across all extracted data
// =============================================================================
function calculateAverageConfidence(result: Record<string, unknown>): number {
  const confidences: number[] = [];
  
  function extractConfidences(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    
    if (Array.isArray(obj)) {
      obj.forEach(extractConfidences);
      return;
    }
    
    const record = obj as Record<string, unknown>;
    if ('confidence' in record && typeof record.confidence === 'number') {
      confidences.push(record.confidence);
    }
    
    Object.values(record).forEach(extractConfidences);
  }
  
  extractConfidences(result);
  
  if (confidences.length === 0) return 0.5;
  return Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100;
}
