import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64, decodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { 
  v3RequireAuth, 
  v3RequireProjectAccess,
  v3AcquireProjectLock,
  v3ReleaseProjectLock,
  v3CheckRateLimit,
  v3LogRunStart,
  v3LogRunComplete,
  v3Error,
  v3ValidateFileSize,
  corsHeaders,
  V3AuthContext
} from "../_shared/v3-enterprise.ts";

// =============================================================================
// FORENSIC SCRIPT ANALYST v3.0 - SYSTEM PROMPT
// CRITICAL: This function NEVER invents content. It ONLY extracts data.
// V3.0: Canon levels, technical_metadata, visual_dna extraction
// =============================================================================
const FORENSIC_ANALYST_PROMPT = `You are a Forensic Script Analyst.

Your ONLY job is to extract structure and facts from screenplay documents.

YOU MUST NEVER CREATE CONTENT.

---

ABSOLUTE RULES

1. NEVER invent.
2. NEVER beautify.
3. NEVER summarize globally.
4. NEVER assign P0 canon (P0 is USER ONLY).
5. Preserve chronology exactly.

---

CANON LEVELS (CRITICAL for V3.0)

P1 — Explicit in text (confidence >= 0.9)
  - "He wears a RED jacket"
  - "Missing left eye"
  - "The ABANDONED WAREHOUSE on 5th street"

P2 — Logical inference (confidence 0.6-0.89)
  - NIGHT → artificial light needed
  - RAIN → wet surfaces
  - KITCHEN → implies cooking implements

P3 — Weak inference (confidence < 0.6)
  - Use sparingly
  - Must be listed under "uncertainties"

P0 IS FORBIDDEN HERE. P0 is reserved for explicit user approval in UI.

---

VISUAL_DNA EXTRACTION

For CHARACTERS, extract:
{
  "hard_traits": ["explicit visual features from script"],
  "soft_traits": ["inferred or implied features"],
  "do_not_assume": ["exact face", "exact age", "exact ethnicity"]
}

For LOCATIONS, extract:
{
  "hard_traits": ["explicit visual features from script"],
  "soft_traits": ["inferred or implied features"],
  "do_not_assume": ["exact architecture style", "exact color scheme"]
}

---

TECHNICAL METADATA (Per Scene)

Extract ONLY if explicitly stated in the script. If not explicit → leave null.
DO NOT infer camera, lens, lighting or grading unless explicitly written.

{
  "_status": "EMPTY | PARTIAL | EXPLICIT",
  "camera": {
    "lens": null or "extracted value",
    "movement": null or "extracted value",
    "framing": null or "extracted value"
  },
  "lighting": {
    "type": null or "extracted value",
    "direction": null or "extracted value",
    "mood": null or "extracted value"
  },
  "sound": {
    "sfx": ["CAPITALIZED SOUNDS"],
    "ambience": ["implied ambient sounds"]
  },
  "color": {
    "palette": null or "extracted value",
    "contrast": null or "extracted value"
  }
}

_status rules:
- EMPTY → no technical info found
- PARTIAL → some fields inferred from context (e.g., NIGHT → dim lighting)
- EXPLICIT → explicitly stated in script (e.g., "CLOSE ON:", "B&W")

---

LANGUAGE AGNOSTICISM:
- Detect the script language automatically
- Recognize scene headers in ANY format: 'INT.', 'EXT.', 'INTERIOR', 'EXTERIOR', 'INT/EXT', 'I/E', 'INTERNO', 'EXTERNO'
- Translate time/location cues to standardized English in metadata
- Keep original text in 'slugline.value'

---

OUTPUT JSON SCHEMA (V3.0):

{
  "analysis_metadata": {
    "parser_version": "3.0",
    "extraction_timestamp": "ISO timestamp",
    "source_type": "PDF" | "TEXT",
    "total_confidence_score": 0.0-1.0
  },
  "project_metadata": {
    "type": { "value": "MOVIE" | "SERIES", "confidence": 0.0-1.0 },
    "detected_language": { "value": "es" | "en" | "fr", "confidence": 0.0-1.0 },
    "title": { "value": "...", "confidence": 0.0-1.0, "source": "..." }
  },
  "characters": [
    {
      "name": "...",
      "canon_level": "P1" | "P2" | "P3",
      "source": "EXTRACTED",
      "confidence": 0.0-1.0,
      "visual_dna": {
        "hard_traits": [],
        "soft_traits": [],
        "do_not_assume": ["exact face", "exact age", "exact ethnicity"]
      },
      "appearances": number,
      "source_references": ["line numbers or context"]
    }
  ],
  "locations": [
    {
      "name": "...",
      "canon_level": "P1" | "P2" | "P3",
      "source": "EXTRACTED",
      "confidence": 0.0-1.0,
      "visual_dna": {
        "hard_traits": [],
        "soft_traits": [],
        "do_not_assume": ["exact architecture style"]
      },
      "appearances": number,
      "source_references": ["scene numbers or sluglines"]
    }
  ],
  "scenes": [
    {
      "scene_number": number,
      "episode_number": number,
      "slugline": {
        "value": "original text",
        "source": "Line X"
      },
      "standardized_location": { "value": "...", "confidence": 0.0-1.0 },
      "standardized_time": { "value": "DAY|NIGHT|DAWN|DUSK", "confidence": 0.0-1.0 },
      "location_type": { "value": "INT|EXT|INT/EXT", "confidence": 0.0-1.0 },
      "technical_metadata": {
        "_status": "EMPTY" | "PARTIAL" | "EXPLICIT",
        "camera": { "lens": null, "movement": null, "framing": null },
        "lighting": { "type": null, "direction": null, "mood": null },
        "sound": { "sfx": [], "ambience": [] },
        "color": { "palette": null, "contrast": null }
      },
      "characters_present": [{ "value": "...", "confidence": 0.0-1.0 }],
      "action_summary": { "value": "...", "confidence": 0.0-1.0 },
      "raw_content": "first 500 chars verbatim"
    }
  ],
  "extraction_quality": {
    "total_scenes": number,
    "scenes_with_explicit_tech": number,
    "characters_p1_count": number,
    "characters_p2_count": number,
    "characters_p3_count": number,
    "uncertainties": ["list of weak inferences that need verification"]
  }
}

CONFIDENCE SCORING GUIDE:
- 1.0: Explicitly stated in script (exact quote found)
- 0.8-0.9: Very clearly implied with strong evidence (P1)
- 0.6-0.79: Reasonably inferred from context (P2)
- 0.4-0.59: Educated guess based on genre/tone (P3)
- Below 0.4: Do not extract, list in uncertainties

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
  needsChunking: boolean;
  chunkSize: number;
}

const CHUNK_SIZE_CHARS = 80000; // ~40 pages per chunk
const MAX_CHARS_FOR_SINGLE_ANALYSIS = 100000; // ~50 pages

function getProcessingConfig(fileSizeBytes: number): ProcessingConfig {
  const estimatedPages = Math.ceil(fileSizeBytes / 3500);
  const needsChunking = fileSizeBytes > 400000; // >400KB needs chunking
  
  if (fileSizeBytes < 100000) {
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 60000,
      maxTokens: 50000,
      isLarge: false,
      estimatedPages,
      needsChunking: false,
      chunkSize: CHUNK_SIZE_CHARS,
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
      needsChunking: false,
      chunkSize: CHUNK_SIZE_CHARS,
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
      model: "google/gemini-2.5-flash",
      timeoutMs: 180000,
      maxTokens: 100000,
      isLarge: true,
      estimatedPages,
      needsChunking,
      chunkSize: CHUNK_SIZE_CHARS,
      extractionPrompt: `Extract screenplay text focusing on:
