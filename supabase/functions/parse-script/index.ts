import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encodeBase64 } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// =============================================================================
// UNIVERSAL SCRIPT PARSER v2.1 - SYSTEM PROMPT
// =============================================================================
const UNIVERSAL_PARSER_PROMPT = `You are an elite Hollywood Production Supervisor capable of parsing screenplays in ANY language (English, Spanish, French, German, Italian, Portuguese, etc.).

YOUR OBJECTIVE:
Read the raw screenplay text and output a structured JSON object representing the full production breakdown with rich metadata for AI generation.

CORE RULES:

1. LANGUAGE AGNOSTICISM:
   - Detect the script language automatically
   - Recognize scene headers in ANY format: 'INT.', 'EXT.', 'INTERIOR', 'EXTERIOR', 'INT/EXT', 'I/E', 'INTERNO', 'EXTERNO', etc.
   - Translate implied time/location cues into standardized English metadata:
     * 'NOCHE' -> 'NIGHT', 'DÍA' -> 'DAY', 'AMANECER' -> 'DAWN', 'ATARDECER' -> 'DUSK'
     * 'NUIT' -> 'NIGHT', 'JOUR' -> 'DAY'
   - Keep the original text in 'slugline' but normalize to English in 'standardized_time' and 'standardized_location'

2. FORMAT INTELLIGENCE (Series vs. Film):
   - Scan the first pages for 'Episode', 'Chapter', 'Episodio', 'Capítulo', 'Pilot', 'Teaser'
   - If detected, structure scenes with 'episode_number'. If not, assume episode_number: 1
   - Detect 'Teaser', 'Cold Open', 'Prólogo' as specific acts

3. CANON SCOUTING (The "Visual DNA" Layer):
   - CHARACTERS: Identify characters who speak or are described. If a character appears in >3 scenes, flag 'suggest_canon: true'
   - PROPS/OBJECTS: Identify objects interacting with characters (e.g., 'Poisoned Apple', 'Oppenheimer's Pipe'). If they have specific adjectives, extract those as 'visual_traits'
   - LOCATIONS: Group scenes by location. If a location appears multiple times, flag it as a Recurring Set

4. VISUAL & AUDIO EXTRACTION:
   - visual_style: Look for '(B&W)', '(BLACK AND WHITE)', '(SEPIA)', '(FLASHBACK)', '(BLANCO Y NEGRO)'. Default is 'COLOR'
   - audio_cues: Extract CAPITALIZED SOUNDS or 'Sound of...', 'SFX:', 'SONIDO DE...'
   - visual_fx_cues: Look for 'INSERT CUT:', 'VFX:', 'CGI:', rapid montage descriptions
   - technical_notes: Extract any camera directions found (CLOSE ON:, ZOOM, PAN, TRAVELLING, etc.)

5. SCENE METADATA:
   - Detect mood from action lines (tense, romantic, action, horror, comedy)
   - Estimate dialogue_count per scene
   - Identify lighting hints from descriptions ("dim light", "bright sun", "neon glow")

OUTPUT JSON SCHEMA:
{
  "project_metadata": {
    "type": "MOVIE" | "SERIES",
    "detected_language": "es" | "en" | "fr" | "de" | "it" | "pt",
    "title": "..." (if detectable from header),
    "estimated_runtime_minutes": number (rough estimate based on page count)
  },
  "canon_suggestions": [
    {
      "type": "CHARACTER" | "PROP" | "LOCATION",
      "name": "...",
      "visual_traits": ["..."],
      "appearances": number,
      "suggest_canon": boolean,
      "reason": "Appears in 5 scenes with consistent visual description"
    }
  ],
  "scenes": [
    {
      "scene_number": 1,
      "episode_number": 1,
      "slugline": "INT. COCINA - NOCHE",
      "standardized_location": "KITCHEN",
      "standardized_time": "NIGHT",
      "location_type": "INT" | "EXT" | "INT/EXT",
      "visual_style": "COLOR" | "MONOCHROME" | "SEPIA",
      "action_summary": "Brief summary of what happens",
      "characters_present": ["Frank", "Jackie"],
      "audio_cues": ["THUNDER", "FOOTSTEPS"],
      "visual_fx_cues": ["Rain lashing window", "Lightning flash"],
      "technical_notes": "CLOSE ON the knife. PAN to window.",
      "dialogue_count": 5,
      "mood": "tense",
      "lighting_hints": "dim candlelight"
    }
  ]
}

CRITICAL: Return ONLY valid JSON. No markdown, no commentary.`;

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
      extractionPrompt: `Extract ALL text from this PDF screenplay. Preserve exact formatting:
- Scene headings (INT./EXT./INTERIOR/EXTERIOR)
- Character names in CAPS before dialogue
- Dialogue and parentheticals
- Action lines
- Any camera directions (CLOSE ON, INSERT, etc.)
Return the complete verbatim text.`
    };
  } else if (fileSizeBytes < 300000) {
    return {
      model: "google/gemini-2.5-flash",
      timeoutMs: 120000,
      maxTokens: 80000,
      isLarge: false,
      estimatedPages,
      extractionPrompt: `Extract the complete screenplay text. Preserve:
- All scene headings (INT./EXT. in any language)
- Character names and dialogue
- Action descriptions
- Sound cues (CAPITALIZED sounds)
Return verbatim text in screenplay format.`
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
Summarize long descriptions if needed. Return in screenplay format.`
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
            content: "You are a professional screenplay text extractor. Output ONLY the extracted text, no commentary."
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
        temperature: 0.1,
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

    console.log("[parse-script] v2.1 called:", { hasPdfUrl: !!pdfUrl, hasScriptText: !!scriptText, projectId, parseMode });

    let textToProcess = scriptText;

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
                stats: { estimatedPages: config.estimatedPages, fileSizeKB }
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
        
        // If parseMode is 'extract_only', just return raw text
        if (parseMode === 'extract_only') {
          return new Response(
            JSON.stringify({ 
              rawText: textToProcess,
              success: true,
              stats: {
                originalSizeKB: fileSizeKB,
                extractedChars: extractedText.length,
                estimatedPages: config.estimatedPages,
                wasLargeFile: config.isLarge,
                modelUsed: config.model
              }
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

    // Format text if provided directly
    if (scriptText && !pdfUrl) {
      console.log("[parse-script] Processing direct text input through formatting AI...");
      try {
        const formattingResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are a professional screenplay formatter. Reformat poorly formatted screenplay text into proper format. Output ONLY the reformatted text."
              },
              {
                role: "user",
                content: `Reformat this text into proper screenplay format:
- Scene headings (INT./EXT.) in their own lines, uppercase
- Character names in ALL CAPS before dialogue
- Dialogue properly indented
- Action lines as regular text
- Preserve any visual style markers (B&W, FLASHBACK, etc.)

Text:
${textToProcess}`
              }
            ],
            temperature: 0.1,
            max_tokens: 50000
          }),
        });

        if (formattingResponse.ok) {
          const formattingData = await formattingResponse.json();
          const formattedText = formattingData.choices?.[0]?.message?.content || "";
          if (formattedText.length > textToProcess.length * 0.5) {
            textToProcess = formattedText;
          }
        }
      } catch (formatError) {
        console.warn("[parse-script] Error in text formatting step:", formatError);
      }
    }

    // =============================================================================
    // UNIVERSAL PARSER v2.1 - MAIN PARSING
    // =============================================================================
    console.log("[parse-script] Running Universal Parser v2.1...");
    
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: UNIVERSAL_PARSER_PROMPT },
          { role: "user", content: `Parse this screenplay completely:\n\n${textToProcess}` }
        ],
        temperature: 0.2,
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
      console.error("[parse-script] AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI service error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    // Parse JSON from response
    let parsedResult = {
      project_metadata: {
        type: 'MOVIE' as const,
        detected_language: 'en',
        title: null as string | null,
        estimated_runtime_minutes: 0
      },
      canon_suggestions: [] as Array<{
        type: string;
        name: string;
        visual_traits: string[];
        appearances: number;
        suggest_canon: boolean;
        reason: string;
      }>,
      scenes: [] as Array<{
        scene_number: number;
        episode_number: number;
        slugline: string;
        standardized_location: string;
        standardized_time: string;
        location_type: string;
        visual_style: string;
        action_summary: string;
        characters_present: string[];
        audio_cues: string[];
        visual_fx_cues: string[];
        technical_notes: string;
        dialogue_count: number;
        mood: string;
        lighting_hints: string;
      }>
    };
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        parsedResult = {
          project_metadata: parsed.project_metadata || parsedResult.project_metadata,
          canon_suggestions: parsed.canon_suggestions || [],
          scenes: parsed.scenes || []
        };
      }
    } catch (parseError) {
      console.error("[parse-script] Error parsing AI response:", parseError);
      console.log("[parse-script] Raw content preview:", content.substring(0, 500));
      
      // Fallback to basic scene
      parsedResult.scenes = [{
        scene_number: 1,
        episode_number: 1,
        slugline: "SCENE 1",
        standardized_location: "UNKNOWN",
        standardized_time: "DAY",
        location_type: "INT",
        visual_style: "COLOR",
        action_summary: "Imported scene from script",
        characters_present: [],
        audio_cues: [],
        visual_fx_cues: [],
        technical_notes: "",
        dialogue_count: 0,
        mood: "neutral",
        lighting_hints: ""
      }];
    }

    console.log(`[parse-script] v2.1 Complete: ${parsedResult.scenes.length} scenes, ${parsedResult.canon_suggestions.length} canon suggestions, language=${parsedResult.project_metadata.detected_language}`);

    // Return full parsed result with v2.1 structure
    return new Response(
      JSON.stringify({ 
        ...parsedResult,
        rawText: textToProcess,
        // Legacy compatibility
        scenes: parsedResult.scenes.map(s => ({
          ...s,
          summary: s.action_summary,
          characters: s.characters_present,
          location: s.standardized_location,
          time_of_day: s.standardized_time?.toLowerCase() || 'day'
        }))
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[parse-script] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