- Scene headings (INT./EXT.)
- Character names and key dialogue
- Main action beats
- Any visual style indicators (B&W, FLASHBACK)
Preserve original text. Return in screenplay format.`
    };
  } else {
    // Use flash-lite for very large scripts (>600KB) - fastest model for high-volume extraction
    return {
      model: "google/gemini-2.5-flash-lite",
      timeoutMs: 180000, // 3 min - flash-lite is much faster
      maxTokens: 100000,
      isLarge: true,
      estimatedPages,
      needsChunking: true,
      chunkSize: CHUNK_SIZE_CHARS,
      extractionPrompt: `Extract key screenplay elements:
- All scene headings with locations
- Character names and essential dialogue
- Key plot points and action
- Visual style markers (B&W, COLOR)
Preserve original text. Return in screenplay format.`
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
        // Gemini models use max_tokens (not max_completion_tokens like OpenAI)
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
// CAMBIO B: CHARACTER CANDIDATE EXTRACTION (Heuristic, no AI)
// Extracts ALL CAPS lines that precede dialogue as potential character names
// =============================================================================
function extractCharacterCandidates(rawText: string): string[] {
  if (!rawText || typeof rawText !== 'string') return [];
  
  const lines = rawText.split('\n');
  const candidates = new Set<string>();
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || '';
    
    // Skip empty lines
    if (!line) continue;
    
    // Must be ALL CAPS (or mostly)
    if (line !== line.toUpperCase()) continue;
    
    // Must not be a scene heading
    if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.|INTERIOR|EXTERIOR)/i.test(line)) continue;
    
    // Must not be a transition
    if (/^(FADE|CUT TO|DISSOLVE|SMASH CUT|MATCH CUT|WIPE|IRIS|BLACK|WHITE|END|TITLE|SUPER)/i.test(line)) continue;
    
    // Must not be too long (character names are typically short)
    if (line.length > 45) continue;
    
    // Must not be a parenthetical only
    if (/^\([^)]+\)$/.test(line)) continue;
    
    // Must not be time/page markers
    if (/^(CONTINUED|MORE|\d+\.|PAGE\s+\d)/i.test(line)) continue;
    
    // Next line should have content (dialogue indicator)
    if (!nextLine || /^(INT\.|EXT\.|FADE|CUT|--)/i.test(nextLine)) continue;
    
    // Extract character name (before any parenthetical)
    let charName = line.replace(/\s*\([^)]*\)\s*$/, '').trim();
    
    // Clean up CONT'D, V.O., O.S., etc.
    charName = charName
      .replace(/\bCONT['']?D\.?\b/gi, '')
      .replace(/\bCONT\.?\b/gi, '')
      .replace(/\bCONTINUED\b/gi, '')
      .replace(/\((V\.O\.|O\.S\.|O\.C\.|VO|OS|OC|ON SCREEN|OFF|OVER|PRELAP|SINGING|WHISPERS?|SHOUTING|YELLING|READING|THINKING)\)/gi, '')
      .replace(/\s*#\d+/g, '') // Remove #1, #2 etc
      .replace(/\s+/g, ' ')
      .trim();
    
    // Final validation
    if (charName && charName.length >= 2 && charName.length <= 40 && !/^\d+$/.test(charName)) {
      candidates.add(charName);
    }
  }
  
  return Array.from(candidates).sort();
}

// =============================================================================
// SCENE HEADING EXTRACTION (Heuristic, no AI)
// Extracts all INT./EXT. headings for location derivation
// =============================================================================
function extractSceneHeadings(rawText: string): string[] {
  if (!rawText || typeof rawText !== 'string') return [];
  
  const headings: string[] = [];
  const lines = rawText.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(INT\.|EXT\.|INT\/EXT|I\/E\.|INTERIOR|EXTERIOR)/i.test(trimmed)) {
      headings.push(trimmed);
    }
  }
  
  return headings;
}

// =============================================================================
// MAIN HANDLER
// =============================================================================
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // =======================================================================
  // V3.0 ENTERPRISE AUTHENTICATION
  // =======================================================================
  const authResult = await v3RequireAuth(req);
  if (authResult instanceof Response) {
    return authResult;
  }
  const auth: V3AuthContext = authResult;

  // Track for logging and cleanup
  let projectId: string | null = null;
  let lockAcquired = false;
  let runId: string | null = null;
  const startTime = Date.now();

  try {
    const body = await req.json();
    const {
      scriptText,
      pdfUrl,
      pdfBase64,
      fileName,
      projectId: bodyProjectId,
      parseMode: bodyParseMode,
    } = (body ?? {}) as Record<string, any>;

    projectId = bodyProjectId || null;

    // Backwards-compat: old clients sent pdfBase64 and expected extract-only behavior
    const parseMode: string | undefined = bodyParseMode ?? (pdfBase64 ? 'extract_only' : undefined);

    // =======================================================================
    // V3.0 PROJECT ACCESS + LOCKING + RATE LIMIT
    // =======================================================================
    if (projectId) {
      const accessResult = await v3RequireProjectAccess(auth, projectId);
      if (accessResult instanceof Response) {
        return accessResult;
      }

      // Acquire project lock for parse operations
      const lockResult = await v3AcquireProjectLock(
        auth.supabase,
        projectId,
        auth.userId,
        'script_parsing',
        300 // 5 minutes max
      );

      if (!lockResult.acquired) {
        return v3Error('PROJECT_BUSY', 'Este proyecto ya está procesando un guión', 409, lockResult.retryAfter);
      }
      lockAcquired = true;

      // Check rate limit
      const rateLimitResult = await v3CheckRateLimit(projectId, auth.userId, 'parse-script', 5);
      if (!rateLimitResult.allowed) {
        await v3ReleaseProjectLock(auth.supabase, projectId);
        lockAcquired = false;
        return v3Error('RATE_LIMIT_EXCEEDED', 'Demasiadas solicitudes, espera un momento', 429, rateLimitResult.retryAfter);
      }
    }

    // Log run start
    runId = await v3LogRunStart({
      userId: auth.userId,
      projectId: projectId || undefined,
      functionName: 'parse-script',
      provider: 'gemini',
    });

    console.log("[parse-script] v3.0 FORENSIC ANALYST called:", {
      hasPdfUrl: !!pdfUrl,
      hasPdfBase64: !!pdfBase64,
      fileName,
      hasScriptText: !!scriptText,
      projectId,
      parseMode,
      textLength: scriptText?.length,
      userId: auth.userId,
    });

    let textToProcess = scriptText;
    let sourceType: "PDF" | "TEXT" = scriptText ? "TEXT" : "PDF";
    let extractionStats: Record<string, unknown> = {};

    // Handle PDF extraction (supports pdfUrl OR pdfBase64)
    if ((pdfUrl || pdfBase64) && !scriptText) {
      const sourceLabel = pdfUrl ? 'url' : 'base64';
      console.log(
        "[parse-script] Preparing PDF:",
        sourceLabel,
        pdfUrl ? pdfUrl : (fileName ?? 'inline_base64')
      );

      try {
        let pdfBytes: Uint8Array;

        if (pdfUrl) {
          const pdfResponse = await fetch(pdfUrl);
          if (!pdfResponse.ok) {
            throw new Error(`Failed to fetch PDF: ${pdfResponse.status}`);
          }

          const pdfBuffer = await pdfResponse.arrayBuffer();
          pdfBytes = new Uint8Array(pdfBuffer);
        } else {
          const raw = String(pdfBase64 ?? '');
          const cleaned = raw.includes('base64,') ? raw.split('base64,')[1] : raw;
          pdfBytes = decodeBase64(cleaned);
        }

        const fileSizeKB = Math.round(pdfBytes.length / 1024);
        console.log(`[parse-script] PDF ready: ${pdfBytes.length} bytes (${fileSizeKB}KB), source=${sourceLabel}`);

        const config = getProcessingConfig(pdfBytes.length);
        extractionStats = {
          originalSizeKB: fileSizeKB,
          estimatedPages: config.estimatedPages,
          wasLargeFile: config.isLarge,
          modelUsed: config.model,
          source: sourceLabel,
          fileName,
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
                stats: extractionStats,
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
              needsManualInput: true,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        textToProcess = extractedText;
        extractionStats.extractedChars = extractedText.length;

        // If parseMode is 'extract_only', just return raw text (full)
        if (parseMode === 'extract_only') {
          return new Response(
            JSON.stringify({
              rawText: textToProcess,
              extractedText: textToProcess,
              success: true,
              stats: extractionStats,
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
            hint: isTimeout ? "Puedes dividir el guión en partes (Acto 1, Acto 2, etc.) y procesarlas por separado." : undefined,
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
    // CAMBIO B: EXTRACT CHARACTER CANDIDATES + SCENE HEADINGS (Heuristic, no AI)
    // This ensures we ALWAYS have this data even if AI analysis fails
    // =============================================================================
    const characterCandidates = extractCharacterCandidates(textToProcess);
    const sceneHeadings = extractSceneHeadings(textToProcess);
    
    console.log("[parse-script] Heuristic extraction complete:", {
      character_candidates: characterCandidates.length,
      scene_headings: sceneHeadings.length,
    });

    // =============================================================================
    // FORENSIC ANALYSIS v2.0 - WITH CHUNKING FOR LONG SCRIPTS
    // =============================================================================
    console.log("[parse-script] Running Forensic Analysis v2.0...");
    console.log(`[parse-script] Text to analyze: ${textToProcess.length} chars`);
    
    let analysisResult: Record<string, unknown>;
    
    // Check if we need to chunk the analysis
    if (textToProcess.length > MAX_CHARS_FOR_SINGLE_ANALYSIS) {
      console.log("[parse-script] Script is too long, using chunked analysis...");
      analysisResult = await analyzeInChunks(textToProcess, LOVABLE_API_KEY);
    } else {
      // Single-pass analysis for shorter scripts
      analysisResult = await analyzeScript(textToProcess, LOVABLE_API_KEY);
    }

    // =============================================================================
    // CAMBIO A: ALWAYS persist scene headings for location derivation
    // =============================================================================
    // Ensure scenes object exists with headings
    if (!analysisResult.scenes) {
      analysisResult.scenes = { list: [], total: 0 };
    }
    
    const existingScenes = (analysisResult.scenes as Record<string, unknown>)?.list as unknown[];
    if (!existingScenes || existingScenes.length === 0) {
      // Fallback: create minimal scene entries from extracted headings
      (analysisResult.scenes as Record<string, unknown>).list = sceneHeadings.map((heading, idx) => ({
        number: idx + 1,
        heading: heading,
        _source: 'heuristic_extraction'
      }));
      (analysisResult.scenes as Record<string, unknown>).total = sceneHeadings.length;
      console.log(`[parse-script] Rebuilt scenes from ${sceneHeadings.length} extracted headings`);
    }

    // Add analysis metadata
    const analysisMetadata = {
      parser_version: "2.1", // Updated version
      extraction_timestamp: new Date().toISOString(),
      source_type: sourceType,
      extraction_stats: extractionStats,
      total_confidence_score: calculateAverageConfidence(analysisResult),
      chunked: textToProcess.length > MAX_CHARS_FOR_SINGLE_ANALYSIS,
      heuristic_extraction: {
        character_candidates_count: characterCandidates.length,
        scene_headings_count: sceneHeadings.length,
      }
    };
    analysisResult.analysis_metadata = analysisMetadata;
    
    // CAMBIO B: Always include character_candidates for downstream processing
    analysisResult.character_candidates = characterCandidates;
    
    // Also include raw scene headings for location derivation
    analysisResult.scene_headings_raw = sceneHeadings;

    const scenes = (analysisResult.scenes as Record<string, unknown>)?.list as unknown[] | undefined;
    const canonSuggestions = analysisResult.canon_suggestions as unknown[] | undefined;
    
    console.log("[parse-script] Forensic analysis complete:", {
      scenes: scenes?.length || 0,
      character_candidates: characterCandidates.length,
      canonSuggestions: canonSuggestions?.length || 0,
      avgConfidence: analysisMetadata.total_confidence_score
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...analysisResult,
        rawText: textToProcess.substring(0, 5000)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[parse-script] Fatal error:", error);
    
    // Log failure
    if (runId) {
      await v3LogRunComplete(runId, 'failed', undefined, undefined, 'PARSE_ERROR', error instanceof Error ? error.message : 'Unknown error');
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        code: 'PARSE_ERROR',
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    // =======================================================================
    // V3.0 LOCK RELEASE - Always release lock on exit
    // =======================================================================
    if (lockAcquired && projectId) {
      await v3ReleaseProjectLock(auth.supabase, projectId);
      console.log('[parse-script] Lock released for project:', projectId);
    }

    // Log run completion (if not already done in error handler)
    if (runId) {
      const durationMs = Date.now() - startTime;
      await v3LogRunComplete(runId, 'success');
    }
  }
});

// =============================================================================
// CHUNKED ANALYSIS: Split long scripts and merge results
// =============================================================================
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    // Try to split at scene boundaries
    const isSceneHeader = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INTERIOR|EXTERIOR|INTERNO|EXTERNO)/i.test(line.trim());
    
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      // If we're at a scene header, that's a good place to split
      if (isSceneHeader) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        // Otherwise, keep going until we find a scene header or hit the limit
        currentChunk += line + '\n';
        if (currentChunk.length > chunkSize * 1.2) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }
      }
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

async function analyzeScript(text: string, apiKey: string): Promise<Record<string, unknown>> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
${text}` 
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limit exceeded. Please try again later.");
    }
    if (response.status === 402) {
      throw new Error("Usage limit reached. Please add credits.");
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

  return parseJsonSafe(content);
}

function parseJsonSafe(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content);
  } catch (parseError) {
    console.error("[parse-script] JSON parse error, attempting recovery...");
    console.log("[parse-script] Raw content (first 500 chars):", content.substring(0, 500));
    
    // Try to extract JSON from markdown blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    
    // Try to fix truncated JSON by finding last complete object/array
    let fixedContent = content;
    
    // Remove trailing incomplete content
    const lastBrace = Math.max(content.lastIndexOf('}'), content.lastIndexOf(']'));
    if (lastBrace > 0) {
      fixedContent = content.substring(0, lastBrace + 1);
      
      // Balance braces/brackets
      const openBraces = (fixedContent.match(/{/g) || []).length;
      const closeBraces = (fixedContent.match(/}/g) || []).length;
      const openBrackets = (fixedContent.match(/\[/g) || []).length;
      const closeBrackets = (fixedContent.match(/]/g) || []).length;
      
      fixedContent += '}'.repeat(Math.max(0, openBraces - closeBraces));
      fixedContent += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      
      try {
        return JSON.parse(fixedContent);
      } catch {
        console.error("[parse-script] JSON recovery failed");
      }
    }
    
    throw new Error("Failed to parse analysis result as JSON");
  }
}

async function analyzeInChunks(fullText: string, apiKey: string): Promise<Record<string, unknown>> {
  const chunks = splitIntoChunks(fullText, CHUNK_SIZE_CHARS);
  console.log(`[parse-script] Split into ${chunks.length} chunks`);
  
  const chunkResults: Record<string, unknown>[] = [];
  let sceneOffset = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[parse-script] Analyzing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)...`);
    
    const chunkPrompt = `This is PART ${i + 1} of ${chunks.length} of a screenplay.
${i > 0 ? `Previous parts contained ${sceneOffset} scenes. Continue scene numbering from ${sceneOffset + 1}.` : ''}
${i === 0 ? 'Extract project metadata from this first part.' : 'Skip project metadata, only extract scenes and characters.'}

Perform forensic analysis. Extract data with confidence scores. DO NOT invent content.

SOURCE TEXT (Part ${i + 1}/${chunks.length}):
${chunks[i]}`;

    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: FORENSIC_ANALYST_PROMPT },
            { role: "user", content: chunkPrompt }
          ],
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        console.error(`[parse-script] Chunk ${i + 1} failed: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (content) {
        const chunkResult = parseJsonSafe(content);
        chunkResults.push(chunkResult);
        
        // Update scene offset for next chunk
        const scenes = chunkResult.scenes as unknown[];
        if (Array.isArray(scenes)) {
          sceneOffset += scenes.length;
        }
      }
      
      // Small delay between chunks to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (chunkError) {
      console.error(`[parse-script] Error in chunk ${i + 1}:`, chunkError);
    }
  }
  
  if (chunkResults.length === 0) {
    throw new Error("All chunk analyses failed");
  }
  
  // Merge all chunk results
  return mergeChunkResults(chunkResults);
}

function mergeChunkResults(chunks: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    project_metadata: chunks[0]?.project_metadata || {},
    scenes: [],
    canon_suggestions: []
  };
  
  const allScenes: unknown[] = [];
  const canonMap = new Map<string, unknown>();
  
  for (const chunk of chunks) {
    // Merge scenes
    const scenes = chunk.scenes;
    if (Array.isArray(scenes)) {
      allScenes.push(...scenes);
    }
    
    // Merge canon suggestions (deduplicate by name)
    const suggestions = chunk.canon_suggestions;
    if (Array.isArray(suggestions)) {
      for (const suggestion of suggestions) {
        const sug = suggestion as Record<string, unknown>;
        const nameObj = sug.name as Record<string, unknown>;
        const name = nameObj?.value as string;
        if (name) {
          const existing = canonMap.get(name.toLowerCase()) as Record<string, unknown>;
          if (existing) {
            // Merge appearances
            const existingApps = (existing.appearances as number) || 0;
            const newApps = (sug.appearances as number) || 0;
            existing.appearances = existingApps + newApps;
            existing.suggest_canon = (existing.appearances as number) > 3;
          } else {
            canonMap.set(name.toLowerCase(), sug);
          }
        }
      }
    }
  }
  
  // Renumber scenes sequentially
  allScenes.forEach((scene, index) => {
    const s = scene as Record<string, unknown>;
    s.scene_number = index + 1;
  });
  
  merged.scenes = allScenes;
  merged.canon_suggestions = Array.from(canonMap.values());
  
  console.log(`[parse-script] Merged: ${allScenes.length} scenes, ${canonMap.size} canon suggestions`);
  
  return merged;
}

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
